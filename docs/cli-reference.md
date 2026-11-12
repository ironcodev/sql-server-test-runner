# CLI Reference

The binary is `sstr`. It can be used as a global command (`npm install -g sql-server-test-runner`) or via `npx`.

```text
sstr [command] [options]
```

## Synopsis

```text
sstr
    [-v | --version]
    [-? | -h | --help]

sstr run [options]
sstr init [options]
sstr list [options]
sstr config [options]
sstr connect [options]
sstr clean [options]
```

> Running `sstr` with **no arguments** prints the tool name and version, then exits with code `0`. Tests are only executed by the explicit `sstr run` command.

## Commands

### `sstr run`

Executes all discovered test files against a temporary test database and prints a report. This is the only command that executes tests.

Behavior:

1. Loads and validates the merged config.
2. Verifies the connection.
3. Creates (or backs up and restores) the test database.
4. Deploys assertion procedures.
5. Runs `warmUp`, then each test file with its `preScript`/`postScript`, then `coolDown`.
6. Prints the report and drops the test database (unless `--keep-db`).

Exit codes: `0` all passed, `1` fatal error, `2` at least one test failed.

```bash
sstr run
sstr run --env development
sstr run --report-type junit --no-color --bail > report.xml
```

### `sstr init`

Creates a starter `sstr.config.json` in the current directory. Fails if the file already exists.

The generated config sets `testSchema` to `"sstr"`. The assertion script creates the `sstr` schema in the test database, so you can put test procedures there without a `test_` prefix.

\`\`\`bash
sstr init
\`\`\`

### `sstr list`

Lists test files discovered by `testRegex` and exits without connecting to the database.

```bash
sstr list
sstr list --test-regex "tests/.*\\.sql$"
sstr list --env development
```

### `sstr config`

Prints the final merged config as JSON and exits. May contain credentials — do not save or share it unredacted.

```bash
sstr config
sstr config --env development
```

### `sstr connect`

Verifies that the connection succeeds and prints basic server info. Does not create, back up, restore, or drop anything.

```bash
sstr connect
sstr connect --env development --detailed-report
```

Sample output:

```text
Connecting to "localhost" (master)...
  server:        Microsoft SQL Server 2022 (RTM-CU13) ...
  default db:    master
  connected in:  18 ms
