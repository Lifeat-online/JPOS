import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import type { DemoSeedMode } from "../server/demo-seed.js";
import type { QueryRunner } from "./verify-production-schema.js";

export type SeedTestTenantOptions = {
  tenantId: string;
  tenantName: string;
  mode: DemoSeedMode;
  clearFirst: boolean;
  skipInit: boolean;
};

export const TEST_TENANT_SUMMARY_TABLES = [
  "staff",
  "customers",
  "products",
  "sales",
  "sale_items",
  "restaurant_tables",
  "table_sections",
] as const;

function readArgValue(args: string[], name: string) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function readFlag(args: string[], name: string) {
  return args.includes(`--${name}`);
}

function normalizeMode(value: string | undefined): DemoSeedMode {
  if (value === "retail" || value === "restaurant") return value;
  if (value && value.trim().length > 0) {
    throw new Error(`Unsupported seed mode "${value}". Use "restaurant" or "retail".`);
  }
  return "restaurant";
}

export function parseSeedArgs(args = process.argv.slice(2), env = process.env): SeedTestTenantOptions {
  const tenantId = readArgValue(args, "tenant") || env.TEST_TENANT_ID || "test_tenant";
  const tenantName = readArgValue(args, "name") || env.TEST_TENANT_NAME || "MasePOS Test Tenant";
  const mode = normalizeMode(readArgValue(args, "mode") || env.TEST_TENANT_MODE);

  return {
    tenantId,
    tenantName,
    mode,
    clearFirst: readFlag(args, "clear-first") || env.TEST_TENANT_CLEAR_FIRST === "true",
    skipInit: readFlag(args, "skip-init") || env.TEST_TENANT_SKIP_INIT === "true",
  };
}

export async function ensureTestTenant(
  runQuery: QueryRunner,
  options: Pick<SeedTestTenantOptions, "tenantId" | "tenantName" | "mode">
) {
  const business = JSON.stringify({
    name: options.tenantName,
    currency: "R",
    taxName: "VAT",
    taxRate: 15,
    taxInclusive: true,
    isRestaurantMode: options.mode === "restaurant",
    testTenant: true,
  });
  const categories = JSON.stringify({});

  await runQuery(
    `INSERT INTO tenants (id, name, created_at, updated_at)
     VALUES (?, ?, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
    [options.tenantId, options.tenantName]
  );
  await runQuery(
    `INSERT INTO app_settings (tenant_id, business, categories, setup_completed, created_at, updated_at)
     VALUES (?, ?, ?, 1, NOW(), NOW())
     ON CONFLICT (tenant_id) DO UPDATE
       SET business = EXCLUDED.business,
           categories = EXCLUDED.categories,
           setup_completed = 1,
           updated_at = NOW()`,
    [options.tenantId, business, categories]
  );
}

function numericCount(row: Record<string, any> | undefined) {
  if (!row) return 0;
  return Number(row.rowCount ?? row.rowcount ?? row.count ?? row["COUNT(*)"] ?? 0);
}

export async function countSeededTenantRows(runQuery: QueryRunner, tenantId: string) {
  const summary: Record<(typeof TEST_TENANT_SUMMARY_TABLES)[number], number> = {
    staff: 0,
    customers: 0,
    products: 0,
    sales: 0,
    sale_items: 0,
    restaurant_tables: 0,
    table_sections: 0,
  };

  for (const table of TEST_TENANT_SUMMARY_TABLES) {
    const rows = await runQuery(`SELECT COUNT(*) AS rowCount FROM ${table} WHERE tenant_id = ?`, [tenantId]);
    summary[table] = numericCount(rows[0]);
  }

  return summary;
}

export function isDirectRun(metaUrl: string, argv: string[]) {
  return Boolean(argv[1]) && fileURLToPath(metaUrl) === path.resolve(argv[1]);
}

export async function runSeedTestTenantCli(options = parseSeedArgs()) {
  dotenv.config({ override: false });
  const db = await import("../server/db.js");
  const { initDb } = await import("../server/init-db.js");
  const { clearSeededDemoData, seedDemoData } = await import("../server/demo-seed.js");

  if (!options.skipInit) {
    await initDb();
  }

  await ensureTestTenant((sql, params) => db.query(sql, params || []), options);

  if (options.clearFirst) {
    await clearSeededDemoData(options.tenantId);
  }

  await seedDemoData(options.tenantId, options.mode);
  const summary = await countSeededTenantRows((sql, params) => db.query(sql, params || []), options.tenantId);

  console.log(
    JSON.stringify(
      {
        tenantId: options.tenantId,
        tenantName: options.tenantName,
        mode: options.mode,
        summary,
      },
      null,
      2
    )
  );
}

if (isDirectRun(import.meta.url, process.argv)) {
  runSeedTestTenantCli().catch((err) => {
    console.error("Test tenant seed failed:", err);
    process.exit(1);
  });
}
