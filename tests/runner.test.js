import { test, describe, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// ============================================================
// Mock sqlcmd.js BEFORE importing runner.js.
// ============================================================

const sqlcmdCalls = [];

mock.module("../src/sqlcmd.js", {
  namedExports: {
    runSqlcmd: async (args) => {
      sqlcmdCalls.push(args);

      // -i <file> call: read the file and decide based on its content.
      const iIndex = args.indexOf("-i");
      if (iIndex !== -1) {
        const filePath = args[iIndex + 1];
        let content = "";
        try {
          content = await readFile(filePath, "utf-8");
        } catch {
          content = "";
        }
        if (content.includes("FAIL_ME")) {
          return {
            code: 1,
            stdout: "",
            stderr: "Msg 50000, Level 16, State 1, Server x, Line 1",
          };
        }
        return { code: 0, stdout: "", stderr: "" };
      }

      // -Q <sql> call.
      const qIndex = args.indexOf("-Q");
      if (qIndex !== -1) {
        const sql = args[qIndex + 1] || "";
        if (sql.includes("FAIL_ME")) {
          return {
            code: 1,
            stdout: "",
            stderr: "Msg 50000, Level 16, State 1, Server x, Line 1",
          };
        }
        const throwMatch = sql.match(/THROW_(\d+)/);
        if (throwMatch) {
          return {
            code: 1,
            stdout: "",
            stderr: `Msg ${throwMatch[1]}, Level 16, State 1, Server x, Line 1`,
          };
        }
        return { code: 0, stdout: "1", stderr: "" };
      }

      return { code: 0, stdout: "1", stderr: "" };
    },
    buildConnectionArgs: (cfg, { database } = {}) => {
      const args = ["-S", cfg.connection?.server ?? "localhost", "-b"];
      if (database) args.push("-d", database);
      return args;
    },
  },
});

// ============================================================
// Mock database.js so runner.js does not hit the real database.
// ============================================================

mock.module("../src/database.js", {
  namedExports: {
    checkConnection: async () => {},
    databaseExists: async (_cfg, dbName) => String(dbName).startsWith("existing_"),
    createDatabase: async () => {},
    dropDatabase: async () => {},
    backupAndRestore: async (_cfg, source, target) => `/tmp/sstr_${source}_${target}.bak`,
    listSstDatabases: async () => [],
    listStoredProcedures: async () => globalThis.__testProcedures ?? [],
    executeTestProcedure: async (_cfg, _db, fullName) => {
      const lower = fullName.toLowerCase();
      if (lower.includes("fail")) {
        return {
          code: 1,
          stdout: "",
          stderr: `Msg 50000, Level 16, State 1, Procedure ${fullName}`,
        };
      }
      if (lower.includes("throw_8134")) {
        return {
          code: 1,
          stdout: "",
          stderr: `Msg 8134, Level 16, State 1, Procedure ${fullName}`,
        };
      }
      return { code: 0, stdout: "1", stderr: "" };
    },
  },
});

const { run } = await import("../src/runner.js");

// ============================================================
// Helpers
// ============================================================

function baseConfig(overrides = {}) {
  return {
    connection: { server: "localhost", trustedConnection: true },
    testMatch: "^test_",
    assertSchema: "Assert",
    testRegex: "\\.test\\.sql$",
    ...overrides,
  };
}

let root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "sstr-runner-"));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function resetRoot() {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
}

async function writeTestFile(name, content) {
  const full = join(root, name);
  await mkdir(join(full, ".."), { recursive: true }).catch(() => {});
  await writeFile(full, content, "utf-8");
  return full;
}

async function writeOptionsFile(sqlFileName, json) {
  const jsonName = sqlFileName.replace(/\.sql$/i, ".json");
  await writeFile(join(root, jsonName), JSON.stringify(json), "utf-8");
}

// ============================================================
// Tests
// ============================================================

