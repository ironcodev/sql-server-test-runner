# Getting Started

This guide walks you through installing `sstr`, creating your first config, and running your first SQL Server test.

## 1. Prerequisites

- Node.js >= 18
- `sqlcmd` available on `PATH`

### Installing sqlcmd

**Windows**

```cmd
winget install sqlcmd
```

Or download the standalone zip from the [sqlcmd GitHub releases](https://github.com/microsoft/go-sqlcmd/releases) and add it to `PATH`.

**macOS**

```bash
brew install sqlcmd
```

**Ubuntu / Debian**

```bash
sudo apt-get update
sudo apt-get install -y sqlcmd
```

Verify the installation:

```bash
sqlcmd -?
```

You do not need SQL Server installed locally — only a reachable SQL Server instance.

## 2. Install sstr

```bash
npm install -g sql-server-test-runner
```

Or locally:

```bash
npm install --save-dev sql-server-test-runner
```

Verify:

```bash
sstr --version
sstr --help
```

## 3. Create a config file

In your project root, run:

```bash
sstr init
```

This creates `sstr.config.json` with sensible defaults. Edit the `connection` section to point at your SQL Server:

```json
{
  "connection": {
    "server": "localhost",
    "trustedConnection": true,
    "trustServerCertificate": true
  },
  "testDb": "my_test_db",
  "testMatch": "^test_",
  "testSchema": "sstr",
  "assertSchema": "Assert"
}
```

Verify the connection works before running tests:

```bash
sstr connect
```

You should see:

```text
Connecting to "localhost" (master)...
  server:        Microsoft SQL Server 2022 ...
  default db:    master
  connected in:  18 ms
OK
```

## 4. Project layout

A typical project looks like:

```text
my-project/
├── sstr.config.json
├── sstr.config.development.json   (optional, gitignored)
├── tests/
│   ├── sum.test.sql
│   └── users.test.sql
└── package.json
```

Test files are any `.sql` file whose **relative path** matches `testRegex`. The default regex matches:
- anything under `tests/`,
- any file ending with `.test.sql` or `.spec.sql`.

## 5. Write your first test

Create `tests/sum.test.sql`. Assume you have a UDF `dbo.Sum(@a int, @b int)` in your test database:

```sql
create or alter proc test_sum_should_return_sum_of_values
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

Every stored procedure whose **bare name** matches `testMatch` (`^test_` by default) is treated as a test.

## 6. Run

```bash
sstr run
```

`sstr` will:

1. Connect to the server.
2. Create `my_test_db` (or back it up and restore a copy if it already exists).
3. Deploy the assertion procedures (`Assert.*`).
4. Execute every test file and every test procedure.
5. Print a report.
6. Drop the test database.

## 7. Inspect what will run

Without connecting to the database, you can list discovered test files:

```bash
sstr list
```

And inspect the merged configuration:

```bash
sstr config
```

## Next steps

- [Configuration](configuration.md) — every config field explained.
- [Writing Tests](writing-tests.md) — patterns and best practices.
- [Assertion Procedures](assertions.md) — what you can assert.
- [CLI Reference](cli-reference.md) — every command and switch.