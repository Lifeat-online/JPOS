import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('cash management schema', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');

  it('keeps manager review fields on cash sessions', () => {
    for (const column of [
      'submitted_at',
      'reviewed_at',
      'reviewed_by',
      'reconciled_at',
      'reconciled_by',
      'opening_breakdown',
      'closing_breakdown',
      'review_status',
      'manager_notes',
      'variance_reason',
    ]) {
      expect(schema).toContain(column);
    }
  });

  it('defines a cash movement audit ledger', () => {
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS cash_movements');
    expect(schema).toContain('cash_session_id');
    expect(schema).toContain('manager_adjustment');
    expect(schema).toContain("direction ENUM('in','out','neutral')");
  });

  it('defines the manager float and cash-in-system ledger', () => {
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS manager_cash_movements');
    expect(schema).toContain('safe_drop');
    expect(schema).toContain('wallet_cash_in');
    expect(schema).toContain('register_close');
    expect(schema).toContain('idx_manager_cash_tenant_created');
  });
});
