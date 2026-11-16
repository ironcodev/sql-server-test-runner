import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { loadProjectOptions, getFileOptions } from "../src/options.js";

let root;
let testsDir;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "sstr-project-options-"));
  testsDir = join(root, "tests");
  await mkdir(testsDir, { recursive: true });
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function reset() {
  await rm(testsDir, { recursive: true, force: true });
  await mkdir(testsDir, { recursive: true });
}

async function writeProjectFile(json) {
  await writeFile(join(testsDir, "sstr.json"), JSON.stringify(json), "utf-8");
}

async function writeSql(relPath) {
  const full = join(testsDir, relPath);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, "select 1", "utf-8");
  return full;
}

describe("loadProjectOptions", () => {
  test("returns an empty map when sstr.json is missing", async () => {
    await reset();
    const out = await loadProjectOptions(root);
    assert.equal(out.files.size, 0);
    assert.deepEqual(out.warnings, []);
  });

  test("parses a valid files map", async () => {
    await reset();
    await writeProjectFile({
      files: {
        sum: { skip: true },
        "users.test": { logExecution: true },
      },
    });
    const out = await loadProjectOptions(root);
    assert.equal(out.files.size, 2);
    assert.deepEqual(out.files.get("sum"), { skip: true });
    assert.deepEqual(out.files.get("users.test"), { logExecution: true });
  });

  test("normalizes backslashes and leading ./", async () => {
    await reset();
    await writeProjectFile({
      files: {
        "./procedures/phase1/sum": { timeout: 60 },
        "procedures\\phase2\\sum": { skip: true },
      },
    });
    const out = await loadProjectOptions(root);
    assert.ok(out.files.has("procedures/phase1/sum"));
    assert.ok(out.files.has("procedures/phase2/sum"));
  });

  test("warns on unknown keys", async () => {
    await reset();
    await writeProjectFile({ files: { sum: { timer: 10 } } });
    const out = await loadProjectOptions(root);
    assert.equal(out.warnings.length, 1);
    assert.match(out.warnings[0], /Unknown option "timer"/);
  });

  test("throws on invalid JSON", async () => {
    await reset();
    await writeFile(join(testsDir, "sstr.json"), "{ invalid");
    await assert.rejects(
      () => loadProjectOptions(root),
      /Invalid JSON in ".*sstr\.json"/,
    );
  });

  test("throws if files is not an object", async () => {
    await reset();
    await writeProjectFile({ files: [] });
    await assert.rejects(
      () => loadProjectOptions(root),
      /"files" must be an object/,
    );
  });

  test("throws if a file entry is not an object", async () => {
    await reset();
    await writeProjectFile({ files: { sum: 42 } });
    await assert.rejects(
      () => loadProjectOptions(root),
      /"files\.sum" must be an object/,
    );
  });
});

describe("getFileOptions", () => {
  async function setup(files, sqlRelPath) {
    await reset();
    await writeProjectFile({ files });
    const sql = await writeSql(sqlRelPath);
    const project = await loadProjectOptions(root);
    return { project, sql };
  }

  test("matches by basename without .test", async () => {
    const { project, sql } = await setup(
      { sum: { skip: true } },
      "sum.test.sql",
    );
    assert.deepEqual(getFileOptions(project, sql), { skip: true });
  });

  test("matches by basename with .test", async () => {
    const { project, sql } = await setup(
      { "sum.test": { skip: true } },
      "sum.test.sql",
    );
    assert.deepEqual(getFileOptions(project, sql), { skip: true });
  });

  test("basename with .test wins over basename without", async () => {
    const { project, sql } = await setup(
      {
        sum: { skip: true, logExecution: true },
        "sum.test": { skip: false },
      },
      "sum.test.sql",
    );
    assert.deepEqual(getFileOptions(project, sql), {
      skip: false,
      logExecution: true,
    });
  });

  test("path key wins over basename keys", async () => {
    const { project, sql } = await setup(
      {
        sum: { skip: true, logExecution: true },
        "procedures/phase1/sum": { skip: false },
      },
      "procedures/phase1/sum.test.sql",
    );
    assert.deepEqual(getFileOptions(project, sql), {
      skip: false,
      logExecution: true,
    });
  });

  test("returns empty object when nothing matches", async () => {
    const { project, sql } = await setup(
      { other: { skip: true } },
      "sum.test.sql",
    );
    assert.deepEqual(getFileOptions(project, sql), {});
  });

  test("returns empty object when project has no files", async () => {
    await reset();
    const sql = await writeSql("sum.test.sql");
    const project = await loadProjectOptions(root);
    assert.deepEqual(getFileOptions(project, sql), {});
  });
});
