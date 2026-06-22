import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import { getPayoutRequestsByTenant, getCustomerPayoutRequestsByTenant, getOpenCashSessionByStaff } from "../db-adapter.js";
import {
  createPayoutRequest, updatePayoutRequest, updateCustomerPayoutRequest, createCustomerPayoutRequest,
} from "../db-crud.js";
import {
  getManagerCashSummary, getManagerCashMovements, exportManagerCashMovementsCsv,
  recordManagerCashMovement, createCashCustodyTransfer, getCashCustodyTransfers,
  confirmCashCustodyTransfer, cancelCashCustodyTransfer,
  getCashClosePreview, getCashCloseCheckpoints, createCashCloseCheckpoint, exportCashCloseCheckpointCsv,
  recordWalletCashMovement, recordRegisterWalletCashMovement,
  transferCashSessionToManagerFloat,
} from "../managerCash.js";
import { getAppConfigByTenant } from "../db-adapter.js";
import { getConnection, isPostgres, query } from "../db.js";
import { getHostedPackage } from "../../shared/packageCatalog.js";
import { recordAuditEventSafe } from "../audit.js";
import * as licence from "../licenceMiddleware.js";
import {
  canManageCash, auditActorFromRequest, auditRouteEvent, denyWithAudit,
  enforceSensitiveAction, drawerMovementSensitiveAction,
  stripSensitiveVerification, auditChangedFields, safeJsonField,
} from "./_helpers.js";
import { optionalAuth } from "../auth-middleware.js";
import { queueCashDrawerPulseForNoSale } from "../hardwareAdapters.js";

export const cashRouter = Router({ mergeParams: true });

function toMoneyNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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
    `INSERT INTO cash_movements (
      id, tenant_id, cash_session_id, type, direction, amount, sale_id, payment_id,
      staff_id, staff_name, created_by, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      id,
      tenantId,
      data.cashSessionId,
      data.type,
      data.direction || "neutral",
      data.amount || 0,
      data.saleId || null,
      data.paymentId || null,
      data.staffId || null,
      data.staffName || null,
      data.createdBy || null,
      data.note || null,
    ]
  );
  await recordAuditEventSafe({
    tenantId,
    action: "cash_movement.recorded",
    entityType: "cash_movement",
    entityId: id,
    relatedSaleId: data.saleId || null,
    staffId: data.createdBy || data.staffId || null,
    staffName: data.staffName || null,
    requestId: data.requestId || null,
    source: "cash_session",
    details: {
      cashSessionId: data.cashSessionId || null,
      type: data.type,
      direction: data.direction || "neutral",
      amount: data.amount || 0,
      paymentId: data.paymentId || null,
      note: data.note || null,
    },
  });
  return { id, ...data };
}

async function mirrorDrawerMovementToManagerCash(tenantId: string, movement: any, actor: any) {
  if (movement.type === "cash_drop") {
    await recordManagerCashMovement(tenantId, {
      movementType: "safe_drop",
      direction: "in",
      amount: movement.amount,
      cashSessionId: movement.cashSessionId,
      staffId: movement.staffId,
      staffName: movement.staffName,
      sourceType: "register",
      referenceId: movement.id,
      category: "safe_drop",
      note: movement.note || "Safe drop from register",
    }, actor);
  }
  if (movement.type === "cash_added") {
    await recordManagerCashMovement(tenantId, {
      movementType: "cash_added",
      direction: "out",
      amount: movement.amount,
      cashSessionId: movement.cashSessionId,
      staffId: movement.staffId,
      staffName: movement.staffName,
      sourceType: "manager_float",
      referenceId: movement.id,
      category: "register_float",
      note: movement.note || "Cash added to register",
    }, actor);
  }
  if (movement.type === "cash_removed") {
    await recordManagerCashMovement(tenantId, {
      movementType: "petty_cash",
      direction: "neutral",
      amount: movement.amount,
      cashSessionId: movement.cashSessionId,
      staffId: movement.staffId,
      staffName: movement.staffName,
      sourceType: "register",
      referenceId: movement.id,
      category: "petty_cash",
      note: movement.note || "Petty cash or payout from register",
    }, actor);
  }
}

function expectedCashDeltaForMovement(type: string, direction: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (type === "cash_added") return amount;
  if (type === "cash_drop" || type === "cash_removed") return -amount;
  if (direction === "in") return amount;
  if (direction === "out") return -amount;
  return 0;
}

async function getSessionRecordedTips(tenantId: string, sessionId: string, closedAt: Date) {
  const rows = await query(
    `SELECT
      cs.staff_id AS staffId,
      cs.status AS currentStatus,
      cs.net_tips AS previousNetTips,
      COALESCE((
        SELECT SUM(sp.tip_amount)
        FROM sales s
        INNER JOIN sale_payments sp ON sp.sale_id = s.id
        WHERE s.tenant_id = cs.tenant_id
          AND s.staff_id = cs.staff_id
          AND s.status = 'completed'
          AND sp.tip_amount > 0
          AND sp.created_at >= cs.opened_at
          AND sp.created_at <= ?
      ), 0) AS paymentTips,
      COALESCE((
        SELECT SUM(s.tip_amount)
        FROM sales s
        WHERE s.tenant_id = cs.tenant_id
          AND s.staff_id = cs.staff_id
          AND s.status = 'completed'
          AND s.tip_amount > 0
          AND s.created_at >= cs.opened_at
          AND s.created_at <= ?
          AND NOT EXISTS (
            SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id
          )
      ), 0) AS legacyTips
    FROM cash_sessions cs
    WHERE cs.tenant_id = ? AND cs.id = ?
    LIMIT 1`,
    [closedAt, closedAt, tenantId, sessionId]
  );

  const row = rows[0] as any;
  if (!row) return null;
  return {
    staffId: row.staffId,
    currentStatus: row.currentStatus,
    recordedTips: toMoneyNumber(row.paymentTips) + toMoneyNumber(row.legacyTips),
  };
}

// ── Cash sessions ──────────────────────────────────────────────────────────

cashRouter.get("/cash-sessions", optionalAuth, async (req: any, res) => {
  try {
    const staffId = req.query.staffId as string;
    if (staffId) {
      const r: any = await getOpenCashSessionByStaff(req.params.tenantId, staffId);
      if (!r) return res.json(null);
      return res.json(cashSessionResponse(r));
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const rows = await query(
      "SELECT * FROM cash_sessions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?",
      [req.params.tenantId, limit]
    );

    const sessions = rows.map(cashSessionResponse);
    res.json(sessions);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

cashRouter.get("/cash-sessions/:id/movements", requireAuth, async (req: any, res) => {
  try {
    const rows = await query(
      `SELECT
        id,
        tenant_id AS tenantId,
        cash_session_id AS sessionId,
        type,
        direction,
        amount,
        sale_id AS saleId,
        payment_id AS paymentId,
        staff_id AS staffId,
        staff_name AS staffName,
        created_by AS createdBy,
        note,
        created_at AS timestamp
      FROM cash_movements
      WHERE tenant_id = ? AND cash_session_id = ?
      ORDER BY created_at ASC`,
      [req.params.tenantId, req.params.id]
    );
    res.json(rows.map((r: any) => ({ ...r, amount: Number(r.amount || 0) })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

cashRouter.post("/cash-sessions", requireAuth, async (req: any, res) => {
  try {
    const activeRegisterRows = await query<any>(
      "SELECT COUNT(*) AS active_count FROM cash_sessions WHERE tenant_id = ? AND status = 'open'",
      [req.params.tenantId]
    );
    const activeRegisters = Number(activeRegisterRows[0]?.active_count || 0);
    const cfg = await getAppConfigByTenant(req.params.tenantId);
    const hostedPackage = getHostedPackage(cfg?.business?.packageTier || process.env.JPOS_HOSTED_PACKAGE_TIER || "free");
    const hostedLimitReached = !licence.shouldEnforceLicence() && hostedPackage.maxRegisters !== -1 && activeRegisters >= hostedPackage.maxRegisters;
    if (!licence.checkRegisterLimit(activeRegisters) || hostedLimitReached) {
      const info = licence.getLicenceInfo();
      void auditRouteEvent(req, "permission.denied", "security", {
        attemptedAction: "cash_session.open",
        reason: "register_limit_reached",
        activeRegisters,
        package: info.payload?.tier || hostedPackage.id,
        limit: info.payload?.maxRegisters ?? hostedPackage.maxRegisters,
      }, auditActorFromRequest(req).staffId, "permission");
      return res.status(403).json({
        error: "Register limit reached",
        package: info.payload?.tier || hostedPackage.id,
        limit: info.payload?.maxRegisters ?? hostedPackage.maxRegisters,
        upgrade: "Contact support to upgrade your licence",
      });
    }

    const id = `cs_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const sessionStaffId = req.user?.staffId || req.user?.uid || null;
    const sessionStaffName = req.user?.name || null;
    if (!sessionStaffId) {
      return res.status(401).json({ error: "Cannot open a cash session without an authenticated staff identity." });
    }
    await query(
      `INSERT INTO cash_sessions (
        id, tenant_id, staff_id, staff_name, opened_at, opening_float, opening_breakdown,
        expected_cash, status, review_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        req.params.tenantId,
        sessionStaffId,
        sessionStaffName || '',
        req.body.openedAt ? new Date(req.body.openedAt) : new Date(),
        req.body.openingFloat || 0,
        JSON.stringify(req.body.openingBreakdown || {}),
        req.body.expectedCash || 0,
        req.body.status || 'open',
        'in_progress',
      ]
    );
    if (Number(req.body.openingFloat || 0) > 0) {
      await recordCashMovement(req.params.tenantId, {
        cashSessionId: id,
        type: "opening_float",
        direction: "in",
        amount: Number(req.body.openingFloat || 0),
        staffId: sessionStaffId,
        staffName: sessionStaffName || "",
        createdBy: sessionStaffId,
        note: "Opening float counted",
        requestId: req.requestId || null,
      });
    }
    await auditRouteEvent(req, "cash_session.opened", "cash_session", {
      staffId: sessionStaffId,
      staffName: sessionStaffName,
      openingFloat: req.body.openingFloat || 0,
      status: req.body.status || "open",
    }, id, "cash_session");
    res.json({ id, ...req.body, reviewStatus: 'in_progress' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

cashRouter.post("/cash-sessions/:id/movements", requireAuth, async (req: any, res) => {
  try {
    const movementInput = stripSensitiveVerification(req.body || {});
    const movementType = String((movementInput as any).type || "");
    if (["cash_drop", "cash_added", "cash_removed"].includes(movementType) && !canManageCash(req.user?.role)) {
      return denyWithAudit(req, res, "cash_session.manager_movement", "Manager approval is required for cash movements.", {
        cashSessionId: req.params.id,
        movementType,
      });
    }
    const sensitiveAction = drawerMovementSensitiveAction(movementType);
    if (sensitiveAction) {
      const sensitiveResponse = await enforceSensitiveAction(req, res, sensitiveAction, {
        cashSessionId: req.params.id,
        movementType,
        amount: (movementInput as any).amount || 0,
      });
      if (sensitiveResponse) return;
    }

    const amount = toMoneyNumber((movementInput as any).amount);
    const movement = await recordCashMovement(req.params.tenantId, {
      cashSessionId: req.params.id,
      type: movementType,
      direction: (movementInput as any).direction,
      amount,
      saleId: (movementInput as any).saleId,
      paymentId: (movementInput as any).paymentId,
      staffId: (movementInput as any).staffId,
      staffName: (movementInput as any).staffName,
      createdBy: req.user?.staffId,
      note: (movementInput as any).note,
    });
    await mirrorDrawerMovementToManagerCash(req.params.tenantId, movement, {
      staffId: req.user?.staffId,
      staffName: req.user?.name,
      role: req.user?.role,
    });
    if (movementType === "no_sale") {
      queueCashDrawerPulseForNoSale(req.params.tenantId, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || (movementInput as any).staffName || null,
      }, {
        cashSessionId: req.params.id,
        movementId: movement.id,
        reason: (movementInput as any).note || null,
      }).catch(err => console.error("[hardware] Failed to queue cash drawer pulse", err));
    }
    const delta = expectedCashDeltaForMovement(movementType, (movementInput as any).direction, amount);
    if (delta !== 0) {
      await query(
        `UPDATE cash_sessions SET expected_cash = COALESCE(expected_cash, 0) + ?, updated_at = NOW() WHERE tenant_id = ? AND id = ? AND status = 'open'`,
        [delta, req.params.tenantId, req.params.id]
      );
    }
    res.json(movement);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

cashRouter.put("/cash-sessions/:id", requireAuth, async (req: any, res) => {
  try {
    const updates = req.body;
    if (
      ["reviewed", "reconciled", "disputed"].includes(updates.reviewStatus) &&
      !canManageCash(req.user?.role)
    ) {
      return denyWithAudit(req, res, "cash_session.review_finalize", "Only managers and admins can finalize cash reviews", {
        cashSessionId: req.params.id,
        reviewStatus: updates.reviewStatus,
      });
    }
    if (updates.tipsDelta !== undefined) {
      const tipDelta = Number(updates.tipsDelta);
      if (!Number.isFinite(tipDelta) || tipDelta < 0) {
        return res.status(400).json({ error: "tipsDelta must be a non-negative number." });
      }
      updates.tipsDelta = tipDelta;
    }
    const isSubmittingCashUp = updates.status === "closed" || updates.reviewStatus === "submitted";
    let walletTipsDelta = 0;
    let walletTipsStaffId: string | null = null;
    if (isSubmittingCashUp) {
      const closedAt = updates.closedAt ? new Date(updates.closedAt) : new Date();
      const tipSummary = await getSessionRecordedTips(req.params.tenantId, req.params.id, closedAt);
      if (tipSummary) {
        const difference = updates.difference !== undefined
          ? toMoneyNumber(updates.difference)
          : toMoneyNumber(updates.actualCash) - toMoneyNumber(updates.expectedCash);
        const recordedTips = tipSummary.recordedTips;
        const netTips = Math.max(0, recordedTips + Math.min(0, difference));

        updates.accumulatedTips = recordedTips;
        updates.netTips = netTips;

        if (tipSummary.currentStatus !== "closed" && netTips > 0) {
          walletTipsDelta = netTips;
          walletTipsStaffId = tipSummary.staffId;
        }
      }
    }
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.submittedAt !== undefined) { fields.push("submitted_at = ?"); values.push(updates.submittedAt ? new Date(updates.submittedAt) : null); }
    if (updates.reviewedAt !== undefined) { fields.push("reviewed_at = ?"); values.push(updates.reviewedAt ? new Date(updates.reviewedAt) : null); }
    if (updates.reviewedBy !== undefined) { fields.push("reviewed_by = ?"); values.push(updates.reviewedBy || null); }
    if (updates.reconciledAt !== undefined) { fields.push("reconciled_at = ?"); values.push(updates.reconciledAt ? new Date(updates.reconciledAt) : null); }
    if (updates.reconciledBy !== undefined) { fields.push("reconciled_by = ?"); values.push(updates.reconciledBy || null); }
    if (updates.closedAt !== undefined) { fields.push("closed_at = ?"); values.push(updates.closedAt ? new Date(updates.closedAt) : null); }
    if (updates.actualCash !== undefined) { fields.push("actual_cash = ?"); values.push(updates.actualCash); }
    if (updates.openingBreakdown !== undefined) { fields.push("opening_breakdown = ?"); values.push(JSON.stringify(updates.openingBreakdown || {})); }
    if (updates.closingBreakdown !== undefined) { fields.push("closing_breakdown = ?"); values.push(JSON.stringify(updates.closingBreakdown || {})); }
    if (updates.difference !== undefined) { fields.push("difference = ?"); values.push(updates.difference); }
    if (updates.accumulatedTips !== undefined) { fields.push("accumulated_tips = ?"); values.push(updates.accumulatedTips); }
    if (updates.netTips !== undefined) { fields.push("net_tips = ?"); values.push(updates.netTips); }
    if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
    if (updates.reviewStatus !== undefined) { fields.push("review_status = ?"); values.push(updates.reviewStatus); }
    if (updates.notes !== undefined) { fields.push("notes = ?"); values.push(updates.notes); }
    if (updates.managerNotes !== undefined) { fields.push("manager_notes = ?"); values.push(updates.managerNotes); }
    if (updates.varianceReason !== undefined) { fields.push("variance_reason = ?"); values.push(updates.varianceReason); }
    if (updates.expectedCash !== undefined) { fields.push("expected_cash = ?"); values.push(updates.expectedCash); }
    if (updates.expectedCashDelta !== undefined) { fields.push("expected_cash = expected_cash + ?"); values.push(updates.expectedCashDelta); }
    if (updates.tipsDelta !== undefined) { fields.push("accumulated_tips = accumulated_tips + ?"); values.push(updates.tipsDelta); }

    if (fields.length > 0 || walletTipsDelta > 0) {
      if (walletTipsDelta > 0 || (updates.tipsDelta !== undefined && updates.tipsDelta > 0)) {
        const sensitiveResponse = await enforceSensitiveAction(req, res, "wallet_adjustment", {
          cashSessionId: req.params.id,
          walletTipsDelta,
          walletTipsStaffId,
          clientTipsDelta: updates.tipsDelta ?? null,
        });
        if (sensitiveResponse) return;
      }
      const conn = await getConnection();
      try {
        await conn.beginTransaction();
        if (fields.length > 0) {
          fields.push("updated_at = NOW()");
          values.push(req.params.id, req.params.tenantId);
          await conn.query(`UPDATE cash_sessions SET ${fields.join(", ")} WHERE id = ? AND tenant_id = ?`, values);
        }
        if (walletTipsDelta > 0) {
          await conn.query(
            `UPDATE staff SET wallet_balance = COALESCE(wallet_balance, 0) + ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
            [walletTipsDelta, req.params.tenantId, walletTipsStaffId]
          );
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
    await auditRouteEvent(req, "cash_session.updated", "cash_session", {
      cashSessionId: req.params.id,
      changedFields: auditChangedFields(updates || {}),
      status: updates.status || null,
      reviewStatus: updates.reviewStatus || null,
      walletTipsDelta,
      walletTipsStaffId,
    }, req.params.id, "cash_session");
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

