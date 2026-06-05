import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getTenantIdBySlug, getProductsByTenant } from '../../server/mariadb-adapter.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
  isPostgres: vi.fn(() => false),
}));

describe('mariadb-adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns tenant id by slug when found', async () => {
    (dbModule.query as any).mockResolvedValue([{ tenant_id: 'tenant_1' }]);
    const id = await getTenantIdBySlug('demo');
    expect(id).toBe('tenant_1');
  });

  it('returns null when slug is not found', async () => {
    (dbModule.query as any).mockResolvedValue([]);
    const id = await getTenantIdBySlug('missing');
    expect(id).toBeNull();
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
