const report = require('./report')
const cp = require('child_process')
const github = require('@actions/github')
const core = require('@actions/core')
const replaceComment = require('@aki77/actions-replace-comment')
const path = require('path')



let inputs = {"token":"demo"}

describe('input-helper tests', () => {

    beforeAll(() => {

        jest.spyOn(github.context, 'repo', 'get').mockImplementation(() => {
            return {
            owner: 'some-owner',
            repo: 'some-repo'
            }
        })

        jest.spyOn(github.context, 'issue', 'get').mockImplementation(() => {
        return {
            number: 1233,
        }
        })

        github.context.ref = 'refs/heads/some-ref'
        github.context.sha = '1234567890123456789012345678901234567890'

        jest.spyOn(core, 'getInput').mockImplementation((name) => {
        return inputs[name]
        })
        jest.spyOn(replaceComment, 'default').mockImplementation(jest.fn())
        jest.spyOn(core, 'info').mockImplementation(jest.fn(x => console.log(x)))
        jest.spyOn(core, 'setFailed').mockImplementation(jest.fn(x => console.log(x)))
        

    })

    
  afterAll(() => {
    // Restore GitHub workspace
    delete process.env['GITHUB_WORKSPACE']
    if (originalGitHubWorkspace) {
      process.env['GITHUB_WORKSPACE'] = originalGitHubWorkspace
    }

    // Restore @actions/github context
    github.context.ref = originalContext.ref
    github.context.sha = originalContext.sha

    // Restore
    jest.restoreAllMocks()
  })


    test('json without group metrics', async () => {
        
        const badgePath = "example/"
        const files = [path.resolve('./', 'example/jacoco.csv')]
        badgeRelativePath=path.resolve('./', badgePath+"covergeBadge.svg")
        console.log(badgeRelativePath)
        const success = await report(files,10,badgeRelativePath)
        expect(true).toEqual(true)
    })
  
})
describe('withRetry', () => {
    const { withRetry } = report

    beforeEach(() => {
        jest.spyOn(core, 'warning').mockImplementation(jest.fn())
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    test('succeeds after a transient failure', async () => {
        const fn = jest.fn()
            .mockRejectedValueOnce(Object.assign(new Error('invalid json response body'), { status: 500 }))
            .mockResolvedValueOnce('posted')

        await expect(withRetry(fn, 4, 0)).resolves.toEqual('posted')
        expect(fn).toHaveBeenCalledTimes(2)
    })

    test('gives up after the last attempt', async () => {
        const fn = jest.fn().mockRejectedValue(Object.assign(new Error('bad gateway'), { status: 502 }))

        await expect(withRetry(fn, 4, 0)).rejects.toThrow('bad gateway')
        expect(fn).toHaveBeenCalledTimes(4)
    })

    test('does not retry a client error', async () => {
        const fn = jest.fn().mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }))

        await expect(withRetry(fn, 4, 0)).rejects.toThrow('forbidden')
        expect(fn).toHaveBeenCalledTimes(1)
    })
})
