import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { run } from "../src/runner.js";
import { validateConfig } from "../src/config.js";
import { randomUUID } from "crypto";

// These tests only run when SQLSERVER_HOST is set.
// `scripts/test-integration.mjs` sets it before running.
const enabled = Boolean(process.env.SQLSERVER_HOST);

function baseConfig(overrides = {}) {
  const trusted = process.env.SQLSERVER_TRUSTED === "1";
  return {
    connection: {
      server: process.env.SQLSERVER_HOST,
      trustedConnection: trusted,
      username: trusted ? undefined : process.env.SQLSERVER_USER || "sa",
      password: trusted ? undefined : process.env.SQLSERVER_PASSWORD,
      trustServerCertificate: true,
    },
    testDb: `sstr_it_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    testMatch: "^test_",
    assertSchema: "Assert",
    testRegex: "\\.test\\.sql$",
    ...overrides,
  };
}

let root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "sstr-it-"));
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

describe("integration: run", { skip: !enabled }, () => {
  test("connects to the server", async () => {
    const cfg = baseConfig();
    validateConfig(cfg);

    // Run with no test files: should connect, create/drop the test DB,
    // deploy assertions, and finish with zero results.
    await resetRoot();
    const reporter = await run(cfg, { cwd: root });
    assert.equal(reporter.hasFailures, false);
    assert.equal(reporter.results.length, 0);
  });

  test("runs a passing test", async () => {
    await resetRoot();
    await writeTestFile(
      "sum.test.sql",
      `
      create or alter proc test_one_equals_one
      as
      begin
          set nocount on;
          exec Assert.Equals 1, 1;
      end
      go
      `,
    );

    const cfg = baseConfig();
    validateConfig(cfg);
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, false);
    assert.equal(reporter.results.length, 1);
    assert.equal(reporter.results[0].passed, true);
    assert.equal(reporter.results[0].procedure, "dbo.test_one_equals_one");
  });

  test("reports a failing test", async () => {
    await resetRoot();
    await writeTestFile(
      "sum.test.sql",
      `
        create or alter proc test_one_equals_two
        as
        begin
            set nocount on;
            exec Assert.Equals 1, 2;
        end
        go
        `,
    );

    const cfg = baseConfig();
    validateConfig(cfg);
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.results.length, 1, "expected exactly one result");
    assert.equal(reporter.results[0].passed, false, "expected the test to fail");
    assert.match(reporter.results[0].error, /Equals failed/, "expected the error to mention 'Equals failed'");
    assert.equal(reporter.hasFailures, true, "expected hasFailures to be true");
  });

  test("skip option prevents execution", async () => {
    await resetRoot();
    await writeTestFile(
      "sum.test.sql",
      `
      create or alter proc test_should_be_skipped
      as
      begin
          set nocount on;
          exec Assert.Equals 1, 2;
      end
      go
      `,
    );
    await writeFile(
      join(root, "sum.test.json"),
      JSON.stringify({ tests: { test_should_be_skipped: { skip: true } } }),
      "utf-8",
    );

    const cfg = baseConfig();
    validateConfig(cfg);
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, false);
    assert.equal(reporter.results[0].skipped, true);
    assert.equal(reporter.results[0].passed, true);
  });

  test("throws:true passes when the test fails", async () => {
    await resetRoot();
    await writeTestFile(
      "sum.test.sql",
      `
      create or alter proc test_should_fail
      as
      begin
          set nocount on;
          raiserror('boom', 16, 1);
      end
      go
      `,
    );
    await writeFile(
      join(root, "sum.test.json"),
      JSON.stringify({ tests: { test_should_fail: { throws: true } } }),
      "utf-8",
    );

    const cfg = baseConfig();
    validateConfig(cfg);
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, false);
    assert.equal(reporter.results[0].passed, true);
  });

  test("throws:<number> passes when the error number matches", async () => {
    await resetRoot();
    await writeTestFile(
      "sum.test.sql",
      `
      create or alter proc test_throws_50000
      as
      begin
          set nocount on;
          raiserror('expected', 16, 1);
      end
      go
      `,
    );
    await writeFile(
      join(root, "sum.test.json"),
      JSON.stringify({ tests: { test_throws_50000: { throws: 50000 } } }),
      "utf-8",
    );

    const cfg = baseConfig();
    validateConfig(cfg);
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, false);
    assert.equal(reporter.results[0].passed, true);
  });

  test("warns when a test passes without calling an assertion", async () => {
    await resetRoot();
    await writeTestFile(
      "sum.test.sql",
      `
      create or alter proc test_no_assertion
      as
      begin
          set nocount on;
          declare @x int = 1;
      end
      go
      `,
    );

    const cfg = baseConfig();
    validateConfig(cfg);
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, false);
    assert.equal(reporter.results[0].passed, true);
    assert.match(reporter.results[0].warning, /without calling any assertion/);
  });

  test("logs execution time when logExecution is true", async () => {
    await resetRoot();
    await writeTestFile(
      "sum.test.sql",
      `
      create or alter proc test_with_time
      as
      begin
          set nocount on;
          exec Assert.Equals 1, 1;
      end
      go
      `,
    );
    await writeFile(
      join(root, "sum.test.json"),
      JSON.stringify({ tests: { test_with_time: { logExecution: true } } }),
      "utf-8",
    );

    const cfg = baseConfig();
    validateConfig(cfg);
    const reporter = await run(cfg, { cwd: root });

    assert.equal(reporter.hasFailures, false);
    assert.ok(reporter.results[0].durationMs != null);
  });
});
