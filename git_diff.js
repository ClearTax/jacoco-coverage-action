const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');

/**
 * Get the list of files changed between the current branch and the base branch
 * @param {string} baseRef - The base branch to compare against (e.g., 'master')
 * @returns {Promise<string[]>} - Array of changed file paths
 */
async function getChangedFiles(baseRef) {
  core.info(`Getting changed files compared to ${baseRef}...`);
  
  let output = '';
  let errorOutput = '';
  
  // Fetch the base branch to ensure it's available
  try {
    await exec.exec('git', ['fetch', 'origin', baseRef]);
  } catch (error) {
    core.warning(`Failed to fetch ${baseRef}: ${error.message}`);
    // Try main as fallback if master fails
    if (baseRef === 'master') {
      core.info('Trying main as fallback...');
      await exec.exec('git', ['fetch', 'origin', 'main']);
      baseRef = 'main';
    }
  }
  
  // Get the list of changed files
  const options = {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
      stderr: (data) => {
        errorOutput += data.toString();
      }
    }
  };
  
  try {
    await exec.exec('git', ['diff', '--name-only', `origin/${baseRef}...HEAD`], options);
  } catch (error) {
    core.error(`Git diff failed: ${error.message}`);
    core.error(errorOutput);
    throw error;
  }
  
  // Split the output into an array of file paths
  const changedFiles = output.trim().split('\n').filter(Boolean);
  core.info(`Found ${changedFiles.length} changed files`);
  
  return changedFiles;
}

/**
 * Filter the coverage report to only include files that were changed in the PR
 * @param {Array} coverageData - The full coverage data
 * @param {string[]} changedFiles - Array of changed file paths
 * @returns {Array} - Filtered coverage data
 */
function filterCoverageByChangedFiles(coverageData, changedFiles) {
  if (!changedFiles || changedFiles.length === 0) {
    core.info('No changed files found, returning full coverage data');
    return coverageData;
  }
  
  // Convert file paths to lowercase for case-insensitive matching
  const normalizedChangedFiles = changedFiles.map(file => file.toLowerCase());
  
  // Filter coverage data to only include components that match changed files
  const filteredCoverage = coverageData.filter(item => {
    const component = item.component.toLowerCase();
    
    // Check if any changed file path contains this component name
    // This is a simple heuristic and might need adjustment based on your project structure
    return normalizedChangedFiles.some(file => 
      file.includes(component) || component.includes(file.replace(/\.[^/.]+$/, ""))
    );
  });
  
  core.info(`Filtered coverage data to ${filteredCoverage.length} components`);
  return filteredCoverage;
}

module.exports = {
  getChangedFiles,
  filterCoverageByChangedFiles
};
