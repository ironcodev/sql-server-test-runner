import { makeColorizer } from "./util.js";

/**
 * Parses a sqlcmd error string into structured parts.
 * Returns { header: { msg, level, state, server, procedure, line } | null,
 *           body: string }.
 * If the string does not match the standard format, header is null and
 * body is the whole string.
 */
function parseSqlcmdError(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return { header: null, body: "" };

  // Standard format:
  //   Msg 50000, Level 16, State 1, Server X, Procedure Y, Line Z
  //   <body>
  // Server/Procedure/Line are optional in some messages.
  const re =
    /^Msg\s+(\d+),\s+Level\s+(\d+),\s+State\s+(\d+)(?:,\s+Server\s+([^,]+))?(?:,\s+Procedure\s+([^,]+))?(?:,\s+Line\s+(\d+))?\s*\r?\n([\s\S]*)$/i;
  const m = trimmed.match(re);
  if (!m) return { header: null, body: trimmed };

  return {
    header: {
      msg: Number(m[1]),
      level: Number(m[2]),
      state: Number(m[3]),
      server: m[4] ? m[4].trim() : null,
      procedure: m[5] ? m[5].trim() : null,
      line: m[6] ? Number(m[6]) : null,
    },
    body: (m[7] || "").trim(),
  };
}

class BaseReporter {
  constructor({ color = true } = {}) {
    this.results = [];
    this.files = [];
    this.skippedFiles = [];
    this.runInfo = null;
    this.c = makeColorizer(color);
  }

  setFiles(files) {
    this.files = files;
  }

  setRunInfo(info) {
    this.runInfo = info;
  }

  addResult({ file, procedure, passed, error, durationMs = null, skipped = false, warning = null }) {
    this.results.push({
      file,
      procedure,
      passed,
      error,
      durationMs,
      skipped,
      warning,
    });
  }

  markFileSkipped(file, reason) {
    this.skippedFiles.push({ file, reason });
  }

  get hasFailures() {
    return this.results.some((r) => !r.passed && !r.skipped);
  }

  print() {
    throw new Error("print() not implemented");
  }
}

export class ConsoleReporter extends BaseReporter {
  print() {
    const c = this.c;
    console.log("");
    console.log(c("cyan", "=============================================="));
    console.log(c("cyan", " Test Report"));
    console.log(c("cyan", "=============================================="));

    if (this.runInfo) {
      const started = this.runInfo.startedAt.toLocaleString();
      const finished = this.runInfo.finishedAt.toLocaleString();
      const seconds = (this.runInfo.durationMs / 1000).toFixed(2);
      console.log("");
      console.log(`Started:  ${started}`);
      console.log(`Finished: ${finished}`);
      console.log(`Duration: ${seconds}s`);
      console.log("");
    }

    console.log(`Total files: ${this.files.length}`);

    const byFile = new Map();
    for (const r of this.results) {
      if (!byFile.has(r.file)) byFile.set(r.file, []);
      byFile.get(r.file).push(r);
    }

    console.log("");
    // console.log("Per-file details:");

    // const root = process.cwd();

    for (const f of this.files) {
      const list = byFile.get(f) || [];
      /*
      const filename = f.replace(root, "").replace(/\\/g, '/');
      const skipped = list.filter((x) => x.skipped).length;
      const pass = list.filter((x) => x.passed && !x.skipped).length;
      const fail = list.filter((x) => !x.passed && !x.skipped).length;
      const badge =
        fail > 0
          ? c("red", "FAIL")
          : pass > 0
            ? c("green", "PASS")
            : skipped > 0
              ? c("gray", "SKIP")
              : c("gray", "EMPTY");
      console.log(`  - ${filename} [${badge}]`);
      console.log(
        `      procedures: ${list.length}, pass: ${pass}, fail: ${fail}${
          skipped ? `, skipped: ${skipped}` : ""
        }`,
      );
      */
      const withTime = list.filter((r) => r.durationMs != null);
      if (withTime.length > 0) {
        console.log("      execution times:");
        const labels = withTime.map((r) => `${r.durationMs} ms`);
        const width = Math.max(...labels.map((s) => s.length));
        for (let i = 0; i < withTime.length; i++) {
          const r = withTime[i];
          console.log(`        ${labels[i].padStart(width)}  ${r.procedure}`);
        }
      }

      const warned = list.filter((r) => r.warning);
      if (warned.length > 0) {
        console.log(c("yellow", "      warnings:"));
        for (const r of warned) {
          console.log(`        ${r.procedure}: ${r.warning}`);
        }
      }
    }

    if (this.skippedFiles.length > 0) {
      console.log("");
      console.log(c("yellow", "Skipped files (script execution failed):"));
      for (const s of this.skippedFiles) {
        console.log(`  ! ${s.file}`);
        console.log(`      reason: ${(s.reason || "").trim()}`);
      }
    }

    const failures = this.results.filter((r) => !r.passed && !r.skipped);
    if (failures.length > 0) {
      console.log("");
      console.log(c("red", "Failure details:"));
      for (const f of failures) {
        console.log(`  x file: ${f.file}`);
        console.log(`     procedure: ${c("yellow", f.procedure)}`);
        if (f.durationMs != null) {
          console.log(`     duration: ${f.durationMs} ms`);
        }

        const parsed = parseSqlcmdError(f.error);
        if (parsed.header) {
          const h = parsed.header;
          console.log(`       Code: ${h.msg}, Level: ${h.level}, State: ${h.state}`);
          // if (h.server) console.log(`       Server:    ${h.server}`);
          // if (h.procedure) console.log(`       Procedure: ${h.procedure}`);
          // if (h.line != null) console.log(`       Line:      ${h.line}`);
          if (parsed.body) {
            console.log(`       Message: ${c("red", parsed.body)}`);
          }
        } else {
          console.log(`     ${(f.error || "").trim()}`);
        }
        console.log("");
      }
    }

    const total = this.results.length;
    const skipped = this.results.filter((r) => r.skipped).length;
    const passed = this.results.filter((r) => r.passed && !r.skipped).length;
    const failed = this.results.filter((r) => !r.passed && !r.skipped).length;
    const warningCount = this.results.filter((r) => r.warning).length;

    console.log("----------------------------------------------");
    const passLabel = c("green", `pass: ${passed}`);
    const failLabel = failed > 0 ? c("red", `fail: ${failed}`) : c("gray", `fail: ${failed}`);
    const skipLabel = skipped > 0 ? `, skipped: ${skipped}` : "";
    const warnLabel = warningCount > 0 ? c("yellow", `, warnings: ${warningCount}`) : "";
    console.log(`Tests: ${total}, ${passLabel}, ${failLabel}${skipLabel}${warnLabel}`);

    const withTime = this.results.filter((r) => r.durationMs != null);
    if (withTime.length > 0) {
      const totalMs = withTime.reduce((sum, r) => sum + r.durationMs, 0);
      console.log(`Measured execution time: ${totalMs} ms across ${withTime.length} test(s)`);
    }

    console.log(c("cyan", "=============================================="));
  }
}

