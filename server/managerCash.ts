import { getConnection, isPostgres, query } from "./db.js";
import { recordAuditEvent } from "./audit.js";

type Actor = {
  staffId?: string | null;
  staffName?: string | null;
  role?: string | null;
};

type ManagerCashMovementInput = {
  movementType?: string | null;
  direction?: string | null;
  amount?: number | string | null;
  cashSessionId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  sourceType?: string | null;
  cashSource?: string | null;
  referenceId?: string | null;
  category?: string | null;
  note?: string | null;
  receiptAttachmentUrl?: string | null;
  receiptAttachmentName?: string | null;
  countedBreakdown?: Record<string, number> | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
};

type WalletCashMovementInput = {
  ownerType?: "staff" | "customer" | string | null;
  ownerId?: string | null;
  direction?: "in" | "out" | string | null;
  amount?: number | string | null;
  note?: string | null;
  referenceId?: string | null;
  applyWalletDelta?: boolean;
  cashSource?: string | null;
  receiptAttachmentUrl?: string | null;
  receiptAttachmentName?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
};

type RegisterWalletCashMovementInput = {
  customerId?: string | null;
  cashSessionId?: string | null;
  direction?: "in" | "out" | string | null;
  amount?: number | string | null;
  note?: string | null;
};

type CashCustodyTransferInput = {
  fromType?: string | null;
  fromId?: string | null;
  fromName?: string | null;
  toType?: string | null;
  toId?: string | null;
  toName?: string | null;
  cashSessionId?: string | null;
  expectedAmount?: number | string | null;
  countedAmount?: number | string | null;
  countedBreakdown?: Record<string, number> | null;
  note?: string | null;
};

type CashCustodyTransferDecisionInput = {
  countedAmount?: number | string | null;
  countedBreakdown?: Record<string, number> | null;
  note?: string | null;
};

type CashCloseCheckpointInput = {
  businessDate?: string | null;
  countedAmount?: number | string | null;
  countedBreakdown?: Record<string, number> | null;
  note?: string | null;
};

const MOVEMENT_TYPES = new Set([
  "safe_drop",
  "cash_added",
  "petty_cash",
  "payout",
  "wallet_cash_in",
  "wallet_cash_out",
  "register_close",
  "manager_adjustment",
  "transfer",
]);

const CUSTODY_PARTY_TYPES = new Set([
  "register",
  "staff",
  "manager_float",
  "safe",
  "petty_cash",
]);

const CASH_SOURCES = new Set([
  "manager_float",
  "safe",
  "register",
  "staff",
  "cash_session",
  "petty_cash",
  "wallet_cash",
  "cash_custody",
  "supplier",
  "external",
]);

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function cleanString(value: unknown, max = 255) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function json(value: unknown, fallback: unknown = {}) {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
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

function normalizeMovementType(value: unknown) {
  const type = String(value || "manager_adjustment").trim();
  return MOVEMENT_TYPES.has(type) ? type : "manager_adjustment";
}

function defaultDirection(type: string) {
  if (["safe_drop", "wallet_cash_in", "register_close"].includes(type)) return "in";
  if (["cash_added", "petty_cash", "payout", "wallet_cash_out"].includes(type)) return "out";
  return "neutral";
}

function normalizeDirection(value: unknown, type: string) {
  const direction = String(value || defaultDirection(type)).trim();
  if (direction === "in" || direction === "out" || direction === "neutral") return direction;
  return defaultDirection(type);
}

function defaultCashSource(movementType: string, sourceType?: string | null) {
  const source = String(sourceType || "").trim();
  if (source === "register" || source === "cash_session") return "register";
  if (source === "wallet_cash") return "wallet_cash";
  if (source === "custody_transfer") return "cash_custody";
  if (movementType === "safe_drop") return "register";
  if (movementType === "petty_cash" || movementType === "payout" || movementType === "cash_added") return "manager_float";
  return "manager_float";
}

function normalizeCashSource(value: unknown, movementType: string, sourceType?: string | null) {
  const source = cleanString(value, 64) || defaultCashSource(movementType, sourceType);
  return CASH_SOURCES.has(source) ? source : defaultCashSource(movementType, sourceType);
}

function normalizeCustodyPartyType(value: unknown, fallback: string) {
  const type = String(value || fallback).trim();
  return CUSTODY_PARTY_TYPES.has(type) ? type : fallback;
}

function normalizeBreakdown(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, qty]) => {
    const numericKey = Number.parseFloat(key);
    const numericQty = toNumber(qty);
    if (Number.isFinite(numericKey) && numericKey > 0 && numericQty > 0) {
      acc[String(numericKey)] = Number(numericQty.toFixed(0));
    }
    return acc;
  }, {});
}

function breakdownTotal(value: Record<string, number>) {
  return Number(Object.entries(value).reduce((sum, [denomination, qty]) => {
    return sum + Number.parseFloat(denomination) * toNumber(qty);
  }, 0).toFixed(2));
}

function todayBusinessDate() {
  return new Date().toISOString().slice(0, 10);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function normalizeBusinessDate(value: unknown) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return todayBusinessDate();
}

