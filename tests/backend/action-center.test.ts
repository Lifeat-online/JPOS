import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getManagerActionCenter, getManagerActivityCsv, getManagerActivityHistory, getManagerAuditReport } from '../../server/actionCenter.js';

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
          reasonCode: 'sale',
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
      ])
      .mockResolvedValueOnce([
        {
          id: 'session_1',
          name: 'Daily spot',
          type: 'spot_check',
          status: 'submitted',
          itemCount: '2',
          countedCount: '2',
          varianceCount: '1',
          netVariance: '-2',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'audit_sync_1',
          action: 'offline.sync_failed',
          entityType: 'sale',
          entityId: 'sale_1',
          details: '{"attempts":2}',
          createdAt: '2026-05-26T08:05:00.000Z',
        },
      ]);

    const result = await getManagerActionCenter('tenant_1');

    expect(dbModule.query).toHaveBeenCalledTimes(8);
    expect(result.counts).toMatchObject({
      auditEvents: 1,
      stockMovements: 1,
      lowStock: 1,
      cashExceptions: 1,
      saleExceptions: 1,
      aiWarnings: 1,
      stockTakeExceptions: 1,
      offlineSyncIssues: 1,
    });
    expect(result.urgentCount).toBe(6);
    expect(result.auditEvents[0].details).toEqual({ total: 25, reason: 'wrong item' });
    expect(result.stockMovements[0]).toMatchObject({ quantityDelta: -2, previousQuantity: 5, newQuantity: 3, reasonCode: 'sale' });
    expect(result.lowStock[0]).toMatchObject({ stock: 1, minStock: 5 });
    expect(result.cashExceptions[0]).toMatchObject({ expectedCash: 100, actualCash: 90, difference: -10 });
    expect(result.saleExceptions[0]).toMatchObject({ total: -25, refundedAmount: 25 });
    expect(result.aiInsights[0]).toMatchObject({ evidence: ['Bread dropped quickly'], confidence: 88 });
    expect(result.stockTakeExceptions[0]).toMatchObject({ itemCount: 2, countedCount: 2, varianceCount: 1, netVariance: -2 });
    expect(result.offlineSyncIssues[0]).toMatchObject({ action: 'offline.sync_failed', details: { attempts: 2 } });
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
          reasonCode: 'adjustment',
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
      reasonCode: 'adjustment',
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

  it('filters audit and stock history by device metadata in audit details', async () => {
    (dbModule.query as any)
      .mockResolvedValueOnce([
        {
          id: 'audit_device_1',
          action: 'offline.sale_synced',
          entityType: 'sale',
          entityId: 'sale_1',
          relatedSaleId: 'sale_1',
          staffId: 'staff_1',
          staffName: 'Cashier',
          customerId: 'cust_1',
          source: 'offline_queue',
          details: '{"deviceId":"device_1","cashSessionId":"cash_1","localReceiptNumber":"OFF-CASH1-000001"}',
          createdAt: '2026-05-26T10:05:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'stock_1',
          productId: 'prod_1',
          itemName: 'Bread',
          quantityDelta: '-1',
          previousQuantity: '10',
          newQuantity: '9',
          reason: 'sale',
          reasonCode: 'sale',
          referenceType: 'sale',
          referenceId: 'sale_1',
          saleId: 'sale_1',
          staffId: 'staff_1',
          staffName: 'Cashier',
          createdAt: '2026-05-26T10:06:00.000Z',
        },
      ]);

    const result = await getManagerActivityHistory('tenant_1', {
      deviceId: 'device_1',
      search: 'off-cash1',
      limit: 20,
    });

    expect(dbModule.query).toHaveBeenCalledTimes(2);
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(COALESCE(details'),
      expect.arrayContaining(['device_1', '%device_1%', '%off-cash1%', 20])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM stock_movements'),
      expect.arrayContaining(['device_1', 'tenant_1', '%device_1%', 'tenant_1', '%device_1%', 20])
    );
    expect(result.items[0]).toMatchObject({ kind: 'stock', saleId: 'sale_1' });
    expect(result.items[1]).toMatchObject({
      kind: 'audit',
      deviceId: 'device_1',
      registerId: 'cash_1',
      localReceiptNumber: 'OFF-CASH1-000001',
    });
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

    expect(result.filename).toMatch(/masepos-activity-\d{4}-\d{2}-\d{2}\.csv/);
    expect(result.count).toBe(1);
    expect(result.csv).toContain('"kind","createdAt","title"');
    expect(result.csv).toContain('"audit","2026-05-26T10:05:00.000Z","sale.refunded"');
    expect(result.csv).toContain('"cust_1"');
  });

  it('exports owner/accounting/compliance audit report packs with summaries and detail rows', async () => {
    (dbModule.query as any)
      .mockResolvedValueOnce([
        {
          id: 'audit_1',
          action: 'permission.denied',
          entityType: 'security',
          entityId: 'staff_1',
          relatedSaleId: null,
          staffId: 'staff_1',
          staffName: 'Cashier',
          customerId: null,
          source: 'permission',
          details: '{"attemptedAction":"manager_cash.summary_view","deviceId":"device_1"}',
          createdAt: '2026-05-26T10:05:00.000Z',
        },
        {
          id: 'audit_2',
          action: 'sale.refunded',
          entityType: 'sale',
          entityId: 'refund_1',
          relatedSaleId: 'sale_1',
          staffId: 'mgr_1',
          staffName: 'Manager',
          customerId: 'cust_1',
          source: 'history',
          details: '{"refundTotal":25,"cashSessionId":"cash_1","localReceiptNumber":"OFF-CASH1-000001"}',
          createdAt: '2026-05-26T10:06:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'stock_1',
          productId: 'prod_1',
          itemName: 'Bread',
          quantityDelta: '-2',
          previousQuantity: '10',
          newQuantity: '8',
          reason: 'sale',
          reasonCode: 'sale',
          referenceType: 'sale',
          referenceId: 'sale_1',
          saleId: 'sale_1',
          staffId: 'mgr_1',
          staffName: 'Manager',
          createdAt: '2026-05-26T10:07:00.000Z',
        },
      ]);

    const result = await getManagerAuditReport('tenant_1', {
      audience: 'compliance',
      from: '2026-05-26',
      to: '2026-05-26',
      limit: 50,
    });

    expect(result.filename).toMatch(/masepos-compliance-audit-report-\d{4}-\d{2}-\d{2}\.csv/);
    expect(result.audience).toBe('compliance');
    expect(result.count).toBe(3);
    expect(result.summary).toMatchObject({
      totalRows: 3,
      auditEvents: 2,
      stockMovements: 1,
      permissionDenied: 1,
    });
    expect(result.csv).toContain('"section","audience","generatedAt"');
    expect(result.csv).toContain('"summary","compliance"');
    expect(result.csv).toContain('"breakdown","compliance"');
    expect(result.csv).toContain('"activity","compliance"');
    expect(result.csv).toContain('"permission.denied"');
    expect(result.csv).toContain('"security access"');
    expect(result.csv).toContain('"OFF-CASH1-000001"');
    expect(result.pdfFilename).toMatch(/masepos-compliance-audit-report-\d{4}-\d{2}-\d{2}\.pdf/);
    expect(result.pdfMimeType).toBe('application/pdf');
    const pdf = Buffer.from(result.pdfBase64, 'base64').toString('latin1');
    expect(pdf).toContain('%PDF-1.4');
    expect(pdf).toContain('MasePOS compliance audit and accounting activity pack');
    expect(pdf).toContain('Permission denied: 1');
    expect(pdf).toContain('security access');
  });
});
