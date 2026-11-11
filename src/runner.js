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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_TEST_DB = "sstr_testdb";
const DEFAULT_ASSERT_SCHEMA = "Assert";
const DEFAULT_TEST_MATCH = "^test.*$";

function resolvePath(cwd, p) {
  if (!p) return null;
  return isAbsolute(p) ? p : join(cwd, p);
}

async function runScriptOnDb(
  cfg,
  dbName,
  scriptPath,
  { assertSchema, debug } = {},
) {
  const args = buildConnectionArgs(cfg, { database: dbName });
  if (assertSchema) args.push("-v", `AssertSchema=${assertSchema}`);
  args.push("-i", scriptPath);
  return runSqlcmd(args, { debug });
}

async function runScriptTextOnDb(
  cfg,
  dbName,
  scriptText,
  { assertSchema, debug } = {},
) {
  // Write the script to a temporary file so sqlcmd can handle GO batches.
  const tmpFile = join(
    tmpdir(),
    `sstr_assert_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`,
  );
  await writeFile(tmpFile, scriptText, "utf-8");
  try {
    const args = buildConnectionArgs(cfg, { database: dbName });
    if (assertSchema) args.push("-v", `AssertSchema=${assertSchema}`);
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

function isTestProcedure(fullName, { assertSchema, testSchema, testMatch }) {
  const parts = fullName.split(".");
  const name = parts[parts.length - 1];
  const schema = parts.length > 1 ? parts.slice(0, -1).join(".") : "dbo";

  if (assertSchema && schema.toLowerCase() === assertSchema.toLowerCase())
    return false;
  if (testSchema && schema.toLowerCase() === testSchema.toLowerCase())
    return true;
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
  const testSchema = cfg.testSchema || null;
  const testMatch = new RegExp(cfg.testMatch || DEFAULT_TEST_MATCH, "i");
  const reporter = createReporter(reportType, { color });
  const debug = detailed === true;

  // For JSON/JUnit reporters, keep stdout clean; route progress to stderr.
  const progressLogger =
    reportType === "console"
      ? logger
      : {
          log: (...a) => console.error(...a),
          error: (...a) => console.error(...a),
        };

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
    progressLogger.log(
      `Backing up "${testDb}" and restoring as "${targetDb}"...`,
    );
    backupFile = await backupAndRestore(cfg, testDb, targetDb, { debug });
    progressLogger.log("Restore completed.");
  }

  try {
    progressLogger.log("Creating assertion procedures...");
    const assertSql = await readFile(
      join(__dirname, "assert-script.sql"),
      "utf-8",
    );
    const assertRes = await runScriptTextOnDb(cfg, targetDb, assertSql, {
      assertSchema,
      debug: false,
    });
    if (assertRes.code !== 0) {
      throw new Error(
        `Failed to deploy assertion procedures:\n${assertRes.stderr || assertRes.stdout}`,
      );
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
          throw new Error(
            `preScript failed for "${file}":\n${res.stderr || res.stdout}`,
          );
        }
      }

      progressLogger.log(`Running test script: ${file}`);
      const t0 = nowMs();
      const res = await runScriptOnDb(cfg, targetDb, file, {
        assertSchema,
        debug,
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
        const testProcs = newOnes.filter((full) =>
          isTestProcedure(full, { assertSchema, testSchema, testMatch }),
        );

        for (const full of testProcs) {
          const t1 = nowMs();
          const execRes = await executeTestProcedure(cfg, targetDb, full, {
            debug,
            useTransaction,
          });
          const t2 = nowMs() - t1;
          const passed = execRes.code === 0;
          reporter.addResult({
            file,
            procedure: full,
            passed,
            error: passed ? null : execRes.stderr || execRes.stdout,
            durationMs: t2,
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
          throw new Error(
            `postScript failed for "${file}":\n${postRes.stderr || postRes.stdout}`,
          );
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
        progressLogger.error(
          `Failed to drop database "${targetDb}": ${e.message}`,
        );
      }

      if (backupFile && cfg.cleanupBackup === true) {
        try {
          await unlink(backupFile);
          progressLogger.log(`Removed backup file: ${backupFile}`);
        } catch (e) {
          progressLogger.error(
            `Failed to remove backup file "${backupFile}": ${e.message}`,
          );
        }
      }
    } else {
      progressLogger.log(`Keeping test database "${targetDb}" (--keep-db).`);
    }
  }
}
