const core = require('@actions/core');
const { getGitDiff } = require('./git-diff');
const { parseXmlReport } = require('./xml-parser');
const fs = require('fs');
const xml2js = require('xml2js');

/**
 * Get the git diff of the current branch against master
 * @param {string} baseRef - The base branch to compare against (default: master)
 * @returns {Promise<Object>} - Object containing changed files and their changed lines
 */
async function getDiffAgainstMaster(baseRef = 'master') {
  core.info(`Getting git diff against ${baseRef}...`);
  return await getGitDiff(baseRef);
}

/**
 * Parse JaCoCo XML report to extract line coverage information
 * @param {string} filePath - Path to the JaCoCo XML report
 * @returns {Promise<Object>} - Object containing line coverage information
 */
async function parseJacocoXml(filePath) {
  try {
    core.info(`Parsing JaCoCo XML report: ${filePath}`);
    const xmlData = fs.readFileSync(filePath, 'utf8');
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xmlData);
    
    // Extract line coverage information
    const lineCoverage = {};
    
    if (!result || !result.report || !result.report.package) {
      core.warning(`Invalid or empty JaCoCo XML report: ${filePath}`);
      return lineCoverage;
    }
    
    const packages = Array.isArray(result.report.package) 
      ? result.report.package 
      : [result.report.package];
    
    // Process each package
    for (const pkg of packages) {
      if (!pkg.sourcefile) continue;
      
      const sourcefiles = Array.isArray(pkg.sourcefile) ? pkg.sourcefile : [pkg.sourcefile];
      
      for (const sourcefile of sourcefiles) {
        if (!sourcefile.line) continue;
        
        const filename = sourcefile.$.name;
        lineCoverage[filename] = {
          coveredLines: new Set(),
          missedLines: new Set()
        };
        
        const lines = Array.isArray(sourcefile.line) ? sourcefile.line : [sourcefile.line];
        
        for (const line of lines) {
          const lineNumber = parseInt(line.$.nr, 10);
          const covered = parseInt(line.$.ci, 10) > 0;
          
          if (covered) {
            lineCoverage[filename].coveredLines.add(lineNumber);
          } else {
            lineCoverage[filename].missedLines.add(lineNumber);
          }
        }
      }
    }
    
    return lineCoverage;
  } catch (error) {
    core.warning(`Error parsing JaCoCo XML report: ${error.message}`);
    return {};
  }
}

/**
 * Match changed lines from git diff with coverage data from JaCoCo
 * @param {Object} changedFiles - Object containing changed files and their changed lines
 * @param {Object} lineCoverage - Object containing line coverage information
 * @returns {Object} - Object containing coverage information for changed lines
 */
function matchChangedLinesWithCoverage(changedFiles, lineCoverage) {
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
  
  return result;
}

/**
 * Calculate coverage for changed lines
 * @param {string} jacocoXmlPath - Path to the JaCoCo XML report
 * @param {string} baseRef - The base branch to compare against (default: master)
 * @returns {Promise<Object>} - Object containing coverage information for changed lines
 */
async function calculateDiffLineCoverage(jacocoXmlPath, baseRef = 'master') {
  try {
    // Get git diff
    const changedFiles = await getDiffAgainstMaster(baseRef);
    core.info(`Found ${Object.keys(changedFiles).length} changed files`);
    
    // Parse JaCoCo XML report
    const lineCoverage = await parseJacocoXml(jacocoXmlPath);
    
    // Match changed lines with coverage data
    const result = matchChangedLinesWithCoverage(changedFiles, lineCoverage);
    
    core.info(`Total changed lines: ${result.totalChangedLines}`);
    core.info(`Covered changed lines: ${result.coveredChangedLines}`);
    core.info(`Missed changed lines: ${result.missedChangedLines}`);
    core.info(`Coverage percentage: ${result.coveragePercentage.toFixed(2)}%`);
    
    return result;
  } catch (error) {
    core.warning(`Error calculating diff line coverage: ${error.message}`);
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
  calculateDiffLineCoverage,
  getDiffAgainstMaster,
  parseJacocoXml,
  matchChangedLinesWithCoverage
};