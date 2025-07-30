const core = require('@actions/core');
const report = require('./report');
const xmlParser = require('./xml-parser');

async function run () {
  try {
    const minCoverage = parseFloat(
      core.getInput("min-coverage")
    );
    const badgePath = core.getInput("badgePath");
    
    // Check if we should use XML reports
    const useXml = core.getInput('use-xml') === 'true';
    
    // Log whether git diff is enabled
    const useGitDiff = core.getInput('use-git-diff') === 'true';
    if (useGitDiff) {
      core.info('Git diff analysis is enabled - will focus on changed files');
    }
    
    if (useXml) {
      // Use XML reports for coverage analysis
      core.info('Using XML reports for coverage analysis');
      
      const xmlPathBefore = core.getInput('xml-path-before');
      const xmlPathAfter = core.getInput('xml-path-after');
      
      if (!xmlPathAfter) {
        throw new Error('xml-path-after is required when use-xml is true');
      }
      
      // Process XML reports and calculate delta coverage
      const coverageData = await xmlParser.processCoverageReports(
        xmlPathBefore,
        xmlPathAfter
      );
      
      if (!coverageData) {
        throw new Error('Failed to process XML coverage reports');
      }
      
      // Generate report with delta coverage
      await report.generateXmlReport(coverageData, minCoverage, badgePath);
    } else {
      // Use CSV reports (original functionality)
      const resultPaths = core.getInput('paths');
      const reportPaths = resultPaths.split(",");
      
      if (reportPaths.length === 0 || !reportPaths[0]) {
        throw new Error('paths is required when use-xml is false');
      }
      
      await report(reportPaths, minCoverage, badgePath);
    }
  } catch (error) {
    console.error(error);
    core.setFailed(error)
  }
}

run()

