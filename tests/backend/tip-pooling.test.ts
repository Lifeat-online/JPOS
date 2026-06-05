import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { recordAuditEventSafe } from '../../server/audit.js';
import { createTipPoolRule, generateTipPoolPayouts, listTipPoolPayouts, previewTipPoolPayouts, updateTipPoolRule } from '../../server/tipPooling.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../server/audit.js', () => ({
  recordAuditEventSafe: vi.fn(),
}));

const ruleRow = {
  id: 'rule_1',
  tenantId: 'tenant_1',
  name: 'Role weighted pool',
  status: 'active',
  distributionMethod: 'role_weighted',
  source: 'sale_tips',
  includedRoles: '[]',
  roleWeights: '{"cashier":1,"chef":2,"manager":1}',
};

const attendanceRows = [
  {
    attendanceId: 'att_cashier',
    staffId: 'staff_cashier',
    staffName: 'Jess',
    role: 'cashier',
    shiftId: 'shift_cashier',
    shiftDate: '2026-06-05',
    workedMinutes: '240',
  },
  {
    attendanceId: 'att_chef',
    staffId: 'staff_chef',
    staffName: 'Chef Mo',
    role: 'chef',
    shiftId: 'shift_chef',
    shiftDate: '2026-06-05',
    workedMinutes: '240',
  },
];

describe('tip pooling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates audited tip pool rules with distribution method and role weights', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO tip_pool_rules')) return Promise.resolve([]);
      if (sql.includes('FROM tip_pool_rules') && sql.includes('LIMIT 1')) return Promise.resolve([ruleRow]);
      return Promise.resolve([]);
    });

    const rule = await createTipPoolRule('tenant_1', {
      name: 'Role weighted pool',
      distributionMethod: 'role_weighted',
      roleWeights: { cashier: 1, chef: 2 },
    }, { staffId: 'mgr_1', staffName: 'Manager' });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tip_pool_rules'),
      expect.arrayContaining(['tenant_1', 'Role weighted pool', 'active', 'role_weighted', '[]', '{"cashier":1,"chef":2}'])
    );
    expect(rule).toMatchObject({ id: 'rule_1', distributionMethod: 'role_weighted' });
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant_1',
      action: 'tip_pool_rule.created',
      entityType: 'tip_pool_rule',
      staffId: 'mgr_1',
    }));
  });

  it('updates rules and stores role filters', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM tip_pool_rules') && sql.includes('LIMIT 1')) return Promise.resolve([ruleRow]);
      if (sql.includes('UPDATE tip_pool_rules')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const rule = await updateTipPoolRule('tenant_1', 'rule_1', {
      includedRoles: ['cashier', 'chef'],
      distributionMethod: 'worked_hours',
    }, { staffId: 'mgr_1' });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE tip_pool_rules'),
      expect.arrayContaining(['Role weighted pool', 'active', 'worked_hours', '["cashier","chef"]'])
    );
    expect(rule?.includedRoles).toEqual([]);
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({ action: 'tip_pool_rule.updated' }));
  });

  it('previews role-weighted per-shift payouts from completed sale tips and closed attendance', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM tip_pool_rules')) return Promise.resolve([ruleRow]);
      if (sql.includes('FROM sales')) return Promise.resolve([{ totalTips: '90.00', saleCount: '3' }]);
      if (sql.includes('FROM staff_attendance')) return Promise.resolve(attendanceRows);
      return Promise.resolve([]);
    });

    const report = await previewTipPoolPayouts('tenant_1', { ruleId: 'rule_1', startDate: '2026-06-05', endDate: '2026-06-05' });

    expect(report.summary).toMatchObject({
      poolAmount: 90,
      saleTipCount: 3,
      participantCount: 2,
      shiftCount: 2,
      payoutAmount: 90,
    });
    expect(report.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ staffId: 'staff_cashier', weight: 240, payoutAmount: 30 }),
      expect.objectContaining({ staffId: 'staff_chef', weight: 480, payoutAmount: 60 }),
    ]));
    expect(report.csv).toContain('Shift date');
    expect(report.csv).toContain('Chef Mo,chef,2026-06-05');
  });

  it('generates draft payout rows and audits the run', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM tip_pool_rules')) return Promise.resolve([ruleRow]);
      if (sql.includes('FROM sales')) return Promise.resolve([{ totalTips: '90.00', saleCount: '3' }]);
      if (sql.includes('FROM staff_attendance')) return Promise.resolve(attendanceRows);
      if (sql.includes('DELETE FROM tip_pool_payouts')) return Promise.resolve([]);
      if (sql.includes('INSERT INTO tip_pool_payouts')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const report = await generateTipPoolPayouts('tenant_1', { ruleId: 'rule_1', startDate: '2026-06-05', endDate: '2026-06-05' }, {
      staffId: 'mgr_1',
      staffName: 'Manager',
    });

    const insertCalls = (dbModule.query as any).mock.calls.filter((call: any[]) => String(call[0]).includes('INSERT INTO tip_pool_payouts'));
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0][1]).toEqual(expect.arrayContaining(['tenant_1', 'rule_1', '2026-06-05', '2026-06-05', 'staff_cashier', 'Jess', 'att_cashier']));
    expect(report.generated).toBe(true);
    expect(report.entries.every(entry => entry.status === 'draft')).toBe(true);
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      action: 'tip_pool.generated',
      details: expect.objectContaining({
        summary: expect.objectContaining({ payoutAmount: 90 }),
      }),
    }));
  });

  it('lists generated payout rows with filters', async () => {
    (dbModule.query as any).mockResolvedValueOnce([{
      id: 'payout_1',
      ruleId: 'rule_1',
      periodStart: '2026-06-05',
      periodEnd: '2026-06-05',
      staffId: 'staff_cashier',
      staffName: 'Jess',
      attendanceId: 'att_cashier',
      shiftDate: '2026-06-05',
      workedMinutes: '240',
      weight: '240',
      tipPoolAmount: '90.00',
      payoutAmount: '30.00',
      status: 'draft',
    }]);

    const rows = await listTipPoolPayouts('tenant_1', { ruleId: 'rule_1', startDate: '2026-06-01', endDate: '2026-06-30' });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM tip_pool_payouts'),
      ['tenant_1', 'rule_1', '2026-06-01', '2026-06-30']
    );
    expect(rows[0]).toMatchObject({ staffId: 'staff_cashier', payoutAmount: 30, status: 'draft' });
  });
});
