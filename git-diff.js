const core = require('@actions/core');
const github = require('@actions/github');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Get the git diff between the current branch and the base branch
 * @param {string} baseRef - The base branch to compare against (default: master)
 * @returns {Promise<Object>} - Object containing changed files and their changed lines
 */
async function getGitDiff(baseRef = 'master') {
  try {
    core.info(`Getting git diff against ${baseRef}...`);
    
    // If we're in a GitHub Actions context, we can use the GitHub API
    if (github.context.payload.pull_request) {
      return await getGitDiffFromPR();
    }
    
    // Otherwise, use git command line
    return await getGitDiffFromCommand(baseRef);
  } catch (error) {
    core.warning(`Error getting git diff: ${error.message}`);
    return {};
  }
}

/**
 * Get git diff using the GitHub API for a pull request
 * @returns {Promise<Object>} - Object containing changed files and their changed lines
 */
async function getGitDiffFromPR() {
  const token = core.getInput('token');
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const pull_number = github.context.payload.pull_request.number;
  
  core.info(`Getting diff for PR #${pull_number} in ${owner}/${repo}`);
  
  // Get the list of files changed in the PR
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number,
  });
  
  const changedFiles = {};
  
  // Process each file to extract changed line numbers
  for (const file of files) {
    // Skip files that were deleted
    if (file.status === 'removed') {
      continue;
    }
    
    // Get the patch and extract line numbers
    const changedLines = extractChangedLinesFromPatch(file.patch);
    if (changedLines.length > 0) {
      changedFiles[file.filename] = changedLines;
    }
  }
  
  return changedFiles;
}

/**
 * Get git diff using the git command line
 * @param {string} baseRef - The base branch to compare against
 * @returns {Promise<Object>} - Object containing changed files and their changed lines
 */
async function getGitDiffFromCommand(baseRef) {
  try {
    // Get the diff
    const { stdout } = await execPromise(`git diff --unified=0 ${baseRef}...HEAD`);
    
    return parseDiff(stdout);
  } catch (error) {
    core.warning(`Error executing git diff command: ${error.message}`);
    return {};
  }
}

/**
 * Parse the git diff output to extract changed files and line numbers
 * @param {string} diff - The git diff output
 * @returns {Object} - Object containing changed files and their changed lines
 */
function parseDiff(diff) {
  const changedFiles = {};
  let currentFile = null;
  
  // Split the diff by lines
  const lines = diff.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this line indicates a new file
    if (line.startsWith('diff --git')) {
      // Extract the file path (b/ is the new file)
      const match = line.match(/b\/(.+)$/);
      if (match) {
        currentFile = match[1];
        changedFiles[currentFile] = [];
      }
    }
    
    // Check if this line is a hunk header
    if (line.startsWith('@@') && currentFile) {
      // Extract the line numbers
      // Format: @@ -oldStart,oldLines +newStart,newLines @@
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        const newStart = parseInt(match[1], 10);
        const newLines = match[2] ? parseInt(match[2], 10) : 1;
        
        // Add all lines in this hunk to the changed lines
        for (let j = 0; j < newLines; j++) {
          changedFiles[currentFile].push(newStart + j);
        }
      }
    }
  }
  
  return changedFiles;
}

/**
 * Extract changed line numbers from a patch
 * @param {string} patch - The patch content
 * @returns {Array<number>} - Array of changed line numbers
 */
function extractChangedLinesFromPatch(patch) {
  if (!patch) return [];
  
  const changedLines = [];
  const lines = patch.split('\n');
  let lineNumber = 0;
  
  for (const line of lines) {
    // Check if this line is a hunk header
    if (line.startsWith('@@')) {
      // Extract the starting line number for the new file
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) {
        lineNumber = parseInt(match[1], 10);
      }
      continue;
    }
    
    // If the line starts with '+', it's an addition
    if (line.startsWith('+') && !line.startsWith('+++')) {
      changedLines.push(lineNumber);
    }
    
    // Increment the line number for any line that isn't a removal
    if (!line.startsWith('-') || line.startsWith('---')) {
      lineNumber++;
    }
  }
  
  return changedLines;
}

/**
 * Map file paths from git diff to JaCoCo report paths
 * @param {Object} changedFiles - Object containing changed files and their changed lines
 * @param {string} sourceDir - Source code directory to match with JaCoCo report paths
 * @returns {Object} - Object with mapped file paths
 */
function mapFilePaths(changedFiles, sourceDir = 'src') {
  const mappedFiles = {};
  
  for (const [filePath, lines] of Object.entries(changedFiles)) {
    // Skip non-source files (e.g., test files, config files)
    if (!filePath.endsWith('.java') && !filePath.endsWith('.kt') && 
        !filePath.endsWith('.groovy') && !filePath.endsWith('.scala')) {
      continue;
    }
    
    // Extract the package/class name from the file path
    let className = filePath;
    
    // Remove the source directory prefix if it exists
    if (className.startsWith(sourceDir + '/')) {
      className = className.substring(sourceDir.length + 1);
    }
    
    // Remove the file extension
    className = className.replace(/\.(java|kt|groovy|scala)$/, '');
    
    // Replace directory separators with dots for package name
    className = className.replace(/\//g, '.');
    
    mappedFiles[className] = lines;
  }
  
  return mappedFiles;
}

module.exports = {
  getGitDiff,
  mapFilePaths
};