const core = require('@actions/core')
const table = require('markdown-table')
const replaceComment = require('@aki77/actions-replace-comment')
const gradientBadge = require('gradient-badge');
const gitDiff = require('./git-diff')

const github = require('@actions/github')
const fs = require('fs')
const csv = require('csv-parser')

/**
 * Generate a report from XML coverage data
 * @param {Object} coverageData - Coverage data from XML parser
 * @param {number} threshold - Minimum coverage threshold
 * @param {string} badgePath - Path to save coverage badge
 */
const generateXmlReport = async(coverageData, threshold, badgePath) => {
    console.log(`::debug::Generating XML report with threshold: ${threshold}`);
    console.log(`::debug::Coverage data structure: ${JSON.stringify({
        hasBefore: !!coverageData.before,
        hasAfter: !!coverageData.after,
        hasFilteredBefore: !!coverageData.filteredBefore,
        hasFilteredAfter: !!coverageData.filteredAfter,
        hasDelta: !!coverageData.delta,
        changedFilesCount: coverageData.changedFiles ? coverageData.changedFiles.length : 0
    })}`);
    
    // Validate coverage data
    if (!coverageData.after || !coverageData.after.overall) {
        console.log('::error::Invalid coverage data: missing after.overall');
        console.log(`::debug::Full coverage data: ${JSON.stringify(coverageData)}`);
        throw new Error('Invalid coverage data structure');
    }
    
    // Extract overall coverage values
    const afterCoverage = coverageData.after.overall;
    console.log(`::debug::After coverage: ${JSON.stringify(afterCoverage)}`);
    
    const lineCoverage = afterCoverage.line.coverage;
    const branchCoverage = afterCoverage.branch.coverage;
    
    console.log(`::notice::Line coverage: ${lineCoverage.toFixed(2)}%, Branch coverage: ${branchCoverage.toFixed(2)}%`);
    
    // Set output variables
    setXmlOutputVariables(afterCoverage);
    
    // Generate badge
    generateCoverageBadge(lineCoverage, badgePath);
    
    // Generate and post PR comment if this is a PR
    const issue_number = github.context.issue.number;
    if (issue_number) {
        // Add debug info to the PR comment
        let bodyText = await generateXmlMarkdownTable(coverageData, threshold);
        
        // Add debug section to PR comment
        if (core.getInput('use-git-diff') === 'true') {
            bodyText += "\n\n### Debug Information\n";
            bodyText += "- Using git diff: Yes\n";
            bodyText += `- Changed files: ${coverageData.changedFiles.length}\n`;
            bodyText += `- XML parsing: ${core.getInput('use-xml') === 'true' ? 'Enabled' : 'Auto-detected'}\n`;
            
            if (coverageData.changedFiles.length > 0) {
                bodyText += "\n**Changed Files:**\n";
                coverageData.changedFiles.slice(0, 10).forEach(file => {
                    bodyText += `- \`${file}\`\n`;
                });
                if (coverageData.changedFiles.length > 10) {
                    bodyText += `- ... and ${coverageData.changedFiles.length - 10} more\n`;
                }
            }
        }
        
        console.log(`::debug::PR comment body: ${bodyText}`);
        
        await replaceComment.default({
            token: core.getInput('token', { required: true }),
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            issue_number: issue_number,
            body: bodyText
        });
        
        console.log(`::notice::Posted coverage report to PR #${issue_number}`);
    }
    
    // Check if coverage meets threshold
    await checkCoverageThreshold({ 'line_percent': lineCoverage }, threshold);
    
    // Log summary of results
    console.log(`::notice::Coverage Summary - Line: ${lineCoverage.toFixed(2)}%, Branch: ${branchCoverage.toFixed(2)}%`);
    if (coverageData.delta) {
        const lineDelta = coverageData.delta.line.delta;
        const branchDelta = coverageData.delta.branch.delta;
        console.log(`::notice::Delta Coverage - Line: ${lineDelta > 0 ? '+' : ''}${lineDelta.toFixed(2)}%, Branch: ${branchDelta > 0 ? '+' : ''}${branchDelta.toFixed(2)}%`);
    }
}

