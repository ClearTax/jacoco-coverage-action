const fs = require('fs');
const xml2js = require('xml2js');
const core = require('@actions/core');

/**
 * Parse a JaCoCo XML report file
 * @param {string} filePath - Path to the XML report file
 * @returns {Promise<Object>} - Parsed report data
 */
async function parseXmlReport(filePath) {
  try {
    const xmlData = fs.readFileSync(filePath, 'utf8');
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xmlData);
    return result;
  } catch (error) {
    core.warning(`Error parsing XML report: ${error.message}`);
    return null;
  }
}

/**
 * Extract coverage data from a JaCoCo XML report
 * @param {string} filePath - Path to the XML report file
 * @returns {Promise<Object>} - Coverage data by package/class
 */
async function extractCoverageFromXml(filePath) {
  try {
    const report = await parseXmlReport(filePath);
    if (!report || !report.report || !report.report.package) {
      core.warning(`Invalid or empty JaCoCo XML report: ${filePath}`);
      return {};
    }

    const coverageData = {};
    const packages = Array.isArray(report.report.package)
      ? report.report.package
      : [report.report.package];

    // Process each package
    for (const pkg of packages) {
      const packageName = pkg.$.name;
      
      // Process each class in the package
      const classes = Array.isArray(pkg.class) ? pkg.class : [pkg.class];
      for (const cls of classes) {
        if (!cls) continue;
        
        const className = `${packageName}.${cls.$.name}`;
        coverageData[className] = {
          line_covered: 0,
          line_missed: 0,
          branch_covered: 0,
          branch_missed: 0,
          coveredLines: new Set(),
          missedLines: new Set()
        };
        
        // Process line coverage
        if (cls.line) {
          const lines = Array.isArray(cls.line) ? cls.line : [cls.line];
          for (const line of lines) {
            const lineNumber = parseInt(line.$.nr, 10);
            const covered = parseInt(line.$.ci, 10) > 0;
            
            if (covered) {
              coverageData[className].line_covered++;
              coverageData[className].coveredLines.add(lineNumber);
            } else {
              coverageData[className].line_missed++;
              coverageData[className].missedLines.add(lineNumber);
            }
          }
        }
        
        // Process branch coverage
        if (cls.method) {
          const methods = Array.isArray(cls.method) ? cls.method : [cls.method];
          for (const method of methods) {
            if (method.counter) {
              const counters = Array.isArray(method.counter) ? method.counter : [method.counter];
              for (const counter of counters) {
                if (counter.$.type === 'BRANCH') {
                  coverageData[className].branch_covered += parseInt(counter.$.covered, 10);
                  coverageData[className].branch_missed += parseInt(counter.$.missed, 10);
                }
              }
            }
          }
        }
      }
      
      // Process sourcefiles (for direct line coverage)
      if (pkg.sourcefile) {
        const sourcefiles = Array.isArray(pkg.sourcefile) ? pkg.sourcefile : [pkg.sourcefile];
        
        for (const sourcefile of sourcefiles) {
          if (!sourcefile || !sourcefile.line) continue;
          
          const filename = sourcefile.$.name;
          const sourceKey = `${packageName}.${filename}`;
          
          // Initialize coverage data for this sourcefile if not exists
          if (!coverageData[sourceKey]) {
            coverageData[sourceKey] = {
              line_covered: 0,
              line_missed: 0,
              branch_covered: 0,
              branch_missed: 0,
              coveredLines: new Set(),
              missedLines: new Set(),
              sourceFile: filename
            };
          }
          
          // Process line coverage
          const lines = Array.isArray(sourcefile.line) ? sourcefile.line : [sourcefile.line];
          for (const line of lines) {
            const lineNumber = parseInt(line.$.nr, 10);
            const covered = parseInt(line.$.ci, 10) > 0;
            
            if (covered) {
              coverageData[sourceKey].line_covered++;
              coverageData[sourceKey].coveredLines.add(lineNumber);
            } else {
              coverageData[sourceKey].line_missed++;
              coverageData[sourceKey].missedLines.add(lineNumber);
            }
          }
        }
      }
    }
    
    return coverageData;
  } catch (error) {
    core.warning(`Error extracting coverage from XML: ${error.message}`);
    return {};
  }
}

/**
 * Convert XML coverage data to the format expected by the report generator
 * @param {Object} coverageData - Coverage data extracted from XML
 * @returns {Array<Object>} - Coverage data in the format expected by the report generator
 */
function formatCoverageData(coverageData) {
  const result = [];
  
  for (const [className, data] of Object.entries(coverageData)) {
    const line_total = data.line_covered + data.line_missed;
    const branch_total = data.branch_covered + data.branch_missed;
    
    const line_percent = line_total > 0 
      ? (data.line_covered / line_total) * 100 
      : 0;
    
    const branch_percent = branch_total > 0 
      ? (data.branch_covered / branch_total) * 100 
      : 0;
    
    result.push({
      component: className,
      line_percent,
      line_total,
      line_covered: data.line_covered,
      line_missed: data.line_missed,
      branch_percent,
      branch_total,
      branch_covered: data.branch_covered,
      branch_missed: data.branch_missed,
      coveredLines: data.coveredLines,
      missedLines: data.missedLines
    });
  }
  
  return result;
}

/**
 * Extract line coverage data from a JaCoCo XML report for specific source files
 * @param {string} filePath - Path to the XML report file
 * @returns {Promise<Object>} - Line coverage data by source file
 */
async function extractSourceFileCoverage(filePath) {
  try {
    const report = await parseXmlReport(filePath);
    if (!report || !report.report || !report.report.package) {
      core.warning(`Invalid or empty JaCoCo XML report: ${filePath}`);
      return {};
    }

    const lineCoverage = {};
    const packages = Array.isArray(report.report.package)
      ? report.report.package
      : [report.report.package];
    
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
    core.warning(`Error extracting source file coverage from XML: ${error.message}`);
    return {};
  }
}

module.exports = {
  parseXmlReport,
  extractCoverageFromXml,
  formatCoverageData,
  extractSourceFileCoverage
};