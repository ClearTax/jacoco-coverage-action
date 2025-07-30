const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');

/**
 * Parse git diff output to extract changed file paths
 * @param {string} diffOutput - The git diff output
 * @returns {Set<string>} - Set of changed file paths
 */
function parseGitDiff(diffOutput) {
  const changedFiles = new Set();
  
  // Split the diff output into lines
  const lines = diffOutput.split('\n');
  
  // Regular expression to match file paths in diff output
  // This matches lines like "diff --git a/path/to/file.java b/path/to/file.java"
  const filePathRegex = /^diff --git a\/(.+) b\/(.+)$/;
  
  for (const line of lines) {
    const match = line.match(filePathRegex);
    if (match && match[2]) {
      // Add the file path to the set of changed files
      changedFiles.add(match[2]);
    }
  }
  
  return changedFiles;
}

/**
 * Get git diff from a file or from GitHub API
 * @returns {Promise<Set<string>>} - Set of changed file paths
 */
async function getChangedFiles() {
  const useGitDiff = core.getInput('use-git-diff') === 'true';
  
  if (!useGitDiff) {
    // If git diff is not enabled, return an empty set
    return new Set();
  }
  
  const gitDiffPath = core.getInput('git-diff-path');
  
  if (gitDiffPath && fs.existsSync(gitDiffPath)) {
    // If a git diff file is provided, read it
    core.info(`Reading git diff from file: ${gitDiffPath}`);
    const diffOutput = fs.readFileSync(gitDiffPath, 'utf8');
    return parseGitDiff(diffOutput);
  } else {
    // Otherwise, try to get the diff from GitHub API
    core.info('Git diff file not provided, attempting to get diff from GitHub API');
    return getChangedFilesFromGitHub();
  }
}

/**
 * Get changed files from GitHub API
 * @returns {Promise<Set<string>>} - Set of changed file paths
 */
async function getChangedFilesFromGitHub() {
  const token = core.getInput('token');
  const octokit = github.getOctokit(token);
  const context = github.context;
  const baseRef = core.getInput('base-ref');
  
  // If this is a pull request, get the changed files from the PR
  if (context.payload.pull_request) {
    core.info(`Getting changed files for PR #${context.payload.pull_request.number}`);
    
    const { data: files } = await octokit.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
    });
    
    return new Set(files.map(file => file.filename));
  } 
  // If base-ref is provided, compare with that ref
  else if (baseRef) {
    core.info(`Getting changed files compared to ${baseRef}`);
    
    const { data: comparison } = await octokit.repos.compareCommits({
      owner: context.repo.owner,
      repo: context.repo.repo,
      base: baseRef,
      head: context.sha,
    });
    
    return new Set(comparison.files.map(file => file.filename));
  }
  
  // If we can't get the diff, return an empty set
  core.warning('Could not determine changed files from GitHub API');
  return new Set();
}

/**
 * Filter coverage data based on changed files
 * @param {Array} coverageData - The coverage data
 * @param {Set<string>} changedFiles - Set of changed file paths
 * @returns {Array} - Filtered coverage data
 */
function filterCoverageByChangedFiles(coverageData, changedFiles) {
  // If no changed files or git diff is not enabled, return the original coverage data
  if (changedFiles.size === 0 || core.getInput('use-git-diff') !== 'true') {
    return coverageData;
  }
  
  core.info(`Filtering coverage data for ${changedFiles.size} changed files`);
  
  // Filter the coverage data to only include changed files
  // This is a simplified approach - in practice, you'd need to map
  // between Java package/class names and file paths
  return coverageData.filter(item => {
    const component = item.component;
    
    // Check if any changed file matches this component
    // This is a simple check that might need to be adjusted based on
    // how your coverage data maps to file paths
    for (const file of changedFiles) {
      // Convert file path to a format that might match the component name
      // For example, "src/main/java/com/example/MyClass.java" -> "com/example/MyClass"
      const normalizedPath = file
        .replace(/^src\/main\/java\//, '')
        .replace(/\.java$/, '')
        .replace(/\//g, '.');
      
      if (component === normalizedPath || component.endsWith(normalizedPath)) {
        return true;
      }
    }
    
    return false;
  });
}

module.exports = {
  parseGitDiff,
  getChangedFiles,
  getChangedFilesFromGitHub,
  filterCoverageByChangedFiles
};