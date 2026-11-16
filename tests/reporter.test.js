import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import {
  ConsoleReporter,
  JsonReporter,
  JUnitReporter,
  createReporter,
} from "../src/reporter.js";

function sampleResults() {
  return [
    {
      file: "tests/sum.test.sql",
      procedure: "dbo.test_pass",
      passed: true,
      error: null,
      durationMs: 10,
      skipped: false,
      warning: null,
    },
    {
      file: "tests/sum.test.sql",
      procedure: "dbo.test_fail",
      passed: false,
      error: "Msg 50000, boom",
      durationMs: 20,
      skipped: false,
      warning: null,
    },
    {
      file: "tests/sum.test.sql",
      procedure: "dbo.test_skip",
      passed: true,
      error: null,
      durationMs: null,
      skipped: true,
      warning: null,
    },
    {
      file: "tests/users.test.sql",
      procedure: "dbo.test_warn",
      passed: true,
      error: null,
      durationMs: null,
      skipped: false,
      warning: "No assertion",
    },
  ];
}

function captureStdout(fn) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join("");
}

describe("BaseReporter", () => {
  test("hasFailures is false when all results pass or skip", () => {
    const r = createReporter("console", { color: false });
    r.addResult({ file: "f", procedure: "p", passed: true, error: null });
    r.addResult({
      file: "f",
      procedure: "p2",
      passed: true,
      error: null,
      skipped: true,
    });
    assert.equal(r.hasFailures, false);
  });

  test("hasFailures is true when any result fails", () => {
    const r = createReporter("console", { color: false });
    r.addResult({ file: "f", procedure: "p", passed: false, error: "boom" });
    assert.equal(r.hasFailures, true);
  });

  test("markFileSkipped records skipped files", () => {
    const r = createReporter("console", { color: false });
    r.markFileSkipped("f.sql", "reason");
    assert.equal(r.skippedFiles.length, 1);
    assert.equal(r.skippedFiles[0].file, "f.sql");
  });
});

describe("ConsoleReporter", () => {
  test("print does not throw", () => {
    const r = new ConsoleReporter({ color: false });
    r.setFiles(["tests/sum.test.sql", "tests/users.test.sql"]);
    for (const res of sampleResults()) r.addResult(res);
    r.setRunInfo({
      startedAt: new Date("2025-01-01T00:00:00Z"),
      finishedAt: new Date("2025-01-01T00:00:10Z"),
      durationMs: 10000,
    });
    // We don't assert stdout here; we just make sure it does not throw.
    assert.doesNotThrow(() => r.print());
  });
});

describe("JsonReporter", () => {
  test("print outputs valid JSON with the expected shape", () => {
    const r = new JsonReporter({ color: false });
    r.setFiles(["tests/sum.test.sql"]);
    for (const res of sampleResults()) r.addResult(res);
    r.setRunInfo({
      startedAt: new Date("2025-01-01T00:00:00Z"),
      finishedAt: new Date("2025-01-01T00:00:10Z"),
      durationMs: 10000,
    });

    const out = captureStdout(() => r.print());
    const parsed = JSON.parse(out);

    assert.equal(parsed.files.length, 1);
    assert.equal(parsed.results.length, 4);
    assert.equal(parsed.summary.total, 4);
    assert.equal(parsed.summary.passed, 2);
    assert.equal(parsed.summary.failed, 1);
    assert.equal(parsed.summary.skipped, 1);
    assert.equal(parsed.summary.warnings, 1);
    assert.equal(parsed.summary.measuredTests, 2);
    assert.equal(parsed.summary.totalDurationMs, 30);
    assert.ok(parsed.runInfo);
    assert.equal(parsed.runInfo.durationMs, 10000);
  });

  test("print outputs null runInfo when not set", () => {
    const r = new JsonReporter({ color: false });
    r.setFiles([]);
    r.addResult({
      file: "f",
      procedure: "p",
      passed: true,
      error: null,
    });
    const out = captureStdout(() => r.print());
    const parsed = JSON.parse(out);
    assert.equal(parsed.runInfo, null);
  });
});

describe("JUnitReporter", () => {
  test("print outputs valid XML with testsuites and testcases", () => {
    const r = new JUnitReporter({ color: false });
    r.setFiles(["tests/sum.test.sql", "tests/users.test.sql"]);
    for (const res of sampleResults()) r.addResult(res);
    r.setRunInfo({
      startedAt: new Date("2025-01-01T00:00:00Z"),
      finishedAt: new Date("2025-01-01T00:00:10Z"),
      durationMs: 10000,
    });

    const out = captureStdout(() => r.print());

    assert.match(out, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(out, /<testsuites name="sstr"/);
    assert.match(out, /tests="4"/);
    assert.match(out, /failures="1"/);
    assert.match(out, /skipped="1"/);
    assert.match(out, /timestamp="2025-01-01T00:00:00"/);
    assert.match(out, /<testsuite name="tests\/sum\.test\.sql"/);
    assert.match(out, /<testcase classname="tests\/sum\.test\.sql"/);
    assert.match(
      out,
      /<failure message="test failed"><!\[CDATA\[Msg 50000, boom\]\]><\/failure>/,
    );
    assert.match(out, /<skipped\/>/);
    assert.match(out, /<system-out>No assertion<\/system-out>/);
  });

  test("escapes XML special characters in attribute values", () => {
    const r = new JUnitReporter({ color: false });
    r.setFiles(["tests/<weird>&name.test.sql"]);
    r.addResult({
      file: "tests/<weird>&name.test.sql",
      procedure: "dbo.test_<x>",
      passed: false,
      error: "a < b & c > d",
    });
    const out = captureStdout(() => r.print());
    // Attribute values are escaped.
    assert.match(out, /&lt;weird&gt;&amp;name/);
    assert.match(out, /dbo\.test_&lt;x&gt;/);
    // The error is wrapped in CDATA, so it is NOT escaped.
    assert.match(out, /<!\[CDATA\[a < b & c > d\]\]>/);
  });

  test("omits timestamp when runInfo is not set", () => {
    const r = new JUnitReporter({ color: false });
    r.setFiles([]);
    r.addResult({ file: "f", procedure: "p", passed: true, error: null });
    const out = captureStdout(() => r.print());
    assert.doesNotMatch(out, /timestamp=/);
  });
});

describe("createReporter", () => {
  test("returns a ConsoleReporter for 'console'", () => {
    assert.ok(
      createReporter("console", { color: false }) instanceof ConsoleReporter,
    );
  });
  test("returns a JsonReporter for 'json'", () => {
    assert.ok(createReporter("json", { color: false }) instanceof JsonReporter);
  });
  test("returns a JUnitReporter for 'junit'", () => {
    assert.ok(
      createReporter("junit", { color: false }) instanceof JUnitReporter,
    );
  });
});
