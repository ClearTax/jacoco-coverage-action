# Jacoco Report Generator

A Github action that creates an aggregated Jacoco report as a Pull Request comment. Also, it helps you to validate coverage percentage.

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
          paths: reports/target/site/jacoco-aggregate/jacoco.csv
          min-coverage: 90
          token: ${{ secrets.GITHUB_TOKEN }}
```

### Inputs

| Name | Required | Description| Default |
|--|--|-- |--|
| paths | true  | comma separated paths of the generated jacoco csv files. | null |
| min-coverage | false | The minimum coverage required to pass the PR | 90 |
| token | true | Github personal acess token to add comments to Pull Request | null
### Outputs

| Name | Description |
|---|---|
| `total-coverage` | The overall coverage percentage. |
| `lines-covered` | The total number of lines covered by tests. |
| `lines-missed` | The total number of lines missed by tests. |
| `total-lines` | The total number of lines in the project. |