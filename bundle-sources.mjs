import { readdir, readFile, writeFile } from "fs/promises";
import { join, relative, extname } from "path";

const ROOT = process.cwd();
const EXTENSIONS = new Set([".js", ".md", ".json", ".sql"]);

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".github",
  ".vscode",
  ".idea",
  "dist",
  "build",
  "coverage",
]);
const IGNORE_FILES = new Set(["package-lock.json", "bundle-sources.txt"]);

// Split output into chunks of N files each.
const CHUNK_SIZE = 5;

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      await walk(full, files);
    } else if (entry.isFile()) {
      if (IGNORE_FILES.has(entry.name)) continue;
      if (!EXTENSIONS.has(extname(entry.name))) continue;
      files.push(full);
    }
  }
  return files;
}

function separator(relPath) {
  const line = "=".repeat(80);
  return ["", line, `FILE: ${relPath}`, line, ""].join("\n");
}

async function main() {
  const files = await walk(ROOT);
  files.sort((a, b) => a.localeCompare(b));

  const total = files.length;
  const chunks = [];
  for (let i = 0; i < total; i += CHUNK_SIZE) {
    chunks.push(files.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const parts = [];
    parts.push(
      [
        "=".repeat(80),
        `sql-server-test-runner — bundle part ${i + 1}/${chunks.length}`,
        `Files ${i * CHUNK_SIZE + 1}–${Math.min((i + 1) * CHUNK_SIZE, total)} of ${total}`,
        "=".repeat(80),
        "",
      ].join("\n"),
    );

    for (const file of chunk) {
      const rel = relative(ROOT, file).split("\\").join("/");
      parts.push(separator(rel));
      let content;
      try {
        content = await readFile(file, "utf-8");
      } catch (e) {
        content = `<< error reading file: ${e.message} >>`;
      }
      parts.push(content);
      parts.push("\n");
    }

    const outPath = join(
      ROOT,
      `bundle-part-${String(i + 1).padStart(2, "0")}.txt`,
    );
    await writeFile(outPath, parts.join("\n"), "utf-8");
    console.log(`Wrote ${chunk.length} file(s) to ${outPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
