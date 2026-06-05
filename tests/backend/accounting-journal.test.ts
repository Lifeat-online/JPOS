import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getAccountingJournalReport } from '../../server/accountingJournal.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('accounting journal export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds balanced double-entry journal lines with future accounting target mappings', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('LEFT JOIN customers')) {
        return Promise.resolve([
          {
            saleId: 'sale_1',
            createdAt: '2026-06-05T08:00:00.000Z',
            transactionType: 'sale',
            parentSaleId: null,
            subtotal: '100.00',
            taxAmount: '15.00',
            total: '115.00',
            paymentMethod: 'cash',
            customerId: 'cust_1',
            customerName: 'Customer One',
            staffId: 'staff_1',
            staffName: 'Cashier',
          },
          {
            saleId: 'refund_1',
            createdAt: '2026-06-05T09:00:00.000Z',
            transactionType: 'refund',
            parentSaleId: 'sale_2',
            subtotal: '-40.00',
            taxAmount: '-6.00',
            total: '-46.00',
            paymentMethod: 'card',
            customerId: 'cust_2',
            customerName: 'Customer Two',
            staffId: 'staff_2',
            staffName: 'Manager',
          },
        ]);
      }
      if (sql.includes('LEFT JOIN sale_payments')) {
        return Promise.resolve([
          {
            saleId: 'sale_1',
            salePaymentMethod: 'cash',
            paymentId: 'pay_1',
            method: 'cash',
            amount: '115.00',
            provider: null,
            providerReference: null,
            authorizationCode: null,
          },
          {
            saleId: 'refund_1',
            salePaymentMethod: 'card',
            paymentId: 'pay_2',
            method: 'card',
            amount: '-46.00',
            provider: 'yoco',
            providerReference: 'card_refund_1',
            authorizationCode: 'AUTH-REF',
          },
        ]);
      }
      if (sql.includes('FROM sale_items si')) {
        return Promise.resolve([
          {
            saleId: 'sale_1',
            createdAt: '2026-06-05T08:00:00.000Z',
            saleItemId: 'item_1',
            productId: 'prod_burger',
            productName: 'Burger',
            quantity: '1',
            costPrice: '60.00',
          },
          {
            saleId: 'refund_1',
            createdAt: '2026-06-05T09:00:00.000Z',
            saleItemId: 'item_2',
            productId: 'prod_soda',
            productName: 'Soda',
            quantity: '-2',
            costPrice: '10.00',
          },
        ]);
      }
      if (sql.includes('FROM cash_sessions')) {
        return Promise.resolve([
          {
            id: 'cash_1',
            staffId: 'staff_1',
            staffName: 'Cashier',
            postedAt: '2026-06-05T16:00:00.000Z',
            expectedCash: '100.00',
            actualCash: '95.00',
            difference: '-5.00',
            varianceReason: 'Short count',
            reviewStatus: 'submitted',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const report = await getAccountingJournalReport('tenant_1', {
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(report.summary).toMatchObject({
      entryCount: 3,
      lineCount: 12,
      salesCount: 1,
      refundCount: 1,
      paymentLineCount: 2,
      cogsLineCount: 4,
      cashVarianceLineCount: 2,
      missingCostLineCount: 0,
      totalDebits: 246,
      totalCredits: 246,
      outOfBalance: 0,
      balanced: true,
    });
    expect(report.journalLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: 'SALE-sale_1', accountCode: '1000', debit: 115, credit: 0 }),
      expect.objectContaining({ reference: 'SALE-sale_1', accountCode: '4000', debit: 0, credit: 100 }),
      expect.objectContaining({ reference: 'SALE-sale_1', accountCode: '2200', debit: 0, credit: 15 }),
      expect.objectContaining({ reference: 'SALE-sale_1', accountCode: '5000', debit: 60, credit: 0 }),
      expect.objectContaining({ reference: 'SALE-sale_1', accountCode: '1300', debit: 0, credit: 60 }),
      expect.objectContaining({ reference: 'REFUND-refund_1', accountCode: '1010', debit: 0, credit: 46 }),
      expect.objectContaining({ reference: 'REFUND-refund_1', accountCode: '4000', debit: 40, credit: 0 }),
      expect.objectContaining({ reference: 'REFUND-refund_1', accountCode: '2200', debit: 6, credit: 0 }),
      expect.objectContaining({ reference: 'REFUND-refund_1', accountCode: '5000', debit: 0, credit: 20 }),
      expect.objectContaining({ reference: 'REFUND-refund_1', accountCode: '1300', debit: 20, credit: 0 }),
      expect.objectContaining({ reference: 'CASH-VARIANCE-cash_1', accountCode: '1000', debit: 0, credit: 5 }),
      expect.objectContaining({ reference: 'CASH-VARIANCE-cash_1', accountCode: '5900', debit: 5, credit: 0 }),
    ]));
    expect(report.accountMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'salesRevenue', code: '4000' }),
      expect.objectContaining({ key: 'vatOutput', code: '2200' }),
      expect.objectContaining({ key: 'inventory', code: '1300' }),
    ]));
    expect(report.integrationTargets.map(target => target.id)).toEqual(['sage', 'xero', 'quickbooks']);
    expect(report.integrationTargets.every(target => target.status === 'export_ready')).toBe(true);
    expect(report.targetExports.map(target => target.targetId)).toEqual(['sage', 'xero', 'quickbooks']);
    expect(report.targetExports).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetId: 'sage',
        filename: 'jimmy-pos-sage-journal-2026-06-01-2026-06-30.csv',
        lineCount: 12,
        csv: expect.stringContaining('"Date","Reference","Description","Account Code","Debit","Credit","Tax Type"'),
      }),
      expect.objectContaining({
        targetId: 'xero',
        filename: 'jimmy-pos-xero-journal-2026-06-01-2026-06-30.csv',
        lineCount: 12,
        csv: expect.stringContaining('"Narration","Date","Description","AccountCode","TaxType","LineAmount"'),
      }),
      expect.objectContaining({
        targetId: 'quickbooks',
        filename: 'jimmy-pos-quickbooks-journal-2026-06-01-2026-06-30.csv',
        lineCount: 12,
        csv: expect.stringContaining('"Journal No","Journal Date","Account","Debits","Credits"'),
      }),
    ]));
    expect(report.csv).toContain('"entryDate","entryId","sourceType"');
    expect(report.csv).toContain('"quickBooksReference"');
    expect(Buffer.from(report.pdfBase64, 'base64').toString('latin1')).toContain('%PDF-1.4');
  });
});
