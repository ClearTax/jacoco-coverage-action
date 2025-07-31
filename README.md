# Jacoco Report Generator

A Github action that creates an aggregated Jacoco report as a Pull Request comment. It helps you validate overall coverage percentage and also provides coverage metrics for changed lines in your PR. The action now includes line-specific coverage analysis that shows exactly which changed lines are covered by tests and which are not.

## Usage

```yaml
name: Coverage Check
on:
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Generate jacoco report 
        run: mvn clean test verify

      - name: Check code coverage
        uses: prajithp13/jacoco-coverage-action@master
        with:
          paths: reports/target/site/jacoco-aggregate/jacoco.xml
          min-coverage: 90
          token: ${{ secrets.GITHUB_TOKEN }}
          base-ref: main
```

### Inputs

| Name | Required | Description| Default |
|--|--|-- |--|
| paths | true  | Comma separated paths of the generated JaCoCo report files (XML or CSV format). | coverage/coverage.xml |
| min-coverage | false | The minimum coverage required to pass the PR | 90 |
| token | true | Github personal access token to add comments to Pull Request | null |
| report-url | false | URL path to the coverage report. This will be added in the PR comment | null |
| base-ref | false | Base branch to compare against for diff coverage (default: master) | master |
| source-dir | false | Source code directory to match with JaCoCo report paths | src |
| badgePath | false | Path where coverage badges will be generated | null |
| use-git-diff | false | Whether to use git diff for line-specific coverage analysis | false |
| use-xml | false | Whether to use XML format for JaCoCo reports | false |
### Outputs

| Name | Description |
|---|---|
| `total-coverage` | The overall coverage percentage. |
| `lines-covered` | The total number of lines covered by tests. |
| `lines-missed` | The total number of lines missed by tests. |
| `total-lines` | The total number of lines in the project. |
| `diff-coverage` | Coverage percentage for changed lines in the PR. |
| `diff-lines-covered` | Number of changed lines covered by tests. |
| `diff-lines-missed` | Number of changed lines missed by tests. |
| `diff-total-lines` | Total number of changed lines in the PR. |
| `line-specific-coverage` | Coverage percentage for specific changed lines identified by git diff. |
| `line-specific-covered` | Number of specific changed lines covered by tests. |
| `line-specific-missed` | Number of specific changed lines missed by tests. |
| `line-specific-total` | Total number of specific changed lines identified by git diff. |

## Features

### Overall Coverage Report

The action generates a comprehensive coverage report for your entire codebase, showing coverage metrics for each component and the overall project.

### Changed Lines Coverage

The action also analyzes the git diff between your PR and the base branch to calculate coverage specifically for the lines you've changed. This helps you ensure that your new code is properly tested.

### Line-Specific Coverage Analysis

The action now provides detailed line-specific coverage analysis by:
1. Getting the git diff of the current branch against the base branch
2. Identifying exactly which lines have been changed (x.y format where x is the file and y is the line number)
3. Checking if each changed line is covered in the JaCoCo report
4. Calculating coverage percentage based on covered/missed lines

For example, if file `ImpersonationServiceV2.java` has line 42 changed, the action will check if line 42 is covered in the JaCoCo report. If it's covered, that line contributes 100% to the coverage; if not, it contributes 0%. The overall percentage is calculated based on how many of the changed lines are covered.

This gives you precise visibility into which specific lines of your changes need additional test coverage.

#### How It Works

The action:
1. Extracts line coverage information from the JaCoCo XML report
2. Gets the git diff to identify changed lines
3. For each changed line, checks if it's covered in the JaCoCo report
4. Calculates the percentage: (covered_lines / total_changed_lines) * 100

The report will show you exactly which lines are covered and which are not, allowing you to focus your testing efforts on uncovered code.

### Example Usage with Line-Specific Coverage

To enable line-specific coverage analysis, set the `use-git-diff` and `use-xml` inputs to `true`:

```yaml
- name: Check code coverage
  uses: prajithp13/jacoco-coverage-action@master
  with:
    paths: reports/target/site/jacoco-aggregate/jacoco.xml
    min-coverage: 90
    token: ${{ secrets.GITHUB_TOKEN }}
    base-ref: main
    use-git-diff: true
    use-xml: true
```

This will:
1. Get the git diff between your current branch and the base branch
2. Parse the JaCoCo XML report to extract line coverage information
3. Match the changed lines with their coverage status
4. Generate a report showing which lines are covered and which are not

Example output in the PR comment:

```
Line-Specific Coverage Details

This PR changes 10 specific lines of code.
- 7 lines are covered by tests (70.00%)
- 3 lines are not covered by tests

Changed Files Coverage Details

| File | Changed Lines | Covered | Coverage % |
| ---- | ------------ | ------- | ---------- |
| src/main/java/com/example/ImpersonationServiceV2.java | 10 | 7 | 70.00% |
```

### Coverage Badges

If you specify a `badgePath`, the action will generate SVG badges for both overall coverage and diff coverage that you can include in your README or documentation.

### PR Comments

The action automatically adds a comment to your PR with the coverage report, making it easy to see coverage metrics right in your PR discussion.