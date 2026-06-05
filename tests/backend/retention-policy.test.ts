import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { recordAuditEventSafe } from '../../server/audit.js';
import { applyRetentionPolicy, getRetentionPreview, normalizeRetentionPolicy, saveRetentionPolicy } from '../../server/retentionPolicy.js';

vi.mock('../../server/db.js', () => ({
  isPostgres: vi.fn(() => false),
  query: vi.fn(),
}));

vi.mock('../../server/audit.js', () => ({
  recordAuditEventSafe: vi.fn(),
}));

const storedPolicy = {
  customerNotesDays: 10,
  messagesDays: 20,
  deviceMetadataDays: 30,
  auditLogsDays: 40,
};

function mockRetentionQueries() {
  (dbModule.query as any).mockImplementation((sql: string) => {
    if (sql.includes('SELECT retention_policy')) {
      return Promise.resolve([{ retentionPolicy: JSON.stringify(storedPolicy) }]);
    }
    if (sql.includes('FROM customers')) return Promise.resolve([{ count: 2 }]);
    if (sql.includes('FROM messages')) return Promise.resolve([{ count: 3 }]);
    if (sql.includes('FROM push_subscriptions')) return Promise.resolve([{ count: 5 }]);
    if (sql.includes('FROM companion_device_assignments')) return Promise.resolve([{ count: 7 }]);
    if (sql.includes('FROM audit_events')) return Promise.resolve([{ count: 11 }]);
    return Promise.resolve([]);
  });
}

describe('retention policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes policy windows to supported day ranges', () => {
    const policy = normalizeRetentionPolicy({
      customerNotesDays: 1,
      messagesDays: 'not-a-number',
      deviceMetadataDays: 5000,
      auditLogsDays: 5,
    });

    expect(policy.customerNotesDays).toBe(7);
    expect(policy.messagesDays).toBe(180);
    expect(policy.deviceMetadataDays).toBe(3650);
    expect(policy.auditLogsDays).toBe(30);
  });

  it('builds retention previews with counts for notes, messages, device metadata, and audit logs', async () => {
    mockRetentionQueries();

    const preview = await getRetentionPreview('tenant_1');

    expect(preview.generatedAt).toBe('2026-06-05T12:00:00.000Z');
    expect(preview.customerNotes.cutoff).toBe('2026-05-26 12:00:00');
    expect(preview.messages.cutoff).toBe('2026-05-16 12:00:00');
    expect(preview.summary).toEqual({
      customerNotesToClear: 2,
      messagesToDelete: 3,
      deviceMetadataRowsToDelete: 12,
      auditLogsToDelete: 11,
    });
  });

  it('saves the policy and records an audit event', async () => {
    (dbModule.query as any)
      .mockResolvedValueOnce([{ retentionPolicy: JSON.stringify(storedPolicy) }])
      .mockResolvedValueOnce([]);

    const saved = await saveRetentionPolicy('tenant_1', { messagesDays: 300 }, {
      staffId: 'staff_1',
      staffName: 'Manager',
    });

    const upsertCall = (dbModule.query as any).mock.calls.find((call: any[]) => String(call[0]).includes('INSERT INTO app_settings'));
    expect(saved.messagesDays).toBe(300);
    expect(upsertCall?.[1]?.[0]).toBe('tenant_1');
    expect(upsertCall?.[1]?.[1]).toContain('"messagesDays":300');
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant_1',
      action: 'retention_policy.updated',
      entityType: 'retention_policy',
      staffId: 'staff_1',
      source: 'retention',
    }));
  });

  it('applies cleanup statements, stores the last result, and records an audit event', async () => {
    mockRetentionQueries();

    const result = await applyRetentionPolicy('tenant_1', undefined, {
      staffId: 'staff_1',
      staffName: 'Manager',
    });

    const sqlCalls = (dbModule.query as any).mock.calls.map((call: any[]) => String(call[0]));
    expect(sqlCalls).toEqual(expect.arrayContaining([
      expect.stringContaining('UPDATE customers'),
      expect.stringContaining('DELETE FROM messages'),
      expect.stringContaining('DELETE FROM push_subscriptions'),
      expect.stringContaining('DELETE FROM companion_device_assignments'),
      expect.stringContaining('DELETE FROM audit_events'),
      expect.stringContaining('INSERT INTO app_settings'),
    ]));
    expect(result.appliedAt).toBe('2026-06-05T12:00:00.000Z');
    expect(result.policy.lastAppliedBy).toBe('staff_1');
    expect(result.policy.lastResult).toEqual(result.summary);
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant_1',
      action: 'retention_policy.applied',
      entityType: 'retention_policy',
      staffId: 'staff_1',
      source: 'retention',
      details: expect.objectContaining({
        summary: result.summary,
      }),
    }));
  });
});
