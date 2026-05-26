import { getConnection, query } from "./db.js";
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
  referenceId?: string | null;
  category?: string | null;
  note?: string | null;
  countedBreakdown?: Record<string, number> | null;
};

type WalletCashMovementInput = {
  ownerType?: "staff" | "customer" | string | null;
  ownerId?: string | null;
  direction?: "in" | "out" | string | null;
  amount?: number | string | null;
  note?: string | null;
  referenceId?: string | null;
  applyWalletDelta?: boolean;
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
    referenceId: row.referenceId ?? row.reference_id,
    category: row.category,
    note: row.note,
    countedBreakdown: (() => {
      const value = row.countedBreakdown ?? row.counted_breakdown;
      if (!value) return {};
      if (typeof value !== "string") return value;
      try { return JSON.parse(value); } catch { return {}; }
    })(),
    createdBy: row.createdBy ?? row.created_by,
    createdByName: row.createdByName ?? row.created_by_name,
    createdAt: row.createdAt ?? row.created_at,
  };
}

async function insertManagerCashMovement(conn: Pick<Awaited<ReturnType<typeof getConnection>>, "query">, movement: any) {
  await conn.query(
    `INSERT INTO manager_cash_movements (
       id, tenant_id, movement_type, direction, amount, cash_session_id,
       staff_id, staff_name, customer_id, customer_name, source_type, reference_id,
       category, note, counted_breakdown, created_by, created_by_name, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
      movement.category || null,
      movement.note || null,
      json(movement.countedBreakdown, {}),
      movement.createdBy || null,
      movement.createdByName || null,
    ]
  );
}

export async function recordManagerCashMovement(tenantId: string, input: ManagerCashMovementInput, actor: Actor = {}) {
  const movementType = normalizeMovementType(input.movementType);
  const direction = normalizeDirection(input.direction, movementType);
  const amount = Number(toNumber(input.amount).toFixed(2));
  if (amount <= 0) throw new Error("Enter a manager cash amount greater than zero.");

  const id = makeId("mcm");
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
    sourceType: cleanString(input.sourceType, 64) || "manager_float",
    referenceId: cleanString(input.referenceId, 128),
    category: cleanString(input.category, 96),
    note: cleanString(input.note, 500),
    countedBreakdown: input.countedBreakdown || {},
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
      referenceId: cleanString(input.referenceId, 128),
      category: direction === "in" ? "wallet_top_up" : "wallet_payout",
      note: cleanString(input.note, 500) || (direction === "in" ? "Wallet cash received" : "Wallet cash paid out"),
      countedBreakdown: {},
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

export async function getManagerCashMovements(tenantId: string, limit = 40) {
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
            reference_id AS referenceId,
            category,
            note,
            counted_breakdown AS countedBreakdown,
            created_by AS createdBy,
            created_by_name AS createdByName,
            created_at AS createdAt
       FROM manager_cash_movements
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [tenantId, Math.max(1, Math.min(200, Math.round(toNumber(limit) || 40)))]
  );
  return rows.map(rowToMovement);
}

export async function getManagerCashSummary(tenantId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [managerRows, openRows, pendingRows, walletRows, payoutRows, todayRows, recentMovements] = await Promise.all([
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
    recentMovements,
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
