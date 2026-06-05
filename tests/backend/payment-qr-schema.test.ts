import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('provider payment schema', () => {
  const mariaSchema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
  const pgSchema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.postgres.sql'), 'utf8');

  it('allows QR and BNPL as sale payment methods in both SQL schemas', () => {
    expect(mariaSchema).toContain("payment_method ENUM('cash','payfast','card','wallet','account','qr','bnpl','pending')");
    expect(mariaSchema).toContain("method ENUM('cash','payfast','card','wallet','account','qr','bnpl') NOT NULL");
    expect(pgSchema).toContain("payment_method TEXT DEFAULT 'pending' CHECK (payment_method IN ('cash','payfast','card','wallet','account','qr','bnpl','pending'))");
    expect(pgSchema).toContain("method TEXT NOT NULL CHECK (method IN ('cash','payfast','card','wallet','account','qr','bnpl'))");
  });

  it('stores provider evidence on sale payments for QR, BNPL, and external card reconciliation', () => {
    for (const schema of [mariaSchema, pgSchema]) {
      expect(schema).toContain('provider_device_id');
      expect(schema).toContain('provider_reference');
      expect(schema).toContain('authorization_code');
      expect(schema).toContain('provider_status');
      expect(schema).toContain('provider_note');
      expect(schema).toContain('qr_payload');
    }
  });
});
