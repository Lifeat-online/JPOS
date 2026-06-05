import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getPaymentProviderReconciliationReport } from '../../server/paymentReports.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('payment provider reconciliation reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports provider reconciliation summaries without card PAN or CVV data', async () => {
    (dbModule.query as any).mockResolvedValueOnce([
      {
        saleId: 'sale_card_1',
        createdAt: '2026-06-04T08:00:00.000Z',
        saleStatus: 'completed',
        paymentMethod: 'card',
        saleTotal: '120.00',
        customerId: 'cust_1',
        customerName: 'Regular Customer',
        staffId: 'staff_1',
        staffName: 'Cashier',
        tableNumber: 'T1',
        paymentId: 'pay_card_1',
        method: 'card',
        amount: '120.00',
        provider: 'yoco',
        providerDeviceId: 'Yoco-Front-01',
        providerReference: 'YOCO-REF-1',
        authorizationCode: 'AUTH-1',
        providerStatus: 'settled',
        providerNote: 'Batch matched',
        pan: '4111111111111111',
        cvv: '123',
      },
      {
        saleId: 'sale_bnpl_1',
        createdAt: '2026-06-04T09:00:00.000Z',
        saleStatus: 'completed',
        paymentMethod: 'bnpl',
        paymentId: 'pay_bnpl_1',
        method: 'bnpl',
        amount: '500.00',
        provider: 'payflex',
        providerReference: 'PF-ORDER-1',
        providerStatus: 'pending',
      },
      {
        saleId: 'sale_payfast_1',
        createdAt: '2026-06-04T10:00:00.000Z',
        saleStatus: 'completed',
        paymentMethod: 'payfast',
        paymentId: 'pay_payfast_1',
        method: 'payfast',
        amount: '240.00',
        providerReference: 'PFST-1',
        providerStatus: 'confirmed',
      },
    ]);

    const report = await getPaymentProviderReconciliationReport('tenant_1', {
      from: '2026-06-04',
      to: '2026-06-04',
      limit: 25,
    });

    const sql = String((dbModule.query as any).mock.calls[0][0]);
    expect(sql).toContain("sp.method IN ('card', 'payfast', 'qr', 'bnpl')");
    expect(sql).not.toMatch(/pan|cvv|cvc|card_number|track/i);
    expect(report.summary).toMatchObject({
      paymentCount: 3,
      totalAmount: 860,
      matchedCount: 2,
      needsReviewCount: 1,
      exceptionCount: 0,
      cardCount: 1,
      payfastCount: 1,
      bnplCount: 1,
    });
    expect(report.providerBreakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'yoco', count: 1, amount: 120 }),
      expect.objectContaining({ label: 'payflex', count: 1, amount: 500 }),
      expect.objectContaining({ label: 'payfast', count: 1, amount: 240 }),
    ]));
    expect(report.payments[0]).toMatchObject({
      provider: 'yoco',
      providerDeviceId: 'Yoco-Front-01',
      providerReference: 'YOCO-REF-1',
      authorizationCode: 'AUTH-1',
      reviewState: 'matched',
    });
    expect(report.payments[0]).not.toHaveProperty('pan');
    expect(report.payments[0]).not.toHaveProperty('cvv');
    expect(report.csv).toContain('"pciBoundary"');
    expect(report.csv).toContain('"No PAN/CVV exported"');
    expect(report.csv).toContain('"YOCO-REF-1"');
    expect(report.csv).not.toContain('4111111111111111');
    expect(report.csv).not.toContain('"123"');
    expect(report.pciBoundary).toMatchObject({ storedSensitiveCardData: false });
    expect(report.pciBoundary.excludedFields).toEqual(expect.arrayContaining(['pan', 'cvv', 'card_number']));
    expect(Buffer.from(report.pdfBase64, 'base64').toString('latin1')).toContain('%PDF-1.4');
  });
});
