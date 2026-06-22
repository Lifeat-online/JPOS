import { beforeEach, describe, expect, it } from 'vitest';

import { syncDesktopLocalSale, listDesktopLocalSales, dismissDesktopLocalSale } from '../../src/utils/desktopLocalSales';
import { writeCachedPackageLimits } from '../../src/utils/packageCapabilityCache';

describe('desktop local sales journal', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    window.maseposDesktop = {
      getRuntimeInfo: () => ({
        isDesktop: true,
        packaged: true,
        platform: 'win32',
        userDataPath: 'C:/runtime',
        storageBackend: 'electron-file',
        desktopDeviceId: 'desktop-test-1234',
      }),
      storageGetItem: (key: string) => storage.get(key) ?? null,
      storageSetItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      storageRemoveItem: (key: string) => {
        storage.delete(key);
      },
    };
  });

  it('stores premium desktop offline sales in the local journal', () => {
    writeCachedPackageLimits('tenant-premium', {
      source: 'hosted',
      package: {
        id: 'business',
        name: 'Business',
        priceLabel: 'R999/mo',
        maxRegisters: 15,
        maxProducts: -1,
        maxStaff: 50,
        maxCustomers: -1,
        features: ['offline_sales_basic', 'offline_sales_full', 'local_server_sync'] as any,
        limitsLabel: 'Business',
      },
      offline: {
        level: 'premium',
        canQueueSales: true,
        fullOffline: true,
        maxQueuedSales: 500,
        label: 'Premium offline',
      } as any,
      usage: { products: 0, staff: 0, customers: 0, activeRegisters: 0 },
      remaining: { products: -1, staff: -1, customers: -1, activeRegisters: 15 },
      localServerSync: true,
    } as any);

    syncDesktopLocalSale({
      id: 'offline_sale_1',
      tenantId: 'tenant-premium',
      operation: 'create_sale',
      targetSaleId: null,
      localReceiptNumber: 'OFF-LOCAL-000001',
      deviceId: 'desktop-test-1234',
      method: 'cash',
      saleData: { total: 123.45 },
      status: 'pending',
      attempts: 0,
      cloudSaleId: null,
      saleSyncedAt: null,
      postSaleEffectsSyncedAt: null,
      managerReviewReportedAt: null,
      conflictType: null,
      recommendedAction: null,
      lastError: null,
      createdAt: '2026-06-14T00:00:00.000Z',
      updatedAt: '2026-06-14T00:00:00.000Z',
    } as any);

    expect(listDesktopLocalSales('tenant-premium')).toEqual([
      expect.objectContaining({
        id: 'offline_sale_1',
        localReceiptNumber: 'OFF-LOCAL-000001',
        method: 'cash',
        total: 123.45,
        status: 'queued',
      }),
    ]);
  });

  it('marks dismissed journal entries without deleting the record', () => {
    writeCachedPackageLimits('tenant-premium', {
      source: 'hosted',
      package: {
        id: 'business',
        name: 'Business',
        priceLabel: 'R999/mo',
        maxRegisters: 15,
        maxProducts: -1,
        maxStaff: 50,
        maxCustomers: -1,
        features: ['offline_sales_basic', 'offline_sales_full', 'local_server_sync'] as any,
        limitsLabel: 'Business',
      },
      offline: {
        level: 'premium',
        canQueueSales: true,
        fullOffline: true,
        maxQueuedSales: 500,
        label: 'Premium offline',
      } as any,
      usage: { products: 0, staff: 0, customers: 0, activeRegisters: 0 },
      remaining: { products: -1, staff: -1, customers: -1, activeRegisters: 15 },
      localServerSync: true,
    } as any);

    syncDesktopLocalSale({
      id: 'offline_sale_2',
      tenantId: 'tenant-premium',
      operation: 'create_sale',
      targetSaleId: null,
      localReceiptNumber: 'OFF-LOCAL-000002',
      deviceId: 'desktop-test-1234',
      method: 'card',
      saleData: { total: 50 },
      status: 'synced',
      attempts: 1,
      cloudSaleId: 'cloud_1',
      saleSyncedAt: null,
      postSaleEffectsSyncedAt: null,
      managerReviewReportedAt: null,
      conflictType: null,
      recommendedAction: null,
      lastError: null,
      createdAt: '2026-06-14T00:00:00.000Z',
      updatedAt: '2026-06-14T00:00:01.000Z',
    } as any);

    dismissDesktopLocalSale('tenant-premium', 'offline_sale_2');

    expect(listDesktopLocalSales('tenant-premium')).toEqual([
      expect.objectContaining({
        id: 'offline_sale_2',
        status: 'dismissed',
      }),
    ]);
  });
});
