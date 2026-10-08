import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import { getStaffByTenant } from "../db-adapter.js";
import { createStaff, updateStaff, deleteStaff } from "../db-crud.js";
import { validateSchema, StaffSchema, StaffUpdateSchema } from "../validation.js";
import { denyWithAudit, auditRouteEvent, auditActorFromRequest, canUseActionCenter, requireManagerRole } from "./_helpers.js";
import {
  cancelStaffShift, clockIn, clockOut, createStaffShift, endBreak, getMyAttendanceStatus,
  getTimesheetPayrollReport, listStaffShifts, publishRoster, startBreak, updateStaffShift
} from "../staffScheduling.js";
import { addStaffCoachingNote, getStaffPerformanceReport } from "../staffPerformance.js";
import {
  createTipPoolRule, generateTipPoolPayouts, listTipPoolPayouts, listTipPoolRules,
  previewTipPoolPayouts, updateTipPoolRule
} from "../tipPooling.js";

import {
  createManagerSaleApprovalRequest, decideManagerTask, getManagerTaskQueue, syncManagerTasksFromSignals
} from "../managerTasks.js";
import { sendRouteError } from "../securityHardening.js";

export const staffRouter = Router({ mergeParams: true });

staffRouter.get("/", requireAuth, async (req: any, res) => {
  try {
    const staff = await getStaffByTenant(req.params.tenantId);
    res.json(staff);
  } catch (err: any) {
    sendRouteError(res, err, req);
  }
});

staffRouter.post("/", requireAuth, requireManagerRole, validateSchema(StaffSchema), async (req: any, res) => {
  try {
    const created = await createStaff(req.params.tenantId, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.put("/:staffId", requireAuth, requireManagerRole, validateSchema(StaffUpdateSchema), async (req: any, res) => {
  try {
    const updated = await updateStaff(req.params.tenantId, req.params.staffId, req.body);
    res.json(updated);
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.delete("/:staffId", requireAuth, requireManagerRole, async (req: any, res) => {
  try {
    await deleteStaff(req.params.tenantId, req.params.staffId);
    res.status(204).end();
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.get("/shifts", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.shifts.view", "Manager access is required to view staff rosters.");
    }
    res.json(await listStaffShifts(req.params.tenantId, {
      startDate: String(req.query.startDate || req.query.from || ""),
      endDate: String(req.query.endDate || req.query.to || ""),
      staffId: req.query.staffId ? String(req.query.staffId) : undefined,
    }));
  } catch (err: any) {
    sendRouteError(res, err, req);
  }
});

staffRouter.post("/shifts", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.shifts.create", "Manager access is required to schedule shifts.");
    }
    res.json(await createStaffShift(req.params.tenantId, req.body || {}, auditActorFromRequest(req)));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.put("/shifts/:shiftId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.shifts.update", "Manager access is required to edit shifts.");
    }
    res.json(await updateStaffShift(req.params.tenantId, req.params.shiftId, req.body || {}, auditActorFromRequest(req)));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.delete("/shifts/:shiftId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.shifts.cancel", "Manager access is required to cancel shifts.");
    }
    res.json(await cancelStaffShift(req.params.tenantId, req.params.shiftId, auditActorFromRequest(req)));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.post("/roster/publish", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.roster.publish", "Manager access is required to publish rosters.");
    }
    res.json(await publishRoster(
      req.params.tenantId,
      String(req.body?.startDate || req.body?.from || ""),
      String(req.body?.endDate || req.body?.to || req.body?.startDate || ""),
      auditActorFromRequest(req),
    ));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.get("/timesheet-payroll", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.payroll.export", "Manager access is required to export timesheets.");
    }
    const report = await getTimesheetPayrollReport(req.params.tenantId, {
      startDate: String(req.query.startDate || req.query.from || ""),
      endDate: String(req.query.endDate || req.query.to || ""),
      staffId: req.query.staffId ? String(req.query.staffId) : undefined,
    });
    res.json(report);
  } catch (err: any) {
    sendRouteError(res, err, req);
  }
});

staffRouter.get("/performance", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.staff_performance.view", "Manager access is required to view staff performance insights.");
    }
    res.json(await getStaffPerformanceReport(req.params.tenantId, {
      startDate: String(req.query.startDate || req.query.from || ""),
      endDate: String(req.query.endDate || req.query.to || ""),
      staffId: req.query.staffId ? String(req.query.staffId) : undefined,
    }));
  } catch (err: any) {
    sendRouteError(res, err, req);
  }
});

