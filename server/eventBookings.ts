import { query } from "./db.js";
import { recordAuditEvent } from "./audit.js";

type EventBookingStatus = "inquiry" | "confirmed" | "in_progress" | "completed" | "cancelled";
type EventBookingType = "private" | "public" | "restaurant" | "catering" | "other";
type DepositStatus = "none" | "unpaid" | "paid" | "refunded";
type ReminderStatus = "none" | "pending" | "sent" | "failed" | "skipped";

type Actor = {
  staffId?: string | null;
  staffName?: string | null;
};

type EventBookingInput = Actor & {
  customerId?: string | null;
  customerName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  title?: string | null;
  eventType?: string | null;
  status?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  guestCount?: number | string | null;
  tableIds?: string[] | string | null;
  tableNumbers?: string[] | string | null;
  depositAmount?: number | string | null;
  depositStatus?: string | null;
  depositDueAt?: string | null;
  depositPaidAt?: string | null;
  depositReference?: string | null;
  menuNotes?: string | null;
  internalNotes?: string | null;
  reminderAt?: string | null;
  reminderStatus?: string | null;
  reminderSentAt?: string | null;
  reminderNote?: string | null;
};

function makeId() {
  return `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function text(value: unknown, max = 255) {
  const cleaned = String(value ?? "").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeType(value: unknown): EventBookingType {
  const next = String(value || "").trim().toLowerCase();
  return ["private", "public", "restaurant", "catering", "other"].includes(next) ? next as EventBookingType : "private";
}

function normalizeStatus(value: unknown, fallback: EventBookingStatus = "inquiry"): EventBookingStatus {
  const next = String(value || "").trim().toLowerCase();
  return ["inquiry", "confirmed", "in_progress", "completed", "cancelled"].includes(next) ? next as EventBookingStatus : fallback;
}

function normalizeDepositStatus(value: unknown, depositAmount = 0): DepositStatus {
  const next = String(value || "").trim().toLowerCase();
  if (["none", "unpaid", "paid", "refunded"].includes(next)) return next as DepositStatus;
  return depositAmount > 0 ? "unpaid" : "none";
}

function normalizeReminderStatus(value: unknown, reminderAt?: unknown): ReminderStatus {
  const next = String(value || "").trim().toLowerCase();
  if (["none", "pending", "sent", "failed", "skipped"].includes(next)) return next as ReminderStatus;
  return reminderAt ? "pending" : "none";
}

function parseJson(value: unknown, fallback: any) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTables(value: unknown) {
  const raw = Array.isArray(value) ? value : parseJson(value, []);
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((item) => text(item, 32)).filter(Boolean))) as string[];
}

function normalizeIds(value: unknown) {
  const raw = Array.isArray(value) ? value : parseJson(value, []);
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((item) => text(item, 64)).filter(Boolean))) as string[];
}

function combineLabels(...groups: string[][]) {
  return Array.from(new Set(groups.flat().map((item) => text(item, 64)).filter(Boolean))) as string[];
}

function validDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

function reservationWindow(startAt: unknown, endAt?: unknown) {
  const start = validDate(startAt);
  if (!start) throw new Error("Booking start date is invalid");
  const end = validDate(endAt) || new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return end.getTime() > start.getTime() ? { start, end } : { start, end: new Date(start.getTime() + 2 * 60 * 60 * 1000) };
}

async function customerSnapshot(tenantId: string, customerId?: string | null) {
  const id = text(customerId, 64);
  if (!id) return null;
  const rows = await query<any>(
    `SELECT id, name, phone, email FROM customers WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, id],
  );
  return rows[0] || null;
}

async function tableSnapshot(tenantId: string, tableIds: string[]) {
  if (tableIds.length === 0) return [];
  const placeholders = tableIds.map(() => "?").join(", ");
  const rows = await query<any>(
    `SELECT id, label FROM restaurant_tables WHERE tenant_id = ? AND id IN (${placeholders}) ORDER BY label ASC`,
    [tenantId, ...tableIds],
  );
  const found = new Set(rows.map((row: any) => row.id));
  const missing = tableIds.filter((id) => !found.has(id));
  if (missing.length > 0) throw new Error(`Unknown restaurant table: ${missing[0]}`);
  return rows;
}

