# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.2.1] - 2026-11-22

### Fixed

- **Ctrl+C during `sstr run` now drops the test database.** When the user
  interrupts a run, the restored/test database is dropped before the process
  exits, so the next run does not fail with "database already exists" and no
  orphaned `sstr_*` databases are left on the server. `--keep-db` still
  preserves the database on interrupt.
- The Ctrl+C cleanup is best-effort: if the drop fails (e.g. a lingering
  `sqlcmd` child), the error is logged to `stderr` with a hint to run
  `sstr clean`.

### Changed

- `runner.js` registers a `SIGINT` handler for the duration of the run and
  removes it in `finally`.
  
## [2.2.0] - 2026-11-19

- **Breaking:** the default `testRegex` now matches only files under `<cwd>/tests`
  whose names end with `.test.sql` or `.spec.sql`
  (`"^tests/.*\\.(test|spec)\\.sql$"`). Previously it matched every `.sql` file
  under `tests/`. To restore the old behavior, set
  `"testRegex": "tests/.*\\.sql$"` in `sstr.config.json`.
- `discoverTestFiles` no longer gates the walk behind the existence of
  `<cwd>/tests`; the default regex enforces the layout instead.
- **Unit Tests** added unit tests.
- **More equality assertions** added new equality assertions `EqualsOrdinal`, `CollateEquals`,
`BinaryEquals`, `CollateMaxEquals` together with the their `Not` assertions.
- **Enhanced error reporting**
  
## [2.1.1] - 2026-11-18

### Enhanced console reporter
- display relative paths of test files instead of absolute path. 
- result of each file is reported right after runing the file.
- removed duplicate file path reporting (both upon running and at the end of the whole test).
- Used colorful test number and result badge for better UX.
- Added a newline after each file report for to provide better distinctive visual.

## [2.1.0] - 2026-11-17

### Added

- `scripts.warmUp`, `scripts.coolDown`, `scripts.preScript`, and
  `scripts.postScript` now accept an array of paths in addition to a single
  string. Files run in order; the first failure aborts the rest.
- `preScript` and `postScript` in per-SP options also accept arrays.

## [2.0.0] - 2026-11-16

### Added

- **Project-level test options** in `tests/sstr.json`. File-level options
  (`skip`, `logExecution`, `transaction`, `timeout`, `preScript`,
  `postScript`, `throws`) can now be set once for many files. Keys match
  the basename (with or without `.test`) or the path relative to `tests/`.
- `src/file-utils.js` with `readTextFile`, supporting UTF-8 (with or without
  BOM) and UTF-16 LE/BE (with BOM).
- Report header now shows the start time, end time, and total duration.
- `SSTR_SQLCMD_PATH` environment variable and `.env.sstr` file support.

### Changed

- **Breaking:** per-file JSON (`tests/sum.test.json`) no longer supports
  `options` or `tests`. It is now a flat object keyed by procedure name.
  File-level options moved to `tests/sstr.json`. If `options` or `tests`
  is present, it is ignored with a warning.
- `sstr options` now prints a per-SP sample. File-level options are
  documented in `sstr help options`.

### Fixed

- UTF-16 BE/LE and UTF-8 BOM files are now read correctly.
- Skipped files are reported as `SKIP`, not `PASS`.
- `sqlcmd` resolution on Windows no longer relies on `shell: true`.

### Removed

