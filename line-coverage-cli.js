#!/usr/bin/env node

const { calculateLineSpecificCoverage } = require('./diff-coverage');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
let jacocoXmlPath = 'jacoco.xml';
let baseRef = 'master';
let outputFormat = 'text';
let outputPath = null;

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--jacoco-xml' || arg === '-j') {
    jacocoXmlPath = args[++i];
  } else if (arg === '--base-ref' || arg === '-b') {
    baseRef = args[++i];
  } else if (arg === '--output-format' || arg === '-f') {
    outputFormat = args[++i];
  } else if (arg === '--output' || arg === '-o') {
    outputPath = args[++i];
  } else if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
}

// Print help message
function printHelp() {
  console.log(`
Usage: node line-coverage-cli.js [options]

Options:
  --jacoco-xml, -j     Path to JaCoCo XML report (default: jacoco.xml)
  --base-ref, -b       Base branch to compare against (default: master)
  --output-format, -f  Output format: text, json, markdown (default: text)
  --output, -o         Output file path (default: stdout)
  --help, -h           Show this help message
  `);
}

// Format the result as text
function formatAsText(result) {
  let output = '';
  
  output += `Line-Specific Coverage Report\n`;
  output += `===========================\n\n`;
  output += `Base Reference: ${baseRef}\n`;
  output += `JaCoCo XML Report: ${jacocoXmlPath}\n\n`;
  output += `Total Changed Lines: ${result.totalChangedLines}\n`;
  output += `Covered Changed Lines: ${result.coveredChangedLines}\n`;
  output += `Missed Changed Lines: ${result.missedChangedLines}\n`;
  output += `Coverage Percentage: ${result.coveragePercentage.toFixed(2)}%\n\n`;
  
  output += `File Details:\n`;
  output += `------------\n\n`;
  
  for (const [filePath, fileResult] of Object.entries(result.fileDetails)) {
    const coveragePercent = fileResult.totalChangedLines > 0 
      ? (fileResult.coveredChangedLines / fileResult.totalChangedLines * 100).toFixed(2) 
      : '0.00';
    
    output += `${filePath}:\n`;
    output += `  Total Changed Lines: ${fileResult.totalChangedLines}\n`;
    output += `  Covered Changed Lines: ${fileResult.coveredChangedLines}\n`;
    output += `  Missed Changed Lines: ${fileResult.missedChangedLines}\n`;
    output += `  Coverage Percentage: ${coveragePercent}%\n`;
    output += `  Line Details:\n`;
    
    for (const lineDetail of fileResult.lineDetails) {
      output += `    Line ${lineDetail.line}: ${lineDetail.covered ? 'Covered' : 'Not Covered'}\n`;
    }
    
    output += '\n';
  }
  
  return output;
}

// Format the result as markdown
function formatAsMarkdown(result) {
  let output = '';
  
  output += `# Line-Specific Coverage Report\n\n`;
  output += `- **Base Reference:** ${baseRef}\n`;
  output += `- **JaCoCo XML Report:** ${jacocoXmlPath}\n\n`;
  output += `## Summary\n\n`;
  output += `- **Total Changed Lines:** ${result.totalChangedLines}\n`;
  output += `- **Covered Changed Lines:** ${result.coveredChangedLines}\n`;
  output += `- **Missed Changed Lines:** ${result.missedChangedLines}\n`;
  output += `- **Coverage Percentage:** ${result.coveragePercentage.toFixed(2)}%\n\n`;
  
  output += `## File Details\n\n`;
  
  for (const [filePath, fileResult] of Object.entries(result.fileDetails)) {
    const coveragePercent = fileResult.totalChangedLines > 0 
      ? (fileResult.coveredChangedLines / fileResult.totalChangedLines * 100).toFixed(2) 
      : '0.00';
    
    output += `### ${filePath}\n\n`;
    output += `- **Total Changed Lines:** ${fileResult.totalChangedLines}\n`;
    output += `- **Covered Changed Lines:** ${fileResult.coveredChangedLines}\n`;
    output += `- **Missed Changed Lines:** ${fileResult.missedChangedLines}\n`;
    output += `- **Coverage Percentage:** ${coveragePercent}%\n\n`;
    output += `#### Line Details\n\n`;
    output += `| Line | Coverage |\n`;
    output += `| ---- | -------- |\n`;
    
    for (const lineDetail of fileResult.lineDetails) {
      output += `| ${lineDetail.line} | ${lineDetail.covered ? '✅ Covered' : '❌ Not Covered'} |\n`;
    }
    
    output += '\n';
  }
  
  return output;
}

// Main function
async function main() {
  try {
    // Check if JaCoCo XML file exists
    if (!fs.existsSync(jacocoXmlPath)) {
      console.error(`Error: JaCoCo XML file not found: ${jacocoXmlPath}`);
      process.exit(1);
    }
    
    // Calculate line-specific coverage
    const result = await calculateLineSpecificCoverage(jacocoXmlPath, baseRef);
    
    // Format the result
    let output;
    if (outputFormat === 'json') {
      output = JSON.stringify(result, null, 2);
    } else if (outputFormat === 'markdown') {
      output = formatAsMarkdown(result);
    } else {
      output = formatAsText(result);
    }
    
    // Output the result
    if (outputPath) {
      fs.writeFileSync(outputPath, output);
      console.log(`Report written to ${outputPath}`);
    } else {
      console.log(output);
    }
    
    // Exit with appropriate code based on coverage
    const threshold = 80; // Default threshold
    if (result.coveragePercentage < threshold) {
      console.error(`Coverage (${result.coveragePercentage.toFixed(2)}%) is below threshold (${threshold}%)`);
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();