async function resolveTables(tenantId: string, input: { tableIds?: unknown; tableNumbers?: unknown }) {
  const tableIds = normalizeIds(input.tableIds);
  const explicitLabels = normalizeTables(input.tableNumbers);
  if (tableIds.length === 0) return { tableIds, tableNumbers: explicitLabels };
  const tables = await tableSnapshot(tenantId, tableIds);
  return {
    tableIds,
    tableNumbers: combineLabels(tables.map((table: any) => table.label || table.id), explicitLabels),
  };
}

async function assertNoTableReservationConflict(
  tenantId: string,
  booking: { id?: string | null; status: EventBookingStatus; startAt: any; endAt?: any; tableIds: string[]; tableNumbers?: string[] },
) {
  if (!["confirmed", "in_progress"].includes(booking.status) || booking.tableIds.length === 0) return;
  const window = reservationWindow(booking.startAt, booking.endAt);
  const params: any[] = [tenantId, window.end.toISOString(), window.start.toISOString()];
  const exclude = booking.id ? "AND id <> ?" : "";
  if (booking.id) params.push(booking.id);
  const rows = await query<any>(
    `SELECT id, title, start_at AS startAt, end_at AS endAt, table_ids AS tableIds, table_numbers AS tableNumbers
       FROM event_bookings
      WHERE tenant_id = ?
        AND status IN ('confirmed','in_progress')
        AND start_at <= ?
        AND (end_at IS NULL OR end_at >= ?)
        ${exclude}`,
    params,
  );
  const requested = new Set(booking.tableIds);
  for (const row of rows) {
    const candidateIds = normalizeIds(row.tableIds ?? row.table_ids);
    if (!candidateIds.some((id) => requested.has(id))) continue;
    const candidateWindow = reservationWindow(row.startAt ?? row.start_at, row.endAt ?? row.end_at);
    const overlaps = candidateWindow.start.getTime() < window.end.getTime() && candidateWindow.end.getTime() > window.start.getTime();
    if (!overlaps) continue;
    const tableLabel = combineLabels(booking.tableNumbers || [], normalizeTables(row.tableNumbers ?? row.table_numbers))[0] || candidateIds.find((id) => requested.has(id)) || "table";
    throw new Error(`Reservation conflict: ${tableLabel} is already booked for ${row.title || "another booking"}.`);
  }
}

