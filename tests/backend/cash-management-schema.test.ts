import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('cash management schema', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.postgres.sql'), 'utf8');

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
    expect(schema).toContain("direction TEXT NOT NULL DEFAULT 'neutral' CHECK (direction IN ('in','out','neutral'))");
  });

  it('defines the manager float and cash-in-system ledger', () => {
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS manager_cash_movements');
    expect(schema).toContain('safe_drop');
    expect(schema).toContain('wallet_cash_in');
    expect(schema).toContain('register_close');
    expect(schema).toContain('cash_source');
    expect(schema).toContain('receipt_attachment_url');
    expect(schema).toContain('approved_by_name');
    expect(schema).toContain('idx_manager_cash_tenant_created');
    expect(schema).toContain('idx_manager_cash_source');
  });

  it('defines cash custody handovers with dual confirmation fields', () => {
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS cash_custody_transfers');
    expect(schema).toContain('pending_confirmation');
    expect(schema).toContain('expected_amount');
    expect(schema).toContain('counted_amount');
    expect(schema).toContain('confirmed_by');
    expect(schema).toContain('idx_cash_custody_tenant_status');
  });

  it('defines end-of-day cash close checkpoints', () => {
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS cash_close_checkpoints');
    expect(schema).toContain('business_date');
    expect(schema).toContain('expected_physical_cash');
    expect(schema).toContain('counted_physical_cash');
    expect(schema).toContain('wallet_cash_in_today');
    expect(schema).toContain('idx_cash_close_tenant_status');
  });
});
