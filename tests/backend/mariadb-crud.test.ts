import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../../server/db.js';
import { createProduct, createSale, updateProduct, deleteProduct, seedProducts, updateSale } from '../../server/mariadb-crud.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
  getConnection: vi.fn(),
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

  it('skips seeded products that already exist', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValueOnce([[{ id: 'prod_existing' }]]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    await seedProducts('tenant_1', [
      { name: 'Bread', price: 16, category: 'Groceries', section: 'Retail', stock: 35, barcode: '778899' },
    ]);

    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(conn.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO products'), expect.anything());
    expect(conn.commit).toHaveBeenCalled();
  });

  it('removes duplicate seeded products while keeping the oldest row', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn()
        .mockResolvedValueOnce([[{ id: 'prod_oldest' }, { id: 'prod_duplicate_1' }, { id: 'prod_duplicate_2' }]])
        .mockResolvedValueOnce([[]]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    await seedProducts('tenant_1', [
      { name: 'Bread', price: 16, category: 'Groceries', section: 'Retail', stock: 35, barcode: '778899' },
    ]);

    expect(conn.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('DELETE FROM products'),
      ['tenant_1', 'prod_duplicate_1', 'prod_duplicate_2']
    );
    expect(conn.commit).toHaveBeenCalled();
  });

  it('creates a sale without treating transaction row tuples as recipe rows', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT bulk_item_id')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    const result = await createSale('tenant_1', {
      customerId: 'cust_1',
      status: 'open',
      isTab: true,
      tabName: 'James Koen',
      total: 16,
      subtotal: 16,
      paymentMethod: 'pending',
      items: [{ id: 'prod_1', name: 'Bread', price: 16, quantity: 1 } as any],
    });

    expect(result).toMatchObject({ status: 'open', isTab: true, tabName: 'James Koen' });
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE bulk_items SET stock = stock - ?'),
      expect.anything()
    );
  });

  it('updates a sale and replaces its items', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([[]]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);
    (dbModule.query as any).mockResolvedValue([
      {
        id: 'sale_1',
        status: 'kitchen',
        total: 25,
        items: [{ id: 'item_existing', productId: 'prod_1', name: 'Burger', quantity: 1, status: 'pending' }],
      },
    ]);

    const result = await updateSale('tenant_1', 'sale_1', {
      status: 'kitchen',
      total: 25,
      items: [{ productId: 'prod_1', name: 'Burger', price: 25, quantity: 1, status: 'pending' } as any],
    });

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.query).toHaveBeenNthCalledWith(1, expect.stringContaining('SELECT status, transaction_type FROM sales'), ['tenant_1', 'sale_1']);
    expect(conn.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE sales SET'), [25, 'kitchen', 'tenant_1', 'sale_1']);
    expect(conn.query).toHaveBeenNthCalledWith(3, expect.stringContaining('SELECT * FROM sale_items WHERE sale_id = ?'), ['sale_1']);
    expect(conn.query).toHaveBeenNthCalledWith(4, expect.stringContaining('DELETE FROM sale_items WHERE sale_id = ?'), ['sale_1']);
    expect(conn.query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('INSERT INTO sale_items'),
      expect.arrayContaining(['sale_1', 'prod_1', 'Burger', 25, 1, 'pending'])
    );
    expect(result).toMatchObject({ id: 'sale_1', status: 'kitchen' });
  });
});
