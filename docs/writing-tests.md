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

Put a JSON file next to each test file to customize how `sstr` runs its tests:

\`\`\`text
tests/
├── sum.test.sql
├── sum.test.json
└── users.test.sql
\`\`\`

\`sum.test.json\`:

\`\`\`json
{
  "options": {
    "transaction": false,
    "logExecution": true
  },
  "tests": {
    "test_sum_should_return_sum_of_values": {
      "transaction": true
    },
    "test_sum_should_return_zero_for_null_values": {
      "skip": true
    }
  }
}
\`\`\`

The JSON file name is the test file name with `.sql` replaced by `.json`.

To bootstrap the JSON file, run `sstr options` and copy the output next to
your test file:
```bash
sstr options > tests/my_test.json
```

Then, modify options based on your needs.

For a full reference at the terminal:
```bash
sstr help options
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| \`transaction\` | boolean | \`true\` | Wrap the test in a transaction and roll it back. Set to \`false\` for tests that commit internally. |
| \`logExecution\` | boolean | \`false\` | Measure and report the execution time of this test. |
| \`skip\` | boolean | \`false\` | Skip this test. It is reported as skipped. |
| \`timeout\` | number | \`null\` | Query timeout in seconds for this test. Overrides \`queryTimeout\` from the config. |
| \`preScript\` | string | \`null\` | Path to a \`.sql\` file that runs before this test. |
| \`postScript\` | string | \`null\` | Path to a \`.sql\` file that runs after this test. |
| \`throws\` | boolean or number | \`false\` | If \`true\`, the test must fail with any error. If a number, the test must fail with that SQL Server error number. |

### Resolution order

Priority (low to high):

1. \`sstr\` defaults.
2. \`defaultTestOptions\` in \`sstr.config.json\`.
3. \`options\` in the JSON file (applies to all tests in the file).
4. \`tests.<procedureName>\` in the JSON file (applies to one test).
5. CLI switches (e.g. \`--no-transaction\` overrides \`transaction\` for all tests).

Test names in \`tests\` are matched against the **bare procedure name** (without schema), case-insensitively.

### Errors and warnings

- If the JSON file exists but is invalid, \`sstr\` aborts with:
  \`\`\`text
  Invalid JSON in "tests/sum.test.json": Unexpected token } at position 42
  \`\`\`
- If the JSON file contains an unknown key, \`sstr\` prints a warning and continues:
  \`\`\`text
  [sstr] Warning: Unknown option "timer" in "options" of "tests/sum.test.json". Allowed: transaction, logExecution, skip, timeout, preScript, postScript, throws.
  \`\`\`
- If the JSON file does not exist, defaults are used.

### \`$(TestSuite)\`

\`sstr\` still passes \`$(TestSuite)\` (the test file path) to \`sqlcmd\`, so you can use it inside test scripts if needed.

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

```sql
create or alter proc test_schema_has_expected_objects
as
begin
    set nocount on;

    exec Assert.TableExists      'dbo.Users';
    exec Assert.ColumnExists     'dbo.Users.email';
    exec Assert.ForeignKeyExists 'dbo.Orders.UserId', 'Users.Id';
    exec Assert.DefaultExists    'dbo.Users.createdAt', 'getdate()';
end
go
```

## What if the whole script fails?

If a test file itself fails during execution (e.g., a syntax error or a missing object), `sstr` reports it as `(entire script)` and **skips all its procedures**. Fix the file's top-level statements first.

## Test discovery

After each test file runs successfully, `sstr` lists the stored procedures in the test database and runs any new ones that match `testMatch` (or live in `testSchema` schemas). Procedures in `assertSchema` are always excluded. Each procedure is run only once, even if it existed before.