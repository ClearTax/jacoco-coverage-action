// Mock fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn()
}));

// Mock core module
jest.mock('@actions/core', () => ({
  warning: jest.fn(),
  info: jest.fn()
}));

const fs = require('fs');
const core = require('@actions/core');
const { parseXmlReport, extractCoverageFromXml, formatCoverageData } = require('./xml-parser');

describe('xml-parser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('parseXmlReport', () => {
    test('should parse a valid XML report', async () => {
      // Mock XML data
      const mockXml = `
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <report name="JaCoCo">
          <package name="com.example">
            <class name="Class1">
              <method name="method1">
                <counter type="INSTRUCTION" missed="0" covered="10"/>
                <counter type="LINE" missed="0" covered="2"/>
                <counter type="BRANCH" missed="0" covered="2"/>
              </method>
              <line nr="10" mi="0" ci="5" mb="0" cb="0"/>
              <line nr="11" mi="0" ci="5" mb="0" cb="2"/>
              <counter type="INSTRUCTION" missed="0" covered="10"/>
              <counter type="LINE" missed="0" covered="2"/>
              <counter type="BRANCH" missed="0" covered="2"/>
            </class>
          </package>
        </report>
      `;
      
      fs.readFileSync.mockReturnValue(mockXml);
      
      const result = await parseXmlReport('coverage.xml');
      
      expect(fs.readFileSync).toHaveBeenCalledWith('coverage.xml', 'utf8');
      expect(result).toHaveProperty('report');
      expect(result.report).toHaveProperty('package');
      expect(result.report.package).toHaveProperty('class');
    });
    
    test('should handle errors gracefully', async () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      
      const result = await parseXmlReport('coverage.xml');
      
      expect(core.warning).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
  
  describe('extractCoverageFromXml', () => {
    test('should extract coverage data from XML', async () => {
      // Mock XML data
      const mockXml = `
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <report name="JaCoCo">
          <package name="com.example">
            <class name="Class1">
              <method name="method1">
                <counter type="INSTRUCTION" missed="0" covered="10"/>
                <counter type="LINE" missed="0" covered="2"/>
                <counter type="BRANCH" missed="0" covered="2"/>
              </method>
              <line nr="10" mi="0" ci="5" mb="0" cb="0"/>
              <line nr="11" mi="0" ci="5" mb="0" cb="2"/>
              <counter type="INSTRUCTION" missed="0" covered="10"/>
              <counter type="LINE" missed="0" covered="2"/>
              <counter type="BRANCH" missed="0" covered="2"/>
            </class>
          </package>
        </report>
      `;
      
      fs.readFileSync.mockReturnValue(mockXml);
      
      const result = await extractCoverageFromXml('coverage.xml');
      
      // Check if the result has the expected class
      expect(Object.keys(result)).toContain('com.example.Class1');
      
      // Check properties
      const classData = result['com.example.Class1'];
      expect(classData).toHaveProperty('line_covered', 2);
      expect(classData).toHaveProperty('line_missed', 0);
      expect(classData.coveredLines).toBeInstanceOf(Set);
      expect(classData.coveredLines.has(10)).toBe(true);
      expect(classData.coveredLines.has(11)).toBe(true);
    });
    
    test('should handle invalid XML gracefully', async () => {
      fs.readFileSync.mockReturnValue('invalid xml');
      
      const result = await extractCoverageFromXml('coverage.xml');
      
      expect(core.warning).toHaveBeenCalled();
      expect(result).toEqual({});
    });
  });
  
  describe('formatCoverageData', () => {
    test('should format coverage data correctly', () => {
      const coverageData = {
        'com.example.Class1': {
          line_covered: 8,
          line_missed: 2,
          branch_covered: 4,
          branch_missed: 2,
          coveredLines: new Set([1, 2, 3, 4, 5, 6, 7, 8]),
          missedLines: new Set([9, 10])
        }
      };
      
      const result = formatCoverageData(coverageData);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('component', 'com.example.Class1');
      expect(result[0]).toHaveProperty('line_percent', 80);
      expect(result[0]).toHaveProperty('line_total', 10);
      expect(result[0]).toHaveProperty('line_covered', 8);
      expect(result[0]).toHaveProperty('line_missed', 2);
      expect(result[0]).toHaveProperty('branch_percent', 66.66666666666666);
      expect(result[0]).toHaveProperty('branch_total', 6);
      expect(result[0]).toHaveProperty('branch_covered', 4);
      expect(result[0]).toHaveProperty('branch_missed', 2);
    });
    
    test('should handle empty coverage data', () => {
      const result = formatCoverageData({});
      
      expect(result).toEqual([]);
    });
  });
});