import { readFile, writeFile, unlink } from "fs/promises";
import { join, isAbsolute, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { runSqlcmd, buildConnectionArgs } from "./sqlcmd.js";
import {
  checkConnection,
  databaseExists,
  createDatabase,
  dropDatabase,
  backupAndRestore,
  listStoredProcedures,
  executeTestProcedure,
} from "./database.js";
import { discoverTestFiles } from "./discover.js";
import { createReporter } from "./reporter.js";
import { loadTestOptions, resolveOptions, toBool, normalizeThrows } from "./options.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_TEST_DB = "sstr_testdb";
const DEFAULT_ASSERT_SCHEMA = "Assert";
const DEFAULT_TEST_MATCH = "^test.*$";

function resolvePath(cwd, p) {
  if (!p) return null;
  return isAbsolute(p) ? p : join(cwd, p);
}

/**
 * Extracts the SQL Server error number from sqlcmd output.
 * Example: "Msg 8134, Level 16, State 1, ..." -> 8134
 */
function extractSqlErrorNumber(text) {
  if (!text) return null;
  const match = text.match(/Msg\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

async function runScriptOnDb(cfg, dbName, scriptPath, { assertSchema, debug, testSuite } = {}) {
  // Read the original script.
  let scriptText;
  try {
    scriptText = await readFile(scriptPath, "utf-8");
  } catch (e) {
    throw new Error(`Failed to read "${scriptPath}": ${e.message}`);
  }

  // Prepend :setvar directives so sqlcmd resolves $(AssertSchema) and
  // $(TestSuite) without relying on -v (which mishandles Windows paths).
  const lines = [];
  if (assertSchema) {
    lines.push(`:setvar AssertSchema "${assertSchema}"`);
  }
  if (testSuite) {
    lines.push(`:setvar TestSuite "${testSuite}"`);
  }
  lines.push("");
  lines.push(scriptText);

  const tmpFile = join(tmpdir(), `sstr_script_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`);
  await writeFile(tmpFile, lines.join("\n"), "utf-8");

  try {
    const args = buildConnectionArgs(cfg, { database: dbName });
    args.push("-i", tmpFile);
    return await runSqlcmd(args, { debug });
  } finally {
    try {
      await unlink(tmpFile);
    } catch {
      // ignore
    }
  }
}

async function runScriptTextOnDb(cfg, dbName, scriptText, { assertSchema, debug } = {}) {
  const lines = [];
  if (assertSchema) {
    lines.push(`:setvar AssertSchema "${assertSchema}"`);
  }
  lines.push("");
  lines.push(scriptText);

  const tmpFile = join(tmpdir(), `sstr_assert_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`);
  await writeFile(tmpFile, lines.join("\n"), "utf-8");

  try {
    const args = buildConnectionArgs(cfg, { database: dbName });
    args.push("-i", tmpFile);
    return await runSqlcmd(args, { debug });
  } finally {
    try {
      await unlink(tmpFile);
    } catch {
      // ignore
    }
  }
}

function isTestProcedure(fullName, { assertSchema, testSchemas, testMatch }) {
  const parts = fullName.split(".");
  const name = parts[parts.length - 1];
  const schema = parts.length > 1 ? parts.slice(0, -1).join(".") : "dbo";

  if (assertSchema && schema.toLowerCase() === assertSchema.toLowerCase()) {
    return false;
  }
  if (testSchemas && testSchemas.has(schema.toLowerCase())) {
    return true;
  }
  return testMatch.test(name);
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

export async function run(
  cfg,
  {
    cwd,
    logger = console,
    reportType = "console",
    color = true,
    bail = false,
    keepDb = false,
    detailed = false,
    useTransaction = true,
  } = {},
) {
  const assertSchema = cfg.assertSchema || DEFAULT_ASSERT_SCHEMA;
  const testMatch = new RegExp(cfg.testMatch || DEFAULT_TEST_MATCH, "i");

  // testSchema may be a single schema name or a comma-separated list.
  // Always include the "sstr" schema created by the assertion script.
  const testSchemas = new Set(
    (cfg.testSchema || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  testSchemas.add("sstr");

  const configDefaults = cfg.defaultTestOptions || {};

  // CLI --no-transaction overrides `transaction` for every test.
  const cliOverrides = useTransaction === false ? { transaction: false } : {};

  const reporter = createReporter(reportType, { color });
  const debug = detailed === true;

  // For JSON/JUnit reporters, keep stdout clean; route progress to stderr.
  const progressLogger = {
    log: (...a) => {
      if (debug) {
        if (reportType === "console") {
          logger.log(...a);
        } else {
          console.error(...a);
        }
      }
    },
    error: (...a) => {
      if (reportType === "console") {
        logger.error(...a);
      } else {
        console.error(...a);
      }
    },
  };

  const initLogger = reportType === "console" ? (msg) => logger.log(msg) : (msg) => console.error(msg);

  initLogger("Initializing ...");

  progressLogger.log("Checking connection to the server...");
  await checkConnection(cfg, { debug });
  progressLogger.log("Connection established.");

  const testDb = cfg.testDb || DEFAULT_TEST_DB;
  const dbExists = await databaseExists(cfg, testDb, { debug });

  let targetDb;
  let backupFile = null;

  if (!dbExists) {
    progressLogger.log(`Database "${testDb}" does not exist; creating it...`);
    await createDatabase(cfg, testDb, { debug });
    targetDb = testDb;
  } else {
    if (!cfg.testDb) {
      throw new Error(
        `Default database "${DEFAULT_TEST_DB}" already exists. Drop it or set "testDb" to a different name.`,
      );
    }
    const rand = Math.floor(Math.random() * 1e6);
    targetDb = `${testDb}_sstr_${rand}`;
    progressLogger.log(`Backing up "${testDb}" and restoring as "${targetDb}"...`);
    backupFile = await backupAndRestore(cfg, testDb, targetDb, { debug });
    progressLogger.log("Restore completed.");
  }

  try {
    progressLogger.log("Creating assertion procedures...");
    const assertSql = await readFile(join(__dirname, "assert-script.sql"), "utf-8");
    const assertRes = await runScriptTextOnDb(cfg, targetDb, assertSql, {
      assertSchema,
      debug: false,
    });
    if (assertRes.code !== 0) {
      throw new Error(`Failed to deploy assertion procedures:\n${assertRes.stderr || assertRes.stdout}`);
    }
    progressLogger.log("Assertion procedures created.");

    const files = await discoverTestFiles(cwd, cfg.testRegex);
    reporter.setFiles(files);
    progressLogger.log(`Found ${files.length} test script file(s).`);

    const scripts = cfg.scripts || {};

    if (scripts.warmUp) {
      const warmUpPath = resolvePath(cwd, scripts.warmUp);
      progressLogger.log(`Running warmUp: ${warmUpPath}`);
      const res = await runScriptOnDb(cfg, targetDb, warmUpPath, {
        assertSchema,
        debug,
      });
      if (res.code !== 0) {
        throw new Error(`warmUp script failed:\n${res.stderr || res.stdout}`);
      }
    }

    const testedProcedures = new Set();
    let bailed = false;

    for (const file of files) {
      if (bailed) break;

      if (scripts.preScript) {
        const p = resolvePath(cwd, scripts.preScript);
        const res = await runScriptOnDb(cfg, targetDb, p, {
          assertSchema,
          debug,
        });
        if (res.code !== 0) {
          throw new Error(`preScript failed for "${file}":\n${res.stderr || res.stdout}`);
        }
      }

      progressLogger.log(`Running test script: ${file}`);

      // Load per-file options (JSON next to the .sql file).
      let optionsBundle;
      try {
        optionsBundle = await loadTestOptions(file);
      } catch (e) {
        throw e;
      }
      for (const w of optionsBundle.warnings) {
        progressLogger.error(`[sstr] Warning: ${w}`);
      }

      const t0 = nowMs();
      const res = await runScriptOnDb(cfg, targetDb, file, {
        assertSchema,
        debug,
        testSuite: file,
      });
      const tFile = nowMs() - t0;

      if (res.code !== 0) {
        reporter.addResult({
          file,
          procedure: "(entire script)",
          passed: false,
          error: res.stderr || res.stdout,
          durationMs: tFile,
        });
        reporter.markFileSkipped(file, (res.stderr || res.stdout || "").trim());
      } else {
        const current = await listStoredProcedures(cfg, targetDb, { debug });
        const currentSet = new Set(current);
        const newOnes = [...currentSet].filter((p) => !testedProcedures.has(p));
        const testProcs = newOnes.filter((full) => isTestProcedure(full, { assertSchema, testSchemas, testMatch }));

        for (const full of testProcs) {
          const bareName = full.split(".").pop().toLowerCase();
          const testOpts = optionsBundle.tests.get(bareName) || {};

          const effective = resolveOptions({
            configDefaults,
            fileOptions: optionsBundle.options,
            testOptions: testOpts,
            cliOverrides,
          });

          const useTran = toBool(effective.transaction, true);
          const logExec = toBool(effective.logExecution, false);
          const skipTest = toBool(effective.skip, false);
          const expectedThrow = normalizeThrows(effective.throws);
          const testTimeout = effective.timeout != null ? Number(effective.timeout) : null;

          if (skipTest) {
            reporter.addResult({
              file,
              procedure: full,
              passed: true,
              error: null,
              durationMs: 0,
              skipped: true,
            });
            testedProcedures.add(full);
            continue;
          }

          if (effective.preScript) {
            const p = resolvePath(cwd, effective.preScript);
            const preRes = await runScriptOnDb(cfg, targetDb, p, {
              assertSchema,
              debug,
            });
            if (preRes.code !== 0) {
              throw new Error(`preScript for "${full}" failed:\n${preRes.stderr || preRes.stdout}`);
            }
          }

          const t1 = nowMs();
          const execRes = await executeTestProcedure(cfg, targetDb, full, {
            debug,
            useTransaction: useTran,
            queryTimeout: testTimeout,
          });
          const t2 = nowMs() - t1;

          if (effective.postScript) {
            const p = resolvePath(cwd, effective.postScript);
            const postRes = await runScriptOnDb(cfg, targetDb, p, {
              assertSchema,
              debug,
            });
            if (postRes.code !== 0) {
              throw new Error(`postScript for "${full}" failed:\n${postRes.stderr || postRes.stdout}`);
            }
          }

          const succeeded = execRes.code === 0;
          const errorText = (execRes.stderr || execRes.stdout || "").trim();

          let passed;
          let resultError = null;

          if (expectedThrow === false) {
            passed = succeeded;
            if (!passed) resultError = errorText;
          } else if (expectedThrow === true) {
            passed = !succeeded;
            if (!passed) {
              resultError = "Expected an error, but the test succeeded.";
            }
          } else {
            const errorNumber = extractSqlErrorNumber(errorText);
            passed = !succeeded && errorNumber === expectedThrow;
            if (!passed) {
              if (succeeded) {
                resultError = `Expected error ${expectedThrow}, but the test succeeded.`;
              } else if (errorNumber !== expectedThrow) {
                resultError = `Expected error ${expectedThrow}, got ${errorNumber ?? "unknown"}.\n${errorText}`;
              }
            }
          }

          reporter.addResult({
            file,
            procedure: full,
            passed,
            error: resultError,
            durationMs: logExec ? t2 : null,
          });
          testedProcedures.add(full);

          if (!passed && bail) {
            bailed = true;
            break;
          }
        }
      }

      if (scripts.postScript) {
        const p = resolvePath(cwd, scripts.postScript);
        const postRes = await runScriptOnDb(cfg, targetDb, p, {
          assertSchema,
          debug,
        });
        if (postRes.code !== 0) {
          throw new Error(`postScript failed for "${file}":\n${postRes.stderr || postRes.stdout}`);
        }
      }
    }

    if (!bailed && scripts.coolDown) {
      const p = resolvePath(cwd, scripts.coolDown);
      progressLogger.log(`Running coolDown: ${p}`);
      const res = await runScriptOnDb(cfg, targetDb, p, {
        assertSchema,
        debug,
      });
      if (res.code !== 0) {
        throw new Error(`coolDown script failed:\n${res.stderr || res.stdout}`);
      }
    }

    reporter.print();
    return reporter;
  } finally {
    if (!keepDb) {
      try {
        await dropDatabase(cfg, targetDb, { debug });
      } catch (e) {
        progressLogger.error(`Failed to drop database "${targetDb}": ${e.message}`);
      }

      if (backupFile && cfg.cleanupBackup === true) {
        try {
          await unlink(backupFile);
          progressLogger.log(`Removed backup file: ${backupFile}`);
        } catch (e) {
          progressLogger.error(`Failed to remove backup file "${backupFile}": ${e.message}`);
        }
      }
    } else {
      progressLogger.log(`Keeping test database "${targetDb}" (--keep-db).`);
    }
  }
}
