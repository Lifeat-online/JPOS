import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../../server/db.js';
import { cancelLaybyOrder, completeLaybyOrder, createLaybyOrder } from '../../server/layby.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
  getConnection: vi.fn(),
}));

function makeConn(queryImpl: (sql: string, params?: any[]) => Promise<any> = async () => [[]]) {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockImplementation(queryImpl),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
}

function mockLoadedLayby(overrides: any = {}) {
  (dbModule.query as any).mockImplementation((sql: string) => {
    if (sql.includes('FROM layby_orders')) {
      return Promise.resolve([{
        id: overrides.id || 'layby_1',
        tenantId: 'tenant_1',
        customerId: 'cust_1',
        customerName: 'Lebo',
        status: overrides.status || 'active',
        subtotal: 200,
        taxAmount: 0,
        taxRate: 0,
        taxInclusive: 1,
        totalAmount: 200,
        depositAmount: 100,
        amountPaid: overrides.amountPaid ?? 100,
        balanceDue: overrides.balanceDue ?? 100,
        dueDate: '2026-06-30',
      }]);
    }
    if (sql.includes('FROM layby_items')) {
      return Promise.resolve([{ id: 'layitem_1', laybyOrderId: 'layby_1', productId: 'prod_1', productName: 'Shoes', price: 200, quantity: 1, reservedQuantity: 1 }]);
    }
    if (sql.includes('FROM layby_payments')) {
      return Promise.resolve([{ id: 'laypay_1', laybyOrderId: 'layby_1', method: 'cash', amount: 100, tenderedAmount: 100, changeAmount: 0 }]);
    }
    return Promise.resolve([]);
  });
}

