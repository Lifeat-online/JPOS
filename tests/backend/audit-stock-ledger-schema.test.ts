import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('audit and stock ledger schema', () => {
  const mariaSchema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
  const pgSchema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.postgres.sql'), 'utf8');

  it('defines the immutable POS audit event table in both SQL schemas', () => {
    for (const schema of [mariaSchema, pgSchema]) {
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS audit_events');
      expect(schema).toContain('action');
      expect(schema).toContain('entity_type');
      expect(schema).toContain('related_sale_id');
      expect(schema).toContain('staff_id');
      expect(schema).toContain('customer_id');
      expect(schema).toContain('details');
    }
  });

  it('defines the stock movement ledger in both SQL schemas', () => {
    for (const schema of [mariaSchema, pgSchema]) {
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS stock_movements');
      expect(schema).toContain('quantity_delta');
      expect(schema).toContain('previous_quantity');
      expect(schema).toContain('new_quantity');
      expect(schema).toContain('reference_type');
      expect(schema).toContain('sale_item_id');
    }
  });

  it('defines the manager task queue in both SQL schemas', () => {
    for (const schema of [mariaSchema, pgSchema]) {
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS manager_tasks');
      expect(schema).toContain('task_type');
      expect(schema).toContain('refund_request');
      expect(schema).toContain('void_request');
      expect(schema).toContain('source_type');
      expect(schema).toContain('decision_note');
      expect(schema).toContain('resolved_at');
    }
  });

  it('defines stocktake sessions and assigned count lines in both SQL schemas', () => {
    for (const schema of [mariaSchema, pgSchema]) {
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS stock_take_sessions');
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS stock_take_items');
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS stock_take_rules');
      expect(schema).toContain('spot_check');
      expect(schema).toContain('expected_quantity');
      expect(schema).toContain('counted_quantity');
      expect(schema).toContain('variance_quantity');
      expect(schema).toContain('assigned_to');
      expect(schema).toContain('confirmed_by');
      expect(schema).toContain('product_scope');
      expect(schema).toContain('last_run_for_date');
    }
  });
});