cashRouter.put("/cash-sessions/:id/review", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) {
      return denyWithAudit(req, res, "cash_session.review", "Only managers and admins can review cash ups", {
        cashSessionId: req.params.id,
      });
    }
    const reviewStatus = req.body.reviewStatus || "reviewed";
    if (!["reviewed", "reconciled", "disputed"].includes(reviewStatus)) {
      return res.status(400).json({ error: "Invalid review status" });
    }

    const fields = [
      "review_status = ?",
      "reviewed_at = NOW()",
      "reviewed_by = ?",
      "manager_notes = ?",
      "variance_reason = ?",
      "updated_at = NOW()",
    ];
    const values: any[] = [
      reviewStatus,
      req.user?.staffId || null,
      req.body.managerNotes || null,
      req.body.varianceReason || null,
    ];

    if (reviewStatus === "reconciled") {
      fields.splice(3, 0, "reconciled_at = NOW()", "reconciled_by = ?");
      values.splice(2, 0, req.user?.staffId || null);
    }

    values.push(req.params.id, req.params.tenantId);
    await query(`UPDATE cash_sessions SET ${fields.join(", ")} WHERE id = ? AND tenant_id = ?`, values);
    if (reviewStatus === "reconciled") {
      await transferCashSessionToManagerFloat(req.params.tenantId, req.params.id, {
        staffId: req.user?.staffId,
        staffName: req.user?.name,
        role: req.user?.role,
      });
    }
    await auditRouteEvent(req, "cash_session.reviewed", "cash_session", {
      cashSessionId: req.params.id,
      reviewStatus,
      managerNotesPresent: Boolean(req.body.managerNotes),
      varianceReasonPresent: Boolean(req.body.varianceReason),
    }, req.params.id, "cash_session");
    res.json({ success: true, reviewStatus });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

