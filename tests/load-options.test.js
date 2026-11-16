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
    assert.equal(out.tests.size, 0);
    assert.deepEqual(out.warnings, []);
  });

  test("parses a flat JSON object keyed by procedure name", async () => {
    const sql = testFile("valid.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(
      testFile("valid.test.json"),
      JSON.stringify({
        my_test: { skip: true, timeout: 30 },
      }),
    );
    const out = await loadTestOptions(sql);
    assert.equal(out.tests.size, 1);
    assert.deepEqual(out.tests.get("my_test"), { skip: true, timeout: 30 });
  });

  test("lowercases test names", async () => {
    const sql = testFile("case.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(
      testFile("case.test.json"),
      JSON.stringify({ My_Test: { skip: true } }),
    );
    const out = await loadTestOptions(sql);
    assert.ok(out.tests.has("my_test"));
    assert.ok(!out.tests.has("My_Test"));
  });

  test("throws on invalid JSON", async () => {
    const sql = testFile("invalid.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(testFile("invalid.test.json"), "{ invalid");
    await assert.rejects(
      () => loadTestOptions(sql),
      /Invalid JSON in ".*invalid\.test\.json"/,
    );
  });

  test("warns on unknown keys in a test", async () => {
    const sql = testFile("unknown.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(
      testFile("unknown.test.json"),
      JSON.stringify({ my_test: { timout: 10 } }),
    );
    const out = await loadTestOptions(sql);
    assert.equal(out.warnings.length, 1);
    assert.match(out.warnings[0], /Unknown option "timout" for test "my_test"/);
  });

  test("warns on legacy 'options' key and ignores it", async () => {
    const sql = testFile("legacy-options.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(
      testFile("legacy-options.test.json"),
      JSON.stringify({ options: { skip: true } }),
    );
    const out = await loadTestOptions(sql);
    assert.equal(out.tests.size, 0);
    assert.equal(out.warnings.length, 1);
    assert.match(out.warnings[0], /"options" is not supported/);
  });

  test("warns on legacy 'tests' key and ignores it", async () => {
    const sql = testFile("legacy-tests.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(
      testFile("legacy-tests.test.json"),
      JSON.stringify({ tests: { my_test: { skip: true } } }),
    );
    const out = await loadTestOptions(sql);
    assert.equal(out.tests.size, 0);
    assert.equal(out.warnings.length, 1);
    assert.match(out.warnings[0], /"tests" is not supported/);
  });

  test("throws if a test entry is not an object", async () => {
    const sql = testFile("badentry.test.sql");
    await writeFile(sql, "select 1");
    await writeFile(
      testFile("badentry.test.json"),
      JSON.stringify({ my_test: [] }),
    );
    await assert.rejects(
      () => loadTestOptions(sql),
      /"my_test" must be an object/,
    );
  });
});