describe('layby workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a lay-by, reserves stock, records deposit payment, and audits it', async () => {
    const conn = makeConn(async (sql: string) => {
      if (sql.includes('FROM customers')) return [[{ name: 'Lebo' }]];
      if (sql.includes('FROM products')) return [[{ id: 'prod_1', name: 'Shoes', stock: 5 }]];
      return [[]];
    });
    (dbModule.getConnection as any).mockResolvedValue(conn);
    mockLoadedLayby({ id: 'layby_created', amountPaid: 100, balanceDue: 100 });

    const order = await createLaybyOrder('tenant_1', {
      customerId: 'cust_1',
      customerName: 'Lebo',
      staffId: 'staff_1',
      staffName: 'Jess',
      totalAmount: 200,
      subtotal: 200,
      dueDate: '2026-06-30',
      items: [{ productId: 'prod_1', productName: 'Shoes', price: 200, quantity: 2 }],
      payment: { method: 'cash', amount: 100, cashSessionId: 'cs_1' },
    });

    expect(order).toMatchObject({ id: 'layby_created', amountPaid: 100, balanceDue: 100 });
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO layby_orders'), expect.arrayContaining(['tenant_1', 'cust_1', 'Lebo']));
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO layby_items'), expect.arrayContaining(['prod_1', 'Shoes', 200, 2, 2]));
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE products SET stock = ?'), [3, 'tenant_1', 'prod_1']);
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_movements'),
      expect.arrayContaining(['tenant_1', 'product', 'prod_1', null, 'Shoes', -2, 5, 3, 'layby_reserve', 'transfer'])
    );
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO layby_payments'), expect.arrayContaining(['cash', 100]));
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE cash_sessions'), expect.arrayContaining([100, 'tenant_1', 'cs_1']));
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.arrayContaining(['tenant_1', 'layby.created', 'layby_order']));
    expect(conn.commit).toHaveBeenCalled();
  });

  it('completes a paid-up lay-by by creating a layby_final sale without a second stock deduction', async () => {
    const conn = makeConn(async (sql: string) => {
      if (sql.includes('FROM layby_orders')) {
        return [[{
          id: 'layby_1',
          tenantId: 'tenant_1',
          customerId: 'cust_1',
          customerName: 'Lebo',
          status: 'active',
          subtotal: 200,
          taxAmount: 0,
          taxRate: 0,
          taxInclusive: 1,
          totalAmount: 200,
          depositAmount: 100,
          amountPaid: 200,
          balanceDue: 0,
          dueDate: '2026-06-30',
        }]];
      }
      if (sql.includes('FROM layby_items')) return [[{ id: 'layitem_1', productId: 'prod_1', productName: 'Shoes', price: 200, quantity: 1, reservedQuantity: 1 }]];
      if (sql.includes('FROM layby_payments')) return [[{ id: 'laypay_1', method: 'cash', amount: 200, tenderedAmount: 200, changeAmount: 0 }]];
      return [[]];
    });
    (dbModule.getConnection as any).mockResolvedValue(conn);
    mockLoadedLayby({ status: 'completed', amountPaid: 200, balanceDue: 0 });

    await completeLaybyOrder('tenant_1', 'layby_1', { staffId: 'staff_1', staffName: 'Jess' });

    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sales'), expect.arrayContaining(['tenant_1', 'cust_1', null, 'staff_1']));
    const salesInsert = conn.query.mock.calls.find(([sql]: any[]) => String(sql).includes('INSERT INTO sales'));
    expect(salesInsert?.[1]).toContain('layby_final');
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sale_items'), expect.arrayContaining(['prod_1', 'Shoes', 200, 1, 'delivered']));
    expect(conn.query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE products SET stock = ?'), expect.anything());
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'completed'"), expect.arrayContaining(['staff_1', 'Jess', 'tenant_1', 'layby_1']));
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.arrayContaining(['tenant_1', 'layby.completed', 'layby_order']));
  });

  it('cancels an active lay-by, releases reserved stock, and records cash refunds', async () => {
    const conn = makeConn(async (sql: string) => {
      if (sql.includes('FROM layby_orders')) {
        return [[{
          id: 'layby_1',
          tenantId: 'tenant_1',
          customerId: 'cust_1',
          customerName: 'Lebo',
          status: 'active',
          subtotal: 200,
          taxAmount: 0,
          taxRate: 0,
          taxInclusive: 1,
          totalAmount: 200,
          depositAmount: 100,
          amountPaid: 100,
          balanceDue: 100,
          dueDate: '2026-06-30',
        }]];
      }
      if (sql.includes('FROM layby_items')) return [[{ id: 'layitem_1', productId: 'prod_1', productName: 'Shoes', price: 200, quantity: 2, reservedQuantity: 2 }]];
      if (sql.includes('FROM layby_payments')) return [[{ id: 'laypay_1', method: 'cash', amount: 100, tenderedAmount: 100, changeAmount: 0 }]];
      if (sql.includes('FROM products')) return [[{ id: 'prod_1', name: 'Shoes', stock: 3 }]];
      return [[]];
    });
    (dbModule.getConnection as any).mockResolvedValue(conn);
    mockLoadedLayby({ status: 'cancelled', amountPaid: 100, balanceDue: 100 });

    await cancelLaybyOrder('tenant_1', 'layby_1', {
      staffId: 'staff_1',
      staffName: 'Jess',
      reason: 'Customer cancelled',
      refundAmount: 25,
      refundMethod: 'cash',
      cashSessionId: 'cs_1',
    });

    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE products SET stock = ?'), [5, 'tenant_1', 'prod_1']);
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_movements'),
      expect.arrayContaining(['tenant_1', 'product', 'prod_1', null, 'Shoes', 2, 3, 5, 'layby_release', 'transfer'])
    );
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE cash_sessions'), expect.arrayContaining([25, 'tenant_1', 'cs_1']));
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'cancelled'"), expect.arrayContaining([25, 75, 'Customer cancelled']));
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_events'), expect.arrayContaining(['tenant_1', 'layby.cancelled', 'layby_order']));
  });
});
