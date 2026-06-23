import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('provider payment schema', () => {
  const pgSchema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.postgres.sql'), 'utf8');

  it('allows QR and BNPL as sale payment methods in the Postgres schema', () => {
    expect(pgSchema).toContain("payment_method TEXT DEFAULT 'pending' CHECK (payment_method IN ('cash','payfast','card','wallet','account','qr','bnpl','pending'))");
    expect(pgSchema).toContain("method TEXT NOT NULL CHECK (method IN ('cash','payfast','card','wallet','account','qr','bnpl'))");
  });

  it('stores provider evidence on sale payments for QR, BNPL, and external card reconciliation', () => {
    for (const column of ['provider_device_id', 'provider_reference', 'authorization_code', 'provider_status', 'provider_note', 'qr_payload']) {
      expect(pgSchema).toContain(column);
    }
  });
});
