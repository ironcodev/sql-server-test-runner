# sql-server-test-runner

A lightweight SQL script test runner powered by `sqlcmd`.

Write your unit tests as stored procedures inside individual `.sql` files, ask `sstr` to run them against an ad-hoc restored backup of your database, and get a clean pass/fail report in your terminal or CI pipeline.

- Works as a CLI (`sstr`) and as a Node.js module.
- Discovers test files with a regex (`testRegex`).
- Supports per-environment config files (`sstr.config.{env}.json`).
- Provides assertion stored procedures (`Assert.*`) to use in your unit test procedures.
- Creates, backs up, restores, and drops the test database automatically.
- Reports per-file and per-procedure results, with detailed error messages.

In Short:

- **CLI:** `sstr`
- **Config file:** `sstr.config.json`

## Requirements

- **Node.js >= 22** (LTS). Node 18 is end-of-life and is not supported.
- `sqlcmd` available on `PATH` (comes with SQL Server Command Line Utilities / SSMS / mssql-tools)

---

## Why Not tSQLt?

`tSQLt` is the de facto standard for SQL Server unit testing, and it is excellent. It is mature, feature-rich, and battle-tested. If your team already lives in the Visual Studio / SSDT ecosystem and needs advanced features like table mocking, tSQLt is a great choice.

But "standard" does not mean "the only reasonable choice." If you are a Node.js developer who just wants to write SQL tests without leaving your comfort zone, tSQLt may feel heavy. Here is where `sstr` genuinely differs.

### The honest comparison

| Concern | tSQLt | sstr |
|---|---|---|
| **Installation** | Requires enabling CLR, running `PrepareServer.sql` with `SA` permissions, and installing the framework into each development database. | `npm install -g sql-server-test-runner` plus a one-line `sqlcmd` install. Nothing to enable on the server. |
| **Server-side configuration** | CLR must be enabled. In some environments (Azure SQL, hardened servers) this is restricted or forbidden. | **Zero server-side configuration.** Only `sqlcmd` is required on the client. |
| **Ecosystem** | Deeply tied to Visual Studio, SSDT, and the .NET tooling ecosystem. | Pure Node.js. Install it, import it, or run it from any terminal. |
| **Learning curve** | Requires understanding CLR, test classes, `FakeTable`, and tSQLt conventions. | If you know T-SQL and `npm`, you already know how to use it. Write a stored procedure, run `sstr run`. |
| **Table mocking** | Full `FakeTable` support, which is powerful for isolating dependencies. | **Intentionally not included.** You provide a clean test database, seed data inside your test, and the tool rolls everything back. |
| **Set comparison** | `AssertEqualsTable` for comparing result sets. | Not included. Use `EXCEPT` in your test if you need it. |
| **Transaction isolation** | Automatic per-test rollback. | Automatic per-test rollback. Opt out per test with `transaction: false` or globally with `--no-transaction`. |
| **Per-test configuration** | Possible via tSQLt conventions, but not a first-class feature. | JSON file next to each test file: `transaction`, `logExecution`, `skip`, `timeout`, `preScript`, `postScript`, `throws`. |
| **Expected failures** | Possible but not a dedicated feature. | `throws: true` (any error) or `throws: <number>` (specific SQL Server error number). |
| **Per-test setup/teardown** | Possible via tSQLt helpers. | `preScript` / `postScript` in the per-test JSON file. |
| **Multiple test schemas** | Not a first-class concept. | `testSchema` accepts a comma-separated list. The `sstr` schema is always treated as a test schema. |
| **Built-in assertion set** | Full tSQLt assertion set. | 24 assertions including schema objects, foreign keys (composite), defaults (with value comparison), and JSON-filtered record checks. |
| **Reports** | Possible via custom scripts. | Built-in `console`, `json`, and `junit` reports. |
| **CI integration** | Possible, often via custom scripts. | `--report-type junit` drops straight into GitHub Actions, GitLab CI, Azure Pipelines, and any JUnit-compatible dashboard. |
| **Connection check** | Not a dedicated command. | `sstr connect` verifies the connection and prints server info. |
| **Cleanup** | Manual. | `sstr clean` removes leftover databases and `.bak` files, with `--dry-run`. |
| **Dependencies** | CLR, SSDT (usually), Visual Studio (usually). | `sqlcmd` only. |

