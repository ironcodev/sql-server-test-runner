import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";

// ============================================================
// Mock sqlcmd.js BEFORE importing database.js.
// ============================================================

const sqlcmdCalls = [];

mock.module("../src/sqlcmd.js", {
  namedExports: {
    runSqlcmd: async (args) => {
      sqlcmdCalls.push(args);
      const sql = args.join(" ");

      // Parameter lookup.
      if (sql.includes("from sys.parameters")) {
        return { code: 0, stdout: "@a\n@b", stderr: "" };
      }

      // Connection check.
      if (sql.includes("select 1")) {
        return { code: 0, stdout: "1", stderr: "" };
      }

      // Procedure execution.
      if (sql.includes("exec [")) {
        if (sql.includes("[fail]")) {
          return {
            code: 1,
            stdout: "",
            stderr: "Msg 50000, Level 16, State 1, Procedure fail",
          };
        }
        return { code: 0, stdout: "1", stderr: "" };
      }

      return { code: 0, stdout: "", stderr: "" };
    },
    buildConnectionArgs: (cfg, { database } = {}) => {
      const args = ["-S", cfg.connection?.server ?? "localhost", "-b"];
      if (database) args.push("-d", database);
      return args;
    },
  },
});

const { executeTestProcedure, buildSqlServerPath } = await import("../src/database.js");

function baseConfig(overrides = {}) {
  return {
    connection: { server: "localhost", trustedConnection: true },
    queryTimeout: 30,
    ...overrides,
  };
}

// ============================================================
// buildSqlServerPath
// ============================================================

describe("buildSqlServerPath", () => {
  test("uses backslashes on Windows", () => {
    const p = buildSqlServerPath("C:\\temp", "file.bak", "win32");
    assert.equal(p, "C:\\temp\\file.bak");
  });

  test("uses forward slashes on Linux/macOS", () => {
    const p = buildSqlServerPath("/tmp", "file.bak", "linux");
    assert.equal(p, "/tmp/file.bak");
  });

  test("escapes single quotes", () => {
    const p = buildSqlServerPath("/tmp", "it's.bak", "linux");
    assert.equal(p, "/tmp/it''s.bak");
  });

  test("strips trailing separators from the directory", () => {
    const p = buildSqlServerPath("/tmp///", "file.bak", "linux");
    assert.equal(p, "/tmp/file.bak");
  });

  test("strips trailing backslashes on Windows", () => {
    const p = buildSqlServerPath("C:\\temp\\\\", "file.bak", "win32");
    assert.equal(p, "C:\\temp\\file.bak");
  });
});

// ============================================================
// executeTestProcedure
// ============================================================

describe("executeTestProcedure", () => {
  test("looks up parameters and executes with null for each", async () => {
    sqlcmdCalls.length = 0;

    const res = await executeTestProcedure(baseConfig(), "testdb", "dbo.test_pass");

    assert.equal(res.code, 0);

    const execCall = sqlcmdCalls.find((args) => args.join(" ").includes("exec ["));
    assert.ok(execCall, "expected an exec call");
    const sql = execCall.join(" ");

    assert.match(sql, /exec \[dbo\]\.\[test_pass\]/);
    assert.match(sql, /@a = null/);
    assert.match(sql, /@b = null/);
    assert.match(sql, /begin transaction/);
    assert.match(sql, /rollback transaction/);
    assert.match(sql, /throw/);
  });

  test("does not wrap in a transaction when useTransaction is false", async () => {
    sqlcmdCalls.length = 0;

    await executeTestProcedure(baseConfig(), "testdb", "dbo.test_pass", {
      useTransaction: false,
    });

    const execCall = sqlcmdCalls.find((args) => args.join(" ").includes("exec ["));
    const sql = execCall.join(" ");

    assert.doesNotMatch(sql, /begin transaction/);
    assert.doesNotMatch(sql, /rollback transaction/);
    assert.match(sql, /exec \[dbo\]\.\[test_pass\]/);
  });

  test("passes the per-test queryTimeout as -t", async () => {
    sqlcmdCalls.length = 0;

    await executeTestProcedure(baseConfig(), "testdb", "dbo.test_pass", {
      queryTimeout: 5,
    });

    const execCall = sqlcmdCalls.find((args) => args.join(" ").includes("exec ["));

    const tIndex = execCall.indexOf("-t");
    assert.notEqual(tIndex, -1, "expected -t in args");
    assert.equal(execCall[tIndex + 1], "5");
  });

  test("does not add -t when per-test timeout is null", async () => {
    sqlcmdCalls.length = 0;

    await executeTestProcedure(baseConfig(), "testdb", "dbo.test_pass", {
      queryTimeout: null,
    });

    const execCall = sqlcmdCalls.find((args) => args.join(" ").includes("exec ["));

    assert.equal(execCall.indexOf("-t"), -1);
  });

  test("returns the sqlcmd error for a failing procedure", async () => {
    sqlcmdCalls.length = 0;

    const res = await executeTestProcedure(baseConfig(), "testdb", "dbo.fail");

    assert.equal(res.code, 1);
    assert.match(res.stderr, /Msg 50000/);
  });

  test("throws on an invalid procedure name", async () => {
    await assert.rejects(() => executeTestProcedure(baseConfig(), "testdb", "no_schema"), /Invalid procedure name/);
  });
});
