import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import {
  createSale, updateSale, getSaleById, updateSalePaymentProviderStatus,
  processSaleRefund, processSaleVoid, updateSaleItem, clearAllSales,
} from "../db-crud.js";
import { validateSchema, SaleSchema, SaleRefundSchema, SaleVoidSchema, PaymentProviderStatusSchema } from "../validation.js";
import { broadcastSalesUpdate } from "../socket.js";
import { sendPushNotification } from "../pushNotifications.js";
import { queueKitchenPrintJobsForSale } from "../hardwareAdapters.js";
import { createManagerSaleApprovalRequest } from "../managerTasks.js";
import { syncOfflineSaleIssues } from "../offlineSync.js";
import {
  auditActorFromRequest, auditRouteEvent, denyWithAudit,
  enforceSensitiveAction, saleMutationSensitiveAction,
  stripSensitiveVerification, auditChangedFields, canUseActionCenter,
  sensitiveRouteRateLimit,
} from "./_helpers.js";

export const salesRouter = Router({ mergeParams: true });

// helpers local to this router
function workstationItemsForSale(sale: any) {
  return (Array.isArray(sale?.items) ? sale.items : []).filter((i: any) => i?.workstationId || i?.workstation_id);
}

function orderLabelForPush(sale: any) {
  if (sale?.isTab) return sale?.tabName ? `Tab ${sale.tabName}` : "Tab order";
  if (sale?.tableNumber || sale?.table_number) return `Table ${sale.tableNumber || sale.table_number}`;
  return "Takeaway order";
}

async function sendWorkstationOrderPush(tenantId: string, sale: any) {
  const wsItems = workstationItemsForSale(sale);
  if (wsItems.length === 0) return;
  await sendPushNotification(tenantId, {
    title: "New workstation order",
    body: `${orderLabelForPush(sale)} has ${wsItems.length} item${wsItems.length === 1 ? "" : "s"} waiting in the workstation queue.`,
    url: "/workstation",
    tag: `workstation-order-${sale.id}`,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: [160, 70, 160],
    data: { type: "workstation_order", saleId: sale.id },
    actions: [{ action: "open-workstation", title: "Open queue" }],
  }, { urgency: "high", ttl: 300 }).catch((err) => {
    console.warn("Workstation push failed:", err?.message || err);
  });
}

