import { readFile } from "fs/promises";

/**
 * Reads a text file and returns its contents as a UTF-8 string.
 *
 * Supports:
 *   - UTF-8 without BOM
 *   - UTF-8 with BOM (EF BB BF)
 *   - UTF-16 LE with BOM (FF FE)
 *   - UTF-16 BE with BOM (FE FF)
 *
 * The returned string never starts with a BOM, so callers do not need to
 * strip it. This keeps the content compatible with `sqlcmd`, JSON.parse, etc.
 *
 * If the file has no BOM, it is assumed to be UTF-8.
 */
export async function readTextFile(filePath) {
  const buffer = await readFile(filePath);

  // UTF-16 BE BOM
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    // Node.js has no "utf16be" decoder. Swap byte pairs and decode as utf16le.
    const swapped = Buffer.from(buffer);
    swapped.swap16();
    return stripBom(swapped.toString("utf16le"));
  }

  // UTF-16 LE BOM
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return stripBom(buffer.toString("utf16le"));
  }

  // UTF-8 BOM
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return buffer.slice(3).toString("utf8");
  }

  // No BOM: assume UTF-8
  return buffer.toString("utf8");
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
