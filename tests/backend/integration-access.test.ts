import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { recordAuditEventSafe } from '../../server/audit.js';
import {
  authenticateIntegrationApiKey,
  createIntegrationApiKey,
  hashIntegrationApiKey,
  ingestStockWebhook,
} from '../../server/integrationAccess.js';

vi.mock('../../server/db.js', () => ({
  isPostgres: vi.fn(() => false),
  query: vi.fn(),
}));

vi.mock('../../server/audit.js', async () => {
  const actual = await vi.importActual<any>('../../server/audit.js');
  return {
    ...actual,
    recordAuditEventSafe: vi.fn(),
  };
});

describe('integration access and stock webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dbModule.isPostgres as any).mockReturnValue(false);
    (dbModule.query as any).mockResolvedValue([]);
  });

  it('creates an API key and stores only the hash and prefix', async () => {
    const created = await createIntegrationApiKey('tenant_1', {
      name: 'ERP bridge',
      scopes: ['stock:write', 'products:read'],
    }, { staffId: 'mgr_1', staffName: 'Manager' });

    expect(created.secret).toMatch(/^jpos_live_/);
    expect(created.key).toMatchObject({
      tenantId: 'tenant_1',
      name: 'ERP bridge',
      status: 'active',
      scopes: ['stock:write', 'products:read'],
    });
    expect(created.key.keyPrefix).toBe(created.secret.slice(0, 18));

    const insertCall = (dbModule.query as any).mock.calls.find(([sql]: any[]) => String(sql).includes('INSERT INTO integration_api_keys'));
    expect(insertCall).toBeTruthy();
    expect(insertCall[1]).toContain(hashIntegrationApiKey(created.secret));
    expect(insertCall[1]).not.toContain(created.secret);
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant_1',
      action: 'integration.api_key_created',
      entityType: 'integration_api_key',
    }));
  });

  it('authenticates active API keys by hash and updates last used time', async () => {
    const secret = 'jpos_live_known_secret';
    const hash = hashIntegrationApiKey(secret);
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM integration_api_keys') && sql.includes("status = 'active'")) {
        return Promise.resolve([{
          id: 'iak_1',
          tenant_id: 'tenant_1',
          name: 'ERP bridge',
          key_hash: hash,
          key_prefix: 'jpos_live_known',
          scopes: '["stock:write"]',
          status: 'active',
        }]);
      }
      return Promise.resolve([]);
    });

    const key = await authenticateIntegrationApiKey('tenant_1', secret);

    expect(key).toMatchObject({
      id: 'iak_1',
      tenantId: 'tenant_1',
      scopes: ['stock:write'],
      keyHash: hash,
    });
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE integration_api_keys SET last_used_at = NOW()'),
      ['tenant_1', 'iak_1']
    );
  });

  it('applies stock snapshot webhooks to product and location stock with ledger evidence', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM integration_webhook_events') && sql.includes('idempotency_key')) return Promise.resolve([]);
      if (sql.includes('FROM products') && sql.includes('id = ?')) {
        return Promise.resolve([{ id: 'prod_1', name: 'Milk', stock: 3, min_stock: 2, barcode: '6001' }]);
      }
      if (sql.includes('FROM product_location_stock')) return Promise.resolve([{ quantity: 3 }]);
      return Promise.resolve([]);
    });

    const event = await ingestStockWebhook('tenant_1', {
      source: 'sage',
      eventType: 'stock.snapshot',
      idempotencyKey: 'sage-evt-1',
      productId: 'prod_1',
      quantity: 8,
      locationId: 'main',
    }, {
      id: 'iak_1',
      name: 'ERP bridge',
      keyPrefix: 'jpos_live_known',
      scopes: ['stock:write'],
    });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE products SET stock = ?'),
      [8, 'tenant_1', 'prod_1']
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO product_location_stock'),
      expect.arrayContaining(['tenant_1', 'prod_1', 'main', 8])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_movements'),
      expect.arrayContaining(['tenant_1', 'product', 'prod_1', null, 'Milk', 5, 3, 8])
    );
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant_1',
      action: 'integration.stock_sync_applied',
      source: 'integration_webhook',
    }));
    expect(event).toMatchObject({
      status: 'applied',
      result: { appliedCount: 1 },
    });
  });

  it('returns duplicate webhook events without applying stock twice', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM integration_webhook_events') && sql.includes('idempotency_key')) {
        return Promise.resolve([{
          id: 'iwe_existing',
          tenant_id: 'tenant_1',
          api_key_id: 'iak_1',
          source: 'sage',
          event_type: 'stock.adjustment',
          idempotency_key: 'sage-evt-2',
          status: 'applied',
          payload: '{}',
          result: '{"appliedCount":1}',
        }]);
      }
      return Promise.resolve([]);
    });

    const event = await ingestStockWebhook('tenant_1', {
      source: 'sage',
      eventType: 'stock.adjustment',
      idempotencyKey: 'sage-evt-2',
      productId: 'prod_1',
      delta: -1,
    }, {
      id: 'iak_1',
      name: 'ERP bridge',
      keyPrefix: 'jpos_live_known',
      scopes: ['stock:write'],
    });

    expect(event).toMatchObject({ id: 'iwe_existing', status: 'duplicate', duplicateOf: 'iwe_existing' });
    expect((dbModule.query as any).mock.calls.some(([sql]: any[]) => String(sql).includes('UPDATE products SET stock'))).toBe(false);
  });

  it('marks webhook events failed when products cannot be matched', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM integration_webhook_events') && sql.includes('idempotency_key')) return Promise.resolve([]);
      if (sql.includes('FROM products')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await expect(ingestStockWebhook('tenant_1', {
      source: 'sage',
      eventType: 'stock.adjustment',
      idempotencyKey: 'sage-evt-3',
      productId: 'missing',
      delta: 2,
    }, {
      id: 'iak_1',
      name: 'ERP bridge',
      keyPrefix: 'jpos_live_known',
      scopes: ['stock:write'],
    })).rejects.toThrow('Product not found');

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'failed'"),
      expect.arrayContaining(['tenant_1'])
    );
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      action: 'integration.webhook_failed',
      entityType: 'integration_webhook_event',
    }));
  });
});
