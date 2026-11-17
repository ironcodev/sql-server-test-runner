import { test, describe, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { readTextFile } from "../src/file-utils.js";

mock.module("../src/database.js", {
  exports: {
    checkConnection: async () => {},
    databaseExists: async () => false,
    createDatabase: async () => {},
    dropDatabase: async () => {},
    backupAndRestore: async () => null,
    listSstrDatabases: async () => [],
    listStoredProcedures: async () => [],
    executeTestProcedure: async () => ({ code: 0, stdout: "", stderr: "" }),
  },
});

const { run } = await import("../src/runner.js");

const sqlcmdCalls = [];

const fakeRunSqlcmd = async (args, options) => {
  sqlcmdCalls.push({ args, options });
  const iIndex = args.indexOf("-i");
  if (iIndex !== -1) {
    const filePath = args[iIndex + 1] || "";
    // Read the file and check for a marker.
    let content = "";
    try {
      content = await readTextFile(filePath);
    } catch {
      content = "";
    }
    if (content.includes("FAIL_ME") || content.includes("fail-script")) {
      return { code: 1, stdout: "", stderr: "boom" };
    }
    return { code: 0, stdout: "", stderr: "" };
  }
  return { code: 0, stdout: "1", stderr: "" };
};

let root;
before(async () => {
  root = await mkdtemp(join(tmpdir(), "sstr-scripts-array-"));
});
after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function reset() {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
}

async function writeSql(name, content = "select 1") {
  const full = join(root, name);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf-8");
  return full;
}

function baseConfig(overrides = {}) {
  return {
    connection: { server: "localhost", trustedConnection: true },
    testMatch: "^test_",
    assertSchema: "Assert",
    testRegex: "\\.test\\.sql$",
    testDb: "sstr_scripts_array_test",
    scripts: {},
    runSqlcmd: fakeRunSqlcmd,
    ...overrides,
  };
}

describe("scripts as arrays", () => {
  test("runs warmUp files in order", async () => {
    await reset();
    await writeSql("tests/warmup1.sql");
    await writeSql("tests/warmup2.sql");

    sqlcmdCalls.length = 0;

    const cfg = baseConfig({
      scripts: { warmUp: ["tests/warmup1.sql", "tests/warmup2.sql"] },
    });
    await run(cfg, { cwd: root });
    const warmupCalls = sqlcmdCalls.filter(
      (item) => item.options.label == "warmUp",
    );
    assert.equal(warmupCalls.length, 2);
  });

  test("runs coolDown files in order", async () => {
    await reset();
    await writeSql("tests/cooldown1.sql");
    await writeSql("tests/cooldown2.sql");
    sqlcmdCalls.length = 0;

    const cfg = baseConfig({
      scripts: { coolDown: ["tests/cooldown1.sql", "tests/cooldown2.sql"] },
    });
    await run(cfg, { cwd: root });

    const calls = sqlcmdCalls.filter(
      (item) => item.options.label == "coolDown",
    );
    assert.equal(calls.length, 2);
  });

  test("accepts a single string for warmUp", async () => {
    await reset();
    await writeSql("tests/warmup1.sql");
    sqlcmdCalls.length = 0;

    const cfg = baseConfig({ scripts: { warmUp: "tests/warmup1.sql" } });
    await run(cfg, { cwd: root });

    const calls = sqlcmdCalls.filter((item) => item.options.label == "warmUp");
    assert.equal(calls.length, 1);
  });

  test("aborts when a warmUp file fails", async () => {
    await reset();
    await writeSql("tests/fail-script.sql", "FAIL_ME");
    await writeSql("tests/warmup2.sql", "select 1");
    sqlcmdCalls.length = 0;

    const cfg = baseConfig({
      scripts: { warmUp: ["tests/fail-script.sql", "tests/warmup2.sql"] },
    });

    await assert.rejects(
      () => run(cfg, { cwd: root }),
      /warmUp "tests\/fail-script\.sql" failed/,
    );
  });
});
