import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { loadTestOptions } from "../src/options.js";

let root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "sstr-options-"));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

function testFile(name) {
  return join(root, name);
}

describe("loadTestOptions", () => {
  test("returns empty structures when JSON file is missing", async () => {
    const sql = testFile("missing.test.sql");
    await writeFile(sql, "select 1");
    const out = await loadTestOptions(sql);
    assert.deepEqual(out.options, {});
    assert.equal(out.tests.size, 0);
    assert.deepEqual(out.warnings, []);
  });

  test("parses valid JSON with options and tests", async () => {
    const sql = testFile("valid.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(
      testFile("valid.test.json"),
      JSON.stringify({
        options: { logExecution: true },
        tests: {
          my_test: { skip: true, timeout: 30 },
        },
      }),
    );
    const out = await loadTestOptions(sql);
    assert.deepEqual(out.options, { logExecution: true });
    assert.equal(out.tests.size, 1);
    const t = out.tests.get("my_test");
    assert.deepEqual(t, { skip: true, timeout: 30 });
  });

  test("lowercases test names", async () => {
    const sql = testFile("case.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(testFile("case.test.json"), JSON.stringify({ tests: { My_Test: { skip: true } } }));
    const out = await loadTestOptions(sql);
    assert.ok(out.tests.has("my_test"));
    assert.ok(!out.tests.has("My_Test"));
  });

  test("throws on invalid JSON", async () => {
    const sql = testFile("invalid.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(testFile("invalid.test.json"), "{ invalid");
    await assert.rejects(() => loadTestOptions(sql), /Invalid JSON in ".*invalid\.test\.json"/);
  });

  test("warns on unknown keys in options", async () => {
    const sql = testFile("unknown.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(testFile("unknown.test.json"), JSON.stringify({ options: { timer: 10 } }));
    const out = await loadTestOptions(sql);
    assert.equal(out.warnings.length, 1);
    assert.match(out.warnings[0], /Unknown option "timer"/);
  });

  test("warns on unknown keys in a test", async () => {
    const sql = testFile("unknown2.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(testFile("unknown2.test.json"), JSON.stringify({ tests: { my_test: { timout: 10 } } }));
    const out = await loadTestOptions(sql);
    assert.equal(out.warnings.length, 1);
    assert.match(out.warnings[0], /Unknown option "timout" for test "my_test"/);
  });

  test("throws if options is not an object", async () => {
    const sql = testFile("badopts.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(testFile("badopts.test.json"), JSON.stringify({ options: [] }));
    await assert.rejects(() => loadTestOptions(sql), /"options" must be an object/);
  });
});
