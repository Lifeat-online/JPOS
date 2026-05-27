import { beforeEach, describe, expect, it } from 'vitest';
import {
  countPendingOfflineSales,
  enqueueOfflineSale,
  getOfflineCheckoutBlock,
  isOfflineLikeError,
  listOfflineSales,
  offlineSaleToReceiptSale,
} from '../../src/utils/offlineSales';

describe('offline sale queue', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('allows only cash and external-card tenders while offline', () => {
    expect(getOfflineCheckoutBlock('cash', undefined, true)).toMatchObject({ allowed: true });
    expect(getOfflineCheckoutBlock('card', undefined, true)).toMatchObject({ allowed: true });
    expect(getOfflineCheckoutBlock('wallet', undefined, true)).toMatchObject({ allowed: false });
    expect(getOfflineCheckoutBlock('account', undefined, true)).toMatchObject({ allowed: false });
    expect(getOfflineCheckoutBlock('payfast', undefined, true)).toMatchObject({ allowed: false });
    expect(getOfflineCheckoutBlock('split', [{ method: 'cash' }, { method: 'card' }], true)).toMatchObject({ allowed: true });
    expect(getOfflineCheckoutBlock('split', [{ method: 'cash' }, { method: 'wallet' }], true)).toMatchObject({ allowed: false });
  });

  it('stores queued sales with a local receipt number and pending sync status', () => {
    const queued = enqueueOfflineSale({
      tenantId: 'tenant_1',
      method: 'card',
      staffId: 'staff_1',
      staffName: 'Cashier',
      cashSessionId: 'cash_1',
      saleData: {
        items: [{ id: 'prod_1', name: 'Burger', price: 80, quantity: 1 }],
        total: 80,
        subtotal: 80,
        paymentMethod: 'card',
        status: 'completed',
        payments: [{ method: 'card', amount: 80, tenderedAmount: 80 }],
      },
    });

    const items = listOfflineSales('tenant_1');
    const receiptSale = offlineSaleToReceiptSale(queued);

    expect(items).toHaveLength(1);
    expect(countPendingOfflineSales('tenant_1')).toBe(1);
    expect(queued.localReceiptNumber).toMatch(/^OFF-/);
    expect(receiptSale).toMatchObject({
      id: queued.localReceiptNumber,
      offlineEventId: queued.id,
      syncStatus: 'pending',
      total: 80,
    });
  });

  it('detects browser offline and fetch failures without treating server 500s as offline', () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    expect(isOfflineLikeError(new Error('anything'))).toBe(true);

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });

    expect(isOfflineLikeError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isOfflineLikeError(new Error('API request failed [500]: database exploded'))).toBe(false);
  });
});
