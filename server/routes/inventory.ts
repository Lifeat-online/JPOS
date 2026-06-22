import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import {
  getBulkItems, createBulkItem, updateBulkItem, deleteBulkItem,
  getVendors, createVendor, updateVendor,
  getPurchaseOrders, createPurchaseOrder, updatePurchaseOrder, receivePurchaseOrder,
  getStockBatches,
  updateProductRecipe, getProductRecipe, getRecipeCostingReport,
  createModifierGroup, updateModifierOptions, getProductModifiers, deleteModifierGroup,
} from "../mariadb-crud.js";
import {
  listInventoryLocations, createInventoryLocation, updateInventoryLocation,
  listProductLocationStocks, upsertProductLocationStock,
  listStockTransferOrders, createStockTransferOrder, completeStockTransferOrder,
} from "../inventoryLocations.js";
import {
  listReorderRecommendations, refreshReorderRecommendations,
  approveReorderRecommendation, dismissReorderRecommendation,
  listReorderNotificationRules, createReorderNotificationRule,
  updateReorderNotificationRule, runReorderNotificationRule,
} from "../reorderRecommendations.js";
import { getStockValuationReport } from "../stockReports.js";
import {
  getStockTakeSessions, createStockTakeSession, getStockTakeSession,
  getStockTakeSuggestions, getStockTakeRules, createStockTakeRule,
  updateStockTakeRule, deleteStockTakeRule, runDueStockTakeRules,
  getMyStockTakeAssignments, getStockTakeExportPack,
  submitStockTakeCount, requestStockTakeRecount, approveStockTakeSession,
} from "../stockTake.js";
import {
  batchCreateProducts, batchUpdateProductPrices,
  exportInventoryCsv, importInventory,
} from "../batchOperations.js";
import {
  canManageInventory, canUseActionCenter, auditActorFromRequest, auditRouteEvent,
  denyWithAudit, enforceSensitiveAction, stripSensitiveVerification,
  sensitiveRouteRateLimit,
} from "./_helpers.js";

export const inventoryRouter = Router({ mergeParams: true });

// ── Inventory locations ────────────────────────────────────────────────────

