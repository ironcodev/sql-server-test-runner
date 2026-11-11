import { readdir } from "fs/promises";
import { join, relative } from "path";

const DEFAULT_TEST_REGEX = "(tests/.*|(\\.|/)(test|spec))\\.sql$";

/**
 * Walks cwd and returns all .sql files whose relative path matches testRegex.
 */
export async function discoverTestFiles(cwd, testRegex) {
  const regexStr = testRegex || DEFAULT_TEST_REGEX;
  const regex = new RegExp(regexStr, "i");
  const results = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (
          ["node_modules", ".git", "bin", "dist", "build", ".vs"].includes(
            entry.name,
          )
        ) {
          continue;
        }
        await walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        const full = join(dir, entry.name);
        const rel = relative(cwd, full).split("\\").join("/");
        if (regex.test(rel)) {
          results.push(full);
        }
      }
    }
  }

  await walk(cwd);
  results.sort();
  return results;
}
