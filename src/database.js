import { runSqlcmd, buildConnectionArgs } from "./sqlcmd.js";
import { join } from "path";
import { mkdir } from "fs/promises";

/**
 * Builds a path for SQL Server file redirection (RESTORE ... MOVE).
 *
 * On Windows, SQL Server requires backslashes in physical file paths.
 * On other platforms, forward slashes are used.
 *
 * The result is SQL-escaped (single quotes doubled) and ready to be embedded
 * in a N'...' literal inside a RESTORE statement.
 */
function buildSqlServerPath(dir, fileName) {
  const sep = process.platform === "win32" ? "\\" : "/";
  const normalizedDir = String(dir).replace(/[\\/]+$/, "");
  const full = `${normalizedDir}${sep}${fileName}`;
  return full.replace(/'/g, "''");
}

async function queryScalar(cfg, query, database = "master", { debug = false } = {}) {
  const args = buildConnectionArgs(cfg, { database });
  args.push("-h", "-1", "-W", "-Q", query);
  const res = await runSqlcmd(args, { debug });
  if (res.code !== 0) {
    throw new Error(`Query failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout.trim();
}

async function queryRows(cfg, query, database = "master", { debug = false } = {}) {
  const args = buildConnectionArgs(cfg, { database });
  args.push("-h", "-1", "-W", "-s", "|", "-Q", query);
  const res = await runSqlcmd(args, { debug });
  if (res.code !== 0) {
    throw new Error(`Query failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => line.split("|"));
}

export async function checkConnection(cfg, { debug = false } = {}) {
  const args = buildConnectionArgs(cfg, { database: "master" });
  args.push("-Q", "select 1");
  const res = await runSqlcmd(args, { debug });
  if (res.code !== 0) {
    throw new Error(`Failed to connect to the server:\n${(res.stderr || res.stdout || "").trim()}`);
  }
}

export async function databaseExists(cfg, dbName, { debug = false } = {}) {
  const safe = dbName.replace(/'/g, "''");
  const q = `set nocount on; select case when db_id('${safe}') is null then 0 else 1 end`;
  const out = await queryScalar(cfg, q, "master", { debug });
  return out.startsWith("1");
}

export async function createDatabase(cfg, dbName, { debug = false } = {}) {
  const safe = dbName.replace(/[\]\[]/g, "");
  await queryScalar(cfg, `create database [${safe}]`, "master", { debug });
}

export async function dropDatabase(cfg, dbName, { debug = false } = {}) {
  const safe = dbName.replace(/[\]\[]/g, "");
  const safeStr = safe.replace(/'/g, "''");
  const q = `
    if db_id('${safeStr}') is not null
    begin
      alter database [${safe}] set single_user with rollback immediate;
      drop database [${safe}];
    end`;
  await queryScalar(cfg, q, "master", { debug });
}

async function resolveBackupDir(cfg, { debug = false } = {}) {
  if (cfg.backupPath && cfg.backupPath.trim() !== "") {
    const dir = cfg.backupPath;
    try {
      await mkdir(dir, { recursive: true });
    } catch {
      // ignore; the server-side error will be more informative.
    }
    return dir;
  }

  // Ask SQL Server for its default paths.
  const args = buildConnectionArgs(cfg, { database: "master" });
  args.push(
    "-Q",
    "set nocount on; select " +
      "cast(serverproperty('InstanceDefaultBackupPath') as nvarchar(4000)) as b, " +
      "cast(serverproperty('InstanceDefaultDataPath')   as nvarchar(4000)) as d, " +
      "cast(serverproperty('InstanceDefaultLogPath')    as nvarchar(4000)) as l;",
    "-h",
    "-1",
    "-W",
    "-s",
    "|",
  );
  const res = await runSqlcmd(args, { debug });
  if (res.code !== 0) {
    throw new Error(`Failed to query SQL Server default paths: ${res.stderr || res.stdout}`);
  }
  const line = res.stdout.trim().split(/\r?\n/)[0] || "";
  const [backupPath, dataPath, logPath] = line.split("|").map((s) => s.trim());

  const dir = backupPath || dataPath || logPath;
  if (!dir) {
    throw new Error(
      "Could not determine the SQL Server default backup path. " +
        'Please set "backupPath" in sstr.config.json to a directory that the ' +
        "SQL Server service account can write to.",
    );
  }
  return dir;
}

/**
 * Backs up sourceDb to a .bak file, then restores it under targetDb.
 * Filegroups and their files are preserved.
 */
export async function backupAndRestore(cfg, sourceDb, targetDb, { debug = false } = {}) {
  const safeSource = sourceDb.replace(/[\]\[]/g, "");
  const safeTarget = targetDb.replace(/[\]\[]/g, "");
  const safeSourceStr = safeSource.replace(/'/g, "''");

  const backupDir = await resolveBackupDir(cfg, { debug });
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const backupName = `sstr_${safeSource}_${stamp}.bak`;
  const backupPathOnClient = join(backupDir, backupName);
  const backupFileSql = buildSqlServerPath(backupDir, backupName);

  const backupQ = `backup database [${safeSource}] to disk = N'${backupFileSql}' with init, copy_only`;
  await queryScalar(cfg, backupQ, "master", { debug });
  
  const files = await queryRows(
    cfg,
    `set nocount on;
     select mf.name, mf.physical_name, mf.type_desc
     from sys.master_files mf
     where mf.database_id = db_id('${safeSourceStr}')
     order by mf.file_id;`,
    "master",
    { debug },
  );

  if (files.length === 0) {
    throw new Error(`No physical files found for database "${sourceDb}".`);
  }

  const moves = [];
  for (let i = 0; i < files.length; i++) {
    const [logicalName, , typeDesc] = files[i];
    const safeLogical = logicalName.replace(/'/g, "''");
    const ext = typeDesc === "LOG" ? "ldf" : "mdf";
    const newName = `${safeTarget}_${i}_${logicalName.replace(/[^A-Za-z0-9_]/g, "_")}.${ext}`;
    const newPath = buildSqlServerPath(backupDir, newName);
    moves.push(`move N'${safeLogical}' to N'${newPath}'`);
  }

  const restoreQ = `restore database [${safeTarget}] from disk = N'${backupFileSql}' with replace, ${moves.join(
    ",\n",
  )}`;
  await queryScalar(cfg, restoreQ, "master", { debug });

  return backupPathOnClient;
}

/**
 * Lists stored procedures in the given database, formatted as "schema.name".
 */
export async function listStoredProcedures(cfg, dbName, { debug = false } = {}) {
  const q = `
    set nocount on;
    select s.name + '.' + p.name
    from sys.procedures p
    join sys.schemas s on s.schema_id = p.schema_id
    order by s.name, p.name;`;
  const out = await queryScalar(cfg, q, dbName, { debug });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Executes a test procedure.
 *
 * Parameters (if any) are passed as NULL.
 *
 * When `useTransaction` is true (default), the call is wrapped in a
 * transaction that is rolled back at the end, isolating the test from its
 * peers. If the procedure commits internally, the rollback is skipped.
 *
 * When `queryTimeout` is provided, it overrides the global `queryTimeout`
 * for this single call (passed to sqlcmd as `-t`).
 */
export async function executeTestProcedure(
  cfg,
  dbName,
  fullName,
  { debug = false, useTransaction = true, queryTimeout = null } = {},
) {
  const [schema, name] = fullName.split(".");
  if (!schema || !name) {
    throw new Error(`Invalid procedure name: ${fullName}`);
  }

  const safeFull = fullName.replace(/'/g, "''");
  const paramsOut = await queryScalar(
    cfg,
    `set nocount on;
     select p.name, t.name as type_name
     from sys.parameters p
     join sys.types t on t.user_type_id = p.user_type_id
     where p.object_id = object_id('${safeFull}')
     order by p.parameter_id;`,
    dbName,
    { debug },
  );
  const paramLines = paramsOut
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  let execCall;
  if (paramLines.length === 0) {
    execCall = `exec [${schema}].[${name}]`;
  } else {
    const paramList = paramLines
      .map((line) => {
        const [pname] = line.split(/\s+/);
        const cleanName = pname.replace(/^@/, "");
        return `@${cleanName} = null`;
      })
      .join(", ");
    execCall = `exec [${schema}].[${name}] ${paramList}`;
  }

  let execSql;
  if (useTransaction) {
    // Wrap the procedure call in a transaction and always roll back so that
    // data changes made by one test do not leak into the next one.
    //
    // - On success, ROLLBACK undoes the test's changes.
    // - On failure, CATCH rolls back (if a transaction is still open) and
    //   rethrows the original error so sqlcmd -b reports a non-zero exit code.
    // - If the test procedure commits internally, @@TRANCOUNT becomes 0;
    //   in that case we skip the rollback so the user still sees the real
    //   error (if any) instead of a "no corresponding BEGIN" message.
    execSql = `
      set nocount on;
      begin transaction;
      begin try
        ${execCall};
        if @@trancount > 0 rollback transaction;
      end try
      begin catch
        if @@trancount > 0 rollback transaction;
        throw;
      end catch
    `;
  } else {
    execSql = `set nocount on; ${execCall};`;
  }

  const args = buildConnectionArgs(cfg, { database: dbName });

  // Override the query timeout for this call if requested.
  if (queryTimeout != null) {
    const idx = args.indexOf("-t");
    if (idx !== -1 && idx + 1 < args.length) {
      args[idx + 1] = String(queryTimeout);
    } else {
      args.push("-t", String(queryTimeout));
    }
  }

  args.push("-Q", execSql);
  return runSqlcmd(args, { debug });
}

/**
 * Returns the list of databases whose names start with `${prefix}_sstr_`.
 * Uses ESCAPE to treat underscores literally.
 */
export async function listSstDatabases(cfg, prefix, { debug = false } = {}) {
  const safe = prefix.replace(/'/g, "''").replace(/[_%]/g, (m) => `\\${m}`);
  const q = `
    set nocount on;
    select name from sys.databases
    where name like '${safe}\\_sst\\_%' escape '\\'
    order by name;`;
  const out = await queryScalar(cfg, q, "master", { debug });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
