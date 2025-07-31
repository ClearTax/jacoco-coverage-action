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
    console.log(`::debug::Input paths: ${resultPaths}`);
    const reportPaths = resultPaths.split(",");
    console.log(`::debug::Report paths array: ${JSON.stringify(reportPaths)}`);
    
    // Check if we should use XML reports
    let useXml = core.getInput('use-xml') === 'true';
    console.log(`::debug::Initial use-xml setting: ${useXml}`);
    
    // Auto-detect XML files if use-xml is not explicitly set to true
    if (!useXml && reportPaths.length > 0 && reportPaths[0].endsWith('.xml')) {
      console.log(`::notice::XML file detected in paths parameter: ${reportPaths[0]}`);
      console.log('::notice::Setting use-xml to true based on file extension');
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
      console.log(`::debug::XML paths - Before: ${xmlPathBefore || 'none'}, After: ${xmlPathAfter || 'none'}`);
      
      // If xml-path-after is not provided but paths contains an XML file, use that
      if (!xmlPathAfter && reportPaths.length > 0 && reportPaths[0].endsWith('.xml')) {
        xmlPathAfter = reportPaths[0];
        console.log(`::notice::Using XML file from paths parameter: ${xmlPathAfter}`);
        
        // Check if file exists
        const fs = require('fs');
        if (fs.existsSync(xmlPathAfter)) {
          console.log(`::debug::Confirmed XML file exists: ${xmlPathAfter}`);
        } else {
          console.log(`::warning::XML file does not exist: ${xmlPathAfter}`);
        }
      }
      
      if (!xmlPathAfter) {
        throw new Error('xml-path-after is required when use-xml is true');
      }
      
      // Process XML reports and calculate delta coverage
      console.log('::debug::Calling processCoverageReports with XML paths');
      const coverageData = await xmlParser.processCoverageReports(
        xmlPathBefore,
        xmlPathAfter
      );
      
      if (!coverageData) {
        console.log('::error::Failed to process XML coverage reports');
        throw new Error('Failed to process XML coverage reports');
      }
      
      console.log(`::debug::Coverage data received: ${JSON.stringify({
        hasAfter: !!coverageData.after,
        hasBefore: !!coverageData.before,
        hasDelta: !!coverageData.delta,
        changedFilesCount: coverageData.changedFiles ? coverageData.changedFiles.length : 0
      })}`);
      
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

