import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { initTestDatabase, dropTestDatabase, getTestDbName, getConnectionConfig } from './db-test-utils.js';

describe('Database Tables Integration Test', () => {
  let connection: mysql.Connection;
  const dbName = getTestDbName();

  beforeAll(async () => {
    // Initialize the test database with schema.sql
    await initTestDatabase();
    
    // Connect to the newly created test database
    connection = await mysql.createConnection({
      ...getConnectionConfig(),
      database: dbName,
    });
  });

  afterAll(async () => {
    if (connection) {
      await connection.end();
    }
    // Clean up test database
    await dropTestDatabase();
  });

  it('should have all necessary tables and their columns created correctly', async () => {
    // Dynamically read expected tables from schema.sql
    const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // Extract tables and their column definitions
    const tableDefinitions: Record<string, string[]> = {};
    const createTableRegex = /CREATE TABLE(?: IF NOT EXISTS)?\s+[`]?([a-zA-Z0-9_]+)[`]?\s*\(([\s\S]*?)\)(?:;|$)/gi;
    
    for (const match of schemaSql.matchAll(createTableRegex)) {
      const tableName = match[1];
      const columnsBlock = match[2];
      
      // Extract column names (ignoring constraints like FOREIGN KEY, PRIMARY KEY at table level)
      const columnRegex = /^\s*[`]?([a-zA-Z0-9_]+)[`]?\s+(?:VARCHAR|INT|INTEGER|DECIMAL|NUMERIC|DATETIME|TIMESTAMP|BOOLEAN|TINYINT|SMALLINT|MEDIUMINT|BIGINT|TEXT|JSON|ENUM|FLOAT|DOUBLE)/gmi;
      const columns = [];
      for (const colMatch of columnsBlock.matchAll(columnRegex)) {
        columns.push(colMatch[1]);
      }
      tableDefinitions[tableName] = columns;
    }

    const expectedTables = Object.keys(tableDefinitions);
    expect(expectedTables.length).toBeGreaterThan(0);

    const [rows] = await connection.query<mysql.RowDataPacket[]>('SHOW TABLES');
    const actualTables = rows.map((row) => Object.values(row)[0]);

    for (const table of expectedTables) {
      expect(actualTables).toContain(table);
      
      // Validate columns for this table
      const expectedColumns = tableDefinitions[table];
      if (expectedColumns && expectedColumns.length > 0) {
        const [colRows] = await connection.query<mysql.RowDataPacket[]>(
          'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
          [dbName, table]
        );
        const actualColumns = colRows.map((row) => row.COLUMN_NAME);
        
        for (const col of expectedColumns) {
          expect(actualColumns).toContain(col);
        }
      }
    }
  });

  it('should be functional: can insert and select a tenant', async () => {
    const tenantId = 'test_tenant_' + Date.now();
    
    // Insert
    const [insertResult] = await connection.execute<mysql.ResultSetHeader>(
      'INSERT INTO tenants (id, name) VALUES (?, ?)',
      [tenantId, 'Test Tenant']
    );
    expect(insertResult.affectedRows).toBe(1);

    // Select
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT * FROM tenants WHERE id = ?',
      [tenantId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Test Tenant');

    // Update
    const [updateResult] = await connection.execute<mysql.ResultSetHeader>(
      'UPDATE tenants SET name = ? WHERE id = ?',
      ['Updated Tenant', tenantId]
    );
    expect(updateResult.affectedRows).toBe(1);

    // Delete
    const [deleteResult] = await connection.execute<mysql.ResultSetHeader>(
      'DELETE FROM tenants WHERE id = ?',
      [tenantId]
    );
    expect(deleteResult.affectedRows).toBe(1);
  });

  it('should be functional: can insert and select a product with foreign key to tenant', async () => {
    const tenantId = 'test_tenant_prod_' + Date.now();
    const productId = 'test_prod_' + Date.now();

    // Setup tenant first (foreign key requirement)
    await connection.execute(
      'INSERT INTO tenants (id, name) VALUES (?, ?)',
      [tenantId, 'Test Tenant For Product']
    );

    // Insert product
    const [insertResult] = await connection.execute<mysql.ResultSetHeader>(
      'INSERT INTO products (id, tenant_id, name, price) VALUES (?, ?, ?, ?)',
      [productId, tenantId, 'Test Product', 99.99]
    );
    expect(insertResult.affectedRows).toBe(1);

    // Select product
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT * FROM products WHERE id = ?',
      [productId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Test Product');
    expect(Number(rows[0].price)).toBe(99.99); // price might come back as string depending on driver

    // Clean up (cascading delete should remove product)
    await connection.execute(
      'DELETE FROM tenants WHERE id = ?',
      [tenantId]
    );

    // Verify product is deleted due to CASCADE
    const [checkRows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT * FROM products WHERE id = ?',
      [productId]
    );
    expect(checkRows.length).toBe(0);
  });
});
