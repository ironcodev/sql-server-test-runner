import { spawn } from "child_process";

/**
 * Runs sqlcmd with the given arguments.
 * Returns { code, stdout, stderr }.
 *
 * When `debug` is true, prints the full command and raw output to stderr.
 *
 * On Windows, `sqlcmd` is resolved via PATH; no shell is used, so arguments
 * are passed verbatim to the process and no escaping is needed.
 */
export function runSqlcmd(args, { cwd, input, debug = false } = {}) {
  const printable = ["sqlcmd", ...args].join(" ");
  if (debug) {
    console.error(`[sstr] $ ${printable}`);
  }

  return new Promise((resolve) => {
    const child = spawn("sqlcmd", args, {
      cwd,
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    if (input != null) {
      child.stdin.write(input);
    }
    child.stdin.end();

    child.on("error", (err) => {
      if (debug) console.error(`[sstr] spawn error: ${err.message}`);
      resolve({ code: -1, stdout, stderr: err.message });
    });

    child.on("close", (code) => {
      if (debug) {
        console.error(`[sstr] exit code: ${code}`);
        if (stdout.trim()) console.error(`[sstr] stdout:\n${stdout.trimEnd()}`);
        if (stderr.trim()) console.error(`[sstr] stderr:\n${stderr.trimEnd()}`);
      }
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Builds sqlcmd arguments from connection and sqlCmdOptions.
 * database: when provided, adds -d <database>.
 */
export function buildConnectionArgs(cfg, { database = null } = {}) {
  const conn = cfg.connection || {};
  const opts = cfg.sqlCmdOptions || {};
  const args = [];

  args.push("-S", conn.server);

  const trusted =
    conn.trustedConnection === true ||
    conn.trustedConnection === "true" ||
    conn.trustedConnection === 1;

  if (trusted) {
    args.push("-E");
  } else {
    const user = conn.username || "sa";
    args.push("-U", user);
    if (conn.password != null) args.push("-P", conn.password);
  }

  if (conn.encrypt === true) args.push("-N");
  if (conn.trustServerCertificate === true) args.push("-C");

  if (cfg.loginTimeout != null) args.push("-l", String(cfg.loginTimeout));
  if (cfg.queryTimeout != null) args.push("-t", String(cfg.queryTimeout));

  if (opts.hostName) args.push("-H", opts.hostName);
  if (opts.packetSize != null) args.push("-a", String(opts.packetSize));
  if (opts.enableQuotedIdentifiers === true) args.push("-I");
  if (opts.removeTrailingSpaces === true) args.push("-W");
  if (opts.controlCharBehavior === "remove") args.push("-k");
  else if (opts.controlCharBehavior === "replace1") args.push("-k1");
  else if (opts.controlCharBehavior === "replace2") args.push("-k2");
  if (opts.unicodeOutput === true) args.push("-u");
  if (opts.useAzureActiveDirectory === true) args.push("-G");
  if (opts.codePage != null) args.push("-f", String(opts.codePage));
  if (opts.hostNameInCertificate) args.push("-F", opts.hostNameInCertificate);
  if (opts.useClientRegionalSetting === true) args.push("-R");
  if (opts.applicationIntent) args.push("-K", opts.applicationIntent);
  if (opts.multiSubnetFailover) args.push("-M", opts.multiSubnetFailover);
  if (opts.printRawErrorMessages === true) args.push("-j");
  if (opts.enableColumnEncryption === true) args.push("-g");
  if (opts.serverCertificatePath) args.push("-J", opts.serverCertificatePath);
  if (opts.vars && typeof opts.vars === "object") {
    for (const [k, v] of Object.entries(opts.vars)) {
      args.push("-v", `${k}=${v}`);
    }
  }
  if (opts.ignoreVars === true) args.push("-x");
  if (opts.disableCommands === true) args.push("-X");
  if (opts.disableCommandsAndExit === true) args.push("-X1");
  if (opts.batchTerminator) args.push("-c", opts.batchTerminator);
  if (opts.errorLevel != null) args.push("-m", String(opts.errorLevel));
  if (opts.errorSeverityLevel != null)
    args.push("-V", String(opts.errorSeverityLevel));
  if (opts.varLengthTypeDisplayWidth != null)
    args.push("-y", String(opts.varLengthTypeDisplayWidth));
  if (opts.fixedLengthTypeDisplayWidth != null)
    args.push("-Y", String(opts.fixedLengthTypeDisplayWidth));
  if (opts.performanceStatistics === true) args.push("-p1");

  if (database) {
    args.push("-d", database);
  }

  args.push("-b");

  return args;
}
