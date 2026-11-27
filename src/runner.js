import { writeFile, unlink } from "fs/promises";
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
import {
  loadProjectOptions,
  getFileOptions,
  loadTestOptions,
  resolveOptions,
  toBool,
  normalizeThrows,
} from "./options.js";
import { readTextFile } from "./file-utils.js";
import { makeColorizer } from "./util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_TEST_DB = "sstr_testdb";
const DEFAULT_ASSERT_SCHEMA = "Assert";
const DEFAULT_TEST_MATCH = "^test.*$";

function resolvePath(cwd, p) {
  if (!p) return null;
  return isAbsolute(p) ? p : join(cwd, p);
}

function extractSqlErrorNumber(text) {
  if (!text) return null;
  const match = text.match(/Msg\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

/**
 * Runs one or more SQL scripts against the given database.
 * `paths` may be a single string or an array of strings.
 * Files run sequentially; the first failure aborts the rest.
 */
async function runScriptsOnDb(cfg, dbName, paths, { cwd = process.cwd(), assertSchema, debug, label = "script" } = {}) {
  if (paths == null) return;
  const list = Array.isArray(paths) ? paths : [paths];
  for (const p of list) {
    if (typeof p !== "string") {
      throw new Error(`Invalid ${label} path: ${JSON.stringify(p)}`);
    }
    const full = resolvePath(cwd, p);
    const res = await runScriptOnDb(cfg, dbName, full, {
      assertSchema,
      debug,
      label,
    });
    if (res.code !== 0) {
      throw new Error(`${label} "${p}" failed:\n${res.stderr || res.stdout}`);
    }
  }
}

async function runScriptOnDb(cfg, dbName, scriptPath, { assertSchema, debug, testSuite, label } = {}) {
  let scriptText;
  try {
    scriptText = await readTextFile(scriptPath);
  } catch (e) {
    throw new Error(`${label}. Failed to read "${scriptPath}": ${e.message}`);
  }

  const lines = [];
  if (assertSchema) lines.push(`:setvar AssertSchema "${assertSchema}"`);
  if (testSuite) lines.push(`:setvar TestSuite "${testSuite}"`);
  lines.push("");
  lines.push(scriptText);

  const tmpFile = join(tmpdir(), `sstr_script_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`);
  await writeFile(tmpFile, lines.join("\n"), "utf-8");

  try {
    const args = buildConnectionArgs(cfg, { database: dbName });
    const _runSqlcmd = cfg.runSqlcmd || runSqlcmd;
    args.push("-i", tmpFile);
    return await _runSqlcmd(args, { debug, label });
  } finally {
    try {
      await unlink(tmpFile);
    } catch {
      // ignore
    }
  }
}

async function runScriptTextOnDb(cfg, dbName, scriptText, { assertSchema, debug, label } = {}) {
  const lines = [];
  if (assertSchema) lines.push(`:setvar AssertSchema "${assertSchema}"`);
  lines.push("");
  lines.push(scriptText);

  const tmpFile = join(tmpdir(), `sstr_assert_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`);
  await writeFile(tmpFile, lines.join("\n"), "utf-8");

  try {
    const args = buildConnectionArgs(cfg, { database: dbName });
    const _runSqlcmd = cfg.runSqlcmd || runSqlcmd;
    args.push("-i", tmpFile);
    return await _runSqlcmd(args, { debug, label });
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

function writeProgress(initLogger, enabled, prefix, done, total) {
  if (!enabled || total === 0) return;
  const pct = Math.floor((done / total) * 100);
  const line = `\r${prefix}[ ${String(pct).padStart(3)}% ]`;
  initLogger.write(line);
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
  const startedAt = new Date();
  const startMs = nowMs();

  const assertSchema = cfg.assertSchema || DEFAULT_ASSERT_SCHEMA;
  const testMatch = new RegExp(cfg.testMatch || DEFAULT_TEST_MATCH, "i");

  const testSchemas = new Set(
    (cfg.testSchema || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  testSchemas.add("sstr");

  const configDefaults = cfg.defaultTestOptions || {};
  const cliOverrides = useTransaction === false ? { transaction: false } : {};

  const reporter = createReporter(reportType, { color });
  const debug = detailed === true;

  const progressLogger = {
    log: (...a) => {
      if (debug) {
        if (reportType === "console") logger.log(...a);
        else console.error(...a);
      }
    },
    error: (...a) => {
      if (reportType === "console") logger.error(...a);
      else console.error(...a);
    },
  };

  const initLogger =
    reportType === "console"
      ? {
          log: (msg) => logger.log(msg),
          write: (msg) => process.stdout.write(msg),
        }
      : {
          log: (msg) => console.error(msg),
          write: (msg) => process.stdout.write(msg),
        };

  initLogger.log("Initializing ...");

  progressLogger.log("Checking connection to the server...");
  await checkConnection(cfg, { debug });
  progressLogger.log("Connection established.");

  const testDb = cfg.testDb || DEFAULT_TEST_DB;
  const dbExists = await databaseExists(cfg, testDb, { debug });

  let targetDb;
  let shuttingDown = false;
  let backupFile = null;

  const onSigint = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (targetDb && !keepDb) {
      try {
        await dropDatabase(cfg, targetDb, { debug: false });
      } catch (e) {
        console.error(`Failed to drop test database "${targetDb}": ${e.message}`);
        console.error(`You may need to run "sstr clean" before the next run.`);
      }
    }
    process.exit(130);
  };

  process.on("SIGINT", onSigint);

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
    const assertSql = await readTextFile(join(__dirname, "assert-script.sql"));
    const assertRes = await runScriptTextOnDb(cfg, targetDb, assertSql, {
      assertSchema,
      debug: false,
      label: "assertions",
    });
    if (assertRes.code !== 0) {
      throw new Error(`Failed to deploy assertion procedures:\n${assertRes.stderr || assertRes.stdout}`);
    }
    progressLogger.log("Assertion procedures created.");

    const files = await discoverTestFiles(cwd, cfg.testRegex);
    reporter.setFiles(files);
    progressLogger.log(`Found ${files.length} test script file(s).`);

    initLogger.log("Running tests ...");

    const scripts = cfg.scripts || {};

    // Project-level options (tests/sstr.json)
    const projectOptions = await loadProjectOptions(cwd);
    for (const w of projectOptions.warnings) {
      progressLogger.error(`[sstr] Warning: ${w}`);
    }

    if (scripts.warmUp) {
      progressLogger.log(
        `Running warmUp: ${Array.isArray(scripts.warmUp) ? scripts.warmUp.join(", ") : scripts.warmUp}`,
      );
      await runScriptsOnDb(cfg, targetDb, scripts.warmUp, {
        cwd,
        assertSchema,
        debug,
        label: "warmUp",
      });
    }

    const c = makeColorizer(color);
    const testedProcedures = new Set();
    const root = process.cwd();
    let bailed = false;
    let count = 0;

    for (const file of files) {
      count++;

      const filename = file.replace(root, "").replace(/\\/g, "/");
      if (bailed) break;

      // Load per-file JSON (per-SP settings).
      let optionsBundle;
      try {
        optionsBundle = await loadTestOptions(file);
      } catch (e) {
        throw e;
      }
      for (const w of optionsBundle.warnings) {
        progressLogger.error(`[sstr] Warning: ${w}`);
      }

      // File-level options from tests/sstr.json.
      const fileLevelOptions = getFileOptions(projectOptions, file);

      // Skip the whole file if requested at the file level.
      if (toBool(fileLevelOptions.skip, false)) {
        initLogger.log(`\n  ${c("cyan", count)}. ${filename} ${c("yellow", "(skipped)")}`);
        continue;
      }

      const prefix = `\n  ${c("cyan", count)}. ${filename} `;
      initLogger.write(prefix);

      if (scripts.preScript) {
        await runScriptsOnDb(cfg, targetDb, scripts.preScript, {
          cwd,
          assertSchema,
          debug,
          label: `preScript for "${file}"`,
        });
      }

      const t0 = nowMs();
      const res = await runScriptOnDb(cfg, targetDb, file, {
        assertSchema,
        debug,
        testSuite: file,
      });
      const tFile = nowMs() - t0;
      let total = 0;
      let isTty = false;

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
        
        total = testProcs.length;
        isTty = Boolean(process.stdout.isTTY);
        
        const showProgress = reportType === "console" && isTty && total > 0;

        let done = 0;

        for (const full of testProcs) {
          const bareName = full.split(".").pop().toLowerCase();
          const testOpts = optionsBundle.tests.get(bareName) || {};

          const effective = resolveOptions({
            configDefaults,
            fileOptions: fileLevelOptions,
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
              durationMs: null,
              skipped: true,
            });
            testedProcedures.add(full);
            continue;
          }

          if (effective.preScript) {
            await runScriptsOnDb(cfg, targetDb, effective.preScript, {
              cwd,
              assertSchema,
              debug,
              label: `preScript for "${full}"`,
            });
          }

          const t1 = nowMs();
          const execRes = await executeTestProcedure(cfg, targetDb, full, {
            debug,
            useTransaction: useTran,
            queryTimeout: testTimeout,
          });
          const t2 = nowMs() - t1;

          if (effective.postScript) {
            await runScriptsOnDb(cfg, targetDb, effective.postScript, {
              cwd,
              assertSchema,
              debug,
              label: `postScript for "${full}"`,
            });
          }

          const succeeded = execRes.code === 0;
          const stderr = (execRes.stderr || "").trim();
          const stdout = (execRes.stdout || "").trim();
          const cleanStdout = stdout.replace(/SSTR_ASSERTION\s*/g, "").trim();
          const errorText = stderr || cleanStdout;
          const hasAssertion = stdout.includes("SSTR_ASSERTION");

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

          let warning = null;
          if (passed && !hasAssertion && expectedThrow === false) {
            warning = "Test passed without calling any assertion. " + "Did you forget to add an Assert.* call?";
          }

          reporter.addResult({
            file,
            procedure: full,
            passed,
            error: resultError,
            durationMs: logExec ? t2 : null,
            warning,
          });
          testedProcedures.add(full);

          done++;
          if (showProgress) {
            const pct = Math.floor((done / total) * 100);
            process.stdout.write(`\r${prefix}[ ${String(pct).padStart(3)}% ]`);
          } else if (reportType === "console" && total > 0 && done === total) {
            // Non-TTY: one final progress line at 100%, then the badge overwrites it.
            // (Optional; remove this branch if you want zero progress in non-TTY.)
          }

          if (!passed && bail) {
            bailed = true;
            break;
          }
        }
      }

      if (scripts.postScript) {
        await runScriptsOnDb(cfg, targetDb, scripts.postScript, {
          cwd,
          assertSchema,
          debug,
          label: `postScript for "${file}"`,
        });
      }

      // One-line summary for this file.

      const fileResults = reporter.results.filter((r) => r.file === file);
      const pass = fileResults.filter((r) => r.passed && !r.skipped).length;
      const fail = fileResults.filter((r) => !r.passed && !r.skipped).length;
      const skipped = fileResults.filter((r) => r.skipped).length;

      const badge =
        fail > 0
          ? c("red", "FAIL")
          : pass > 0
            ? c("green", "PASS")
            : skipped > 0
              ? c("yellow", "SKIP")
              : c("gray", "EMPTY");

      if (reportType === "console" && total > 0) {
        if (isTty) {
          const status = `[${badge}]`;
          process.stdout.write(`\r${prefix}${status.padEnd(8)}\n`);
        } else {
          // No \r, no overwrite; just print the prefix + badge on its own line.
          initLogger.write(`[${badge}]\n`);
        }
      } else {
        initLogger.write(`[${badge}]\n`);
      }

      let summary;
      if (fileResults.length === 0) {
        summary = `     (no test procedures found)`;
      } else if (pass === 0 && skipped > 0) {
        summary = `     (${skipped} skipped)`;
      } else {
        summary = `     ( tests: ${fileResults.length}, pass: ${pass}, fail: ${fail}${skipped ? `, skipped: ${skipped}` : ""} )`;
      }

      initLogger.log(summary);
    }

    if (!bailed && scripts.coolDown) {
      progressLogger.log(
        `Running coolDown: ${Array.isArray(scripts.coolDown) ? scripts.coolDown.join(", ") : scripts.coolDown}`,
      );
      await runScriptsOnDb(cfg, targetDb, scripts.coolDown, {
        cwd,
        assertSchema,
        debug,
        label: "coolDown",
      });
    }

    const finishedAt = new Date();
    const durationMs = nowMs() - startMs;
    reporter.setRunInfo({ startedAt, finishedAt, durationMs });
    reporter.print();
    return reporter;
  } finally {
    process.off("SIGINT", onSigint);

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
      initLogger.log(`Keeping test database "${targetDb}" (--keep-db).`);
    }
  }
}
