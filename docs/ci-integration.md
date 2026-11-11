# CI Integration

`sstr` is designed to run in CI. This page shows ready-to-use configurations.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All tests passed. |
| `1` | Fatal error (config, connection, assertion deployment, etc.). |
| `2` | At least one test failed. |

Use these to fail the CI job appropriately.

## Report formats

### JUnit XML

Most CI systems understand JUnit XML:

```bash
sstr run --env ci --report-type junit --no-color > report.xml
```

### JSON

For custom tooling:

```bash
sstr run --env ci --report-type json --no-color > report.json
```

Progress messages go to `stderr` for `json` and `junit`, so `stdout` stays parseable.

## GitHub Actions

```yaml
name: SQL Tests

on: [push, pull_request]

jobs:
  sql-tests:
    runs-on: ubuntu-latest
    services:
      mssql:
        image: mcr.microsoft.com/mssql/server:2022-latest
        env:
          ACCEPT_EULA: "Y"
          SA_PASSWORD: "YourStrong!Passw0rd"
        ports:
          - 1433:1433
        options: >-
          --health-cmd "/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P YourStrong!Passw0rd -Q 'SELECT 1' -C"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install sqlcmd
        run: |
          sudo apt-get update
          sudo apt-get install -y sqlcmd

      - name: Install dependencies
        run: npm ci

      - name: Run SQL tests
        env:
          SQLSERVER_HOST: localhost
          SQLSERVER_USER: sa
          SQLSERVER_PASSWORD: YourStrong!Passw0rd
        run: |
          sstr run --env ci --report-type junit --no-color > report.xml

      - name: Upload JUnit report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: sql-test-report
          path: report.xml
```

`sstr.config.ci.json` (gitignored, or generated from secrets):

```json
{
  "connection": {
    "server": "localhost,1433",
    "trustedConnection": false,
    "username": "sa",
    "password": "YourStrong!Passw0rd",
    "trustServerCertificate": true
  },
  "testDb": "ci_test_db",
  "backupPath": "/var/opt/mssql/backups"
}
```

> The `backupPath` must be writable by the SQL Server service inside the container. `/var/opt/mssql/backups` is a safe default for the official image.

## GitLab CI

```yaml
stages:
  - test

sql-tests:
  stage: test
  image: node:20
  services:
    - name: mcr.microsoft.com/mssql/server:2022-latest
      alias: mssql
      variables:
        ACCEPT_EULA: "Y"
        SA_PASSWORD: "YourStrong!Passw0rd"
  variables:
    SQLSERVER_HOST: mssql
    SQLSERVER_USER: sa
    SQLSERVER_PASSWORD: "YourStrong!Passw0rd"
  before_script:
    - apt-get update && apt-get install -y curl apt-transport-https
    - curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
    - curl https://packages.microsoft.com/config/debian/12/prod.list > /etc/apt/sources.list.d/mssql-release.list
    - apt-get update && ACCEPT_EULA=Y apt-get install -y sqlcmd
    - npm ci
  script:
    - sstr run --env ci --report-type junit --no-color > report.xml
  artifacts:
    when: always
    reports:
      junit: report.xml
```

## Azure Pipelines

```yaml
trigger:
  - main

pool:
  vmImage: ubuntu-latest

services:
  mssql:
    image: mcr.microsoft.com/mssql/server:2022-latest
    env:
      ACCEPT_EULA: "Y"
      SA_PASSWORD: "YourStrong!Passw0rd"
    ports:
      - 1433:1433

steps:
  - task: UseNode@1
    inputs:
      version: '20'

  - script: |
      sudo apt-get update
      sudo apt-get install -y sqlcmd
    displayName: Install sqlcmd

  - script: npm ci
    displayName: Install dependencies

  - script: |
      sstr run --env ci --report-type junit --no-color > $(Build.ArtifactStagingDirectory)/report.xml
    displayName: Run SQL tests

  - task: PublishTestResults@2
    condition: always()
    inputs:
      testResultsFormat: JUnit
      testResultsFiles: '$(Build.ArtifactStagingDirectory)/report.xml'
```

## Pre-flight connection check

If you want to fail fast with a clear message when the connection is misconfigured:

```bash
sstr connect --env ci
sstr run --env ci
```

`sstr connect` exits with `1` if the connection fails, so the run is aborted before any test database is created.