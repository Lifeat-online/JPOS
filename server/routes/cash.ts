import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import {
  getPayoutRequestsByTenant, getCustomerPayoutRequestsByTenant,
  createPayoutRequest, updatePayoutRequest, updateCustomerPayoutRequest, createCustomerPayoutRequest,
} from "../mariadb-adapter.js";
import {
  getManagerCashSummary, getManagerCashMovements, exportManagerCashMovementsCsv,
  recordManagerCashMovement, createCashCustodyTransfer, getCashCustodyTransfers,
  confirmCashCustodyTransfer, cancelCashCustodyTransfer,
  getCashClosePreview, getCashCloseCheckpoints, createCashCloseCheckpoint, exportCashCloseCheckpointCsv,
  recordWalletCashMovement, recordRegisterWalletCashMovement,
  transferCashSessionToManagerFloat,
} from "../managerCash.js";
import { getOpenCashSessionByStaff } from "../mariadb-adapter.js";
import { getConnection, query } from "../db.js";
import {
  canManageCash, auditActorFromRequest, auditRouteEvent, denyWithAudit,
  enforceSensitiveAction, drawerMovementSensitiveAction,
  stripSensitiveVerification, auditChangedFields,
} from "./_helpers.js";

export const cashRouter = Router({ mergeParams: true });

function toMoneyNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") { const p = parseFloat(value); return Number.isFinite(p) ? p : 0; }
  return 0;
}

