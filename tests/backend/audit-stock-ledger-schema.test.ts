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
      expect(schema).toContain('reason_code');
      expect(schema).toContain('count_correction');
      expect(schema).toContain('shrinkage');
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
      expect(schema).toContain('variance_reason');
      expect(schema).toContain('variance_severity');
      expect(schema).toContain('supervisor_recount_required');
      expect(schema).toContain('supervisor_recount_threshold');
      expect(schema).toContain('assigned_to');
      expect(schema).toContain('confirmed_by');
      expect(schema).toContain('product_scope');
      expect(schema).toContain('last_run_for_date');
    }
  });

  it('defines audited purchase-order receiving fields in both SQL schemas', () => {
    for (const schema of [mariaSchema, pgSchema]) {
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS purchase_orders');
      expect(schema).toContain('invoice_number');
      expect(schema).toContain('invoice_date');
      expect(schema).toContain('received_at');
      expect(schema).toContain('received_by');
      expect(schema).toContain('receiving_note');
      expect(schema).toContain('received_total_amount');
    }
  });

  it('defines stock batches with expiry and supplier traceability in both SQL schemas', () => {
    for (const schema of [mariaSchema, pgSchema]) {
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS stock_batches');
      expect(schema).toContain('purchase_order_id');
      expect(schema).toContain('supplier_invoice_number');
      expect(schema).toContain('batch_number');
      expect(schema).toContain('received_quantity');
      expect(schema).toContain('remaining_quantity');
      expect(schema).toContain('expiry_date');
      expect(schema).toContain('idx_stock_batches_product');
    }
  });

  it('defines AI inventory agent run and step persistence in both SQL schemas', () => {
    for (const schema of [mariaSchema, pgSchema]) {
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS ai_agent_runs');
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS ai_agent_run_steps');
      expect(schema).toContain('requires_human_approval');
      expect(schema).toContain('full_autopilot');
      expect(schema).toContain('step_id');
      expect(schema).toContain('approved_by');
      expect(schema).toContain('skip_reason');
    }
  });

  it('defines persisted reorder recommendations in both SQL schemas', () => {
    for (const schema of [mariaSchema, pgSchema]) {
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS reorder_recommendations');
      expect(schema).toContain('recommended_quantity');
      expect(schema).toContain('target_stock');
      expect(schema).toContain('avg_daily_sales');
      expect(schema).toContain('purchase_order_id');
      expect(schema).toContain('idx_reorder_recommendations_product');
    }
  });

  it('defines direct hardware adapter devices and event history in both SQL schemas', () => {
    for (const schema of [mariaSchema, pgSchema]) {
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS hardware_devices');
      expect(schema).toContain('receipt_printer');
      expect(schema).toContain('kitchen_printer');
      expect(schema).toContain('cash_drawer');
      expect(schema).toContain('scale');
      expect(schema).toContain('barcode_scanner');
      expect(schema).toContain('pole_display');
      expect(schema).toContain('card_terminal');
      expect(schema).toContain('connection_config');
      expect(schema).toContain('last_check_status');
      expect(schema).toContain('idx_hardware_devices_workstation');
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS hardware_device_events');
      expect(schema).toContain('command_type');
      expect(schema).toContain('request_payload');
      expect(schema).toContain('response_payload');
      expect(schema).toContain('idx_hardware_device_events_device');
    }
  });
});
