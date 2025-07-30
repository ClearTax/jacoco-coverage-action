const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');
const gitDiff = require('./git-diff');

/**
 * Parse JaCoCo XML report
 * @param {string} xmlFilePath - Path to the JaCoCo XML report
 * @returns {Promise<Object>} - Parsed coverage data
 */
async function parseJaCoCoXml(xmlFilePath) {
  try {
    if (!xmlFilePath || !fs.existsSync(xmlFilePath)) {
      core.warning(`XML file not found: ${xmlFilePath}`);
      return null;
    }
    
    core.info(`Parsing XML file: ${xmlFilePath}`);
    const xmlData = fs.readFileSync(xmlFilePath, 'utf8');
    
    // Check if the file is actually XML
    if (!xmlData.trim().startsWith('<?xml')) {
      core.warning(`File does not appear to be XML: ${xmlFilePath}`);
      return null;
    }
    
    const result = await parseStringPromise(xmlData, {
      explicitArray: false,
      mergeAttrs: true,
      explicitRoot: false
    });
    
    core.info(`Successfully parsed XML file: ${xmlFilePath}`);
    return result;
  } catch (error) {
    core.warning(`Error parsing XML file ${xmlFilePath}: ${error.message}`);
    return null;
  }
}

/**
 * Extract coverage data from parsed XML
 * @param {Object} parsedXml - Parsed XML data
 * @returns {Object} - Extracted coverage data
 */
function extractCoverageFromXml(parsedXml) {
  if (!parsedXml) {
    core.warning('No parsed XML data provided');
    return null;
  }

  // Handle different possible structures of the parsed XML
  const report = parsedXml.report || parsedXml;
  
  if (!report) {
    core.warning('Could not find report element in XML');
    return null;
  }
  
  core.info('Extracting coverage data from XML');
  const coverageData = {
    packages: [],
    overall: {
      instruction: { covered: 0, missed: 0, total: 0, coverage: 0 },
      line: { covered: 0, missed: 0, total: 0, coverage: 0 },
      branch: { covered: 0, missed: 0, total: 0, coverage: 0 },
      complexity: { covered: 0, missed: 0, total: 0, coverage: 0 },
      method: { covered: 0, missed: 0, total: 0, coverage: 0 },
      class: { covered: 0, missed: 0, total: 0, coverage: 0 }
    }
  };

  // Process packages
  if (report.package) {
    // Ensure packages is an array
    const packages = Array.isArray(report.package) ? report.package : [report.package];
    core.info(`Found ${packages.length} packages in the report`);
    
    packages.forEach(pkg => {
      // Handle both merged attributes and $ notation
      const packageName = pkg.name || (pkg.$ ? pkg.$.name : 'unknown');
      core.info(`Processing package: ${packageName}`);
      
      const packageData = {
        name: packageName,
        classes: [],
        counters: {
          instruction: { covered: 0, missed: 0 },
          line: { covered: 0, missed: 0 },
          branch: { covered: 0, missed: 0 },
          complexity: { covered: 0, missed: 0 },
          method: { covered: 0, missed: 0 },
          class: { covered: 0, missed: 0 }
        }
      };

      // Process classes
      if (pkg.class) {
        const classes = Array.isArray(pkg.class) ? pkg.class : [pkg.class];
        core.info(`Found ${classes.length} classes in package ${packageName}`);
        
        classes.forEach(cls => {
          // Handle both merged attributes and $ notation
          const className = cls.name || (cls.$ ? cls.$.name : 'unknown');
          const sourceFilePath = cls.sourcefilename || (cls.$ ? cls.$.sourcefilename : 'unknown');
          
          core.info(`Processing class: ${className} (${sourceFilePath})`);
          
          const classData = {
            name: className,
            sourceFilePath: sourceFilePath,
            methods: [],
            counters: {
              instruction: { covered: 0, missed: 0 },
              line: { covered: 0, missed: 0 },
              branch: { covered: 0, missed: 0 },
              complexity: { covered: 0, missed: 0 },
              method: { covered: 0, missed: 0 }
            }
          };

          // Process methods
          if (cls.method) {
            const methods = Array.isArray(cls.method) ? cls.method : [cls.method];
            
            methods.forEach(method => {
              // Handle both merged attributes and $ notation
              const methodName = method.name || (method.$ ? method.$.name : 'unknown');
              const methodDesc = method.desc || (method.$ ? method.$.desc : '');
              const methodLine = method.line || (method.$ ? method.$.line : '0');
              
              const methodData = {
                name: methodName,
                signature: methodDesc,
                line: parseInt(methodLine, 10),
                counters: {
                  instruction: { covered: 0, missed: 0 },
                  line: { covered: 0, missed: 0 },
                  branch: { covered: 0, missed: 0 },
                  complexity: { covered: 0, missed: 0 }
                }
              };

              // Process method counters
              if (method.counter) {
                const counters = Array.isArray(method.counter) ? method.counter : [method.counter];
                
                counters.forEach(counter => {
                  // Handle both merged attributes and $ notation
                  const type = counter.type || (counter.$ ? counter.$.type : 'unknown');
                  const covered = parseInt(counter.covered || (counter.$ ? counter.$.covered : '0'), 10);
                  const missed = parseInt(counter.missed || (counter.$ ? counter.$.missed : '0'), 10);
                  
                  methodData.counters[type] = { covered, missed };
                  classData.counters[type].covered += covered;
                  classData.counters[type].missed += missed;
                });
              }

              classData.methods.push(methodData);
            });
          }

          // Process class counters
          if (cls.counter) {
            const counters = Array.isArray(cls.counter) ? cls.counter : [cls.counter];
            
            counters.forEach(counter => {
              // Handle both merged attributes and $ notation
              const type = counter.type || (counter.$ ? counter.$.type : 'unknown');
              const covered = parseInt(counter.covered || (counter.$ ? counter.$.covered : '0'), 10);
              const missed = parseInt(counter.missed || (counter.$ ? counter.$.missed : '0'), 10);
              
              classData.counters[type] = { covered, missed };
              packageData.counters[type].covered += covered;
              packageData.counters[type].missed += missed;
            });
          }

          packageData.classes.push(classData);
        });
      }

      // Process package counters
      if (pkg.counter) {
        const counters = Array.isArray(pkg.counter) ? pkg.counter : [pkg.counter];
        
        counters.forEach(counter => {
          // Handle both merged attributes and $ notation
          const type = counter.type || (counter.$ ? counter.$.type : 'unknown');
          const covered = parseInt(counter.covered || (counter.$ ? counter.$.covered : '0'), 10);
          const missed = parseInt(counter.missed || (counter.$ ? counter.$.missed : '0'), 10);
          
          packageData.counters[type] = { covered, missed };
          coverageData.overall[type].covered += covered;
          coverageData.overall[type].missed += missed;
        });
      }

      coverageData.packages.push(packageData);
    });
  }

  // Calculate totals and percentages
  Object.keys(coverageData.overall).forEach(type => {
    const covered = coverageData.overall[type].covered;
    const missed = coverageData.overall[type].missed;
    const total = covered + missed;
    
    coverageData.overall[type].total = total;
    coverageData.overall[type].coverage = total > 0 ? (covered / total) * 100 : 0;
    
    core.info(`Overall ${type} coverage: ${coverageData.overall[type].coverage.toFixed(2)}% (${covered}/${total})`);
  });

  return coverageData;
}

