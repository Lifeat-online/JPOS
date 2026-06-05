import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { recordAuditEventSafe } from '../../server/audit.js';
import {
  ingestDeliveryOrder,
  listDeliveryOrders,
  normalizeDeliveryProvider,
  normalizeDeliveryStatus,
  updateDeliveryOrderStatus,
} from '../../server/deliveryIntegrations.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../server/audit.js', () => ({
  recordAuditEventSafe: vi.fn(),
}));

describe('delivery integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes provider and status aliases for Uber Eats and Mr D', () => {
    expect(normalizeDeliveryProvider('Uber Eats')).toBe('uber_eats');
    expect(normalizeDeliveryProvider('mr-d')).toBe('mr_d');
    expect(normalizeDeliveryStatus('ready_for_pickup')).toBe('ready');
    expect(normalizeDeliveryStatus('picked_up')).toBe('dispatched');
    expect(normalizeDeliveryStatus('delivered')).toBe('completed');
  });

  it('ingests a new Uber Eats order with normalized line items and audit evidence', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM delivery_orders')) return Promise.resolve([]);
      if (sql.includes('FROM delivery_orders') && sql.includes('SELECT')) {
        return Promise.resolve([{
          id: 'do_1',
          tenantId: 'tenant_1',
          provider: 'uber_eats',
          externalOrderId: 'UE-100',
          status: 'new',
          customerName: 'Sam',
          total: 148,
          rawPayload: '{"id":"UE-100"}',
        }]);
      }
      if (sql.includes('FROM delivery_order_items') && sql.includes('SELECT')) {
        return Promise.resolve([{
          id: 'doi_1',
          deliveryOrderId: 'do_1',
          productName: 'Burger',
          quantity: 2,
          price: 74,
          modifiers: '[]',
        }]);
      }
      return Promise.resolve([]);
    });

    const order = await ingestDeliveryOrder('tenant_1', {
      provider: 'Uber Eats',
      rawPayload: {
        id: 'UE-100',
        status: 'received',
        customer: { name: 'Sam' },
        items: [{ id: 'item_1', name: 'Burger', quantity: 2, price: 74 }],
      },
    }, { staffId: 'mgr_1', staffName: 'Manager' });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO delivery_orders'),
      expect.arrayContaining(['tenant_1', 'uber_eats', 'UE-100', 'new', 'Sam'])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO delivery_order_items'),
      expect.arrayContaining(['tenant_1', expect.any(String), 'item_1', null, 'Burger', 2, 74])
    );
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant_1',
      action: 'delivery_order.ingested',
      entityType: 'delivery_order',
      source: 'delivery_integration',
    }));
    expect(order).toMatchObject({
      provider: 'uber_eats',
      externalOrderId: 'UE-100',
      items: [expect.objectContaining({ productName: 'Burger', quantity: 2 })],
    });
  });

  it('updates an existing Mr D order idempotently and replaces line items', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM delivery_orders')) return Promise.resolve([{ id: 'do_existing' }]);
      if (sql.includes('FROM delivery_orders') && sql.includes('SELECT')) {
        return Promise.resolve([{ id: 'do_existing', tenantId: 'tenant_1', provider: 'mr_d', externalOrderId: 'MRD-7', status: 'accepted', total: 50, rawPayload: '{}' }]);
      }
      if (sql.includes('FROM delivery_order_items') && sql.includes('SELECT')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await ingestDeliveryOrder('tenant_1', {
      provider: 'Mr D',
      externalOrderId: 'MRD-7',
      status: 'confirmed',
      items: [{ productName: 'Coffee', quantity: 1, price: 50 }],
    });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE delivery_orders'),
      expect.arrayContaining(['accepted', null, null, null, 50, 0, 0, 0, 50])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      'DELETE FROM delivery_order_items WHERE tenant_id = ? AND delivery_order_id = ?',
      ['tenant_1', 'do_existing']
    );
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      action: 'delivery_order.updated',
      entityId: 'do_existing',
    }));
  });

  it('lists delivery orders with hydrated item rows', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM delivery_orders')) {
        return Promise.resolve([{ id: 'do_1', tenantId: 'tenant_1', provider: 'mr_d', externalOrderId: 'MRD-1', status: 'ready', total: 100, rawPayload: '{}' }]);
      }
      if (sql.includes('FROM delivery_order_items')) {
        return Promise.resolve([{ id: 'doi_1', deliveryOrderId: 'do_1', productName: 'Pizza', quantity: 1, price: 100, modifiers: '[{"name":"Extra cheese"}]' }]);
      }
      return Promise.resolve([]);
    });

    const orders = await listDeliveryOrders('tenant_1', { provider: 'mr_d', status: 'ready' });

    expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('provider = ?'), ['tenant_1', 'mr_d', 'ready']);
    expect(orders[0]).toMatchObject({
      provider: 'mr_d',
      status: 'ready',
      items: [expect.objectContaining({ productName: 'Pizza', modifiers: [{ name: 'Extra cheese' }] })],
    });
  });

  it('updates order status and audits the transition', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM delivery_orders') && sql.includes('SELECT')) {
        return Promise.resolve([{ id: 'do_1', tenantId: 'tenant_1', provider: 'uber_eats', externalOrderId: 'UE-1', status: 'ready', total: 100, rawPayload: '{}' }]);
      }
      if (sql.includes('FROM delivery_order_items')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const order = await updateDeliveryOrderStatus('tenant_1', 'do_1', 'ready_for_pickup', { staffId: 'mgr_1', staffName: 'Manager' });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE delivery_orders'),
      ['ready', 'ready', 'tenant_1', 'do_1']
    );
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      action: 'delivery_order.status_updated',
      entityId: 'do_1',
    }));
    expect(order).toMatchObject({ status: 'ready' });
  });
});