### The philosophical difference

`tSQLt` tries to give you **everything**. That is its strength and its weight.

`sstr` tries to give you **just enough**. You bring a clean test database (or let the tool create one), write a plain T-SQL stored procedure that calls `Assert.Equals`, and you are done. No mocking framework, no CLR, no Visual Studio. If your test needs data, insert it inside the procedure. When the test finishes, the transaction rolls back and the database is clean for the next test.

This works because of a simple trade-off: **you provide a controlled environment, and the tool stays out of your way.**

### When you should still choose tSQLt

Be honest with yourself. If any of the following apply, use tSQLt instead:

- Your team already uses SSDT and Visual Studio for database development.
- You need `FakeTable` to test procedures against complex schemas with many foreign keys and constraints.
- You rely on `AssertEqualsTable` for set-based result comparisons.
- Your organization requires a proven, industry-standard framework with a long track record.

`sstr` is not trying to replace tSQLt in those scenarios. It is trying to serve the developer who would otherwise write **no SQL tests at all** because the barrier felt too high.

### The one-line install

The dependency on `sqlcmd` is not a burden. Microsoft ships a standalone, cross-platform `sqlcmd` (Go) that installs in seconds:

```bash
# Windows
winget install sqlcmd

# macOS
brew install sqlcmd

# Ubuntu / Debian
apt-get install sqlcmd
```

No SQL Server installation required on your machine. No Visual Studio. No CLR.

---

## Installation

```bash
npm install -g sql-server-test-runner
```

Or as a dev dependency:

```bash
npm install --save-dev sql-server-test-runner
```

---

## Quick Start

1. Create `sstr.config.json` in your project root:

```bash
sstr init
```

output:
```json
{
  "connection": {
    "server": "localhost",
    "trustedConnection": true,
    "trustServerCertificate": true
  },
  "loginTimeout": 15,
  "queryTimeout": 180,
  "backupPath": "C:\\sstr-backups",
  "cleanupBackup": true,
  "testRegex": "(tests/.*|(\\.|/)(test|spec))\\.sql$",
  "testMatch": "^test_",
  "testSchema": "sstr",
  "assertSchema": "Assert",
  "scripts": {
    "warmUp": "tests/warmup.sql",
    "coolDown": "tests/cooldown.sql"
  },
  "sqlCmdOptions": {
    "enableQuotedIdentifiers": true
  }
}
```

2. Create `tests/sum.test.sql`:

```sql
create or alter proc test_sum_should_return_summation_of_values
as
begin
    set nocount on;

    declare @a int = 10;
    declare @b int = 20;

    declare @result int = dbo.Sum(@a, @b);
    
    exec Assert.Equals @result, 30;
end
go
```

3. Run:

```bash
sstr run
```

You should see:

```text
==============================================
 Test Report
==============================================
Test script files: 1

Per-file details:
  - C:/project/tests/sum.test.sql [PASS]
      procedures: 1, pass: 1, fail: 0
----------------------------------------------
Total: 1, pass: 1, fail: 0
==============================================
```

---

## Documentation

- [Getting Started](https://github.com/ironcodev/sql-server-test-runner/blob/main/docs/getting-started.md)
- [Configuration](https://github.com/ironcodev/sql-server-test-runner/blob/main/docs/configuration.md)
- [CLI Reference](https://github.com/ironcodev/sql-server-test-runner/blob/main/docs/cli-reference.md)
- [Assertion Procedures](https://github.com/ironcodev/sql-server-test-runner/blob/main/docs/assertions.md)
- [Writing Tests](https://github.com/ironcodev/sql-server-test-runner/blob/main/docs/writing-tests.md)
- [Programmatic API](https://github.com/ironcodev/sql-server-test-runner/blob/main/docs/programmatic-api.md)
- [Database Lifecycle](https://github.com/ironcodev/sql-server-test-runner/blob/main/docs/database-lifecycle.md)
- [CI Integration](https://github.com/ironcodev/sql-server-test-runner/blob/main/docs/ci-integration.md)
- [Comparison with tSQLt](https://github.com/ironcodev/sql-server-test-runner/blob/main/docs/comparison.md)
- [Troubleshooting](https://github.com/ironcodev/sql-server-test-runner/blob/main/docs/troubleshooting.md)

---

## License

MIT
