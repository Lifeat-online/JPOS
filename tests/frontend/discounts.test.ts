import { describe, expect, it } from 'vitest';
import { getApplicablePricingDiscount } from '../../src/utils/discounts';
import type { AppConfig, Customer } from '../../src/types';

const config: AppConfig = {
  payfastMerchantId: '',
  payfastMerchantKey: '',
  payfastPassphrase: '',
  payfastSandbox: true,
  business: {
    name: 'Demo',
    roleDiscounts: { cashier: 25 },
    happyHourDiscounts: [
      { id: 'hh_1', name: 'Happy hour', enabled: true, discountPercent: 15, days: [5], startTime: '17:00', endTime: '19:00' },
    ],
  },
};

describe('pricing discounts', () => {
  it('uses the best applicable staff role or happy hour discount', () => {
    const customer: Customer = {
      id: 'staff:1',
      name: 'Staff Buyer',
      email: 'staff@example.com',
      profileType: 'staff',
      staffRole: 'cashier',
    };

    const discount = getApplicablePricingDiscount(200, customer, config, new Date('2026-05-22T18:00:00'));

    expect(discount).toMatchObject({ amount: 50, percent: 25, source: 'role' });
  });

  it('lets an individual discount override smaller role rules', () => {
    const customer: Customer = {
      id: 'cust_1',
      name: 'Regular',
      email: 'client@example.com',
      discountPercent: 30,
    };

    const discount = getApplicablePricingDiscount(100, customer, config, new Date('2026-05-22T18:00:00'));

    expect(discount).toMatchObject({ amount: 30, percent: 30, source: 'individual' });
  });
});
