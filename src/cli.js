import { readFile, writeFile, access, readdir, unlink } from "fs/promises";
import { join, dirname } from "path";
import { constants } from "fs";
import { fileURLToPath } from "url";
import { createInterface } from "readline/promises";

import { loadConfig, validateConfig, mergeCliOverrides } from "./config.js";
import { run } from "./runner.js";
import { discoverTestFiles } from "./discover.js";
import {
  checkConnection,
  databaseExists,
  dropDatabase,
  listSstDatabases,
} from "./database.js";
import { runSqlcmd, buildConnectionArgs } from "./sqlcmd.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// Banner and help
// ============================================================

function getName(version) {
  return `sql-server-test-runner (sstr) v${version}`;
}

function printBanner(version) {
  console.log(getName(version));
  console.log(
    "  SQL script test runner for unit testing SQL Server databases, powered by sqlcmd.",
  );
  console.log("");
  console.log('Run "sstr run" to execute tests, or "sstr --help" for usage.');
}

function buildHelp(version) {
  return `
${getName(version)}

Description:
  A simple test runner for SQL Server that provides unit-testing
  database objects (sp, udf, etc.) through executing user's
  custom .sql scripts using sqlcmd and reporting failed tests.

Usage:
  sstr                             Print name and version, then exit.
  sstr <command> [options]

Commands:
  run                           Execute tests using the loaded config.
  init                          Create a default sstr.config.json in the current
                                directory. Fails if the file already exists.
  list                          List discovered test files and exit without
                                connecting to the database.
  config                        Print the final merged config and exit.
                                WARNING: may contain credentials.
  connect                       Check that the database connection succeeds
                                and print basic server info. Does not create,
                                backup, restore, or drop anything.
  clean                         Remove leftover test databases and .bak files
                                from previous runs. Supports --dry-run,
                                --keep-backups, and --yes.

General options:
  -v, --version                 Print the program version and exit.
  -?, -h, --help                Show this help and exit.
                                On Windows cmd.exe, "?" is a wildcard; use -h
                                or escape it as "sstr ^?".

Config and directory (all commands except init):
  -c, --config <path>           Use <path> as the base config file instead of
                                sstr.config.json. Relative paths are resolved
                                against --cwd.
  -e, --env <name>              Merge sstr.config.<name>.json on top of the base
                                config. The env file is looked up next to the
                                base config.
  -d, --cwd <path>              Working directory (default: current directory).

Test selection (run, list):
  -tr, --test-regex <regex>     Override "testRegex" from the config.

Output (run, connect):
  --color / --no-color          Force colored output on or off.
  -rt, --report-type <type>     console | json | junit (default: console).
                                For "connect", only console is supported;
                                json/junit are rejected.

Execution control (run, connect, clean):
  -qt, --query-timeout <sec>    Override "queryTimeout" from the config.
  -dr, --detailed-report        Print every sqlcmd command and its raw output.

Execution control (run only):
  -b, --bail                    Stop at the first failing test.
  -kd, --keep-db                Do not drop the test database at the end.
  -nt, --no-transaction         Do not wrap each test procedure in a
                                transaction. Use this only for test procedures
                                that COMMIT internally; otherwise data changes
                                from one test can leak into the next.
Clean options (clean only):
  --dry-run                     Show what would be removed, change nothing.
  --keep-backups                Only drop databases; do not delete .bak files.
  -y, --yes                     Skip confirmation prompts.

Examples:
  sstr
  sstr run
  sstr run --env development
  sstr init
  sstr list
  sstr list --env development
  sstr config --env development
  sstr connect
  sstr connect --env ci --detailed-report
  sstr clean --dry-run
  sstr clean --yes
  sstr clean --yes --keep-backups
  sstr run --report-type junit --no-color --bail > report.xml
  sstr run --config ./configs/sstr.ci.json --env ci --query-timeout 120
  sstr run --detailed-report --keep-db --no-color 2> sstr.trace.log

Exit codes:
  0   Connection succeeded / all tests passed / nothing to clean.
  1   A fatal error (config, connection, deployment, missing script, etc.).
  2   At least one test failed.
`;
}

// ============================================================
// Small helpers
// ============================================================

