// Mock the core module
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  setOutput: jest.fn()
}));

// Mock the git-diff module
jest.mock('./git-diff', () => ({
  getGitDiff: jest.fn(),
  mapFilePaths: jest.fn()
}));

// Mock fs module
jest.mock('fs', () => ({
  createReadStream: jest.fn(() => ({
    pipe: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(function(event, callback) {
      if (event === 'data') {
        callback(mockCsvData[0]);
        callback(mockCsvData[1]);
      }
      if (event === 'end') {
        callback();
      }
      return this;
    })
  })),
  readFileSync: jest.fn().mockReturnValue(mockXmlData)
}));

// Mock csv-parser
jest.mock('csv-parser', () => jest.fn(() => ({})));

// Mock xml2js
jest.mock('xml2js', () => ({
  Parser: jest.fn().mockImplementation(() => ({
    parseStringPromise: jest.fn().mockResolvedValue(mockParsedXml)
  }))
}));

// Mock data
const mockCsvData = [
  {
    GROUP: 'com.example.Class1',
    LINE: '10',
    LINE_COVERED: '1',
    LINE_MISSED: '0',
    INSTRUCTION_COVERED: '5'
  },
  {
    GROUP: 'com.example.Class1',
    LINE: '20',
    LINE_COVERED: '0',
    LINE_MISSED: '1',
    INSTRUCTION_COVERED: '0'
  }
];

// Mock XML data
const mockXmlData = `
<report>
  <package name="com.example">
    <sourcefile name="Class1.java">
      <line nr="10" mi="0" ci="5" mb="0" cb="0"/>
      <line nr="20" mi="3" ci="0" mb="0" cb="0"/>
      <line nr="40" mi="0" ci="2" mb="0" cb="0"/>
    </sourcefile>
  </package>
</report>
`;

const mockParsedXml = {
  report: {
    package: {
      $: { name: 'com.example' },
      sourcefile: {
        $: { name: 'Class1.java' },
        line: [
          { $: { nr: '10', mi: '0', ci: '5', mb: '0', cb: '0' } },
          { $: { nr: '20', mi: '3', ci: '0', mb: '0', cb: '0' } },
          { $: { nr: '40', mi: '0', ci: '2', mb: '0', cb: '0' } }
        ]
      }
    }
  }
};

const mockChangedFiles = {
  'src/main/java/com/example/Class1.java': [10, 20, 30]
};

const mockMappedFiles = {
  'com.example.Class1': [10, 20, 30]
};

// Import the module under test
const { calculateDiffCoverage, calculateLineSpecificCoverage } = require('./diff-coverage');
const { getGitDiff, mapFilePaths } = require('./git-diff');
const core = require('@actions/core');

describe('diff-coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    core.getInput.mockImplementation((name) => {
      if (name === 'base-ref') return 'master';
      if (name === 'source-dir') return 'src/main/java';
      return '';
    });
    
    getGitDiff.mockResolvedValue(mockChangedFiles);
    mapFilePaths.mockReturnValue(mockMappedFiles);
  });
  
  test('calculateDiffCoverage should calculate coverage for changed lines', async () => {
    const result = await calculateDiffCoverage(['coverage.csv']);
    
    // Verify git diff was called
    expect(getGitDiff).toHaveBeenCalledWith('master');
    
    // Verify file paths were mapped
    expect(mapFilePaths).toHaveBeenCalled();
    
    // Verify coverage calculation
    expect(result).toEqual({
      diff_line_percent: expect.any(Number),
      diff_line_covered: expect.any(Number),
      diff_line_missed: expect.any(Number),
      diff_line_total: expect.any(Number)
    });
    
    // In our mock data, we have 3 changed lines (10, 20, 30)
    // Line 10 is covered, line 20 is not covered, line 30 is not in the report (counted as not covered)
    // So we expect 1 covered line and 2 missed lines
    expect(result.diff_line_covered).toBe(1);
    expect(result.diff_line_missed).toBe(2);
    expect(result.diff_line_total).toBe(3);
    expect(result.diff_line_percent).toBe(33.33333333333333);
  });
  
  test('calculateDiffCoverage should handle errors gracefully', async () => {
    // Setup mock to throw an error
    getGitDiff.mockRejectedValue(new Error('Test error'));
    
    const result = await calculateDiffCoverage(['coverage.csv']);
    
    // Verify warning was logged
    expect(core.warning).toHaveBeenCalled();
    
    // Verify default values are returned
    expect(result).toEqual({
      diff_line_percent: 0,
      diff_line_covered: 0,
      diff_line_missed: 0,
      diff_line_total: 0
    });
  });
  
  describe('calculateLineSpecificCoverage', () => {
    test('should calculate line-specific coverage correctly', async () => {
      const result = await calculateLineSpecificCoverage('jacoco.xml');
      
      // Verify git diff was called
      expect(getGitDiff).toHaveBeenCalledWith('master');
      
      // Verify coverage calculation
      expect(result).toEqual({
        totalChangedLines: expect.any(Number),
        coveredChangedLines: expect.any(Number),
        missedChangedLines: expect.any(Number),
        coveragePercentage: expect.any(Number),
        fileDetails: expect.any(Object)
      });
      
      // In our mock data, we have 3 changed lines (10, 20, 30)
      // Line 10 is covered, line 20 is not covered, line 30 is not in the report (counted as not covered)
      // So we expect 1 covered line and 2 missed lines
      expect(result.coveredChangedLines).toBe(1);
      expect(result.missedChangedLines).toBe(2);
      expect(result.totalChangedLines).toBe(3);
      expect(result.coveragePercentage).toBe(33.33333333333333);
      
      // Check file details
      expect(result.fileDetails['src/main/java/com/example/Class1.java']).toBeDefined();
      expect(result.fileDetails['src/main/java/com/example/Class1.java'].coveredChangedLines).toBe(1);
      expect(result.fileDetails['src/main/java/com/example/Class1.java'].missedChangedLines).toBe(2);
      
      // Check line details
      const lineDetails = result.fileDetails['src/main/java/com/example/Class1.java'].lineDetails;
      expect(lineDetails).toHaveLength(3);
      expect(lineDetails[0].line).toBe(10);
      expect(lineDetails[0].covered).toBe(true);
      expect(lineDetails[1].line).toBe(20);
      expect(lineDetails[1].covered).toBe(false);
      expect(lineDetails[2].line).toBe(30);
      expect(lineDetails[2].covered).toBe(false);
    });
    
    test('should handle errors gracefully', async () => {
      // Setup mock to throw an error
      getGitDiff.mockRejectedValue(new Error('Test error'));
      
      const result = await calculateLineSpecificCoverage('jacoco.xml');
      
      // Verify warning was logged
      expect(core.warning).toHaveBeenCalled();
      
      // Verify default values are returned
      expect(result).toEqual({
        totalChangedLines: 0,
        coveredChangedLines: 0,
        missedChangedLines: 0,
        coveragePercentage: 0,
        fileDetails: {}
      });
    });
  });
});