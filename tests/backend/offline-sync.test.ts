import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { classifyOfflineSyncAction, classifyOfflineSyncIssue, recordOfflineSyncIssue } from '../../server/offlineSync.js';

vi.mock('../../server/db.js', () => ({
  getConnection: vi.fn(),
}));

describe('offline sync issue reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies duplicate failures as conflicts', () => {
    expect(classifyOfflineSyncAction('duplicate offline event already exists')).toBe('offline.sync_conflict');
    expect(classifyOfflineSyncAction('database timeout')).toBe('offline.sync_failed');
    expect(classifyOfflineSyncIssue('negative stock after sync')).toMatchObject({
      conflictType: 'negative_stock_after_sync',
      recommendedAction: expect.stringContaining('adjust stock'),
    });
    expect(classifyOfflineSyncIssue('table already open from another device')).toMatchObject({
      conflictType: 'duplicate_table_or_tab',
      recommendedAction: expect.stringContaining('merge'),
    });
    expect(classifyOfflineSyncIssue('customer order conflict')).toMatchObject({
      conflictType: 'duplicate_customer_order',
      recommendedAction: expect.stringContaining('customer/order history'),
    });
  });

  it('records browser-side sync failures as audit events for Action Center', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([[]]),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    (dbModule.getConnection as any).mockResolvedValue(conn);

    const result = await recordOfflineSyncIssue('tenant_1', {
      offlineEventId: 'offline_sale_1',
      localReceiptNumber: 'OFF-DEV-000001',
      deviceId: 'device_1',
      method: 'cash',
      attempts: 3,
      message: 'API request failed [500]: duplicate receipt conflict',
      staffId: 'staff_1',
      staffName: 'Cashier',
      total: 42,
      syncBatchId: 'offline_batch_1',
      syncSequence: 2,
    });

    expect(result.eventId).toMatch(/^audit_/);
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining([
        'tenant_1',
        'offline.sync_conflict',
        'sale',
        'offline_sale_1',
        null,
        'staff_1',
        'Cashier',
        null,
        'offline_queue',
      ])
    );
    const auditInsert = conn.query.mock.calls.find(([sql]: any[]) => String(sql).includes('INSERT INTO audit_events'));
    const details = JSON.parse(auditInsert?.[1]?.[11] || '{}');
    expect(details).toMatchObject({
      conflictType: 'duplicate_local_receipt',
      recommendedAction: expect.stringContaining('local receipt'),
      syncBatchId: 'offline_batch_1',
      syncSequence: 2,
    });
    expect(conn.commit).toHaveBeenCalled();
  });
});
