import { loadConfig, validateConfig, mergeCliOverrides } from "./config.js";
import { run } from "./runner.js";

export { loadConfig, validateConfig, mergeCliOverrides, run };

/**
 * Programmatic API:
 *   import { test } from 'sql-server-test-runner';
 *   const reporter = await test({ cwd: process.cwd(), env: 'development' });
 */
export async function test({
  cwd = process.cwd(),
  env = null,
  configPath = null,
  logger = console,
  reportType = "console",
  color = true,
  bail = false,
  keepDb = false,
  detailed = false,
  testRegex = null,
  queryTimeout = null,
} = {}) {
  let cfg = await loadConfig(cwd, env, { configPath });
  cfg = mergeCliOverrides(cfg, { testRegex, queryTimeout });
  validateConfig(cfg);
  return run(cfg, {
    cwd,
    logger,
    reportType,
    color,
    bail,
    keepDb,
    detailed,
  });
}
