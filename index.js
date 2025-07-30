const core = require('@actions/core');
const report = require('./report');
const xmlParser = require('./xml-parser');

async function run () {
  try {
    const minCoverage = parseFloat(
      core.getInput("min-coverage")
    );
    const badgePath = core.getInput("badgePath");
    
    // Get paths input
    const resultPaths = core.getInput('paths');
    const reportPaths = resultPaths.split(",");
    
    // Check if we should use XML reports
    let useXml = core.getInput('use-xml') === 'true';
    
    // Auto-detect XML files if use-xml is not explicitly set to true
    if (!useXml && reportPaths.length > 0 && reportPaths[0].endsWith('.xml')) {
      core.info('XML file detected in paths parameter. Setting use-xml to true.');
      useXml = true;
    }
    
    // Log whether git diff is enabled
    const useGitDiff = core.getInput('use-git-diff') === 'true';
    if (useGitDiff) {
      core.info('Git diff analysis is enabled - will focus on changed files');
    }
    
    if (useXml) {
      // Use XML reports for coverage analysis
      core.info('Using XML reports for coverage analysis');
      
      let xmlPathBefore = core.getInput('xml-path-before');
      let xmlPathAfter = core.getInput('xml-path-after');
      
      // If xml-path-after is not provided but paths contains an XML file, use that
      if (!xmlPathAfter && reportPaths.length > 0 && reportPaths[0].endsWith('.xml')) {
        xmlPathAfter = reportPaths[0];
        core.info(`Using XML file from paths parameter: ${xmlPathAfter}`);
      }
      
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