function businessDateBounds(businessDate: string) {
  const start = new Date(`${businessDate}T00:00:00.000`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function isManagerHeldCash(type: string) {
  return type === "manager_float" || type === "safe";
}

function transferMovementDirection(fromType: string, toType: string) {
  if (isManagerHeldCash(toType) && !isManagerHeldCash(fromType)) return "in";
  if (isManagerHeldCash(fromType) && !isManagerHeldCash(toType)) return "out";
  return "neutral";
}

function rowToMovement(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    movementType: row.movementType ?? row.movement_type,
    direction: row.direction,
    amount: toNumber(row.amount),
    cashSessionId: row.cashSessionId ?? row.cash_session_id,
    staffId: row.staffId ?? row.staff_id,
    staffName: row.staffName ?? row.staff_name,
    customerId: row.customerId ?? row.customer_id,
    customerName: row.customerName ?? row.customer_name,
    sourceType: row.sourceType ?? row.source_type,
    cashSource: row.cashSource ?? row.cash_source,
    referenceId: row.referenceId ?? row.reference_id,
    category: row.category,
    note: row.note,
    receiptAttachmentUrl: row.receiptAttachmentUrl ?? row.receipt_attachment_url,
    receiptAttachmentName: row.receiptAttachmentName ?? row.receipt_attachment_name,
    countedBreakdown: (() => {
      const value = row.countedBreakdown ?? row.counted_breakdown;
      if (!value) return {};
      if (typeof value !== "string") return value;
      try { return JSON.parse(value); } catch { return {}; }
    })(),
    approvedBy: row.approvedBy ?? row.approved_by,
    approvedByName: row.approvedByName ?? row.approved_by_name,
    approvedAt: row.approvedAt ?? row.approved_at,
    createdBy: row.createdBy ?? row.created_by,
    createdByName: row.createdByName ?? row.created_by_name,
    createdAt: row.createdAt ?? row.created_at,
  };
}

function rowToTransfer(row: any) {
  if (!row) return null;
  const expectedAmount = toNumber(row.expectedAmount ?? row.expected_amount);
  const countedAmount = toNumber(row.countedAmount ?? row.counted_amount);
  const variance = toNumber(row.variance);
  const countedBreakdown = (() => {
    const value = row.countedBreakdown ?? row.counted_breakdown;
    if (!value) return {};
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return {}; }
  })();

  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    status: row.status,
    fromType: row.fromType ?? row.from_type,
    fromId: row.fromId ?? row.from_id,
    fromName: row.fromName ?? row.from_name,
    toType: row.toType ?? row.to_type,
    toId: row.toId ?? row.to_id,
    toName: row.toName ?? row.to_name,
    cashSessionId: row.cashSessionId ?? row.cash_session_id,
    expectedAmount,
    countedAmount,
    variance,
    countedBreakdown,
    note: row.note,
    requestedBy: row.requestedBy ?? row.requested_by,
    requestedByName: row.requestedByName ?? row.requested_by_name,
    confirmedBy: row.confirmedBy ?? row.confirmed_by,
    confirmedByName: row.confirmedByName ?? row.confirmed_by_name,
    cancelledBy: row.cancelledBy ?? row.cancelled_by,
    cancelledByName: row.cancelledByName ?? row.cancelled_by_name,
    cancelReason: row.cancelReason ?? row.cancel_reason,
    requestedAt: row.requestedAt ?? row.requested_at,
    confirmedAt: row.confirmedAt ?? row.confirmed_at,
    cancelledAt: row.cancelledAt ?? row.cancelled_at,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

function rowToCashClose(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    businessDate: row.businessDate ?? row.business_date,
    status: row.status,
    expectedPhysicalCash: toNumber(row.expectedPhysicalCash ?? row.expected_physical_cash),
    countedPhysicalCash: toNumber(row.countedPhysicalCash ?? row.counted_physical_cash),
    variance: toNumber(row.variance),
    managerFloat: toNumber(row.managerFloat ?? row.manager_float),
    openRegisterCash: toNumber(row.openRegisterCash ?? row.open_register_cash),
    pendingCashUpCash: toNumber(row.pendingCashUpCash ?? row.pending_cash_up_cash),
    walletLiability: toNumber(row.walletLiability ?? row.wallet_liability),
    pendingPayouts: toNumber(row.pendingPayouts ?? row.pending_payouts),
    pettyCashToday: toNumber(row.pettyCashToday ?? row.petty_cash_today),
    walletCashInToday: toNumber(row.walletCashInToday ?? row.wallet_cash_in_today),
    walletCashOutToday: toNumber(row.walletCashOutToday ?? row.wallet_cash_out_today),
    custodyPendingCount: toNumber(row.custodyPendingCount ?? row.custody_pending_count),
    custodyVarianceToday: toNumber(row.custodyVarianceToday ?? row.custody_variance_today),
    unresolvedItems: parseJson(row.unresolvedItems ?? row.unresolved_items, []),
    countedBreakdown: parseJson(row.countedBreakdown ?? row.counted_breakdown, {}),
    note: row.note,
    closedBy: row.closedBy ?? row.closed_by,
    closedByName: row.closedByName ?? row.closed_by_name,
    closedAt: row.closedAt ?? row.closed_at,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

async function insertManagerCashMovement(conn: Pick<Awaited<ReturnType<typeof getConnection>>, "query">, movement: any) {
  const approvedBy = movement.approvedBy || movement.createdBy || null;
  const approvedByName = movement.approvedByName || movement.createdByName || null;
  await conn.query(
    `INSERT INTO manager_cash_movements (
       id, tenant_id, movement_type, direction, amount, cash_session_id,
       staff_id, staff_name, customer_id, customer_name, source_type, reference_id,
       cash_source, category, note, receipt_attachment_url, receipt_attachment_name,
       counted_breakdown, approved_by, approved_by_name, approved_at,
       created_by, created_by_name, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      movement.id,
      movement.tenantId,
      movement.movementType,
      movement.direction,
      movement.amount,
      movement.cashSessionId || null,
      movement.staffId || null,
      movement.staffName || null,
      movement.customerId || null,
      movement.customerName || null,
      movement.sourceType || "manager_float",
      movement.referenceId || null,
      movement.cashSource || defaultCashSource(movement.movementType, movement.sourceType),
      movement.category || null,
      movement.note || null,
      movement.receiptAttachmentUrl || null,
      movement.receiptAttachmentName || null,
      json(movement.countedBreakdown, {}),
      approvedBy,
      approvedByName,
      movement.approvedAt || (approvedBy ? new Date() : null),
      movement.createdBy || null,
      movement.createdByName || null,
    ]
  );
}

async function insertRegisterTransferMovement(conn: Pick<Awaited<ReturnType<typeof getConnection>>, "query">, transfer: any, actor: Actor) {
  const amount = toNumber(transfer.countedAmount);
  if (!transfer.cashSessionId || amount <= 0) return;

  const fromType = String(transfer.fromType || "");
  const toType = String(transfer.toType || "");
  if (fromType !== "register" && toType !== "register") return;

  const delta = fromType === "register" ? -amount : amount;
  const movementType = fromType === "register" ? "cash_drop" : "cash_added";
  const direction = fromType === "register" ? "out" : "in";
  const cashMovementId = makeId("cm");

  await conn.query(
    `UPDATE cash_sessions
        SET expected_cash = COALESCE(expected_cash, 0) + ?,
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ? AND status = 'open'`,
    [delta, transfer.tenantId, transfer.cashSessionId]
  );

  await conn.query(
    `INSERT INTO cash_movements (
      id, tenant_id, cash_session_id, type, direction, amount, sale_id, payment_id,
      staff_id, staff_name, created_by, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      cashMovementId,
      transfer.tenantId,
      transfer.cashSessionId,
      movementType,
      direction,
      amount,
      null,
      null,
      transfer.fromType === "staff" ? transfer.fromId : transfer.toType === "staff" ? transfer.toId : null,
      transfer.fromType === "staff" ? transfer.fromName : transfer.toType === "staff" ? transfer.toName : null,
      actor.staffId || null,
      `Custody transfer confirmed: ${transfer.fromName || transfer.fromType} to ${transfer.toName || transfer.toType}`,
    ]
  );

  await recordAuditEvent(conn, {
    tenantId: transfer.tenantId,
    action: "cash_movement.recorded",
    entityType: "cash_movement",
    entityId: cashMovementId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "cash_custody",
    details: {
      cashSessionId: transfer.cashSessionId,
      transferId: transfer.id,
      type: movementType,
      direction,
      amount,
    },
  });
}

export async function recordManagerCashMovement(tenantId: string, input: ManagerCashMovementInput, actor: Actor = {}) {
  const movementType = normalizeMovementType(input.movementType);
  const direction = normalizeDirection(input.direction, movementType);
  const amount = Number(toNumber(input.amount).toFixed(2));
  if (amount <= 0) throw new Error("Enter a manager cash amount greater than zero.");

  const id = makeId("mcm");
  const sourceType = cleanString(input.sourceType, 64) || "manager_float";
  const approvedBy = cleanString(input.approvedBy, 64) || actor.staffId || null;
  const approvedByName = cleanString(input.approvedByName, 255) || actor.staffName || null;
  const movement = {
    id,
    tenantId,
    movementType,
    direction,
    amount,
    cashSessionId: cleanString(input.cashSessionId, 64),
    staffId: cleanString(input.staffId, 64),
    staffName: cleanString(input.staffName, 255),
    customerId: cleanString(input.customerId, 64),
    customerName: cleanString(input.customerName, 255),
    sourceType,
    cashSource: normalizeCashSource(input.cashSource, movementType, sourceType),
    referenceId: cleanString(input.referenceId, 128),
    category: cleanString(input.category, 96),
    note: cleanString(input.note, 500),
    receiptAttachmentUrl: cleanString(input.receiptAttachmentUrl, 1000),
    receiptAttachmentName: cleanString(input.receiptAttachmentName, 255),
    countedBreakdown: input.countedBreakdown || {},
    approvedBy,
    approvedByName,
    approvedAt: approvedBy ? new Date() : null,
    createdBy: actor.staffId || null,
    createdByName: actor.staffName || null,
  };

  await insertManagerCashMovement({ query } as any, movement);

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: `manager_cash.${movementType}`,
    entityType: "manager_cash_movement",
    entityId: id,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "cash_management",
    details: movement,
  });

  return movement;
}

