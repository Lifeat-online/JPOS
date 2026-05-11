import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getTenantIdBySlug, getProductsByTenant } from '../../server/mariadb-adapter.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
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
    const sample = [{ id: 'prod_1', name: 'Test', price: 10, category: 'Food' }];
    (dbModule.query as any).mockResolvedValue(sample);
    const products = await getProductsByTenant('tenant_1');
    expect(products).toEqual(sample);
    expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('FROM products'), ['tenant_1']);
  });
});
