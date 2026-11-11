# Database Lifecycle

`sstr` creates a temporary test database for each run, deploys assertion procedures, runs tests, then drops the database. This page explains exactly what happens.

## Determining the test database

The database name comes from `testDb` in the config. If not set, it defaults to `sst_testdb`.

| Scenario | Behavior |
|---|---|
| `testDb` not set, `sst_testdb` does not exist | Creates `sst_testdb`, runs tests, drops it. |
| `testDb` not set, `sst_testdb` exists | **Aborts with an error.** The default database must not pre-exist. |
| `testDb` set, database does not exist | Creates it, runs tests, drops it. |
| `testDb` set, database exists | Backs it up, restores a copy as `{testDb}_sst_{random}`, runs tests against the copy, drops the copy. The original is untouched. |

Use `sstr clean` to remove leftover databases from crashed runs or `--keep-db`.

## Backup and restore

When the configured `testDb` already exists, `sstr`:

1. Takes a **full backup** (`BACKUP DATABASE ... WITH COPY_ONLY`) to `backupPath`.
2. Reads every physical file of the source database from `sys.master_files` — this includes **every filegroup** (primary, secondary, file streams, memory-optimized) plus the transaction log.
3. Restores under a new name with an explicit `MOVE` clause for every file, redirecting all data files to `backupPath`. SQL Server automatically recreates the filegroups, since every file in every filegroup is restored.

The original database is never modified.

### Choosing `backupPath`

`backupPath` must be a directory that the **SQL Server service account** can write to, not just the current user. If `backupPath` is empty, `sstr` asks SQL Server:

1. `SERVERPROPERTY('InstanceDefaultBackupPath')`
2. fallback: `SERVERPROPERTY('InstanceDefaultDataPath')`
3. fallback: `SERVERPROPERTY('InstanceDefaultLogPath')`

If none is available, the run aborts with a clear error asking you to set `backupPath`.

Common choices:

- `C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\Backup`
- `C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\DATA`
- `/var/opt/mssql/backups` (Linux)

### `cleanupBackup`

If `cleanupBackup` is `true`, `sstr` deletes the `.bak` file after the database is dropped. If `false` (default), the file is kept. Use `sstr clean` to remove leftover backups.

## Assertion deployment

After the test database is ready, `sstr` deploys the assertion procedures from its built-in `assert-script.sql` into `assertSchema` (default `Assert`). If the schema does not exist, it is created.

If deployment fails, the run aborts before any test executes.

## Scripts

The `scripts` section runs SQL files around the test lifecycle:

| Key | When |
|---|---|
| `warmUp` | Once, before any test file. |
| `coolDown` | Once, after all test files. |
| `preScript` | Before each test file. |
| `postScript` | After each test file. |

These scripts run **outside** the per-test transaction. Data they insert persists for the rest of the run.

## Per-test transaction

Each test procedure runs inside:

```sql
begin transaction;
begin try
    exec [dbo].[test_something];
    if @@trancount > 0 rollback transaction;
end try
begin catch
    if @@trancount > 0 rollback transaction;
    throw;
end catch
```

This isolates tests from each other. If a test procedure commits internally, `@@trancount` becomes 0 and the rollback is skipped; the test's changes persist. Use `--no-transaction` only in that case.

## Cleanup

At the end of the run, `sstr` drops the target database (the created one or the restored copy). If `--keep-db` is given, the database is kept and its name is printed.

`sstr clean` removes:

- `testDb` (if it exists),
- restored copies matching `{testDb}_sst_*`,
- `.bak` files named `sst_*.bak` in `backupPath` (unless `--keep-backups`).

## What `sstr` never touches

- Your source databases.
- User databases not matching the patterns above.
- Files outside `backupPath`.
- The config file (even `init` refuses to overwrite it).