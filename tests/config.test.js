import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateConfig, mergeCliOverrides } from "../src/config.js";

const validConfig = () => ({
  connection: { server: "localhost", trustedConnection: true },
});

describe("validateConfig", () => {
  test("accepts a minimal valid config", () => {
    assert.doesNotThrow(() => validateConfig(validConfig()));
  });

  test("rejects missing connection", () => {
    assert.throws(() => validateConfig({}), /"connection" section is required/);
  });

  test("rejects missing server", () => {
    assert.throws(() => validateConfig({ connection: {} }), /"connection.server" is required/);
  });

  test("accepts trustedConnection without username/password", () => {
    assert.doesNotThrow(() =>
      validateConfig({
        connection: { server: "x", trustedConnection: true },
      }),
    );
  });

  test("accepts non-trusted with username/password", () => {
    assert.doesNotThrow(() =>
      validateConfig({
        connection: {
          server: "x",
          trustedConnection: false,
          username: "sa",
          password: "p",
        },
      }),
    );
  });

  test("rejects testSchema with only empty entries", () => {
    assert.throws(
      () => validateConfig({ ...validConfig(), testSchema: " , , " }),
      /must contain at least one schema name/,
    );
  });

  test("accepts comma-separated testSchema", () => {
    assert.doesNotThrow(() => validateConfig({ ...validConfig(), testSchema: "sstr, tests" }));
  });

  test("rejects defaultTestOptions that is an array", () => {
    assert.throws(
      () => validateConfig({ ...validConfig(), defaultTestOptions: [] }),
      /"defaultTestOptions" must be an object/,
    );
  });

  test("accepts defaultTestOptions as an object", () => {
    assert.doesNotThrow(() =>
      validateConfig({
        ...validConfig(),
        defaultTestOptions: { logExecution: true },
      }),
    );
  });

  test("rejects negative queryTimeout type", () => {
    assert.throws(() => validateConfig({ ...validConfig(), queryTimeout: "10" }), /"queryTimeout" must be a number/);
  });
});

describe("mergeCliOverrides", () => {
  test("returns a copy when no overrides", () => {
    const cfg = validConfig();
    const out = mergeCliOverrides(cfg);
    assert.notEqual(out, cfg);
    assert.deepEqual(out, cfg);
  });

  test("applies testRegex override", () => {
    const out = mergeCliOverrides(validConfig(), { testRegex: "x" });
    assert.equal(out.testRegex, "x");
  });

  test("applies queryTimeout override", () => {
    const out = mergeCliOverrides(validConfig(), { queryTimeout: 60 });
    assert.equal(out.queryTimeout, 60);
  });
});
