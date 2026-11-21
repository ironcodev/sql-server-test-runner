import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "events";

// A fake ChildProcess: emits stdout/stderr/close.
function fakeChild({ code = 0, stdout = "", stderr = "" } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  // Emit asynchronously so listeners can attach.
  setImmediate(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", code);
  });
  return child;
}

// We cannot easily mock 'child_process' without mock.module, so use it:
import { mock } from "node:test";
mock.module("child_process", {
  exports: {
    spawn: () => fakeChild({ code: 0, stdout: "ok" }),
  },
});

const { runSqlcmd } = await import("../src/sqlcmd.js");

describe("runSqlcmd", () => {
  test("returns stdout and code 0 on success", async () => {
    const res = await runSqlcmd(["-Q", "select 1"]);
    assert.equal(res.code, 0);
    assert.equal(res.stdout, "ok");
  });
});
