import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../../server/db.js';
import { createProduct, updateProduct, deleteProduct } from '../../server/mariadb-crud.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('mariadb-crud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a product with generated id', async () => {
    (dbModule.query as any).mockResolvedValue([{}]);
    const product = await createProduct('tenant_1', { name: 'Sample', price: 25, category: 'Food', stock: 10, minStock: 0 });
    expect(product).toMatchObject({ name: 'Sample', price: 25, category: 'Food', stock: 10 });
    expect(product.id).toMatch(/prod_/);
  });

  it('updates a product and fetches the new row', async () => {
    (dbModule.query as any)
      .mockResolvedValueOnce([{ id: 'prod_1', name: 'Sample', price: 25 }])
      .mockResolvedValueOnce([{ id: 'prod_1', name: 'Sample Updated', price: 30 }]);

    const result = await updateProduct('tenant_1', 'prod_1', { price: 30 });
    expect(result).toMatchObject({ price: 30 });
    expect(dbModule.query).toHaveBeenCalledTimes(2);
  });

  it('deletes a product', async () => {
    (dbModule.query as any).mockResolvedValue({});
    const result = await deleteProduct('tenant_1', 'prod_1');
    expect(result).toBeUndefined();
    expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM products'), ['tenant_1', 'prod_1']);
  });
});
