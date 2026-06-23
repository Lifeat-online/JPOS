import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as dbModule from "../../server/db.js";
import {
  createDatabaseBackup,
  listDatabaseBackups,
  restoreDatabaseBackup,
} from "../../server/dbMaintenance.js";

vi.mock("../../server/db.js", () => ({
  query: vi.fn(),
}));

const backupDir = path.join(process.cwd(), "temp", "test-db-backups");

function schemaQueryMock(sql: string) {
  if (sql.includes("SELECT current_database()")) {
    return [{ databaseName: "jimmy_pos", schemaName: "public" }];
  }
  if (sql.includes("FROM information_schema.tables")) {
    return [{ tableName: "products" }, { tableName: "tenants" }];
  }
  if (sql.includes("FROM information_schema.columns")) {
    return [
      { tableName: "tenants", columnName: "id", dataType: "varchar", ordinalPosition: 1 },
      { tableName: "tenants", columnName: "name", dataType: "varchar", ordinalPosition: 2 },
      { tableName: "products", columnName: "id", dataType: "varchar", ordinalPosition: 1 },
      { tableName: "products", columnName: "tenant_id", dataType: "varchar", ordinalPosition: 2 },
      { tableName: "products", columnName: "name", dataType: "varchar", ordinalPosition: 3 },
      { tableName: "products", columnName: "created_at", dataType: "timestamp", ordinalPosition: 4 },
    ];
  }
  if (sql.includes("constraint_type = 'PRIMARY KEY'")) {
    return [
      { tableName: "tenants", columnName: "id" },
      { tableName: "products", columnName: "id" },
    ];
  }
  if (sql.includes("constraint_column_usage")) {
    return [{ tableName: "products", referencedTableName: "tenants" }];
  }
  return null;
}

function mockBackupQueries() {
  (dbModule.query as any).mockImplementation((sql: string) => {
    const schemaRows = schemaQueryMock(sql);
    if (schemaRows) return Promise.resolve(schemaRows);
    if (sql.includes('FROM "tenants"')) {
      return Promise.resolve([{ id: "tenant1", name: "Main Store" }]);
    }
    if (sql.includes('FROM "products"')) {
      return Promise.resolve([{
        id: "prod1",
        tenant_id: "tenant1",
        name: "Coffee",
        created_at: "2026-06-10T12:30:00.000Z",
      }]);
    }
    return Promise.resolve([]);
  });
}

describe("database maintenance backups", () => {
  beforeEach(async () => {
    process.env.DB_BACKUP_DIR = backupDir;
    await fs.rm(backupDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(backupDir, { recursive: true, force: true });
    delete process.env.DB_BACKUP_DIR;
  });

  it("creates a full database JSON backup in dependency order", async () => {
    mockBackupQueries();

    const summary = await createDatabaseBackup({ createdBy: "dev@example.test", note: "before feature work" });
    const backups = await listDatabaseBackups();

    expect(summary.totalRows).toBe(2);
    expect(summary.tableCount).toBe(2);
    expect(summary.tables.map(table => table.name)).toEqual(["tenants", "products"]);
    expect(summary.note).toBe("before feature work");
    expect(backups[0]).toMatchObject({ id: summary.id, totalRows: 2 });
  });

  it("dry-runs restore without changing rows", async () => {
    mockBackupQueries();
    const summary = await createDatabaseBackup();
    vi.clearAllMocks();

    const executedMutations: string[] = [];
    (dbModule.query as any).mockImplementation((sql: string) => {
      const schemaRows = schemaQueryMock(sql);
      if (schemaRows) return Promise.resolve(schemaRows);
      if (sql.includes("SELECT 1 AS found")) return Promise.resolve([]);
      if (sql.startsWith("INSERT") || sql.startsWith("UPDATE")) executedMutations.push(sql);
      return Promise.resolve([]);
    });

    const result = await restoreDatabaseBackup(summary.id, { dryRun: true, overwriteExisting: true });

    expect(result.dryRun).toBe(true);
    expect(result.totals.inserted).toBe(2);
    expect(result.totals.updated).toBe(0);
    expect(executedMutations).toEqual([]);
  });

  it("updates matching rows only when overwrite is enabled", async () => {
    mockBackupQueries();
    const summary = await createDatabaseBackup();
    vi.clearAllMocks();

    const mutations: Array<{ sql: string; params: any[] }> = [];
    (dbModule.query as any).mockImplementation((sql: string, params: any[] = []) => {
      const schemaRows = schemaQueryMock(sql);
      if (schemaRows) return Promise.resolve(schemaRows);
      if (sql.includes('SELECT 1 AS found FROM "tenants"')) return Promise.resolve([]);
      if (sql.includes('SELECT 1 AS found FROM "products"')) return Promise.resolve([{ found: 1 }]);
      if (sql.startsWith("INSERT") || sql.startsWith("UPDATE")) mutations.push({ sql, params });
      return Promise.resolve([]);
    });

    const result = await restoreDatabaseBackup(summary.id, { overwriteExisting: true });
    const productUpdate = mutations.find(call => call.sql.startsWith('UPDATE "products"'));

    expect(result.totals.inserted).toBe(1);
    expect(result.totals.updated).toBe(1);
    expect(productUpdate?.params).toContain("2026-06-10T12:30:00.000Z");
    expect(mutations.some(call => call.sql.startsWith("DELETE"))).toBe(false);
  });
});
