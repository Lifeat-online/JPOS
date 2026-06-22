import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import { getDashboardKpis } from "../dashboardKpis.js";
import { buildLiveWorkstationQueueRows } from "../workstationStats.js";
import { getManagerActionCenter, getManagerActivityCsv, getManagerActivityHistory, getManagerAuditReport } from "../actionCenter.js";
import { decideManagerTask, getManagerTaskQueue, syncManagerTasksFromSignals } from "../managerTasks.js";
import { listManagerOverrides } from "../managerOverrides.js";
import { getPaymentProviderReconciliationReport } from "../paymentReports.js";
import { getMarginReport } from "../marginReports.js";
import { getOperationalAnalyticsReport } from "../operationalReports.js";
import { getAccountingJournalReport } from "../accountingJournal.js";
import { getTaxPeriods, getVatTaxReport, lockTaxPeriod } from "../taxReports.js";
import { getEcommerceMarketplaceExport } from "../ecommerceIntegrations.js";
import { ingestDeliveryOrder, listDeliveryOrders, updateDeliveryOrderStatus } from "../deliveryIntegrations.js";
import { authenticateIntegrationApiKey, createIntegrationApiKey, ingestStockWebhook, listIntegrationApiKeys, listIntegrationWebhookEvents, revokeIntegrationApiKey } from "../integrationAccess.js";
import { getActiveSalesByTenant, getRestaurantTablesByTenant, getWorkstationsByTenant, getStaffByTenant } from "../db-adapter.js";
import { broadcastToWorkstation, broadcastToTable, broadcastToTab, broadcastToSales } from "../socket.js";
import { canUseActionCenter, canManageInventory, auditActorFromRequest, auditRouteEvent, denyWithAudit, enforceSensitiveAction, stripSensitiveVerification, integrationSecretFromRequest } from "./_helpers.js";

export const reportsRouter = Router({ mergeParams: true });

// ── Dashboard / live ───────────────────────────────────────────────────────