async function readPackageVersion() {
  const pkgPath = join(__dirname, "..", "package.json");
  try {
    const raw = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw);
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function confirm(question) {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Refusing to prompt without a TTY. Use "--yes" to proceed non-interactively.',
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

// ============================================================
// Shared context: load and validate config once per command
// ============================================================

async function prepareContext(opts) {
  const colorEnabled =
    opts.color === true
      ? true
      : opts.color === false
        ? false
        : Boolean(process.stdout.isTTY);

  let cfg = await loadConfig(opts.cwd, opts.env, {
    configPath: opts.configPath,
  });
  cfg = mergeCliOverrides(cfg, {
    testRegex: opts.testRegex,
    queryTimeout: opts.queryTimeout,
  });
  validateConfig(cfg);

  return { cfg, colorEnabled };
}

// ============================================================
// Commands
// ============================================================

const DEFAULT_CONFIG_JSON = `{
  "connection": {
    "server": "localhost",
    "username": "",
    "password": "",
    "trustedConnection": true,
    "encrypt": false,
    "trustServerCertificate": true
  },
  "loginTimeout": 15,
  "queryTimeout": 180,
  "testDb": "sstr_testdb",
  "backupPath": "",
  "cleanupBackup": false,
  "testRegex": "(tests/.*|(\\\\.|/)(test|spec))\\\\.sql$",
  "testMatch": "^test_",
  "testSchema": "sstr",
  "assertSchema": "Assert",
  "scripts": {
    "warmUp": "",
    "coolDown": "",
    "preScript": "",
    "postScript": ""
  },
  "sqlCmdOptions": {
    "enableQuotedIdentifiers": true
  }
}
`;

export async function cmdInit(opts) {
  const target = join(opts.cwd, "sstr.config.json");
  if (await fileExists(target)) {
    throw new Error(
      `"sstr.config.json" already exists in "${opts.cwd}". Aborting.`,
    );
  }
  await writeFile(target, DEFAULT_CONFIG_JSON, "utf-8");
  console.log(`Created "${target}".`);
}

export async function cmdConnect(opts) {
  if (opts.reportType !== "console") {
    throw new Error(
      `"connect" only supports --report-type console (got "${opts.reportType}").`,
    );
  }
  if (opts.bail) throw new Error('"--bail" is only supported by "sstr run".');
  if (opts.keepDb)
    throw new Error('"--keep-db" is only supported by "sstr run".');

  const { cfg } = await prepareContext(opts);

  const server = cfg.connection?.server || "(unknown)";
  console.log(`Connecting to "${server}" (master)...`);
  const t0 = Date.now();
  await checkConnection(cfg, { debug: opts.detailed });
  const elapsed = Date.now() - t0;

  let serverVersion = null;
  let defaultDb = null;
  try {
    const args = buildConnectionArgs(cfg, { database: "master" });
    args.push(
      "-Q",
      "set nocount on; select @@version as v, db_name() as d;",
      "-h",
      "-1",
      "-W",
      "-s",
      "|",
    );
    const res = await runSqlcmd(args, { debug: opts.detailed });
    if (res.code === 0) {
      const line = res.stdout.trim().split(/\r?\n/)[0] || "";
      const [v, d] = line.split("|");
      if (v) serverVersion = v.trim();
      if (d) defaultDb = d.trim();
    }
  } catch {
    // ignore; connection already succeeded.
  }

  if (serverVersion) console.log(`  server:        ${serverVersion}`);
  if (defaultDb) console.log(`  default db:    ${defaultDb}`);
  console.log(`  connected in:  ${elapsed} ms`);
  console.log("OK");
}

export async function cmdConfig(opts) {
  const { cfg } = await prepareContext(opts);
  console.log(JSON.stringify(cfg, null, 2));
}

export async function cmdList(opts) {
  const { cfg } = await prepareContext(opts);
  const files = await discoverTestFiles(opts.cwd, cfg.testRegex);
  if (files.length === 0) {
    console.log("No test files found.");
    return;
  }
  for (const f of files) console.log(f);
}

export async function cmdClean(opts) {
  if (opts.reportType !== "console") {
    throw new Error(
      `"clean" only supports --report-type console (got "${opts.reportType}").`,
    );
  }
  if (opts.bail) throw new Error('"--bail" is only supported by "sstr run".');
  if (opts.keepDb)
    throw new Error('"--keep-db" is only supported by "sstr run".');

  const { cfg } = await prepareContext(opts);

  const testDb = cfg.testDb || "sstr_testdb";
  const backupPath = cfg.backupPath || null;

  console.log("Cleaning up test artifacts...");

  // ---- Discover target databases ----
  const dbTargets = new Set();

  if (await databaseExists(cfg, testDb, { debug: opts.detailed })) {
    dbTargets.add(testDb);
  }
  const restored = await listSstDatabases(cfg, testDb, {
    debug: opts.detailed,
  });
  for (const d of restored) dbTargets.add(d);

  // ---- Discover backup files ----
  let backupFiles = [];
  if (backupPath && !opts.keepBackups) {
    try {
      const entries = await readdir(backupPath, { withFileTypes: true });
      for (const e of entries) {
        if (
          e.isFile() &&
          e.name.startsWith("sstr_") &&
          e.name.toLowerCase().endsWith(".bak")
        ) {
          backupFiles.push(join(backupPath, e.name));
        }
      }
    } catch {
      // backupPath may not exist; ignore.
    }
  }

  // ---- Report what was found ----
  if (dbTargets.size === 0 && backupFiles.length === 0) {
    console.log("Nothing to clean.");
    return;
  }

  if (dbTargets.size > 0) {
    console.log("  Found databases:");
    for (const d of [...dbTargets].sort()) console.log(`    - ${d}`);
  } else {
    console.log("  Found databases: (none)");
  }

  if (opts.keepBackups) {
    console.log("  Skipping backup files (--keep-backups).");
  } else if (backupFiles.length > 0) {
    console.log(`  Found backup files (${backupFiles.length}):`);
    for (const f of backupFiles) console.log(`    - ${f}`);
  } else {
    console.log("  Found backup files: (none)");
  }

  // ---- Dry run ----
  if (opts.dryRun) {
    console.log("");
    console.log("[dry-run] No changes were made.");
    for (const d of [...dbTargets].sort()) {
      console.log(`[dry-run] Would drop database "${d}".`);
    }
    for (const f of backupFiles) {
      console.log(`[dry-run] Would delete "${f}".`);
    }
    return;
  }

  // ---- Confirm ----
  if (!opts.yes) {
    console.log("");
    const ok = await confirm(
      "Proceed with cleanup? This cannot be undone. [y/N] ",
    );
    if (!ok) {
      console.log("Aborted.");
      return;
    }
  }

  // ---- Drop databases ----
  let droppedCount = 0;
  for (const d of [...dbTargets].sort()) {
    try {
      await dropDatabase(cfg, d, { debug: opts.detailed });
      console.log(`  Dropped database "${d}".`);
      droppedCount++;
    } catch (e) {
      console.error(`  Failed to drop database "${d}": ${e.message}`);
    }
  }

  // ---- Delete backup files ----
  let deletedCount = 0;
  for (const f of backupFiles) {
    try {
      await unlink(f);
      console.log(`  Deleted "${f}".`);
      deletedCount++;
    } catch (e) {
      console.error(`  Failed to delete "${f}": ${e.message}`);
    }
  }

  console.log("");
  console.log(
    `Done. Dropped ${droppedCount} database(s), removed ${deletedCount} file(s).`,
  );
}

export async function cmdRun(opts) {
  const { cfg, colorEnabled } = await prepareContext(opts);

  const reporter = await run(cfg, {
    cwd: opts.cwd,
    reportType: opts.reportType,
    color: colorEnabled,
    bail: opts.bail,
    keepDb: opts.keepDb,
    detailed: opts.detailed,
    useTransaction: opts.useTransaction,
  });

  if (reporter.hasFailures) {
    process.exitCode = 2;
  }
}

// ============================================================
// Argument parsing
// ============================================================

const ALLOWED_COMMANDS = ["init", "run", "list", "config", "connect", "clean"];

function parseCliArgs(argv) {
  const opts = {
    command: null,
    env: null,
    cwd: process.cwd(),
    configPath: null,
    testRegex: null,
    color: null,
    reportType: "console",
    useTransaction: true,
    bail: false,
    keepDb: false,
    queryTimeout: null,
    detailed: false,
    // clean-specific
    dryRun: false,
    keepBackups: false,
    yes: false,
    hadAnyArg: argv.length > 0,
  };

  const args = [...argv];

  if (args[0] && !args[0].startsWith("-")) {
    opts.command = args.shift();
    if (!ALLOWED_COMMANDS.includes(opts.command)) {
      throw new Error(
        `Unknown command: ${opts.command}. Allowed: ${ALLOWED_COMMANDS.join(", ")}.`,
      );
    }
  }

  while (args.length > 0) {
    const a = args.shift();

    if (a === "-v" || a === "--version") {
      opts.version = true;
      continue;
    }
    if (a === "-?" || a === "-h" || a === "--help") {
      opts.help = true;
      continue;
    }
    if (a === "-c" || a === "--config") {
      const v = args.shift();
      if (!v) throw new Error("Missing value for --config.");
      opts.configPath = v;
      continue;
    }
    if (a === "-e" || a === "--env") {
      const v = args.shift();
      if (!v) throw new Error("Missing value for --env.");
      opts.env = v;
      continue;
    }
    if (a === "-d" || a === "--cwd") {
      const v = args.shift();
      if (!v) throw new Error("Missing value for --cwd.");
      opts.cwd = v;
      continue;
    }
    if (a === "-tr" || a === "--test-regex") {
      const v = args.shift();
      if (!v) throw new Error("Missing value for --test-regex.");
      opts.testRegex = v;
      continue;
    }
    if (a === "--color") {
      opts.color = true;
      continue;
    }
    if (a === "--no-color") {
      opts.color = false;
      continue;
    }
    if (a === "-rt" || a === "--report-type") {
      const v = args.shift();
      if (!v) throw new Error("Missing value for --report-type.");
      if (!["console", "json", "junit"].includes(v)) {
        throw new Error(
          `Invalid --report-type "${v}". Allowed: console, json, junit.`,
        );
      }
      opts.reportType = v;
      continue;
    }
    if (a === "-nt" || a === "--no-transaction") {
      opts.useTransaction = false;
      continue;
    }
    if (a === "-b" || a === "--bail") {
      opts.bail = true;
      continue;
    }
    if (a === "-kd" || a === "--keep-db") {
      opts.keepDb = true;
      continue;
    }
    if (a === "-qt" || a === "--query-timeout") {
      const v = args.shift();
      if (!v) throw new Error("Missing value for --query-timeout.");
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0)
        throw new Error("--query-timeout must be a non-negative number.");
      opts.queryTimeout = n;
      continue;
    }
    if (a === "-dr" || a === "--detailed-report") {
      opts.detailed = true;
      continue;
    }
    if (a === "--dry-run") {
      opts.dryRun = true;
      continue;
    }
    if (a === "--keep-backups") {
      opts.keepBackups = true;
      continue;
    }
    if (a === "-y" || a === "--yes") {
      opts.yes = true;
      continue;
    }

    throw new Error(`Unknown argument: ${a}`);
  }

  return opts;
}

// ============================================================
// Entry point
// ============================================================

export async function runCLI(argv) {
  const opts = parseCliArgs(argv);
  const version = await readPackageVersion();

  // No arguments → banner.
  if (!opts.hadAnyArg) {
    printBanner(version);
    return;
  }

  // Immediate-exit flags.
  if (opts.help) {
    console.log(buildHelp(version));
    return;
  }
  if (opts.version) {
    console.log(version);
    return;
  }

  // Commands must be explicit. "run" is required to execute tests.
  if (opts.command == null) {
    const flags = argv
      .filter((a) => !a.startsWith("-") || a.startsWith("--"))
      .join(" ");
    const hint = flags ? `sstr run ${flags}` : "sstr run";
    throw new Error(
      `Missing command. Allowed commands: ${ALLOWED_COMMANDS.join(", ")}. ` +
        `To execute tests, use "${hint}". For usage, run "sstr --help".`,
    );
  }

  switch (opts.command) {
    case "init":
      return cmdInit(opts);
    case "connect":
      return cmdConnect(opts);
    case "config":
      return cmdConfig(opts);
    case "list":
      return cmdList(opts);
    case "clean":
      return cmdClean(opts);
    case "run":
      return cmdRun(opts);
    default:
      throw new Error(`Unknown command: ${opts.command}`);
  }
}