/**
 * Generate markdown table from XML coverage data
 * @param {Object} coverageData - Coverage data from XML parser
 * @param {number} threshold - Minimum coverage threshold
 * @returns {string} - Markdown table
 */
const generateXmlMarkdownTable = async(coverageData, threshold) => {
    const header = [
        'Category',
        'Lines Coverage',
        'Lines Covered / Total',
        'Branches Coverage',
        'Branches Covered / Total'
    ];
    
    // Overall coverage data
    const afterCoverage = coverageData.after.overall;
    const lineCoverage = afterCoverage.line.coverage.toFixed(2);
    const branchCoverage = afterCoverage.branch.coverage.toFixed(2);
    
    const metrics = [
        '**Total**',
        `**${lineCoverage}%**`,
        `**${afterCoverage.line.covered} / ${afterCoverage.line.total}**`,
        `**${branchCoverage}%**`,
        `**${afterCoverage.branch.covered} / ${afterCoverage.branch.total}**`
    ];
    
    // Package coverage data
    const coverageList = coverageData.after.packages.map(pkg => {
        const lineCovered = pkg.counters.line.covered;
        const lineMissed = pkg.counters.line.missed;
        const lineTotal = lineCovered + lineMissed;
        const linePercent = (lineTotal > 0) ? (lineCovered / lineTotal) * 100 : 0;
        
        const branchCovered = pkg.counters.branch.covered;
        const branchMissed = pkg.counters.branch.missed;
        const branchTotal = branchCovered + branchMissed;
        const branchPercent = (branchTotal > 0) ? (branchCovered / branchTotal) * 100 : 0;
        
        return [
            pkg.name,
            `${linePercent.toFixed(2)}%`,
            `${lineCovered} / ${lineTotal}`,
            `${branchPercent.toFixed(2)}%`,
            `${branchCovered} / ${branchTotal}`
        ];
    });
    
    // Generate overall coverage table
    const tableText = table([header, ...coverageList, metrics]);
    
    // Generate delta coverage table if we have before and after data
    let deltaCoverageText = '';
    if (coverageData.delta) {
        const delta = coverageData.delta;
        
        const deltaHeader = [
            'Metric',
            'Before',
            'After',
            'Change'
        ];
        
        const deltaRows = [
            [
                'Line Coverage',
                `${delta.line.before.toFixed(2)}%`,
                `${delta.line.after.toFixed(2)}%`,
                formatDelta(delta.line.delta)
            ],
            [
                'Branch Coverage',
                `${delta.branch.before.toFixed(2)}%`,
                `${delta.branch.after.toFixed(2)}%`,
                formatDelta(delta.branch.delta)
            ],
            [
                'Method Coverage',
                `${delta.method.before.toFixed(2)}%`,
                `${delta.method.after.toFixed(2)}%`,
                formatDelta(delta.method.delta)
            ]
        ];
        
        deltaCoverageText = `\n\n### Delta Coverage (Changed Files Only)\n\n${table([deltaHeader, ...deltaRows])}`;
    }
    
    // Generate changed files coverage table if we have filtered data
    let changedFilesText = '';
    if (coverageData.filteredAfter && coverageData.filteredAfter.packages.length > 0) {
        const filteredCoverage = coverageData.filteredAfter.overall;
        const filteredLineCoverage = filteredCoverage.line.coverage.toFixed(2);
        const filteredBranchCoverage = filteredCoverage.branch.coverage.toFixed(2);
        
        const changedFilesMetrics = [
            '**Changed Files Total**',
            `**${filteredLineCoverage}%**`,
            `**${filteredCoverage.line.covered} / ${filteredCoverage.line.total}**`,
            `**${filteredBranchCoverage}%**`,
            `**${filteredCoverage.branch.covered} / ${filteredCoverage.branch.total}**`
        ];
        
        const changedFilesList = coverageData.filteredAfter.packages.flatMap(pkg =>
            pkg.classes.map(cls => {
                const lineCovered = cls.counters.line.covered;
                const lineMissed = cls.counters.line.missed;
                const lineTotal = lineCovered + lineMissed;
                const linePercent = (lineTotal > 0) ? (lineCovered / lineTotal) * 100 : 0;
                
                const branchCovered = cls.counters.branch.covered;
                const branchMissed = cls.counters.branch.missed;
                const branchTotal = branchCovered + branchMissed;
                const branchPercent = (branchTotal > 0) ? (branchCovered / branchTotal) * 100 : 0;
                
                return [
                    `${pkg.name}.${cls.name}`,
                    `${linePercent.toFixed(2)}%`,
                    `${lineCovered} / ${lineTotal}`,
                    `${branchPercent.toFixed(2)}%`,
                    `${branchCovered} / ${branchTotal}`
                ];
            })
        );
        
        changedFilesText = `\n\n### Changed Files Coverage\n\n${table([header, ...changedFilesList, changedFilesMetrics])}`;
    }
    
    // Generate final report
    const headerText = "## :rocket: Coverage Report ";
    const divider = "---";
    
    let reportLink = null;
    if (core.getInput("report-url") === undefined || core.getInput("report-url") === "") {
        reportLink = "*Coverage report not available*";
    } else {
        reportLink = `*[View full coverage report](${core.getInput("report-url")})*`;
    }
    
    let failedText = null;
    if (lineCoverage < threshold) {
        failedText = `:x: Coverage of ${lineCoverage}% is below passing threshold of ${threshold}%`;
    }
    
    // List changed files if available
    let changedFilesList = '';
    if (coverageData.changedFiles && coverageData.changedFiles.length > 0) {
        changedFilesList = "\n\n### Changed Files\n\n" + coverageData.changedFiles.map(file => `- \`${file}\``).join('\n');
    }
    
    const bodyText = [
        headerText,
        failedText,
        tableText,
        changedFilesText,
        deltaCoverageText,
        changedFilesList,
        divider,
        reportLink
    ].filter(Boolean).join("\n");
    
    return bodyText;
}

