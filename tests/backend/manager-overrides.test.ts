import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { listManagerOverrides, recordManagerOverride } from '../../server/managerOverrides.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('manager overrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires a reason before recording a manager override', async () => {
    await expect(recordManagerOverride('tenant_1', {
      targetType: 'manager_task',
      targetId: 'task_1',
      action: 'approve',
      reason: '',
    })).rejects.toThrow('manager override reason');
  });

  it('records a dedicated override row and audit event', async () => {
    (dbModule.query as any).mockResolvedValue({});

    const result = await recordManagerOverride('tenant_1', {
      targetType: 'manager_task',
      targetId: 'task_1',
      action: 'approve',
      status: 'approved',
      reason: 'Checked the refund request and customer receipt.',
      requestedBy: 'cashier_1',
      approvedBy: 'mgr_1',
      approvedByName: 'Manager',
      relatedSaleId: 'sale_1',
      details: { taskType: 'refund_request' },
    });

    expect(result).toMatchObject({
      tenantId: 'tenant_1',
      overrideType: 'manager_task',
      targetType: 'manager_task',
      targetId: 'task_1',
      action: 'approve',
      status: 'approved',
      reason: 'Checked the refund request and customer receipt.',
    });
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO manager_overrides'),
      expect.arrayContaining(['tenant_1', 'manager_task', 'manager_task', 'task_1', 'approve', 'approved'])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'manager_override.recorded', 'manager_override'])
    );
  });

  it('lists recent overrides for manager review', async () => {
    (dbModule.query as any).mockResolvedValue([
      {
        id: 'mo_1',
        tenantId: 'tenant_1',
        overrideType: 'manager_task',
        targetType: 'manager_task',
        targetId: 'task_1',
        action: 'approve',
        status: 'approved',
        reason: 'Checked',
        approvedByName: 'Manager',
        details: '{"taskType":"refund_request"}',
      },
    ]);

    const overrides = await listManagerOverrides('tenant_1', 10);

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM manager_overrides'),
      ['tenant_1', 10]
    );
    expect(overrides[0]).toMatchObject({
      id: 'mo_1',
      reason: 'Checked',
      details: { taskType: 'refund_request' },
    });
  });
});
