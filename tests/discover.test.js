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
  // tests/orders/spec_insert.sql
  await mkdir(join(root, "tests", "orders"), { recursive: true });
  await writeFile(join(root, "tests", "orders", "spec_insert.sql"), "select 1");
  // src/not_a_test.sql (should not match default regex)
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "not_a_test.sql"), "select 1");
  // node_modules/should_be_ignored
  await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
  await writeFile(join(root, "node_modules", "pkg", "x.test.sql"), "select 1");
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("discoverTestFiles", () => {
  test("finds files matching the default regex", async () => {
    const files = await discoverTestFiles(root);
    const rel = files.map((f) => f.replace(root, "").replace(/\\/g, "/"));
    assert.deepEqual(rel.sort(), ["/tests/orders/spec_insert.sql", "/tests/sum.test.sql", "/tests/users.spec.sql"]);
  });

  test("ignores node_modules", async () => {
    const files = await discoverTestFiles(root);
    assert.ok(!files.some((f) => f.includes("node_modules")));
  });

  test("respects a custom regex", async () => {
    const files = await discoverTestFiles(root, "tests/.*\\.sql$");
    const rel = files.map((f) => f.replace(root, "").replace(/\\/g, "/"));
    assert.deepEqual(rel.sort(), ["/tests/orders/spec_insert.sql", "/tests/sum.test.sql", "/tests/users.spec.sql"]);
  });

  test("returns an empty array when nothing matches", async () => {
    const files = await discoverTestFiles(root, "nothing-matches");
    assert.deepEqual(files, []);
  });
});