inventoryRouter.get("/locations", requireAuth, async (req: any, res) => {
  try { res.json(await listInventoryLocations(req.params.tenantId)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

inventoryRouter.post("/locations", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "inventory_locations.create", "Manager access is required to create inventory locations.");
    res.status(201).json(await createInventoryLocation(req.params.tenantId, req.body || {}, auditActorFromRequest(req)));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.put("/locations/:locationId", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "inventory_locations.update", "Manager access is required to update inventory locations.", { locationId: req.params.locationId });
    res.json(await updateInventoryLocation(req.params.tenantId, req.params.locationId, req.body || {}, auditActorFromRequest(req)));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.get("/location-stock", requireAuth, async (req: any, res) => {
  try {
    res.json(await listProductLocationStocks(req.params.tenantId, {
      productId: typeof req.query.productId === "string" ? req.query.productId : null,
      locationId: typeof req.query.locationId === "string" ? req.query.locationId : null,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

inventoryRouter.put("/location-stock", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "inventory_location_stock.update", "Manager access is required to adjust location stock.");
    res.json(await upsertProductLocationStock(req.params.tenantId, { ...(req.body || {}), ...auditActorFromRequest(req) }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ── Stock transfers ────────────────────────────────────────────────────────

inventoryRouter.get("/stock-transfers", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "stock_transfers.view", "Manager access is required to view stock transfers.");
    res.json(await listStockTransferOrders(req.params.tenantId, {
      status: typeof req.query.status === "string" ? req.query.status : null,
      limit: typeof req.query.limit === "string" ? req.query.limit : null,
    }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

inventoryRouter.post("/stock-transfers", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "stock_transfers.create", "Manager access is required to create stock transfers.");
    res.status(201).json(await createStockTransferOrder(req.params.tenantId, { ...(req.body || {}), ...auditActorFromRequest(req) }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.post("/stock-transfers/:transferId/complete", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "stock_transfers.complete", "Manager access is required to complete stock transfers.", { transferId: req.params.transferId });
    res.json(await completeStockTransferOrder(req.params.tenantId, req.params.transferId, auditActorFromRequest(req)));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ── Batch operations ────────────────────────────────────────────────────────

inventoryRouter.post("/batch/products/create", requireAuth, sensitiveRouteRateLimit, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "batch.products_create", "Manager access is required for batch product creation.");
    const result = await batchCreateProducts(req.params.tenantId, req.body || {}, auditActorFromRequest(req));
    await auditRouteEvent(req, "batch.products_created", "product", { dryRun: result.dryRun, created: result.created, skipped: result.skipped, errorCount: result.errors.length }, null, "inventory_batch");
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.post("/batch/products/prices", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "batch.product_prices_update", "Manager access is required for batch price updates.");
    const result = await batchUpdateProductPrices(req.params.tenantId, req.body || {}, auditActorFromRequest(req));
    await auditRouteEvent(req, "batch.product_prices_updated", "product", { dryRun: result.dryRun, updated: result.updated, skipped: result.skipped, errorCount: result.errors.length }, null, "inventory_batch");
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.get("/batch/export", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "batch.inventory_export", "Manager access is required for inventory exports.");
    const pack = await exportInventoryCsv(req.params.tenantId, { locationId: typeof req.query.locationId === "string" ? req.query.locationId : null });
    await auditRouteEvent(req, "batch.inventory_exported", "inventory", { count: pack.count, locationId: typeof req.query.locationId === "string" ? req.query.locationId : null }, null, "inventory_batch");
    res.json(pack);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.post("/batch/import", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "batch.inventory_import", "Manager access is required for inventory imports.");
    const result = await importInventory(req.params.tenantId, req.body || {}, auditActorFromRequest(req));
    await auditRouteEvent(req, "batch.inventory_imported", "inventory", { dryRun: result.dryRun, updated: result.updated, skipped: result.skipped, errorCount: result.errors.length }, null, "inventory_batch");
    res.json(result);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ── Stocktakes ─────────────────────────────────────────────────────────────

inventoryRouter.get("/stocktakes", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "stocktake.sessions_view", "Manager access is required for stocktake sessions.");
    res.json(await getStockTakeSessions(req.params.tenantId, { status: typeof req.query.status === "string" ? req.query.status : undefined, type: typeof req.query.type === "string" ? req.query.type : undefined }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

inventoryRouter.post("/stocktakes", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "stocktake.create", "Manager access is required to start a stocktake.");
    res.status(201).json(await createStockTakeSession(req.params.tenantId, req.body || {}, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null, role: req.user?.role || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.get("/stocktakes/suggestions", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "stocktake.suggestions_view", "Manager access is required for stocktake suggestions.");
    res.json(await getStockTakeSuggestions(req.params.tenantId, { limit: typeof req.query.limit === "string" ? req.query.limit : undefined }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

inventoryRouter.get("/stocktakes/rules", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "stocktake.rules_view", "Manager access is required for stocktake rules.");
    res.json(await getStockTakeRules(req.params.tenantId));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

inventoryRouter.post("/stocktakes/rules", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "stocktake.rule_create", "Manager access is required to create stocktake rules.");
    res.status(201).json(await createStockTakeRule(req.params.tenantId, req.body || {}, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null, role: req.user?.role || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.post("/stocktakes/rules/run-due", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "stocktake.rule_run_due", "Manager access is required to run stocktake rules.");
    res.json(await runDueStockTakeRules(req.params.tenantId, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null, role: req.user?.role || null }, { ruleId: req.body?.ruleId || null, force: Boolean(req.body?.force) }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.put("/stocktakes/rules/:ruleId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "stocktake.rule_update", "Manager access is required to update stocktake rules.", { ruleId: req.params.ruleId });
    res.json(await updateStockTakeRule(req.params.tenantId, req.params.ruleId, req.body || {}, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null, role: req.user?.role || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.delete("/stocktakes/rules/:ruleId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "stocktake.rule_delete", "Manager access is required to delete stocktake rules.", { ruleId: req.params.ruleId });
    res.json(await deleteStockTakeRule(req.params.tenantId, req.params.ruleId, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null, role: req.user?.role || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.get("/stocktakes/my-assignments", requireAuth, async (req: any, res) => {
  try {
    const staffId = String(req.query.staffId || req.user?.staffId || req.user?.uid || "").trim();
    res.json(await getMyStockTakeAssignments(req.params.tenantId, staffId));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.get("/stocktakes/:sessionId/export-pack", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "stocktake.export_pack", "Manager access is required to export stocktake packs.", { sessionId: req.params.sessionId });
    res.json(await getStockTakeExportPack(req.params.tenantId, req.params.sessionId));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.get("/stocktakes/:sessionId", requireAuth, async (req: any, res) => {
  try {
    const session = await getStockTakeSession(req.params.tenantId, req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Stocktake session not found" });
    if (!canUseActionCenter(req.user?.role)) {
      const staffId = req.user?.staffId || req.user?.uid || null;
      session.items = (session.items || []).filter((item: any) => item.assignedTo === staffId);
    }
    res.json(session);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

inventoryRouter.put("/stocktakes/items/:itemId/count", requireAuth, async (req: any, res) => {
  try {
    const r = await enforceSensitiveAction(req, res, "stock_adjustment", { itemId: req.params.itemId, countedQuantity: Number(req.body?.countedQuantity) });
    if (r) return;
    res.json(await submitStockTakeCount(req.params.tenantId, req.params.itemId, { countedQuantity: Number(req.body?.countedQuantity), note: req.body?.note || null, varianceReason: req.body?.varianceReason || null, requestId: req.requestId || null }, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null, role: req.user?.role || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.put("/stocktakes/items/:itemId/recount", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "stocktake.recount_request", "Manager access is required to request a recount.", { itemId: req.params.itemId });
    const r = await enforceSensitiveAction(req, res, "manager_override", { itemId: req.params.itemId, action: "recount_request" });
    if (r) return;
    res.json(await requestStockTakeRecount(req.params.tenantId, req.params.itemId, { note: req.body?.note || null, requestId: req.requestId || null }, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null, role: req.user?.role || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.put("/stocktakes/:sessionId/approve", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) return denyWithAudit(req, res, "stocktake.approve", "Manager access is required to approve a stocktake.", { sessionId: req.params.sessionId });
    const r = await enforceSensitiveAction(req, res, "manager_override", { sessionId: req.params.sessionId, action: "stocktake_approval" });
    if (r) return;
    res.json(await approveStockTakeSession(req.params.tenantId, req.params.sessionId, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null, role: req.user?.role || null, requestId: req.requestId || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// ── Vendors, POs, stock batches ────────────────────────────────────────────

inventoryRouter.get("/vendors", requireAuth, async (req: any, res) => {
  try { res.json(await getVendors(req.params.tenantId)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
inventoryRouter.post("/vendors", requireAuth, async (req: any, res) => {
  try { res.json(await createVendor(req.params.tenantId, req.body || {})); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
inventoryRouter.put("/vendors/:id", requireAuth, async (req: any, res) => {
  try { await updateVendor(req.params.tenantId, req.params.id, req.body || {}); res.json({ success: true }); } catch (err: any) { res.status(500).json({ error: err.message }); }
});

inventoryRouter.get("/purchase-orders", requireAuth, async (req: any, res) => {
  try { res.json(await getPurchaseOrders(req.params.tenantId)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
inventoryRouter.post("/purchase-orders", requireAuth, async (req: any, res) => {
  try { res.json(await createPurchaseOrder(req.params.tenantId, req.body || {})); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
inventoryRouter.put("/purchase-orders/:id", requireAuth, async (req: any, res) => {
  try {
    if (req.body?.status === "received") {
      if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "purchase_order.receive", "Only managers can receive purchase orders.", { purchaseOrderId: req.params.id });
      return res.json(await receivePurchaseOrder(req.params.tenantId, req.params.id, req.body || {}, auditActorFromRequest(req)));
    }
    await updatePurchaseOrder(req.params.tenantId, req.params.id, req.body || {});
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
inventoryRouter.post("/purchase-orders/:id/receive", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "purchase_order.receive", "Only managers can receive purchase orders.", { purchaseOrderId: req.params.id });
    res.json(await receivePurchaseOrder(req.params.tenantId, req.params.id, req.body || {}, auditActorFromRequest(req)));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

inventoryRouter.get("/stock-batches", requireAuth, async (req: any, res) => {
  try { res.json(await getStockBatches(req.params.tenantId)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});

inventoryRouter.get("/stock-reports/valuation", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "stock_report.valuation_export", "Manager access is required for stock valuation reports.");
    const report = await getStockValuationReport(req.params.tenantId, req.query);
    await auditRouteEvent(req, "stock_report.valuation_exported", "stock_report", { rowCount: report.productRows.length + report.batchRows.length + report.receivingRows.length, receivedValue: report.summary.receivedValue, productBookValue: report.summary.productBookValue }, null, "inventory");
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Bulk items ─────────────────────────────────────────────────────────────

inventoryRouter.get("/bulk-items", requireAuth, async (req: any, res) => {
  try { res.json(await getBulkItems(req.params.tenantId)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
inventoryRouter.post("/bulk-items", requireAuth, async (req: any, res) => {
  try { res.json(await createBulkItem(req.params.tenantId, req.body)); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
inventoryRouter.put("/bulk-items/:id", requireAuth, async (req: any, res) => {
  try { await updateBulkItem(req.params.tenantId, req.params.id, req.body); res.json({ success: true }); } catch (err: any) { res.status(500).json({ error: err.message }); }
});
inventoryRouter.delete("/bulk-items/:id", requireAuth, async (req: any, res) => {
  try { await deleteBulkItem(req.params.tenantId, req.params.id); res.json({ success: true }); } catch (err: any) { res.status(500).json({ error: err.message }); }
});

inventoryRouter.get("/recipe-costing-report", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "recipe_costing_report.view", "Manager access is required for recipe costing reports.");
    res.json(await getRecipeCostingReport(req.params.tenantId));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Reorder recommendations ────────────────────────────────────────────────

inventoryRouter.get("/reorder-recommendations", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "reorder_recommendations.view", "Manager access is required for reorder recommendations.");
    res.json(await listReorderRecommendations(req.params.tenantId, { status: typeof req.query.status === "string" ? req.query.status : undefined, limit: typeof req.query.limit === "string" ? req.query.limit : undefined }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
inventoryRouter.post("/reorder-recommendations/refresh", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "reorder_recommendations.refresh", "Manager access is required to refresh reorder recommendations.");
    res.json(await refreshReorderRecommendations(req.params.tenantId, { daysOfCover: req.body?.daysOfCover, vendorId: req.body?.vendorId || null, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
inventoryRouter.post("/reorder-recommendations/:id/approve", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "reorder_recommendations.approve", "Manager access is required to approve reorder recommendations.", { recommendationId: req.params.id });
    res.json(await approveReorderRecommendation(req.params.tenantId, req.params.id, { ...req.body, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
inventoryRouter.post("/reorder-recommendations/:id/dismiss", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "reorder_recommendations.dismiss", "Manager access is required to dismiss reorder recommendations.", { recommendationId: req.params.id });
    res.json(await dismissReorderRecommendation(req.params.tenantId, req.params.id, { note: req.body?.note || null, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
inventoryRouter.get("/reorder-notification-rules", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "reorder_notification_rules.view", "Manager access is required for reorder notification rules.");
    res.json(await listReorderNotificationRules(req.params.tenantId));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
inventoryRouter.post("/reorder-notification-rules", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "reorder_notification_rules.create", "Manager access is required to create reorder notification rules.");
    res.json(await createReorderNotificationRule(req.params.tenantId, { ...req.body, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
inventoryRouter.put("/reorder-notification-rules/:id", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "reorder_notification_rules.update", "Manager access is required to update reorder notification rules.", { ruleId: req.params.id });
    res.json(await updateReorderNotificationRule(req.params.tenantId, req.params.id, { ...req.body, staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
inventoryRouter.post("/reorder-notification-rules/:id/run", requireAuth, async (req: any, res) => {
  try {
    if (!canManageInventory(req.user?.role)) return denyWithAudit(req, res, "reorder_notification_rules.run", "Manager access is required to run reorder notification rules.", { ruleId: req.params.id });
    res.json(await runReorderNotificationRule(req.params.tenantId, req.params.id, { staffId: req.user?.staffId || req.user?.uid || null, staffName: req.user?.name || null }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