export class JsonReporter extends BaseReporter {
  print() {
    const total = this.results.length;
    const skipped = this.results.filter((r) => r.skipped).length;
    const passed = this.results.filter((r) => r.passed && !r.skipped).length;
    const failed = this.results.filter((r) => !r.passed && !r.skipped).length;
    const warnings = this.results.filter((r) => r.warning).length;
    const withTime = this.results.filter((r) => r.durationMs != null);
    const totalMs = withTime.reduce((sum, r) => sum + r.durationMs, 0);

    const payload = {
      runInfo: this.runInfo
        ? {
            startedAt: this.runInfo.startedAt.toISOString(),
            finishedAt: this.runInfo.finishedAt.toISOString(),
            durationMs: this.runInfo.durationMs,
          }
        : null,
      files: this.files,
      skippedFiles: this.skippedFiles,
      results: this.results,
      summary: {
        total,
        passed,
        failed,
        skipped,
        warnings,
        measuredTests: withTime.length,
        totalDurationMs: totalMs,
      },
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  }
}

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
    const failed = this.results.filter((r) => !r.passed && !r.skipped).length;
    const skipped = this.results.filter((r) => r.skipped).length;
    const withTime = this.results.filter((r) => r.durationMs != null);
    const totalMs = withTime.reduce((sum, r) => sum + r.durationMs, 0);

    const timestamp = this.runInfo ? this.runInfo.startedAt.toISOString().replace(/\.\d+Z$/, "") : "";

    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<testsuites name="sstr" tests="${total}" failures="${failed}" skipped="${skipped}" time="${(totalMs / 1000).toFixed(3)}"${timestamp ? ` timestamp="${timestamp}"` : ""}>`,
    );

    const byFile = new Map();
    for (const r of this.results) {
      if (!byFile.has(r.file)) byFile.set(r.file, []);
      byFile.get(r.file).push(r);
    }

    for (const [file, list] of byFile) {
      const fileFail = list.filter((x) => !x.passed && !x.skipped).length;
      const fileSkip = list.filter((x) => x.skipped).length;
      const fileMs = list.filter((x) => x.durationMs != null).reduce((sum, x) => sum + x.durationMs, 0);

      lines.push(
        `  <testsuite name="${escapeXml(file)}" tests="${list.length}" failures="${fileFail}" skipped="${fileSkip}" time="${(fileMs / 1000).toFixed(3)}">`,
      );
      for (const r of list) {
        const time = r.durationMs != null ? (r.durationMs / 1000).toFixed(3) : "0.000";
        lines.push(`    <testcase classname="${escapeXml(file)}" name="${escapeXml(r.procedure)}" time="${time}">`);
        if (r.skipped) {
          lines.push("      <skipped/>");
        } else if (!r.passed) {
          lines.push(`      <failure message="test failed"><![CDATA[${r.error || ""}]]></failure>`);
        }
        if (r.warning) {
          lines.push(`      <system-out>${escapeXml(r.warning)}</system-out>`);
        }
        lines.push("    </testcase>");
      }
      lines.push("  </testsuite>");
    }

    lines.push("</testsuites>");
    process.stdout.write(lines.join("\n") + "\n");
  }
}

export function createReporter(type, { color = true } = {}) {
  if (type === "json") return new JsonReporter({ color: false });
  if (type === "junit") return new JUnitReporter({ color: false });
  return new ConsoleReporter({ color });
}
