import { spawn } from "child_process";
import { readdir } from "fs/promises";
import { join } from "path";

process.env.SQLSERVER_HOST ??= "localhost";
process.env.SQLSERVER_TRUSTED ??= "1";

const dir = "tests-integration";
const entries = await readdir(dir, { withFileTypes: true });
const files = entries.filter((e) => e.isFile() && e.name.endsWith(".test.js")).map((e) => join(dir, e.name));

if (files.length === 0) {
  console.error(`No integration test files found in "${dir}".`);
  process.exit(1);
}

const child = spawn(process.execPath, ["--test", "--experimental-test-module-mocks", ...files], {
  stdio: "inherit",
  shell: false,
  windowsHide: true,
});

child.on("close", (code) => process.exit(code ?? 1));
child.on("error", (err) => {
  console.error(`Failed to spawn test runner: ${err.message}`);
  process.exit(1);
});
