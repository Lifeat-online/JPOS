import { describe, expect, it, vi } from 'vitest';
import { CustomerSchema, CustomerUpdateSchema, LoginSchema, PaymentProviderStatusSchema, SaleRefundSchema, SaleSchema, SaleVoidSchema, StaffSchema, StaffUpdateSchema, validateSchema } from '../../server/validation.js';

describe('validation middleware', () => {
  it('accepts optional two-factor login codes', () => {
    expect(LoginSchema.safeParse({
      email: 'manager@example.com',
      password: 'secret123',
      twoFactorCode: '123456',
    }).success).toBe(true);
  });

  it('accepts pending tab sales with null optional fields', () => {
    const parsed = SaleSchema.safeParse({
      items: [{ id: 'prod_1', name: 'Bread', price: 16, quantity: 1, category: 'Bakery', workstationId: null }],
      total: 16,
      subtotal: 16,
      taxAmount: 0,
      taxRate: null,
      taxInclusive: true,
      paymentMethod: 'pending',
      status: 'open',
      customerId: 'cust_1',
      staffId: null,
      isTab: true,
      tabName: null,
    });

    expect(parsed.success).toBe(true);
  });

  it('accepts promotion metadata and item targeting context on sale payloads', () => {
    const parsed = SaleSchema.safeParse({
      items: [{
        id: 'prod_1',
        productId: 'prod_1',
        name: 'Latte',
        price: 40,
        quantity: 2,
        category: 'Coffee',
        section: 'Drinks',
        subCategory: 'Hot drinks',
        selectedModifiers: [{ modifierId: 'milk', optionId: 'oat', name: 'Oat milk', priceExtra: 5 }],
      }],
      total: 72,
      subtotal: 80,
      promotionId: 'promo_1',
      promotionCode: 'SAVE10',
      promotionDiscount: 8,
      pointsDiscount: 8,
      paymentMethod: 'cash',
      status: 'completed',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.items[0]).toMatchObject({
      id: 'prod_1',
      category: 'Coffee',
      section: 'Drinks',
    });
  });

  it('accepts loyalty member fields and sale redemption metadata', () => {
    expect(CustomerSchema.safeParse({
      name: 'Loyalty Customer',
      email: 'loyalty@example.com',
      loyaltyPoints: 250,
      loyaltyMemberStatus: 'active',
      loyaltyTierId: 'tier_gold',
      membershipCardId: 'CARD-001',
      membershipBarcode: '6001234567890',
      membershipStartedAt: '2026-06-05T10:00:00.000Z',
    }).success).toBe(true);

    expect(CustomerUpdateSchema.safeParse({
      loyaltyMemberStatus: 'opted_out',
      loyaltyTierId: null,
      membershipCardId: null,
      membershipBarcode: null,
    }).success).toBe(true);

    expect(SaleSchema.safeParse({
      items: [{ id: 'prod_1', name: 'Latte', price: 40, quantity: 1, category: 'Coffee' }],
      total: 35,
      subtotal: 40,
      pointsDiscount: 5,
      loyaltyPointsRedeemed: 50,
      loyaltyPointsEarned: 4,
      paymentMethod: 'cash',
      status: 'completed',
      customerId: 'cust_1',
    }).success).toBe(true);
  });

  it('accepts customer consent tracking fields and rejects invalid consent status', () => {
    expect(CustomerSchema.safeParse({
      name: 'Consent Customer',
      email: 'consent@example.com',
      consents: {
        loyalty: { status: 'granted', source: 'customer_profile' },
        marketing: { status: 'denied', note: 'Declined at counter' },
        customer_portal: { status: 'unknown' },
        stored_contact_details: { status: 'granted' },
        promotions: { status: 'revoked' },
        ai_recommendations: { status: 'unknown' },
      },
    }).success).toBe(true);

    expect(CustomerUpdateSchema.safeParse({
      consents: {
        marketing: { status: 'maybe' },
      },
    }).success).toBe(false);
  });

  it('returns a 400 response instead of throwing on invalid input', () => {
    const req: any = { body: { items: [], total: -1, subtotal: 0 } };
    const json = vi.fn();
    const res: any = { status: vi.fn(() => ({ json })) };
    const next = vi.fn();

    validateSchema(SaleSchema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Invalid input',
      details: expect.any(Array),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('allows wallet-only customer updates while keeping customer creation strict', () => {
    expect(CustomerSchema.safeParse({ walletBalance: 10 }).success).toBe(false);
    expect(CustomerUpdateSchema.safeParse({ walletBalance: 10 }).success).toBe(true);
    expect(CustomerUpdateSchema.safeParse({ walletBalance: -1 }).success).toBe(false);
  });

  it('accepts customer account fields and account sales', () => {
    expect(CustomerUpdateSchema.safeParse({
      accountEnabled: true,
      accountLimit: 500,
      accountBalance: 125,
    }).success).toBe(true);

    expect(SaleSchema.safeParse({
      items: [{ id: 'prod_1', name: 'Coffee', price: 32, quantity: 1 }],
      total: 32,
      subtotal: 32,
      paymentMethod: 'account',
      status: 'completed',
      customerId: 'cust_1',
    }).success).toBe(true);
  });

  it('accepts BNPL sale, refund, and provider reconciliation payloads', () => {
    expect(SaleSchema.safeParse({
      items: [{ id: 'prod_1', name: 'Sneakers', price: 500, quantity: 1 }],
      total: 500,
      subtotal: 500,
      paymentMethod: 'bnpl',
      status: 'completed',
      payments: [{
        method: 'bnpl',
        amount: 500,
        provider: 'payflex',
        providerReference: 'PF-ORDER-1',
        providerStatus: 'approved',
      }],
    }).success).toBe(true);

    expect(SaleRefundSchema.safeParse({
      items: [{ saleItemId: 'item_1', quantity: 1 }],
      reason: 'Customer return',
      method: 'bnpl',
      provider: 'payflex',
      providerReference: 'PF-REFUND-1',
      providerStatus: 'refunded',
    }).success).toBe(true);

    expect(PaymentProviderStatusSchema.safeParse({
      provider: 'payflex',
      providerReference: 'PF-SETTLED-1',
      providerStatus: 'settled',
      providerNote: 'Settled in provider portal',
    }).success).toBe(true);
  });

  it('accepts external card terminal evidence on sales and reconciliation payloads', () => {
    expect(SaleSchema.safeParse({
      items: [{ id: 'prod_1', name: 'Coffee', price: 32, quantity: 1 }],
      total: 32,
      subtotal: 32,
      paymentMethod: 'card',
      status: 'completed',
      payments: [{
        method: 'card',
        amount: 32,
        tenderedAmount: 32,
        provider: 'yoco',
        providerDeviceId: 'Yoco-Front-01',
        providerReference: 'YOCO-RECEIPT-1',
        authorizationCode: 'AUTH-321',
        providerStatus: 'approved',
      }],
    }).success).toBe(true);

    expect(PaymentProviderStatusSchema.safeParse({
      provider: 'yoco',
      providerDeviceId: 'Yoco-Front-01',
      providerReference: 'YOCO-SETTLED-1',
      authorizationCode: 'AUTH-321',
      providerStatus: 'settled',
      providerNote: 'Matched terminal batch',
    }).success).toBe(true);
  });

  it('rejects provider evidence on non-provider payment methods', () => {
    expect(SaleSchema.safeParse({
      items: [{ id: 'prod_1', name: 'Coffee', price: 32, quantity: 1 }],
      total: 32,
      subtotal: 32,
      paymentMethod: 'cash',
      status: 'completed',
      payments: [{
        method: 'cash',
        amount: 32,
        providerReference: 'CASH-REF-1',
      }],
    }).success).toBe(false);

    expect(SaleRefundSchema.safeParse({
      items: [{ saleItemId: 'item_1', quantity: 1 }],
      reason: 'Cash refund',
      method: 'wallet',
      providerReference: 'WALLET-REF-1',
    }).success).toBe(false);
  });

  it('rejects card PAN, CVV, and non-provider token payloads in provider evidence', () => {
    expect(SaleSchema.safeParse({
      items: [{ id: 'prod_1', name: 'Coffee', price: 32, quantity: 1 }],
      total: 32,
      subtotal: 32,
      paymentMethod: 'card',
      status: 'completed',
      payments: [{
        method: 'card',
        amount: 32,
        provider: 'yoco',
        providerDeviceId: 'Yoco-Front-01',
        providerReference: '4111111111111111',
      }],
    }).success).toBe(false);

    expect(PaymentProviderStatusSchema.safeParse({
      provider: 'payflex',
      providerReference: 'PF-SETTLED-1',
      providerStatus: 'settled',
      providerNote: 'Matched in portal, cvv 123',
    }).success).toBe(false);

    expect(SaleSchema.safeParse({
      items: [{ id: 'prod_1', name: 'Coffee', price: 32, quantity: 1 }],
      total: 32,
      subtotal: 32,
      paymentMethod: 'card',
      status: 'completed',
      payments: [{
        method: 'card',
        amount: 32,
        provider: 'yoco',
        providerDeviceId: 'Yoco-Front-01',
        providerToken: 'terminal-token-1',
      }],
    }).success).toBe(false);
  });

  it('allows wallet-only staff updates while keeping staff creation strict', () => {
    expect(StaffSchema.safeParse({ walletBalance: 10 }).success).toBe(false);
    expect(StaffUpdateSchema.safeParse({ walletBalance: 10 }).success).toBe(true);
    expect(StaffUpdateSchema.safeParse({ walletBalance: -1 }).success).toBe(false);
  });

  it('preserves sensitive action verification fields on protected mutation payloads', () => {
    const sensitiveVerification = { password: 'secret123', pin: '2468', actionType: 'refund' };

    expect(CustomerUpdateSchema.safeParse({
      accountBalance: 25,
      sensitiveVerification,
    }).success).toBe(true);

    expect(StaffUpdateSchema.safeParse({
      walletBalance: 40,
      sensitiveVerification,
    }).success).toBe(true);

    expect(SaleVoidSchema.safeParse({
      reason: 'Duplicate order',
      sensitiveVerification,
    }).success).toBe(true);

    expect(SaleSchema.safeParse({
      items: [{ id: 'prod_1', name: 'Coffee', price: 32, quantity: 1 }],
      total: 27,
      subtotal: 32,
      paymentMethod: 'cash',
      status: 'completed',
      manualDiscountAmount: 5,
      manualDiscountReason: 'Manager goodwill',
      sensitiveVerification,
    }).success).toBe(true);
  });
});
