import { access } from "fs/promises";
import { constants } from "fs";
import { join, relative } from "path";
import { readTextFile } from "./file-utils.js";

/**
 * Default options applied to every test when nothing else is specified.
 */
export const DEFAULT_OPTIONS = {
  transaction: true,
  logExecution: false,
  skip: false,
  timeout: null,
  preScript: null,
  postScript: null,
  throws: false,
};

/**
 * Set of option names recognized by sstr. Used for unknown-key warnings.
 */
export const KNOWN_OPTIONS = new Set([
  "transaction",
  "logExecution",
  "skip",
  "timeout",
  "preScript",
  "postScript",
  "throws",
]);

const DEFAULT_PROJECT_OPTIONS_FILE = "tests/sstr.json";

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes a path to use forward slashes and removes a leading "./".
 */
function normalizePath(p) {
  return String(p).replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Returns candidate keys for a test file, from most specific to least:
 *   1. relative path from tests/ dir, without .sql (e.g. "procedures/phase1/sum")
 *   2. basename without .sql (e.g. "sum.test")
 *   3. basename without .sql and .test (e.g. "sum")
 */
function fileKeys(testFilePath, testsDir) {
  const rel = normalizePath(relative(testsDir, testFilePath));
  const noSql = rel.replace(/\.sql$/i, "");
  const basename = noSql.split("/").pop();
  const noTestBasename = basename.replace(/\.test$/i, "");
  const dir = noSql.includes("/") ? noSql.slice(0, noSql.lastIndexOf("/")) : "";
  const noTestPath = dir ? `${dir}/${noTestBasename}` : noTestBasename;

  const keys = new Set();
  keys.add(noSql); // procedures/phase1/sum.test
  keys.add(noTestPath); // procedures/phase1/sum
  keys.add(basename); // sum.test
  keys.add(noTestBasename); // sum
  return [...keys];
}

/**
 * Loads the project-level options file (tests/sstr.json by default).
 * Returns { files: Map<normalizedKey, options>, warnings, path, testsDir }.
 *
 * The file structure is:
 *   { "files": { "sum": { "skip": true }, "procedures/phase1/sum": { ... } } }
 */
export async function loadProjectOptions(
  cwd,
  optionsFilePath = DEFAULT_PROJECT_OPTIONS_FILE,
) {
  const fullPath = join(cwd, optionsFilePath);
  const testsDir = join(cwd, "tests");

  if (!(await fileExists(fullPath))) {
    return { files: new Map(), warnings: [], path: fullPath, testsDir };
  }

  const raw = await readTextFile(fullPath);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in "${fullPath}": ${e.message}`);
  }

  const warnings = [];
  const filesRaw = parsed.files ?? {};
  if (typeof filesRaw !== "object" || Array.isArray(filesRaw)) {
    throw new Error(
      `Invalid JSON in "${fullPath}": "files" must be an object.`,
    );
  }

  const files = new Map();
  for (const [name, opts] of Object.entries(filesRaw)) {
    if (opts === null || typeof opts !== "object" || Array.isArray(opts)) {
      throw new Error(
        `Invalid JSON in "${fullPath}": "files.${name}" must be an object.`,
      );
    }
    for (const key of Object.keys(opts)) {
      if (!KNOWN_OPTIONS.has(key)) {
        warnings.push(
          `Unknown option "${key}" for file "${name}" in "${fullPath}". ` +
            `Allowed: ${[...KNOWN_OPTIONS].join(", ")}.`,
        );
      }
    }
    files.set(normalizePath(name), opts);
  }

  return { files, warnings, path: fullPath, testsDir };
}

/**
 * Returns the merged file-level options for a test file.
 * Later (more specific) matches override earlier ones:
 *   1. name without .test (least specific)
 *   2. basename with .test
 *   3. relative path (most specific)
 */
export function getFileOptions(projectOptions, testFilePath) {
  if (!projectOptions || projectOptions.files.size === 0) return {};

  const keys = fileKeys(testFilePath, projectOptions.testsDir);
  // keys: [noSqlPath, noTestPath, basename, noTestBasename]
  // Apply from least to most specific:
  const ordered = [
    keys[3], // noTestBasename (sum)
    keys[2], // basename (sum.test)
    keys[1], // noTestPath (procedures/phase1/sum)
    keys[0], // noSqlPath (procedures/phase1/sum.test)
  ];

  let merged = {};
  for (const k of ordered) {
    const opts = projectOptions.files.get(k);
    if (opts) merged = { ...merged, ...opts };
  }
  for (const key of ["preScript", "postScript"]) {
    if (
      !Object.prototype.hasOwnProperty.call(merged, key) &&
      projectOptions[key] != null
    ) {
      merged[key] = projectOptions[key];
      merged[`__${key}FromTopLevel`] = true; // internal marker
    }
  }
  return merged;
}

/**
 * Loads the per-file JSON next to a test file.
 *
 * The file is now a flat object keyed by procedure name:
 *   { "test_foo": { "timeout": 30 }, "test_bar": { "skip": true } }
 *
 * "options" and "tests" are no longer supported; if present, they are
 * ignored with a warning so existing files do not break silently.
 *
 * Returns { tests: Map<lowercased proc name, options>, warnings, jsonPath }.
 */
export async function loadTestOptions(testFilePath) {
  const jsonPath = testFilePath.replace(/\.sql$/i, ".json");
  const warnings = [];

  if (!(await fileExists(jsonPath))) {
    return { tests: new Map(), warnings, jsonPath };
  }

  let raw;
  try {
    raw = await readTextFile(jsonPath);
  } catch (e) {
    throw new Error(`Failed to read "${jsonPath}": ${e.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in "${jsonPath}": ${e.message}`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Invalid JSON in "${jsonPath}": expected an object at the top level.`,
    );
  }

  const tests = new Map();
  for (const [procName, procOpts] of Object.entries(parsed)) {
    if (procName === "options" || procName === "tests") {
      warnings.push(
        `"${procName}" is not supported in "${jsonPath}". ` +
          `Per-file options live in "tests/sstr.json"; put per-SP settings directly under the top-level object.`,
      );
      continue;
    }
    if (
      procOpts === null ||
      typeof procOpts !== "object" ||
      Array.isArray(procOpts)
    ) {
      throw new Error(
        `Invalid JSON in "${jsonPath}": "${procName}" must be an object.`,
      );
    }
    for (const key of Object.keys(procOpts)) {
      if (!KNOWN_OPTIONS.has(key)) {
        warnings.push(
          `Unknown option "${key}" for test "${procName}" in "${jsonPath}". ` +
            `Allowed: ${[...KNOWN_OPTIONS].join(", ")}.`,
        );
      }
    }
    tests.set(procName.toLowerCase(), procOpts);
    // In loadTestOptions, after checking keys:
    for (const [k, v] of Object.entries(procOpts)) {
      if (k === "preScript" || k === "postScript") {
        if (v != null && typeof v !== "string" && !Array.isArray(v)) {
          throw new Error(
            `"${k}" for test "${procName}" must be a string or an array of strings.`,
          );
        }
      }
    }
  }

  return { tests, warnings, jsonPath };
}

/**
 * Resolves the effective options for a single test procedure.
 *
 * Priority (low to high):
 *   1. DEFAULT_OPTIONS
 *   2. sstr.config defaultTestOptions
 *   3. file-level options (tests/sstr.json, matched by getFileOptions)
 *   4. per-SP options (from the per-file JSON)
 *   5. CLI overrides (e.g. --no-transaction)
 */
export function resolveOptions({
  configDefaults = {},
  fileOptions = {},
  testOptions = {},
  cliOverrides = {},
} = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...configDefaults,
    ...fileOptions,
    ...testOptions,
    ...cliOverrides,
  };
}

/**
 * Returns a normalized boolean for option values like true, "true", "yes", 1.
 */
export function toBool(value, fallback = false) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "yes", "1", "on"].includes(v)) return true;
    if (["false", "no", "0", "off"].includes(v)) return false;
  }
  return fallback;
}

/**
 * Normalizes the "throws" option.
 *   - false: test must succeed.
 *   - true:  test must fail with any error.
 *   - number: test must fail with this error number.
 */
export function normalizeThrows(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "yes", "1", "on"].includes(v)) return true;
    if (["false", "no", "0", "off"].includes(v)) return false;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return false;
}
