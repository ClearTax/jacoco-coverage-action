// Mock dependencies before requiring the modules
jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'some-owner',
      repo: 'some-repo'
    },
    issue: {
      number: 1233
    },
    ref: 'refs/heads/some-ref',
    sha: '1234567890123456789012345678901234567890'
  },
  getOctokit: jest.fn()
}));

jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  info: jest.fn(x => console.log(x)),
  setFailed: jest.fn(x => console.log(x)),
  setOutput: jest.fn()
}));

jest.mock('@aki77/actions-replace-comment', () => ({
  default: jest.fn()
}));

jest.mock('./diff-coverage', () => ({
  calculateDiffCoverage: jest.fn().mockResolvedValue({
    diff_line_percent: 75.0,
    diff_line_covered: 3,
    diff_line_missed: 1,
    diff_line_total: 4
  })
}));

jest.mock('fs', () => ({
  createReadStream: jest.fn(() => ({
    pipe: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(function(event, callback) {
      if (event === 'data') {
        callback({
          GROUP: 'com.example.Class1',
          LINE_COVERED: '3',
          LINE_MISSED: '1',
          BRANCH_COVERED: '2',
          BRANCH_MISSED: '1'
        });
      }
      if (event === 'end') {
        callback();
      }
      return this;
    })
  })),
  writeFileSync: jest.fn()
}));

jest.mock('csv-parser', () => jest.fn(() => ({})));

const path = require('path');
const report = require('./report');
const github = require('@actions/github');
const core = require('@actions/core');
const replaceComment = require('@aki77/actions-replace-comment');

let inputs = {"token":"demo"}

describe('input-helper tests', () => {

    beforeAll(() => {
        core.getInput.mockImplementation((name) => {
            return inputs[name];
        });
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    test('report generates coverage data correctly', async () => {
        const files = ['example/jacoco.csv'];
        const threshold = 90;
        const badgePath = 'example/coverage-badge.svg';
        
        await report(files, threshold, badgePath);
        
        // Verify that the report function called the necessary methods
        expect(core.info).toHaveBeenCalled();
        expect(replaceComment.default).toHaveBeenCalled();
    });
})