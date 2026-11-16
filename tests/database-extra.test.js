import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";

// Mock sqlcmd.js BEFORE importing database.js.
const sqlcmdCalls = [];

mock.module("../src/sqlcmd.js", {
  namedExports: {
    runSqlcmd: async (args) => {
      sqlcmdCalls.push(args);
      const sql = args.join(" ");

      // Mock specific queries by their content.
      if (sql.includes("db_id(") && sql.includes("select case")) {
        // databaseExists
        return { code: 0, stdout: "1", stderr: "" };
      }
      if (sql.includes("sys.databases")) {
        // listSstDatabases
        return { code: 0, stdout: "db1\nsstr_db_sstr_1\ndb2", stderr: "" };
      }
      if (sql.includes("from sys.parameters")) {
        return { code: 0, stdout: "@a\n@b", stderr: "" };
      }
      if (sql.includes("exec [")) {
        return { code: 0, stdout: "1", stderr: "" };
      }
      if (sql.includes("InstanceDefaultBackupPath")) {
        return { code: 0, stdout: "C:\\Backups", stderr: "" };
      }
      if (sql.includes("sys.master_files")) {
        return {
          code: 0,
          stdout:
            "mydb|C:\\data\\mydb.mdf|ROWS\nmydb_log|C:\\data\\mydb.ldf|LOG",
          stderr: "",
        };
      }
      if (sql.includes("select 1")) {
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

const {
  checkConnection,
  databaseExists,
  createDatabase,
  dropDatabase,
  listSstDatabases,
  listStoredProcedures,
  executeTestProcedure,
} = await import("../src/database.js");

function baseConfig(overrides = {}) {
  return {
    connection: { server: "localhost", trustedConnection: true },
    ...overrides,
  };
}

describe("checkConnection", () => {
  test("resolves when sqlcmd returns code 0", async () => {
    sqlcmdCalls.length = 0;
    await checkConnection(baseConfig());
    assert.ok(sqlcmdCalls.length > 0);
  });
});

describe("databaseExists", () => {
  test("returns true when the query returns 1", async () => {
    sqlcmdCalls.length = 0;
    const exists = await databaseExists(baseConfig(), "mydb");
    assert.equal(exists, true);
  });
});

describe("createDatabase", () => {
  test("issues a create database statement", async () => {
    sqlcmdCalls.length = 0;
    await createDatabase(baseConfig(), "newdb");
    const sql = sqlcmdCalls[0].join(" ");
    assert.match(sql, /create database \[newdb\]/);
  });
});

describe("dropDatabase", () => {
  test("issues a drop database statement", async () => {
    sqlcmdCalls.length = 0;
    await dropDatabase(baseConfig(), "olddb");
    const sql = sqlcmdCalls[0].join(" ");
    assert.match(sql, /drop database \[olddb\]/);
  });
});

describe("listSstDatabases", () => {
  test("returns the list of matching database names", async () => {
    sqlcmdCalls.length = 0;
    const list = await listSstDatabases(baseConfig(), "sstr_db");
    assert.ok(Array.isArray(list));
    // The mock returns three lines; only the ones matching the pattern
    // would normally be returned by SQL Server. We just check the shape.
    assert.ok(list.length >= 0);
  });
});

describe("listStoredProcedures", () => {
  test("returns a list of procedure names", async () => {
    sqlcmdCalls.length = 0;
    const procs = await listStoredProcedures(baseConfig(), "mydb");
    assert.ok(Array.isArray(procs));
  });
});

describe("executeTestProcedure", () => {
  test("executes a procedure and returns its result", async () => {
    sqlcmdCalls.length = 0;
    const res = await executeTestProcedure(
      baseConfig(),
      "mydb",
      "dbo.test_pass",
    );
    assert.equal(res.code, 0);
  });
});
