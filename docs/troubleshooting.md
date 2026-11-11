# Troubleshooting

## `sqlcmd: command not found`

`sqlcmd` must be on `PATH`. Install it:

```bash
# Windows
winget install sqlcmd

# macOS
brew install sqlcmd

# Ubuntu / Debian
apt-get install sqlcmd
```

Verify with `sqlcmd -?`. On Windows, `where sqlcmd` should print a path.

## `Login failed for user ...`

- Check `connection.server`, `connection.username`, `connection.password`.
- If using Windows authentication (`trustedConnection: true`), the SQL Server must allow Windows logins.
- If using SQL authentication, ensure the login exists and is enabled.
- Increase `loginTimeout` if the server is slow to respond.

Test the connection independently:

```bash
sstr connect --env development --detailed-report
```

The `--detailed-report` flag prints the exact `sqlcmd` command and its raw output.

## `Database "sst_testdb" already exists`

The default test database `sst_testdb` must not pre-exist. Either:

- Drop it:
  ```sql
  alter database [sst_testdb] set single_user with rollback immediate;
  drop database [sst_testdb];
  ```
- Or set `testDb` to a different name in `sstr.config.json`.

If a previous run crashed and left `sst_testdb` behind, run:

```bash
sstr clean --yes
```

## `Cannot open backup device ...`

The SQL Server service account cannot write to `backupPath`. Choose a directory that the service account can write to.

- On Windows: `C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\Backup` or `...\DATA`.
- On Linux: `/var/opt/mssql/backups`.

If `backupPath` is empty, `sstr` asks SQL Server for its default paths. If those are also inaccessible, set `backupPath` explicitly.

## `A file activation error occurred` (Msg 5105) during RESTORE

This means SQL Server cannot create the restored `.mdf`/`.ldf` files at the target path. The directory in `backupPath` must be writable by the service account **for data files**, not just for `.bak` files.

- Prefer the `DATA` directory over the `Backup` directory.
- On Windows, the path uses backslashes; `sstr` builds the `MOVE` clause with the correct separator for the platform.

## Tests are discovered but never executed

- Check `testMatch` against the **bare procedure name** (without schema), e.g. `test_sum_should_return_sum`.
- Or put procedures in any schema specified in `testSchema`; those are always treated as tests.
- Procedures in `assertSchema` (default `Assert`) are **always excluded**.

Use `sstr list` to see which files are discovered:

```bash
sstr list
sstr list --test-regex "tests/.*\\.sql$"
```

## A test file fails but no procedures are run

This is expected. If the file itself fails during execution (syntax error, missing object), `sstr` reports it as `(entire script)` and skips its procedures. Fix the file's top-level statements first.

The report shows:

```text
Skipped files (script execution failed):
  ! C:/project/tests/broken.test.sql
      reason: ...
```

## Assertion fails with "Implicit conversion from data type sql_variant ..."

`sstr`'s assertions accept `sql_variant` and cast internally. If you see this error, it likely comes from **your own** stored procedure, not from `sstr`. For example, `@a + @b` where both are `sql_variant` fails; cast explicitly:

```sql
set @result = cast(@a as int) + cast(@b as int);
```

## `--no-transaction` and leaked data

With `--no-transaction`, data changes made by one test remain in the test database and may affect subsequent tests. Use it only when test procedures commit internally. In that case, reset state via `warmUp` or `preScript`.

## `sstr clean` aborts in CI

`sstr clean` requires `--yes` in non-TTY environments. Add it:

```bash
sstr clean --yes
```

Preview first with:

```bash
sstr clean --dry-run
```

## Node.js `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`

This is a known Node.js bug on Windows (versions 23–25) that can appear when a process exits while async work is still pending. It is unrelated to `sstr`. Use a Node.js LTS release (20 or 22) to avoid it.

## Getting more detail

- `sstr connect --detailed-report` — connection diagnostics.
- `sstr run --detailed-report` — every `sqlcmd` command and its raw output.
- `sstr config --env development` — the final merged config.
- `sstr run --keep-db` — inspect the test database after the run. Clean up with `sstr clean --yes`.