/**
 * Format delta value with color and sign
 * @param {number} delta - Delta value
 * @returns {string} - Formatted delta string
 */
const formatDelta = (delta) => {
    const formattedDelta = delta.toFixed(2);
    if (delta > 0) {
        return `:green_circle: +${formattedDelta}%`;
    } else if (delta < 0) {
        return `:red_circle: ${formattedDelta}%`;
    } else {
        return `:white_circle: ${formattedDelta}%`;
    }
}

/**
 * Set output variables from XML coverage data
 * @param {Object} coverage - Overall coverage data
 */
const setXmlOutputVariables = (coverage) => {
    const totalCoverage = coverage.line.coverage.toFixed(2);
    const linesCovered = coverage.line.covered;
    const linesMissed = coverage.line.missed;
    const totalLines = coverage.line.total;
    
    core.setOutput('total-coverage', totalCoverage);
    core.setOutput('lines-covered', linesCovered);
    core.setOutput('lines-missed', linesMissed);
    core.setOutput('total-lines', totalLines);
    
    console.log(`::notice::Setting output variables - total-coverage: ${totalCoverage}%, lines-covered: ${linesCovered}, lines-missed: ${linesMissed}, total-lines: ${totalLines}`);
}

/**
 * Generate coverage badge
 * @param {number} coverage - Coverage percentage
 * @param {string} badgePath - Path to save badge
 */
