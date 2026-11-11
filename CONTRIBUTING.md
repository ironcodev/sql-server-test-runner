# Contributing to sql-server-test-runner

Thank you for your interest in improving `sql-server-test-runner` (CLI: `sstr`)! This document explains how to set up the project, run the tests, and submit changes.

## Ways to contribute

- **Report bugs** — open an issue with a minimal reproduction: the SQL test file, the config (redact credentials), the `sstr` version (`sstr --version`), and the output of `sstr run --detailed-report`.
- **Suggest features** — open an issue and describe the use case. Please explain *why* the feature is useful, not just *what* it should do.
- **Improve documentation** — typos, clarifications, and examples are always welcome.
- **Submit code** — bug fixes, new assertions, and improvements to the CLI are welcome.

## Before you start

### Requirements

- Node.js >= 18 (20 or 22 LTS recommended).
- `sqlcmd` on `PATH`. On Windows: `winget install sqlcmd`. On macOS: `brew install sqlcmd`. On Ubuntu/Debian: `apt-get install sqlcmd`.
- A reachable SQL Server instance for end-to-end testing. If you don't have one, use Docker:

  ```bash
  docker run -d --name sstr-sql     -e ACCEPT_EULA=Y     -e SA_PASSWORD='YourStrong!Passw0rd'     -p 1433:1433     mcr.microsoft.com/mssql/server:2022-latest
  ```

## Setting up the project

```bash
git clone https://github.com/ironcodev/sql-server-test-runner.git
cd sql-server-test-runner
npm install
```

To use the local `sstr` command while developing:

```bash
npm link
```

After `npm link`, run `sstr --version` from anywhere to confirm the link works. To remove it later:

```bash
npm unlink -g sql-server-test-runner
```

## Repository layout

```text
sql-server-test-runner/
├── bin/
│   └── sstr.js                  # CLI entry point
├── src/
│   ├── index.js                 # Public API (test, loadConfig, run, ...)
│   ├── cli.js                   # Argument parsing and command dispatch
│   ├── config.js                # Config loading, merging, validation
│   ├── sqlcmd.js                # sqlcmd invocation and argument building
│   ├── database.js              # Test database lifecycle and helpers
│   ├── discover.js              # Test file discovery
│   ├── runner.js                # Test execution logic
│   ├── reporter.js              # Console, JSON, and JUnit reporters
│   └── assert-script.sql        # Assertion procedures deployed before tests
├── docs/                        # Documentation
├── README.md
├── CONTRIBUTING.md
└── LICENSE
```

## Development workflow

1. **Create a branch** from `main`:

   ```bash
   git checkout -b fix/restore-filegroup
   ```

   Use a descriptive name: `fix/...`, `feat/...`, `docs/...`, `refactor/...`.

2. **Make your changes.** Keep commits focused. One logical change per commit.

3. **Test manually** against a real SQL Server instance:

   ```bash
   # Create a throwaway project
   mkdir /tmp/sstr-dev && cd /tmp/sstr-dev
   sstr init

   # Edit sstr.config.json to point at your server
   # Add a test file under tests/
   sstr run --detailed-report
   ```

4. **Verify formatting and style** (see below).

5. **Open a pull request** against `main`. Describe the problem, the solution, and how you tested it.

## Code style

- **Language:** modern ES modules (`import`/`export`), Node.js >= 18.
- **Formatting:** 2-space indentation, double quotes, semicolons, trailing commas where valid.
- **Naming:** `camelCase` for variables and functions, `PascalCase` for classes.
- **Comments:** English only. Explain *why*, not *what*. Avoid obvious comments.
- **Error messages:** English, actionable. Tell the user what went wrong and how to fix it.
- **SQL in `assert-script.sql`:** uppercase keywords, lowercase identifiers, `set nocount on` at the top of every procedure.

There is no linter configured yet. Match the style of the surrounding code.

## Adding a new assertion

Assertions live in `src/assert-script.sql`. To add one:

1. Add a `create or alter proc $(AssertSchema).YourAssertion (...)` block.
2. Use `sql_variant` parameters when the assertion should accept native values from the caller. Cast inside the procedure.
3. Raise an error with severity 16 on failure:

   ```sql
   raiserror('YourAssertion failed: <reason>', 16, 1);
   ```
4. Document it in `docs/assertions.md` (table entry + example).
5. Add a test to your local test project and run `sstr run`.

Because the file is deployed with `create or alter`, existing users will get the new procedure automatically on their next run. Mention new assertions in `CHANGELOG.md` (see below).

## Adding a new CLI switch

1. Add the switch to `parseCliArgs` in `src/cli.js`.
2. Validate its value and add it to the `opts` object.
3. Thread it through `runCLI` → the relevant `cmd*` function → `run` / `connect` / `clean`.
4. Update `HELP` in `src/cli.js`.
5. Update `docs/cli-reference.md` (section, examples, and the command–option matrix).
6. Reject the switch in commands where it does not apply (e.g., `--bail` in `connect`).

## Updating the documentation

Documentation is split across `README.md` and `docs/`. When you change behavior:

- Update the **relevant `docs/` file** first (single source of truth).
- Update **`README.md`** only if the change affects the quick start, the feature list, or the "Why sql-server-test-runner?" section.
- Avoid duplicating content across files; link instead.
- Keep examples runnable. If you change a config field, update the examples in `docs/configuration.md` and `docs/getting-started.md`.

## Changelog

We follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

Add an entry to `CHANGELOG.md` under the `## [Unreleased]` section:

```markdown
## [Unreleased]

### Added
- `Assert.IsBetween` and `Assert.NotBetween` assertions.

### Fixed
- RESTORE now uses backslashes for file paths on Windows.
```

Categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## Commit messages

Use short, imperative subjects:

```text
fix: use backslashes for RESTORE MOVE on Windows
feat: add --no-transaction switch
docs: clarify backupPath default resolution
refactor: extract command handlers from runCLI
```

Optional body explains *why* the change was made. Reference issues with `#123`.

## Pull request checklist

Before opening a PR, confirm:

- [ ] The change builds and runs: `node bin/sstr.js --version`, `node bin/sstr.js --help`.
- [ ] Manual test against a real SQL Server instance passes (`sstr run` and, if relevant, `sstr connect`, `sstr clean`).
- [ ] New behavior is covered by a test in your local test project (or a new test file if the repo has one).
- [ ] `docs/` is updated for any user-facing change.
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]`.
- [ ] `HELP` in `src/cli.js` is updated if a switch or command was added or changed.
- [ ] Commit messages follow the convention above.
- [ ] No secrets, credentials, or `.bak` files are included.

## Reporting bugs

A good bug report includes:

- **Version:** `sstr --version`.
- **OS:** Windows / macOS / Linux and version.
- **Node version:** `node --version`.
- **SQL Server version:** `SELECT @@VERSION`.
- **Config:** the relevant parts of `sstr.config.json` (redact `password`).
- **Reproduction:** the smallest test file that triggers the bug.
- **Output:** `sstr run --detailed-report 2>&1` (redact credentials).
- **Expected vs. actual behavior.**

If the bug involves `BACKUP`/`RESTORE`, include the output of:

```sql
select serverproperty('InstanceDefaultBackupPath') as backup_path,
       serverproperty('InstanceDefaultDataPath')   as data_path,
       serverproperty('InstanceDefaultLogPath')    as log_path;
```

## Security

Do **not** open a public issue for security vulnerabilities. Report them privately to the maintainer via the email listed in `package.json` or on the GitHub profile.
