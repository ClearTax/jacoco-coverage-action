const core = require('@actions/core')
const report = require('./report')

async function run () {
  try {
    // Get inputs
    const resultPaths = core.getInput('paths')
    const reportPaths = resultPaths.split(",");
    const minCoverage = parseFloat(
      core.getInput("min-coverage")
    );
    const badgePath = core.getInput("badgePath");
    
    // Log configuration
    core.info(`JaCoCo report paths: ${reportPaths.join(', ')}`);
    core.info(`Minimum coverage threshold: ${minCoverage}%`);
    core.info(`Base ref for diff: ${core.getInput('base-ref') || 'master'}`);
    
    // Run the report
    await report(reportPaths, minCoverage, badgePath);
    
    core.info('JaCoCo coverage analysis completed successfully');
  } catch (error) {
    console.error(error);
    core.setFailed(error)
  }
}

run()

