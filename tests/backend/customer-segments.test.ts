import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { buildCustomerCampaignRows, getCustomerCampaignExport } from '../../server/customerSegments.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('customer campaign segmentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies VIP, at-risk, no-purchase, wallet, account, and contactable cohorts', () => {
    const now = new Date('2026-06-05T12:00:00.000Z');
    const rows = buildCustomerCampaignRows([
      {
        id: 'cust_vip',
        name: 'VIP Customer',
        email: 'vip@example.com',
        phone: '',
        loyaltyPoints: 300,
        loyaltyMemberStatus: 'active',
        accountEnabled: 1,
        accountBalance: 150,
        walletBalance: 25,
        discountPercent: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'cust_at_risk',
        name: 'At Risk Customer',
        email: '',
        phone: '0821234567',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'cust_empty',
        name: 'No Purchase',
        email: '',
        phone: '',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ], [
      { id: 'sale_1', customerId: 'cust_vip', total: 650, paymentMethod: 'card', createdAt: '2026-06-01T10:00:00.000Z' },
      { id: 'sale_2', customerId: 'cust_vip', total: 550, paymentMethod: 'card', createdAt: '2026-06-02T10:00:00.000Z' },
      { id: 'sale_3', customerId: 'cust_at_risk', total: 80, paymentMethod: 'cash', createdAt: '2026-04-15T10:00:00.000Z' },
    ], now);

    const vip = rows.find(row => row.customerId === 'cust_vip');
    const atRisk = rows.find(row => row.customerId === 'cust_at_risk');
    const empty = rows.find(row => row.customerId === 'cust_empty');

    expect(vip).toMatchObject({
      primarySegment: 'vip',
      totalSpend: 1200,
      orderCount: 2,
      preferredChannel: 'email',
      contactable: true,
    });
    expect(vip?.segmentTags).toEqual(expect.arrayContaining(['vip', 'recent', 'loyalty_active', 'account_customer', 'wallet_credit', 'discount_customer', 'contactable']));
    expect(atRisk).toMatchObject({
      primarySegment: 'at_risk',
      preferredChannel: 'sms',
      daysSinceLastPurchase: 51,
    });
    expect(empty).toMatchObject({
      primarySegment: 'no_purchase',
      contactable: false,
      campaignEligible: false,
      orderCount: 0,
    });
    expect(empty?.segmentTags).toEqual(expect.arrayContaining(['no_purchase', 'new_profile']));
  });

  it('returns filtered campaign-ready CSV exports with segment summary counts', async () => {
    (dbModule.query as any)
      .mockResolvedValueOnce([
        {
          id: 'cust_vip',
          name: 'VIP Customer',
          email: 'vip@example.com',
          phone: null,
          loyaltyPoints: 120,
          loyaltyMemberStatus: 'active',
          walletBalance: 0,
          accountEnabled: 0,
          accountBalance: 0,
          discountPercent: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'cust_empty',
          name: 'No Purchase',
          email: null,
          phone: null,
          loyaltyPoints: 0,
          loyaltyMemberStatus: 'active',
          walletBalance: 0,
          accountEnabled: 0,
          accountBalance: 0,
          discountPercent: 0,
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        { id: 'sale_1', customerId: 'cust_vip', total: '600', paymentMethod: 'card', createdAt: '2026-06-01T10:00:00.000Z' },
        { id: 'sale_2', customerId: 'cust_vip', total: '500', paymentMethod: 'card', createdAt: '2026-06-02T10:00:00.000Z' },
      ])
      .mockResolvedValueOnce([
        { customerId: 'cust_vip', consentType: 'marketing', status: 'granted', source: 'customer_profile' },
        { customerId: 'cust_vip', consentType: 'stored_contact_details', status: 'granted', source: 'customer_profile' },
      ]);

    const report = await getCustomerCampaignExport('tenant_1', { segment: 'vip' });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM customers'),
      ['tenant_1']
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM sales'),
      ['tenant_1']
    );
    expect(report).toMatchObject({
      segment: 'vip',
      count: 1,
      totalCustomers: 2,
      contactableCount: 1,
      campaignReadyCount: 1,
    });
    expect(report.summary).toEqual(expect.arrayContaining([
      expect.objectContaining({ segment: 'vip', count: 1 }),
      expect.objectContaining({ segment: 'no_purchase', count: 1 }),
    ]));
    expect(report.csv).toContain('"primary_segment"');
    expect(report.csv).toContain('"campaign_eligible"');
    expect(report.csv).toContain('"VIP Customer"');
    expect(report.rows[0].campaignEligible).toBe(true);
    expect(report.csv).not.toContain('"No Purchase"');
    expect(report.consentNote).toContain('Campaign-ready');
  });
});