staffRouter.post("/performance/coaching-notes", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.staff_performance.coaching_note", "Manager access is required to add staff coaching notes.");
    }
    res.json(await addStaffCoachingNote(req.params.tenantId, req.body || {}, auditActorFromRequest(req)));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.get("/tip-pool-rules", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.tip_pool_rules.view", "Manager access is required to view tip pool rules.");
    }
    res.json(await listTipPoolRules(req.params.tenantId));
  } catch (err: any) {
    sendRouteError(res, err, req);
  }
});

staffRouter.post("/tip-pool-rules", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.tip_pool_rules.create", "Manager access is required to create tip pool rules.");
    }
    res.json(await createTipPoolRule(req.params.tenantId, req.body || {}, auditActorFromRequest(req)));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.put("/tip-pool-rules/:ruleId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.tip_pool_rules.update", "Manager access is required to update tip pool rules.");
    }
    res.json(await updateTipPoolRule(req.params.tenantId, req.params.ruleId, req.body || {}, auditActorFromRequest(req)));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.post("/tip-pools/preview", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.tip_pool.preview", "Manager access is required to preview tip pool payouts.");
    }
    res.json(await previewTipPoolPayouts(req.params.tenantId, req.body || {}));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.post("/tip-pools/generate", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.tip_pool.generate", "Manager access is required to generate tip pool payouts.");
    }
    res.json(await generateTipPoolPayouts(req.params.tenantId, req.body || {}, auditActorFromRequest(req)));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.get("/tip-pool-payouts", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.tip_pool_payouts.view", "Manager access is required to view tip pool payouts.");
    }
    res.json(await listTipPoolPayouts(req.params.tenantId, {
      ruleId: req.query.ruleId ? String(req.query.ruleId) : undefined,
      startDate: req.query.startDate ? String(req.query.startDate) : undefined,
      endDate: req.query.endDate ? String(req.query.endDate) : undefined,
      staffId: req.query.staffId ? String(req.query.staffId) : undefined,
    }));
  } catch (err: any) {
    sendRouteError(res, err, req);
  }
});

// ── Workforce attendance/breaks/clock-in (mounted at /workforce too) ────

staffRouter.get("/attendance/me", requireAuth, async (req: any, res) => {
  try {
    const actor = auditActorFromRequest(req);
    const requestedStaffId = req.query.staffId ? String(req.query.staffId) : actor.staffId;
    if (!requestedStaffId) return res.status(400).json({ error: "Staff member is required." });
    if (requestedStaffId !== actor.staffId && !canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.attendance.view", "Manager access is required to view another staff member's attendance.");
    }
    res.json(await getMyAttendanceStatus(req.params.tenantId, requestedStaffId));
  } catch (err: any) {
    sendRouteError(res, err, req);
  }
});

staffRouter.post("/clock-in", requireAuth, async (req: any, res) => {
  try {
    const actor = auditActorFromRequest(req);
    const requestedStaffId = req.body?.staffId || actor.staffId;
    if (requestedStaffId !== actor.staffId && !canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.clock_in", "Manager access is required to clock in another staff member.");
    }
    res.json(await clockIn(req.params.tenantId, { ...req.body, staffId: requestedStaffId }, actor));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.post("/break/start", requireAuth, async (req: any, res) => {
  try {
    const actor = auditActorFromRequest(req);
    const requestedStaffId = req.body?.staffId || actor.staffId;
    if (!requestedStaffId) return res.status(400).json({ error: "Staff member is required." });
    if (requestedStaffId !== actor.staffId && !canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.break_start", "Manager access is required to start another staff member's break.");
    }
    res.json(await startBreak(req.params.tenantId, requestedStaffId, req.body?.at || null));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.post("/break/end", requireAuth, async (req: any, res) => {
  try {
    const actor = auditActorFromRequest(req);
    const requestedStaffId = req.body?.staffId || actor.staffId;
    if (!requestedStaffId) return res.status(400).json({ error: "Staff member is required." });
    if (requestedStaffId !== actor.staffId && !canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.break_end", "Manager access is required to end another staff member's break.");
    }
    res.json(await endBreak(req.params.tenantId, requestedStaffId, req.body?.at || null));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

staffRouter.post("/clock-out", requireAuth, async (req: any, res) => {
  try {
    const actor = auditActorFromRequest(req);
    const requestedStaffId = req.body?.staffId || actor.staffId;
    if (!requestedStaffId) return res.status(400).json({ error: "Staff member is required." });
    if (requestedStaffId !== actor.staffId && !canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "workforce.clock_out", "Manager access is required to clock out another staff member.");
    }
    res.json(await clockOut(req.params.tenantId, { ...req.body, staffId: requestedStaffId }, actor));
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});