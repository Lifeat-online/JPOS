import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getManagerActionCenter, getManagerActivityCsv, getManagerActivityHistory } from '../../server/actionCenter.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('manager action center', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines operational exceptions into manager-friendly queues', async () => {
    (dbModule.query as any)
      .mockResolvedValueOnce([
        {
          id: 'audit_1',
          action: 'sale.refunded',
          entityType: 'sale',
          details: '{"total":25,"reason":"wrong item"}',
          createdAt: '2026-05-26T08:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'stock_1',
          itemName: 'Bread',
          quantityDelta: '-2',
          previousQuantity: '5',
          newQuantity: '3',
          reason: 'sale',
        },
      ])
      .mockResolvedValueOnce([
        { id: 'prod_1', name: 'Milk', stock: '1', minStock: '5' },
      ])
      .mockResolvedValueOnce([
        {
          id: 'cash_1',
          staffName: 'Jess',
          expectedCash: '100',
          actualCash: '90',
          difference: '-10',
          reviewStatus: 'submitted',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'sale_1',
          transactionType: 'refund',
          total: '-25',
          refundedAmount: '25',
          refundReason: 'wrong item',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'ai_1',
          severity: 'warning',
          title: 'Stock variance',
          evidence: '["Bread dropped quickly"]',
          confidence: '88',
        },
      ]);

    const result = await getManagerActionCenter('tenant_1');

    expect(dbModule.query).toHaveBeenCalledTimes(6);
    expect(result.counts).toMatchObject({
      auditEvents: 1,
      stockMovements: 1,
      lowStock: 1,
      cashExceptions: 1,
      saleExceptions: 1,
      aiWarnings: 1,
    });
    expect(result.urgentCount).toBe(4);
    expect(result.auditEvents[0].details).toEqual({ total: 25, reason: 'wrong item' });
    expect(result.stockMovements[0]).toMatchObject({ quantityDelta: -2, previousQuantity: 5, newQuantity: 3 });
    expect(result.lowStock[0]).toMatchObject({ stock: 1, minStock: 5 });
    expect(result.cashExceptions[0]).toMatchObject({ expectedCash: 100, actualCash: 90, difference: -10 });
    expect(result.saleExceptions[0]).toMatchObject({ total: -25, refundedAmount: 25 });
    expect(result.aiInsights[0]).toMatchObject({ evidence: ['Bread dropped quickly'], confidence: 88 });
    expect(result.generatedAt).toEqual(expect.any(String));
  });

  it('filters audit and stock history for manager search', async () => {
    (dbModule.query as any)
      .mockResolvedValueOnce([
        {
          id: 'audit_1',
          action: 'stock.adjusted',
          entityType: 'product',
          entityId: 'prod_1',
          relatedSaleId: null,
          staffId: 'mgr_1',
          staffName: 'Manager',
          source: 'manager_action_center',
          details: '{"delta":2}',
          createdAt: '2026-05-26T10:05:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'stock_1',
          productId: 'prod_1',
          itemName: 'Milk',
          quantityDelta: '2',
          previousQuantity: '5',
          newQuantity: '7',
          reason: 'manual_adjustment',
          referenceType: 'manager_task',
          referenceId: 'task_1',
          staffId: 'mgr_1',
          staffName: 'Manager',
          createdAt: '2026-05-26T10:06:00.000Z',
        },
      ]);

    const result = await getManagerActivityHistory('tenant_1', {
      search: 'milk',
      staff: 'mgr_1',
      productId: 'prod_1',
      from: '2026-05-26',
      to: '2026-05-26',
      limit: 10,
    });

    expect(dbModule.query).toHaveBeenCalledTimes(2);
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM audit_events'),
      expect.arrayContaining(['tenant_1', '2026-05-26T00:00:00.000Z', '2026-05-26T23:59:59.999Z', 'mgr_1', 'prod_1', 10])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM stock_movements'),
      expect.arrayContaining(['tenant_1', '2026-05-26T00:00:00.000Z', '2026-05-26T23:59:59.999Z', 'mgr_1', 'prod_1', 'prod_1', 10])
    );
    expect(result.counts).toMatchObject({ auditEvents: 1, stockMovements: 1, total: 2 });
    expect(result.items[0]).toMatchObject({
      kind: 'stock',
      title: 'Milk',
      quantityDelta: 2,
      productId: 'prod_1',
    });
    expect(result.items[1]).toMatchObject({
      kind: 'audit',
      title: 'stock.adjusted',
      productId: 'prod_1',
      details: { delta: 2 },
    });
  });

  it('filters audit history by customer, register, and source', async () => {
    (dbModule.query as any).mockResolvedValueOnce([]);

    await getManagerActivityHistory('tenant_1', {
      type: 'audit',
      customerId: 'cust_1',
      registerId: 'cash_1',
      source: 'manager',
      limit: 5,
    });

    expect(dbModule.query).toHaveBeenCalledTimes(1);
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM audit_events'),
      expect.arrayContaining(['tenant_1', 'cust_1', 'cust_1', 'cash_1', 'tenant_1', 'cash_1', '%manager%', 5])
    );
  });

  it('exports filtered activity as csv content', async () => {
    (dbModule.query as any)
      .mockResolvedValueOnce([
        {
          id: 'audit_1',
          action: 'sale.refunded',
          entityType: 'sale',
          entityId: 'sale_1',
          relatedSaleId: 'sale_1',
          staffId: 'mgr_1',
          staffName: 'Manager',
          customerId: 'cust_1',
          source: 'history',
          details: '{"reason":"wrong item"}',
          createdAt: '2026-05-26T10:05:00.000Z',
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await getManagerActivityCsv('tenant_1', { limit: 10 });

    expect(result.filename).toMatch(/jimmy-pos-activity-\d{4}-\d{2}-\d{2}\.csv/);
    expect(result.count).toBe(1);
    expect(result.csv).toContain('"kind","createdAt","title"');
    expect(result.csv).toContain('"audit","2026-05-26T10:05:00.000Z","sale.refunded"');
    expect(result.csv).toContain('"cust_1"');
  });
});
