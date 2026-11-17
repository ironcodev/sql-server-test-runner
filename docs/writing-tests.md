# Writing Tests

A test file is a plain `.sql` script that creates one or more stored procedures. Each procedure whose bare name matches `testMatch` (or lives in `testSchema` schemas) is a test.

## Naming

You have two options for telling `sstr` which procedures are tests.

### Option 1: prefix with `test_` (default)

Procedures whose **bare name** matches `testMatch` (default `^test_`) are tests, regardless of their schema.

\`\`\`sql
create or alter proc test_sum_should_return_sum_of_values ...
\`\`\`

### Option 2: put them in the `sstr` schema

`sstr init` sets `testSchema` to `"sstr"`, and the assertion script creates that schema. Any procedure in the `sstr` schema is treated as a test, without needing a `test_` prefix.

\`\`\`sql
create or alter proc sstr.sum_should_return_sum_of_values ...
\`\`\`

You can list multiple schemas, separated by commas:

\`\`\`json
{
  "testSchema": "sstr, integration_tests"
}
\`\`\`

Procedures in `assertSchema` (default `Assert`) are always excluded.

## No parameters

Test procedures should have **no parameters**. If a procedure has parameters, `sstr` passes `null` to all of them. This is supported but not recommended for new tests.

## Assertions

Use the assertion procedures deployed in `assertSchema` (default `Assert`):

```sql
exec Assert.Equals @result, 30;
exec Assert.IsTrue @flag;
exec Assert.RecordExists 'dbo.Users', N'{ "id": 10 }';
```

See [Assertion Procedures](assertions.md) for the full list.

## Isolation

Each test procedure runs inside a transaction that is **rolled back** at the end, whether the test passes or fails. This means:

- You can insert, update, or delete rows inside a test without affecting subsequent tests.
- You do **not** need to clean up after your test.
- If a procedure under test issues its own `COMMIT`, the rollback cannot undo its changes. Use `--no-transaction` in that case and reset state via `warmUp` / `preScript`.

## Seeding data

Because each test is isolated by a transaction, the simplest pattern is to seed data inside the test itself:

```sql
create or alter proc test_orders_should_sum_total
as
begin
    set nocount on;

    insert into dbo.Orders (id, amount) values (1, 10), (2, 20);

    declare @total int;
    select @total = dbo.TotalForAllOrders();

    exec Assert.Equals @total, 30;
end
go
```

The inserted rows are rolled back when the procedure finishes.

If many tests share the same seed data, put it in a `preScript` or `warmUp` file. Keep in mind that `preScript`/`warmUp` are **not** rolled back automatically; they run outside the per-test transaction. If you need them to be transactional, manage the transaction yourself or use `--no-transaction` consistently.

## Test database

By default, `sstr` uses `sst_testdb`. If you set `testDb` in the config:

- If `testDb` does not exist, `sstr` creates it, runs tests, then drops it.
- If `testDb` exists, `sstr` backs it up, restores a copy as `{testDb}_sst_{random}`, runs tests against the copy, then drops the copy. Your original database is **not modified**.

If you want tests to run against a schema that already exists (your real schema), point `testDb` at a database that already has it. `sstr` will back it up and restore a copy, so your original stays safe.

## Per-test options

You have two places to configure tests:

- **`tests/sstr.json`** — file-level options, applied to every test in a file.
- **`tests/sum.test.json`** — per-SP options, applied to a single procedure.

### File-level options (`tests/sstr.json`)

```json
{
  "files": {
    "sum": { "skip": true, "logExecution": true },
    "users.test": { "skip": true },
    "procedures/phase1/sum": { "timeout": 60 }
  }
}
```

Keys are matched against each test file's basename (with or without `.test`)
or its path relative to `tests/`. A key like `sum` applies to every
`sum.test.sql` in the tree; `procedures/phase1/sum` applies only to that
one file.

### Per-SP options (`tests/sum.test.json`)

```json
{
  "test_sum_should_return_sum": { "timeout": 30 },
  "test_sum_should_return_zero": { "skip": true }
}
```

### Available options

| Option | Type | Default | Description |
|---|---|---|---|
| `transaction` | boolean | `true` | Wrap the test in a transaction and roll it back. |
| `logExecution` | boolean | `false` | Measure and report the execution time. |
| `skip` | boolean | `false` | Skip the test. |
| `timeout` | number | `null` | Query timeout in seconds for this test. |
| `preScript` | string or string[] | `null` | Path(s) to `.sql` file(s) that run before this test. |
| `postScript` | string or string[] | `null` | Path(s) to `.sql` file(s) that run after this test. |
| `throws` | boolean or number | `false` | Require the test to fail (any error, or a specific SQL Server error number). |

### Resolution order

1. `sstr` defaults
2. `defaultTestOptions` in `sstr.config.json`
3. `files.<name>` in `tests/sstr.json`
4. `<procName>` in `tests/sum.test.json`
5. CLI switches (e.g. `--no-transaction`)

### Errors and warnings

- Invalid JSON aborts the run.
- Unknown keys produce a warning.
- `options` or `tests` in a per-file JSON produces a warning and is ignored.

## Multiple assertions per test

If one assertion fails, the procedure raises an error and the test is marked failed. Subsequent assertions in the same procedure are not executed. If you want to collect multiple failures, write multiple test procedures.

## Example: testing a UDF

```sql
-- tests/sum.test.sql
create or alter proc test_sum_should_return_zero_for_null_values
as
begin
    set nocount on;

    declare @a int;
    
    declare @result int = dbo.Sum(@a, null);

    exec Assert.Equals @result, 0;
end
go

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

## Example: testing a stored procedure

```sql
-- tests/order_total.test.sql
create or alter proc test_order_total_should_ignore_cancelled_orders
as
begin
    set nocount on;

    insert into dbo.Orders (id, status, amount)
    values (1, 'open', 10), (2, 'cancelled', 20);

    declare @total int;
    exec dbo.GetOrderTotal @total output;

    exec Assert.Equals @total, 10;
end
go
```

## Example: schema assertions
You can use [DbMold](https://github.com/ironcodev/dbmold) helper functions to check database schema based on your need. Then use `isTrue` or `IsFalse` for assertons.

```sql
create or alter proc test_schema_has_expected_objects
as
begin
    set nocount on;

    declare @table_exists   bit
    declare @column_exists  bit
    declare @fk_exists      bit
    declare @default_exists bit

    set @table_exists   = m.table_exists('dbo.Users')
    set @column_exists  = m.column_exists('Users.Email')
    set @fk_exists      = m.foreign_key_exists('Orders.UserId', 'Users.Id')
    set @default_exists = m.default_exists('dbo.Users.CreatedAt', 'getdate()')

    exec Assert.IsTrue @table_exists;
    exec Assert.IsTrue @column_exists;
    exec Assert.IsTrue @fk_exists;
    exec Assert.IsTrue @default_exists;
end
go
```

## What if the whole script fails?

If a test file itself fails during execution (e.g., a syntax error or a missing object), `sstr` reports it as `(entire script)` and **skips all its procedures**. Fix the file's top-level statements first.

## Test discovery

After each test file runs successfully, `sstr` lists the stored procedures in the test database and runs any new ones that match `testMatch` (or live in `testSchema` schemas). Procedures in `assertSchema` are always excluded. Each procedure is run only once, even if it existed before.