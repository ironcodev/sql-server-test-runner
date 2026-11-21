import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { discoverTestFiles } from "../src/discover.js";

let root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "sstr-discover-"));
  // tests/sum.test.sql
  await mkdir(join(root, "tests"), { recursive: true });
  await writeFile(join(root, "tests", "sum.test.sql"), "select 1");
  await writeFile(join(root, "tests", "users.spec.sql"), "select 1");

  // tests/functions/column_info.test.sql
  await mkdir(join(root, "tests", "functions"), { recursive: true });
  await writeFile(join(root, "tests", "functions", "column_info.test.sql"), "select 1");
  // tests/functions/column_info.postscript.sql (should NOT match)
  await writeFile(join(root, "tests", "functions", "column_info.postscript.sql"), "select 1");

  // tests/warmup.sql (should NOT match)
  await writeFile(join(root, "tests", "warmup.sql"), "select 1");

  // src/not_a_test.sql (should NOT match)
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "not_a_test.sql"), "select 1");
  // src/db/sum.test.sql (should NOT match — outside tests/)
  await mkdir(join(root, "src", "db"), { recursive: true });
  await writeFile(join(root, "src", "db", "sum.test.sql"), "select 1");

  // node_modules/should_be_ignored
  await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
  await writeFile(join(root, "node_modules", "pkg", "x.test.sql"), "select 1");
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

function rel(files) {
  return files.map((f) => f.replace(root, "").replace(/\\/g, "/")).sort();
}

describe("discoverTestFiles", () => {
  test("finds .test.sql and .spec.sql files under tests/", async () => {
    const files = await discoverTestFiles(root);
    assert.deepEqual(rel(files), [
      "/tests/functions/column_info.test.sql",
      "/tests/sum.test.sql",
      "/tests/users.spec.sql",
    ]);
  });

  test("ignores auxiliary .sql files under tests/ (no .test/.spec)", async () => {
    const files = await discoverTestFiles(root);
    const paths = rel(files);
    assert.ok(!paths.includes("/tests/functions/column_info.postscript.sql"));
    assert.ok(!paths.includes("/tests/warmup.sql"));
  });

  test("ignores .test.sql files outside tests/", async () => {
    const files = await discoverTestFiles(root);
    const paths = rel(files);
    assert.ok(!paths.includes("/src/db/sum.test.sql"));
  });

  test("ignores node_modules", async () => {
    const files = await discoverTestFiles(root);
    assert.ok(!files.some((f) => f.includes("node_modules")));
  });

  test("respects a custom regex", async () => {
    const files = await discoverTestFiles(root, "tests/.*\\.sql$");
    assert.deepEqual(rel(files), [
      "/tests/functions/column_info.postscript.sql",
      "/tests/functions/column_info.test.sql",
      "/tests/sum.test.sql",
      "/tests/users.spec.sql",
      "/tests/warmup.sql",
    ]);
  });

  test("respects a narrower custom regex", async () => {
    const files = await discoverTestFiles(root, "tests/.*\\.test\\.sql$");
    assert.deepEqual(rel(files), ["/tests/functions/column_info.test.sql", "/tests/sum.test.sql"]);
  });

  test("returns an empty array when nothing matches", async () => {
    const files = await discoverTestFiles(root, "nothing-matches");
    assert.deepEqual(files, []);
  });
});
