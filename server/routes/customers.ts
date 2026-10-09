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
  customerSensitiveAction, enforceSensitiveAction, stripSensitiveVerification,
} from "./_helpers.js";
import { getTenantPackageContext, packageLimitResponse, remainingPackageCapacity } from "../packageCapacity.js";
import { sendRouteError } from "../securityHardening.js";

function canUseActionCenter(role: string | undefined | null) {
  const r = String(role || "").toLowerCase();
  return r === "admin" || r === "manager" || r === "dev";
}

export const customersRouter = Router({ mergeParams: true });

customersRouter.get("/", requireAuth, async (req: any, res) => {
  try {
    const customers = await getCustomersByTenant(req.params.tenantId);
    res.json(customers);
  } catch (err: any) {
    sendRouteError(res, err, req);
  }
});

customersRouter.post("/", requireAuth, validateSchema(CustomerSchema), async (req: any, res) => {
  try {
    if ((await remainingPackageCapacity(req.params.tenantId, "customers", "maxCustomers")) <= 0) {
      const context = await getTenantPackageContext(req.params.tenantId);
      return packageLimitResponse(res, { packageId: context.package.id, limitName: "customers", limit: Number(context.package.maxCustomers) });
    }
    const input: any = stripSensitiveVerification(req.body || {});
    // Opening balances, account limits and discounts carry the same re-auth as edits.
    const sensitiveAction = customerSensitiveAction(input);
    if (sensitiveAction && await enforceSensitiveAction(req, res, sensitiveAction, { changedFields: auditChangedFields(input) })) return;
    const created = await createCustomer(req.params.tenantId, { ...input, consentActor: auditActorFromRequest(req) });
    await auditRouteEvent(req, "customer.created", "customer", {
      customerName: created?.name || input.name || null,
      changedFields: auditChangedFields(input),
    }, created?.id || null, "customer_admin");
    res.status(201).json(created);
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

customersRouter.put("/:customerId", requireAuth, validateSchema(CustomerUpdateSchema), async (req: any, res) => {
  try {
    const updates: any = stripSensitiveVerification(req.body || {});
    const sensitiveAction = customerSensitiveAction(updates);
    if (sensitiveAction && await enforceSensitiveAction(req, res, sensitiveAction, {
      customerId: req.params.customerId,
      changedFields: auditChangedFields(updates),
    })) return;
    const updated = await updateCustomer(req.params.tenantId, req.params.customerId, { ...updates, consentActor: auditActorFromRequest(req) });
    await auditRouteEvent(req, "customer.updated", "customer", {
      customerName: updated?.name || updates.name || null,
      changedFields: auditChangedFields(updates),
    }, req.params.customerId, "customer_admin");
    res.json(updated);
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

customersRouter.delete("/:customerId", requireAuth, async (req: any, res) => {
  try {
    if (!canUseActionCenter(req.user?.role)) {
      return denyWithAudit(req, res, "customers.anonymize", "Manager access is required to anonymize customer profiles.", {
        customerId: req.params.customerId,
      });
    }
    const result = await deleteCustomer(req.params.tenantId, req.params.customerId, {
      ...auditActorFromRequest(req),
      reason: req.body?.reason || null,
    });
    await auditRouteEvent(req, "customer.deleted", "customer", {
      customerId: req.params.customerId,
      mode: (result as any)?.mode || "anonymized",
      retainedSaleCount: (result as any)?.retainedSaleCount ?? null,
    }, req.params.customerId, "customer_admin");
    res.json(result);
  } catch (err: any) {
    const message = String(err?.message || "");
    const status = message.includes("not found") ? 404 : message.includes("cannot be anonymized") ? 409 : 500;
    sendRouteError(res, err, req, status);
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
    sendRouteError(res, err, req);
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
    sendRouteError(res, err, req, 400);
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
    sendRouteError(res, err, req);
  }
});

customersRouter.get("/:id/consents", requireAuth, async (req: any, res) => {
  try {
    res.json(await listCustomerConsents(req.params.tenantId, req.params.id));
  } catch (err: any) {
    sendRouteError(res, err, req);
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
    sendRouteError(res, err, req, status);
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
    sendRouteError(res, err, req, 400);
  }
});