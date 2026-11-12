import { readFile, access } from "fs/promises";
import { join, isAbsolute } from "path";
import { constants } from "fs";

const BASE_CONFIG = "sstr.config.json";

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the base config (default sstr.config.json, or `configPath` if provided)
 * and, optionally, merges sstr.config.{env}.json on top of it.
 *
 * - If `configPath` is provided, it is used as the base config.
 *   The env-specific file is looked up next to the base config:
 *   `<baseDir>/sstr.config.{env}.json`.
 * - The fields connection/scripts/sqlCmdOptions/defaultTestOptions are
 *   shallow-merged.
 */
export async function loadConfig(cwd, env, { configPath } = {}) {
  const basePath = configPath ? (isAbsolute(configPath) ? configPath : join(cwd, configPath)) : join(cwd, BASE_CONFIG);

  if (!(await fileExists(basePath))) {
    throw new Error(`Config file "${basePath}" not found.`);
  }

  const baseDir = configPath
    ? isAbsolute(configPath)
      ? configPath.replace(/[\\/][^\\/]+$/, "")
      : join(cwd, configPath).replace(/[\\/][^\\/]+$/, "")
    : cwd;

  const envPath = env ? join(baseDir, `sstr.config.${env}.json`) : null;

  const base = JSON.parse(await readFile(basePath, "utf-8"));
  let overrides = {};

  if (envPath && (await fileExists(envPath))) {
    overrides = JSON.parse(await readFile(envPath, "utf-8"));
  }

  const merged = { ...base };
  for (const key of Object.keys(overrides)) {
    if (
      ["connection", "scripts", "sqlCmdOptions", "defaultTestOptions"].includes(key) &&
      base[key] &&
      typeof base[key] === "object" &&
      typeof overrides[key] === "object"
    ) {
      merged[key] = { ...base[key], ...overrides[key] };
    } else {
      merged[key] = overrides[key];
    }
  }

  return merged;
}

/**
 * Applies CLI-level overrides to the loaded config.
 */
export function mergeCliOverrides(cfg, { testRegex, queryTimeout } = {}) {
  const out = { ...cfg };
  if (testRegex != null) out.testRegex = testRegex;
  if (queryTimeout != null) out.queryTimeout = queryTimeout;
  return out;
}

/**
 * Validates the configuration object.
 */
export function validateConfig(cfg) {
  const conn = cfg.connection;
  if (!conn || typeof conn !== "object") {
    throw new Error('"connection" section is required in the config file.');
  }
  if (!conn.server || typeof conn.server !== "string") {
    throw new Error('"connection.server" is required.');
  }

  const trusted = conn.trustedConnection === true || conn.trustedConnection === "true" || conn.trustedConnection === 1;

  if (!trusted) {
    if (conn.username && typeof conn.username !== "string") {
      throw new Error('"connection.username" must be a string.');
    }
    if (conn.password && typeof conn.password !== "string") {
      throw new Error('"connection.password" must be a string.');
    }
  }

  if (cfg.loginTimeout != null && typeof cfg.loginTimeout !== "number") {
    throw new Error('"loginTimeout" must be a number (seconds).');
  }
  if (cfg.queryTimeout != null && typeof cfg.queryTimeout !== "number") {
    throw new Error('"queryTimeout" must be a number (seconds).');
  }
  if (cfg.assertSchema != null && typeof cfg.assertSchema !== "string") {
    throw new Error('"assertSchema" must be a string.');
  }
  if (cfg.testSchema != null) {
    if (typeof cfg.testSchema !== "string") {
      throw new Error('"testSchema" must be a string.');
    }
    const parts = cfg.testSchema
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      throw new Error('"testSchema" must contain at least one schema name.');
    }
  }
  if (cfg.testRegex != null && typeof cfg.testRegex !== "string") {
    throw new Error('"testRegex" must be a string.');
  }
  if (cfg.testMatch != null && typeof cfg.testMatch !== "string") {
    throw new Error('"testMatch" must be a string.');
  }
  if (cfg.testDb != null && typeof cfg.testDb !== "string") {
    throw new Error('"testDb" must be a string.');
  }
  if (cfg.backupPath != null && typeof cfg.backupPath !== "string") {
    throw new Error('"backupPath" must be a string.');
  }
  if (cfg.cleanupBackup != null && typeof cfg.cleanupBackup !== "boolean") {
    throw new Error('"cleanupBackup" must be a boolean.');
  }
  if (cfg.defaultTestOptions != null) {
    if (typeof cfg.defaultTestOptions !== "object" || Array.isArray(cfg.defaultTestOptions)) {
      throw new Error('"defaultTestOptions" must be an object.');
    }
  }
  if (cfg.scripts && typeof cfg.scripts === "object") {
    for (const k of ["warmUp", "coolDown", "preScript", "postScript"]) {
      if (cfg.scripts[k] != null && typeof cfg.scripts[k] !== "string") {
        throw new Error(`"scripts.${k}" must be a string path.`);
      }
    }
  }
}