OK
```

Exit codes: `0` connection succeeded, `1` connection failed or config invalid.

`connect` only supports `--report-type console`. `--bail` and `--keep-db` are rejected.

### `sstr clean`

Removes leftover artifacts from previous runs:

- the test database (`testDb`, default `sst_testdb`) if it exists,
- restored copies matching `{testDb}_sst_*`,
- `.bak` files named `sst_*.bak` inside `backupPath` (unless `--keep-backups`).

Never touches source databases, unrelated user databases, or files outside `backupPath`. The config file is never deleted.

```bash
sstr clean --dry-run
sstr clean
sstr clean --yes
sstr clean --yes --keep-backups
```

In non-TTY environments, `sstr clean` aborts unless `--yes` is given.

## General options

### `-v`, `--version`

Prints the version and exits.

### `-?`, `-h`, `--help`

Prints the help banner (including the version) and exits.

> On Windows `cmd.exe`, `?` is a wildcard. Use `sstr -h` or `sstr ^?`.

## Config and directory options

Accepted by every command except `init`.

### `-c`, `--config <path>`

Uses `<path>` as the base config file instead of `sstr.config.json`.

### `-e`, `--env <name>`

Merges `sstr.config.{name}.json` on top of the base config.

### `-d`, `--cwd <path>`

Changes the working directory. All relative paths in the config and test discovery are resolved from here.

## Test selection

### `-tr`, `--test-regex <regex>`

Overrides `testRegex` from the config. Matched against the relative path of each `.sql` file. Accepted by `run` and `list`.

## Output options

### `--color` / `--no-color`

Force colored output on or off. When neither is given, color is enabled only if `stdout` is a TTY. `json` and `junit` reports never use color.

### `-rt`, `--report-type <console|json|junit>`

Selects the report format written to `stdout`. `connect` and `clean` only support `console`.

| Value | Format |
|---|---|
| `console` (default) | Human-readable, colored |
| `json` | Machine-readable JSON |
| `junit` | JUnit XML |

### `-dr`, `--detailed-report`

Prints every `sqlcmd` command, its exit code, and its raw `stdout`/`stderr` to `stderr`. Accepted by `run`, `connect`, and `clean`.

## Execution control

### `-b`, `--bail`

Stops at the first failing test. Remaining test procedures are skipped. `postScript` and `coolDown` still run so cleanup happens. Accepted by `run` only.

### `-kd`, `--keep-db`

Skips the final `DROP DATABASE`. The test database name is printed at the end. The backup file, if any, is also preserved. Accepted by `run` only.

### `-qt`, `--query-timeout <seconds>`

Overrides `queryTimeout` from the config. Non-negative integer; passed to `sqlcmd` as `-t`. Accepted by `run`, `connect`, and `clean`.

### `-nt`, `--no-transaction`

\`--no-transaction\` overrides the per-test \`transaction\` option for every test, including those set in per-file JSON files. Accepted by `run` only.

By default, each test procedure is executed inside a `BEGIN TRANSACTION` … `ROLLBACK` block, so any data changes it makes are discarded when the procedure finishes, and tests cannot leak state into each other. Use this flag only when a test procedure (or a procedure under test) issues its own `COMMIT`; in that case the wrapper cannot roll the changes back and the test would otherwise fail with a misleading error about a missing transaction.

```bash
sstr run
sstr run --no-transaction
```

> ⚠️ With `--no-transaction`, data changes made by one test remain in the test database and may affect subsequent tests. Use it only when you know the test procedures commit internally, and prefer resetting state via `warmUp` / `preScript` in that case.

## Clean options

### `--dry-run`

Lists what would be dropped and deleted, then exits without changing anything. Accepted by `clean` only.

### `--keep-backups`

Drops databases but leaves `.bak` files untouched. Accepted by `clean` only.

### `-y`, `--yes`

Skips the interactive confirmation prompt. Required when `stdin` is not a TTY. Accepted by `clean` only.

## Command–option matrix

| Option | `run` | `init` | `list` | `config` | `connect` | `clean` |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `-v, --version` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `-?, -h, --help` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `-c, --config` | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| `-e, --env` | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| `-d, --cwd` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `-tr, --test-regex` | ✓ | — | ✓ | — | — | — |
| `--color` / `--no-color` | ✓ | — | — | — | ✓ | — |
| `-rt, --report-type` | ✓ | — | — | — | ✓ (console only) | ✓ (console only) |
| `-b, --bail` | ✓ | — | — | — | — | — |
| `-kd, --keep-db` | ✓ | — | — | — | — | — |
| `-qt, --query-timeout` | ✓ | — | — | — | ✓ | ✓ |
| `-dr, --detailed-report` | ✓ | — | — | — | ✓ | ✓ |
| `-nt, --no-transaction` | ✓ | — | — | — | — | — |
| `--dry-run` | — | — | — | — | — | ✓ |
| `--keep-backups` | — | — | — | — | — | ✓ |
| `-y, --yes` | — | — | — | — | — | ✓ |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All tests passed / connection succeeded / nothing to clean. |
| `1` | A fatal error (config, connection, deployment, missing script, cleanup failure, etc.). |
| `2` | At least one test failed. |

## Recipes

```bash
# Bootstrap
sstr init

# Verify connection
sstr connect --env development

# Preview
sstr list
sstr config --env development

# Local run
sstr run --env development

# CI run
sstr run --env ci --report-type junit --no-color --bail > report.xml

# Debug one file
sstr run --test-regex "tests/sum\\.test\\.sql$" --detailed-report --keep-db --no-color

# Clean leftovers
sstr clean --dry-run
sstr clean --yes
```