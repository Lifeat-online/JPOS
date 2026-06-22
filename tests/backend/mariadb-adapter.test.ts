import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getTenantIdBySlug, getProductsByTenant, getAppConfigByTenant } from '../../server/db-adapter.js';

const dbChain: any = {
  select: vi.fn(() => dbChain),
  where: vi.fn(() => dbChain),
  limit: vi.fn(() => dbChain),
  executeTakeFirst: vi.fn(() => Promise.resolve(undefined)),
};

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
  isPostgres: vi.fn(() => false),
  db: {
    selectFrom: vi.fn(() => dbChain),
  },
}));

describe('db-adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dbModule.db.selectFrom as any).mockReturnValue(dbChain);
    dbChain.executeTakeFirst.mockResolvedValue(undefined);
  });

  it('returns tenant id by slug when found', async () => {
    dbChain.executeTakeFirst.mockResolvedValue({ tenant_id: 'tenant_1' });
    const id = await getTenantIdBySlug('demo');
    expect(id).toBe('tenant_1');
  });

  it('returns null when slug is not found', async () => {
    dbChain.executeTakeFirst.mockResolvedValue(undefined);
    const id = await getTenantIdBySlug('missing');
    expect(id).toBeNull();
  });


  it('reads app config when older databases do not have retention_policy yet', async () => {
    const missingColumn = Object.assign(
      new Error("Unknown column 'retention_policy' in 'SELECT'"),
      { code: 'ER_BAD_FIELD_ERROR' },
    );
    (dbModule.query as any)
      .mockRejectedValueOnce(missingColumn)
      .mockResolvedValueOnce([{
        payfast_merchant_id: '10000100',
        payfast_merchant_key: 'merchant-key',
        payfast_passphrase: 'passphrase',
        payfast_sandbox: 1,
        business: JSON.stringify({ name: 'Demo', packageTier: 'business' }),
        categories: JSON.stringify({ food: [] }),
        slug: 'demo',
        setup_completed: 1,
      }]);

    const config = await getAppConfigByTenant('tenant_1');

    expect(config).toMatchObject({
      payfastMerchantId: '10000100',
      business: { name: 'Demo', packageTier: 'business' },
      setupCompleted: true,
    });
    expect(config?.retentionPolicy).toBeUndefined();
    expect(dbModule.query).toHaveBeenCalledTimes(2);
    expect((dbModule.query as any).mock.calls[1][0]).not.toContain('retention_policy');
  });

  it('returns products for tenant', async () => {
    const sample = [{ id: 'prod_1', name: 'Test', price: 10, category: 'Food', stock: 12, minStock: 3 }];
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM staff')) return Promise.resolve([]);
      if (sql.includes('FROM products') && !sql.includes('CROSS JOIN')) return Promise.resolve(sample);
      if (sql.includes('CROSS JOIN inventory_locations')) {
        return Promise.resolve([{
          productId: 'prod_1',
          productName: 'Test',
          locationId: 'main',
          locationName: 'Primary stock pool',
          quantity: 7,
          minStock: 2,
          reorderThreshold: 4,
        }]);
      }
      return Promise.resolve([]);
    });
    const products = await getProductsByTenant('tenant_1');
    expect(products[0]).toMatchObject({
      id: 'prod_1',
      name: 'Test',
      stock: 7,
      minStock: 2,
      aggregateStock: 12,
      activeLocationId: 'main',
      locationStock: expect.objectContaining({ locationId: 'main', quantity: 7 }),
    });
    expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('FROM products'), ['tenant_1']);
  });
});
