const core = require('@actions/core')
const table = require('markdown-table')
const replaceComment = require('@aki77/actions-replace-comment')
const gradientBadge = require('gradient-badge');


const github = require('@actions/github')
const fs = require('fs')
const csv = require('csv-parser')
const gitDiff = require('./git_diff')


const report = async(files, threshold, badgePath, useDiff = false, changedFiles = []) => {
    // Debug input parameter
    const moduleCoverage  = await filterReport(files)
    const overAllCoverageVal = await overallCoverage(moduleCoverage)
    setOutputVariables(overAllCoverageVal);
    
    const issue_number = github.context.issue.number

    let diffCoverage = null;
    let diffCoverageVal = null;
    if (useDiff && changedFiles.length > 0) {
        core.info('=== DEBUG: Filtering coverage for changed files ===');
        core.info(`Module coverage count before filtering: ${moduleCoverage.length}`);
        core.info(`Changed files count: ${changedFiles.length}`);
        
        diffCoverage = gitDiff.filterCoverageByChangedFiles(moduleCoverage, changedFiles);
        
        core.info(`Filtered coverage count: ${diffCoverage.length}`);
        if (diffCoverage.length > 0) {
            core.info(`First filtered component: ${JSON.stringify(diffCoverage[0])}`);
        } else {
            core.warning('WARNING: No coverage data matched with changed files');
        }
        
        diffCoverageVal = await overallCoverage(diffCoverage);
        core.info(`Diff coverage percentage: ${diffCoverageVal.line_percent.toFixed(2)}%`);
    }

    if (issue_number) {
        let bodyText = await markdownTable(moduleCoverage, overAllCoverageVal, threshold, useDiff, diffCoverage, diffCoverageVal)
        core.info(bodyText)
        core.info('=== DEBUG: Report Function Parameters ===');
        core.info(`Files: ${JSON.stringify(files)}`);
        core.info(`Threshold: ${threshold}`);
        core.info(`Badge Path: ${badgePath}`);
        core.info(`Use Diff: ${useDiff}`);
        core.info(`Changed Files Count: ${changedFiles.length}`);
        if (changedFiles.length > 0) {
            core.info(`First few changed files: ${JSON.stringify(changedFiles.slice(0, 5))}`);
        }
    
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
    const svgString = gradientBadge({
        subject: 'Coverage',
        status: String(overAllCoverageVal['line_percent'].toFixed(2)),
        style: 'flat', 
        gradient: ['00f2ff', '3cfa3f'],
    });

    if (badgePath && badgePath.length>0) {
        core.info(`Write Svg to file ${badgePath}...`)
        fs.writeFileSync(badgePath, svgString)
        core.info('Badge saved succesfully.')
    }
    else{
        core.info('Badge path not configured')
    }
    core.info(svgString)


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

const markdownTable = async(moduleCoverage, overAllCoverage, threshold, useDiff = false, diffCoverage = null, diffCoverageVal = null) => {
    // Debug parameters
    core.info('=== DEBUG: Markdown Table Function Parameters ===');
    core.info(`Use Diff: ${useDiff}`);
    core.info(`Has Diff Coverage: ${diffCoverage !== null}`);
    core.info(`Diff Coverage Length: ${diffCoverage ? diffCoverage.length : 0}`);
    
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
    let diffTableText = '';
    if (useDiff && diffCoverage && diffCoverage.length > 0) {
        core.info('=== DEBUG: Generating diff coverage table ===');
        
        const diffHeader = [
            'Changed File',
            'Lines Coverage',
            'Lines Covered / Total',
            'Branches Coverage',
            'Branches Covered / Total'
        ]
        
        const diffLineCoverage = parseFloat(diffCoverageVal['line_percent']).toFixed(2)
        const diffBranchCoverage = parseFloat(diffCoverageVal['branch_percent']).toFixed(2)
        const diffMetrics = [
            '**Changed Files Total**',
            `**${diffLineCoverage}%**`,
            `**${diffCoverageVal['line_covered']} / ${diffCoverageVal['line_total']}**`,
            `**${diffBranchCoverage}%**`,
            `**${diffCoverageVal['branch_covered']} / ${diffCoverageVal['branch_total']}**`
        ]

        const diffCoverageList = diffCoverage.map((module) => {
            return [
              module['component'],
              `${parseFloat(module['line_percent']).toFixed(2)}%`,
              `${module['line_covered']} / ${module['line_total']}`,
              `${parseFloat(module['branch_percent']).toFixed(2)}%`,
              `${module['branch_covered']} / ${module['branch_total']}`
            ]
        })

        diffTableText = "\n\n### Coverage for Changed Files\n\n" +
                        table([diffHeader, ...diffCoverageList, diffMetrics]);
        
        core.info(`Generated diff table with ${diffCoverage.length} components`);
    } else {
        core.info('=== DEBUG: Skipping diff coverage table ===');
        core.info(`useDiff: ${useDiff}`);
        core.info(`diffCoverage exists: ${diffCoverage !== null}`);
        core.info(`diffCoverage length: ${diffCoverage ? diffCoverage.length : 0}`);
    }
    
    // Add the diff table to the body text
    const headerText = "## :rocket: Coverage Report "
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
    
    // Include the diff table in the body text
    const bodyText = [headerText, failedText, tableText, diffTableText, divider, reportLink].filter(Boolean).join("\n");

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