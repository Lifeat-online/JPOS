import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import {
  approveStockTakeSession,
  createStockTakeSession,
  submitStockTakeCount,
} from '../../server/stockTake.js';

vi.mock('../../server/db.js', () => ({
  getConnection: vi.fn(),
  query: vi.fn(),
}));

describe('stocktake workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockConnection(queryImpl?: (sql: string, params?: any[]) => Promise<any>) {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn(queryImpl || (() => Promise.resolve([[]]))),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);
    return conn;
  }

  it('creates an active stocktake with product snapshots and staff assignments', async () => {
    const conn = mockConnection();
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM products')) {
        return Promise.resolve([{ id: 'prod_1', name: 'Milk', barcode: '6001', stock: '12' }]);
      }
      if (sql.includes('FROM staff')) {
        return Promise.resolve([{ id: 'staff_1', name: 'Jess' }]);
      }
      if (sql.includes('FROM stock_take_sessions s')) {
        return Promise.resolve([{
          id: 'stkt_1',
          tenantId: 'tenant_1',
          name: 'Morning cycle',
          type: 'cycle',
          status: 'active',
          itemCount: '1',
          countedCount: '0',
          varianceCount: '0',
        }]);
      }
      if (sql.includes('FROM stock_take_items')) {
        return Promise.resolve([{
          id: 'item_1',
          tenantId: 'tenant_1',
          sessionId: 'stkt_1',
          productId: 'prod_1',
          productName: 'Milk',
          expectedQuantity: '12',
          assignedTo: 'staff_1',
          assignedToName: 'Jess',
          status: 'assigned',
        }]);
      }
      return Promise.resolve([]);
    });

    const session = await createStockTakeSession('tenant_1', {
      name: 'Morning cycle',
      type: 'cycle',
      assignments: [{ productId: 'prod_1', assignedTo: 'staff_1' }],
    }, {
      staffId: 'mgr_1',
      staffName: 'Manager',
      role: 'manager',
    });

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_take_sessions'),
      expect.arrayContaining(['tenant_1', 'Morning cycle', 'cycle', 'mgr_1', 'Manager'])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_take_items'),
      expect.arrayContaining(['tenant_1', expect.any(String), 'prod_1', 'Milk', '6001', 12, 'staff_1', 'Jess'])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'stocktake.created', 'stock_take_session'])
    );
    expect(conn.commit).toHaveBeenCalled();
    expect(session).toMatchObject({ name: 'Morning cycle', status: 'active' });
  });

  it('lets assigned staff submit counts and moves complete sessions to submitted', async () => {
    let stockTakeSessionSelects = 0;
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('JOIN stock_take_sessions') && sql.includes('WHERE i.tenant_id')) {
        return Promise.resolve([{
          id: 'item_1',
          tenantId: 'tenant_1',
          sessionId: 'session_1',
          productId: 'prod_1',
          productName: 'Milk',
          expectedQuantity: '10',
          assignedTo: 'staff_1',
          assignedToName: 'Jess',
          status: 'assigned',
          sessionStatus: 'active',
        }]);
      }
      if (sql.includes('COUNT(*) AS remaining')) return Promise.resolve([{ remaining: '0' }]);
      if (sql.includes('FROM stock_take_sessions s')) {
        stockTakeSessionSelects += 1;
        return Promise.resolve([{
          id: 'session_1',
          tenantId: 'tenant_1',
          name: 'Daily spot',
          type: 'spot_check',
          status: stockTakeSessionSelects > 0 ? 'submitted' : 'active',
          itemCount: '1',
          countedCount: '1',
          varianceCount: '1',
        }]);
      }
      if (sql.includes('FROM stock_take_items')) {
        return Promise.resolve([{
          id: 'item_1',
          tenantId: 'tenant_1',
          sessionId: 'session_1',
          productId: 'prod_1',
          productName: 'Milk',
          expectedQuantity: '10',
          countedQuantity: '8',
          varianceQuantity: '-2',
          assignedTo: 'staff_1',
          assignedToName: 'Jess',
          status: 'counted',
        }]);
      }
      return Promise.resolve([]);
    });

    const result = await submitStockTakeCount('tenant_1', 'item_1', {
      countedQuantity: 8,
      note: 'Front shelf counted',
    }, {
      staffId: 'staff_1',
      staffName: 'Jess',
      role: 'cashier',
    });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE stock_take_items'),
      expect.arrayContaining([8, -2, 'staff_1', 'Jess', 'Front shelf counted', 'tenant_1', 'item_1'])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'submitted'"),
      ['tenant_1', 'session_1']
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'stocktake.item_counted', 'stock_take_item', 'item_1'])
    );
    expect(result).toMatchObject({ id: 'session_1', status: 'submitted' });
  });

  it('approves counted sessions through the stock movement ledger', async () => {
    const conn = mockConnection((sql: string) => {
      if (sql.includes('FROM stock_take_sessions') && sql.includes('FOR UPDATE')) {
        return Promise.resolve([[{ id: 'session_1', name: 'Daily spot', type: 'spot_check', status: 'submitted' }]]);
      }
      if (sql.includes('FROM stock_take_items') && sql.includes('FOR UPDATE')) {
        return Promise.resolve([[
          {
            id: 'item_1',
            productId: 'prod_1',
            productName: 'Milk',
            expectedQuantity: 10,
            countedQuantity: 8,
            varianceQuantity: -2,
            status: 'counted',
          },
        ]]);
      }
      if (sql.includes('SELECT id, name, stock')) {
        return Promise.resolve([[{ id: 'prod_1', name: 'Milk', stock: 10 }]]);
      }
      return Promise.resolve([[]]);
    });
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM stock_take_sessions s')) {
        return Promise.resolve([{
          id: 'session_1',
          tenantId: 'tenant_1',
          name: 'Daily spot',
          type: 'spot_check',
          status: 'approved',
          itemCount: '1',
          countedCount: '1',
          varianceCount: '1',
        }]);
      }
      if (sql.includes('FROM stock_take_items')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const result = await approveStockTakeSession('tenant_1', 'session_1', {
      staffId: 'mgr_1',
      staffName: 'Manager',
      role: 'manager',
    });

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE products SET stock = ?'),
      [8, 'tenant_1', 'prod_1']
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_movements'),
      expect.arrayContaining(['tenant_1', 'product', 'prod_1', null, 'Milk', -2, 10, 8, 'stock_take'])
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'stocktake.approved', 'stock_take_session', 'session_1'])
    );
    expect(conn.commit).toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'session_1', status: 'approved', applied: [{ productId: 'prod_1', quantityDelta: -2 }] });
  });
});
