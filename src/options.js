import { readFile, access } from "fs/promises";
import { constants } from "fs";

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

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the per-file options JSON next to a test file.
 *
 * The JSON file name is the test file name with `.sql` replaced by `.json`
 * (e.g. `sum.test.sql` -> `sum.test.json`).
 *
 * Returns { options, tests, warnings } where:
 *   - options:  file-level defaults for all tests
 *   - tests:    Map<lowercased procedure name, per-test overrides>
 *   - warnings: array of human-readable warning strings (unknown keys)
 *
 * Throws if the file exists but is not valid JSON.
 * Returns empty structures if the file does not exist.
 */
export async function loadTestOptions(testFilePath) {
  const jsonPath = testFilePath.replace(/\.sql$/i, ".json");
  const warnings = [];

  if (!(await fileExists(jsonPath))) {
    return { options: {}, tests: new Map(), warnings, jsonPath };
  }

  let raw;
  try {
    raw = await readFile(jsonPath, "utf-8");
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
    throw new Error(`Invalid JSON in "${jsonPath}": expected an object at the top level.`);
  }

  // File-level options.
  const fileOptions = parsed.options ?? {};
  if (typeof fileOptions !== "object" || Array.isArray(fileOptions)) {
    throw new Error(`Invalid JSON in "${jsonPath}": "options" must be an object.`);
  }
  for (const key of Object.keys(fileOptions)) {
    if (!KNOWN_OPTIONS.has(key)) {
      warnings.push(
        `Unknown option "${key}" in "options" of "${jsonPath}". ` + `Allowed: ${[...KNOWN_OPTIONS].join(", ")}.`,
      );
    }
  }

  // Per-test options.
  const testsRaw = parsed.tests ?? {};
  if (typeof testsRaw !== "object" || Array.isArray(testsRaw)) {
    throw new Error(`Invalid JSON in "${jsonPath}": "tests" must be an object.`);
  }

  const tests = new Map();
  for (const [procName, procOpts] of Object.entries(testsRaw)) {
    if (procOpts === null || typeof procOpts !== "object" || Array.isArray(procOpts)) {
      throw new Error(`Invalid JSON in "${jsonPath}": "tests.${procName}" must be an object.`);
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
  }

  return { options: fileOptions, tests, warnings, jsonPath };
}

/**
 * Resolves the effective options for a single test procedure.
 *
 * Priority (low to high):
 *   1. DEFAULT_OPTIONS
 *   2. sstr.config defaultTestOptions
 *   3. file-level "options" in the JSON file
 *   4. per-test "tests.<name>" in the JSON file
 *   5. CLI overrides (e.g. --no-transaction)
 */
export function resolveOptions({ configDefaults = {}, fileOptions = {}, testOptions = {}, cliOverrides = {} } = {}) {
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
