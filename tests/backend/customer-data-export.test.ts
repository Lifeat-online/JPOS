import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getCustomerDataExport } from '../../server/customerDataExport.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('customer data export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a downloadable customer data package with profile, consent, sale, payout, and lay-by history', async () => {
    (dbModule.query as any)
      .mockResolvedValueOnce([{
        id: 'cust_1',
        tenantId: 'tenant_1',
        name: 'Export Customer',
        email: 'export@example.test',
        phone: '0821234567',
        loyaltyPoints: 42,
        loyaltyMemberStatus: 'active',
        walletBalance: '25.50',
        accountEnabled: 1,
        accountLimit: '500.00',
        accountBalance: '120.00',
        discountPercent: '5.00',
        createdAt: '2026-06-01T00:00:00.000Z',
      }])
      .mockResolvedValueOnce([
        { consentType: 'marketing', status: 'granted', source: 'customer_profile' },
        { consentType: 'stored_contact_details', status: 'granted', source: 'customer_profile' },
      ])
      .mockResolvedValueOnce([{
        id: 'sale_1',
        staffId: 'staff_1',
        total: '150.00',
        subtotal: '140.00',
        taxAmount: '10.00',
        taxRate: '15.00',
        paymentMethod: 'card',
        status: 'completed',
        transactionType: 'sale',
        createdAt: '2026-06-05T10:00:00.000Z',
      }])
      .mockResolvedValueOnce([{
        id: 'item_1',
        saleId: 'sale_1',
        productId: 'prod_1',
        productName: 'Coffee',
        price: '50.00',
        quantity: 3,
        status: 'delivered',
      }])
      .mockResolvedValueOnce([{
        id: 'pay_1',
        saleId: 'sale_1',
        method: 'card',
        amount: '150.00',
        provider: 'yoco',
        providerDeviceId: 'front-terminal',
        providerReference: 'YOCO-123',
        providerStatus: 'approved',
      }])
      .mockResolvedValueOnce([{
        id: 'payout_1',
        amount: '25.00',
        status: 'paid',
        createdAt: '2026-06-03T10:00:00.000Z',
      }])
      .mockResolvedValueOnce([{
        id: 'layby_1',
        status: 'active',
        totalAmount: '200.00',
        amountPaid: '50.00',
        balanceDue: '150.00',
      }]);

    const report = await getCustomerDataExport('tenant_1', 'cust_1');

    expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('FROM customers'), ['tenant_1', 'cust_1']);
    expect(dbModule.query).toHaveBeenCalledWith(expect.stringContaining('FROM sales'), ['tenant_1', 'cust_1']);
    expect(report).toMatchObject({
      tenantId: 'tenant_1',
      customerId: 'cust_1',
      exportType: 'customer_data',
      mimeType: 'application/json;charset=utf-8',
      summary: {
        saleCount: 1,
        completedSaleCount: 1,
        completedSalesTotal: 150,
        walletBalance: 25.5,
        accountBalance: 120,
        payoutRequestCount: 1,
        laybyCount: 1,
      },
    });
    expect(report.summary.consentStatuses.marketing).toBe('granted');
    expect(report.data.sales[0].items[0]).toMatchObject({ productName: 'Coffee', quantity: 3 });
    expect(report.data.sales[0].payments[0]).toMatchObject({ provider: 'yoco', providerReference: 'YOCO-123' });
    expect(report.filename).toContain('export-customer-customer-data-');
    expect(report.fileContents).toContain('"Export Customer"');
    expect(report.fileContents).toContain('"consents"');
  });

  it('throws a clear error when the customer does not exist', async () => {
    (dbModule.query as any).mockResolvedValueOnce([]);

    await expect(getCustomerDataExport('tenant_1', 'missing')).rejects.toThrow('Customer not found.');
  });
});
