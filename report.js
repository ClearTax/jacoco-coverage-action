const core = require('@actions/core')
const table = require('markdown-table')
const replaceComment = require('@aki77/actions-replace-comment')
const gradientBadge = require('gradient-badge');
const { calculateDiffCoverage, calculateLineSpecificCoverage } = require('./diff-coverage');
const { extractCoverageFromXml, formatCoverageData } = require('./xml-parser');

const github = require('@actions/github')
const fs = require('fs')
const csv = require('csv-parser')
const path = require('path')


const report = async(files, threshold, badgePath) => {
    const moduleCoverage = await filterReport(files)
    const overAllCoverageVal = await overallCoverage(moduleCoverage)
    
    // Calculate diff coverage
    const diffCoverageVal = await calculateDiffCoverage(files);
    
    // Calculate line-specific coverage if a single JaCoCo XML file is provided
    let lineSpecificCoverage = null;
    if (files.length === 1 && files[0].endsWith('.xml')) {
        lineSpecificCoverage = await calculateLineSpecificCoverage(files[0]);
    }
    
    // Set output variables for both overall and diff coverage
    setOutputVariables(overAllCoverageVal, diffCoverageVal, lineSpecificCoverage);
    
    const issue_number = github.context.issue.number

    if (issue_number) {
        let bodyText = await markdownTable(moduleCoverage, overAllCoverageVal, diffCoverageVal, threshold, lineSpecificCoverage)
        core.info(bodyText)
        core.info(issue_number)
        core.info(github.context.repo.repo)
        core.info(github.context.repo.owner)
        await replaceComment.default({
            token: core.getInput('token', { required: true }),
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            issue_number: issue_number,
            body: bodyText
        })
    }
    
    // Create badge for overall coverage
    const svgString = gradientBadge({
        subject: 'Coverage',
        status: String(overAllCoverageVal['line_percent'].toFixed(2)),
        style: 'flat',
        gradient: ['00f2ff', '3cfa3f'],
    });

    if (badgePath && badgePath.length > 0) {
        core.info(`Write Svg to file ${badgePath}...`)
        fs.writeFileSync(badgePath, svgString)
        core.info('Badge saved succesfully.')
    }
    else {
        core.info('Badge path not configured')
    }
    core.info(svgString)

    // Create badge for diff coverage if there are changed lines
    if (diffCoverageVal.diff_line_total > 0) {
        const diffSvgString = gradientBadge({
            subject: 'Diff Coverage',
            status: String(diffCoverageVal.diff_line_percent.toFixed(2)),
            style: 'flat',
            gradient: ['00f2ff', '3cfa3f'],
        });
        core.info(diffSvgString);
        
        // Save diff coverage badge if path is configured
        if (badgePath && badgePath.length > 0) {
            const diffBadgePath = badgePath.replace('.svg', '-diff.svg');
            fs.writeFileSync(diffBadgePath, diffSvgString);
            core.info(`Diff coverage badge saved to ${diffBadgePath}`);
        }
    }

    await checkCoverageThreshold(overAllCoverageVal, threshold)
}

const checkCoverageThreshold = async(overAllCoverage, threshold) => {
    const percentage = parseFloat(overAllCoverage['line_percent'])
    threshold = parseFloat(threshold)
    if (percentage < threshold) {
        core.setFailed(`Coverage of ${percentage} is below passing threshold of ${threshold}`)
        return false
    }
    core.info(`Coverage is above passing threshod - ${percentage}`)
    return true
}