describe("run", () => {
  test("passes a simple passing test", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["dbo.test_pass"];
    await writeTestFile("sum.test.sql", "select 1");

    const cfg = baseConfig({ testDb: "sstr_runner_pass" });
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, false);
    assert.equal(reporter.results.length, 1);
    assert.equal(reporter.results[0].passed, true);
    assert.equal(reporter.results[0].procedure, "dbo.test_pass");
  });

  test("fails a failing test", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["dbo.test_fail"];
    await writeTestFile("sum.test.sql", "select 1");

    const cfg = baseConfig({ testDb: "sstr_runner_fail" });
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, true);
    assert.equal(reporter.results[0].passed, false);
    assert.match(reporter.results[0].error, /Msg 50000/);
  });

  test("marks the entire file as failed when the script fails", async () => {
    await resetRoot();
    globalThis.__testProcedures = [];
    await writeTestFile("failfile.test.sql", "FAIL_ME");

    const cfg = baseConfig({ testDb: "sstr_runner_scriptfail" });
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, true);
    assert.equal(reporter.results[0].procedure, "(entire script)");
    assert.equal(reporter.skippedFiles.length, 1);
  });

  test("skips tests marked skip:true in the JSON file", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["dbo.test_pass", "dbo.test_skipped"];
    await writeTestFile("sum.test.sql", "select 1");
    await writeOptionsFile("sum.test.sql", {
      tests: { test_skipped: { skip: true } },
    });

    const cfg = baseConfig({ testDb: "sstr_runner_skip" });
    const reporter = await run(cfg, { cwd: root });

    const skipped = reporter.results.find((r) => r.procedure === "dbo.test_skipped");
    assert.ok(skipped);
    assert.equal(skipped.skipped, true);
    assert.equal(skipped.passed, true);

    const passed = reporter.results.find((r) => r.procedure === "dbo.test_pass");
    assert.ok(passed);
    assert.equal(passed.skipped, false);
    assert.equal(passed.passed, true);
  });

  test("throws:true passes when the test fails", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["dbo.test_fail"];
    await writeTestFile("sum.test.sql", "select 1");
    await writeOptionsFile("sum.test.sql", {
      tests: { test_fail: { throws: true } },
    });

    const cfg = baseConfig({ testDb: "sstr_runner_throws_true" });
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, false);
    assert.equal(reporter.results[0].passed, true);
  });

  test("throws:true fails when the test succeeds", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["dbo.test_pass"];
    await writeTestFile("sum.test.sql", "select 1");
    await writeOptionsFile("sum.test.sql", {
      tests: { test_pass: { throws: true } },
    });

    const cfg = baseConfig({ testDb: "sstr_runner_throws_true_fail" });
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, true);
    assert.equal(reporter.results[0].passed, false);
    assert.match(reporter.results[0].error, /Expected an error/);
  });

  test("throws:<number> passes when the error number matches", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["dbo.test_throw_8134"];
    await writeTestFile("sum.test.sql", "select 1");
    await writeOptionsFile("sum.test.sql", {
      tests: { test_throw_8134: { throws: 8134 } },
    });

    const cfg = baseConfig({ testDb: "sstr_runner_throws_num" });
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, false);
    assert.equal(reporter.results[0].passed, true);
  });

  test("throws:<number> fails when the error number differs", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["dbo.test_throw_8134"];
    await writeTestFile("sum.test.sql", "select 1");
    await writeOptionsFile("sum.test.sql", {
      tests: { test_throw_8134: { throws: 50000 } },
    });

    const cfg = baseConfig({ testDb: "sstr_runner_throws_num_fail" });
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, true);
    assert.equal(reporter.results[0].passed, false);
    assert.match(reporter.results[0].error, /Expected error 50000/);
  });

  test("bail stops after the first failure", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["dbo.test_fail", "dbo.test_pass", "dbo.test_pass2"];
    await writeTestFile("sum.test.sql", "select 1");

    const cfg = baseConfig({ testDb: "sstr_runner_bail" });
    const reporter = await run(cfg, { cwd: root, bail: true });

    assert.equal(reporter.results.length, 1);
    assert.equal(reporter.results[0].passed, false);
  });

  test("warns on unknown options in the JSON file", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["dbo.test_pass"];
    await writeTestFile("sum.test.sql", "select 1");
    await writeOptionsFile("sum.test.sql", { options: { timer: 10 } });

    const errors = [];
    const fakeLogger = { log: () => {}, error: (m) => errors.push(m) };

    const cfg = baseConfig({ testDb: "sstr_runner_warn" });
    await run(cfg, { cwd: root, logger: fakeLogger });

    assert.ok(errors.some((m) => /Unknown option "timer"/.test(m)));
  });

  test("aborts with a clear error on invalid JSON", async () => {
    await resetRoot();
    globalThis.__testProcedures = [];
    await writeTestFile("sum.test.sql", "select 1");
    await writeFile(join(root, "sum.test.json"), "{ invalid", "utf-8");

    const cfg = baseConfig({ testDb: "sstr_runner_invalidjson" });
    await assert.rejects(() => run(cfg, { cwd: root }), /Invalid JSON in ".*sum\.test\.json"/);
  });

  test("uses testSchema to include non-prefixed procedures", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["sstr.any_name", "dbo.test_pass"];
    await writeTestFile("sum.test.sql", "select 1");

    const cfg = baseConfig({
      testDb: "sstr_runner_testschema",
      testSchema: "sstr",
    });
    const reporter = await run(cfg, { cwd: root });

    const procs = reporter.results.map((r) => r.procedure).sort();
    assert.deepEqual(procs, ["dbo.test_pass", "sstr.any_name"]);
  });

  test("always treats the sstr schema as a test schema", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["sstr.any_name"];
    await writeTestFile("sum.test.sql", "select 1");

    const cfg = baseConfig({ testDb: "sstr_runner_sstr_schema" });
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.results.length, 1);
    assert.equal(reporter.results[0].procedure, "sstr.any_name");
  });

  test("does not run assertion-schema procedures", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["Assert.IsTrue", "dbo.test_pass"];
    await writeTestFile("sum.test.sql", "select 1");

    const cfg = baseConfig({ testDb: "sstr_runner_assert_excluded" });
    const reporter = await run(cfg, { cwd: root });

    const procs = reporter.results.map((r) => r.procedure);
    assert.ok(!procs.includes("Assert.IsTrue"));
    assert.ok(procs.includes("dbo.test_pass"));
  });

  test("logs execution time only when logExecution is true", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["dbo.test_pass"];
    await writeTestFile("sum.test.sql", "select 1");
    await writeOptionsFile("sum.test.sql", {
      tests: { test_pass: { logExecution: true } },
    });

    const cfg = baseConfig({ testDb: "sstr_runner_logtime" });
    const reporter = await run(cfg, { cwd: root });

    assert.ok(reporter.results[0].durationMs != null);
  });

  test("does not log execution time by default", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["dbo.test_pass"];
    await writeTestFile("sum.test.sql", "select 1");

    const cfg = baseConfig({ testDb: "sstr_runner_nologtime" });
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.results[0].durationMs, null);
  });

  test("uses a separate restored database when testDb exists", async () => {
    await resetRoot();
    globalThis.__testProcedures = ["dbo.test_pass"];
    await writeTestFile("sum.test.sql", "select 1");

    const cfg = baseConfig({ testDb: "existing_db" });
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, false);
  });
});
