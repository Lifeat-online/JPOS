import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { query } from "./db.js";
export type BackupScope = "full-database";
export interface DatabaseBackupSummary {
  id: string;
  filename: string;
  createdAt: string;
  createdBy: string | null;
  note: string | null;
  scope: BackupScope;
  dialect: "postgres";
  databaseName: string | null;
  schemaName: string | null;
  tableCount: number;
  totalRows: number;
  tables: Array<{
    name: string;
    rows: number;
  }>;
}
export interface DatabaseBackupFile {
  version: 1;
  id: string;
  createdAt: string;
  createdBy: string | null;
  note: string | null;
  scope: BackupScope;
  source: {
    dialect: "postgres";
    databaseName: string | null;
    schemaName: string | null;
  };
  tables: DatabaseBackupTable[];
}
export interface DatabaseBackupTable {
  name: string;
  columns: string[];
  primaryKey: string[];
  rows: Array<Record<string, unknown>>;
}
export interface RestoreResult {
  backupId: string;
  dryRun: boolean;
  overwriteExisting: boolean;
  startedAt: string;
  finishedAt: string;
  totals: {
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
    tables: number;
    rows: number;
  };
  tables: RestoreTableResult[];
}
export interface RestoreTableResult {
  name: string;
  rows: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  missingColumns: string[];
  status: "ok" | "skipped" | "partial" | "failed";
  message?: string;
}
type ColumnMetadata = {
  name: string;
  dataType: string;
  ordinalPosition: number;
};
type RestoreOptions = {
  dryRun?: boolean;
  overwriteExisting?: boolean;
};
const BACKUP_VERSION = 1;
const DEFAULT_BACKUP_DIR = path.resolve(process.cwd(), "db", "backups");
function backupDir() {
  return path.resolve(process.env.DB_BACKUP_DIR?.trim() || DEFAULT_BACKUP_DIR);
}
function dialect(): "postgres" {
  return "postgres";
}
function quoteIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe database identifier: ${value}`);
  }
  return `"${value.replace(/"/g, '""')}"`;
}
function backupTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}
function rowValue(row: Record<string, unknown>, key: string) {
  return row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
}
function normalizeBackupId(id: string) {
  const trimmed = String(id || "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) {
    throw new Error("Invalid backup id");
  }
  return trimmed.endsWith(".json") ? trimmed.slice(0, -5) : trimmed;
}
function backupFilePath(id: string) {
  const dir = backupDir();
  const filename = `${normalizeBackupId(id)}.json`;
  const fullPath = path.resolve(dir, filename);
  const relative = path.relative(dir, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Backup path escapes backup directory");
  }
  return fullPath;
}
async function ensureBackupDir() {
  await fs.mkdir(backupDir(), { recursive: true });
}
async function getDatabaseIdentity() {
  const rows = await query<{
    databaseName: string;
    schemaName: string;
  }>(
    `SELECT current_database() AS databaseName, current_schema() AS schemaName`,
  );
  return {
    databaseName: String(rows[0]?.databaseName || ""),
    schemaName: String(rows[0]?.schemaName || ""),
  };
}
export async function listDatabaseTables() {
  const rows = await query<{
    tableName: string;
  }>(`SELECT table_name AS tableName
     FROM information_schema.tables
     WHERE table_schema = current_schema()
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`);
  return rows
    .map((row) => String(rowValue(row as any, "tableName") || ""))
    .filter(Boolean);
}
async function listColumnMetadata() {
  const rows = await query<{
    tableName: string;
    columnName: string;
    dataType: string;
    ordinalPosition: number;
  }>(`SELECT table_name AS tableName,
            column_name AS columnName,
            data_type AS dataType,
            ordinal_position AS ordinalPosition
     FROM information_schema.columns
     WHERE table_schema = current_schema()
     ORDER BY table_name, ordinal_position`);
  const columns = new Map<string, ColumnMetadata[]>();
  for (const row of rows as any[]) {
    const tableName = String(rowValue(row, "tableName") || "");
    const columnName = String(rowValue(row, "columnName") || "");
    if (!tableName || !columnName) continue;
    const list = columns.get(tableName) || [];
    list.push({
      name: columnName,
      dataType: String(rowValue(row, "dataType") || "").toLowerCase(),
      ordinalPosition: Number(
        rowValue(row, "ordinalPosition") || list.length + 1,
      ),
    });
    columns.set(tableName, list);
  }
  return columns;
}
async function listPrimaryKeys() {
  const rows = await query<{
    tableName: string;
    columnName: string;
  }>(`SELECT kcu.table_name AS tableName,
            kcu.column_name AS columnName
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name
      AND kcu.constraint_schema = tc.constraint_schema
      AND kcu.table_name = tc.table_name
     WHERE tc.constraint_type = 'PRIMARY KEY'
       AND tc.table_schema = current_schema()
     ORDER BY kcu.table_name, kcu.ordinal_position`);
  const keys = new Map<string, string[]>();
  for (const row of rows as any[]) {
    const tableName = String(rowValue(row, "tableName") || "");
    const columnName = String(rowValue(row, "columnName") || "");
    if (!tableName || !columnName) continue;
    keys.set(tableName, [...(keys.get(tableName) || []), columnName]);
  }
  return keys;
}
async function listForeignKeyDependencies() {
  const rows = await query<{
    tableName: string;
    referencedTableName: string;
  }>(`SELECT DISTINCT tc.table_name AS tableName,
            ccu.table_name AS referencedTableName
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
      AND ccu.constraint_schema = tc.constraint_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = current_schema()
     ORDER BY tc.table_name, ccu.table_name`);
  const dependencies = new Map<string, Set<string>>();
  for (const row of rows as any[]) {
    const tableName = String(rowValue(row, "tableName") || "");
    const referencedTableName = String(
      rowValue(row, "referencedTableName") || "",
    );
    if (!tableName || !referencedTableName || tableName === referencedTableName)
      continue;
    const refs = dependencies.get(tableName) || new Set<string>();
    refs.add(referencedTableName);
    dependencies.set(tableName, refs);
  }
  return dependencies;
}
function orderTables(tables: string[], dependencies: Map<string, Set<string>>) {
  const known = new Set(tables);
  const pending = new Set(tables);
  const ordered: string[] = [];
  while (pending.size > 0) {
    let progressed = false;
    for (const table of [...pending].sort()) {
      const refs = [...(dependencies.get(table) || [])].filter(
        (ref) => known.has(ref) && pending.has(ref),
      );
      if (refs.length > 0) continue;
      pending.delete(table);
      ordered.push(table);
      progressed = true;
    }
    if (!progressed) {
      ordered.push(...[...pending].sort());
      break;
    }
  }
  return ordered;
}
function summarizeBackup(
  backup: DatabaseBackupFile,
  filename: string,
): DatabaseBackupSummary {
  const tables = backup.tables.map((table) => ({
    name: table.name,
    rows: table.rows.length,
  }));
  return {
    id: backup.id,
    filename,
    createdAt: backup.createdAt,
    createdBy: backup.createdBy || null,
    note: backup.note || null,
    scope: backup.scope,
    dialect: backup.source.dialect,
    databaseName: backup.source.databaseName || null,
    schemaName: backup.source.schemaName || null,
    tableCount: backup.tables.length,
    totalRows: tables.reduce((sum, table) => sum + table.rows, 0),
    tables,
  };
}
function assertBackupFile(value: unknown): DatabaseBackupFile {
  if (!value || typeof value !== "object") {
    throw new Error("Backup file is not a JSON object");
  }
  const backup = value as DatabaseBackupFile;
  if (
    backup.version !== BACKUP_VERSION ||
    !backup.id ||
    !Array.isArray(backup.tables)
  ) {
    throw new Error("Unsupported or invalid database backup file");
  }
  return backup;
}
function parseBackupJson(text: string) {
  return assertBackupFile(JSON.parse(text));
}
export async function listDatabaseBackups() {
  await ensureBackupDir();
  const entries = await fs.readdir(backupDir(), { withFileTypes: true });
  const backups: DatabaseBackupSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const backup = parseBackupJson(
        await fs.readFile(path.join(backupDir(), entry.name), "utf8"),
      );
      backups.push(summarizeBackup(backup, entry.name));
    } catch {
      // Corrupt scratch files are ignored so the maintenance panel stays usable.
    }
  }
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function createDatabaseBackup(
  options: {
    createdBy?: string | null;
    note?: string | null;
  } = {},
) {
  await ensureBackupDir();
  const createdAt = new Date().toISOString();
  const id = `db_backup_${backupTimestamp(new Date(createdAt))}_${crypto.randomBytes(3).toString("hex")}`;
  const [identity, tables, columnsByTable, primaryKeys, dependencies] =
    await Promise.all([
      getDatabaseIdentity(),
      listDatabaseTables(),
      listColumnMetadata(),
      listPrimaryKeys(),
      listForeignKeyDependencies(),
    ]);
  const orderedTables = orderTables(tables, dependencies);
  const backupTables: DatabaseBackupTable[] = [];
  for (const tableName of orderedTables) {
    const columns = (columnsByTable.get(tableName) || [])
      .sort((a, b) => a.ordinalPosition - b.ordinalPosition)
      .map((column) => column.name);
    if (columns.length === 0) continue;
    const sql = `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(tableName)}`;
    const rows = await query<Record<string, unknown>>(sql);
    backupTables.push({
      name: tableName,
      columns,
      primaryKey: primaryKeys.get(tableName) || [],
      rows,
    });
  }
  const backup: DatabaseBackupFile = {
    version: BACKUP_VERSION,
    id,
    createdAt,
    createdBy: options.createdBy || null,
    note: options.note?.trim() || null,
    scope: "full-database",
    source: {
      dialect: dialect(),
      databaseName: identity.databaseName || null,
      schemaName: identity.schemaName || null,
    },
    tables: backupTables,
  };
  const filename = `${id}.json`;
  await fs.writeFile(
    backupFilePath(id),
    JSON.stringify(backup, null, 2),
    "utf8",
  );
  return summarizeBackup(backup, filename);
}
export async function readDatabaseBackup(id: string) {
  return parseBackupJson(await fs.readFile(backupFilePath(id), "utf8"));
}
function normalizeValueForColumn(value: unknown, column: ColumnMetadata) {
  if (value === undefined) return null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const maybeBuffer = value as {
      type?: unknown;
      data?: unknown;
    };
    if (maybeBuffer.type === "Buffer" && Array.isArray(maybeBuffer.data)) {
      return Buffer.from(maybeBuffer.data as number[]);
    }
  }
  if (
    column.dataType === "json" &&
    typeof value === "object" &&
    value !== null
  ) {
    return JSON.stringify(value);
  }
  if (
    typeof value === "string" &&
    (column.dataType.includes("date") || column.dataType.includes("time"))
  ) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      if (column.dataType === "date") {
        return parsed.toISOString().slice(0, 10);
      }
    }
  }
  return value;
}
async function rowExists(
  tableName: string,
  primaryKey: string[],
  row: Record<string, unknown>,
) {
  const where = primaryKey
    .map((column, i) => `${quoteIdentifier(column)} = $${i + 1}`)
    .join(" AND ");
  const rows = await query<Record<string, unknown>>(
    `SELECT 1 AS found FROM ${quoteIdentifier(tableName)} WHERE ${where} LIMIT 1`,
    primaryKey.map((column) => row[column]),
  );
  return rows.length > 0;
}
async function insertRow(
  tableName: string,
  columns: ColumnMetadata[],
  row: Record<string, unknown>,
) {
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const sql = `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map((column) => quoteIdentifier(column.name)).join(", ")})
    VALUES (${placeholders})`;
  await query(
    sql,
    columns.map((column) => normalizeValueForColumn(row[column.name], column)),
  );
}
async function updateRow(
  tableName: string,
  columns: ColumnMetadata[],
  primaryKey: string[],
  row: Record<string, unknown>,
) {
  const updateColumns = columns.filter(
    (column) => !primaryKey.includes(column.name),
  );
  if (updateColumns.length === 0) return;
  const uLen = updateColumns.length;
  const sql = `UPDATE ${quoteIdentifier(tableName)}
    SET ${updateColumns.map((column, i) => `${quoteIdentifier(column.name)} = $${i + 1}`).join(", ")}
    WHERE ${primaryKey.map((column, i) => `${quoteIdentifier(column)} = $${uLen + i + 1}`).join(" AND ")}`;
  await query(sql, [
    ...updateColumns.map((column) =>
      normalizeValueForColumn(row[column.name], column),
    ),
    ...primaryKey.map((column) => row[column]),
  ]);
}
export async function restoreDatabaseBackup(
  id: string,
  options: RestoreOptions = {},
): Promise<RestoreResult> {
  const backup = await readDatabaseBackup(id);
  const startedAt = new Date().toISOString();
  const dryRun = Boolean(options.dryRun);
  const overwriteExisting = Boolean(options.overwriteExisting);
  const [liveTables, columnsByTable, primaryKeys, dependencies] =
    await Promise.all([
      listDatabaseTables(),
      listColumnMetadata(),
      listPrimaryKeys(),
      listForeignKeyDependencies(),
    ]);
  const liveTableSet = new Set(liveTables);
  const backupTables = new Map(
    backup.tables.map((table) => [table.name, table]),
  );
  const orderedTables = orderTables(
    backup.tables
      .map((table) => table.name)
      .filter((tableName) => liveTableSet.has(tableName)),
    dependencies,
  );
  const result: RestoreResult = {
    backupId: backup.id,
    dryRun,
    overwriteExisting,
    startedAt,
    finishedAt: startedAt,
    totals: {
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      tables: 0,
      rows: 0,
    },
    tables: [],
  };
  for (const tableName of backup.tables.map((table) => table.name)) {
    if (liveTableSet.has(tableName)) continue;
    result.tables.push({
      name: tableName,
      rows: backupTables.get(tableName)?.rows.length || 0,
      inserted: 0,
      updated: 0,
      skipped: backupTables.get(tableName)?.rows.length || 0,
      failed: 0,
      missingColumns: [],
      status: "skipped",
      message: "Table does not exist in the current schema.",
    });
  }
  for (const tableName of orderedTables) {
    const table = backupTables.get(tableName);
    const liveColumns = columnsByTable.get(tableName) || [];
    if (!table || liveColumns.length === 0) continue;
    const liveColumnNames = new Set(liveColumns.map((column) => column.name));
    const usableColumns = table.columns
      .filter((column) => liveColumnNames.has(column))
      .map(
        (column) =>
          liveColumns.find((liveColumn) => liveColumn.name === column)!,
      )
      .filter(Boolean);
    const missingColumns = table.columns.filter(
      (column) => !liveColumnNames.has(column),
    );
    const primaryKey = (
      primaryKeys.get(tableName) ||
      table.primaryKey ||
      []
    ).filter((column) => liveColumnNames.has(column));
    const tableResult: RestoreTableResult = {
      name: tableName,
      rows: table.rows.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      missingColumns,
      status: "ok",
    };
    if (usableColumns.length === 0) {
      tableResult.skipped = table.rows.length;
      tableResult.status = "skipped";
      tableResult.message = "No backup columns exist in the current table.";
      result.tables.push(tableResult);
      continue;
    }
    if (primaryKey.length === 0) {
      tableResult.skipped = table.rows.length;
      tableResult.status = "skipped";
      tableResult.message =
        "No primary key is available for safe merge restore.";
      result.tables.push(tableResult);
      continue;
    }
    for (const sourceRow of table.rows) {
      const row = Object.fromEntries(
        usableColumns.map((column) => [column.name, sourceRow[column.name]]),
      ) as Record<string, unknown>;
      const hasPrimaryKey = primaryKey.every(
        (column) => row[column] !== undefined && row[column] !== null,
      );
      if (!hasPrimaryKey) {
        tableResult.skipped += 1;
        continue;
      }
      try {
        const exists = await rowExists(tableName, primaryKey, row);
        if (exists && !overwriteExisting) {
          tableResult.skipped += 1;
          continue;
        }
        if (!dryRun) {
          if (exists) {
            await updateRow(tableName, usableColumns, primaryKey, row);
          } else {
            await insertRow(tableName, usableColumns, row);
          }
        }
        if (exists) tableResult.updated += 1;
        else tableResult.inserted += 1;
      } catch (err: any) {
        tableResult.failed += 1;
        tableResult.message =
          err?.message || "One or more rows failed to restore.";
      }
    }
    tableResult.status =
      tableResult.failed > 0
        ? tableResult.inserted + tableResult.updated > 0
          ? "partial"
          : "failed"
        : "ok";
    result.tables.push(tableResult);
  }
  for (const table of result.tables) {
    result.totals.inserted += table.inserted;
    result.totals.updated += table.updated;
    result.totals.skipped += table.skipped;
    result.totals.failed += table.failed;
    result.totals.rows += table.rows;
  }
  result.totals.tables = result.tables.length;
  result.finishedAt = new Date().toISOString();
  return result;
}
export function getDatabaseBackupDirectory() {
  return backupDir();
}
