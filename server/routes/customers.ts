import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import { getCustomersByTenant } from "../db-adapter.js";
import { createCustomer, updateCustomer, deleteCustomer } from "../db-crud.js";
import { validateSchema, CustomerSchema, CustomerUpdateSchema } from "../validation.js";
import { exportCustomersCsv, importCustomers } from "../batchOperations.js";
import { getCustomerCampaignExport } from "../customerSegments.js";
import { listCustomerConsents, upsertCustomerConsents } from "../customerConsents.js";
import { getCustomerDataExport } from "../customerDataExport.js";
import {
  denyWithAudit, auditRouteEvent, auditActorFromRequest, auditChangedFields,
  canUseActionCenter, customerSensitiveAction, enforceSensitiveAction, stripSensitiveVerification,
} from "./_helpers.js";

export const customersRouter = Router({ mergeParams: true });

customersRouter.get("/", requireAuth, async (req: any, res) => {
  try {
    const customers = await getCustomersByTenant(req.params.tenantId);
    res.json(customers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

customersRouter.post("/", requireAuth, validateSchema(CustomerSchema), async (req: any, res) => {
  try {
    const created = await createCustomer(req.params.tenantId, {
      ...req.body,
      consentActor: auditActorFromRequest(req),
    });
    await auditRouteEvent(req, "customer.created", "customer", {
      customerName: created?.name || req.body?.name || null,
      changedFields: auditChangedFields(req.body || {}),
    }, created?.id || null, "customer_admin");
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

customersRouter.put("/:customerId", requireAuth, validateSchema(CustomerUpdateSchema), async (req: any, res) => {
  try {
    // Step-up verification for money/discount changes (wallet, account balance,
    // account limit, manual discount) — mirrors the manager controls the sale
    // flow enforces so a cashier cannot silently credit balances.
    const customerUpdates = stripSensitiveVerification(req.body || {});
    const sensitiveAction = customerSensitiveAction(customerUpdates as any);
    if (sensitiveAction) {
      const sensitiveResponse = await enforceSensitiveAction(req, res, sensitiveAction, {
        customerId: String(req.params.customerId),
        changedFields: auditChangedFields(customerUpdates),
      });
      if (sensitiveResponse) return;
    }
    const updated = await updateCustomer(req.params.tenantId, req.params.customerId, {
      ...customerUpdates,
      consentActor: auditActorFromRequest(req),
    } as any);
    await auditRouteEvent(req, "customer.updated", "customer", {
      customerName: updated?.name || (customerUpdates as any)?.name || null,
      changedFields: auditChangedFields(customerUpdates || {}),
    }, String(req.params.customerId), "customer_admin");
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

customersRouter.delete("/:customerId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "customers.anonymize", "Manager access is required to anonymize customer profiles.", {
        customerId: String(req.params.customerId),
      });
    }
    const result = await deleteCustomer(req.params.tenantId, req.params.customerId, {
      ...auditActorFromRequest(req),
      reason: req.body?.reason || null,
    });
    await auditRouteEvent(req, "customer.deleted", "customer", {
      customerId: String(req.params.customerId),
      mode: (result as any)?.mode || "anonymized",
      retainedSaleCount: (result as any)?.retainedSaleCount ?? null,
    }, String(req.params.customerId), "customer_admin");
    res.json(result);
  } catch (err: any) {
    const message = String(err?.message || "");
    res.status(message.includes("not found") ? 404 : message.includes("cannot be anonymized") ? 409 : 500).json({ error: err.message });
  }
});

customersRouter.get("/batch/export", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "batch.customers_export", "Manager access is required for customer exports.");
    }
    const pack = await exportCustomersCsv(req.params.tenantId);
    await auditRouteEvent(req, "batch.customers_exported", "customer", {
      count: pack.count,
    }, null, "customer_batch");
    res.json(pack);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

customersRouter.post("/batch/import", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "batch.customers_import", "Manager access is required for customer imports.");
    }
    const result = await importCustomers(req.params.tenantId, req.body || {}, auditActorFromRequest(req));
    await auditRouteEvent(req, "batch.customers_imported", "customer", {
      dryRun: result.dryRun,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errorCount: result.errors.length,
    }, null, "customer_batch");
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

customersRouter.get("/campaign-export", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "customers.campaign_export", "Manager access is required for customer campaign exports.");
    }
    const report = await getCustomerCampaignExport(req.params.tenantId, {
      segment: typeof req.query.segment === "string" ? req.query.segment : undefined,
      limit: typeof req.query.limit === "string" ? req.query.limit : undefined,
    });
    await auditRouteEvent(req, "customers.campaign_exported", "customer_campaign_export", {
      segment: report.segment,
      rowCount: report.count,
      totalCustomers: report.totalCustomers,
      contactableCount: report.contactableCount,
    }, null, "customer_campaigns");
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

customersRouter.get("/:id/consents", requireAuth, async (req: any, res) => {
  try {
    res.json(await listCustomerConsents(req.params.tenantId, req.params.id));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

customersRouter.get("/:id/data-export", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "customers.data_export", "Manager access is required for customer data exports.", {
        customerId: req.params.id,
      });
    }
    const report = await getCustomerDataExport(req.params.tenantId, req.params.id);
    await auditRouteEvent(req, "customers.data_exported", "customer_data_export", {
      customerId: req.params.id,
      saleCount: report.summary.saleCount,
      payoutRequestCount: report.summary.payoutRequestCount,
      laybyCount: report.summary.laybyCount,
    }, req.params.id, "customer_data");
    res.json(report);
  } catch (err: any) {
    const status = String(err?.message || "").includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

customersRouter.put("/:id/consents", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "customers.consent_update", "Manager access is required to update customer consent records.", {
        customerId: req.params.id,
      });
    }
    res.json(await upsertCustomerConsents(
      req.params.tenantId,
      req.params.id,
      req.body?.consents || req.body || {},
      auditActorFromRequest(req),
    ));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});