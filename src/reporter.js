// ============================================================
// Color helpers
// ============================================================

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

function makeColorizer(enabled) {
  if (!enabled) return (s) => s;
  return (color, s) => `${COLORS[color] || ""}${s}${COLORS.reset}`;
}

// ============================================================
// Base reporter
// ============================================================

class BaseReporter {
  constructor({ color = true } = {}) {
    this.results = [];
    this.files = [];
    this.skippedFiles = [];
    this.c = makeColorizer(color);
  }

  setFiles(files) {
    this.files = files;
  }

  addResult({ file, procedure, passed, error, durationMs = null }) {
    this.results.push({ file, procedure, passed, error, durationMs });
  }

  markFileSkipped(file, reason) {
    this.skippedFiles.push({ file, reason });
  }

  get hasFailures() {
    return this.results.some((r) => !r.passed);
  }

  print() {
    throw new Error("print() not implemented");
  }
}

// ============================================================
// Console reporter (human readable, colored)
// ============================================================

export class ConsoleReporter extends BaseReporter {
  print() {
    const c = this.c;
    console.log("");
    console.log(c("cyan", "=============================================="));
    console.log(c("cyan", " Test Report"));
    console.log(c("cyan", "=============================================="));
    console.log(`Test script files: ${this.files.length}`);

    const byFile = new Map();
    for (const r of this.results) {
      if (!byFile.has(r.file)) byFile.set(r.file, []);
      byFile.get(r.file).push(r);
    }

    console.log("");
    console.log("Per-file details:");
    for (const f of this.files) {
      const list = byFile.get(f) || [];
      const pass = list.filter((x) => x.passed).length;
      const fail = list.length - pass;
      const badge = fail > 0 ? c("red", "FAIL") : c("green", "PASS");
      console.log(`  - ${f} [${badge}]`);
      console.log(
        `      procedures: ${list.length}, pass: ${pass}, fail: ${fail}`,
      );
    }

    if (this.skippedFiles.length > 0) {
      console.log("");
      console.log(c("yellow", "Skipped files (script execution failed):"));
      for (const s of this.skippedFiles) {
        console.log(`  ! ${s.file}`);
        console.log(`      reason: ${(s.reason || "").trim()}`);
      }
    }

    const failures = this.results.filter((r) => !r.passed);
    if (failures.length > 0) {
      console.log("");
      console.log(c("red", "Failure details:"));
      for (const f of failures) {
        console.log(`  x file: ${f.file}`);
        console.log(`      procedure: ${f.procedure}`);
        console.log(`      error: ${(f.error || "").trim()}`);
        console.log("");
      }
    }

    const total = this.results.length;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = total - passed;

    console.log("----------------------------------------------");
    const passLabel = c("green", `pass: ${passed}`);
    const failLabel =
      failed > 0 ? c("red", `fail: ${failed}`) : c("gray", `fail: ${failed}`);
    console.log(`Total: ${total}, ${passLabel}, ${failLabel}`);
    console.log(c("cyan", "=============================================="));
  }
}

// ============================================================
// JSON reporter (machine readable)
// ============================================================

export class JsonReporter extends BaseReporter {
  print() {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = total - passed;

    const payload = {
      files: this.files,
      skippedFiles: this.skippedFiles,
      results: this.results,
      summary: { total, passed, failed },
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  }
}

// ============================================================
// JUnit reporter (CI friendly)
// ============================================================

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export class JUnitReporter extends BaseReporter {
  print() {
    const total = this.results.length;
    const failed = this.results.filter((r) => !r.passed).length;

    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<testsuites name="sstr" tests="${total}" failures="${failed}">`);

    const byFile = new Map();
    for (const r of this.results) {
      if (!byFile.has(r.file)) byFile.set(r.file, []);
      byFile.get(r.file).push(r);
    }

    for (const [file, list] of byFile) {
      const fileFail = list.filter((x) => !x.passed).length;
      lines.push(
        `  <testsuite name="${escapeXml(file)}" tests="${list.length}" failures="${fileFail}">`,
      );
      for (const r of list) {
        const time =
          r.durationMs != null ? (r.durationMs / 1000).toFixed(3) : "0.000";
        lines.push(
          `    <testcase classname="${escapeXml(file)}" name="${escapeXml(
            r.procedure,
          )}" time="${time}">`,
        );
        if (!r.passed) {
          lines.push(
            `      <failure message="test failed"><![CDATA[${r.error || ""}]]></failure>`,
          );
        }
        lines.push("    </testcase>");
      }
      lines.push("  </testsuite>");
    }

    lines.push("</testsuites>");
    process.stdout.write(lines.join("\n") + "\n");
  }
}

// ============================================================
// Factory
// ============================================================

export function createReporter(type, { color = true } = {}) {
  if (type === "json") return new JsonReporter({ color: false });
  if (type === "junit") return new JUnitReporter({ color: false });
  return new ConsoleReporter({ color });
}
