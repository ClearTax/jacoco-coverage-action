# Jacoco Report Generator

A Github action that creates an aggregated Jacoco report as a Pull Request comment. It helps you validate overall coverage percentage and also provides coverage metrics for changed lines in your PR.

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

## Features

### Overall Coverage Report

The action generates a comprehensive coverage report for your entire codebase, showing coverage metrics for each component and the overall project.

### Changed Lines Coverage

The action also analyzes the git diff between your PR and the base branch to calculate coverage specifically for the lines you've changed. This helps you ensure that your new code is properly tested.

### Coverage Badges

If you specify a `badgePath`, the action will generate SVG badges for both overall coverage and diff coverage that you can include in your README or documentation.

### PR Comments

The action automatically adds a comment to your PR with the coverage report, making it easy to see coverage metrics right in your PR discussion.