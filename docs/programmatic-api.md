# Programmatic API

`sstr` can be imported as a Node.js module. This is useful if you want to run SQL tests from a custom script, a test framework, or a build pipeline.

## High-level API

```js
import { test } from 'sql-server-test-runner';

const reporter = await test({
  cwd: process.cwd(),
  env: 'development',
});

if (reporter.hasFailures) {
  process.exit(2);
}
```

### `test(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `cwd` | string | `process.cwd()` | Working directory. |
| `env` | string | `null` | Environment name for `sstr.config.{env}.json`. |
| `configPath` | string | `null` | Custom base config file. |
| `logger` | object | `console` | Object with `log` and `error` methods. |
| `reportType` | string | `console` | `console`, `json`, or `junit`. |
| `color` | boolean | `true` | Enable colored output. |
| `bail` | boolean | `false` | Stop at the first failing test. |
| `keepDb` | boolean | `false` | Do not drop the test database. |
| `detailed` | boolean | `false` | Print every `sqlcmd` command and raw output. |
| `useTransaction` | boolean | `true` | Wrap each test in a transaction and roll back. |
| `testRegex` | string | `null` | Override `testRegex`. |
| `queryTimeout` | number | `null` | Override `queryTimeout`. |

Returns the reporter object (see below).

## Reporter object

| Property / method | Description |
|---|---|
| `reporter.results` | Array of `{ file, procedure, passed, error, durationMs }`. |
| `reporter.files` | Array of discovered test files. |
| `reporter.skippedFiles` | Files that failed during script execution. |
| `reporter.hasFailures` | `true` if at least one result failed. |
| `reporter.print()` | Prints the human-readable report (console reporter only). |

## Low-level API

```js
import { loadConfig, validateConfig, run } from 'sql-server-test-runner';

const cfg = await loadConfig(process.cwd(), 'development');
validateConfig(cfg);

const reporter = await run(cfg, {
  cwd: process.cwd(),
  reportType: 'console',
  color: true,
});
```

### `loadConfig(cwd, env, options)`

Loads and merges the base config and the env-specific config.

| Option | Description |
|---|---|
| `configPath` | Custom base config file. |

### `validateConfig(cfg)`

Throws if the config is invalid.

### `run(cfg, options)`

Runs the test suite with an already-validated config. Returns the reporter.

## Example: custom script

```js
// scripts/run-sql-tests.mjs
import { test } from 'sql-server-test-runner';

const reporter = await test({
  env: process.env.NODE_ENV || 'development',
  reportType: 'json',
  color: false,
});

console.error(`Total: ${reporter.results.length}, failures: ${
  reporter.results.filter((r) => !r.passed).length
}`);

process.exit(reporter.hasFailures ? 2 : 0);
```

## Example: reading JSON output

If you prefer to consume the JSON report without using the API:

```bash
sstr run --report-type json --no-color > report.json
```

```js
import { readFile } from 'fs/promises';
const report = JSON.parse(await readFile('report.json', 'utf-8'));
console.log(report.summary);
```