export async function createCashCustodyTransfer(tenantId: string, input: CashCustodyTransferInput, actor: Actor = {}) {
  const fromType = normalizeCustodyPartyType(input.fromType, "manager_float");
  const toType = normalizeCustodyPartyType(input.toType, "register");
  if (fromType === toType) throw new Error("Choose two different cash custody points.");

  const countedBreakdown = normalizeBreakdown(input.countedBreakdown);
  const countedFromBreakdown = breakdownTotal(countedBreakdown);
  const expectedAmount = Number(toNumber(input.expectedAmount).toFixed(2));
  const countedAmount = Number((toNumber(input.countedAmount) || countedFromBreakdown || 0).toFixed(2));
  if (expectedAmount <= 0) throw new Error("Enter the expected transfer amount.");

  const id = makeId("cct");
  const transfer = {
    id,
    tenantId,
    status: "pending_confirmation",
    fromType,
    fromId: cleanString(input.fromId, 64),
    fromName: cleanString(input.fromName, 255) || fromType.replace(/_/g, " "),
    toType,
    toId: cleanString(input.toId, 64),
    toName: cleanString(input.toName, 255) || toType.replace(/_/g, " "),
    cashSessionId: cleanString(input.cashSessionId, 64),
    expectedAmount,
    countedAmount,
    variance: Number((countedAmount - expectedAmount).toFixed(2)),
    countedBreakdown,
    note: cleanString(input.note, 500),
    requestedBy: actor.staffId || null,
    requestedByName: actor.staffName || null,
  };

  await query(
    `INSERT INTO cash_custody_transfers (
       id, tenant_id, status, from_type, from_id, from_name, to_type, to_id, to_name,
       cash_session_id, expected_amount, counted_amount, variance, counted_breakdown,
       note, requested_by, requested_by_name, requested_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
    [
      transfer.id,
      transfer.tenantId,
      transfer.status,
      transfer.fromType,
      transfer.fromId,
      transfer.fromName,
      transfer.toType,
      transfer.toId,
      transfer.toName,
      transfer.cashSessionId,
      transfer.expectedAmount,
      transfer.countedAmount,
      transfer.variance,
      json(transfer.countedBreakdown, {}),
      transfer.note,
      transfer.requestedBy,
      transfer.requestedByName,
    ]
  );

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "cash_transfer.requested",
    entityType: "cash_custody_transfer",
    entityId: id,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "cash_management",
    details: transfer,
  });

  return transfer;
}

export async function getCashCustodyTransfers(tenantId: string, status?: string | null, limit = 25) {
  const params: any[] = [tenantId];
  let statusClause = "";
  if (status && ["pending_confirmation", "confirmed", "cancelled"].includes(status)) {
    statusClause = " AND status = ?";
    params.push(status);
  }
  params.push(Math.max(1, Math.min(200, Math.round(toNumber(limit) || 25))));

  const rows = await query<any>(
    `SELECT id,
            tenant_id AS tenantId,
            status,
            from_type AS fromType,
            from_id AS fromId,
            from_name AS fromName,
            to_type AS toType,
            to_id AS toId,
            to_name AS toName,
            cash_session_id AS cashSessionId,
            expected_amount AS expectedAmount,
            counted_amount AS countedAmount,
            variance,
            counted_breakdown AS countedBreakdown,
            note,
            requested_by AS requestedBy,
            requested_by_name AS requestedByName,
            confirmed_by AS confirmedBy,
            confirmed_by_name AS confirmedByName,
            cancelled_by AS cancelledBy,
            cancelled_by_name AS cancelledByName,
            cancel_reason AS cancelReason,
            requested_at AS requestedAt,
            confirmed_at AS confirmedAt,
            cancelled_at AS cancelledAt,
            created_at AS createdAt,
            updated_at AS updatedAt
       FROM cash_custody_transfers
      WHERE tenant_id = ?${statusClause}
      ORDER BY created_at DESC
      LIMIT ?`,
    params
  );
  return rows.map(rowToTransfer);
}

export async function confirmCashCustodyTransfer(tenantId: string, transferId: string, input: CashCustodyTransferDecisionInput = {}, actor: Actor = {}) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<any>(
      `SELECT *
         FROM cash_custody_transfers
        WHERE tenant_id = ? AND id = ?
        LIMIT 1
        FOR UPDATE`,
      [tenantId, transferId]
    );
    const current = rowToTransfer(rows[0]);
    if (!current?.id) throw new Error("Cash transfer not found.");
    if (current.status !== "pending_confirmation") throw new Error("Only pending transfers can be confirmed.");
    if (current.requestedBy && current.requestedBy === actor.staffId && actor.role !== "admin" && actor.role !== "dev") {
      throw new Error("A second manager or admin must confirm this cash handover.");
    }

    const countedBreakdown = Object.keys(normalizeBreakdown(input.countedBreakdown)).length > 0
      ? normalizeBreakdown(input.countedBreakdown)
      : normalizeBreakdown(current.countedBreakdown);
    const countedFromBreakdown = breakdownTotal(countedBreakdown);
    const countedAmount = Number((toNumber(input.countedAmount) || countedFromBreakdown || current.countedAmount || current.expectedAmount).toFixed(2));
    if (countedAmount <= 0) throw new Error("Enter the confirmed counted amount.");

    const confirmedTransfer = {
      ...current,
      status: "confirmed",
      countedAmount,
      variance: Number((countedAmount - current.expectedAmount).toFixed(2)),
      countedBreakdown,
      confirmedBy: actor.staffId || null,
      confirmedByName: actor.staffName || null,
      note: cleanString(input.note, 500) || current.note,
    };

    await conn.query(
      `UPDATE cash_custody_transfers
          SET status = 'confirmed',
              counted_amount = ?,
              variance = ?,
              counted_breakdown = ?,
              note = ?,
              confirmed_by = ?,
              confirmed_by_name = ?,
              confirmed_at = NOW(),
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [
        confirmedTransfer.countedAmount,
        confirmedTransfer.variance,
        json(confirmedTransfer.countedBreakdown, {}),
        confirmedTransfer.note,
        confirmedTransfer.confirmedBy,
        confirmedTransfer.confirmedByName,
        tenantId,
        transferId,
      ]
    );

    const direction = transferMovementDirection(current.fromType, current.toType);
    if (direction !== "neutral") {
      await insertManagerCashMovement(conn, {
        id: makeId("mcm"),
        tenantId,
        movementType: "transfer",
        direction,
        amount: countedAmount,
        cashSessionId: current.cashSessionId,
        staffId: current.fromType === "staff" ? current.fromId : current.toType === "staff" ? current.toId : null,
        staffName: current.fromType === "staff" ? current.fromName : current.toType === "staff" ? current.toName : null,
        customerId: null,
        customerName: null,
        sourceType: "custody_transfer",
        cashSource: direction === "in" ? current.fromType : current.toType,
        referenceId: transferId,
        category: "cash_custody",
        note: `Confirmed transfer from ${current.fromName || current.fromType} to ${current.toName || current.toType}`,
        countedBreakdown,
        approvedBy: actor.staffId || null,
        approvedByName: actor.staffName || null,
        createdBy: actor.staffId || null,
        createdByName: actor.staffName || null,
      });
    }

    await insertRegisterTransferMovement(conn, confirmedTransfer, actor);
    await recordAuditEvent(conn, {
      tenantId,
      action: "cash_transfer.confirmed",
      entityType: "cash_custody_transfer",
      entityId: transferId,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      source: "cash_management",
      details: confirmedTransfer,
    });
    await conn.commit();
    return confirmedTransfer;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function cancelCashCustodyTransfer(tenantId: string, transferId: string, input: CashCustodyTransferDecisionInput = {}, actor: Actor = {}) {
  const reason = cleanString(input.note, 500);
  await query(
    `UPDATE cash_custody_transfers
        SET status = 'cancelled',
            cancel_reason = ?,
            cancelled_by = ?,
            cancelled_by_name = ?,
            cancelled_at = NOW(),
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ? AND status = 'pending_confirmation'`,
    [reason, actor.staffId || null, actor.staffName || null, tenantId, transferId]
  );

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "cash_transfer.cancelled",
    entityType: "cash_custody_transfer",
    entityId: transferId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "cash_management",
    details: { reason },
  });

  return { success: true };
}

