import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getOperationalAnalyticsReport } from '../../server/operationalReports.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('operational analytics reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates category, basket, table, tab, refund, void, and cash variance signals', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM sale_items si')) {
        return Promise.resolve([
          {
            saleId: 'sale_1',
            createdAt: '2026-06-05T08:00:00.000Z',
            saleTotal: '115.00',
            saleTaxAmount: '15.00',
            transactionType: 'sale',
            saleItemId: 'item_1',
            productName: 'Burger',
            price: '115.00',
            quantity: '1',
            category: 'Food',
          },
          {
            saleId: 'sale_2',
            createdAt: '2026-06-05T09:00:00.000Z',
            saleTotal: '46.00',
            saleTaxAmount: '6.00',
            transactionType: 'sale',
            saleItemId: 'item_2',
            productName: 'Soda',
            price: '23.00',
            quantity: '2',
            category: 'Drinks',
          },
          {
            saleId: 'refund_1',
            createdAt: '2026-06-05T11:00:00.000Z',
            saleTotal: '-115.00',
            saleTaxAmount: '-15.00',
            transactionType: 'refund',
            saleItemId: 'item_3',
            productName: 'Burger',
            price: '115.00',
            quantity: '-1',
            category: 'Food',
          },
        ]);
      }
      if (sql.includes('COUNT(si.id) AS itemLineCount')) {
        return Promise.resolve([
          {
            saleId: 'sale_1',
            createdAt: '2026-06-05T08:00:00.000Z',
            updatedAt: '2026-06-05T08:45:00.000Z',
            total: '115.00',
            taxAmount: '15.00',
            tableNumber: 'T1',
            isTab: 0,
            tabName: null,
            itemLineCount: '1',
            itemCount: '1',
          },
          {
            saleId: 'sale_2',
            createdAt: '2026-06-05T09:00:00.000Z',
            updatedAt: '2026-06-05T09:20:00.000Z',
            total: '46.00',
            taxAmount: '6.00',
            tableNumber: null,
            isTab: 0,
            tabName: null,
            itemLineCount: '1',
            itemCount: '2',
          },
          {
            saleId: 'sale_3',
            createdAt: '2026-06-05T10:00:00.000Z',
            updatedAt: '2026-06-05T11:00:00.000Z',
            total: '520.00',
            taxAmount: '67.83',
            tableNumber: 'T2',
            isTab: 0,
            tabName: null,
            itemLineCount: '2',
            itemCount: '4',
          },
        ]);
      }
      if (sql.includes('FROM restaurant_tables')) {
        return Promise.resolve([
          { id: 'table_1', label: 'T1', status: 'active' },
          { id: 'table_2', label: 'T2', status: 'active' },
          { id: 'table_3', label: 'T3', status: 'active' },
        ]);
      }
      if (sql.includes("status IN ('open','pending','kitchen')")) {
        return Promise.resolve([
          {
            id: 'tab_1',
            createdAt: '2026-06-04T08:00:00.000Z',
            updatedAt: '2026-06-04T08:10:00.000Z',
            tableNumber: 'BAR',
            tabName: 'Bar Tab 1',
            total: '300.00',
            staffId: 'staff_1',
            status: 'open',
          },
        ]);
      }
      if (sql.includes('refund_status AS refundStatus')) {
        return Promise.resolve([
          {
            id: 'refund_1',
            createdAt: '2026-06-05T11:00:00.000Z',
            total: '-115.00',
            transactionType: 'refund',
            parentSaleId: 'sale_1',
            refundStatus: 'none',
            refundedAmount: '115.00',
            refundReason: 'Returned meal',
            voidReason: null,
            staffId: 'staff_1',
            paymentMethod: 'cash',
          },
          {
            id: 'sale_1',
            createdAt: '2026-06-05T08:00:00.000Z',
            total: '115.00',
            transactionType: 'sale',
            parentSaleId: null,
            refundStatus: 'partial',
            refundedAmount: '20.00',
            refundReason: 'Partial comp',
            voidReason: null,
            staffId: 'staff_1',
            paymentMethod: 'cash',
          },
          {
            id: 'sale_void',
            createdAt: '2026-06-05T12:00:00.000Z',
            total: '46.00',
            transactionType: 'void',
            parentSaleId: null,
            refundStatus: 'none',
            refundedAmount: '0.00',
            refundReason: null,
            voidReason: 'Duplicate order',
            staffId: 'staff_2',
            paymentMethod: 'card',
          },
        ]);
      }
      if (sql.includes('FROM cash_sessions')) {
        return Promise.resolve([
          {
            id: 'cash_1',
            staffId: 'staff_1',
            staffName: 'Cashier',
            openedAt: '2026-06-05T07:30:00.000Z',
            closedAt: '2026-06-05T15:30:00.000Z',
            submittedAt: '2026-06-05T15:35:00.000Z',
            expectedCash: '100.00',
            actualCash: '95.00',
            difference: '-5.00',
            reviewStatus: 'submitted',
            varianceReason: 'Short count',
          },
          {
            id: 'cash_2',
            staffId: 'staff_2',
            staffName: 'Manager',
            openedAt: '2026-06-05T08:00:00.000Z',
            closedAt: '2026-06-05T16:00:00.000Z',
            submittedAt: '2026-06-05T16:05:00.000Z',
            expectedCash: '200.00',
            actualCash: '200.00',
            difference: '0.00',
            reviewStatus: 'reconciled',
            varianceReason: null,
          },
        ]);
      }
      if (sql.includes('FROM cash_close_checkpoints')) {
        return Promise.resolve([
          {
            id: 'eod_1',
            businessDate: '2026-06-05',
            status: 'review_needed',
            expectedPhysicalCash: '300.00',
            countedPhysicalCash: '310.00',
            variance: '10.00',
            custodyVarianceToday: '0.00',
            note: 'Safe recount needed',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const report = await getOperationalAnalyticsReport('tenant_1', {
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(report.summary).toMatchObject({
      categoryCount: 2,
      basketSegmentCount: 3,
      completedSaleCount: 3,
      tableSaleCount: 2,
      openTabCount: 1,
      refundVoidCount: 3,
      cashVarianceCount: 3,
      cashAbsoluteVariance: 15,
    });
    expect(report.categoryPerformance).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Drinks', saleCount: 1, quantity: 2, revenue: 40 }),
      expect.objectContaining({ label: 'Food', saleCount: 2, quantity: 0, revenue: 0 }),
    ]));
    expect(report.basketSegments).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Under R100', saleCount: 1, averageBasket: 46, averageItems: 2 }),
      expect.objectContaining({ label: 'R100 - R249', saleCount: 1, averageBasket: 115, averageItems: 1 }),
      expect.objectContaining({ label: 'R500+', saleCount: 1, averageBasket: 520, averageItems: 4 }),
    ]));
    expect(report.tableTurnoverSummary).toMatchObject({
      activeTableCount: 3,
      tableSaleCount: 2,
      turnoverPerTable: 0.67,
    });
    expect(report.tableTurnoverRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ tableNumber: 'T1', saleCount: 1, averageDurationMinutes: 45 }),
      expect.objectContaining({ tableNumber: 'T2', saleCount: 1, averageDurationMinutes: 60 }),
      expect.objectContaining({ tableNumber: 'T3', saleCount: 0 }),
    ]));
    expect(report.openTabAging).toMatchObject({
      count: 1,
      totalValue: 300,
    });
    expect(report.openTabAging.rows[0]).toMatchObject({
      saleId: 'tab_1',
      tabName: 'Bar Tab 1',
      ageBucket: 'Over 4h',
    });
    expect(report.refundVoidSummary).toEqual({
      refundCount: 2,
      voidCount: 1,
      refundAmount: 135,
      voidAmount: 46,
    });
    expect(report.cashVarianceSummary).toEqual({
      count: 3,
      netVariance: 5,
      absoluteVariance: 15,
      unresolvedCount: 2,
    });
    expect(report.cashVarianceTrend[0]).toMatchObject({
      label: '2026-06-05',
      registerVariance: -5,
      closeVariance: 10,
      netVariance: 5,
      absoluteVariance: 15,
      count: 3,
    });
    expect(report.csv).toContain('"category_performance"');
    expect(report.csv).toContain('"open_tab_aging"');
    expect(report.csv).toContain('"cash_variance"');
    expect(Buffer.from(report.pdfBase64, 'base64').toString('latin1')).toContain('%PDF-1.4');
  });
});
