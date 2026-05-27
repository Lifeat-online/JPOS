import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import * as crudModule from '../../server/mariadb-crud.js';
import * as stockTakeModule from '../../server/stockTake.js';
import { createManagerSaleApprovalRequest, createManagerStockAdjustmentRequest, decideManagerTask, getManagerTaskQueue } from '../../server/managerTasks.js';

vi.mock('../../server/db.js', () => ({
  getConnection: vi.fn(),
  isPostgres: vi.fn(() => false),
  query: vi.fn(),
}));

vi.mock('../../server/mariadb-crud.js', () => ({
  processSaleRefund: vi.fn(),
  processSaleVoid: vi.fn(),
}));

vi.mock('../../server/stockTake.js', () => ({
  approveStockTakeSession: vi.fn(),
}));

describe('manager task queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs operational signals into active manager tasks', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM cash_sessions')) {
        return Promise.resolve([
          { id: 'cash_1', staffName: 'Jess', expectedCash: '100', actualCash: '90', difference: '-10', reviewStatus: 'submitted' },
        ]);
      }
      if (sql.includes('FROM sales')) {
        return Promise.resolve([
          { id: 'sale_1', transactionType: 'refund', total: '-25', refundedAmount: '25', refundReason: 'wrong item' },
        ]);
      }
      if (sql.includes('FROM products')) {
        return Promise.resolve([
          { id: 'prod_1', name: 'Milk', stock: '1', minStock: '5' },
        ]);
      }
      if (sql.includes('FROM ai_insights')) {
        return Promise.resolve([
          { id: 'ai_1', severity: 'warning', title: 'Stock warning', summary: 'Low stock', recommendation: 'Create a PO', confidence: '88' },
        ]);
      }
      if (sql.includes('INSERT INTO manager_tasks')) return Promise.resolve({});
      if (sql.includes('FROM manager_tasks')) {
        return Promise.resolve([
          {
            id: 'task_1',
            tenantId: 'tenant_1',
            taskType: 'cash_variance',
            title: 'Review cash-up for Jess',
            priority: 'high',
            status: 'open',
            sourceType: 'cash_session',
            sourceId: 'cash_1',
            details: '{"difference":-10}',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await getManagerTaskQueue('tenant_1');

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO manager_tasks'),
      expect.arrayContaining(['tenant_1', 'cash_variance'])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO manager_tasks'),
      expect.arrayContaining(['tenant_1', 'ai_recommendation'])
    );
    expect(result.counts).toMatchObject({ open: 1, inReview: 0, total: 1 });
    expect(result.tasks[0]).toMatchObject({
      id: 'task_1',
      taskType: 'cash_variance',
      details: { difference: -10 },
    });
  });

  it('syncs stocktake exceptions and offline sync issues into manager tasks', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM stock_take_sessions s')) {
        return Promise.resolve([
          {
            id: 'session_1',
            name: 'Daily spot',
            type: 'spot_check',
            status: 'submitted',
            itemCount: '2',
            countedCount: '2',
            varianceCount: '1',
            netVariance: '-3',
          },
        ]);
      }
      if (sql.includes('FROM audit_events')) {
        return Promise.resolve([
          {
            id: 'audit_sync_1',
            action: 'offline.sync_failed',
            entityType: 'sale',
            entityId: 'sale_1',
            source: 'offline_queue',
            details: '{"attempts":3}',
          },
        ]);
      }
      if (sql.includes('INSERT INTO manager_tasks')) return Promise.resolve({});
      if (sql.includes('FROM manager_tasks')) {
        return Promise.resolve([
          {
            id: 'task_stocktake_1',
            tenantId: 'tenant_1',
            taskType: 'stock_variance',
            title: 'Approve stocktake variance: Daily spot',
            priority: 'normal',
            status: 'open',
            sourceType: 'stock_take_session',
            sourceId: 'session_1',
            details: '{"varianceCount":1,"netVariance":-3}',
          },
          {
            id: 'task_sync_1',
            tenantId: 'tenant_1',
            taskType: 'offline_sync',
            title: 'Review failed offline sync',
            priority: 'high',
            status: 'open',
            sourceType: 'audit_event',
            sourceId: 'audit_sync_1',
            details: '{"action":"offline.sync_failed"}',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await getManagerTaskQueue('tenant_1');

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO manager_tasks'),
      expect.arrayContaining(['tenant_1', 'stock_variance'])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO manager_tasks'),
      expect.arrayContaining(['tenant_1', 'offline_sync'])
    );
    expect(result.counts).toMatchObject({ open: 2, total: 2 });
    expect(result.tasks.map((task) => task.taskType)).toEqual(['stock_variance', 'offline_sync']);
  });

  it('requires a manager note and audits task decisions', async () => {
    let taskSelects = 0;
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM manager_tasks')) {
        taskSelects += 1;
        return Promise.resolve([
          {
            id: 'task_1',
            tenantId: 'tenant_1',
            taskType: 'cash_variance',
            title: 'Review cash-up',
            priority: 'high',
            status: taskSelects === 1 ? 'open' : 'approved',
            sourceType: 'cash_session',
            sourceId: 'cash_1',
            details: '{}',
          },
        ]);
      }
      return Promise.resolve({});
    });

    await expect(decideManagerTask('tenant_1', 'task_1', { action: 'approve' })).rejects.toThrow('manager note');

    const result = await decideManagerTask('tenant_1', 'task_1', {
      action: 'approve',
      note: 'Checked till slip and accepted variance.',
      staffId: 'mgr_1',
      staffName: 'Manager',
    });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE cash_sessions'),
      ['reviewed', 'mgr_1', 'Checked till slip and accepted variance.', 'tenant_1', 'cash_1']
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'manager_task.approved', 'manager_task', 'task_1'])
    );
    expect(result).toMatchObject({ id: 'task_1', status: 'approved' });
  });

  it('creates cashier refund approval requests for the manager queue', async () => {
    let selected = false;
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO manager_tasks')) return Promise.resolve({});
      if (sql.includes('INSERT INTO audit_events')) return Promise.resolve({});
      if (sql.includes('FROM manager_tasks')) {
        selected = true;
        return Promise.resolve([
          {
            id: 'task_request_1',
            tenantId: 'tenant_1',
            taskType: 'refund_request',
            title: 'Approve refund for sale_1',
            priority: 'high',
            status: 'open',
            sourceType: 'approval_request',
            sourceId: 'task_request_1',
            relatedSaleId: 'sale_1',
            requestedBy: 'cashier_1',
            details: '{"requestedAction":"refund","saleId":"sale_1"}',
          },
        ]);
      }
      return Promise.resolve({});
    });

    const task = await createManagerSaleApprovalRequest('tenant_1', {
      kind: 'refund',
      saleId: 'sale_1',
      payload: { items: [{ saleItemId: 'item_1', quantity: 1 }], reason: 'Wrong item', method: 'cash' },
      requestedBy: 'cashier_1',
      requestedByName: 'Cashier',
    });

    expect(selected).toBe(true);
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO manager_tasks'),
      expect.arrayContaining(['tenant_1', 'refund_request'])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'manager_task.requested.refund', 'manager_task'])
    );
    expect(task).toMatchObject({ taskType: 'refund_request', sourceType: 'approval_request' });
  });

  it('executes approved refund requests from the manager action center', async () => {
    (crudModule.processSaleRefund as any).mockResolvedValue({ id: 'refund_1' });
    let taskSelects = 0;
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM manager_tasks')) {
        taskSelects += 1;
        return Promise.resolve([
          {
            id: 'task_request_1',
            tenantId: 'tenant_1',
            taskType: 'refund_request',
            title: 'Approve refund',
            priority: 'high',
            status: taskSelects === 1 ? 'open' : 'approved',
            sourceType: 'approval_request',
            sourceId: 'task_request_1',
            relatedSaleId: 'sale_1',
            requestedBy: 'cashier_1',
            details: '{"requestedAction":"refund","payload":{"items":[{"saleItemId":"item_1","quantity":1}],"reason":"Wrong item","method":"cash"}}',
          },
        ]);
      }
      return Promise.resolve({});
    });

    const result = await decideManagerTask('tenant_1', 'task_request_1', {
      action: 'approve',
      note: 'Approved after checking the order.',
      staffId: 'mgr_1',
      staffName: 'Manager',
    });

    expect(crudModule.processSaleRefund).toHaveBeenCalledWith(
      'tenant_1',
      'sale_1',
      expect.objectContaining({
        reason: 'Wrong item',
        staffId: 'mgr_1',
        staffName: 'Manager',
      })
    );
    expect(result).toMatchObject({
      id: 'task_request_1',
      status: 'approved',
      sourceResult: { id: 'refund_1' },
    });
  });

  it('creates cashier stock adjustment approval requests for the manager queue', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO manager_tasks')) return Promise.resolve({});
      if (sql.includes('INSERT INTO audit_events')) return Promise.resolve({});
      if (sql.includes('FROM manager_tasks')) {
        return Promise.resolve([
          {
            id: 'task_stock_1',
            tenantId: 'tenant_1',
            taskType: 'stock_adjustment_request',
            title: 'Decrease stock for Milk',
            priority: 'normal',
            status: 'open',
            sourceType: 'approval_request',
            sourceId: 'task_stock_1',
            relatedProductId: 'prod_1',
            requestedBy: 'cashier_1',
            details: '{"requestedAction":"stock_adjustment","productId":"prod_1","delta":-1,"reason":"Damaged"}',
          },
        ]);
      }
      return Promise.resolve({});
    });

    const task = await createManagerStockAdjustmentRequest('tenant_1', {
      productId: 'prod_1',
      productName: 'Milk',
      delta: -1,
      reason: 'Damaged',
      requestedBy: 'cashier_1',
      requestedByName: 'Cashier',
    });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO manager_tasks'),
      expect.arrayContaining(['tenant_1', 'Decrease stock for Milk'])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'manager_task.requested.stock_adjustment', 'manager_task'])
    );
    expect(task).toMatchObject({
      taskType: 'stock_adjustment_request',
      sourceType: 'approval_request',
      relatedProductId: 'prod_1',
    });
  });

  it('executes approved stock adjustment requests through the stock ledger', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn((sql: string) => {
        if (sql.includes('SELECT id, name, stock')) {
          return Promise.resolve([[{ id: 'prod_1', name: 'Milk', stock: 5 }]]);
        }
        return Promise.resolve([[]]);
      }),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    let taskSelects = 0;
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM manager_tasks')) {
        taskSelects += 1;
        return Promise.resolve([
          {
            id: 'task_stock_1',
            tenantId: 'tenant_1',
            taskType: 'stock_adjustment_request',
            title: 'Increase stock',
            priority: 'normal',
            status: taskSelects === 1 ? 'open' : 'approved',
            sourceType: 'approval_request',
            sourceId: 'task_stock_1',
            relatedProductId: 'prod_1',
            requestedBy: 'cashier_1',
            details: '{"requestedAction":"stock_adjustment","payload":{"productId":"prod_1","delta":2,"reason":"Count correction","note":"Shelf count"}}',
          },
        ]);
      }
      return Promise.resolve({});
    });

    const result = await decideManagerTask('tenant_1', 'task_stock_1', {
      action: 'approve',
      note: 'Count checked on shelf.',
      staffId: 'mgr_1',
      staffName: 'Manager',
    });

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE products SET stock = ?'),
      [7, 'tenant_1', 'prod_1']
    );
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_movements'),
      expect.arrayContaining(['tenant_1', 'product', 'prod_1', null, 'Milk', 2, 5, 7, 'manual_adjustment'])
    );
    expect(conn.commit).toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'task_stock_1',
      status: 'approved',
      sourceResult: { previousQuantity: 5, newQuantity: 7, quantityDelta: 2 },
    });
  });

  it('approves stocktake variance tasks through the stocktake ledger', async () => {
    (stockTakeModule.approveStockTakeSession as any).mockResolvedValue({
      id: 'session_1',
      status: 'approved',
      applied: [{ productId: 'prod_1', quantityDelta: -2 }],
    });
    let taskSelects = 0;
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM manager_tasks')) {
        taskSelects += 1;
        return Promise.resolve([
          {
            id: 'task_stocktake_1',
            tenantId: 'tenant_1',
            taskType: 'stock_variance',
            title: 'Approve stocktake variance',
            priority: 'high',
            status: taskSelects === 1 ? 'open' : 'approved',
            sourceType: 'stock_take_session',
            sourceId: 'session_1',
            details: '{"varianceCount":1}',
          },
        ]);
      }
      return Promise.resolve({});
    });

    const result = await decideManagerTask('tenant_1', 'task_stocktake_1', {
      action: 'approve',
      note: 'Second count matches the variance.',
      staffId: 'mgr_1',
      staffName: 'Manager',
    });

    expect(stockTakeModule.approveStockTakeSession).toHaveBeenCalledWith(
      'tenant_1',
      'session_1',
      { staffId: 'mgr_1', staffName: 'Manager', role: 'manager' }
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'manager_task.approved', 'manager_task', 'task_stocktake_1'])
    );
    expect(result).toMatchObject({
      id: 'task_stocktake_1',
      status: 'approved',
      sourceResult: { status: 'approved', applied: [{ productId: 'prod_1', quantityDelta: -2 }] },
    });
  });
});