export async function recordWalletCashMovement(tenantId: string, input: WalletCashMovementInput, actor: Actor = {}) {
  const ownerType = input.ownerType === "customer" ? "customer" : "staff";
  const ownerId = cleanString(input.ownerId, 64);
  if (!ownerId) throw new Error("Choose the wallet owner first.");
  const direction = input.direction === "out" ? "out" : "in";
  const amount = Number(toNumber(input.amount).toFixed(2));
  if (amount <= 0) throw new Error("Enter a wallet cash amount greater than zero.");
  const applyWalletDelta = input.applyWalletDelta !== false;
  const conn = await getConnection();

  try {
    await conn.beginTransaction();
    const tableName = ownerType === "customer" ? "customers" : "staff";
    const [ownerRows] = await conn.query<any>(
      `SELECT id, name, wallet_balance AS walletBalance
         FROM ${tableName}
        WHERE tenant_id = ? AND id = ?
        LIMIT 1
        FOR UPDATE`,
      [tenantId, ownerId]
    );
    const owner = ownerRows[0];
    if (!owner) throw new Error("Wallet owner not found.");

    const previousBalance = toNumber(owner.walletBalance ?? owner.wallet_balance);
    const delta = direction === "in" ? amount : -amount;
    const nextBalance = Number(Math.max(0, previousBalance + delta).toFixed(2));
    if (applyWalletDelta && direction === "out" && previousBalance < amount) {
      throw new Error("Wallet balance is not enough for this cash payout.");
    }

    if (applyWalletDelta) {
      await conn.query(
        `UPDATE ${tableName}
            SET wallet_balance = ?,
                updated_at = NOW()
          WHERE tenant_id = ? AND id = ?`,
        [nextBalance, tenantId, ownerId]
      );
    }

    const movement = {
      id: makeId("mcm"),
      tenantId,
      movementType: direction === "in" ? "wallet_cash_in" : "wallet_cash_out",
      direction,
      amount,
      cashSessionId: null,
      staffId: ownerType === "staff" ? owner.id : null,
      staffName: ownerType === "staff" ? owner.name : null,
      customerId: ownerType === "customer" ? owner.id : null,
      customerName: ownerType === "customer" ? owner.name : null,
      sourceType: "wallet_cash",
      cashSource: normalizeCashSource(input.cashSource, direction === "in" ? "wallet_cash_in" : "wallet_cash_out", "wallet_cash"),
      referenceId: cleanString(input.referenceId, 128),
      category: direction === "in" ? "wallet_top_up" : "wallet_payout",
      note: cleanString(input.note, 500) || (direction === "in" ? "Wallet cash received" : "Wallet cash paid out"),
      receiptAttachmentUrl: cleanString(input.receiptAttachmentUrl, 1000),
      receiptAttachmentName: cleanString(input.receiptAttachmentName, 255),
      countedBreakdown: {},
      approvedBy: cleanString(input.approvedBy, 64) || actor.staffId || null,
      approvedByName: cleanString(input.approvedByName, 255) || actor.staffName || null,
      createdBy: actor.staffId || null,
      createdByName: actor.staffName || null,
    };

    await insertManagerCashMovement(conn, movement);
    await recordAuditEvent(conn, {
      tenantId,
      action: `wallet_cash.${direction}`,
      entityType: `${ownerType}_wallet`,
      entityId: owner.id,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      customerId: ownerType === "customer" ? owner.id : null,
      source: "wallet_admin",
      details: {
        movement,
        ownerType,
        ownerId: owner.id,
        appliedWalletDelta: applyWalletDelta,
        previousBalance,
        nextBalance: applyWalletDelta ? nextBalance : previousBalance,
      },
    });
    await conn.commit();

    return {
      movement,
      ownerType,
      ownerId: owner.id,
      previousBalance,
      nextBalance: applyWalletDelta ? nextBalance : previousBalance,
      appliedWalletDelta: applyWalletDelta,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function recordRegisterWalletCashMovement(tenantId: string, input: RegisterWalletCashMovementInput, actor: Actor = {}) {
  const customerId = cleanString(input.customerId, 64);
  if (!customerId) throw new Error("Choose the customer wallet first.");
  const cashSessionId = cleanString(input.cashSessionId, 64);
  if (!cashSessionId) throw new Error("Open the register before recording wallet cash.");
  const direction = input.direction === "out" ? "out" : "in";
  const amount = Number(toNumber(input.amount).toFixed(2));
  if (amount <= 0) throw new Error("Enter a wallet cash amount greater than zero.");

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [sessionRows] = await conn.query<any>(
      `SELECT id,
              staff_id AS staffId,
              staff_name AS staffName,
              status,
              expected_cash AS expectedCash
         FROM cash_sessions
        WHERE tenant_id = ? AND id = ?
        LIMIT 1
        FOR UPDATE`,
      [tenantId, cashSessionId]
    );
    const session = sessionRows[0];
    if (!session) throw new Error("Cash session not found.");
    if (session.status !== "open") throw new Error("Wallet cash can only be recorded against an open register.");
    if (
      actor.staffId &&
      session.staffId &&
      actor.staffId !== session.staffId &&
      !["admin", "manager", "dev"].includes(String(actor.role || "").toLowerCase())
    ) {
      throw new Error("Only a manager can record wallet cash on another staff member's register.");
    }

    const [customerRows] = await conn.query<any>(
      `SELECT id, name, wallet_balance AS walletBalance
         FROM customers
        WHERE tenant_id = ? AND id = ?
        LIMIT 1
        FOR UPDATE`,
      [tenantId, customerId]
    );
    const customer = customerRows[0];
    if (!customer) throw new Error("Customer wallet not found.");

    const previousBalance = toNumber(customer.walletBalance ?? customer.wallet_balance);
    if (direction === "out" && previousBalance < amount) {
      throw new Error("Customer wallet balance is not enough for this payout.");
    }

    const walletDelta = direction === "in" ? amount : -amount;
    const nextBalance = Number((previousBalance + walletDelta).toFixed(2));
    const cashMovementId = makeId("cm");
    const cashMovementType = direction === "in" ? "wallet_cash_in" : "wallet_cash_out";
    const note = cleanString(input.note, 500) || (direction === "in" ? "Customer wallet cash top-up" : "Customer wallet cash payout");

    await conn.query(
      `UPDATE customers
          SET wallet_balance = ?,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [nextBalance, tenantId, customer.id]
    );

    await conn.query(
      `UPDATE cash_sessions
          SET expected_cash = COALESCE(expected_cash, 0) + ?,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [walletDelta, tenantId, cashSessionId]
    );

    await conn.query(
      `INSERT INTO cash_movements (
        id, tenant_id, cash_session_id, type, direction, amount, sale_id, payment_id,
        staff_id, staff_name, created_by, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        cashMovementId,
        tenantId,
        cashSessionId,
        cashMovementType,
        direction,
        amount,
        null,
        null,
        session.staffId || actor.staffId || null,
        session.staffName || actor.staffName || null,
        actor.staffId || null,
        note,
      ]
    );
    await recordAuditEvent(conn, {
      tenantId,
      action: "cash_movement.recorded",
      entityType: "cash_movement",
      entityId: cashMovementId,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      customerId: customer.id,
      source: "cashier_wallet_cash",
      details: {
        cashSessionId,
        type: cashMovementType,
        direction,
        amount,
        customerId: customer.id,
        customerName: customer.name,
        note,
      },
    });

    const movement = {
      id: makeId("mcm"),
      tenantId,
      movementType: cashMovementType,
      direction: "neutral",
      amount,
      cashSessionId,
      staffId: session.staffId || actor.staffId || null,
      staffName: session.staffName || actor.staffName || null,
      customerId: customer.id,
      customerName: customer.name,
      sourceType: "cash_session",
      cashSource: "register",
      referenceId: cashMovementId,
      category: direction === "in" ? "wallet_top_up" : "wallet_payout",
      note,
      countedBreakdown: {},
      approvedBy: actor.staffId || null,
      approvedByName: actor.staffName || null,
      createdBy: actor.staffId || null,
      createdByName: actor.staffName || null,
    };

    await insertManagerCashMovement(conn, movement);
    await recordAuditEvent(conn, {
      tenantId,
      action: direction === "in" ? "customer_wallet.cash_top_up" : "customer_wallet.cash_payout",
      entityType: "customer_wallet",
      entityId: customer.id,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      customerId: customer.id,
      source: "cashier_wallet_cash",
      details: {
        cashSessionId,
        cashMovementId,
        managerCashMovementId: movement.id,
        direction,
        amount,
        previousBalance,
        nextBalance,
        cashSessionDelta: walletDelta,
      },
    });

    await conn.commit();
    return {
      cashMovementId,
      movement,
      customerId: customer.id,
      customerName: customer.name,
      previousBalance,
      nextBalance,
      cashSessionId,
      cashSessionDelta: walletDelta,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

type ManagerCashMovementFilters = {
  limit?: number | string | null;
  movementType?: string | null;
  direction?: string | null;
  cashSource?: string | null;
  sourceType?: string | null;
  staffId?: string | null;
  customerId?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
};

function normalizeManagerCashMovementFilters(filtersOrLimit?: ManagerCashMovementFilters | number | null): ManagerCashMovementFilters {
  if (typeof filtersOrLimit === "number") return { limit: filtersOrLimit };
  return filtersOrLimit || {};
}

function managerCashMovementWhere(tenantId: string, filtersOrLimit?: ManagerCashMovementFilters | number | null) {
  const filters = normalizeManagerCashMovementFilters(filtersOrLimit);
  const clauses = ["tenant_id = ?"];
  const params: any[] = [tenantId];

  const movementType = cleanString(filters.movementType, 64);
  if (movementType && MOVEMENT_TYPES.has(movementType)) {
    clauses.push("movement_type = ?");
    params.push(movementType);
  }

  const direction = cleanString(filters.direction, 16);
  if (direction && ["in", "out", "neutral"].includes(direction)) {
    clauses.push("direction = ?");
    params.push(direction);
  }

  const cashSource = cleanString(filters.cashSource, 64);
  if (cashSource) {
    clauses.push("cash_source = ?");
    params.push(cashSource);
  }

  const sourceType = cleanString(filters.sourceType, 64);
  if (sourceType) {
    clauses.push("source_type = ?");
    params.push(sourceType);
  }

  const staffId = cleanString(filters.staffId, 64);
  if (staffId) {
    clauses.push("staff_id = ?");
    params.push(staffId);
  }

  const customerId = cleanString(filters.customerId, 64);
  if (customerId) {
    clauses.push("customer_id = ?");
    params.push(customerId);
  }

  const from = cleanString(filters.from, 40);
  if (from) {
    clauses.push("created_at >= ?");
    params.push(from);
  }

  const to = cleanString(filters.to, 40);
  if (to) {
    clauses.push("created_at <= ?");
    params.push(to);
  }

  const search = cleanString(filters.search, 120);
  if (search) {
    clauses.push(`LOWER(CONCAT_WS(' ',
      COALESCE(note, ''),
      COALESCE(category, ''),
      COALESCE(staff_name, ''),
      COALESCE(customer_name, ''),
      COALESCE(source_type, ''),
      COALESCE(cash_source, ''),
      COALESCE(reference_id, ''),
      COALESCE(receipt_attachment_name, ''),
      COALESCE(approved_by_name, '')
    )) LIKE ?`);
    params.push(`%${search.toLowerCase()}%`);
  }

  const limit = Math.max(1, Math.min(500, Math.round(toNumber(filters.limit) || 40)));
  return { where: clauses.join(" AND "), params, limit };
}

export async function getManagerCashMovements(tenantId: string, filtersOrLimit: ManagerCashMovementFilters | number = 40) {
  const { where, params, limit } = managerCashMovementWhere(tenantId, filtersOrLimit);
  const rows = await query<any>(
    `SELECT id,
            tenant_id AS tenantId,
            movement_type AS movementType,
            direction,
            amount,
            cash_session_id AS cashSessionId,
            staff_id AS staffId,
            staff_name AS staffName,
            customer_id AS customerId,
            customer_name AS customerName,
            source_type AS sourceType,
            cash_source AS cashSource,
            reference_id AS referenceId,
            category,
            note,
            receipt_attachment_url AS receiptAttachmentUrl,
            receipt_attachment_name AS receiptAttachmentName,
            counted_breakdown AS countedBreakdown,
            approved_by AS approvedBy,
            approved_by_name AS approvedByName,
            approved_at AS approvedAt,
            created_by AS createdBy,
            created_by_name AS createdByName,
            created_at AS createdAt
       FROM manager_cash_movements
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ?`,
    [...params, limit]
  );
  return rows.map(rowToMovement);
}

export async function exportManagerCashMovementsCsv(tenantId: string, filters: ManagerCashMovementFilters = {}) {
  const movements = await getManagerCashMovements(tenantId, {
    ...filters,
    limit: filters.limit || 500,
  });
  const header = [
    "created_at",
    "movement_type",
    "direction",
    "amount",
    "cash_source",
    "source_type",
    "category",
    "staff",
    "customer",
    "approver",
    "receipt_attachment",
    "reference_id",
    "note",
  ];
  const rows = movements.map((movement) => [
    movement.createdAt || "",
    movement.movementType,
    movement.direction,
    movement.amount,
    movement.cashSource || "",
    movement.sourceType || "",
    movement.category || "",
    movement.staffName || movement.staffId || "",
    movement.customerName || movement.customerId || "",
    movement.approvedByName || movement.approvedBy || "",
    movement.receiptAttachmentName || movement.receiptAttachmentUrl || "",
    movement.referenceId || "",
    movement.note || "",
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  return {
    filename: `masepos-manager-cash-${new Date().toISOString().slice(0, 10)}.csv`,
    mimeType: "text/csv",
    generatedAt: new Date().toISOString(),
    count: movements.length,
    csv,
  };
}

export async function getManagerCashSummary(tenantId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [managerRows, openRows, pendingRows, walletRows, payoutRows, todayRows, custodyRows, recentMovements] = await Promise.all([
    query<any>(
      `SELECT COALESCE(SUM(CASE
                WHEN direction = 'in' THEN amount
                WHEN direction = 'out' THEN -amount
                ELSE 0
              END), 0) AS managerFloat
         FROM manager_cash_movements
        WHERE tenant_id = ?`,
      [tenantId]
    ),
    query<any>(
      `SELECT COUNT(*) AS openRegisterCount,
              COALESCE(SUM(expected_cash), 0) AS openRegisterCash
         FROM cash_sessions
        WHERE tenant_id = ? AND status = 'open'`,
      [tenantId]
    ),
    query<any>(
      `SELECT COUNT(*) AS pendingCashUpCount,
              COALESCE(SUM(actual_cash), 0) AS pendingCashUpCash
         FROM cash_sessions
        WHERE tenant_id = ?
          AND status = 'closed'
          AND COALESCE(review_status, 'submitted') <> 'reconciled'`,
      [tenantId]
    ),
    query<any>(
      `SELECT
          COALESCE((SELECT SUM(wallet_balance) FROM staff WHERE tenant_id = ?), 0) AS staffWalletLiability,
          COALESCE((SELECT SUM(wallet_balance) FROM customers WHERE tenant_id = ?), 0) AS customerWalletLiability`,
      [tenantId, tenantId]
    ),
    query<any>(
      `SELECT
          COALESCE((SELECT SUM(amount) FROM payout_requests WHERE tenant_id = ? AND status IN ('pending','approved')), 0) AS staffPendingPayouts,
          COALESCE((SELECT SUM(amount) FROM customer_payout_requests WHERE tenant_id = ? AND status IN ('pending','approved')), 0) AS customerPendingPayouts`,
      [tenantId, tenantId]
    ),
    query<any>(
      `SELECT
          COALESCE(SUM(CASE WHEN movement_type = 'safe_drop' THEN amount ELSE 0 END), 0) AS safeDropsToday,
          COALESCE(SUM(CASE WHEN movement_type = 'register_close' THEN amount ELSE 0 END), 0) AS cashUpsToManagerToday,
          COALESCE(SUM(CASE WHEN movement_type IN ('petty_cash','payout') THEN amount ELSE 0 END), 0) AS pettyCashToday,
          COALESCE(SUM(CASE WHEN movement_type IN ('wallet_cash_in','wallet_cash_out') THEN amount ELSE 0 END), 0) AS walletCashToday
         FROM manager_cash_movements
        WHERE tenant_id = ? AND created_at >= ?`,
      [tenantId, todayStart]
    ),
    query<any>(
      `SELECT
          COUNT(CASE WHEN status = 'pending_confirmation' THEN 1 END) AS pendingCustodyTransfers,
          COUNT(CASE WHEN status = 'confirmed' AND confirmed_at >= ? THEN 1 END) AS custodyTransfersToday,
          COALESCE(SUM(CASE WHEN status = 'confirmed' AND confirmed_at >= ? THEN ABS(variance) ELSE 0 END), 0) AS custodyVarianceToday
         FROM cash_custody_transfers
        WHERE tenant_id = ?`,
      [todayStart, todayStart, tenantId]
    ),
    getManagerCashMovements(tenantId, 8),
  ]);

  const managerFloat = toNumber(managerRows[0]?.managerFloat);
  const openRegisterCash = toNumber(openRows[0]?.openRegisterCash);
  const pendingCashUpCash = toNumber(pendingRows[0]?.pendingCashUpCash);
  const staffWalletLiability = toNumber(walletRows[0]?.staffWalletLiability);
  const customerWalletLiability = toNumber(walletRows[0]?.customerWalletLiability);
  const walletLiability = staffWalletLiability + customerWalletLiability;
  const pendingPayouts = toNumber(payoutRows[0]?.staffPendingPayouts) + toNumber(payoutRows[0]?.customerPendingPayouts);
  const totalPhysicalCash = managerFloat + openRegisterCash + pendingCashUpCash;

  return {
    managerFloat,
    openRegisterCash,
    openRegisterCount: toNumber(openRows[0]?.openRegisterCount),
    pendingCashUpCash,
    pendingCashUpCount: toNumber(pendingRows[0]?.pendingCashUpCount),
    totalPhysicalCash,
    walletLiability,
    staffWalletLiability,
    customerWalletLiability,
    pendingPayouts,
    availableAfterWalletLiability: totalPhysicalCash - walletLiability,
    safeDropsToday: toNumber(todayRows[0]?.safeDropsToday),
    cashUpsToManagerToday: toNumber(todayRows[0]?.cashUpsToManagerToday),
    pettyCashToday: toNumber(todayRows[0]?.pettyCashToday),
    walletCashToday: toNumber(todayRows[0]?.walletCashToday),
    pendingCustodyTransfers: toNumber(custodyRows[0]?.pendingCustodyTransfers),
    custodyTransfersToday: toNumber(custodyRows[0]?.custodyTransfersToday),
    custodyVarianceToday: toNumber(custodyRows[0]?.custodyVarianceToday),
    recentMovements,
    generatedAt: new Date().toISOString(),
  };
}

export async function getCashClosePreview(tenantId: string, businessDateInput?: string | null) {
  const businessDate = normalizeBusinessDate(businessDateInput);
  const { start, end } = businessDateBounds(businessDate);
  const [summary, movementRows, openRegisters, pendingCashUps, pendingTransfers, latestCloseRows] = await Promise.all([
    getManagerCashSummary(tenantId),
    query<any>(
      `SELECT
          COALESCE(SUM(CASE WHEN movement_type = 'safe_drop' THEN amount ELSE 0 END), 0) AS safeDropsToday,
          COALESCE(SUM(CASE WHEN movement_type = 'register_close' THEN amount ELSE 0 END), 0) AS cashUpsToManagerToday,
          COALESCE(SUM(CASE WHEN movement_type IN ('petty_cash','payout') THEN amount ELSE 0 END), 0) AS pettyCashToday,
          COALESCE(SUM(CASE WHEN movement_type = 'wallet_cash_in' THEN amount ELSE 0 END), 0) AS walletCashInToday,
          COALESCE(SUM(CASE WHEN movement_type = 'wallet_cash_out' THEN amount ELSE 0 END), 0) AS walletCashOutToday,
          COALESCE(SUM(CASE WHEN movement_type = 'transfer' AND direction = 'in' THEN amount ELSE 0 END), 0) AS transferInToday,
          COALESCE(SUM(CASE WHEN movement_type = 'transfer' AND direction = 'out' THEN amount ELSE 0 END), 0) AS transferOutToday
         FROM manager_cash_movements
        WHERE tenant_id = ? AND created_at >= ? AND created_at < ?`,
      [tenantId, start, end]
    ),
    query<any>(
      `SELECT id,
              staff_name AS staffName,
              expected_cash AS expectedCash,
              opened_at AS openedAt
         FROM cash_sessions
        WHERE tenant_id = ? AND status = 'open'
        ORDER BY opened_at ASC`,
      [tenantId]
    ),
    query<any>(
      `SELECT id,
              staff_name AS staffName,
              actual_cash AS actualCash,
              difference,
              review_status AS reviewStatus,
              closed_at AS closedAt
         FROM cash_sessions
        WHERE tenant_id = ?
          AND status = 'closed'
          AND COALESCE(review_status, 'submitted') <> 'reconciled'
        ORDER BY updated_at DESC`,
      [tenantId]
    ),
    query<any>(
      `SELECT id,
              from_name AS fromName,
              to_name AS toName,
              expected_amount AS expectedAmount,
              counted_amount AS countedAmount,
              variance,
              requested_at AS requestedAt
         FROM cash_custody_transfers
        WHERE tenant_id = ? AND status = 'pending_confirmation'
        ORDER BY requested_at ASC`,
      [tenantId]
    ),
    query<any>(
      `SELECT id,
              tenant_id AS tenantId,
              business_date AS businessDate,
              status,
              expected_physical_cash AS expectedPhysicalCash,
              counted_physical_cash AS countedPhysicalCash,
              variance,
              manager_float AS managerFloat,
              open_register_cash AS openRegisterCash,
              pending_cash_up_cash AS pendingCashUpCash,
              wallet_liability AS walletLiability,
              pending_payouts AS pendingPayouts,
              petty_cash_today AS pettyCashToday,
              wallet_cash_in_today AS walletCashInToday,
              wallet_cash_out_today AS walletCashOutToday,
              custody_pending_count AS custodyPendingCount,
              custody_variance_today AS custodyVarianceToday,
              unresolved_items AS unresolvedItems,
              counted_breakdown AS countedBreakdown,
              note,
              closed_by AS closedBy,
              closed_by_name AS closedByName,
              closed_at AS closedAt,
              created_at AS createdAt,
              updated_at AS updatedAt
         FROM cash_close_checkpoints
        WHERE tenant_id = ? AND business_date = ?
        LIMIT 1`,
      [tenantId, businessDate]
    ),
  ]);

  const movement = movementRows[0] || {};
  const unresolvedItems = [
    ...openRegisters.map((row: any) => ({
      type: "open_register",
      id: row.id,
      label: `${row.staffName || "Register"} still open`,
      amount: toNumber(row.expectedCash),
    })),
    ...pendingCashUps.map((row: any) => ({
      type: "pending_cash_up",
      id: row.id,
      label: `${row.staffName || "Register"} cash-up not reconciled`,
      amount: toNumber(row.actualCash),
      variance: toNumber(row.difference),
    })),
    ...pendingTransfers.map((row: any) => ({
      type: "pending_handover",
      id: row.id,
      label: `${row.fromName || "Cash"} to ${row.toName || "cash"}`,
      amount: toNumber(row.countedAmount || row.expectedAmount),
      variance: toNumber(row.variance),
    })),
  ];

  const expectedPhysicalCash = Number(toNumber(summary.totalPhysicalCash).toFixed(2));
  return {
    businessDate,
    expectedPhysicalCash,
    managerFloat: summary.managerFloat,
    openRegisterCash: summary.openRegisterCash,
    openRegisterCount: summary.openRegisterCount,
    pendingCashUpCash: summary.pendingCashUpCash,
    pendingCashUpCount: summary.pendingCashUpCount,
    walletLiability: summary.walletLiability,
    pendingPayouts: summary.pendingPayouts,
    availableAfterWalletLiability: summary.availableAfterWalletLiability,
    safeDropsToday: toNumber(movement.safeDropsToday),
    cashUpsToManagerToday: toNumber(movement.cashUpsToManagerToday),
    pettyCashToday: toNumber(movement.pettyCashToday),
    walletCashInToday: toNumber(movement.walletCashInToday),
    walletCashOutToday: toNumber(movement.walletCashOutToday),
    walletCashNetToday: toNumber(movement.walletCashInToday) - toNumber(movement.walletCashOutToday),
    transferInToday: toNumber(movement.transferInToday),
    transferOutToday: toNumber(movement.transferOutToday),
    custodyPendingCount: pendingTransfers.length,
    custodyVarianceToday: summary.custodyVarianceToday,
    unresolvedItems,
    latestClose: rowToCashClose(latestCloseRows[0]),
    generatedAt: new Date().toISOString(),
  };
}

async function syncCashCloseTask(conn: Pick<Awaited<ReturnType<typeof getConnection>>, "query">, checkpoint: any, actor: Actor) {
  const needsReview = checkpoint.status === "review_needed";
  if (!needsReview) {
    await conn.query(
      `UPDATE manager_tasks
          SET status = 'done',
              decided_by = ?,
              decision_note = ?,
              resolved_at = NOW(),
              updated_at = NOW()
        WHERE tenant_id = ?
          AND task_type = 'cash_variance'
          AND source_type = 'cash_close'
          AND source_id = ?
          AND status IN ('open','in_review')`,
      [actor.staffId || null, "EOD cash close balanced.", checkpoint.tenantId, checkpoint.id]
    );
    return;
  }

  const variance = toNumber(checkpoint.variance);
  const unresolvedCount = Array.isArray(checkpoint.unresolvedItems) ? checkpoint.unresolvedItems.length : 0;
  const values = [
    makeId("task"),
    checkpoint.tenantId,
    "cash_variance",
    `Review EOD cash close for ${checkpoint.businessDate}`,
    `${Math.abs(variance) > 0.009 ? `R${Math.abs(variance).toFixed(2)} cash variance` : "No cash variance"} with ${unresolvedCount} unresolved cash item${unresolvedCount === 1 ? "" : "s"}.`,
    Math.abs(variance) >= 100 || unresolvedCount > 2 ? "critical" : "high",
    "open",
    "cash_close",
    checkpoint.id,
    actor.staffId || null,
    json({
      businessDate: checkpoint.businessDate,
      expectedPhysicalCash: checkpoint.expectedPhysicalCash,
      countedPhysicalCash: checkpoint.countedPhysicalCash,
      variance,
      unresolvedItems: checkpoint.unresolvedItems,
    }),
  ];

  if (isPostgres()) {
    await conn.query(
      `INSERT INTO manager_tasks (
         id, tenant_id, task_type, title, summary, priority, status,
         source_type, source_id, requested_by, details, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON CONFLICT (tenant_id, task_type, source_type, source_id)
       DO UPDATE SET
         title = CASE WHEN manager_tasks.status IN ('open','in_review') THEN EXCLUDED.title ELSE manager_tasks.title END,
         summary = CASE WHEN manager_tasks.status IN ('open','in_review') THEN EXCLUDED.summary ELSE manager_tasks.summary END,
         priority = CASE WHEN manager_tasks.status IN ('open','in_review') THEN EXCLUDED.priority ELSE manager_tasks.priority END,
         details = CASE WHEN manager_tasks.status IN ('open','in_review') THEN EXCLUDED.details ELSE manager_tasks.details END,
         updated_at = CASE WHEN manager_tasks.status IN ('open','in_review') THEN NOW() ELSE manager_tasks.updated_at END`,
      values
    );
    return;
  }

  await conn.query(
    `INSERT INTO manager_tasks (
       id, tenant_id, task_type, title, summary, priority, status,
       source_type, source_id, requested_by, details, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       title = IF(status IN ('open','in_review'), VALUES(title), title),
       summary = IF(status IN ('open','in_review'), VALUES(summary), summary),
       priority = IF(status IN ('open','in_review'), VALUES(priority), priority),
       details = IF(status IN ('open','in_review'), VALUES(details), details),
       updated_at = IF(status IN ('open','in_review'), NOW(), updated_at)`,
    values
  );
}

export async function createCashCloseCheckpoint(tenantId: string, input: CashCloseCheckpointInput, actor: Actor = {}) {
  const businessDate = normalizeBusinessDate(input.businessDate);
  const preview = await getCashClosePreview(tenantId, businessDate);
  const countedBreakdown = normalizeBreakdown(input.countedBreakdown);
  const countedFromBreakdown = breakdownTotal(countedBreakdown);
  const countedPhysicalCash = Number((toNumber(input.countedAmount) || countedFromBreakdown || 0).toFixed(2));
  if (countedPhysicalCash < 0) throw new Error("Counted cash cannot be negative.");

  const variance = Number((countedPhysicalCash - preview.expectedPhysicalCash).toFixed(2));
  const unresolvedItems = preview.unresolvedItems || [];
  const status = Math.abs(variance) > 0.009 || unresolvedItems.length > 0 ? "review_needed" : "balanced";
  const existingRows = await query<any>(
    `SELECT id FROM cash_close_checkpoints WHERE tenant_id = ? AND business_date = ? LIMIT 1`,
    [tenantId, businessDate]
  );
  const id = existingRows[0]?.id || makeId("ccc");
  const checkpoint = {
    id,
    tenantId,
    businessDate,
    status,
    expectedPhysicalCash: preview.expectedPhysicalCash,
    countedPhysicalCash,
    variance,
    managerFloat: preview.managerFloat,
    openRegisterCash: preview.openRegisterCash,
    pendingCashUpCash: preview.pendingCashUpCash,
    walletLiability: preview.walletLiability,
    pendingPayouts: preview.pendingPayouts,
    pettyCashToday: preview.pettyCashToday,
    walletCashInToday: preview.walletCashInToday,
    walletCashOutToday: preview.walletCashOutToday,
    custodyPendingCount: preview.custodyPendingCount,
    custodyVarianceToday: preview.custodyVarianceToday,
    unresolvedItems,
    countedBreakdown,
    note: cleanString(input.note, 500),
    closedBy: actor.staffId || null,
    closedByName: actor.staffName || null,
  };

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    if (existingRows[0]) {
      await conn.query(
        `UPDATE cash_close_checkpoints
            SET status = ?,
                expected_physical_cash = ?,
                counted_physical_cash = ?,
                variance = ?,
                manager_float = ?,
                open_register_cash = ?,
                pending_cash_up_cash = ?,
                wallet_liability = ?,
                pending_payouts = ?,
                petty_cash_today = ?,
                wallet_cash_in_today = ?,
                wallet_cash_out_today = ?,
                custody_pending_count = ?,
                custody_variance_today = ?,
                unresolved_items = ?,
                counted_breakdown = ?,
                note = ?,
                closed_by = ?,
                closed_by_name = ?,
                closed_at = NOW(),
                updated_at = NOW()
          WHERE tenant_id = ? AND id = ?`,
        [
          checkpoint.status,
          checkpoint.expectedPhysicalCash,
          checkpoint.countedPhysicalCash,
          checkpoint.variance,
          checkpoint.managerFloat,
          checkpoint.openRegisterCash,
          checkpoint.pendingCashUpCash,
          checkpoint.walletLiability,
          checkpoint.pendingPayouts,
          checkpoint.pettyCashToday,
          checkpoint.walletCashInToday,
          checkpoint.walletCashOutToday,
          checkpoint.custodyPendingCount,
          checkpoint.custodyVarianceToday,
          json(checkpoint.unresolvedItems, []),
          json(checkpoint.countedBreakdown, {}),
          checkpoint.note,
          checkpoint.closedBy,
          checkpoint.closedByName,
          tenantId,
          id,
        ]
      );
    } else {
      await conn.query(
        `INSERT INTO cash_close_checkpoints (
           id, tenant_id, business_date, status, expected_physical_cash, counted_physical_cash,
           variance, manager_float, open_register_cash, pending_cash_up_cash, wallet_liability,
           pending_payouts, petty_cash_today, wallet_cash_in_today, wallet_cash_out_today,
           custody_pending_count, custody_variance_today, unresolved_items, counted_breakdown,
           note, closed_by, closed_by_name, closed_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
        [
          checkpoint.id,
          checkpoint.tenantId,
          checkpoint.businessDate,
          checkpoint.status,
          checkpoint.expectedPhysicalCash,
          checkpoint.countedPhysicalCash,
          checkpoint.variance,
          checkpoint.managerFloat,
          checkpoint.openRegisterCash,
          checkpoint.pendingCashUpCash,
          checkpoint.walletLiability,
          checkpoint.pendingPayouts,
          checkpoint.pettyCashToday,
          checkpoint.walletCashInToday,
          checkpoint.walletCashOutToday,
          checkpoint.custodyPendingCount,
          checkpoint.custodyVarianceToday,
          json(checkpoint.unresolvedItems, []),
          json(checkpoint.countedBreakdown, {}),
          checkpoint.note,
          checkpoint.closedBy,
          checkpoint.closedByName,
        ]
      );
    }

    await syncCashCloseTask(conn, checkpoint, actor);
    await recordAuditEvent(conn, {
      tenantId,
      action: "cash_close.checkpoint",
      entityType: "cash_close_checkpoint",
      entityId: id,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      source: "cash_management",
      details: checkpoint,
    });
    await conn.commit();
    return checkpoint;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function getCashCloseCheckpoints(tenantId: string, limit = 20) {
  const rows = await query<any>(
    `SELECT id,
            tenant_id AS tenantId,
            business_date AS businessDate,
            status,
            expected_physical_cash AS expectedPhysicalCash,
            counted_physical_cash AS countedPhysicalCash,
            variance,
            manager_float AS managerFloat,
            open_register_cash AS openRegisterCash,
            pending_cash_up_cash AS pendingCashUpCash,
            wallet_liability AS walletLiability,
            pending_payouts AS pendingPayouts,
            petty_cash_today AS pettyCashToday,
            wallet_cash_in_today AS walletCashInToday,
            wallet_cash_out_today AS walletCashOutToday,
            custody_pending_count AS custodyPendingCount,
            custody_variance_today AS custodyVarianceToday,
            unresolved_items AS unresolvedItems,
            counted_breakdown AS countedBreakdown,
            note,
            closed_by AS closedBy,
            closed_by_name AS closedByName,
            closed_at AS closedAt,
            created_at AS createdAt,
            updated_at AS updatedAt
       FROM cash_close_checkpoints
      WHERE tenant_id = ?
      ORDER BY business_date DESC, updated_at DESC
      LIMIT ?`,
    [tenantId, Math.max(1, Math.min(100, Math.round(toNumber(limit) || 20)))]
  );
  return rows.map(rowToCashClose);
}

export async function exportCashCloseCheckpointCsv(tenantId: string, checkpointId: string) {
  const rows = await query<any>(
    `SELECT id,
            tenant_id AS tenantId,
            business_date AS businessDate,
            status,
            expected_physical_cash AS expectedPhysicalCash,
            counted_physical_cash AS countedPhysicalCash,
            variance,
            manager_float AS managerFloat,
            open_register_cash AS openRegisterCash,
            pending_cash_up_cash AS pendingCashUpCash,
            wallet_liability AS walletLiability,
            pending_payouts AS pendingPayouts,
            petty_cash_today AS pettyCashToday,
            wallet_cash_in_today AS walletCashInToday,
            wallet_cash_out_today AS walletCashOutToday,
            custody_pending_count AS custodyPendingCount,
            custody_variance_today AS custodyVarianceToday,
            unresolved_items AS unresolvedItems,
            counted_breakdown AS countedBreakdown,
            note,
            closed_by AS closedBy,
            closed_by_name AS closedByName,
            closed_at AS closedAt
       FROM cash_close_checkpoints
      WHERE tenant_id = ? AND id = ?
      LIMIT 1`,
    [tenantId, checkpointId]
  );
  const checkpoint = rowToCashClose(rows[0]);
  if (!checkpoint) throw new Error("Cash close checkpoint not found.");
  const header = ["field", "value"];
  const body = Object.entries({
    businessDate: checkpoint.businessDate,
    status: checkpoint.status,
    expectedPhysicalCash: checkpoint.expectedPhysicalCash,
    countedPhysicalCash: checkpoint.countedPhysicalCash,
    variance: checkpoint.variance,
    managerFloat: checkpoint.managerFloat,
    openRegisterCash: checkpoint.openRegisterCash,
    pendingCashUpCash: checkpoint.pendingCashUpCash,
    walletLiability: checkpoint.walletLiability,
    pendingPayouts: checkpoint.pendingPayouts,
    pettyCashToday: checkpoint.pettyCashToday,
    walletCashInToday: checkpoint.walletCashInToday,
    walletCashOutToday: checkpoint.walletCashOutToday,
    custodyPendingCount: checkpoint.custodyPendingCount,
    custodyVarianceToday: checkpoint.custodyVarianceToday,
    unresolvedItems: JSON.stringify(checkpoint.unresolvedItems),
    note: checkpoint.note || "",
    closedByName: checkpoint.closedByName || "",
    closedAt: checkpoint.closedAt || "",
  });
  const csv = [header, ...body].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  return {
    filename: `masepos-cash-close-${checkpoint.businessDate}.csv`,
    mimeType: "text/csv",
    csv,
    generatedAt: new Date().toISOString(),
  };
}

export async function transferCashSessionToManagerFloat(tenantId: string, cashSessionId: string, actor: Actor = {}) {
  const existing = await query<any>(
    `SELECT id FROM manager_cash_movements
      WHERE tenant_id = ? AND movement_type = 'register_close' AND reference_id = ?
      LIMIT 1`,
    [tenantId, cashSessionId]
  );
  if (existing[0]) return null;

  const sessions = await query<any>(
    `SELECT id, staff_id, staff_name, actual_cash, review_status
       FROM cash_sessions
      WHERE tenant_id = ? AND id = ?
      LIMIT 1`,
    [tenantId, cashSessionId]
  );
  const session = sessions[0];
  const actualCash = toNumber(session?.actual_cash);
  if (!session || actualCash <= 0) return null;

  return recordManagerCashMovement(tenantId, {
    movementType: "register_close",
    direction: "in",
    amount: actualCash,
    cashSessionId,
    staffId: session.staff_id,
    staffName: session.staff_name,
    sourceType: "cash_session",
    referenceId: cashSessionId,
    category: "cash_up",
    note: `Reconciled cash-up received from ${session.staff_name || "register"}`,
  }, actor);
}
