import { describe, expect, it, vi } from 'vitest';
import { recordPromotionRedemption, validatePromotionForSale, type PromotionValidationResult } from '../../server/promotions.js';

function promotionRow(overrides: Record<string, any> = {}) {
  return {
    id: 'promo_1',
    tenant_id: 'tenant_1',
    code: 'SAVE10',
    name: 'Save ten',
    status: 'active',
    discount_type: 'percent',
    discount_value: 10,
    starts_at: '2026-01-01T00:00:00.000Z',
    ends_at: '2026-12-31T23:59:59.000Z',
    min_subtotal: 0,
    max_discount_amount: null,
    applies_to: 'cart',
    target_product_ids: '[]',
    target_categories: '[]',
    customer_scope: 'all',
    target_customer_ids: '[]',
    total_redemption_limit: null,
    per_customer_limit: null,
    redemption_count: 0,
    ...overrides,
  };
}

function runner(row: Record<string, any>, customerRedemptions = 0) {
  return {
    query: vi.fn((sql: string) => {
      if (sql.includes('FROM promotions')) return Promise.resolve([[row]]);
      if (sql.includes('FROM promotion_redemptions')) return Promise.resolve([[{ count: customerRedemptions }]]);
      return Promise.resolve([[]]);
    }),
  };
}

describe('promotions engine', () => {
  it('validates active category and selected-customer promotions', async () => {
    const db = runner(promotionRow({
      applies_to: 'categories',
      target_categories: JSON.stringify(['Coffee']),
      customer_scope: 'selected',
      target_customer_ids: JSON.stringify(['cust_1']),
      total_redemption_limit: 5,
      per_customer_limit: 2,
      redemption_count: 1,
    }));

    const result = await validatePromotionForSale(db, 'tenant_1', {
      code: ' save10 ',
      customerId: 'cust_1',
      subtotal: 100,
      promotionDiscount: 8,
      now: '2026-06-05T10:00:00.000Z',
      items: [
        { productId: 'prod_coffee', name: 'Latte', category: 'Coffee', price: 40, quantity: 2 },
        { productId: 'prod_food', name: 'Muffin', category: 'Bakery', price: 20, quantity: 1 },
      ],
    }, { assertClientDiscount: true });

    expect(result).toMatchObject({
      valid: true,
      discountAmount: 8,
      targetSubtotal: 80,
    });
  });

  it('rejects expired promotions before discounting', async () => {
    const db = runner(promotionRow({ ends_at: '2026-01-31T23:59:59.000Z' }));

    const result = await validatePromotionForSale(db, 'tenant_1', {
      code: 'SAVE10',
      subtotal: 100,
      now: '2026-06-05T10:00:00.000Z',
      items: [{ productId: 'prod_1', category: 'Food', price: 100, quantity: 1 }],
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('enforces per-customer redemption limits', async () => {
    const db = runner(promotionRow({
      customer_scope: 'selected',
      target_customer_ids: JSON.stringify(['cust_1']),
      per_customer_limit: 1,
    }), 1);

    const result = await validatePromotionForSale(db, 'tenant_1', {
      code: 'SAVE10',
      customerId: 'cust_1',
      subtotal: 100,
      now: '2026-06-05T10:00:00.000Z',
      items: [{ productId: 'prod_1', category: 'Food', price: 100, quantity: 1 }],
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Customer redemption limit');
  });

  it('records redemptions and increments the promotion counter', async () => {
    const db = { query: vi.fn().mockResolvedValue([[]]) };
    const validation: PromotionValidationResult = {
      valid: true,
      promotion: {
        id: 'promo_1',
        code: 'SAVE10',
        name: 'Save ten',
        status: 'active',
        discountType: 'percent',
        discountValue: 10,
        minSubtotal: 0,
        appliesTo: 'cart',
        targetProductIds: [],
        targetCategories: [],
        customerScope: 'all',
        targetCustomerIds: [],
        redemptionCount: 0,
      },
      discountAmount: 10,
      targetSubtotal: 100,
    };

    await recordPromotionRedemption(db, 'tenant_1', 'sale_1', {
      code: 'SAVE10',
      customerId: 'cust_1',
      subtotal: 100,
      items: [],
    }, validation, 'staff_1');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO promotion_redemptions'),
      expect.arrayContaining(['tenant_1', 'promo_1', 'SAVE10', 'sale_1', 'cust_1', 'staff_1', 10])
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE promotions SET redemption_count = redemption_count + 1'),
      ['tenant_1', 'promo_1']
    );
  });
});