const generateCoverageBadge = (coverage, badgePath) => {
    const coverageValue = isNaN(coverage) ? '0.00' : coverage.toFixed(2);
    console.log(`::debug::Generating badge with coverage value: ${coverageValue}`);
    
    const svgString = gradientBadge({
        subject: 'Coverage',
        status: String(coverageValue),
        style: 'flat',
        gradient: ['00f2ff', '3cfa3f'],
    });

    if (badgePath && badgePath.length > 0) {
        console.log(`::debug::Writing SVG to file ${badgePath}...`);
        fs.writeFileSync(badgePath, svgString);
        console.log('::debug::Badge saved successfully.');
    } else {
        console.log('::debug::Badge path not configured');
    }
    console.log(`::debug::Badge SVG: ${svgString.substring(0, 100)}...`);
}


const report = async(files, threshold, badgePath) => {
    console.log(`::debug::Processing coverage report for ${files.length} file(s)`);
    
    // Get changed files from git diff
    const changedFiles = await gitDiff.getChangedFiles();
    console.log(`::debug::Found ${changedFiles.size} changed files from git diff`);
    
    // Filter report based on all files
    console.log(`::debug::Filtering report based on all files`);
    const allModuleCoverage = await filterReport(files);
    
    // Filter coverage data based on changed files
    console.log(`::debug::Filtering coverage data based on changed files`);
    const changedFilesCoverage = gitDiff.filterCoverageByChangedFiles(allModuleCoverage, changedFiles);
    
    // Calculate overall coverage for all files
    console.log(`::debug::Calculating overall coverage for all files`);
    const overAllCoverageVal = await overallCoverage(allModuleCoverage);
    
    // Calculate coverage for changed files only (if any)
    if (changedFiles.size > 0) {
        console.log(`::debug::Calculating coverage for ${changedFiles.size} changed files`);
    }
    const changedFilesOverallCoverage = changedFiles.size > 0 ?
        await overallCoverage(changedFilesCoverage) : null;
    
    // Log coverage values
    if (overAllCoverageVal) {
        console.log(`::notice::Overall coverage: ${overAllCoverageVal.line_percent.toFixed(2)}%`);
    }
    if (changedFilesOverallCoverage) {
        console.log(`::notice::Changed files coverage: ${changedFilesOverallCoverage.line_percent.toFixed(2)}%`);
    }
    
    setOutputVariables(overAllCoverageVal);
    
    const issue_number = github.context.issue.number;

    if (issue_number) {
        console.log(`::debug::Generating markdown table for PR #${issue_number}`);
        
        // Add debug info to the PR comment
        let bodyText = await markdownTable(
            allModuleCoverage,
            overAllCoverageVal,
            threshold,
            changedFilesCoverage,
            changedFilesOverallCoverage
        );
        
        // Add debug section to PR comment if git diff is enabled
        if (core.getInput('use-git-diff') === 'true') {
            bodyText += "\n\n### Debug Information\n";
            bodyText += "- Using git diff: Yes\n";
            bodyText += `- Changed files: ${changedFiles.size}\n`;
            bodyText += `- XML parsing: ${core.getInput('use-xml') === 'true' ? 'Enabled' : 'Auto-detected'}\n`;
            
            if (changedFiles.size > 0) {
                bodyText += "\n**Changed Files:**\n";
                Array.from(changedFiles).slice(0, 10).forEach(file => {
                    bodyText += `- \`${file}\`\n`;
                });
                if (changedFiles.size > 10) {
                    bodyText += `- ... and ${changedFiles.size - 10} more\n`;
                }
            }
        }
        
        console.log(`::debug::Posting comment to PR #${issue_number}`);
        await replaceComment.default({
            token: core.getInput('token', { required: true }),
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            issue_number: issue_number,
            body: bodyText
        });
        
        console.log(`::notice::Posted coverage report to PR #${issue_number}`);
    }
    // Generate coverage badge
    console.log(`::debug::Generating coverage badge`);
    const coverageValue = isNaN(overAllCoverageVal['line_percent']) ?
        '0.00' : overAllCoverageVal['line_percent'].toFixed(2);
    
    const svgString = gradientBadge({
        subject: 'Coverage',
        status: String(coverageValue),
        style: 'flat',
        gradient: ['00f2ff', '3cfa3f'],
    });

    if (badgePath && badgePath.length > 0) {
        console.log(`::debug::Writing badge to ${badgePath}`);
        fs.writeFileSync(badgePath, svgString);
        console.log(`::notice::Coverage badge saved to ${badgePath}`);
    } else {
        console.log(`::debug::Badge path not configured`);
    }


    await checkCoverageThreshold(overAllCoverageVal, threshold)
}       