/**
 * Filter coverage data based on changed files from git diff
 * @param {Object} coverageData - Extracted coverage data
 * @param {Set<string>} changedFiles - Set of changed file paths
 * @returns {Object} - Filtered coverage data
 */
function filterCoverageByChangedFiles(coverageData, changedFiles) {
  if (!coverageData || changedFiles.size === 0) {
    return coverageData;
  }

  const filteredData = {
    packages: [],
    overall: {
      instruction: { covered: 0, missed: 0, total: 0, coverage: 0 },
      line: { covered: 0, missed: 0, total: 0, coverage: 0 },
      branch: { covered: 0, missed: 0, total: 0, coverage: 0 },
      complexity: { covered: 0, missed: 0, total: 0, coverage: 0 },
      method: { covered: 0, missed: 0, total: 0, coverage: 0 },
      class: { covered: 0, missed: 0, total: 0, coverage: 0 }
    }
  };

  coverageData.packages.forEach(pkg => {
    const filteredClasses = pkg.classes.filter(cls => {
      // Check if the class's source file is in the changed files
      return Array.from(changedFiles).some(file => {
        // Convert both paths to a normalized format for comparison
        const normalizedFile = file.replace(/\\/g, '/');
        const normalizedSourceFile = cls.sourceFilePath.replace(/\\/g, '/');
        
        return normalizedFile.endsWith(normalizedSourceFile);
      });
    });

    if (filteredClasses.length > 0) {
      const filteredPackage = {
        name: pkg.name,
        classes: filteredClasses,
        counters: {
          instruction: { covered: 0, missed: 0 },
          line: { covered: 0, missed: 0 },
          branch: { covered: 0, missed: 0 },
          complexity: { covered: 0, missed: 0 },
          method: { covered: 0, missed: 0 },
          class: { covered: 0, missed: 0 }
        }
      };

      // Recalculate package counters based on filtered classes
      filteredClasses.forEach(cls => {
        Object.keys(cls.counters).forEach(type => {
          filteredPackage.counters[type].covered += cls.counters[type].covered;
          filteredPackage.counters[type].missed += cls.counters[type].missed;
          
          filteredData.overall[type].covered += cls.counters[type].covered;
          filteredData.overall[type].missed += cls.counters[type].missed;
        });
      });

      filteredData.packages.push(filteredPackage);
    }
  });

  // Calculate totals and percentages for filtered data
  Object.keys(filteredData.overall).forEach(type => {
    const covered = filteredData.overall[type].covered;
    const missed = filteredData.overall[type].missed;
    const total = covered + missed;
    
    filteredData.overall[type].total = total;
    filteredData.overall[type].coverage = total > 0 ? (covered / total) * 100 : 0;
  });

  return filteredData;
}

