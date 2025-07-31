const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { getGitDiff, mapFilePaths } = require('./git-diff');
const { extractCoverageFromXml, extractSourceFileCoverage } = require('./xml-parser');

/**
 * Calculate coverage for changed lines
 * @param {Array<string>} reportPaths - Paths to JaCoCo CSV reports
 * @returns {Promise<Object>} - Coverage report for changed lines
 */
async function calculateDiffCoverage(reportPaths) {
  try {
    // Get the base ref from input
    const baseRef = core.getInput('base-ref') || 'master';
    
    // Get the git diff
    const changedFiles = await getGitDiff(baseRef);
    core.info(`Found ${Object.keys(changedFiles).length} changed files`);
    
    // Find all source directories in the repository
    const sourceDirs = await findSourceDirectories();
    core.info(`Found ${sourceDirs.length} source directories: ${sourceDirs.join(', ')}`);
    
    // Map file paths from git to JaCoCo format using all source directories
    const mappedFiles = {};
    for (const sourceDir of sourceDirs) {
      const mappedForDir = mapFilePaths(changedFiles, sourceDir);
      // Merge the mappings
      Object.assign(mappedFiles, mappedForDir);
    }
    core.info(`Mapped ${Object.keys(mappedFiles).length} files to JaCoCo format`);
    
    // Get line coverage data from JaCoCo reports
    const lineCoverageData = await getLineCoverageData(reportPaths);
    
    // Calculate coverage for changed lines
    return calculateCoverage(mappedFiles, lineCoverageData);
  } catch (error) {
    core.warning(`Error calculating diff coverage: ${error.message}`);
    return {
      diff_line_percent: 0,
      diff_line_covered: 0,
      diff_line_missed: 0,
      diff_line_total: 0
    };
  }
}

/**
 * Get line coverage data from JaCoCo reports
 * @param {Array<string>} reportPaths - Paths to JaCoCo CSV reports
 * @returns {Promise<Object>} - Line coverage data by class
 */
async function getLineCoverageData(reportPaths) {
  const lineCoverageData = {};
  
  // Process each report file
  for (const reportPath of reportPaths) {
    try {
      // Determine file type based on extension
      const fileExt = path.extname(reportPath).toLowerCase();
      
      if (fileExt === '.xml') {
        // Parse XML report
        core.info(`Parsing XML report for diff coverage: ${reportPath}`);
        const coverageData = await extractCoverageFromXml(reportPath);
        
        // Add coverage data to the result
        for (const [className, data] of Object.entries(coverageData)) {
          if (!lineCoverageData[className]) {
            lineCoverageData[className] = {
              coveredLines: new Set(),
              missedLines: new Set()
            };
          }
          
          // Add covered and missed lines
          for (const line of data.coveredLines) {
            lineCoverageData[className].coveredLines.add(line);
          }
          
          for (const line of data.missedLines) {
            lineCoverageData[className].missedLines.add(line);
          }
        }
      } else {
        // Parse CSV report (original implementation)
        core.info(`Parsing CSV report for diff coverage: ${reportPath}`);
        const results = await parseReportFile(reportPath);
        
        // Process each row in the report
        for (const row of results) {
          const className = row.GROUP;
          
          // Skip if no line information
          if (!row.LINE || !row.LINE_COVERED || !row.LINE_MISSED) {
            continue;
          }
          
          // Initialize coverage data for this class if not exists
          if (!lineCoverageData[className]) {
            lineCoverageData[className] = {
              coveredLines: new Set(),
              missedLines: new Set()
            };
          }
          
          // Add covered and missed lines
          if (row.INSTRUCTION_COVERED && row.INSTRUCTION_COVERED > 0) {
            lineCoverageData[className].coveredLines.add(parseInt(row.LINE, 10));
          } else {
            lineCoverageData[className].missedLines.add(parseInt(row.LINE, 10));
          }
        }
      }
    } catch (error) {
      core.warning(`Error processing report file ${reportPath}: ${error.message}`);
    }
  }
  
  return lineCoverageData;
}

/**
 * Parse a JaCoCo CSV report file
 * @param {string} filePath - Path to the report file
 * @returns {Promise<Array>} - Parsed report data
 */
function parseReportFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

/**
 * Calculate coverage for changed lines
 * @param {Object} mappedFiles - Mapped file paths with changed lines
 * @param {Object} lineCoverageData - Line coverage data by class
 * @returns {Object} - Coverage report for changed lines
 */