- **Breaking:** removed the following assertion procedures from `sstr`.
  Use [DbMold](https://github.com/ironcodev/dbmold) instead:
  - `TableExists`, `TableNotExists`
  - `ColumnExists`, `ColumnNotExists`
  - `ForeignKeyExists`, `ForeignKeyNotExists`
  - `DefaultExists`, `DefaultNotExists`
  - `RecordExists`, `RecordNotExists`
- Removed the internal helpers `sstr._parse_table_column`,
  `sstr._parse_column_list`, and `sstr._normalize_default`, which were only
  used by the removed procedures.

### Added

- Link to [DbMold](https://github.com/ironcodev/dbmold) in the README and
  docs for users who need general-purpose SQL helpers.

### Changed

- `sstr` now focuses exclusively on **test assertions** (`IsTrue`, `Equals`,
  `IsBetween`, etc.). For schema-object checks, install DbMold.

## [1.0.0] - 2026-11-14

### Added

- CLI with explicit commands: `run`, `init`, `list`, `config`, `connect`,
  `clean`, `options`, `help`.
- `sstr run` executes test files and reports per-file and per-procedure
  results in `console`, `json`, and `junit` formats.
- `sstr init` creates a starter `sstr.config.json` with sensible defaults.
- `sstr list` lists discovered test files without connecting to the database.
- `sstr config` prints the final merged configuration.
- `sstr connect` verifies the database connection and prints server info.
- `sstr clean` removes leftover test databases and `.bak` files, with
  `--dry-run`, `--keep-backups`, and `--yes`.
- `sstr options` prints a sample per-test options JSON file.
- `sstr help [topic]` prints general help or a topic-specific reference
  (`sstr help options`).
- Configuration merging: `sstr.config.{env}.json` overrides
  `sstr.config.json`, and `sstr.config.json` overrides built-in defaults.
- Comma-separated `testSchema` support. Procedures in these schemas are
  treated as tests regardless of `testMatch`. The `sstr` schema is always
  included.
- `defaultTestOptions` in the config applies default per-test options before
  per-file options.
- Per-test options in a JSON file next to each test file
  (same name, `.json` extension):
  - `transaction` — wrap the test in a transaction and roll it back.
  - `logExecution` — measure and report the execution time.
  - `skip` — skip the test.
  - `timeout` — per-test query timeout.
  - `preScript` / `postScript` — per-test SQL scripts.
  - `throws` — require the test to fail (with any error, or a specific
    SQL Server error number).
- Assertion procedures deployed before tests run:
  `IsTrue`, `IsFalse`, `IsNull`, `IsNotNull`, `IsNumeric`, `IsEmpty`,
  `Equals`, `NotEquals`, `IsGT`, `IsGTE`, `IsLT`, `IsLTE`, `IsBetween`,
  `NotBetween`, `TableExists`, `TableNotExists`, `ColumnExists`,
  `ColumnNotExists`, `ForeignKeyExists`, `ForeignKeyNotExists`,
  `DefaultExists`, `DefaultNotExists`, `RecordExists`, `RecordNotExists`.
- `ForeignKeyExists` / `ForeignKeyNotExists` accept composite keys:
  `'dbo.Child.(Col1,Col2)'`, `'dbo.Parent.(Col1,Col2)'`.
- `DefaultExists` / `DefaultNotExists` accept an optional expected value and
  normalize wrapping parentheses before comparison.
- `RecordExists` / `RecordNotExists` accept a JSON filter with `OPENJSON`.
- The `sstr` schema is created automatically, so test procedures can live
  there without a `test_` prefix.
- Test database lifecycle:
  - Default `sstr_testdb`. Fails if it already exists.
  - Configured `testDb`: creates it if missing, or backs it up and restores
    a copy under `{testDb}_sstr_{random}` if it exists.
  - Filegroup-aware backup and restore.
  - `backupPath` resolution: config → SQL Server default backup path →
    default data path → default log path.
  - `cleanupBackup` deletes the `.bak` file after the run.
- Warning when a test passes without calling any assertion.
- Per-test execution times in the console, JSON, and JUnit reports.
- `--no-transaction` overrides `transaction` for every test.
- `--bail` stops at the first failing test.
- `--keep-db` leaves the test database in place.
- `--detailed-report` prints every `sqlcmd` command and its raw output.
- `--test-regex` overrides `testRegex` from the command line.
- `--query-timeout` overrides `queryTimeout` from the command line.
- `--color` / `--no-color` control colored output.
- `--report-type` selects `console`, `json`, or `junit`.
- Exit codes: `0` pass, `1` fatal error, `2` test failure.

### Changed

- `sstr` without arguments prints the tool name and version and exits. Tests
  are only executed by the explicit `sstr run` command.
- Progress messages (connection, backup, restore, assertion deployment) are
  only shown with `--detailed-report`. A single `Initializing ...` line is
  shown otherwise.

### Fixed

- `sqlcmd` arguments are ordered so `-h -1 -W` and `-s` come before `-Q`,
  avoiding `Sqlcmd: '-' or '/' does not have an associated argument`.
- `sqlcmd` is invoked without a shell, so Windows paths with `:` and spaces
  are passed verbatim.
- RESTORE uses platform-specific separators (backslashes on Windows) so
  file paths are accepted by SQL Server.
- Assertion procedures cast `sql_variant` internally, so callers can pass
  native values (e.g. `int`) without explicit casts.
- `SSTR_ASSERTION` markers are stripped from error messages.
- No assertion warning is emitted for tests that use `throws`.

### Security

- `sstr clean` requires `--yes` in non-TTY environments to prevent
  accidental destruction in CI.

[Unreleased]: https://github.com/ironcodev/sql-server-test-runner/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ironcodev/sql-server-test-runner/releases/tag/v1.0.0