/**
 * Calculate delta coverage between two coverage reports
 * @param {Object} beforeCoverage - Coverage data before changes
 * @param {Object} afterCoverage - Coverage data after changes
 * @returns {Object} - Delta coverage data
 */
function calculateDeltaCoverage(beforeCoverage, afterCoverage) {
  if (!beforeCoverage || !afterCoverage) {
    return null;
  }

  const deltaCoverage = {
    instruction: {
      before: beforeCoverage.overall.instruction.coverage,
      after: afterCoverage.overall.instruction.coverage,
      delta: afterCoverage.overall.instruction.coverage - beforeCoverage.overall.instruction.coverage
    },
    line: {
      before: beforeCoverage.overall.line.coverage,
      after: afterCoverage.overall.line.coverage,
      delta: afterCoverage.overall.line.coverage - beforeCoverage.overall.line.coverage
    },
    branch: {
      before: beforeCoverage.overall.branch.coverage,
      after: afterCoverage.overall.branch.coverage,
      delta: afterCoverage.overall.branch.coverage - beforeCoverage.overall.branch.coverage
    },
    method: {
      before: beforeCoverage.overall.method.coverage,
      after: afterCoverage.overall.method.coverage,
      delta: afterCoverage.overall.method.coverage - beforeCoverage.overall.method.coverage
    },
    class: {
      before: beforeCoverage.overall.class.coverage,
      after: afterCoverage.overall.class.coverage,
      delta: afterCoverage.overall.class.coverage - beforeCoverage.overall.class.coverage
    }
  };

  return deltaCoverage;
}

/**
 * Process JaCoCo XML reports and calculate delta coverage
 * @param {string} beforeXmlPath - Path to the JaCoCo XML report before changes
 * @param {string} afterXmlPath - Path to the JaCoCo XML report after changes
 * @returns {Promise<Object>} - Coverage data including delta
 */
async function processCoverageReports(beforeXmlPath, afterXmlPath) {
  core.info(`Processing coverage reports - Before: ${beforeXmlPath || 'none'}, After: ${afterXmlPath}`);
  
  // Parse XML reports
  const afterXml = await parseJaCoCoXml(afterXmlPath);
  
  if (!afterXml) {
    core.warning('Failed to parse after XML report');
    // Create a minimal coverage data object to avoid NaN in the report
    return {
      after: {
        packages: [],
        overall: {
          instruction: { covered: 0, missed: 0, total: 0, coverage: 0 },
          line: { covered: 0, missed: 0, total: 0, coverage: 0 },
          branch: { covered: 0, missed: 0, total: 0, coverage: 0 },
          complexity: { covered: 0, missed: 0, total: 0, coverage: 0 },
          method: { covered: 0, missed: 0, total: 0, coverage: 0 },
          class: { covered: 0, missed: 0, total: 0, coverage: 0 }
        }
      },
      changedFiles: []
    };
  }
  
  // Extract coverage data for after report
  const afterCoverage = extractCoverageFromXml(afterXml);
  
  if (!afterCoverage) {
    core.warning('Failed to extract coverage data from after report');
    // Create a minimal coverage data object to avoid NaN in the report
    return {
      after: {
        packages: [],
        overall: {
          instruction: { covered: 0, missed: 0, total: 0, coverage: 0 },
          line: { covered: 0, missed: 0, total: 0, coverage: 0 },
          branch: { covered: 0, missed: 0, total: 0, coverage: 0 },
          complexity: { covered: 0, missed: 0, total: 0, coverage: 0 },
          method: { covered: 0, missed: 0, total: 0, coverage: 0 },
          class: { covered: 0, missed: 0, total: 0, coverage: 0 }
        }
      },
      changedFiles: []
    };
  }
  
  // If before report is provided, parse it and calculate delta
  let beforeCoverage = null;
  let deltaCoverage = null;
  
  if (beforeXmlPath) {
    const beforeXml = await parseJaCoCoXml(beforeXmlPath);
    if (beforeXml) {
      beforeCoverage = extractCoverageFromXml(beforeXml);
    }
  }

  // Get changed files from git diff
  const changedFiles = await gitDiff.getChangedFiles();
  core.info(`Found ${changedFiles.size} changed files from git diff`);

  // Filter coverage data based on changed files
  let filteredBeforeCoverage = null;
  let filteredAfterCoverage = null;
  
  if (changedFiles.size > 0) {
    filteredAfterCoverage = filterCoverageByChangedFiles(afterCoverage, changedFiles);
    
    if (beforeCoverage) {
      filteredBeforeCoverage = filterCoverageByChangedFiles(beforeCoverage, changedFiles);
      // Calculate delta coverage if we have both before and after data
      deltaCoverage = calculateDeltaCoverage(filteredBeforeCoverage, filteredAfterCoverage);
    }
  }

  return {
    before: beforeCoverage,
    after: afterCoverage,
    filteredBefore: filteredBeforeCoverage,
    filteredAfter: filteredAfterCoverage,
    delta: deltaCoverage,
    changedFiles: Array.from(changedFiles)
  };
}

module.exports = {
  parseJaCoCoXml,
  extractCoverageFromXml,
  filterCoverageByChangedFiles,
  calculateDeltaCoverage,
  processCoverageReports
};