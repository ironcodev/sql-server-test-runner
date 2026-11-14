import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { loadConfig } from "../src/config.js";

let root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "sstr-loadconfig-"));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function resetRoot() {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
}

async function writeJson(relPath, obj) {
  const full = join(root, relPath);
  await mkdir(join(full, ".."), { recursive: true }).catch(() => {});
  await writeFile(full, JSON.stringify(obj), "utf-8");
  return full;
}

const minimalBase = {
  connection: { server: "localhost", trustedConnection: true },
  testDb: "my_test_db",
  testMatch: "^test_",
};

describe("loadConfig", () => {
  test("loads a base config from cwd", async () => {
    await resetRoot();
    await writeJson("sstr.config.json", minimalBase);

    const cfg = await loadConfig(root);
    assert.equal(cfg.testDb, "my_test_db");
    assert.equal(cfg.connection.server, "localhost");
  });

  test("throws when the base config is missing", async () => {
    await resetRoot();
    await assert.rejects(() => loadConfig(root), /Config file ".*sstr\.config\.json" not found/);
  });

  test("merges sstr.config.{env}.json on top of the base config", async () => {
    await resetRoot();
    await writeJson("sstr.config.json", minimalBase);
    await writeJson("sstr.config.development.json", {
      connection: { server: "dev-sql.example.com", username: "dev_user" },
      loginTimeout: 30,
    });

    const cfg = await loadConfig(root, "development");
    // Overridden:
    assert.equal(cfg.connection.server, "dev-sql.example.com");
    assert.equal(cfg.connection.username, "dev_user");
    assert.equal(cfg.loginTimeout, 30);
    // Preserved from the base:
    assert.equal(cfg.connection.trustedConnection, true);
    assert.equal(cfg.testDb, "my_test_db");
    assert.equal(cfg.testMatch, "^test_");
  });

  test("shallow-merges connection, scripts, sqlCmdOptions, defaultTestOptions", async () => {
    await resetRoot();
    await writeJson("sstr.config.json", {
      connection: { server: "localhost", trustedConnection: true },
      testDb: "base_db",
      scripts: { warmUp: "base-warmup.sql" },
      sqlCmdOptions: { enableQuotedIdentifiers: true },
      defaultTestOptions: { logExecution: false },
    });
    await writeJson("sstr.config.development.json", {
      scripts: { preScript: "dev-pre.sql" },
      sqlCmdOptions: { batchTerminator: "GO" },
      defaultTestOptions: { logExecution: true },
    });

    const cfg = await loadConfig(root, "development");
    assert.equal(cfg.connection.server, "localhost");
    assert.equal(cfg.scripts.warmUp, "base-warmup.sql");
    assert.equal(cfg.scripts.preScript, "dev-pre.sql");
    assert.equal(cfg.sqlCmdOptions.enableQuotedIdentifiers, true);
    assert.equal(cfg.sqlCmdOptions.batchTerminator, "GO");
    assert.equal(cfg.defaultTestOptions.logExecution, true);
  });

  test("replaces scalar fields instead of merging", async () => {
    await resetRoot();
    await writeJson("sstr.config.json", { ...minimalBase, loginTimeout: 10 });
    await writeJson("sstr.config.development.json", { loginTimeout: 60 });

    const cfg = await loadConfig(root, "development");
    assert.equal(cfg.loginTimeout, 60);
  });

  test("ignores the env file when --env is not given", async () => {
    await resetRoot();
    await writeJson("sstr.config.json", minimalBase);
    await writeJson("sstr.config.development.json", {
      connection: { server: "dev-sql.example.com" },
    });

    const cfg = await loadConfig(root);
    assert.equal(cfg.connection.server, "localhost");
  });

  test("ignores a missing env file", async () => {
    await resetRoot();
    await writeJson("sstr.config.json", minimalBase);

    const cfg = await loadConfig(root, "staging");
    assert.equal(cfg.connection.server, "localhost");
  });

  test("uses an absolute configPath as the base config", async () => {
    await resetRoot();
    const absPath = join(root, "custom", "base.json");
    await writeJson("custom/base.json", {
      ...minimalBase,
      testDb: "custom_db",
    });

    const cfg = await loadConfig(root, null, { configPath: absPath });
    assert.equal(cfg.testDb, "custom_db");
  });

  test("uses a relative configPath resolved against cwd", async () => {
    await resetRoot();
    await writeJson("configs/base.json", {
      ...minimalBase,
      testDb: "relative_db",
    });

    const cfg = await loadConfig(root, null, {
      configPath: "configs/base.json",
    });
    assert.equal(cfg.testDb, "relative_db");
  });

  test("looks up the env file next to a custom configPath", async () => {
    await resetRoot();
    await writeJson("configs/base.json", {
      ...minimalBase,
      testDb: "custom_db",
    });
    await writeJson("configs/sstr.config.ci.json", {
      connection: { server: "ci-sql.example.com" },
    });

    const cfg = await loadConfig(root, "ci", {
      configPath: "configs/base.json",
    });
    assert.equal(cfg.connection.server, "ci-sql.example.com");
    assert.equal(cfg.testDb, "custom_db");
  });

  test("throws when the custom configPath does not exist", async () => {
    await resetRoot();
    await assert.rejects(
      () => loadConfig(root, null, { configPath: "missing.json" }),
      /Config file ".*missing\.json" not found/,
    );
  });

  test("does not mutate the base config object", async () => {
    await resetRoot();
    const base = { ...minimalBase, connection: { ...minimalBase.connection } };
    await writeJson("sstr.config.json", base);
    await writeJson("sstr.config.development.json", {
      connection: { server: "dev-sql.example.com" },
    });

    const cfg = await loadConfig(root, "development");
    // The original object passed to writeJson is untouched.
    assert.equal(base.connection.server, "localhost");
    // The merged config has the override.
    assert.equal(cfg.connection.server, "dev-sql.example.com");
  });
});
