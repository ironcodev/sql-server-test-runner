import { readFile, access } from "fs/promises";
import { join } from "path";
import { constants } from "fs";

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

/**
 * Loads `.env` from cwd and copies only keys that start with "SSTR_" into
 * process.env. Existing environment variables take precedence.
 *
 * This keeps `.env` compatible with other tools (Docker, dotenv, etc.) while
 * avoiding accidental overrides of PATH, HOME, NODE_ENV, and so on.
 */
export async function loadSstrEnv(cwd) {
  const envPath = join(cwd, ".env.sstr");
  if (!(await fileExists(envPath))) return;

  let text;
  try {
    text = await readFile(envPath, "utf-8");
  } catch {
    return;
  }

  const vars = parseEnv(text);
  for (const [k, v] of Object.entries(vars)) {
    if (!k.startsWith("SSTR_")) continue;
    if (process.env[k] == null) {
      process.env[k] = v;
    }
  }
}