const markdownTable = async(moduleCoverage, overAllCoverage, diffCoverage, threshold, lineSpecificCoverage) => {
    const header = [
        'Category',
        'Lines Coverage',
        'Lines Covered / Total',
        'Branches Coverage',
        'Branches Covered / Total'
    ]
    
    const lineCoverage = parseFloat(overAllCoverage['line_percent']).toFixed(2)
    const branchCoverage = parseFloat(overAllCoverage['branch_percent']).toFixed(2)
    const metrics = [
        '**Total**',
        `**${lineCoverage}%**`,
        `**${overAllCoverage['line_covered']} / ${overAllCoverage['line_total']}**`,
        `**${branchCoverage}%**`,
        `**${overAllCoverage['branch_covered']} / ${overAllCoverage['branch_total']}**`
    ]

    const coverageList = moduleCoverage.map((module) => {
        return [
          module['component'],
          `${parseFloat(module['line_percent']).toFixed(2)}%`,
          `${module['line_covered']} / ${module['line_total']}`,
          `${parseFloat(module['branch_percent']).toFixed(2)}%`,
          `${module['branch_covered']} / ${module['branch_total']}`
        ]
    })

    const tableText = table([header, ...coverageList, metrics])
    const headerText = "## :rocket: Coverage Report "
    const divider = "---"
    
    // Create diff coverage section if there are changed lines
    let diffCoverageText = "";
    if (diffCoverage.diff_line_total > 0) {
        const diffLineCoverage = parseFloat(diffCoverage.diff_line_percent).toFixed(2);
        diffCoverageText = `
        ### :mag: Changed Lines Coverage

        This PR changes **${diffCoverage.diff_line_total}** lines of code.
        - **${diffCoverage.diff_line_covered}** lines are covered by tests (${diffLineCoverage}%)
        - **${diffCoverage.diff_line_missed}** lines are not covered by tests
        `;
    }
    
    // Add line-specific coverage details if available
    let lineSpecificCoverageText = "";
    if (lineSpecificCoverage && lineSpecificCoverage.totalChangedLines > 0) {
        const lineSpecificPercent = parseFloat(lineSpecificCoverage.coveragePercentage).toFixed(2);
        lineSpecificCoverageText = `
        ### 🔍 Line-Specific Coverage Details
        
        This PR changes **${lineSpecificCoverage.totalChangedLines}** specific lines of code.
        - **${lineSpecificCoverage.coveredChangedLines}** lines are covered by tests (${lineSpecificPercent}%)
        - **${lineSpecificCoverage.missedChangedLines}** lines are not covered by tests
        
        #### Changed Files Coverage Details
        
        | File | Changed Lines | Covered | Coverage % |
        | ---- | ------------ | ------- | ---------- |
        `;
        
        for (const [filePath, fileDetails] of Object.entries(lineSpecificCoverage.fileDetails)) {
            const filePercent = fileDetails.totalChangedLines > 0
                ? (fileDetails.coveredChangedLines / fileDetails.totalChangedLines * 100).toFixed(2)
                : '0.00';
            
            lineSpecificCoverageText += `| ${filePath} | ${fileDetails.totalChangedLines} | ${fileDetails.coveredChangedLines} | ${filePercent}% |\n`;
        }
    }
    
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
    
    const bodyText = [headerText, failedText, tableText, diffCoverageText, lineSpecificCoverageText, divider, reportLink].filter(Boolean).join("\n");

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
    report['line_percent'] = report['line_total'] > 0
        ? parseFloat(report['line_covered']) / parseFloat(report['line_total']) * 100.0
        : 0.0
    report['branch_percent'] = report['branch_total'] > 0
        ? parseFloat(report['branch_covered']) / parseFloat(report['branch_total']) * 100.0
        : 0.0
    return report
}

const filterReport = async(files) => {
    const output = []
    await Promise.all(files.map(async (file) => {
        try {
            // Determine file type based on extension
            const fileExt = path.extname(file).toLowerCase();
            
            if (fileExt === '.xml') {
                // Parse XML report
                core.info(`Parsing XML report: ${file}`);
                const coverageData = await extractCoverageFromXml(file);
                const formattedData = formatCoverageData(coverageData);
                output.push(...formattedData);
            } else {
                // Parse CSV report (original implementation)
                core.info(`Parsing CSV report: ${file}`);
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
                    core.warning(`Error parsing CSV file ${file}: ${error.message}`);
                })
            }
        } catch (error) {
            core.warning(`Error processing file ${file}: ${error.message}`);
        }
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
            .on('error', (error) => reject(error))
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

const setOutputVariables = (overAllCoverageVal, diffCoverageVal, lineSpecificCoverage) => {
    // Set overall coverage outputs
    core.setOutput('total-coverage', overAllCoverageVal.line_percent.toFixed(2));
    core.setOutput('lines-covered', overAllCoverageVal.line_covered);
    core.setOutput('lines-missed', overAllCoverageVal.line_missed);
    core.setOutput('total-lines', overAllCoverageVal.line_total);
    
    // Set diff coverage outputs
    core.setOutput('diff-coverage', diffCoverageVal.diff_line_percent.toFixed(2));
    core.setOutput('diff-lines-covered', diffCoverageVal.diff_line_covered);
    core.setOutput('diff-lines-missed', diffCoverageVal.diff_line_missed);
    core.setOutput('diff-total-lines', diffCoverageVal.diff_line_total);
    
    // Set line-specific coverage outputs if available
    if (lineSpecificCoverage) {
        core.setOutput('line-specific-coverage', lineSpecificCoverage.coveragePercentage.toFixed(2));
        core.setOutput('line-specific-covered', lineSpecificCoverage.coveredChangedLines);
        core.setOutput('line-specific-missed', lineSpecificCoverage.missedChangedLines);
        core.setOutput('line-specific-total', lineSpecificCoverage.totalChangedLines);
    }
}

module.exports = report;