function calculateCoverage(mappedFiles, lineCoverageData) {
  let totalChangedLines = 0;
  let coveredChangedLines = 0;
  let missedChangedLines = 0;
  
  // Process each changed file
  for (const [className, changedLines] of Object.entries(mappedFiles)) {
    // Skip if no coverage data for this class
    if (!lineCoverageData[className]) {
      core.info(`No coverage data found for ${className}`);
      // Count all lines as missed
      totalChangedLines += changedLines.length;
      missedChangedLines += changedLines.length;
      continue;
    }
    
    const { coveredLines, missedLines } = lineCoverageData[className];
    
    // Check each changed line
    for (const line of changedLines) {
      totalChangedLines++;
      
      if (coveredLines.has(line)) {
        coveredChangedLines++;
      } else if (missedLines.has(line)) {
        missedChangedLines++;
      } else {
        // If line is not in the coverage data, count it as missed
        missedChangedLines++;
      }
    }
  }
  
  // Calculate coverage percentage
  const coveragePercent = totalChangedLines > 0 
    ? (coveredChangedLines / totalChangedLines) * 100 
    : 0;
  
  return {
    diff_line_percent: coveragePercent,
    diff_line_covered: coveredChangedLines,
    diff_line_missed: missedChangedLines,
    diff_line_total: totalChangedLines
  };
}

/**
 * Find all source directories in the repository
 * @returns {Promise<Array<string>>} - Array of source directory paths
 */
async function findSourceDirectories() {
  try {
    // Get user-provided source directories if specified
    const userSourceDirs = core.getInput('source-dir');
    if (userSourceDirs) {
      return userSourceDirs.split(',').map(dir => dir.trim());
    }
    
    // Default source directories to look for
    const defaultSourceDirs = ['src', 'java', 'kotlin', 'groovy', 'scala'];
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    // Find all potential source directories in the repository
    const { stdout } = await execPromise('find . -type d -name "src" -o -name "java" -o -name "kotlin" -o -name "groovy" -o -name "scala"');
    
    if (stdout.trim()) {
      // Remove './' prefix and filter out directories in build, target, or test directories
      return stdout
        .split('\n')
        .filter(dir => dir && !dir.includes('/build/') && !dir.includes('/target/') && !dir.includes('/test/'))
        .map(dir => dir.startsWith('./') ? dir.substring(2) : dir);
    }
    
    // If no directories found, return default
    return ['src'];
  } catch (error) {
    core.warning(`Error finding source directories: ${error.message}`);
    return ['src'];
  }
}

/**
 * Calculate coverage for specific changed lines in a file
 * @param {string} jacocoXmlPath - Path to the JaCoCo XML report
 * @param {string} baseRef - The base branch to compare against (default: master)
 * @returns {Promise<Object>} - Coverage information for changed lines
 */
async function calculateLineSpecificCoverage(jacocoXmlPath, baseRef = 'master') {
  try {
    // Get the git diff
    const changedFiles = await getGitDiff(baseRef);
    core.info(`Found ${Object.keys(changedFiles).length} changed files`);
    
    // Parse JaCoCo XML report for source file coverage
    const lineCoverage = await extractSourceFileCoverage(jacocoXmlPath);
    
    // Match changed lines with coverage data
    const result = {
      totalChangedLines: 0,
      coveredChangedLines: 0,
      missedChangedLines: 0,
      fileDetails: {}
    };
    
    for (const [filePath, changedLines] of Object.entries(changedFiles)) {
      // Extract filename from path
      const filename = filePath.split('/').pop();
      
      // Skip if no coverage data for this file
      if (!lineCoverage[filename]) {
        core.info(`No coverage data found for ${filename}`);
        result.totalChangedLines += changedLines.length;
        result.missedChangedLines += changedLines.length;
        
        result.fileDetails[filePath] = {
          totalChangedLines: changedLines.length,
          coveredChangedLines: 0,
          missedChangedLines: changedLines.length,
          lineDetails: changedLines.map(line => ({
            line,
            covered: false
          }))
        };
        continue;
      }
      
      const { coveredLines, missedLines } = lineCoverage[filename];
      const fileResult = {
        totalChangedLines: changedLines.length,
        coveredChangedLines: 0,
        missedChangedLines: 0,
        lineDetails: []
      };
      
      // Check each changed line
      for (const line of changedLines) {
        result.totalChangedLines++;
        fileResult.totalChangedLines++;
        
        const isCovered = coveredLines.has(line);
        const lineDetail = {
          line,
          covered: isCovered
        };
        
        if (isCovered) {
          result.coveredChangedLines++;
          fileResult.coveredChangedLines++;
        } else {
          result.missedChangedLines++;
          fileResult.missedChangedLines++;
        }
        
        fileResult.lineDetails.push(lineDetail);
      }
      
      result.fileDetails[filePath] = fileResult;
    }
    
    // Calculate coverage percentage
    result.coveragePercentage = result.totalChangedLines > 0
      ? (result.coveredChangedLines / result.totalChangedLines) * 100
      : 0;
    
    core.info(`Total changed lines: ${result.totalChangedLines}`);
    core.info(`Covered changed lines: ${result.coveredChangedLines}`);
    core.info(`Missed changed lines: ${result.missedChangedLines}`);
    core.info(`Coverage percentage: ${result.coveragePercentage.toFixed(2)}%`);
    
    return result;
  } catch (error) {
    core.warning(`Error calculating line-specific coverage: ${error.message}`);
    return {
      totalChangedLines: 0,
      coveredChangedLines: 0,
      missedChangedLines: 0,
      coveragePercentage: 0,
      fileDetails: {}
    };
  }
}

module.exports = {
  calculateDiffCoverage,
  calculateLineSpecificCoverage
};