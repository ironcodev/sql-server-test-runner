import { spawn } from "child_process";
import { readdir, access } from "fs/promises";
import { join } from "path";
import { constants } from "fs";
import { readTextFile } from "../src/file-utils";

const ENV_FILE = ".env.integration";

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes, if any.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

// Load .env.integration if present.
if (await fileExists(ENV_FILE)) {
  const text = await readTextFile(ENV_FILE);
  const vars = parseEnv(text);
  for (const [k, v] of Object.entries(vars)) {
    if (process.env[k] == null) {
      process.env[k] = v;
    }
  }
}

// Refuse to run without a host.
if (!process.env.SQLSERVER_HOST) {
  console.error(
    `Missing SQLSERVER_HOST. Create a "${ENV_FILE}" file (see ".env.integration.example") or set the environment variables manually.`,
  );
  process.exit(1);
}

// Collect integration test files.
const dir = "tests-integration";
const entries = await readdir(dir, { withFileTypes: true });
const files = entries
  .filter((e) => e.isFile() && e.name.endsWith(".test.js"))
  .map((e) => join(dir, e.name));

if (files.length === 0) {
  console.error(`No integration test files found in "${dir}".`);
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ["--test", "--experimental-test-module-mocks", ...files],
  { stdio: "inherit", shell: false, windowsHide: true },
);

child.on("close", (code) => process.exit(code ?? 1));
child.on("error", (err) => {
  console.error(`Failed to spawn test runner: ${err.message}`);
  process.exit(1);
});
