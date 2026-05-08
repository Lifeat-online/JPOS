import mysql from "mysql2/promise";

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    if (v === undefined) continue;
    const trimmed = v.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

const pool = mysql.createPool({
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

export async function query<T = any>(sql: string, params: any[] = []) {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

export async function getConnection() {
  return pool.getConnection();
}

export default pool;
