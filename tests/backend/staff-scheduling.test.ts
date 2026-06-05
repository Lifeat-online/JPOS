import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { recordAuditEventSafe } from '../../server/audit.js';
import { clockIn, clockOut, createStaffShift, endBreak, getTimesheetPayrollReport, publishRoster } from '../../server/staffScheduling.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../server/audit.js', () => ({
  recordAuditEventSafe: vi.fn(),
}));

const staffRow = {
  id: 'staff_1',
  name: 'Jess Cashier',
  role: 'cashier',
  payRate: '100.00',
  payType: 'hourly',
};

const shiftRow = {
  id: 'shift_1',
  tenantId: 'tenant_1',
  staffId: 'staff_1',
  staffName: 'Jess Cashier',
  role: 'cashier',
  shiftDate: '2026-06-05',
  startAt: '2026-06-05 08:00:00',
  endAt: '2026-06-05 17:00:00',
  status: 'draft',
  breakMinutesPlanned: '30',
};

function isStaffProfileQuery(sql: string) {
  return /FROM\s+staff\s/i.test(sql);
}

describe('staff scheduling and attendance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates audited draft shifts using staff pay/profile data', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (isStaffProfileQuery(sql) && sql.includes('LIMIT 1')) return Promise.resolve([staffRow]);
      if (sql.includes('INSERT INTO staff_shifts')) return Promise.resolve([]);
      if (sql.includes('FROM staff_shifts') && sql.includes('WHERE tenant_id = ? AND id = ?')) return Promise.resolve([shiftRow]);
      return Promise.resolve([]);
    });

    const shift = await createStaffShift('tenant_1', {
      staffId: 'staff_1',
      shiftDate: '2026-06-05',
      startAt: '2026-06-05T08:00:00',
      endAt: '2026-06-05T17:00:00',
      breakMinutesPlanned: 30,
      notes: 'Front counter',
    }, { staffId: 'mgr_1', staffName: 'Manager' });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO staff_shifts'),
      expect.arrayContaining(['tenant_1', 'staff_1', 'Jess Cashier', 'cashier', '2026-06-05', '2026-06-05 08:00:00', '2026-06-05 17:00:00', 'draft'])
    );
    expect(shift).toMatchObject({ staffId: 'staff_1', breakMinutesPlanned: 30 });
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant_1',
      action: 'staff_shift.created',
      entityType: 'staff_shift',
      staffId: 'mgr_1',
      source: 'workforce',
    }));
  });

  it('publishes roster ranges and returns refreshed shifts', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('UPDATE staff_shifts')) return Promise.resolve([]);
      if (sql.includes('FROM staff_shifts')) return Promise.resolve([{ ...shiftRow, status: 'published' }]);
      return Promise.resolve([]);
    });

    const result = await publishRoster('tenant_1', '2026-06-05', '2026-06-07', { staffId: 'mgr_1', staffName: 'Manager' });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'published'"),
      ['mgr_1', 'Manager', 'tenant_1', '2026-06-05', '2026-06-07']
    );
    expect(result.shifts[0].status).toBe('published');
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      action: 'staff_roster.published',
      details: expect.objectContaining({ publishedShiftCount: 1 }),
    }));
  });

  it('clock-in links the scheduled shift and stores the scheduled minutes', async () => {
    let openAttendanceLookups = 0;
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (isStaffProfileQuery(sql) && sql.includes('LIMIT 1')) return Promise.resolve([staffRow]);
      if (sql.includes("status = 'open'")) {
        openAttendanceLookups += 1;
        if (openAttendanceLookups === 1) return Promise.resolve([]);
        return Promise.resolve([{
          id: 'att_1',
          tenantId: 'tenant_1',
          staffId: 'staff_1',
          staffName: 'Jess Cashier',
          shiftId: 'shift_1',
          status: 'open',
          clockInAt: '2026-06-05 08:00:00',
          breakMinutes: '0',
          scheduledMinutes: '510',
          payRate: '100.00',
          payType: 'hourly',
        }]);
      }
      if (sql.includes('FROM staff_shifts') && sql.includes("status IN ('draft','published')")) return Promise.resolve([{ ...shiftRow, status: 'published' }]);
      if (sql.includes('INSERT INTO staff_attendance')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const attendance = await clockIn('tenant_1', {
      staffId: 'staff_1',
      at: '2026-06-05T08:00:00',
    }, { staffId: 'staff_1', staffName: 'Jess Cashier' });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO staff_attendance'),
      expect.arrayContaining(['tenant_1', 'staff_1', 'Jess Cashier', 'shift_1', '2026-06-05 08:00:00', 510])
    );
    expect(attendance).toMatchObject({ shiftId: 'shift_1', scheduledMinutes: 510 });
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({ action: 'staff.clock_in' }));
  });

  it('adds break minutes when ending an active break', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes("status = 'open'")) {
        return Promise.resolve([{
          id: 'att_1',
          tenantId: 'tenant_1',
          staffId: 'staff_1',
          staffName: 'Jess Cashier',
          status: 'open',
          clockInAt: '2026-06-05 08:00:00',
          breakStartedAt: '2026-06-05 10:00:00',
          breakMinutes: '15',
          scheduledMinutes: '480',
          payRate: '100.00',
          payType: 'hourly',
        }]);
      }
      if (sql.includes('UPDATE staff_attendance')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await endBreak('tenant_1', 'staff_1', '2026-06-05T10:30:00');

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('break_minutes = COALESCE(break_minutes, 0) + ?'),
      [30, 'tenant_1', 'att_1']
    );
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      action: 'staff.break_ended',
      details: expect.objectContaining({ additionalBreakMinutes: 30 }),
    }));
  });

  it('clock-out calculates worked minutes, overtime, and hourly payroll amount', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes("status = 'open'")) {
        return Promise.resolve([{
          id: 'att_1',
          tenantId: 'tenant_1',
          staffId: 'staff_1',
          staffName: 'Jess Cashier',
          shiftId: 'shift_1',
          status: 'open',
          clockInAt: '2026-06-05 08:00:00',
          breakStartedAt: null,
          breakMinutes: '30',
          scheduledMinutes: '480',
          payRate: '100.00',
          payType: 'hourly',
        }]);
      }
      if (sql.includes('UPDATE staff_attendance')) return Promise.resolve([]);
      if (sql.includes('UPDATE staff_shifts')) return Promise.resolve([]);
      if (sql.includes('WHERE tenant_id = ? AND id = ?')) {
        return Promise.resolve([{
          id: 'att_1',
          tenantId: 'tenant_1',
          staffId: 'staff_1',
          staffName: 'Jess Cashier',
          status: 'closed',
          clockInAt: '2026-06-05 08:00:00',
          clockOutAt: '2026-06-05 18:00:00',
          breakMinutes: '30',
          scheduledMinutes: '480',
          workedMinutes: '570',
          regularMinutes: '480',
          overtimeMinutes: '90',
          payRate: '100.00',
          payType: 'hourly',
          payrollAmount: '1025.00',
        }]);
      }
      return Promise.resolve([]);
    });

    const attendance = await clockOut('tenant_1', {
      staffId: 'staff_1',
      at: '2026-06-05T18:00:00',
    }, { staffId: 'staff_1', staffName: 'Jess Cashier' });

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'closed'"),
      ['2026-06-05 18:00:00', 30, 570, 480, 90, 1025, null, 'tenant_1', 'att_1']
    );
    expect(attendance).toMatchObject({ workedMinutes: 570, overtimeMinutes: 90, payrollAmount: 1025 });
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      action: 'staff.clock_out',
      details: expect.objectContaining({ workedMinutes: 570, overtimeMinutes: 90, payrollAmount: 1025 }),
    }));
  });

  it('exports timesheet payroll summaries and CSV rows', async () => {
    (dbModule.query as any).mockResolvedValue([
      {
        id: 'att_1',
        staffId: 'staff_1',
        staffName: 'Jess Cashier',
        status: 'closed',
        clockInAt: '2026-06-05 08:00:00',
        clockOutAt: '2026-06-05 17:00:00',
        breakMinutes: '30',
        scheduledMinutes: '480',
        workedMinutes: '510',
        regularMinutes: '480',
        overtimeMinutes: '30',
        payRate: '100.00',
        payType: 'hourly',
        payrollAmount: '875.00',
      },
    ]);

    const report = await getTimesheetPayrollReport('tenant_1', { startDate: '2026-06-05', endDate: '2026-06-05' });

    expect(report.summary).toMatchObject({
      staffCount: 1,
      entryCount: 1,
      workedMinutes: 510,
      overtimeMinutes: 30,
      payrollAmount: 875,
    });
    expect(report.filename).toBe('timesheet-payroll-2026-06-05-to-2026-06-05.csv');
    expect(report.csv).toContain('Jess Cashier');
    expect(report.csv).toContain('Payroll amount');
  });
});