cashRouter.post("/cash-sessions/:id/wallet-cash", requireAuth, async (req: any, res) => {
  try {
    const walletInput = stripSensitiveVerification(req.body || {});
    const sensitiveResponse = await enforceSensitiveAction(req, res, "wallet_adjustment", {
      cashSessionId: req.params.id,
      ownerType: (walletInput as any)?.ownerType || null,
      ownerId: (walletInput as any)?.ownerId || null,
      movementType: (walletInput as any)?.movementType || null,
      amount: (walletInput as any)?.amount || 0,
    });
    if (sensitiveResponse) return;

    const result = await recordRegisterWalletCashMovement(req.params.tenantId, {
      ...(walletInput || {}),
      cashSessionId: req.params.id,
    }, {
      staffId: req.user?.staffId,
      staffName: req.user?.name,
      role: req.user?.role,
      requestId: req.requestId || null,
    });
    res.status(201).json(result);
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
cashRouter.post("/customer-payout-requests", requireAuth, async (req: any, res) => {
  try { res.json(await createCustomerPayoutRequest(req.params.tenantId, req.body)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.put("/customer-payout-requests/:id", requireAuth, async (req: any, res) => {
  try { res.json(await updateCustomerPayoutRequest(req.params.tenantId, req.params.id, req.body)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Manager cash ───────────────────────────────────────────────────────────

cashRouter.get("/manager-cash/summary", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.summary_view", "Only managers and admins can view the manager cash summary.");
    res.json(await getManagerCashSummary(req.params.tenantId));
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

cashRouter.get("/manager-cash/transfers", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.transfers_view", "Only managers and admins can view cash custody transfers.");
    res.json(await getCashCustodyTransfers(req.params.tenantId, typeof req.query.status === "string" ? req.query.status : null, Number(req.query.limit || 25)));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.post("/manager-cash/transfers", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.transfer_request", "Only managers and admins can request cash custody transfers.");
    res.status(201).json(await createCashCustodyTransfer(req.params.tenantId, req.body || {}, { staffId: req.user?.staffId, staffName: req.user?.name, role: req.user?.role }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.put("/manager-cash/transfers/:transferId/confirm", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.transfer_confirm", "Only managers and admins can confirm cash custody transfers.", { transferId: req.params.transferId });
    res.json(await confirmCashCustodyTransfer(req.params.tenantId, req.params.transferId, { staffId: req.user?.staffId, staffName: req.user?.name, role: req.user?.role }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
cashRouter.put("/manager-cash/transfers/:transferId/cancel", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.transfer_cancel", "Only managers and admins can cancel cash custody transfers.", { transferId: req.params.transferId });
    res.json(await cancelCashCustodyTransfer(req.params.tenantId, req.params.transferId, { staffId: req.user?.staffId, staffName: req.user?.name, role: req.user?.role }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

cashRouter.get("/manager-cash/close/preview", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.close_preview", "Only managers and admins can preview end-of-day cash close.");
    res.json(await getCashClosePreview(req.params.tenantId, typeof req.query.businessDate === "string" ? req.query.businessDate : null));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
cashRouter.get("/manager-cash/close", requireAuth, async (req: any, res) => {
  try {
    if (!canManageCash(req.user?.role)) return denyWithAudit(req, res, "manager_cash.close_view", "Only managers and admins can view end-of-day cash close records.");
    res.json(await getCashCloseCheckpoints(req.params.tenantId, Number(req.query.limit || 20)));
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