const checkCoverageThreshold = async(overAllCoverage, threshold) => {
    const percentage = parseFloat(overAllCoverage['line_percent'])
    threshold = parseFloat(threshold)
    
    // Format percentage for display
    const formattedPercentage = isNaN(percentage) ? '0.00' : percentage.toFixed(2);
    
    if (isNaN(percentage) || percentage < threshold) {
        const message = `Coverage of ${formattedPercentage}% is below passing threshold of ${threshold}%`;
        console.log(`::error::${message}`);
        core.setFailed(message);
        return false;
    }
    
    console.log(`::notice::Coverage is above passing threshold - ${formattedPercentage}%`);
    return true;
}

const markdownTable = async(
    moduleCoverage,
    overAllCoverage,
    threshold,
    changedFilesCoverage = [],
    changedFilesOverallCoverage = null
) => {
    const header = [
        'Category',
        'Lines Coverage',
        'Lines Covered / Total',
        'Branches Coverage',
        'Branches Covered / Total'
    ];
    
    const lineCoverage = parseFloat(overAllCoverage['line_percent']).toFixed(2);
    const branchCoverage = parseFloat(overAllCoverage['branch_percent']).toFixed(2);
    const metrics = [
        '**Total**',
        `**${lineCoverage}%**`,
        `**${overAllCoverage['line_covered']} / ${overAllCoverage['line_total']}**`,
        `**${branchCoverage}%**`,
        `**${overAllCoverage['branch_covered']} / ${overAllCoverage['branch_total']}**`
    ];

    const coverageList = moduleCoverage.map((module) => {
        return [
          module['component'],
          `${parseFloat(module['line_percent']).toFixed(2)}%`,
          `${module['line_covered']} / ${module['line_total']}`,
          `${parseFloat(module['branch_percent']).toFixed(2)}%`,
          `${module['branch_covered']} / ${module['branch_total']}`
        ];
    });

    const tableText = table([header, ...coverageList, metrics]);
    
    // Create a separate table for changed files if there are any
    let changedFilesTableText = '';
    if (changedFilesOverallCoverage && changedFilesCoverage.length > 0) {
        const changedFilesLineCoverage = parseFloat(changedFilesOverallCoverage['line_percent']).toFixed(2);
        const changedFilesBranchCoverage = parseFloat(changedFilesOverallCoverage['branch_percent']).toFixed(2);
        
        const changedFilesMetrics = [
            '**Changed Files Total**',
            `**${changedFilesLineCoverage}%**`,
            `**${changedFilesOverallCoverage['line_covered']} / ${changedFilesOverallCoverage['line_total']}**`,
            `**${changedFilesBranchCoverage}%**`,
            `**${changedFilesOverallCoverage['branch_covered']} / ${changedFilesOverallCoverage['branch_total']}**`
        ];
        
        const changedFilesList = changedFilesCoverage.map((module) => {
            return [
              module['component'],
              `${parseFloat(module['line_percent']).toFixed(2)}%`,
              `${module['line_covered']} / ${module['line_total']}`,
              `${parseFloat(module['branch_percent']).toFixed(2)}%`,
              `${module['branch_covered']} / ${module['branch_total']}`
            ];
        });
        
        changedFilesTableText = `\n\n### Changed Files Coverage\n\n${table([header, ...changedFilesList, changedFilesMetrics])}`;
    }
    
    const headerText = "## :rocket: Coverage Report ";
    const divider = "---"
    let reportLink = null
    if (core.getInput("report-url") == undefined || core.getInput("report-url") == "") {
        reportLink = "*Coverage report not available*";
    } else {
        reportLink = `*[View full coverage report](${core.getInput("report-url")})*`
    }
    let failedText = null
    if (lineCoverage < threshold) {
        failedText = `:x: Coverage of ${lineCoverage} is below passing threshold of ${threshold}`
    }
    const bodyText = [headerText, failedText, tableText, changedFilesTableText, divider, reportLink].filter(Boolean).join("\n");

    return bodyText;

}

