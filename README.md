# Jacoco Report Generator

A Github action that creates an aggregated Jacoco report as a Pull Request comment. Also, it helps you to validate coverage percentage. Now with support for git diff analysis and XML reports to calculate delta coverage!

## Usage

### Basic Usage with CSV Reports

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
          paths: reports/target/site/jacoco-aggregate/jacoco.csv
          min-coverage: 90
          token: ${{ secrets.GITHUB_TOKEN }}
```

### Using Git Diff to Focus on Changed Files

```yaml
name: Coverage Check with Git Diff
on:
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0  # Required to get git history for diff

      - name: Generate jacoco report
        run: mvn clean test verify

      - name: Check code coverage with git diff
        uses: prajithp13/jacoco-coverage-action@master
        with:
          paths: reports/target/site/jacoco-aggregate/jacoco.csv
          min-coverage: 90
          token: ${{ secrets.GITHUB_TOKEN }}
          use-git-diff: "true"
          base-ref: ${{ github.base_ref }}
```

### Using XML Reports for Delta Coverage Analysis

```yaml
name: Delta Coverage Analysis
on:
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0  # Required to get git history for diff

      - name: Checkout base branch for comparison
        run: |
          git fetch origin ${{ github.base_ref }}
          git checkout ${{ github.base_ref }}
          
      - name: Generate base coverage report
        run: mvn clean test verify
        
      - name: Save base coverage report
        run: cp target/site/jacoco/jacoco.xml jacoco-base.xml
        
      - name: Checkout PR branch
        run: git checkout ${{ github.head_ref }}
        
      - name: Generate PR coverage report
        run: mvn clean test verify
        
      - name: Check delta coverage
        uses: prajithp13/jacoco-coverage-action@master
        with:
          use-xml: "true"
          xml-path-before: jacoco-base.xml
          xml-path-after: target/site/jacoco/jacoco.xml
          min-coverage: 90
          token: ${{ secrets.GITHUB_TOKEN }}
          use-git-diff: "true"
```

### Inputs

| Name | Required | Description| Default |
|--|--|-- |--|
| paths | false  | Comma separated paths of the generated JaCoCo CSV files. Required when use-xml is false. | null |
| use-xml | false | Whether to use XML reports instead of CSV reports. | false |
| xml-path-before | false | Path to JaCoCo XML report before changes (for delta coverage calculation). | null |
| xml-path-after | false | Path to JaCoCo XML report after changes (for delta coverage calculation). Required when use-xml is true. | target/site/jacoco/jacoco.xml |
| min-coverage | false | The minimum coverage required to pass the PR. | 90 |
| token | true | Github personal access token to add comments to Pull Request. | null |
| report-url | false | URL path to the coverage report. This will be added in the PR comment. | null |
| use-git-diff | false | Whether to analyze coverage only for files changed in the current PR/commit. | false |
| git-diff-path | false | Path to a file containing git diff output (if not provided, will use GitHub API to get diff). | null |
| base-ref | false | Base reference for git diff comparison (e.g., 'main'). | null |
### Outputs

| Name | Description |
|---|---|
| `total-coverage` | The overall coverage percentage. |
| `lines-covered` | The total number of lines covered by tests. |
| `lines-missed` | The total number of lines missed by tests. |
| `total-lines` | The total number of lines in the project. |