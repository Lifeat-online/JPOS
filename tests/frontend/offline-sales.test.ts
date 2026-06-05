import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/api', () => ({
  apiPut: vi.fn(),
  createSale: vi.fn(),
  reportOfflineSyncIssue: vi.fn(),
}));

import { createSale, reportOfflineSyncIssue } from '../../src/api';
import {
  classifyOfflineSyncIssue,
  countPendingOfflineSales,
  enqueueOfflineSale,
  getOfflineCheckoutBlock,
  isOfflineLikeError,
  listOfflineSales,
  offlineSaleToReceiptSale,
  retryOfflineSale,
  dismissOfflineSale,
  syncQueuedOfflineSales,
} from '../../src/utils/offlineSales';
import { WALLET_ONLINE_REQUIRED_MESSAGE } from '../../src/utils/offlineGuards';

describe('offline sale queue', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(createSale).mockReset();
    vi.mocked(reportOfflineSyncIssue).mockReset();
    vi.mocked(reportOfflineSyncIssue).mockResolvedValue({ eventId: 'audit_1' });
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('allows only cash and external-card tenders while offline', () => {
    expect(getOfflineCheckoutBlock('cash', undefined, true)).toMatchObject({ allowed: true });
    expect(getOfflineCheckoutBlock('card', undefined, true)).toMatchObject({ allowed: true });
    expect(getOfflineCheckoutBlock('wallet', undefined, true)).toMatchObject({
      allowed: false,
      reason: WALLET_ONLINE_REQUIRED_MESSAGE,
    });
    expect(getOfflineCheckoutBlock('account', undefined, true)).toMatchObject({ allowed: false });
    expect(getOfflineCheckoutBlock('payfast', undefined, true)).toMatchObject({ allowed: false });
    expect(getOfflineCheckoutBlock('qr', undefined, true)).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('QR'),
    });
    expect(getOfflineCheckoutBlock('bnpl', undefined, true)).toMatchObject({
      allowed: false,
      reason: expect.stringContaining('BNPL'),
    });
    expect(getOfflineCheckoutBlock('split', [{ method: 'cash' }, { method: 'card' }], true)).toMatchObject({ allowed: true });
    expect(getOfflineCheckoutBlock('split', [{ method: 'cash' }, { method: 'wallet' }], true)).toMatchObject({ allowed: false });
    expect(getOfflineCheckoutBlock('split', [{ method: 'cash' }, { method: 'qr' }], true)).toMatchObject({ allowed: false });
    expect(getOfflineCheckoutBlock('split', [{ method: 'cash' }, { method: 'bnpl' }], true)).toMatchObject({ allowed: false });
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
    expect(queued.localReceiptNumber).toContain('XCASH1');
    expect(queued.saleData.syncSource).toBe('offline');
    expect(queued.syncEvent).toMatchObject({
      type: 'sale.create',
      version: 1,
      idempotencyKey: queued.id,
      localReceiptNumber: queued.localReceiptNumber,
      registerId: 'cash_1',
      payload: {
        operation: 'create_sale',
      },
    });
    expect(receiptSale).toMatchObject({
      id: queued.localReceiptNumber,
      offlineEventId: queued.id,
      syncStatus: 'pending',
      total: 80,
    });
  });

  it('marks receipt sale with isOfflineSale flag and deviceId in payload', () => {
    const queued = enqueueOfflineSale({
      tenantId: 'tenant_1',
      method: 'cash',
      staffId: 'staff_1',
      saleData: {
        items: [{ id: 'prod_1', name: 'Soda', price: 15, quantity: 1 }],
        total: 15,
        subtotal: 15,
      },
    });

    const receipt = offlineSaleToReceiptSale(queued);
    expect(receipt).toMatchObject({
      isOfflineSale: true,
      syncStatus: 'pending',
    });
    expect(receipt.deviceId).toBeTruthy();
  });

  it('enqueues sale data with offlineEventId and deviceId for idempotent sync', () => {
    const queued = enqueueOfflineSale({
      tenantId: 'tenant_1',
      method: 'card',
      staffId: 'staff_1',
      saleData: { total: 50 },
    });

    expect(queued.saleData.offlineEventId).toBe(queued.id);
    expect(queued.saleData.deviceId).toBe(queued.deviceId);
  });

  it('supports manual retry and dismiss actions for the local review panel', () => {
    const queued = enqueueOfflineSale({
      tenantId: 'tenant_1',
      method: 'cash',
      staffId: 'staff_1',
      saleData: { total: 20 },
    });

    retryOfflineSale('tenant_1', queued.id);
    expect(listOfflineSales('tenant_1')[0]).toMatchObject({
      id: queued.id,
      status: 'pending',
      attempts: 0,
      lastError: null,
    });

    dismissOfflineSale('tenant_1', queued.id);
    expect(listOfflineSales('tenant_1')).toEqual([]);
  });

  it('classifies offline sync conflicts with manager actions', () => {
    expect(classifyOfflineSyncIssue('negative stock after sync for Bread')).toMatchObject({
      conflictType: 'negative_stock_after_sync',
      recommendedAction: expect.stringContaining('adjust stock'),
    });
    expect(classifyOfflineSyncIssue('duplicate table tab conflict')).toMatchObject({
      conflictType: 'duplicate_table_or_tab',
      recommendedAction: expect.stringContaining('merge'),
    });
    expect(classifyOfflineSyncIssue('customer order already open')).toMatchObject({
      conflictType: 'duplicate_customer_order',
      recommendedAction: expect.stringContaining('customer/order history'),
    });
    expect(classifyOfflineSyncIssue('database timeout')).toMatchObject({
      conflictType: 'sync_failure',
    });
  });

  it('syncs due offline events in bounded batches with sequence metadata', async () => {
    vi.mocked(createSale).mockResolvedValueOnce({ id: 'sale_cloud_1' });

    const first = enqueueOfflineSale({
      tenantId: 'tenant_1',
      method: 'cash',
      cashSessionId: 'register_1',
      saleData: { total: 20, subtotal: 20, status: 'completed', paymentMethod: 'cash', items: [] },
    });
    const second = enqueueOfflineSale({
      tenantId: 'tenant_1',
      method: 'card',
      cashSessionId: 'register_1',
      saleData: { total: 30, subtotal: 30, status: 'completed', paymentMethod: 'card', items: [] },
    });

    const result = await syncQueuedOfflineSales('tenant_1', { batchSize: 1 });

    expect(result.summary).toMatchObject({
      attempted: 1,
      synced: 1,
      failed: 0,
      skipped: 1,
      pending: 1,
    });
    expect(result.summary.batchId).toMatch(/^offline_batch_/);
    expect(createSale).toHaveBeenCalledTimes(1);
    const syncedOfflineEventId = vi.mocked(createSale).mock.calls[0][1].offlineEventId;
    expect([first.id, second.id]).toContain(syncedOfflineEventId);
    expect(createSale).toHaveBeenCalledWith('tenant_1', expect.objectContaining({
      offlineEventId: syncedOfflineEventId,
      syncSource: 'offline',
      syncEventType: 'sale.create',
      syncEventVersion: 1,
      syncBatchId: result.summary.batchId,
      syncSequence: 1,
    }));
    expect(listOfflineSales('tenant_1').find(item => item.id === syncedOfflineEventId)).toMatchObject({
      status: 'synced',
      lastSyncedBatchId: result.summary.batchId,
    });
  });

  it('backs off failed sync events until retry is due unless forced', async () => {
    vi.mocked(createSale).mockRejectedValueOnce(new Error('API request failed [500]: database timeout'));

    const queued = enqueueOfflineSale({
      tenantId: 'tenant_1',
      method: 'cash',
      cashSessionId: 'register_1',
      saleData: { total: 20, subtotal: 20, status: 'completed', paymentMethod: 'cash', items: [] },
    });

    const failed = await syncQueuedOfflineSales('tenant_1');
    const failedItem = listOfflineSales('tenant_1').find(item => item.id === queued.id);
    expect(failed.summary).toMatchObject({ attempted: 1, synced: 0, failed: 1 });
    expect(failedItem).toMatchObject({
      status: 'failed',
      attempts: 1,
      conflictType: 'sync_failure',
    });
    expect(failedItem?.nextRetryAt).toBeTruthy();
    expect(reportOfflineSyncIssue).toHaveBeenCalledWith('tenant_1', expect.objectContaining({
      syncBatchId: failed.summary.batchId,
      syncSequence: 1,
    }));

    vi.mocked(createSale).mockClear();
    const skipped = await syncQueuedOfflineSales('tenant_1');
    expect(skipped.summary).toMatchObject({ attempted: 0, synced: 0, failed: 0, skipped: 1 });
    expect(createSale).not.toHaveBeenCalled();

    vi.mocked(createSale).mockResolvedValueOnce({ id: 'sale_cloud_retry' });
    const forced = await syncQueuedOfflineSales('tenant_1', { force: true });
    expect(forced.summary).toMatchObject({ attempted: 1, synced: 1, failed: 0 });
    expect(createSale).toHaveBeenCalledTimes(1);
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