const overallCoverage = async(result) => {
    const report = {
        'report': 'Total', 
        'line_percent': 0.0,
        'line_total': 0,
        'line_covered': 0,
        'line_missed': 0,
        'branch_percent': 0.0,
        'branch_total': 0,
        'branch_covered': 0,
        'branch_missed': 0
    }
    result.forEach(row => {
        report['line_total'] += row['line_total']
        report['line_covered'] += row['line_covered']
        report['line_missed'] += row['line_missed']
        report['branch_total'] += row['branch_total']
        report['branch_covered'] += row['branch_covered']
        report['branch_missed'] += row['branch_missed']
    })
    report['line_percent'] = 
        parseFloat(report['line_covered']) / parseFloat(report['line_total']) * 100.0
    report['branch_percent'] = 
        parseFloat(report['branch_covered']) / parseFloat(report['branch_total']) * 100.0
    return report
}

const filterReport = async(files) => {
    const output = []
    await Promise.all(files.map(async (file) => {
        await parseFile(file).then(result => {
            // key -> group name
            // value -> object with line_covered, line_missed, branch_covered, branch_missed
            Object.entries(result).forEach(([key, value]) => {
                let line_covered = value['line_covered']
                let line_missed  = value['line_missed']
                let line_total   = line_covered + line_missed
                let line_percent = parseFloat(line_covered) /  parseFloat(line_total) * 100.0

                let branch_covered = value['branch_covered']
                let branch_missed  = value['branch_missed']
                let branch_total   = branch_covered + branch_missed
                let branch_percent = parseFloat(branch_covered) /  parseFloat(branch_total) * 100.0
                output.push({
                    'component': key, 
                    'line_percent': line_percent,
                    'line_total': line_total,
                    'branch_percent': branch_percent,
                    'branch_total': branch_total,
                    ...value
                })
            })
        }).catch(error => { 
            core.setFailed(error.message)
        })
    }))
    return output
}

const parseFile = async(file) => {
    let data = {}
    let results = []
    const promise = new Promise((resolve, reject) => {
        fs.createReadStream(file)
            .pipe(csv())
            .on('data', async(rows) => results.push(rows))
            .on('error', () => reject())
            .on('end', async() => {
                results.forEach( (row, index) => {
                    let group = row.GROUP
                    if (group.indexOf('/') != -1) {
                        let groups = group.split('/')
                        group = groups.pop()
                    }
                    if (data[group] == undefined) {
                        data[group] = {'line_covered': 0, 'line_missed': 0, 'branch_covered': 0, 'branch_missed': 0}
                    }
                    data[group]['line_covered'] += parseInt(row.LINE_COVERED)
                    data[group]['line_missed'] += parseInt(row.LINE_MISSED)
                    data[group]['branch_covered'] += parseInt(row.BRANCH_COVERED)
                    data[group]['branch_missed'] += parseInt(row.BRANCH_MISSED)
                })
                resolve(data)
            })
    })
    return await promise
}

const setOutputVariables = overAllCoverageVal => {
    core.setOutput('total-coverage', overAllCoverageVal.line_percent.toFixed(2));
    core.setOutput('lines-covered', overAllCoverageVal.line_covered);
    core.setOutput('lines-missed', overAllCoverageVal.line_missed);
    core.setOutput('total-lines', overAllCoverageVal.line_total);
}

module.exports = report;
module.exports.generateXmlReport = generateXmlReport;