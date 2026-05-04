import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_DATABASE || "jimmy_pos",
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
