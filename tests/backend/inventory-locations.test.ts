import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import {
  cashierCanAccessLocation,
  completeStockTransferOrder,
  upsertProductLocationStock,
} from '../../server/inventoryLocations.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  isPostgres: vi.fn(() => false),
}));

describe('inventory locations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeConn() {
    return {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([[]]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
  }

  it('updates per-location stock, aggregate product stock, movement, and audit rows', async () => {
    const conn = makeConn();
    conn.query.mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes('FROM products') && sql.includes('FOR UPDATE')) {
        return Promise.resolve([[{ id: 'prod_1', name: 'Milk', stock: 10, minStock: 5 }]]);
      }
      if (sql.includes('FROM inventory_locations')) {
        return Promise.resolve([[{ id: 'branch_1', name: 'Branch 1' }]]);
      }
      if (sql.includes('FROM product_location_stock') && sql.includes('FOR UPDATE')) {
        return Promise.resolve([[{ quantity: 3, minStock: 2, reorderThreshold: 2 }]]);
      }
      if (sql.includes('SUM(quantity)')) {
        return Promise.resolve([[{ aggregateStock: 8 }]]);
      }
      return Promise.resolve([[]]);
    });
    (dbModule.getConnection as any).mockResolvedValue(conn);
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('CROSS JOIN inventory_locations')) {
        return Promise.resolve([{
          productId: 'prod_1',
          productName: 'Milk',
          locationId: 'branch_1',
          locationName: 'Branch 1',
          quantity: 8,
          minStock: 4,
          reorderThreshold: 6,
        }]);
      }
      return Promise.resolve([]);
    });

    const result = await upsertProductLocationStock('tenant_1', {
      productId: 'prod_1',
      locationId: 'branch_1',
      quantity: 8,
      minStock: 4,
      reorderThreshold: 6,
      staffId: 'mgr_1',
      staffName: 'Manager',
    });

    expect(result).toMatchObject({ productId: 'prod_1', locationId: 'branch_1', quantity: 8, reorderThreshold: 6 });
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE product_location_stock'),
      expect.arrayContaining([8, 4, 6, 'mgr_1', 'Manager', 'tenant_1', 'prod_1', 'branch_1'])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE products SET stock = ?'),
      [8, 'tenant_1', 'prod_1']
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_movements'),
      expect.arrayContaining(['tenant_1', 'product', 'prod_1', null, 'Milk', 5, 3, 8, 'location_stock_adjustment'])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'inventory_location_stock.updated', 'product_location_stock'])
    );
    expect(conn.commit).toHaveBeenCalled();
  });

  it('completes transfer orders by moving stock between locations without changing aggregate quantity', async () => {
    const conn = makeConn();
    conn.query.mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes('FROM stock_transfer_orders')) {
        return Promise.resolve([[{
          id: 'transfer_1',
          tenant_id: 'tenant_1',
          from_location_id: 'main',
          to_location_id: 'branch_2',
          status: 'requested',
        }]]);
      }
      if (sql.includes('FROM stock_transfer_items')) {
        return Promise.resolve([[{
          id: 'item_1',
          product_id: 'prod_1',
          product_name: 'Milk',
          quantity: 4,
        }]]);
      }
      if (sql.includes('FROM products')) {
        return Promise.resolve([[{ id: 'prod_1', name: 'Milk', minStock: 5 }]]);
      }
      if (sql.includes('FROM product_location_stock') && sql.includes('location_id = ?')) {
        const locationId = params?.[2];
        if (locationId === 'main') return Promise.resolve([[{ quantity: 10, minStock: 5, reorderThreshold: 5 }]]);
        return Promise.resolve([[{ quantity: 1, minStock: 2, reorderThreshold: 2 }]]);
      }
      if (sql.includes('SUM(quantity)')) {
        return Promise.resolve([[{ aggregateStock: 11 }]]);
      }
      return Promise.resolve([[]]);
    });
    (dbModule.getConnection as any).mockResolvedValue(conn);
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM stock_transfer_orders')) {
        return Promise.resolve([{
          id: 'transfer_1',
          fromLocationId: 'main',
          toLocationId: 'branch_2',
          status: 'completed',
        }]);
      }
      if (sql.includes('FROM stock_transfer_items')) {
        return Promise.resolve([{ id: 'item_1', transferId: 'transfer_1', productId: 'prod_1', productName: 'Milk', quantity: 4 }]);
      }
      return Promise.resolve([]);
    });

    await completeStockTransferOrder('tenant_1', 'transfer_1', { staffId: 'mgr_1', staffName: 'Manager' });

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE product_location_stock'),
      expect.arrayContaining([6, 'mgr_1', 'Manager', 'tenant_1', 'prod_1', 'main'])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE product_location_stock'),
      expect.arrayContaining([5, 'mgr_1', 'Manager', 'tenant_1', 'prod_1', 'branch_2'])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'completed'"),
      expect.arrayContaining(['mgr_1', 'Manager', 'tenant_1', 'transfer_1'])
    );
    expect(conn.commit).toHaveBeenCalled();
  });

  it('checks cashier access against assigned location ids', () => {
    expect(cashierCanAccessLocation('cashier', { assignedLocationIds: ['branch_1'] }, 'branch_1')).toBe(true);
    expect(cashierCanAccessLocation('cashier', { assignedLocationIds: ['branch_1'] }, 'branch_2')).toBe(false);
    expect(cashierCanAccessLocation('manager', { assignedLocationIds: ['branch_1'] }, 'branch_2')).toBe(true);
  });
});
