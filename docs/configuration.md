# Configuration

`sstr` reads `sstr.config.json` from the current working directory (or from the path given by `-c/--config`). You can also provide an environment-specific file `sstr.config.{env}.json` which is merged on top of the base config.

## File resolution

| Situation | Base config | Env file |
|---|---|---|
| `sstr run` | `./sstr.config.json` | — |
| `sstr run --env development` | `./sstr.config.json` | `./sstr.config.development.json` |
| `sstr run -c ./configs/base.json` | `./configs/base.json` | — |
| `sstr run -c ./configs/base.json -e ci` | `./configs/base.json` | `./configs/sstr.config.ci.json` |

The env file is looked up **next to the base config**.

## Merge semantics

- `connection`, `scripts`, and `sqlCmdOptions` are **shallow-merged**: keys in the env file override matching keys in the base config.
- All other fields are **replaced** if present in the env file.

This lets you keep credentials out of the repository:

```text
sstr.config.json              # committed
sstr.config.development.json  # gitignored, contains local credentials
```

## Reference

### `connection` (required)

| Key | Type | sqlcmd switch | Description |
|---|---|---|---|
| `server` | string | `-S` | **Required.** SQL Server host (e.g. `localhost`, `localhost,1433`, `.\SQLEXPRESS`). |
| `username` | string | `-U` | SQL login. Defaults to `sa` when not using trusted connection. |
| `password` | string | `-P` | SQL password. |
| `encrypt` | boolean | `-N` | Encrypt the connection. |
| `trustedConnection` | boolean | `-E` | Use Windows authentication. When `true`, `username` and `password` are ignored. |
| `trustServerCertificate` | boolean | `-C` | Trust the server certificate. |

Validation rules:

- `server` is required.
- If `trustedConnection` is not `true`, `username` defaults to `sa`.
- `password` is optional but strongly recommended when not using trusted connection.

### Top-level options

| Key | Type | Default | Description |
|---|---|---|---|
| `loginTimeout` | number | — | Connection timeout in seconds (`-l`). |
| `queryTimeout` | number | — | Query timeout in seconds (`-t`). |
| `testDb` | string | `sstr_testdb` | Test database name. See [Database Lifecycle](database-lifecycle.md). |
| `backupPath` | string | SQL Server default | Directory for `.bak` files and restored data files. Must be writable by the SQL Server service account. If empty, `sstr` asks SQL Server for its default backup path, then data path, then log path. |
| `cleanupBackup` | boolean | `false` | If `true`, delete the `.bak` file after the run (only when the database was dropped). |
| `testRegex` | string | `^tests/.*\\.(test\|spec)\\.sql$` | Regex matched against the **relative path** of each `.sql` file. The default matches files under `tests/` that end with `.test.sql` or `.spec.sql`. |
| `testMatch` | string | `^test.*$` | Regex matched against the **bare procedure name**. Ignored for procedures inside `testSchema`. |
| `testSchema` | string | — | Comma-separated list of schemas. If set, **all** procedures in these schemas are treated as tests, regardless of `testMatch`. Whitespace around names is ignored. `sstr init` sets this to `"sstr"` by default, so you can put test procedures in the `sstr` schema without prefixing them with `test_`. Example: `"sstr, integration_tests"`. |
| `assertSchema` | string | `Assert` | Schema where assertion procedures are installed. Procedures in this schema are **excluded** from test discovery. |

### `scripts`

All optional. Each value is a path to a `.sql` file (relative to `--cwd`),
or an array of paths that run in order.

| Key | When it runs |
|---|---|
| `warmUp` | Once, before any test file. |
| `coolDown` | Once, after all test files. |
| `preScript` | Before each test file. |
| `postScript` | After each test file. |

Arrays run in order; if one file fails, the run aborts.

```json
{
  "scripts": {
    "warmUp": ["tests/setup1.sql", "tests/setup2.sql"],
    "coolDown": "tests/cleanup.sql"
  }
}
```

If a configured script path does not exist, the run aborts with an error.

### `defaultTestOptions`

Default per-test options applied to every test before the per-file JSON options.
Same shape as the `options` object in per-file JSON files.

```json
{
  "defaultTestOptions": {
    "logExecution": true
  }
}
```

Priority: `defaultTestOptions` < per-file `options` < per-test `tests.<name>` < CLI.

### `sqlCmdOptions`

All optional. Each key maps to a `sqlcmd` switch.

