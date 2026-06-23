import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('layby schema', () => {
  const postgresSchemaPath = path.resolve(process.cwd(), 'db/schema.postgres.sql');

  it('defines the lay-by ledger tables in Postgres schema', () => {
    const schema = fs.readFileSync(postgresSchemaPath, 'utf8');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS layby_orders');
    expect(schema).toContain("status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled'))");
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS layby_items');
    expect(schema).toContain('reserved_quantity NUMERIC(12,3)');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS layby_payments');
    expect(schema).toContain("method TEXT NOT NULL CHECK (method IN ('cash','payfast','card','wallet','account'))");
  });
});