function serialize(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    customerId: row.customerId ?? row.customer_id ?? null,
    customerName: row.customerName ?? row.customer_name ?? null,
    contactPhone: row.contactPhone ?? row.contact_phone ?? null,
    contactEmail: row.contactEmail ?? row.contact_email ?? null,
    title: row.title,
    eventType: normalizeType(row.eventType ?? row.event_type),
    status: normalizeStatus(row.status),
    startAt: row.startAt ?? row.start_at,
    endAt: row.endAt ?? row.end_at ?? null,
    guestCount: number(row.guestCount ?? row.guest_count),
    tableNumbers: normalizeTables(row.tableNumbers ?? row.table_numbers),
    tableIds: normalizeIds(row.tableIds ?? row.table_ids),
    depositAmount: number(row.depositAmount ?? row.deposit_amount),
    depositStatus: normalizeDepositStatus(row.depositStatus ?? row.deposit_status, number(row.depositAmount ?? row.deposit_amount)),
    depositDueAt: row.depositDueAt ?? row.deposit_due_at ?? null,
    depositPaidAt: row.depositPaidAt ?? row.deposit_paid_at ?? null,
    depositReference: row.depositReference ?? row.deposit_reference ?? null,
    menuNotes: row.menuNotes ?? row.menu_notes ?? null,
    internalNotes: row.internalNotes ?? row.internal_notes ?? null,
    reminderAt: row.reminderAt ?? row.reminder_at ?? null,
    reminderStatus: normalizeReminderStatus(row.reminderStatus ?? row.reminder_status, row.reminderAt ?? row.reminder_at),
    reminderSentAt: row.reminderSentAt ?? row.reminder_sent_at ?? null,
    reminderNote: row.reminderNote ?? row.reminder_note ?? null,
    createdBy: row.createdBy ?? row.created_by ?? null,
    createdByName: row.createdByName ?? row.created_by_name ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

export async function listEventBookings(tenantId: string, filters: { from?: string; to?: string; status?: string; eventType?: string; reminderStatus?: string } = {}) {
  const where = ["tenant_id = ?"];
  const params: any[] = [tenantId];
  if (filters.from) {
    where.push("start_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("start_at <= ?");
    params.push(filters.to);
  }
  if (filters.status) {
    where.push("status = ?");
    params.push(normalizeStatus(filters.status));
  }
  if (filters.eventType) {
    where.push("event_type = ?");
    params.push(normalizeType(filters.eventType));
  }
  if (filters.reminderStatus) {
    where.push("reminder_status = ?");
    params.push(normalizeReminderStatus(filters.reminderStatus));
  }
  const rows = await query<any>(
    `SELECT
       id, tenant_id AS tenantId, customer_id AS customerId, customer_name AS customerName,
       contact_phone AS contactPhone, contact_email AS contactEmail, title,
       event_type AS eventType, status, start_at AS startAt, end_at AS endAt,
       guest_count AS guestCount, table_numbers AS tableNumbers, table_ids AS tableIds,
       deposit_amount AS depositAmount, deposit_status AS depositStatus,
       deposit_due_at AS depositDueAt, deposit_paid_at AS depositPaidAt, deposit_reference AS depositReference,
       menu_notes AS menuNotes, internal_notes AS internalNotes,
       reminder_at AS reminderAt, reminder_status AS reminderStatus,
       reminder_sent_at AS reminderSentAt, reminder_note AS reminderNote,
       created_by AS createdBy, created_by_name AS createdByName,
       created_at AS createdAt, updated_at AS updatedAt
     FROM event_bookings
     WHERE ${where.join(" AND ")}
     ORDER BY start_at ASC
     LIMIT 500`,
    params
  );
  return rows.map(serialize);
}

export async function getEventBooking(tenantId: string, id: string) {
  const rows = await query<any>(
    `SELECT *
     FROM event_bookings
     WHERE tenant_id = ? AND id = ?
     LIMIT 1`,
    [tenantId, id]
  );
  return rows[0] ? serialize(rows[0]) : null;
}

export async function createEventBooking(tenantId: string, input: EventBookingInput = {}) {
  const id = makeId();
  const title = text(input.title);
  if (!title) throw new Error("Event title is required");
  if (!input.startAt) throw new Error("Event start date is required");

  const row = {
    customerId: text(input.customerId, 64),
    customerName: text(input.customerName),
    contactPhone: text(input.contactPhone, 64),
    contactEmail: text(input.contactEmail),
    title,
    eventType: normalizeType(input.eventType),
    status: normalizeStatus(input.status),
    startAt: input.startAt,
    endAt: input.endAt || null,
    guestCount: Math.max(0, Math.floor(number(input.guestCount))),
    depositAmount: Math.max(0, number(input.depositAmount)),
    depositStatus: normalizeDepositStatus(input.depositStatus, Math.max(0, number(input.depositAmount))),
    depositDueAt: input.depositDueAt || null,
    depositPaidAt: input.depositPaidAt || null,
    depositReference: text(input.depositReference, 128),
    menuNotes: text(input.menuNotes, 2000),
    internalNotes: text(input.internalNotes, 2000),
    reminderAt: input.reminderAt || null,
    reminderStatus: normalizeReminderStatus(input.reminderStatus, input.reminderAt),
    reminderSentAt: input.reminderSentAt || null,
    reminderNote: text(input.reminderNote, 2000),
  };
  const customer = await customerSnapshot(tenantId, row.customerId);
  row.customerName = row.customerName || customer?.name || null;
  row.contactPhone = row.contactPhone || customer?.phone || null;
  row.contactEmail = row.contactEmail || customer?.email || null;
  const tables = await resolveTables(tenantId, input);
  const fullRow = { ...row, tableIds: tables.tableIds, tableNumbers: tables.tableNumbers };
  await assertNoTableReservationConflict(tenantId, fullRow);

  await query(
    `INSERT INTO event_bookings (
       id, tenant_id, customer_id, customer_name, contact_phone, contact_email,
       title, event_type, status, start_at, end_at, guest_count, table_numbers, table_ids,
       deposit_amount, deposit_status, deposit_due_at, deposit_paid_at, deposit_reference,
       menu_notes, internal_notes, reminder_at, reminder_status, reminder_sent_at, reminder_note,
       created_by, created_by_name, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      fullRow.customerId,
      fullRow.customerName,
      fullRow.contactPhone,
      fullRow.contactEmail,
      fullRow.title,
      fullRow.eventType,
      fullRow.status,
      fullRow.startAt,
      fullRow.endAt,
      fullRow.guestCount,
      JSON.stringify(fullRow.tableNumbers),
      JSON.stringify(fullRow.tableIds),
      fullRow.depositAmount,
      fullRow.depositStatus,
      fullRow.depositDueAt,
      fullRow.depositPaidAt,
      fullRow.depositReference,
      fullRow.menuNotes,
      fullRow.internalNotes,
      fullRow.reminderAt,
      fullRow.reminderStatus,
      fullRow.reminderSentAt,
      fullRow.reminderNote,
      input.staffId || null,
      input.staffName || null,
    ]
  );
  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "event_booking.created",
    entityType: "event_booking",
    entityId: id,
    staffId: input.staffId || null,
    staffName: input.staffName || null,
    customerId: fullRow.customerId,
    source: "bookings",
    details: fullRow,
  });
  return getEventBooking(tenantId, id);
}

export async function updateEventBooking(tenantId: string, id: string, input: EventBookingInput = {}) {
  const existing = await getEventBooking(tenantId, id);
  if (!existing) throw new Error("Event booking not found");
  const fields: string[] = [];
  const values: any[] = [];
  const next: any = { ...existing };
  const set = (column: string, value: any, key: string) => {
    fields.push(`${column} = ?`);
    values.push(value);
    next[key] = value;
    return { [key]: value };
  };
  const changes: Record<string, any> = {};
  if (input.customerId !== undefined) {
    const customerId = text(input.customerId, 64);
    const customer = await customerSnapshot(tenantId, customerId);
    Object.assign(changes, set("customer_id", customerId, "customerId"));
    if (input.customerName === undefined) Object.assign(changes, set("customer_name", customer?.name || null, "customerName"));
    if (input.contactPhone === undefined) Object.assign(changes, set("contact_phone", customer?.phone || null, "contactPhone"));
    if (input.contactEmail === undefined) Object.assign(changes, set("contact_email", customer?.email || null, "contactEmail"));
  }
  if (input.customerName !== undefined) Object.assign(changes, set("customer_name", text(input.customerName), "customerName"));
  if (input.contactPhone !== undefined) Object.assign(changes, set("contact_phone", text(input.contactPhone, 64), "contactPhone"));
  if (input.contactEmail !== undefined) Object.assign(changes, set("contact_email", text(input.contactEmail), "contactEmail"));
  if (input.title !== undefined) {
    const title = text(input.title);
    if (!title) throw new Error("Event title is required");
    Object.assign(changes, set("title", title, "title"));
  }
  if (input.eventType !== undefined) Object.assign(changes, set("event_type", normalizeType(input.eventType), "eventType"));
  if (input.status !== undefined) Object.assign(changes, set("status", normalizeStatus(input.status, existing.status), "status"));
  if (input.startAt !== undefined) Object.assign(changes, set("start_at", input.startAt, "startAt"));
  if (input.endAt !== undefined) Object.assign(changes, set("end_at", input.endAt || null, "endAt"));
  if (input.guestCount !== undefined) Object.assign(changes, set("guest_count", Math.max(0, Math.floor(number(input.guestCount))), "guestCount"));
  if (input.tableIds !== undefined || input.tableNumbers !== undefined) {
    const tables = await resolveTables(tenantId, {
      tableIds: input.tableIds !== undefined ? input.tableIds : existing.tableIds,
      tableNumbers: input.tableNumbers !== undefined ? input.tableNumbers : existing.tableNumbers,
    });
    Object.assign(changes, set("table_ids", JSON.stringify(tables.tableIds), "tableIds"));
    Object.assign(changes, set("table_numbers", JSON.stringify(tables.tableNumbers), "tableNumbers"));
  }
  if (input.depositAmount !== undefined) Object.assign(changes, set("deposit_amount", Math.max(0, number(input.depositAmount)), "depositAmount"));
  if (input.depositStatus !== undefined) Object.assign(changes, set("deposit_status", normalizeDepositStatus(input.depositStatus, next.depositAmount), "depositStatus"));
  if (input.depositDueAt !== undefined) Object.assign(changes, set("deposit_due_at", input.depositDueAt || null, "depositDueAt"));
  if (input.depositPaidAt !== undefined) Object.assign(changes, set("deposit_paid_at", input.depositPaidAt || null, "depositPaidAt"));
  if (input.depositReference !== undefined) Object.assign(changes, set("deposit_reference", text(input.depositReference, 128), "depositReference"));
  if (input.menuNotes !== undefined) Object.assign(changes, set("menu_notes", text(input.menuNotes, 2000), "menuNotes"));
  if (input.internalNotes !== undefined) Object.assign(changes, set("internal_notes", text(input.internalNotes, 2000), "internalNotes"));
  if (input.reminderAt !== undefined) Object.assign(changes, set("reminder_at", input.reminderAt || null, "reminderAt"));
  if (input.reminderStatus !== undefined) Object.assign(changes, set("reminder_status", normalizeReminderStatus(input.reminderStatus, next.reminderAt), "reminderStatus"));
  if (input.reminderSentAt !== undefined) Object.assign(changes, set("reminder_sent_at", input.reminderSentAt || null, "reminderSentAt"));
  if (input.reminderNote !== undefined) Object.assign(changes, set("reminder_note", text(input.reminderNote, 2000), "reminderNote"));
  if (fields.length === 0) return existing;
  await assertNoTableReservationConflict(tenantId, {
    id,
    status: next.status,
    startAt: next.startAt,
    endAt: next.endAt,
    tableIds: next.tableIds || [],
    tableNumbers: next.tableNumbers || [],
  });
  fields.push("updated_at = NOW()");
  values.push(tenantId, id);
  await query(`UPDATE event_bookings SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`, values);
  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "event_booking.updated",
    entityType: "event_booking",
    entityId: id,
    staffId: input.staffId || null,
    staffName: input.staffName || null,
    customerId: input.customerId !== undefined ? text(input.customerId, 64) : existing.customerId,
    source: "bookings",
    details: changes,
  });
  return getEventBooking(tenantId, id);
}

export async function deleteEventBooking(tenantId: string, id: string, actor: Actor = {}) {
  const existing = await getEventBooking(tenantId, id);
  if (!existing) throw new Error("Event booking not found");
  await query(`DELETE FROM event_bookings WHERE tenant_id = ? AND id = ?`, [tenantId, id]);
  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "event_booking.deleted",
    entityType: "event_booking",
    entityId: id,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    customerId: existing.customerId,
    source: "bookings",
    details: { title: existing.title, startAt: existing.startAt, status: existing.status },
  });
  return { success: true };
}
