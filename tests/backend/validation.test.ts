import { describe, expect, it, vi } from 'vitest';
import { CustomerSchema, CustomerUpdateSchema, SaleSchema, StaffSchema, StaffUpdateSchema, validateSchema } from '../../server/validation.js';

describe('validation middleware', () => {
  it('accepts pending tab sales with null optional fields', () => {
    const parsed = SaleSchema.safeParse({
      items: [{ id: 'prod_1', name: 'Bread', price: 16, quantity: 1, workstationId: null }],
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

  it('allows wallet-only staff updates while keeping staff creation strict', () => {
    expect(StaffSchema.safeParse({ walletBalance: 10 }).success).toBe(false);
    expect(StaffUpdateSchema.safeParse({ walletBalance: 10 }).success).toBe(true);
    expect(StaffUpdateSchema.safeParse({ walletBalance: -1 }).success).toBe(false);
  });
});
