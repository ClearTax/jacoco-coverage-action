const core = require('@actions/core')
const report = require('./report')

async function run () {
  try {
    const resultPaths = core.getInput('paths')
    const reportPaths = resultPaths.split(",");
    const minCoverage = parseFloat(
      core.getInput("min-coverage")
    );
    const badgePath = core.getInput("badgePath");
    await report(reportPaths, minCoverage,badgePath)
  } catch (error) {
    console.error(error);
    core.setFailed(error)
  }
}

run()