| Key | sqlcmd | Description |
|---|---|---|
| `hostName` | `-H` | Workstation name. |
| `packetSize` | `-a` | Network packet size. |
| `enableQuotedIdentifiers` | `-I` | Enable quoted identifiers. |
| `removeTrailingSpaces` | `-W` | Trim trailing spaces from output. |
| `controlCharBehavior` | `-k` / `-k1` / `-k2` | `remove`, `replace1`, `replace2`. |
| `unicodeOutput` | `-u` | Unicode output. |
| `useAzureActiveDirectory` | `-G` | Azure AD authentication. |
| `codePage` | `-f` | Input/output code page. |
| `hostNameInCertificate` | `-F` | Hostname in certificate. |
| `useClientRegionalSetting` | `-R` | Use client regional settings. |
| `applicationIntent` | `-K` | `ReadOnly` or `ReadWrite`. |
| `multiSubnetFailover` | `-M` | Multi-subnet failover. |
| `printRawErrorMessages` | `-j` | Print raw error messages. |
| `enableColumnEncryption` | `-g` | Enable column encryption. |
| `serverCertificatePath` | `-J` | Server certificate path. |
| `vars` | `-v` | Object of `key: value` pairs passed as `-v key=value`. |
| `ignoreVars` | `-x` | Ignore scripting variables. |
| `disableCommands` | `-X` | Disable commands. |
| `disableCommandsAndExit` | `-X1` | Disable commands and exit. |
| `batchTerminator` | `-c` | Batch terminator (default `GO`). |
| `errorLevel` | `-m` | Minimum error level to report. |
| `errorSeverityLevel` | `-V` | Minimum error severity. |
| `varLengthTypeDisplayWidth` | `-y` | Display width for variable-length types. |
| `fixedLengthTypeDisplayWidth` | `-Y` | Display width for fixed-length types. |
| `performanceStatistics` | `-p1` | Print performance statistics. |

### Project-level test options (`tests/sstr.json`)

File-level test settings live in `tests/sstr.json`:

```json
{
  "files": {
    "sum": { "skip": true, "logExecution": true },
    "users.test": { "skip": true },
    "procedures/phase1/sum": { "timeout": 60 },
    "./procedures/phase2/orders.test": { "transaction": false }
  }
}
```

Keys under `files` are matched against each test file as follows:

- **Without a path** (`sum`, `users.test`): matched against the basename of
  the test file, with or without the `.test` suffix and without `.sql`.
  A key like `sum` applies to every `sum.test.sql` in the tree.
- **With a path** (`procedures/phase1/sum`): matched against the test file's
  path relative to `tests/`, without `.sql`. Applies only to that one file.

More specific keys override less specific ones:

```text
procedures/phase1/sum  >  sum.test  >  sum
```

If several keys match, their options are merged with this priority.

### Per-SP options (`tests/sum.test.json`)

The JSON file next to a test file contains **only per-SP settings**. It is a
flat object keyed by procedure name:

```json
{
  "test_sum_should_return_sum": { "timeout": 30 },
  "test_sum_should_return_zero": { "skip": true }
}
```

> `options` and `tests` are no longer supported in this file. File-level
> options live in `tests/sstr.json`. If `options` or `tests` is present, it
> is ignored with a warning.

### Resolution order

Priority (low to high):

1. `sstr` defaults
2. `defaultTestOptions` in `sstr.config.json`
3. `files.<name>` in `tests/sstr.json`
4. `<procName>` in `tests/sum.test.json`
5. CLI switches (e.g. `--no-transaction`)

## Example: base + env

`sstr.config.json`:

```json
{
  "connection": {
    "server": "localhost",
    "trustedConnection": true,
    "trustServerCertificate": true
  },
  "testDb": "my_test_db",
  "testMatch": "^test_",
  "assertSchema": "Assert",
  "sqlCmdOptions": {
    "enableQuotedIdentifiers": true,
    "batchTerminator": "GO"
  }
}
```

`sstr.config.development.json` (gitignored):

```json
{
  "connection": {
    "server": "dev-sql.example.com",
    "trustedConnection": false,
    "username": "test_user",
    "password": "secret"
  },
  "loginTimeout": 30
}
```

Run with:

```bash
sstr run --env development
```

### Environment variables

`sstr` reads `.env.sstr` from the working directory (if present) and copies
variables that start with `SSTR_` into the process environment. Existing
environment variables take precedence.

| Variable | Description |
|---|---|
| `SSTR_SQLCMD_PATH` | Path to the `sqlcmd` executable. Useful when `sqlcmd` is not on `PATH`, or when multiple versions are installed. |

Example `.env.sstr`:

```text
SSTR_SQLCMD_PATH=C:\Program Files\SqlCmd\sqlcmd.exe
```

Add `.env.sstr` to your project's `.gitignore` if it contains machine-specific paths.

