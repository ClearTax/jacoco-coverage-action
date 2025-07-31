const core = require('@actions/core')
const report = require('./report')
const gitDiff = require('./git_diff')

async function run () {
  try {
    const resultPaths = core.getInput('paths')
    const reportPaths = resultPaths.split(",");
    const minCoverage = parseFloat(
      core.getInput("min-coverage")
    );
    const badgePath = core.getInput("badgePath");
    const useDiff = core.getInput("use-diff") === "true";
    const baseRef = core.getInput("base-ref") || "master";
    
    let changedFiles = [];
    if (useDiff) {
      changedFiles = await gitDiff.getChangedFiles(baseRef);
    }
    
    await report(reportPaths, minCoverage, badgePath, useDiff, changedFiles)
  } catch (error) {
    console.error(error);
    core.setFailed(error)
  }
}

run()
