import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { readTextFile } from "../src/file-utils.js";

let root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "sstr-file-utils-"));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeRaw(name, buffer) {
  const full = join(root, name);
  await writeFile(full, buffer);
  return full;
}

describe("readTextFile", () => {
  test("reads UTF-8 without BOM", async () => {
    const p = await writeRaw("utf8.txt", Buffer.from("hello", "utf8"));
    assert.equal(await readTextFile(p), "hello");
  });

  test("reads UTF-8 with BOM and strips it", async () => {
    const buf = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("hello", "utf8"),
    ]);
    const p = await writeRaw("utf8-bom.txt", buf);
    assert.equal(await readTextFile(p), "hello");
  });

  test("reads UTF-16 LE with BOM and strips it", async () => {
    // FF FE is the LE BOM. Node's utf16le encoding writes LE without BOM.
    const text = "hello";
    const body = Buffer.from(text, "utf16le");
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
    const p = await writeRaw("utf16le.txt", buf);
    assert.equal(await readTextFile(p), text);
  });

  test("reads UTF-16 BE with BOM and strips it", async () => {
    // FE FF is the BE BOM. Build BE bytes manually: swap LE.
    const text = "hello";
    const le = Buffer.from(text, "utf16le");
    const be = Buffer.from(le);
    be.swap16();
    const buf = Buffer.concat([Buffer.from([0xfe, 0xff]), be]);
    const p = await writeRaw("utf16be.txt", buf);
    assert.equal(await readTextFile(p), text);
  });

  test("handles empty files", async () => {
    const p = await writeRaw("empty.txt", Buffer.alloc(0));
    assert.equal(await readTextFile(p), "");
  });

  test("handles non-ASCII characters in UTF-16 LE", async () => {
    const text = "héllo wörld";
    const body = Buffer.from(text, "utf16le");
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
    const p = await writeRaw("utf16le-accent.txt", buf);
    assert.equal(await readTextFile(p), text);
  });

  test("handles non-ASCII characters in UTF-8", async () => {
    const p = await writeRaw(
      "utf8-accent.txt",
      Buffer.from("héllo wörld", "utf8"),
    );
    assert.equal(await readTextFile(p), "héllo wörld");
  });
});
