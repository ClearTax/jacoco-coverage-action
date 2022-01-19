const core = require('@actions/core')
const table = require('markdown-table')
const replaceComment = require('@aki77/actions-replace-comment')
const gradientBadge = require('gradient-badge');


const github = require('@actions/github')
const fs = require('fs')
const csv = require('csv-parser')


const report = async(files, threshold,badgePath) => {
    const moduleCoverage  = await filterReport(files)
    const overAllCoverageVal = await overallCoverage(moduleCoverage)
    
    const issue_number = github.context.issue.number

    if (issue_number) {
        let bodyText = await markdownTable(moduleCoverage, overAllCoverageVal, threshold)
        core.info(bodyText)
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

    if (badgePath?.length) {
        console.log(`Write Svg to file ${badgePath}...`)
        fs.writeFileSync(badgePath, svgString)
        console.log('Badge saved succesfully.')
    }
    core.info(svgString)


    await checkCoverageThreshold(overAllCoverageVal, threshold)
}       

const checkCoverageThreshold = async(overAllCoverage, threshold) => {
    const percentage = parseFloat(overAllCoverage['line_percent']).toFixed(2)
    threshold = parseFloat(threshold).toFixed(2)
    if (percentage < threshold) {
        core.setFailed(`Coverage of ${percentage} is below passing threshold of ${threshold}`)
        return false
    }
    core.info(`Coverage is above passing threshod - ${percentage}`)
    return true
}

const markdownTable = async(moduleCoverage, overAllCoverage, threshold) => {
    const header = [
        'Category',
        'Percentage',
        'Covered / Total'
    ]
    
    const percentage = parseFloat(overAllCoverage['line_percent']).toFixed(2)
    const metrics = [
        '**Total**',
        `**${percentage}**`,
        `**${overAllCoverage['line_covered']} / ${overAllCoverage['line_total']}**`
    ]

    const coverageList = moduleCoverage.map((module) => {
        return [
          module['component'],
          parseFloat(module['line_percent']).toFixed(3),
          `${module['line_covered']} / ${module['line_total']}`
        ]
    })

    const tableText = table([header, ...coverageList, metrics])
    const headerText = "## Jacoco Coverage :rocket:"
    let failedText = null
    if (percentage < threshold) {
        failedText = `:x: Coverage of ${percentage} is below passing threshold of ${threshold}`
    }
    const bodyText = [headerText, failedText, tableText].filter(Boolean).join("\n");

    return bodyText;

}

const overallCoverage = async(result) => {
    const report = {
        'report': 'Total', 'line_percent': 0.0,
        'line_total': 0, 'line_covered': 0, 'line_missed': 0
    }
    result.forEach(row => {
        report['line_total'] += row['line_total']
        report['line_covered'] += row['line_covered']
        report['line_missed'] += row['line_missed']
    })
    report['line_percent'] = 
        parseFloat(report['line_covered']) / parseFloat(report['line_total']) * 100.0
    return report
}

const filterReport = async(files) => {
    const output = []
    await Promise.all(files.map(async (file) => {
        await parseFile(file).then(result => {
            Object.entries(result).forEach(([key, value]) => {
                let line_covered = value['line_covered']
                let line_missed  = value['line_missed']
                let line_total   = line_covered + line_missed
                let line_percent = parseFloat(line_covered) /  parseFloat(line_total) * 100.0
                output.push({
                    'component': key, 
                    'line_percent': line_percent,
                    'line_total': line_total,
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
                        data[group] = {'line_covered': 0, 'line_missed': 0}
                    }
                    data[group]['line_covered'] += parseInt(row.LINE_COVERED)
                    data[group]['line_missed'] += parseInt(row.LINE_MISSED)
                })
                resolve(data)
            })
    })
    return await promise
}

module.exports = report
