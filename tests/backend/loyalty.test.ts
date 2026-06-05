import { describe, expect, it, vi } from 'vitest';
import { calculateLoyaltyAward } from '../../server/loyalty.js';

function loyaltyRunner(options: {
  business?: Record<string, any> | null;
  customer?: Record<string, any> | null;
  tiers?: Record<string, any>[];
  rules?: Record<string, any>[];
}) {
  return {
    query: vi.fn((sql: string) => {
      if (sql.includes('FROM app_settings')) {
        return Promise.resolve([[{ business: JSON.stringify(options.business ?? { enableLoyalty: true, pointsEarnedPerCurrency: 10 }) }]]);
      }
      if (sql.includes('FROM customers')) {
        return Promise.resolve(options.customer ? [[options.customer]] : [[]]);
      }
      if (sql.includes('FROM loyalty_tiers')) {
        return Promise.resolve([options.tiers ?? []]);
      }
      if (sql.includes('FROM loyalty_reward_rules')) {
        return Promise.resolve([options.rules ?? []]);
      }
      return Promise.resolve([[]]);
    }),
  };
}

describe('loyalty awards', () => {
  it('earns tier-multiplied base points plus targeted reward-rule points', async () => {
    const db = loyaltyRunner({
      customer: {
        id: 'cust_1',
        loyalty_points: 120,
        loyalty_member_status: 'active',
        loyalty_tier_id: null,
      },
      tiers: [
        { id: 'tier_gold', name: 'Gold', status: 'active', min_points: 100, earn_multiplier: 2 },
        { id: 'tier_base', name: 'Base', status: 'active', min_points: 0, earn_multiplier: 1 },
      ],
      rules: [{
        id: 'rule_coffee',
        name: 'Coffee bonus',
        status: 'active',
        rule_type: 'category',
        points_per_currency: 10,
        multiplier: 3,
        bonus_points: 5,
        min_subtotal: 0,
        starts_at: '2026-01-01T00:00:00.000Z',
        ends_at: '2026-12-31T23:59:59.000Z',
        target_product_ids: '[]',
        target_categories: JSON.stringify(['Coffee']),
        days_of_week: JSON.stringify([5]),
      }],
    });

    const result = await calculateLoyaltyAward(db, 'tenant_1', {
      customerId: 'cust_1',
      subtotal: 100,
      total: 100,
      pointsRedeemed: 30,
      now: '2026-06-05T10:00:00.000Z',
      items: [
        { productId: 'prod_latte', name: 'Latte', category: 'Coffee', price: 30, quantity: 2 },
        { productId: 'prod_muffin', name: 'Muffin', category: 'Bakery', price: 40, quantity: 1 },
      ],
    });

    expect(result).toMatchObject({
      enabled: true,
      customerFound: true,
      memberStatus: 'active',
      previousPoints: 120,
      pointsRedeemed: 30,
      pointsEarned: 43,
      nextPoints: 133,
      tier: { id: 'tier_gold', name: 'Gold' },
    });
    expect(result.matchedRules).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'base', points: 20 }),
      expect.objectContaining({ id: 'rule_coffee', points: 23 }),
    ]));
  });

  it('does not earn or redeem points for paused members', async () => {
    const db = loyaltyRunner({
      customer: {
        id: 'cust_paused',
        loyalty_points: 75,
        loyalty_member_status: 'paused',
        loyalty_tier_id: null,
      },
      tiers: [{ id: 'tier_base', name: 'Base', status: 'active', min_points: 0, earn_multiplier: 1 }],
      rules: [],
    });

    const result = await calculateLoyaltyAward(db, 'tenant_1', {
      customerId: 'cust_paused',
      subtotal: 100,
      total: 100,
      pointsRedeemed: 25,
      now: '2026-06-05T10:00:00.000Z',
      items: [{ productId: 'prod_1', name: 'Item', category: 'Retail', price: 100, quantity: 1 }],
    });

    expect(result).toMatchObject({
      enabled: true,
      customerFound: true,
      memberStatus: 'paused',
      previousPoints: 75,
      pointsRedeemed: 0,
      pointsEarned: 0,
      nextPoints: 75,
    });
    expect(db.query).not.toHaveBeenCalledWith(expect.stringContaining('FROM loyalty_tiers'), expect.anything());
  });

  it('returns disabled when the tenant loyalty feature is off', async () => {
    const db = loyaltyRunner({
      business: { enableLoyalty: false, pointsEarnedPerCurrency: 10 },
      customer: {
        id: 'cust_1',
        loyalty_points: 50,
        loyalty_member_status: 'active',
        loyalty_tier_id: null,
      },
    });

    const result = await calculateLoyaltyAward(db, 'tenant_1', {
      customerId: 'cust_1',
      subtotal: 100,
      total: 100,
      items: [{ productId: 'prod_1', name: 'Item', price: 100, quantity: 1 }],
    });

    expect(result).toMatchObject({
      enabled: false,
      customerFound: false,
      pointsEarned: 0,
      nextPoints: 0,
    });
    expect(result.reason).toContain('disabled');
  });
});