function safeJsonField(value: unknown, fallback: any) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function cashSessionResponse(r: any) {
  return {
    id: r.id, tenantId: r.tenant_id, staffId: r.staff_id, staffName: r.staff_name,
    openedAt: r.opened_at, closedAt: r.closed_at, submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at, reviewedBy: r.reviewed_by,
    reconciledAt: r.reconciled_at, reconciledBy: r.reconciled_by,
    openingFloat: toMoneyNumber(r.opening_float),
    openingBreakdown: safeJsonField(r.opening_breakdown, {}),
    expectedCash: toMoneyNumber(r.expected_cash), actualCash: toMoneyNumber(r.actual_cash),
    closingBreakdown: safeJsonField(r.closing_breakdown, {}),
    difference: toMoneyNumber(r.difference),
    accumulatedTips: toMoneyNumber(r.accumulated_tips), netTips: toMoneyNumber(r.net_tips),
    status: r.status, reviewStatus: r.review_status || (r.status === "open" ? "in_progress" : "submitted"),
    notes: r.notes, managerNotes: r.manager_notes, varianceReason: r.variance_reason,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

async function recordCashMovement(tenantId: string, data: any) {
  const id = data.id || `cm_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO cash_movements (id, tenant_id, cash_session_id, type, direction, amount, sale_id, payment_id, staff_id, staff_name, created_by, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [id, tenantId, data.cashSessionId || null, data.type, data.direction, data.amount, data.saleId || null, data.paymentId || null, data.staffId || null, data.staffName || null, data.createdBy || null, data.note || null]
  );
  return { id, ...data };
}

function expectedCashDeltaForMovement(type: string, direction: string, amount: number): number {
  const dir = String(direction || "").toLowerCase();
  if (["opening_float", "sale", "cash_added", "cash_sale"].includes(type) && dir === "in") return amount;
  if (["cash_drop", "cash_removed", "cash_out"].includes(type) && dir === "out") return -amount;
  if (type === "no_sale") return 0;
  if (type === "refund" && dir === "out") return -amount;
  return dir === "in" ? amount : dir === "out" ? -amount : 0;
}

async function getSessionRecordedTips(tenantId: string, sessionId: string, closedAt: Date) {
  const rows = await query<any>(
    `SELECT cs.staff_id, cs.status, COALESCE(SUM(CASE WHEN cm.type = 'tip' AND cm.direction = 'in' THEN cm.amount ELSE 0 END), 0) AS recorded_tips
       FROM cash_sessions cs
       LEFT JOIN cash_movements cm ON cm.cash_session_id = cs.id AND cm.created_at <= ?
      WHERE cs.tenant_id = ? AND cs.id = ?
      GROUP BY cs.staff_id, cs.status`,
    [closedAt, tenantId, sessionId]
  );
  if (!rows.length) return null;
  return { staffId: rows[0].staff_id, currentStatus: rows[0].status, recordedTips: toMoneyNumber(rows[0].recorded_tips) };
}

async function mirrorDrawerMovementToManagerCash(tenantId: string, movement: any, actor: any) {
  try {
    const mirrorTypes = new Set(["cash_drop", "cash_added", "cash_removed", "manager_adjustment"]);
    if (!mirrorTypes.has(movement?.type)) return;
    await recordManagerCashMovement(tenantId, {
      type: movement.type, direction: movement.direction, amount: movement.amount,
      note: movement.note || null, saleId: movement.saleId || null,
      cashSessionId: movement.cashSessionId || null, staffId: actor.staffId || null,
      staffName: actor.staffName || null, role: actor.role || null,
    });
  } catch (err) { console.warn("[cash] Mirror to manager cash failed:", err); }
}

// ── Cash sessions ──────────────────────────────────────────────────────────

cashRouter.get("/", requireAuth, async (req: any, res) => {
  try {
    const rows = await query<any>(
      `SELECT * FROM cash_sessions WHERE tenant_id = ? ORDER BY opened_at DESC LIMIT 200`,
      [req.params.tenantId]
    );
    res.json(rows.map(cashSessionResponse));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

cashRouter.get("/open", requireAuth, async (req: any, res) => {
  try {
    const staffId = req.user?.staffId || req.user?.uid || null;
    if (!staffId) return res.status(400).json({ error: "Staff identity required" });
    const session = await getOpenCashSessionByStaff(req.params.tenantId, staffId);
    res.json(session || null);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

cashRouter.post("/", requireAuth, async (req: any, res) => {
  try {
    const activeRegisterRows = await query<any>("SELECT COUNT(*) AS active_count FROM cash_sessions WHERE tenant_id = ? AND status = 'open'", [req.params.tenantId]);
    const activeRegisters = Number(activeRegisterRows[0]?.active_count || 0);
    // ponytail: licence check delegated to app.ts; router just does the insert
    const sessionStaffId = req.user?.staffId || req.user?.uid || null;
    if (!sessionStaffId) return res.status(401).json({ error: "Cannot open a cash session without an authenticated staff identity." });
    const id = `cs_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await query(
      `INSERT INTO cash_sessions (id, tenant_id, staff_id, staff_name, opened_at, opening_float, opening_breakdown, expected_cash, status, review_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [id, req.params.tenantId, sessionStaffId, req.user?.name || '', req.body.openedAt ? new Date(req.body.openedAt) : new Date(), req.body.openingFloat || 0, JSON.stringify(req.body.openingBreakdown || {}), req.body.expectedCash || 0, req.body.status || 'open', 'in_progress']
    );
    if (Number(req.body.openingFloat || 0) > 0) {
      await recordCashMovement(req.params.tenantId, { cashSessionId: id, type: "opening_float", direction: "in", amount: Number(req.body.openingFloat || 0), staffId: sessionStaffId, staffName: req.user?.name || "", createdBy: sessionStaffId, note: "Opening float counted" });
    }
    await auditRouteEvent(req, "cash_session.opened", "cash_session", { staffId: sessionStaffId, openingFloat: req.body.openingFloat || 0, status: req.body.status || "open" }, id, "cash_session");
    res.json({ id, ...req.body, reviewStatus: 'in_progress' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

cashRouter.put("/:id", requireAuth, async (req: any, res) => {
  try {
    const updates = req.body;
    if (["reviewed", "reconciled", "disputed"].includes(updates.reviewStatus) && !canManageCash(req.user?.role)) {
      return denyWithAudit(req, res, "cash_session.review_finalize", "Only managers and admins can finalize cash reviews", { cashSessionId: req.params.id, reviewStatus: updates.reviewStatus });
    }
    if (updates.tipsDelta !== undefined) {
      const tipDelta = Number(updates.tipsDelta);
      if (!Number.isFinite(tipDelta) || tipDelta < 0) return res.status(400).json({ error: "tipsDelta must be a non-negative number." });
      updates.tipsDelta = tipDelta;
    }
    const isSubmitting = updates.status === "closed" || updates.reviewStatus === "submitted";
    let walletTipsDelta = 0, walletTipsStaffId: string | null = null;
    if (isSubmitting) {
      const closedAt = updates.closedAt ? new Date(updates.closedAt) : new Date();
      const tipSummary = await getSessionRecordedTips(req.params.tenantId, req.params.id, closedAt);
      if (tipSummary) {
        const difference = updates.difference !== undefined ? toMoneyNumber(updates.difference) : toMoneyNumber(updates.actualCash) - toMoneyNumber(updates.expectedCash);
        const netTips = Math.max(0, tipSummary.recordedTips + Math.min(0, difference));
        updates.accumulatedTips = tipSummary.recordedTips;
        updates.netTips = netTips;
        if (tipSummary.currentStatus !== "closed" && netTips > 0) { walletTipsDelta = netTips; walletTipsStaffId = tipSummary.staffId; }
      }
    }
    const fields: string[] = [], values: any[] = [];
    const map: [string, string, (v: any) => any][] = [
      ["submittedAt","submitted_at", v => v ? new Date(v) : null],["reviewedAt","reviewed_at", v => v ? new Date(v) : null],
      ["reviewedBy","reviewed_by", v => v || null],["reconciledAt","reconciled_at", v => v ? new Date(v) : null],
      ["reconciledBy","reconciled_by", v => v || null],["closedAt","closed_at", v => v ? new Date(v) : null],
      ["actualCash","actual_cash", v => v],["openingBreakdown","opening_breakdown", v => JSON.stringify(v || {})],
      ["closingBreakdown","closing_breakdown", v => JSON.stringify(v || {})],["difference","difference", v => v],
      ["accumulatedTips","accumulated_tips", v => v],["netTips","net_tips", v => v],
      ["status","status", v => v],["reviewStatus","review_status", v => v],
      ["notes","notes", v => v],["managerNotes","manager_notes", v => v],["varianceReason","variance_reason", v => v],
      ["expectedCash","expected_cash", v => v],
    ];
    for (const [key, col, transform] of map) {
      if (updates[key] !== undefined) { fields.push(`${col} = ?`); values.push(transform(updates[key])); }
    }
    if (updates.expectedCashDelta !== undefined) { fields.push("expected_cash = expected_cash + ?"); values.push(updates.expectedCashDelta); }
    if (updates.tipsDelta !== undefined) { fields.push("accumulated_tips = accumulated_tips + ?"); values.push(updates.tipsDelta); }

    if (fields.length > 0 || walletTipsDelta > 0) {
      if (walletTipsDelta > 0 || (updates.tipsDelta !== undefined && updates.tipsDelta > 0)) {
        const r = await enforceSensitiveAction(req, res, "wallet_adjustment", { cashSessionId: req.params.id, walletTipsDelta, walletTipsStaffId });
        if (r) return;
      }
      const conn = await getConnection();
      try {
        await conn.beginTransaction();
        if (fields.length > 0) {
          fields.push("updated_at = NOW()"); values.push(req.params.id, req.params.tenantId);
          await conn.query(`UPDATE cash_sessions SET ${fields.join(", ")} WHERE id = ? AND tenant_id = ?`, values);
        }
        if (walletTipsDelta > 0) {
          await conn.query(`UPDATE staff SET wallet_balance = COALESCE(wallet_balance, 0) + ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`, [walletTipsDelta, req.params.tenantId, walletTipsStaffId]);
        }
        await conn.commit();
      } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
    }
    await auditRouteEvent(req, "cash_session.updated", "cash_session", { cashSessionId: req.params.id, changedFields: auditChangedFields(updates || {}), status: updates.status || null, reviewStatus: updates.reviewStatus || null, walletTipsDelta, walletTipsStaffId }, req.params.id, "cash_session");
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

cashRouter.put("/:id/review", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "cash_session.review", "Only managers and admins can review cash ups", { cashSessionId: req.params.id });
    const reviewStatus = req.body.reviewStatus || "reviewed";
    if (!["reviewed", "reconciled", "disputed"].includes(reviewStatus)) return res.status(400).json({ error: "Invalid review status" });
    const fields = ["review_status = ?", "reviewed_at = NOW()", "reviewed_by = ?", "manager_notes = ?", "variance_reason = ?", "updated_at = NOW()"];
    const values: any[] = [reviewStatus, req.user?.staffId || null, req.body.managerNotes || null, req.body.varianceReason || null];
    if (reviewStatus === "reconciled") { fields.splice(3, 0, "reconciled_at = NOW()", "reconciled_by = ?"); values.splice(2, 0, req.user?.staffId || null); }
    values.push(req.params.id, req.params.tenantId);
    await query(`UPDATE cash_sessions SET ${fields.join(", ")} WHERE id = ? AND tenant_id = ?`, values);
    if (reviewStatus === "reconciled") await transferCashSessionToManagerFloat(req.params.tenantId, req.params.id, { staffId: req.user?.staffId, staffName: req.user?.name, role: req.user?.role });
    await auditRouteEvent(req, "cash_session.reviewed", "cash_session", { cashSessionId: req.params.id, reviewStatus, managerNotesPresent: Boolean(req.body.managerNotes), varianceReasonPresent: Boolean(req.body.varianceReason) }, req.params.id, "cash_session");
    res.json({ success: true, reviewStatus });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

cashRouter.post("/:id/movements", requireAuth, async (req: any, res) => {
  try {
    const { queueCashDrawerPulseForNoSale } = await import("../hardwareAdapters.js");
    const movementInput = stripSensitiveVerification(req.body || {});
    const movementType = String((movementInput as any).type || "");
    if (["cash_drop", "cash_added", "cash_removed"].includes(movementType) && !canManageCash(req.user?.role)) {
      return denyWithAudit(req, res, "cash_session.manager_movement", "Manager approval is required for cash movements.", { cashSessionId: req.params.id, movementType });
    }
    const sensitiveAction = drawerMovementSensitiveAction(movementType);
    if (sensitiveAction) {
      const r = await enforceSensitiveAction(req, res, sensitiveAction, { cashSessionId: req.params.id, movementType, amount: (movementInput as any).amount || 0 });
      if (r) return;
    }
    const amount = toMoneyNumber((movementInput as any).amount);
    const movement = await recordCashMovement(req.params.tenantId, { cashSessionId: req.params.id, type: movementType, direction: (movementInput as any).direction, amount, saleId: (movementInput as any).saleId, paymentId: (movementInput as any).paymentId, staffId: (movementInput as any).staffId, staffName: (movementInput as any).staffName, createdBy: req.user?.staffId, note: (movementInput as any).note });
    await mirrorDrawerMovementToManagerCash(req.params.tenantId, movement, { staffId: req.user?.staffId, staffName: req.user?.name, role: req.user?.role });
    if (movementType === "no_sale") {
      queueCashDrawerPulseForNoSale(req.params.tenantId, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || (movementInput as any).staffName || null }, { cashSessionId: req.params.id, movementId: movement.id, reason: (movementInput as any).note || null }).catch((err: any) => console.error("[hardware] Failed to queue cash drawer pulse", err));
    }
    const delta = expectedCashDeltaForMovement(movementType, (movementInput as any).direction, amount);
    if (delta !== 0) await query(`UPDATE cash_sessions SET expected_cash = COALESCE(expected_cash, 0) + ?, updated_at = NOW() WHERE tenant_id = ? AND id = ? AND status = 'open'`, [delta, req.params.tenantId, req.params.id]);
    res.json(movement);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

cashRouter.post("/:id/wallet-cash", requireAuth, async (req: any, res) => {
  try {
    const walletInput = stripSensitiveVerification(req.body || {});
    const r = await enforceSensitiveAction(req, res, "wallet_adjustment", { cashSessionId: req.params.id, ownerType: (walletInput as any)?.ownerType || null, ownerId: (walletInput as any)?.ownerId || null, movementType: (walletInput as any)?.movementType || null, amount: (walletInput as any)?.amount || 0 });
    if (r) return;
    res.status(201).json(await recordRegisterWalletCashMovement(req.params.tenantId, { ...(walletInput || {}), cashSessionId: req.params.id }, { staffId: req.user?.staffId, staffName: req.user?.name, role: req.user?.role, requestId: req.requestId || null }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Payout requests ────────────────────────────────────────────────────────

cashRouter.get("/payout-requests", requireAuth, async (req: any, res) => {
  try { res.json(await getPayoutRequestsByTenant(req.params.tenantId)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.post("/payout-requests", requireAuth, async (req: any, res) => {
  try { res.json(await createPayoutRequest(req.params.tenantId, req.body)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.put("/payout-requests/:id", requireAuth, async (req: any, res) => {
  try { res.json(await updatePayoutRequest(req.params.tenantId, req.params.id, req.body)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.get("/customer-payout-requests", requireAuth, async (req: any, res) => {
  try { res.json(await getCustomerPayoutRequestsByTenant(req.params.tenantId)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.put("/customer-payout-requests/:id", requireAuth, async (req: any, res) => {
  try { res.json(await updateCustomerPayoutRequest(req.params.tenantId, req.params.id, req.body)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Manager cash ───────────────────────────────────────────────────────────

cashRouter.get("/manager-cash/summary", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.summary_view", "Only managers and admins can view the manager cash summary.");
    res.json(await getManagerCashSummary(req.params.tenantId, req.query));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.get("/manager-cash/movements", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.movements_view", "Only managers and admins can view manager cash movements.");
    res.json(await getManagerCashMovements(req.params.tenantId, req.query));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.get("/manager-cash/movements/export", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.movements_export", "Only managers and admins can export manager cash movements.");
    res.json(await exportManagerCashMovementsCsv(req.params.tenantId, req.query));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.post("/manager-cash/movements", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.movement_create", "Only managers and admins can record manager cash movements.");
    res.status(201).json(await recordManagerCashMovement(req.params.tenantId, req.body || {}, { staffId: req.user?.staffId, staffName: req.user?.name, role: req.user?.role }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
cashRouter.post("/manager-cash/custody-transfers", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.custody_transfer_create", "Only managers and admins can create custody transfers.");
    res.status(201).json(await createCashCustodyTransfer(req.params.tenantId, req.body || {}, { staffId: req.user?.staffId, staffName: req.user?.name, role: req.user?.role }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
cashRouter.get("/manager-cash/custody-transfers", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.custody_transfers_view", "Only managers and admins can view custody transfers.");
    res.json(await getCashCustodyTransfers(req.params.tenantId, req.query));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.post("/manager-cash/custody-transfers/:transferId/confirm", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.custody_transfer_confirm", "Only managers and admins can confirm custody transfers.", { transferId: req.params.transferId });
    res.json(await confirmCashCustodyTransfer(req.params.tenantId, req.params.transferId, { staffId: req.user?.staffId, staffName: req.user?.name, role: req.user?.role }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
cashRouter.post("/manager-cash/custody-transfers/:transferId/cancel", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.custody_transfer_cancel", "Only managers and admins can cancel custody transfers.", { transferId: req.params.transferId });
    res.json(await cancelCashCustodyTransfer(req.params.tenantId, req.params.transferId, { staffId: req.user?.staffId, staffName: req.user?.name, role: req.user?.role }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
cashRouter.get("/manager-cash/close/preview", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.close_preview", "Only managers and admins can preview end-of-day cash close.");
    res.json(await getCashClosePreview(req.params.tenantId, req.query));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.get("/manager-cash/close", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.close_view", "Only managers and admins can view end-of-day cash close records.");
    res.json(await getCashCloseCheckpoints(req.params.tenantId, req.query));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.post("/manager-cash/close", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.close_create", "Only managers and admins can create end-of-day cash close checkpoints.");
    res.status(201).json(await createCashCloseCheckpoint(req.params.tenantId, req.body || {}, { staffId: req.user?.staffId, staffName: req.user?.name, role: req.user?.role }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.get("/manager-cash/close/:checkpointId/export", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.close_export", "Only managers and admins can export end-of-day cash close records.", { checkpointId: req.params.checkpointId });
    res.json(await exportCashCloseCheckpointCsv(req.params.tenantId, req.params.checkpointId));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.post("/manager-cash/wallet-cash", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.wallet_cash_reconcile", "Only managers and admins can reconcile wallet cash.");
    const walletInput = stripSensitiveVerification(req.body || {});
    const r = await enforceSensitiveAction(req, res, "wallet_adjustment", { ownerType: (walletInput as any)?.ownerType || null, ownerId: (walletInput as any)?.ownerId || null, movementType: (walletInput as any)?.movementType || null, amount: (walletInput as any)?.amount || 0 });
    if (r) return;
    res.status(201).json(await recordWalletCashMovement(req.params.tenantId, walletInput || {}, { staffId: req.user?.staffId, staffName: req.user?.name, role: req.user?.role, requestId: req.requestId || null }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
