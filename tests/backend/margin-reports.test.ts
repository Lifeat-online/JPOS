import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getMarginReport } from '../../server/marginReports.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('margin reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates margin by product, category, staff, payment method, and period', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM sale_items si')) {
        return Promise.resolve([
          {
            saleId: 'sale_1',
            createdAt: '2026-06-05T08:00:00.000Z',
            transactionType: 'sale',
            saleTotal: '115.00',
            saleTaxAmount: '15.00',
            salePaymentMethod: 'cash',
            staffId: 'staff_1',
            staffName: 'Cashier',
            saleItemId: 'item_1',
            productId: 'prod_burger',
            productName: 'Burger',
            price: '115.00',
            quantity: '1',
            category: 'Food',
            section: 'Restaurant',
            costPrice: '60.00',
          },
          {
            saleId: 'sale_2',
            createdAt: '2026-06-05T09:00:00.000Z',
            transactionType: 'sale',
            saleTotal: '46.00',
            saleTaxAmount: '6.00',
            salePaymentMethod: 'card',
            staffId: 'staff_2',
            staffName: 'Manager',
            saleItemId: 'item_2',
            productId: 'prod_soda',
            productName: 'Soda',
            price: '23.00',
            quantity: '2',
            category: 'Drinks',
            section: 'Restaurant',
            costPrice: '10.00',
          },
        ]);
      }
      if (sql.includes('LEFT JOIN sale_payments')) {
        return Promise.resolve([
          { saleId: 'sale_1', salePaymentMethod: 'cash', saleTotal: '115.00', paymentMethod: 'cash', amount: '115.00' },
          { saleId: 'sale_2', salePaymentMethod: 'card', saleTotal: '46.00', paymentMethod: 'card', amount: '23.00' },
          { saleId: 'sale_2', salePaymentMethod: 'card', saleTotal: '46.00', paymentMethod: 'wallet', amount: '23.00' },
        ]);
      }
      return Promise.resolve([]);
    });

    const report = await getMarginReport('tenant_1', {
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(report.summary).toMatchObject({
      revenue: 140,
      cost: 80,
      grossProfit: 60,
      quantity: 3,
      saleCount: 2,
      productCount: 2,
      categoryCount: 2,
      staffCount: 2,
      paymentMethodCount: 3,
      missingCostCount: 0,
    });
    expect(report.summary.grossMarginPercent).toBeCloseTo(42.86, 2);
    expect(report.productRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Burger', revenue: 100, cost: 60, grossProfit: 40, grossMarginPercent: 40 }),
      expect.objectContaining({ label: 'Soda', revenue: 40, cost: 20, grossProfit: 20, grossMarginPercent: 50 }),
    ]));
    expect(report.categoryRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Food', grossProfit: 40 }),
      expect.objectContaining({ label: 'Drinks', grossProfit: 20 }),
    ]));
    expect(report.staffRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Cashier', grossProfit: 40 }),
      expect.objectContaining({ label: 'Manager', grossProfit: 20 }),
    ]));
    expect(report.paymentMethodRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'cash', revenue: 100, grossProfit: 40 }),
      expect.objectContaining({ label: 'card', revenue: 20, grossProfit: 10 }),
      expect.objectContaining({ label: 'wallet', revenue: 20, grossProfit: 10 }),
    ]));
    expect(report.periodRows[0]).toMatchObject({ label: '2026-06-05', revenue: 140, grossProfit: 60 });
    expect(report.csv).toContain('"payment_method"');
    expect(report.csv).toContain('"Burger"');
    expect(Buffer.from(report.pdfBase64, 'base64').toString('latin1')).toContain('%PDF-1.4');
  });
});
