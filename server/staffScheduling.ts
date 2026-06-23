import { query } from "./db.js";
import { recordAuditEventSafe } from "./audit.js";
type Actor = {
    staffId?: string | null;
    staffName?: string | null;
};
type ShiftStatus = "draft" | "published" | "cancelled" | "completed";
type StaffShiftInput = {
    staffId?: string;
    shiftDate?: string;
    startAt?: string;
    endAt?: string;
    status?: ShiftStatus;
    locationId?: string | null;
    breakMinutesPlanned?: number;
    notes?: string | null;
};
type ClockInput = {
    staffId?: string | null;
    staffName?: string | null;
    shiftId?: string | null;
    at?: string | Date | null;
    note?: string | null;
};
function id(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function toNumber(value: unknown, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
function dateOnly(value?: string | Date | null) {
    if (!value)
        return new Date().toISOString().slice(0, 10);
    if (value instanceof Date)
        return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
}
function toSqlDateTime(value?: string | Date | null) {
    if (!value)
        return new Date().toISOString().slice(0, 19).replace("T", " ");
    if (value instanceof Date)
        return value.toISOString().slice(0, 19).replace("T", " ");
    const raw = String(value).trim();
    if (!raw)
        return new Date().toISOString().slice(0, 19).replace("T", " ");
    return raw.slice(0, 19).replace("T", " ");
}
function parseTime(value?: string | Date | null) {
    if (!value)
        return new Date();
    if (value instanceof Date)
        return value;
    return new Date(String(value).replace(" ", "T"));
}
function minutesBetween(start?: string | Date | null, end?: string | Date | null) {
    const startDate = parseTime(start);
    const endDate = parseTime(end);
    const diff = Math.floor((endDate.getTime() - startDate.getTime()) / 60000);
    return Number.isFinite(diff) ? Math.max(0, diff) : 0;
}
function nextDateExclusive(value: string) {
    const d = new Date(`${dateOnly(value)}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
}
function csvEscape(value: unknown) {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function shiftFromRow(row: any) {
    return {
        id: row.id,
        tenantId: row.tenantId ?? row.tenant_id,
        staffId: row.staffId ?? row.staff_id,
        staffName: row.staffName ?? row.staff_name,
        role: row.role || null,
        shiftDate: row.shiftDate ?? row.shift_date,
        startAt: row.startAt ?? row.start_at,
        endAt: row.endAt ?? row.end_at,
        status: row.status || "draft",
        locationId: row.locationId ?? row.location_id ?? null,
        breakMinutesPlanned: toNumber(row.breakMinutesPlanned ?? row.break_minutes_planned),
        notes: row.notes || null,
        publishedAt: row.publishedAt ?? row.published_at ?? null,
        publishedBy: row.publishedBy ?? row.published_by ?? null,
        publishedByName: row.publishedByName ?? row.published_by_name ?? null,
        createdBy: row.createdBy ?? row.created_by ?? null,
        createdByName: row.createdByName ?? row.created_by_name ?? null,
        createdAt: row.createdAt ?? row.created_at,
        updatedAt: row.updatedAt ?? row.updated_at,
    };
}
function attendanceFromRow(row: any) {
    return {
        id: row.id,
        tenantId: row.tenantId ?? row.tenant_id,
        staffId: row.staffId ?? row.staff_id,
        staffName: row.staffName ?? row.staff_name,
        shiftId: row.shiftId ?? row.shift_id ?? null,
        status: row.status || "open",
        clockInAt: row.clockInAt ?? row.clock_in_at,
        clockOutAt: row.clockOutAt ?? row.clock_out_at ?? null,
        breakStartedAt: row.breakStartedAt ?? row.break_started_at ?? null,
        breakMinutes: toNumber(row.breakMinutes ?? row.break_minutes),
        scheduledMinutes: toNumber(row.scheduledMinutes ?? row.scheduled_minutes),
        workedMinutes: toNumber(row.workedMinutes ?? row.worked_minutes),
        regularMinutes: toNumber(row.regularMinutes ?? row.regular_minutes),
        overtimeMinutes: toNumber(row.overtimeMinutes ?? row.overtime_minutes),
        payRate: toNumber(row.payRate ?? row.pay_rate),
        payType: row.payType ?? row.pay_type ?? "hourly",
        payrollAmount: toNumber(row.payrollAmount ?? row.payroll_amount),
        note: row.note || null,
        shiftDate: row.shiftDate ?? row.shift_date ?? null,
        createdAt: row.createdAt ?? row.created_at,
        updatedAt: row.updatedAt ?? row.updated_at,
    };
}
async function getStaff(tenantId: string, staffId: string) {
    const rows = await query<any>(`SELECT id, name, role, pay_rate AS payRate, pay_type AS payType
       FROM staff
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1`, [tenantId, staffId]);
    if (!rows[0])
        throw new Error("Staff member not found.");
    return rows[0];
}
async function getShift(tenantId: string, shiftId: string) {
    const rows = await query<any>(`SELECT
        id, tenant_id AS tenantId, staff_id AS staffId, staff_name AS staffName,
        role, shift_date AS shiftDate, start_at AS startAt, end_at AS endAt,
        status, location_id AS locationId, break_minutes_planned AS breakMinutesPlanned,
        notes, published_at AS publishedAt, published_by AS publishedBy,
        published_by_name AS publishedByName, created_by AS createdBy,
        created_by_name AS createdByName, created_at AS createdAt, updated_at AS updatedAt
       FROM staff_shifts
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1`, [tenantId, shiftId]);
    return rows[0] ? shiftFromRow(rows[0]) : null;
}
async function findShiftForClockIn(tenantId: string, staffId: string, at: string, shiftId?: string | null) {
    if (shiftId) {
        const shift = await getShift(tenantId, shiftId);
        if (!shift || shift.staffId !== staffId || shift.status === "cancelled")
            throw new Error("Shift not found for this staff member.");
        return shift;
    }
    const rows = await query<any>(`SELECT
        id, tenant_id AS tenantId, staff_id AS staffId, staff_name AS staffName,
        role, shift_date AS shiftDate, start_at AS startAt, end_at AS endAt,
        status, location_id AS locationId, break_minutes_planned AS breakMinutesPlanned,
        notes, published_at AS publishedAt, published_by AS publishedBy,
        published_by_name AS publishedByName, created_by AS createdBy,
        created_by_name AS createdByName, created_at AS createdAt, updated_at AS updatedAt
       FROM staff_shifts
      WHERE tenant_id = $1
        AND staff_id = $2
        AND shift_date = $3
        AND status IN ('draft','published')
      ORDER BY CASE WHEN status = 'published' THEN 0 ELSE 1 END, start_at ASC
      LIMIT 1`, [tenantId, staffId, dateOnly(at)]);
    return rows[0] ? shiftFromRow(rows[0]) : null;
}
export async function listStaffShifts(tenantId: string, filters: {
    startDate?: string;
    endDate?: string;
    staffId?: string;
} = {}) {
    const startDate = dateOnly(filters.startDate);
    const endDate = dateOnly(filters.endDate || filters.startDate || startDate);
    const params: any[] = [tenantId, startDate, endDate];
    let staffFilter = "";
    if (filters.staffId) {
        staffFilter = " AND staff_id = $1";
        params.push(filters.staffId);
    }
    const rows = await query<any>(`SELECT
        id, tenant_id AS tenantId, staff_id AS staffId, staff_name AS staffName,
        role, shift_date AS shiftDate, start_at AS startAt, end_at AS endAt,
        status, location_id AS locationId, break_minutes_planned AS breakMinutesPlanned,
        notes, published_at AS publishedAt, published_by AS publishedBy,
        published_by_name AS publishedByName, created_by AS createdBy,
        created_by_name AS createdByName, created_at AS createdAt, updated_at AS updatedAt
       FROM staff_shifts
      WHERE tenant_id = $1 AND shift_date BETWEEN $2 AND $3${staffFilter}
      ORDER BY shift_date ASC, start_at ASC, staff_name ASC`, params);
    return rows.map(shiftFromRow);
}
export async function createStaffShift(tenantId: string, input: StaffShiftInput, actor: Actor = {}) {
    if (!input.staffId)
        throw new Error("Staff member is required.");
    if (!input.shiftDate || !input.startAt || !input.endAt)
        throw new Error("Shift date, start, and end are required.");
    if (minutesBetween(input.startAt, input.endAt) <= 0)
        throw new Error("Shift end must be after shift start.");
    const staff = await getStaff(tenantId, input.staffId);
    const shiftId = id("shift");
    const status: ShiftStatus = input.status === "published" ? "published" : "draft";
    await query(`INSERT INTO staff_shifts (
      id, tenant_id, staff_id, staff_name, role, shift_date, start_at, end_at,
      status, location_id, break_minutes_planned, notes, published_at, published_by,
      published_by_name, created_by, created_by_name, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, ${status === "published" ? "NOW()" : "NULL"}, $13, $14, $15, $16, NOW(), NOW())`, [
        shiftId,
        tenantId,
        staff.id,
        staff.name,
        staff.role || null,
        dateOnly(input.shiftDate),
        toSqlDateTime(input.startAt),
        toSqlDateTime(input.endAt),
        status,
        input.locationId || null,
        Math.max(0, Math.floor(toNumber(input.breakMinutesPlanned))),
        input.notes || null,
        status === "published" ? actor.staffId || null : null,
        status === "published" ? actor.staffName || null : null,
        actor.staffId || null,
        actor.staffName || null,
    ]);
    await recordAuditEventSafe({
        tenantId,
        action: "staff_shift.created",
        entityType: "staff_shift",
        entityId: shiftId,
        staffId: actor.staffId || null,
        staffName: actor.staffName || null,
        source: "workforce",
        details: { staffId: staff.id, shiftDate: dateOnly(input.shiftDate), status },
    });
    return getShift(tenantId, shiftId);
}
export async function updateStaffShift(tenantId: string, shiftId: string, input: Partial<StaffShiftInput>, actor: Actor = {}) {
    const current = await getShift(tenantId, shiftId);
    if (!current)
        throw new Error("Shift not found.");
    const fields: string[] = [];
    const values: any[] = [];
    if (input.staffId !== undefined && input.staffId !== current.staffId) {
        const staff = await getStaff(tenantId, input.staffId);
        fields.push("staff_id = $1", "staff_name = $1", "role = $1");
        values.push(staff.id, staff.name, staff.role || null);
    }
    if (input.shiftDate !== undefined) {
        fields.push("shift_date = $1");
        values.push(dateOnly(input.shiftDate));
    }
    if (input.startAt !== undefined) {
        fields.push("start_at = $1");
        values.push(toSqlDateTime(input.startAt));
    }
    if (input.endAt !== undefined) {
        fields.push("end_at = $1");
        values.push(toSqlDateTime(input.endAt));
    }
    if (input.status !== undefined) {
        const status: ShiftStatus = ["draft", "published", "cancelled", "completed"].includes(input.status) ? input.status : current.status;
        fields.push("status = $1");
        values.push(status);
        if (status === "published") {
            fields.push("published_at = COALESCE(published_at, NOW())", "published_by = $1", "published_by_name = $1");
            values.push(actor.staffId || current.publishedBy || null, actor.staffName || current.publishedByName || null);
        }
    }
    if (input.locationId !== undefined) {
        fields.push("location_id = $1");
        values.push(input.locationId || null);
    }
    if (input.breakMinutesPlanned !== undefined) {
        fields.push("break_minutes_planned = $1");
        values.push(Math.max(0, Math.floor(toNumber(input.breakMinutesPlanned))));
    }
    if (input.notes !== undefined) {
        fields.push("notes = $1");
        values.push(input.notes || null);
    }
    if (!fields.length)
        return current;
    fields.push("updated_at = NOW()");
    values.push(tenantId, shiftId);
    await query(`UPDATE staff_shifts SET ${fields.join(", ")} WHERE tenant_id = $1 AND id = $2`, values);
    await recordAuditEventSafe({
        tenantId,
        action: "staff_shift.updated",
        entityType: "staff_shift",
        entityId: shiftId,
        staffId: actor.staffId || null,
        staffName: actor.staffName || null,
        source: "workforce",
        details: { updates: input },
    });
    return getShift(tenantId, shiftId);
}
export async function cancelStaffShift(tenantId: string, shiftId: string, actor: Actor = {}) {
    const shift = await updateStaffShift(tenantId, shiftId, { status: "cancelled" }, actor);
    await recordAuditEventSafe({
        tenantId,
        action: "staff_shift.cancelled",
        entityType: "staff_shift",
        entityId: shiftId,
        staffId: actor.staffId || null,
        staffName: actor.staffName || null,
        source: "workforce",
        details: { staffId: shift?.staffId || null },
    });
    return shift;
}
export async function publishRoster(tenantId: string, startDateInput: string, endDateInput: string, actor: Actor = {}) {
    const startDate = dateOnly(startDateInput);
    const endDate = dateOnly(endDateInput || startDateInput);
    await query(`UPDATE staff_shifts
        SET status = 'published',
            published_at = COALESCE(published_at, NOW()),
            published_by = $1,
            published_by_name = $2,
            updated_at = NOW()
      WHERE tenant_id = $3
        AND shift_date BETWEEN $4 AND $5
        AND status = 'draft'`, [actor.staffId || null, actor.staffName || null, tenantId, startDate, endDate]);
    const shifts = await listStaffShifts(tenantId, { startDate, endDate });
    await recordAuditEventSafe({
        tenantId,
        action: "staff_roster.published",
        entityType: "staff_roster",
        entityId: `${startDate}:${endDate}`,
        staffId: actor.staffId || null,
        staffName: actor.staffName || null,
        source: "workforce",
        details: { startDate, endDate, publishedShiftCount: shifts.filter(shift => shift.status === "published").length },
    });
    return { startDate, endDate, shifts };
}
async function getOpenAttendance(tenantId: string, staffId: string) {
    const rows = await query<any>(`SELECT
        id, tenant_id AS tenantId, staff_id AS staffId, staff_name AS staffName,
        shift_id AS shiftId, status, clock_in_at AS clockInAt, clock_out_at AS clockOutAt,
        break_started_at AS breakStartedAt, break_minutes AS breakMinutes,
        scheduled_minutes AS scheduledMinutes, worked_minutes AS workedMinutes,
        regular_minutes AS regularMinutes, overtime_minutes AS overtimeMinutes,
        pay_rate AS payRate, pay_type AS payType, payroll_amount AS payrollAmount,
        note, created_at AS createdAt, updated_at AS updatedAt
       FROM staff_attendance
      WHERE tenant_id = $1 AND staff_id = $2 AND status = 'open'
      ORDER BY clock_in_at DESC
      LIMIT 1`, [tenantId, staffId]);
    return rows[0] ? attendanceFromRow(rows[0]) : null;
}
export async function getMyAttendanceStatus(tenantId: string, staffId: string) {
    const openAttendance = await getOpenAttendance(tenantId, staffId);
    const recentRows = await query<any>(`SELECT
        id, tenant_id AS tenantId, staff_id AS staffId, staff_name AS staffName,
        shift_id AS shiftId, status, clock_in_at AS clockInAt, clock_out_at AS clockOutAt,
        break_started_at AS breakStartedAt, break_minutes AS breakMinutes,
        scheduled_minutes AS scheduledMinutes, worked_minutes AS workedMinutes,
        regular_minutes AS regularMinutes, overtime_minutes AS overtimeMinutes,
        pay_rate AS payRate, pay_type AS payType, payroll_amount AS payrollAmount,
        note, created_at AS createdAt, updated_at AS updatedAt
       FROM staff_attendance
      WHERE tenant_id = $1 AND staff_id = $2
      ORDER BY clock_in_at DESC
      LIMIT 7`, [tenantId, staffId]);
    return {
        openAttendance,
        recentAttendance: recentRows.map(attendanceFromRow),
    };
}
export async function clockIn(tenantId: string, input: ClockInput, actor: Actor = {}) {
    const staffId = input.staffId || actor.staffId;
    if (!staffId)
        throw new Error("Staff member is required.");
    const staff = await getStaff(tenantId, staffId);
    const at = toSqlDateTime(input.at);
    const open = await getOpenAttendance(tenantId, staffId);
    if (open)
        throw new Error("Staff member is already clocked in.");
    const shift = await findShiftForClockIn(tenantId, staffId, at, input.shiftId || null);
    const attendanceId = id("att");
    const scheduledMinutes = shift ? Math.max(0, minutesBetween(shift.startAt, shift.endAt) - toNumber(shift.breakMinutesPlanned)) : 480;
    await query(`INSERT INTO staff_attendance (
      id, tenant_id, staff_id, staff_name, shift_id, status, clock_in_at,
      break_minutes, scheduled_minutes, pay_rate, pay_type, note, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, 'open', $6, 0, $7, $8, $9, $10, NOW(), NOW())`, [
        attendanceId,
        tenantId,
        staff.id,
        input.staffName || staff.name,
        shift?.id || null,
        at,
        scheduledMinutes,
        toNumber(staff.payRate ?? staff.pay_rate),
        staff.payType ?? staff.pay_type ?? "hourly",
        input.note || null,
    ]);
    await recordAuditEventSafe({
        tenantId,
        action: "staff.clock_in",
        entityType: "staff_attendance",
        entityId: attendanceId,
        staffId: staff.id,
        staffName: input.staffName || staff.name,
        source: "workforce",
        details: { shiftId: shift?.id || null, clockInAt: at },
    });
    return getOpenAttendance(tenantId, staff.id);
}
export async function startBreak(tenantId: string, staffId: string, atInput?: string | Date | null) {
    const attendance = await getOpenAttendance(tenantId, staffId);
    if (!attendance)
        throw new Error("Staff member is not clocked in.");
    if (attendance.breakStartedAt)
        throw new Error("Break is already running.");
    const at = toSqlDateTime(atInput);
    await query(`UPDATE staff_attendance
        SET break_started_at = $1, updated_at = NOW()
      WHERE tenant_id = $2 AND id = $3`, [at, tenantId, attendance.id]);
    await recordAuditEventSafe({
        tenantId,
        action: "staff.break_started",
        entityType: "staff_attendance",
        entityId: attendance.id,
        staffId,
        staffName: attendance.staffName,
        source: "workforce",
        details: { breakStartedAt: at },
    });
    return getOpenAttendance(tenantId, staffId);
}
export async function endBreak(tenantId: string, staffId: string, atInput?: string | Date | null) {
    const attendance = await getOpenAttendance(tenantId, staffId);
    if (!attendance)
        throw new Error("Staff member is not clocked in.");
    if (!attendance.breakStartedAt)
        throw new Error("No active break to end.");
    const at = toSqlDateTime(atInput);
    const additionalBreak = minutesBetween(attendance.breakStartedAt, at);
    await query(`UPDATE staff_attendance
        SET break_started_at = NULL,
            break_minutes = COALESCE(break_minutes, 0) + $1,
            updated_at = NOW()
      WHERE tenant_id = $2 AND id = $3`, [additionalBreak, tenantId, attendance.id]);
    await recordAuditEventSafe({
        tenantId,
        action: "staff.break_ended",
        entityType: "staff_attendance",
        entityId: attendance.id,
        staffId,
        staffName: attendance.staffName,
        source: "workforce",
        details: { breakEndedAt: at, additionalBreakMinutes: additionalBreak },
    });
    return getOpenAttendance(tenantId, staffId);
}
export async function clockOut(tenantId: string, input: ClockInput, actor: Actor = {}) {
    const staffId = input.staffId || actor.staffId;
    if (!staffId)
        throw new Error("Staff member is required.");
    const attendance = await getOpenAttendance(tenantId, staffId);
    if (!attendance)
        throw new Error("Staff member is not clocked in.");
    const at = toSqlDateTime(input.at);
    const openBreakMinutes = attendance.breakStartedAt ? minutesBetween(attendance.breakStartedAt, at) : 0;
    const breakMinutes = toNumber(attendance.breakMinutes) + openBreakMinutes;
    const workedMinutes = Math.max(0, minutesBetween(attendance.clockInAt, at) - breakMinutes);
    const scheduledMinutes = toNumber(attendance.scheduledMinutes, 480);
    const regularMinutes = Math.min(workedMinutes, scheduledMinutes || workedMinutes);
    const overtimeMinutes = Math.max(0, workedMinutes - regularMinutes);
    const payRate = toNumber(attendance.payRate);
    const payrollAmount = attendance.payType === "hourly"
        ? Number((((regularMinutes / 60) * payRate) + ((overtimeMinutes / 60) * payRate * 1.5)).toFixed(2))
        : 0;
    await query(`UPDATE staff_attendance
        SET status = 'closed',
            clock_out_at = $1,
            break_started_at = NULL,
            break_minutes = $2,
            worked_minutes = $3,
            regular_minutes = $4,
            overtime_minutes = $5,
            payroll_amount = $6,
            note = COALESCE($7, note),
            updated_at = NOW()
      WHERE tenant_id = $8 AND id = $9`, [at, breakMinutes, workedMinutes, regularMinutes, overtimeMinutes, payrollAmount, input.note || null, tenantId, attendance.id]);
    if (attendance.shiftId) {
        await query(`UPDATE staff_shifts SET status = 'completed', updated_at = NOW() WHERE tenant_id = $1 AND id = $2 AND status <> 'cancelled'`, [tenantId, attendance.shiftId]);
    }
    await recordAuditEventSafe({
        tenantId,
        action: "staff.clock_out",
        entityType: "staff_attendance",
        entityId: attendance.id,
        staffId,
        staffName: attendance.staffName,
        source: "workforce",
        details: { clockOutAt: at, workedMinutes, overtimeMinutes, payrollAmount },
    });
    const rows = await query<any>(`SELECT
        id, tenant_id AS tenantId, staff_id AS staffId, staff_name AS staffName,
        shift_id AS shiftId, status, clock_in_at AS clockInAt, clock_out_at AS clockOutAt,
        break_started_at AS breakStartedAt, break_minutes AS breakMinutes,
        scheduled_minutes AS scheduledMinutes, worked_minutes AS workedMinutes,
        regular_minutes AS regularMinutes, overtime_minutes AS overtimeMinutes,
        pay_rate AS payRate, pay_type AS payType, payroll_amount AS payrollAmount,
        note, created_at AS createdAt, updated_at AS updatedAt
       FROM staff_attendance
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1`, [tenantId, attendance.id]);
    return rows[0] ? attendanceFromRow(rows[0]) : null;
}
export async function getTimesheetPayrollReport(tenantId: string, filters: {
    startDate?: string;
    endDate?: string;
    staffId?: string;
} = {}) {
    const startDate = dateOnly(filters.startDate);
    const endDate = dateOnly(filters.endDate || filters.startDate || startDate);
    const startAt = `${startDate} 00:00:00`;
    const endExclusive = `${nextDateExclusive(endDate)} 00:00:00`;
    const params: any[] = [tenantId, startAt, endExclusive];
    let staffFilter = "";
    if (filters.staffId) {
        staffFilter = " AND a.staff_id = $1";
        params.push(filters.staffId);
    }
    const rows = await query<any>(`SELECT
        a.id, a.tenant_id AS tenantId, a.staff_id AS staffId, a.staff_name AS staffName,
        a.shift_id AS shiftId, a.status, a.clock_in_at AS clockInAt, a.clock_out_at AS clockOutAt,
        a.break_started_at AS breakStartedAt, a.break_minutes AS breakMinutes,
        a.scheduled_minutes AS scheduledMinutes, a.worked_minutes AS workedMinutes,
        a.regular_minutes AS regularMinutes, a.overtime_minutes AS overtimeMinutes,
        a.pay_rate AS payRate, a.pay_type AS payType, a.payroll_amount AS payrollAmount,
        a.note, s.shift_date AS shiftDate, a.created_at AS createdAt, a.updated_at AS updatedAt
       FROM staff_attendance a
       LEFT JOIN staff_shifts s ON s.tenant_id = a.tenant_id AND s.id = a.shift_id
      WHERE a.tenant_id = $1
        AND a.clock_in_at >= $2
        AND a.clock_in_at < $3${staffFilter}
      ORDER BY a.clock_in_at ASC, a.staff_name ASC`, params);
    const entries = rows.map(attendanceFromRow);
    const totalsByStaff = new Map<string, any>();
    for (const entry of entries) {
        const current = totalsByStaff.get(entry.staffId) || {
            staffId: entry.staffId,
            staffName: entry.staffName,
            workedMinutes: 0,
            regularMinutes: 0,
            overtimeMinutes: 0,
            breakMinutes: 0,
            payrollAmount: 0,
            shiftCount: 0,
        };
        current.workedMinutes += entry.workedMinutes;
        current.regularMinutes += entry.regularMinutes;
        current.overtimeMinutes += entry.overtimeMinutes;
        current.breakMinutes += entry.breakMinutes;
        current.payrollAmount += entry.payrollAmount;
        current.shiftCount += entry.status === "closed" ? 1 : 0;
        totalsByStaff.set(entry.staffId, current);
    }
    const staffTotals = [...totalsByStaff.values()].map(row => ({
        ...row,
        payrollAmount: Number(row.payrollAmount.toFixed(2)),
    }));
    const summary = {
        staffCount: staffTotals.length,
        entryCount: entries.length,
        workedMinutes: staffTotals.reduce((sum, row) => sum + row.workedMinutes, 0),
        regularMinutes: staffTotals.reduce((sum, row) => sum + row.regularMinutes, 0),
        overtimeMinutes: staffTotals.reduce((sum, row) => sum + row.overtimeMinutes, 0),
        breakMinutes: staffTotals.reduce((sum, row) => sum + row.breakMinutes, 0),
        payrollAmount: Number(staffTotals.reduce((sum, row) => sum + row.payrollAmount, 0).toFixed(2)),
    };
    const csvRows = [
        ["Staff", "Clock in", "Clock out", "Worked minutes", "Break minutes", "Regular minutes", "Overtime minutes", "Pay type", "Pay rate", "Payroll amount", "Status"],
        ...entries.map(entry => [
            entry.staffName,
            entry.clockInAt,
            entry.clockOutAt || "",
            entry.workedMinutes,
            entry.breakMinutes,
            entry.regularMinutes,
            entry.overtimeMinutes,
            entry.payType,
            entry.payRate,
            entry.payrollAmount.toFixed(2),
            entry.status,
        ]),
    ];
    return {
        generatedAt: new Date().toISOString(),
        periodStart: startDate,
        periodEnd: endDate,
        filename: `timesheet-payroll-${startDate}-to-${endDate}.csv`,
        mimeType: "text/csv;charset=utf-8",
        summary,
        staffTotals,
        entries,
        csv: csvRows.map(row => row.map(csvEscape).join(",")).join("\n"),
    };
}
