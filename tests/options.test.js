import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveOptions, toBool, normalizeThrows, DEFAULT_OPTIONS } from "../src/options.js";

describe("resolveOptions", () => {
  test("returns defaults when nothing is provided", () => {
    const result = resolveOptions();
    assert.deepEqual(result, DEFAULT_OPTIONS);
  });

  test("configDefaults override defaults", () => {
    const result = resolveOptions({
      configDefaults: { logExecution: true },
    });
    assert.equal(result.logExecution, true);
    assert.equal(result.transaction, true); // default still applies
  });

  test("fileOptions override configDefaults", () => {
    const result = resolveOptions({
      configDefaults: { logExecution: true },
      fileOptions: { logExecution: false },
    });
    assert.equal(result.logExecution, false);
  });

  test("testOptions override fileOptions", () => {
    const result = resolveOptions({
      configDefaults: { logExecution: true },
      fileOptions: { logExecution: false },
      testOptions: { logExecution: true },
    });
    assert.equal(result.logExecution, true);
  });

  test("cliOverrides win over everything", () => {
    const result = resolveOptions({
      configDefaults: { transaction: true },
      fileOptions: { transaction: true },
      testOptions: { transaction: true },
      cliOverrides: { transaction: false },
    });
    assert.equal(result.transaction, false);
  });

  test("unknown keys are passed through (not filtered)", () => {
    const result = resolveOptions({
      fileOptions: { unknown: "x" },
    });
    assert.equal(result.unknown, "x");
  });
});

describe("toBool", () => {
  test("accepts true / false", () => {
    assert.equal(toBool(true), true);
    assert.equal(toBool(false), false);
  });

  test("accepts 1 / 0", () => {
    assert.equal(toBool(1), true);
    assert.equal(toBool(0), false);
  });

  test("accepts yes / no / on / off (case-insensitive)", () => {
    assert.equal(toBool("yes"), true);
    assert.equal(toBool("YES"), true);
    assert.equal(toBool("no"), false);
    assert.equal(toBool("on"), true);
    assert.equal(toBool("off"), false);
  });

  test("returns fallback for unknown values", () => {
    assert.equal(toBool("maybe", false), false);
    assert.equal(toBool("maybe", true), true);
    assert.equal(toBool(null, true), true);
  });
});

describe("normalizeThrows", () => {
  test("returns false for false/0/null/undefined", () => {
    assert.equal(normalizeThrows(false), false);
    assert.equal(normalizeThrows(0), false);
    assert.equal(normalizeThrows(null), false);
    assert.equal(normalizeThrows(undefined), false);
  });

  test("returns true for true/1/yes", () => {
    assert.equal(normalizeThrows(true), true);
    assert.equal(normalizeThrows(1), true);
    assert.equal(normalizeThrows("yes"), true);
  });

  test("returns number for numeric values", () => {
    assert.equal(normalizeThrows(8134), 8134);
    assert.equal(normalizeThrows("8134"), 8134);
  });

  test("returns false for strings that are not booleans or numbers", () => {
    assert.equal(normalizeThrows("abc"), false);
  });
});
