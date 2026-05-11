import mysql from "mysql2/promise";
import { Pool } from "pg";

export type DbConnection = {
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  execute<T = any>(sql: string, params?: any[]): Promise<readonly [T[]]>;
  query<T = any>(sql: string, params?: any[]): Promise<readonly [T[]]>;
  release(): void;
};

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    if (v === undefined) continue;
    const trimmed = v.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

export function isPostgres() {
  return Boolean(
    firstNonEmpty(
      process.env.DATABASE_URL,
      process.env.SUPABASE_DB_URL,
      process.env.SUPABASE_DATABASE_URL
    )
  );
}

function toPgPlaceholders(sql: string) {
  let out = "";
  let inSingle = false;
  let inDouble = false;
  let paramIndex = 0;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const prev = i > 0 ? sql[i - 1] : "";

    if (ch === "'" && !inDouble) {
      if (!inSingle) inSingle = true;
      else if (prev !== "\\") inSingle = false;
      out += ch;
      continue;
    }

    if (ch === '"' && !inSingle) {
      if (!inDouble) inDouble = true;
      else if (prev !== "\\") inDouble = false;
      out += ch;
      continue;
    }

    if (ch === "?" && !inSingle && !inDouble) {
      paramIndex += 1;
      out += `$${paramIndex}`;
      continue;
    }

    out += ch;
  }

  return out;
}

const mariaPool = mysql.createPool({
  host: firstNonEmpty(process.env.DB_HOST, process.env.MARIADB_HOST, process.env.MYSQL_HOST) || "localhost",
  port: Number(firstNonEmpty(process.env.DB_PORT, process.env.MARIADB_PORT, process.env.MYSQL_PORT) || 3306),
  user: firstNonEmpty(process.env.DB_USER, process.env.MARIADB_USER, process.env.MYSQL_USER) || "root",
  password: firstNonEmpty(
    process.env.DB_PASSWORD,
    process.env.MARIADB_PASSWORD,
    process.env.MYSQL_PASSWORD,
    process.env.DB_ROOT_PASSWORD,
    process.env.MARIADB_ROOT_PASSWORD,
    process.env.MYSQL_ROOT_PASSWORD
  ) || "",
  database: firstNonEmpty(process.env.DB_DATABASE, process.env.MARIADB_DATABASE, process.env.MYSQL_DATABASE) || "jimmy_pos",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  timezone: "Z",
});

const pgPool = isPostgres()
  ? new Pool({
      connectionString:
        firstNonEmpty(process.env.DATABASE_URL, process.env.SUPABASE_DB_URL, process.env.SUPABASE_DATABASE_URL) || "",
      max: Number(process.env.DB_CONNECTION_LIMIT || 10),
      ssl: { rejectUnauthorized: false },
    })
  : null;

export async function query<T = any>(sql: string, params: any[] = []) {
  if (pgPool) {
    const pgSql = toPgPlaceholders(sql);
    const res = await pgPool.query(pgSql, params);
    return res.rows as T[];
  }

  const [rows] = await mariaPool.execute(sql, params);
  return rows as T[];
}

export async function getConnection() {
  if (pgPool) {
    const client = await pgPool.connect();
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
      async execute<T = any>(sql: string, params: any[] = []) {
        const pgSql = toPgPlaceholders(sql);
        const res = await client.query(pgSql, params);
        return [res.rows as T[]] as const;
      },
      async query<T = any>(sql: string, params: any[] = []) {
        const pgSql = toPgPlaceholders(sql);
        const res = await client.query(pgSql, params);
        return [res.rows as T[]] as const;
      },
      release() {
        client.release();
      },
    };
    return conn;
  }

  const mariaConn = await mariaPool.getConnection();
  const conn: DbConnection = {
    async beginTransaction() {
      await mariaConn.beginTransaction();
    },
    async commit() {
      await mariaConn.commit();
    },
    async rollback() {
      await mariaConn.rollback();
    },
    async execute<T = any>(sql: string, params: any[] = []) {
      const [rows] = await (mariaConn as any).execute(sql, params);
      return [rows as T[]] as const;
    },
    async query<T = any>(sql: string, params: any[] = []) {
      const [rows] = await (mariaConn as any).query(sql, params);
      return [rows as T[]] as const;
    },
    release() {
      mariaConn.release();
    },
  };

  return conn;
}

export default mariaPool;
