const readme = `# sql-server-test-runner

A lightweight SQL script test runner powered by \`sqlcmd\`. Write your unit tests as stored procedures inside \`.sql\` files, run them against a temporary database, and get a clean pass/fail report in your terminal or CI pipeline.

- Works as a CLI (\`sstr\`) and as a Node.js module.
- Discovers test files with a regex (\`testRegex\`).
- Supports per-environment config files (\`sstr.config.{env}.json\`).
- Automatically deploys assertion stored procedures (\`Assert.*\`) before running your tests.
- Creates, backs up, restores, and drops the test database automatically.
- Full filegroup-aware backup/restore.
- Reports per-file and per-procedure results, with detailed error messages.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Assertion Procedures](#assertion-procedures)
- [Writing Tests](#writing-tests)
- [CLI Usage](#cli-usage)
- [Programmatic API](#programmatic-api)
- [Database Lifecycle](#database-lifecycle)
- [Backup and Restore](#backup-and-restore)
- [CI Integration](#ci-integration)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Installation

### Requirements

- Node.js >= 18
- \`sqlcmd\` available on \`PATH\` (comes with SQL Server Command Line Utilities / SSMS / mssql-tools)

### Global install

\`\`\`bash
npm install -g sql-server-test-runner
\`\`\`

### Project-local install

\`\`\`bash
npm install --save-dev sql-server-test-runner
\`\`\`

Then run via \`npx sstr\` or add an npm script:

\`\`\`json
{
  "scripts": {
    "test:sql": "sstr --env development"
  }
}
\`\`\`

---

## Quick Start

1. Create \`sstr.config.json\` in your project root:

\`\`\`json
{
  "connection": {
    "server": "localhost",
    "trustedConnection": true,
    "trustServerCertificate": true
  },
  "loginTimeout": 10,
  "testDb": "my_test_db",
  "backupPath": "C:/sstr-backups",
  "cleanupBackup": true,
  "testRegex": "(tests/.*|(\\\\.|/)(test|spec))\\\\.sql$",
  "testMatch": "^test_",
  "assertSchema": "Assert"
}
\`\`\`

2. Create a test file \`tests/sum.test.sql\`:

\`\`\`sql
create or alter proc test_sum_should_return_zero_for_null_values
as
begin
    set nocount on;
    declare @a int;
    declare @b int;
    declare @result int;

    set @result = dbo.Sum(@a, @b);

    exec Assert.Equals @result, 0;
end
go

create or alter proc test_sum_should_return_sum_of_values
as
begin
    set nocount on;
    declare @a int = 10;
    declare @b int = 20;
    declare @result int;

    set @result = dbo.Sum(@a, @b);

    exec Assert.Equals @result, 30;
end
go
\`\`\`

3. Run:

\`\`\`bash
npx sstr
\`\`\`

You should see a report similar to:

\`\`\`
==============================================
 Test Report
==============================================
Test script files: 1

Per-file details:
  - C:/project/tests/sum.test.sql
      procedures: 2, pass: 2, fail: 0
----------------------------------------------
Total: 2, pass: 2, fail: 0
==============================================
\`\`\`

---

## Configuration

The tool looks for \`sstr.config.json\` in the current working directory. You can also provide an environment-specific file \`sstr.config.{env}.json\` which is shallow-merged on top of the base config for the keys \`connection\`, \`scripts\`, and \`sqlCmdOptions\`.

This allows you to keep secrets out of your repository:

\`\`\`text
sstr.config.json              # shared settings, committed
sstr.config.development.json  # local secrets, gitignored
\`\`\`

\`\`\`bash
npx sstr --env development
\`\`\`

### Configuration Reference

#### \`connection\` (required)

| Key | Type | sqlcmd | Description |
|---|---|---|---|
| \`server\` | string | \`-S\` | **Required.** SQL Server host (e.g. \`localhost\`, \`host,1433\`). |
| \`username\` | string | \`-U\` | SQL login. Defaults to \`sa\` when not using trusted connection. |
| \`password\` | string | \`-P\` | SQL password. |
| \`encrypt\` | boolean | \`-N\` | Encrypt the connection. |
| \`trustedConnection\` | boolean | \`-E\` | Use Windows authentication. When true, \`username\`/\`password\` are ignored. |
| \`trustServerCertificate\` | boolean | \`-C\` | Trust the server certificate. |

#### Top-level options

| Key | Type | Default | Description |
|---|---|---|---|
| \`loginTimeout\` | number | — | Connection timeout in seconds (\`-l\`). |
| \`queryTimeout\` | number | — | Query timeout in seconds (\`-t\`). |
| \`testDb\` | string | \`sstr_testdb\` | Test database name. |
| \`backupPath\` | string | OS temp dir | Directory for \`.bak\` files and restored data files. Must be writable by SQL Server. |
| \`cleanupBackup\` | boolean | \`false\` | If true, the \`.bak\` file is deleted after the run. |
| \`testRegex\` | string | \`(tests/.*\|(\\\\.\|/)(test\|spec))\\\\.sql$\` | Regex used to discover test files (matched against the relative path). |
| \`testMatch\` | string | \`^test.*$\` | Regex used to filter test procedures by name (matched against the bare procedure name). Ignored for procedures inside \`testSchema\`. |
| \`testSchema\` | string | — | If set, **all** procedures in this schema are treated as tests, regardless of \`testMatch\`. |
| \`assertSchema\` | string | \`Assert\` | Schema where assertion procedures are installed. Procedures in this schema are excluded from test discovery. |

#### \`scripts\`

All optional. Each value is a path to a \`.sql\` file (relative to \`cwd\`).

| Key | When it runs |
|---|---|
| \`warmUp\` | Once, before any test file is executed. |
| \`coolDown\` | Once, after all test files have been executed. |
| \`preScript\` | Before each test file. |
| \`postScript\` | After each test file. |

If a configured script path does not exist, the run aborts with an error.

#### \`sqlCmdOptions\`

All optional. Every key maps to a \`sqlcmd\` command-line switch.

| Key | sqlcmd | Description |
|---|---|---|
| \`hostName\` | \`-H\` | Workstation name. |
| \`packetSize\` | \`-a\` | Network packet size. |
| \`enableQuotedIdentifiers\` | \`-I\` | Enable quoted identifiers. |
| \`removeTrailingSpaces\` | \`-W\` | Trim trailing spaces from output. |
| \`controlCharBehavior\` | \`-k\` / \`-k1\` / \`-k2\` | \`remove\`, \`replace1\`, \`replace2\`. |
| \`unicodeOutput\` | \`-u\` | Unicode output. |
| \`useAzureActiveDirectory\` | \`-G\` | Azure AD authentication. |
| \`codePage\` | \`-f\` | Input/output code page. |
| \`hostNameInCertificate\` | \`-F\` | Hostname in certificate. |
| \`useClientRegionalSetting\` | \`-R\` | Use client regional settings. |
| \`applicationIntent\` | \`-K\` | \`ReadOnly\` or \`ReadWrite\`. |
| \`multiSubnetFailover\` | \`-M\` | Multi-subnet failover. |
| \`printRawErrorMessages\` | \`-j\` | Print raw error messages. |
| \`enableColumnEncryption\` | \`-g\` | Enable column encryption. |
| \`serverCertificatePath\` | \`-J\` | Server certificate path. |
| \`vars\` | \`-v\` | Object of \`key: value\` pairs passed as \`-v key=value\`. |
| \`ignoreVars\` | \`-x\` | Ignore scripting variables. |
| \`disableCommands\` | \`-X\` | Disable commands. |
| \`disableCommandsAndExit\` | \`-X1\` | Disable commands and exit. |
| \`batchTerminator\` | \`-c\` | Batch terminator (default \`GO\`). |
| \`errorLevel\` | \`-m\` | Minimum error level to report. |
| \`errorSeverityLevel\` | \`-V\` | Minimum error severity. |
| \`varLengthTypeDisplayWidth\` | \`-y\` | Display width for variable-length types. |
| \`fixedLengthTypeDisplayWidth\` | \`-Y\` | Display width for fixed-length types. |
| \`performanceStatistics\` | \`-p1\` | Print performance statistics. |

---

## How It Works

1. Load \`sstr.config.json\` (and \`sstr.config.{env}.json\` if \`--env\` is given), merge them, and validate the result.
2. Verify the connection using \`sqlcmd\` (\`SELECT 1\`). Abort if it fails.
3. Determine the test database:
   - If \`testDb\` is not set, use \`sstr_testdb\`. If it already exists, abort with an error.
   - Otherwise create it, or if the configured \`testDb\` already exists, back it up and restore under a random name (\`{testDb}_sstr_{random}\`).
4. Deploy the assertion procedures (\`Assert.*\` by default) inside the test database.
5. Discover test files via \`testRegex\`.
6. Run \`warmUp\` (once), then for each test file:
   - Run \`preScript\` (if set).
   - Execute the test file. **If the entire file fails, it is reported and its procedures are skipped.**
   - Otherwise, discover new stored procedures and run the ones matching \`testMatch\` — or all procedures in \`testSchema\` if set. Procedures in \`assertSchema\` are always excluded.
   - Run \`postScript\` (if set).
7. Run \`coolDown\` (once).
8. Print the report.
9. Drop the test database. If \`cleanupBackup\` is true, delete the \`.bak\` file.

---

## Assertion Procedures

The following procedures are installed in the schema configured by \`assertSchema\` (default \`Assert\`) before any test runs.

| Procedure | Signature | Description |
|---|---|---|
| \`IsTrue\` | \`@a bit\` | Fails if \`@a\` is null or 0. |
| \`IsFalse\` | \`@a bit\` | Fails if \`@a\` is null or non-zero. |
| \`IsNull\` | \`@a sql_variant\` | Fails if \`@a\` is not null. |
| \`IsNotNull\` | \`@a sql_variant\` | Fails if \`@a\` is null. |
| \`IsNumeric\` | \`@a sql_variant\` | Fails if \`@a\` is not numeric. |
| \`IsEmpty\` | \`@a sql_variant\` | Fails if \`@a\` is null or non-empty string. |
| \`Equals\` | \`@a, @b sql_variant\` | Fails if values are not equal. |
| \`NotEquals\` | \`@a, @b sql_variant\` | Fails if values are equal. |
| \`IsGT\` | \`@a, @b sql_variant\` | Fails if \`@a\` is not greater than \`@b\`. |
| \`IsGTE\` | \`@a, @b sql_variant\` | Fails if \`@a\` is not greater than or equal to \`@b\`. |
| \`IsLT\` | \`@a, @b sql_variant\` | Fails if \`@a\` is not less than \`@b\`. |
| \`IsLTE\` | \`@a, @b sql_variant\` | Fails if \`@a\` is not less than or equal to \`@b\`. |
| \`IsBetween\` | \`@a, @from, @to sql_variant\` | Fails if \`@a\` is not between \`@from\` and \`@to\`. |
| \`NotBetween\` | \`@a, @from, @to sql_variant\` | Fails if \`@a\` is between \`@from\` and \`@to\`. |
| \`TableExists\` | \`@table sysname\` | Fails if the table does not exist. |
| \`TableNotExists\` | \`@table sysname\` | Fails if the table exists. |
| \`ColumnExists\` | \`@table, @column sysname\` | Fails if the column does not exist on the table. |
| \`ColumnNotExists\` | \`@table, @column sysname\` | Fails if the column exists on the table. |
| \`ForeignKeyExists\` | \`@table, @fkName sysname\` | Fails if the foreign key does not exist on the table. |
| \`ForeignKeyNotExists\` | \`@table, @fkName sysname\` | Fails if the foreign key exists on the table. |
| \`DefaultExists\` | \`@table, @column sysname\` | Fails if the column has no default constraint. |
| \`DefaultNotExists\` | \`@table, @column sysname\` | Fails if the column has a default constraint. |
| \`RecordExists\` | \`@table sysname, @json nvarchar(max)\` | Fails if no row matches the JSON filter. |
| \`RecordNotExists\` | \`@table sysname, @json nvarchar(max)\` | Fails if a row matches the JSON filter. |

### Record assertions and JSON filters

\`@json\` is an object whose keys are column names and whose values are compared for equality. All conditions are ANDed. A JSON \`null\` becomes an \`IS NULL\` check.

\`\`\`sql
exec Assert.RecordExists    'dbo.Users', N'{ "id": 10, "name": "Alice" }';
exec Assert.RecordNotExists 'dbo.Users', N'{ "id": 99 }';
exec Assert.RecordExists    'dbo.Users', N'{ "deletedAt": null }';
\`\`\`

For an empty filter (\`N'{}'\`), every row matches.

---

## Writing Tests

A test file is a plain \`.sql\` script that creates one or more stored procedures. Each procedure is a test.

- Procedures must be named so that their bare name matches \`testMatch\` (or live in \`testSchema\`).
- Procedures should have no parameters. If they do, all parameters are passed as \`NULL\`.
- A test fails if the procedure execution returns a non-zero exit code (\`sqlcmd -b\` + \`RAISERROR(..., 16, 1)\`).
- Use the assertion procedures to express expectations.

Example \`tests/sum.test.sql\`:

\`\`\`sql
create or alter proc test_sum_should_return_zero_for_null_values
as
begin
    set nocount on;
    declare @a int;
    declare @b int;
    declare @result int;
    set @result = dbo.Sum(@a, @b);
    exec Assert.Equals @result, 0;
end
go

create or alter proc test_sum_should_return_sum_of_values
as
begin
    set nocount on;
    declare @a int = 10;
    declare @b int = 20;
    declare @result int;
    set @result = dbo.Sum(@a, @b);
    exec Assert.Equals @result, 30;
end
go
\`\`\`

If a test file fails during its own execution, the tool reports it as \`(entire script)\` and **skips all procedures** in that file.

---

## CLI Usage

\`\`\`text
sstr [--env <name>] [--cwd <path>] [--help]
\`\`\`

| Option | Description |
|---|---|
| \`--env, -e <name>\` | Merge \`sstr.config.{name}.json\` on top of \`sstr.config.json\`. |
| \`--cwd, -d <path>\` | Working directory (defaults to the current directory). |
| \`--help, -h\` | Show help. |

Exit codes:

| Code | Meaning |
|---|---|
| \`0\` | All tests passed. |
| \`1\` | A fatal error occurred (config, connection, deployment, etc.). |
| \`2\` | At least one test failed. |

---

## Programmatic API

\`\`\`js
import { test } from 'sql-server-test-runner';

const reporter = await test({
  cwd: process.cwd(),
  env: 'development',
});

if (reporter.hasFailures) {
  process.exit(2);
}
\`\`\`

Lower-level API:

\`\`\`js
import { loadConfig, validateConfig, run } from 'sql-server-test-runner';

const cfg = await loadConfig(process.cwd(), 'development');
validateConfig(cfg);
const reporter = await run(cfg, { cwd: process.cwd() });
\`\`\`

The \`reporter\` object exposes:

- \`reporter.results\` — array of \`{ file, procedure, passed, error }\`.
- \`reporter.files\` — list of discovered test files.
- \`reporter.skippedFiles\` — files that failed during script execution.
- \`reporter.hasFailures\` — boolean shortcut.
- \`reporter.print()\` — print the human-readable report.

---

## Database Lifecycle

| Scenario | Behavior |
|---|---|
| \`testDb\` not set | Uses \`sstr_testdb\`. If it already exists, aborts. Otherwise creates it, runs tests, drops it. |
| \`testDb\` set, does not exist | Creates it, runs tests, drops it. |
| \`testDb\` set, exists | Backs it up, restores under \`{testDb}_sstr_{random}\`, runs tests, drops the restored copy. The original database is left untouched. |

The test database is always dropped in a \`finally\` block, even if the run fails midway.

---

## Backup and Restore

When the configured \`testDb\` already exists, the tool:

1. Takes a full backup (\`BACKUP DATABASE ... WITH COPY_ONLY\`) to \`backupPath\`.
2. Reads every physical file of the source database from \`sys.master_files\` — this includes **every filegroup** (primary, secondary, file streams, memory-optimized) plus the transaction log.
3. Restores under a new name with an explicit \`MOVE\` clause for every file, redirecting all data files to \`backupPath\`. SQL Server automatically recreates the filegroups, since every file in every filegroup is restored.

If \`cleanupBackup\` is \`true\`, the \`.bak\` file is deleted after the database is dropped (so that no file handle is held).

**Note:** \`backupPath\` must be a path that is writable by the SQL Server service, not just by the current user.

---

## CI Integration

\`\`\`yaml
# .github/workflows/sql-tests.yml
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
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install mssql-tools
        run: |
          sudo apt-get update
          sudo apt-get install -y mssql-tools18 unixodbc-dev
          echo "/opt/mssql-tools18/bin" >> $GITHUB_PATH
      - run: npm ci
      - run: npx sstr --env ci
\`\`\`

---

## Troubleshooting

### \`sqlcmd: command not found\`

Make sure \`sqlcmd\` is on \`PATH\`. On Windows it ships with SSMS; on Linux install \`mssql-tools18\`; on macOS use \`brew install mssql-tools\` or the Docker image.

### \`Login failed for user ...\`

- Check \`connection.server\`, \`connection.username\`, \`connection.password\`.
- If using Windows authentication (\`trustedConnection: true\`), the SQL Server must allow Windows logins.
- Increase \`loginTimeout\` if the server is slow.

### \`Database "sstr_testdb" already exists\`

Either drop \`sstr_testdb\` or set \`testDb\` to a different name. This is a safety guard: the default test database must not pre-exist.

### \`Cannot open backup device ...\`

The SQL Server service account cannot write to \`backupPath\`. Choose a directory that the service account can write to, or grant it permissions.

### Tests are discovered but never executed

- Check \`testMatch\` against the bare procedure name (e.g. \`test_sum_should_return_sum\`).
- Or put procedures in the schema named by \`testSchema\`.
- Procedures in \`assertSchema\` are always excluded.

### A test file fails but no procedures are run

This is expected: if the file itself fails, the tool reports \`(entire script)\` and skips its procedures. Fix the file's top-level statements (or its \`GO\` batches) first.

---

## License

MIT
`;

console.log(readme);
