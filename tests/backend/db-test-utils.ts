import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

dotenv.config();

const TEST_DB_NAME = process.env.TEST_DB_NAME || 'jimmy_pos_test';

function getConnectionConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  };
}

export async function createTestDatabase() {
  const connection = await mysql.createConnection(getConnectionConfig());
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;`);
  await connection.end();
}

export async function dropTestDatabase() {
  const connection = await mysql.createConnection(getConnectionConfig());
  await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\`;`);
  await connection.end();
}

export async function initTestDatabase() {
  await createTestDatabase();
  const connection = await mysql.createConnection({ ...getConnectionConfig(), database: TEST_DB_NAME });
  const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await connection.query(sql);
  await connection.end();
}

export async function clearTestDatabase() {
  const connection = await mysql.createConnection({ ...getConnectionConfig(), database: TEST_DB_NAME });
  const [tables] = await connection.query<any[]>("SHOW TABLES");
  const tableNames = tables.map((row) => Object.values(row)[0]).filter(Boolean);
  if (tableNames.length > 0) {
    const quotedTables = tableNames.map((name) => `\`${name}\``).join(', ');
    await connection.query(`SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS ${quotedTables}; SET FOREIGN_KEY_CHECKS=1;`);
  }
  await connection.end();
}

export function getTestDbName() {
  return TEST_DB_NAME;
}
