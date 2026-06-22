import { Pool, PoolClient, QueryResultRow } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import { DB } from "./db-types.js";

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    if (v === undefined) continue;
    const trimmed = v.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

export const pgPool = new Pool({
  connectionString: firstNonEmpty(
    process.env.DATABASE_URL,
    process.env.SUPABASE_DB_URL,
    process.env.SUPABASE_DATABASE_URL
  ) || "",
  max: Number(process.env.DB_CONNECTION_LIMIT || 10),
  ssl: { rejectUnauthorized: false },
});

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: pgPool,
  }),
});

export type DbConnection = {
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  execute<T extends QueryResultRow = any>(sql: string, params?: any[]): Promise<readonly [T[]]>;
  query<T extends QueryResultRow = any>(sql: string, params?: any[]): Promise<readonly [T[]]>;
  release(): void;
};

/**
 * Always returns true – the app now exclusively uses PostgreSQL.
 * Kept for backward compatibility with existing conditional SQL branches
 * (e.g. `isPostgres() ? "RANDOM()" : "RAND()"`) spread across the codebase.
 */
export function isPostgres(): boolean {
  return true;
}

/**
 * Converts MySQL-style `?` positional placeholders to PostgreSQL-style `$1`, `$2`, ...
 * so that legacy query strings from mariadb-adapter / mariadb-crud work with node-postgres.
 * Placeholders inside string literals and comments are intentionally left untouched by
 * targeting only bare `?` tokens that are not preceded by a backslash.
 */
function convertPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function query<T extends QueryResultRow = any>(sql: string, params: any[] = []) {
  const res = await pgPool.query<T>(convertPlaceholders(sql), params);
  return res.rows;
}

export async function getConnection() {
  const client = await pgPool.connect();

  function wrapQuery<T extends QueryResultRow = any>(sql: string, params: any[] = []) {
    return client.query<T>(convertPlaceholders(sql), params);
  }

  const conn: DbConnection = {
    async beginTransaction() {
      await client.query("BEGIN");
    },
    async commit() {
      await client.query("COMMIT");
    },
    async rollback() {
      await client.query("ROLLBACK");
    },
    async execute<T extends QueryResultRow = any>(sql: string, params: any[] = []) {
      const res = await wrapQuery<T>(sql, params);
      return [res.rows] as const;
    },
    async query<T extends QueryResultRow = any>(sql: string, params: any[] = []) {
      const res = await wrapQuery<T>(sql, params);
      return [res.rows] as const;
    },
    release() {
      client.release();
    },
  };
  return conn;
}