reportsRouter.get("/live-dashboard", requireAuth, async (req: any, res) => {
  try {
    const tenantId = req.params.tenantId;
    const [sales, tables, staff, kpis] = await Promise.all([
      getActiveSalesByTenant(tenantId),
      getRestaurantTablesByTenant(tenantId),
      getStaffByTenant(tenantId),
      getDashboardKpis(tenantId),
    ]);
    const workstationQueues = await buildLiveWorkstationQueueRows(tenantId, sales);
    res.json({ sales, tables, staff, kpis, workstationQueues });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

reportsRouter.get("/dashboard-kpis", requireAuth, async (req: any, res) => {
  try { res.json(await getDashboardKpis(req.params.tenantId)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Action center ──────────────────────────────────────────────────────────

reportsRouter.get("/action-center", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "action_center.view", "Manager access is required for the action center.");
    res.json(await getManagerActionCenter(req.params.tenantId));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.get("/action-center/tasks", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "action_center.tasks_view", "Manager access is required for action center tasks.");
    res.json(await getManagerTaskQueue(req.params.tenantId));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.put("/action-center/tasks/:taskId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "action_center.task_decide", "Manager access is required for action center tasks.", { taskId: req.params.taskId });
    const decisionInput = stripSensitiveVerification(req.body || {});
    const r = await enforceSensitiveAction(req, res, "manager_override", { taskId: req.params.taskId, action: (decisionInput as any)?.action || null });
    if (r) return;
    res.json(await decideManagerTask(req.params.tenantId, req.params.taskId, { action: (decisionInput as any)?.action, note: (decisionInput as any)?.note, assignedTo: (decisionInput as any)?.assignedTo, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
reportsRouter.get("/action-center/activity", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "action_center.activity_view", "Manager access is required for action center activity.");
    res.json(await getManagerActivityHistory(req.params.tenantId, req.query));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.get("/action-center/activity/export", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "action_center.activity_export", "Manager access is required for action center activity export.");
    res.json(await getManagerActivityCsv(req.params.tenantId, req.query));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.get("/action-center/activity/report", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "action_center.audit_report_export", "Manager access is required for audit reports.");
    const report = await getManagerAuditReport(req.params.tenantId, req.query);
    await auditRouteEvent(req, "audit_report.exported", "audit_report", { audience: report.audience, rowCount: report.count, filters: req.query || {} }, null, "action_center");
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.post("/action-center/ai/insights/sync-tasks", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "ai.insights_sync_tasks", "Only managers, admins, and devs can sync AI recommendation tasks");
    const result = await syncManagerTasksFromSignals(req.params.tenantId);
    await auditRouteEvent(req, "ai.insights_synced_to_tasks", "manager_task", { synced: result.synced, approvalFirst: true }, req.params.tenantId, "ai");
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.get("/manager-overrides", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "manager_overrides.view", "Manager access is required for override history.");
    res.json(await listManagerOverrides(req.params.tenantId, Number(req.query.limit || 25)));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Financial reports ──────────────────────────────────────────────────────

reportsRouter.get("/reports/margins", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "reports.margins_view", "Manager access is required for margin reports.");
    const report = await getMarginReport(req.params.tenantId, req.query);
    await auditRouteEvent(req, "margin_report.exported", "margin_report", { periodStart: report.periodStart, periodEnd: report.periodEnd, revenue: report.summary.revenue, grossProfit: report.summary.grossProfit }, null, "reporting");
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.get("/reports/operational", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "reports.operational_view", "Manager access is required for operational analytics reports.");
    const report = await getOperationalAnalyticsReport(req.params.tenantId, req.query);
    await auditRouteEvent(req, "operational_report.exported", "operational_report", { periodStart: report.periodStart, periodEnd: report.periodEnd }, null, "reporting");
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.get("/reports/accounting-journal", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "reports.accounting_journal_view", "Manager access is required for accounting journal exports.");
    const report = await getAccountingJournalReport(req.params.tenantId, req.query);
    await auditRouteEvent(req, "accounting_journal.exported", "accounting_journal", { periodStart: report.periodStart, periodEnd: report.periodEnd, entryCount: report.summary.entryCount, balanced: report.summary.balanced }, null, "reporting");
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.get("/payment-provider-reconciliation/report", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "payment_provider_reconciliation.report_export", "Manager access is required for payment provider reconciliation reports.");
    const report = await getPaymentProviderReconciliationReport(req.params.tenantId, req.query);
    await auditRouteEvent(req, "payment_provider_reconciliation.report_exported", "payment_provider_reconciliation", { rowCount: report.count, filters: req.query || {}, pciBoundary: report.pciBoundary }, null, "payment_provider_reconciliation");
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.get("/tax/periods", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "tax.periods_view", "Manager access is required for tax periods.");
    res.json(await getTaxPeriods(req.params.tenantId, typeof req.query.limit === "string" ? req.query.limit : 24));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.get("/tax/vat-report", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "tax.vat_report_export", "Manager access is required for VAT reports.");
    const report = await getVatTaxReport(req.params.tenantId, req.query);
    await auditRouteEvent(req, "tax_report.exported", "tax_report", { periodStart: report.periodStart, periodEnd: report.periodEnd, invoiceCount: report.summary.invoiceCount, outputTax: report.summary.outputTax, locked: report.locked }, null, "tax_reporting");
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.post("/tax/periods/lock", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "tax.period_lock", "Manager access is required to lock tax periods.");
    res.json(await lockTaxPeriod(req.params.tenantId, req.body || {}, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null, role: req.user?.role || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ── Integrations ───────────────────────────────────────────────────────────

reportsRouter.get("/integrations/ecommerce/products-export", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "integrations.ecommerce_export", "Manager access is required for marketplace exports.");
    const report = await getEcommerceMarketplaceExport(req.params.tenantId, req.query);
    await auditRouteEvent(req, "integrations.ecommerce_exported", "ecommerce_integration", { productCount: report.summary.productCount, targetCount: report.summary.targetCount }, null, "integration");
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.get("/integrations/api-keys", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "integrations.api_keys_view", "Manager access is required for integration API keys.");
    res.json(await listIntegrationApiKeys(req.params.tenantId));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.post("/integrations/api-keys", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "integrations.api_key_create", "Manager access is required for integration API keys.");
    res.status(201).json(await createIntegrationApiKey(req.params.tenantId, req.body || {}, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
reportsRouter.post("/integrations/api-keys/:keyId/revoke", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "integrations.api_key_revoke", "Manager access is required for integration API keys.");
    const key = await revokeIntegrationApiKey(req.params.tenantId, req.params.keyId, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null });
    if (!key) return res.status(404).json({ error: "Integration API key not found" });
    res.json(key);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
reportsRouter.get("/integrations/webhook-events", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "integrations.webhook_events_view", "Manager access is required for integration webhook history.");
    res.json(await listIntegrationWebhookEvents(req.params.tenantId, { source: typeof req.query.source === "string" ? req.query.source : null, status: typeof req.query.status === "string" ? req.query.status : null, limit: typeof req.query.limit === "string" ? req.query.limit : 50 }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.get("/integrations/delivery/orders", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "integrations.delivery_orders_view", "Manager access is required for delivery orders.");
    res.json(await listDeliveryOrders(req.params.tenantId, { provider: typeof req.query.provider === "string" ? req.query.provider : null, status: typeof req.query.status === "string" ? req.query.status : null }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
reportsRouter.post("/integrations/delivery/orders", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "integrations.delivery_order_ingest", "Manager access is required to ingest delivery orders.");
    const order = await ingestDeliveryOrder(req.params.tenantId, req.body, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null });
    await auditRouteEvent(req, "delivery_order.ingest_route", "delivery_order", { provider: order.provider, externalOrderId: order.externalOrderId, status: order.status, itemCount: order.items.length }, order.id, "integration");
    res.status(201).json(order);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
reportsRouter.put("/integrations/delivery/orders/:orderId/status", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "integrations.delivery_order_status", "Manager access is required to update delivery orders.");
    const order = await updateDeliveryOrderStatus(req.params.tenantId, req.params.orderId, req.body?.status, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null });
    if (!order) return res.status(404).json({ error: "Delivery order not found" });
    res.json(order);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