salesRouter.get("/", requireAuth, async (req: any, res) => {
  const { getActiveSalesByTenant } = await import("../db-adapter.js");
  try {
    res.json(await getActiveSalesByTenant(req.params.tenantId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

salesRouter.post("/", requireAuth, sensitiveRouteRateLimit, validateSchema(SaleSchema), async (req: any, res) => {
  try {
    const saleInput = stripSensitiveVerification(req.body || {});
    const sensitiveAction = saleMutationSensitiveAction(saleInput);
    if (sensitiveAction) {
      const r = await enforceSensitiveAction(req, res, sensitiveAction, { saleId: null, changedFields: auditChangedFields(saleInput) });
      if (r) return;
    }
    const sale = await createSale(req.params.tenantId, saleInput);
    const io = req.app.get("io");
    if (io && Array.isArray(sale.items) && sale.items.some((i: any) => i.workstationId)) {
      broadcastSalesUpdate(io, req.params.tenantId, sale.id);
    }
    await sendWorkstationOrderPush(req.params.tenantId, sale);
    queueKitchenPrintJobsForSale(req.params.tenantId, sale, {
      staffId: req.user?.staffId || req.user?.uid || null,
      staffName: req.user?.name || null,
    }).catch((err: any) => console.warn("Unable to queue kitchen print jobs:", err?.message || err));
    res.json(sale);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

salesRouter.get("/:saleId", requireAuth, async (req: any, res) => {
  try {
    const sale = await getSaleById(req.params.tenantId, req.params.saleId);
    if (!sale) return res.status(404).json({ error: "Sale not found" });
    res.json(sale);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

salesRouter.put("/:saleId", requireAuth, sensitiveRouteRateLimit, async (req: any, res) => {
  try {
    if (!req.body || !Object.keys(req.body).length) return res.status(400).json({ error: "Missing sale updates" });
    const saleUpdate = stripSensitiveVerification(req.body || {});
    const sensitiveAction = saleMutationSensitiveAction(saleUpdate);
    if (sensitiveAction) {
      const r = await enforceSensitiveAction(req, res, sensitiveAction, { saleId: req.params.saleId, changedFields: auditChangedFields(saleUpdate) });
      if (r) return;
    }
    const sale = await updateSale(req.params.tenantId, req.params.saleId, saleUpdate);
    const io = req.app.get("io");
    if (io) broadcastSalesUpdate(io, req.params.tenantId, sale.id);
    if ((saleUpdate as any)?.status === "kitchen") {
      await sendWorkstationOrderPush(req.params.tenantId, sale);
      queueKitchenPrintJobsForSale(req.params.tenantId, sale, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }).catch((err: any) => console.warn("Unable to queue kitchen print jobs:", err?.message || err));
    }
    res.json(sale);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

salesRouter.put("/:saleId/payments/:paymentId/provider-status", requireAuth, sensitiveRouteRateLimit, validateSchema(PaymentProviderStatusSchema), async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "payment.provider_reconcile", "Manager access is required to reconcile provider payments.", {
        saleId: req.params.saleId, paymentId: req.params.paymentId,
      });
    }
    const sale = await updateSalePaymentProviderStatus(req.params.tenantId, req.params.saleId, req.params.paymentId, {
      ...req.body,
      staffId: req.user?.staffId || null,
      staffName: req.user?.name || null,
      requestId: req.requestId || null,
    });
    const io = req.app.get("io");
    if (io) broadcastSalesUpdate(io, req.params.tenantId, sale.id);
    res.json(sale);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

salesRouter.post("/:saleId/refund", requireAuth, sensitiveRouteRateLimit, validateSchema(SaleRefundSchema), async (req: any, res) => {
  try {
    const refundInput = stripSensitiveVerification(req.body || {});
    const role = String(req.user?.role || "").toLowerCase();
    if (!["admin", "manager", "dev"].includes(role)) {
      const task = await createManagerSaleApprovalRequest(req.params.tenantId, {
        kind: "refund", saleId: req.params.saleId,
        payload: { ...refundInput, staffId: (refundInput as any).staffId || req.user?.staffId || null, staffName: (refundInput as any).staffName || req.user?.name || null },
        requestedBy: req.user?.staffId || req.user?.uid || (refundInput as any).staffId || null,
        requestedByName: req.user?.name || (refundInput as any).staffName || null,
      });
      return res.status(202).json({ approvalRequired: true, message: "Refund request sent to the manager Action Center.", task });
    }
    const r = await enforceSensitiveAction(req, res, "refund", {
      saleId: req.params.saleId,
      method: (refundInput as any).method || null,
      itemCount: Array.isArray((refundInput as any).items) ? (refundInput as any).items.length : 0,
    });
    if (r) return;
    const refund = await processSaleRefund(req.params.tenantId, req.params.saleId, {
      ...refundInput,
      staffId: (refundInput as any).staffId || req.user?.staffId || null,
      staffName: (refundInput as any).staffName || req.user?.name || null,
      requestId: req.requestId || null,
    } as any);
    const io = req.app.get("io");
    if (io) broadcastSalesUpdate(io, req.params.tenantId, refund.id);
    res.json(refund);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

salesRouter.post("/:saleId/void", requireAuth, sensitiveRouteRateLimit, validateSchema(SaleVoidSchema), async (req: any, res) => {
  try {
    const voidInput = stripSensitiveVerification(req.body || {});
    const role = String(req.user?.role || "").toLowerCase();
    if (!["admin", "manager", "dev"].includes(role)) {
      const task = await createManagerSaleApprovalRequest(req.params.tenantId, {
        kind: "void", saleId: req.params.saleId,
        payload: { ...voidInput, staffId: (voidInput as any).staffId || req.user?.staffId || null, staffName: (voidInput as any).staffName || req.user?.name || null },
        requestedBy: req.user?.staffId || req.user?.uid || (voidInput as any).staffId || null,
        requestedByName: req.user?.name || (voidInput as any).staffName || null,
      });
      return res.status(202).json({ approvalRequired: true, message: "Void request sent to the manager Action Center.", task });
    }
    const r = await enforceSensitiveAction(req, res, "void", {
      saleId: req.params.saleId,
      reason: (voidInput as any).reason || null,
    });
    if (r) return;
    const voided = await processSaleVoid(req.params.tenantId, req.params.saleId, {
      ...voidInput,
      staffId: (voidInput as any).staffId || req.user?.staffId || null,
      staffName: (voidInput as any).staffName || req.user?.name || null,
      requestId: req.requestId || null,
    } as any);
    const io = req.app.get("io");
    if (io) broadcastSalesUpdate(io, req.params.tenantId, voided.id);
    res.json(voided);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

salesRouter.put("/:saleId/items/:itemId", requireAuth, async (req: any, res) => {
  try {
    const updated = await updateSaleItem(req.params.tenantId, req.params.saleId, req.params.itemId, req.body || {});
    const io = req.app.get("io");
    if (io) broadcastSalesUpdate(io, req.params.tenantId, req.params.saleId);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

salesRouter.post("/offline-sync/issues", requireAuth, async (req: any, res) => {
  try {
    const issues = await syncOfflineSaleIssues(req.params.tenantId, req.body || {});
    res.json(issues);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

salesRouter.delete("/", requireAuth, async (req: any, res) => {
  try { await clearAllSales(req.params.tenantId); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});
