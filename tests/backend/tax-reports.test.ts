import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import * as auditModule from '../../server/audit.js';
import { assertSaleNotInLockedTaxPeriod, getVatTaxReport, lockTaxPeriod } from '../../server/taxReports.js';

vi.mock('../../server/db.js', () => ({
  getConnection: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../../server/audit.js', () => ({
  recordAuditEvent: vi.fn(),
}));

describe('tax reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auditModule.recordAuditEvent as any).mockResolvedValue('audit_1');
  });

  it('builds SARS VAT output-tax packs from completed sales and refund credit notes', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM sales s')) {
        return Promise.resolve([
          {
            saleId: 'sale_1',
            createdAt: '2026-06-05T08:00:00.000Z',
            status: 'completed',
            transactionType: 'sale',
            paymentMethod: 'cash',
            subtotal: '100.00',
            taxAmount: '15.00',
            taxRate: '15.00',
            taxInclusive: 1,
            total: '115.00',
            customerName: 'Tax Customer',
            staffName: 'Cashier',
            itemCount: 2,
            unitCount: 2,
          },
          {
            saleId: 'refund_1',
            parentSaleId: 'sale_1',
            createdAt: '2026-06-06T08:00:00.000Z',
            status: 'completed',
            transactionType: 'refund',
            paymentMethod: 'cash',
            subtotal: '-20.00',
            taxAmount: '-3.00',
            taxRate: '15.00',
            taxInclusive: 1,
            total: '-23.00',
            customerName: 'Tax Customer',
            staffName: 'Manager',
            itemCount: 1,
            unitCount: 1,
          },
          {
            saleId: 'sale_zero',
            createdAt: '2026-06-07T08:00:00.000Z',
            status: 'completed',
            transactionType: 'sale',
            paymentMethod: 'card',
            subtotal: '50.00',
            taxAmount: '0.00',
            taxRate: '0.00',
            taxInclusive: 0,
            total: '50.00',
            itemCount: 1,
            unitCount: 1,
          },
        ]);
      }
      if (sql.includes('FROM tax_periods')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const report = await getVatTaxReport('tenant_1', {
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(report.summary).toMatchObject({
      invoiceCount: 3,
      refundCount: 1,
      grossSales: 142,
      taxableSales: 92,
      zeroRatedSales: 50,
      outputTax: 12,
      inputTax: 0,
      netVatPayable: 12,
    });
    expect(report.vat201Fields).toMatchObject({
      field1StandardRatedSupplies: 92,
      field4OutputTax: 12,
      field19TotalInputTax: 0,
    });
    expect(report.invoices[1]).toMatchObject({
      taxInvoiceNumber: 'refund_1',
      transactionType: 'refund',
      parentSaleId: 'sale_1',
      taxAmount: -3,
    });
    expect(report.csv).toContain('vat201Field4OutputTax');
    expect(report.csv).toContain('SARS VAT201 output-tax support pack');
    expect(Buffer.from(report.pdfBase64, 'base64').toString('latin1')).toContain('%PDF-1.4');
  });

  it('locks a tax period with a stored snapshot and audit event', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM sales s')) {
        return Promise.resolve([
          {
            saleId: 'sale_1',
            createdAt: '2026-06-05T08:00:00.000Z',
            status: 'completed',
            transactionType: 'sale',
            paymentMethod: 'cash',
            subtotal: '100.00',
            taxAmount: '15.00',
            taxRate: '15.00',
            taxInclusive: 1,
            total: '115.00',
            itemCount: 1,
            unitCount: 1,
          },
        ]);
      }
      if (sql.includes('FROM tax_periods') && sql.includes('ORDER BY period_end')) {
        return Promise.resolve([
          {
            id: 'tax_period_inserted',
            tenantId: 'tenant_1',
            periodStart: '2026-06-01 00:00:00',
            periodEnd: '2026-06-30 23:59:59',
            status: 'locked',
            grossSales: '115.00',
            taxableSales: '115.00',
            outputTax: '15.00',
            inputTax: '0.00',
            netVatPayable: '15.00',
            invoiceCount: 1,
            refundCount: 0,
          },
        ]);
      }
      if (sql.includes('FROM tax_periods')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM tax_periods')) return Promise.resolve([[]]);
        return Promise.resolve([[]]);
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    const result = await lockTaxPeriod('tenant_1', {
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      note: 'June VAT submitted',
    }, { staffId: 'mgr_1', staffName: 'Manager' });

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tax_periods'),
      expect.arrayContaining(['tenant_1', '2026-06-01 00:00:00', '2026-06-30 23:59:59', 'mgr_1', 'Manager', 'June VAT submitted', 15, 115, 115, 0, 0, 15, 0, 15, 1, 0])
    );
    expect(auditModule.recordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'tax_period.locked',
      entityType: 'tax_period',
      staffId: 'mgr_1',
    }));
    expect(conn.commit).toHaveBeenCalled();
    expect(result.period).toMatchObject({ status: 'locked', outputTax: 15 });
  });

  it('rejects sale edits inside a locked tax period', async () => {
    const conn = {
      query: vi.fn().mockResolvedValue([[{
        id: 'tax_period_1',
        periodStart: '2026-06-01 00:00:00',
        periodEnd: '2026-06-30 23:59:59',
      }]]),
    };

    await expect(assertSaleNotInLockedTaxPeriod(conn, 'tenant_1', 'sale_1', 'update sale'))
      .rejects.toThrow(/tax period .* is locked/i);
  });
});
