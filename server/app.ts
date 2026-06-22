import dotenv from "dotenv";
import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { getConnection, isPostgres, query } from "./db.js";
import { initDb } from "./init-db.js";
import http from "http";
import { setupSocketIO, broadcastToMessages, broadcastToWorkstation, broadcastToTable, broadcastToTab, broadcastToSales } from "./socket.js";
import { buildLiveWorkstationQueueRows } from "./workstationStats.js";
import { getDashboardKpis } from "./dashboardKpis.js";
import { validateSchema, ProductSchema, CustomerSchema, CustomerUpdateSchema, StaffSchema, StaffUpdateSchema, SaleSchema, SaleRefundSchema, SaleVoidSchema, PaymentProviderStatusSchema, WorkstationSchema, TableSectionSchema, RestaurantTableSchema } from "./validation.js";
import { NextFunction, Request, Response } from "express";
import {
  applyTrustProxy,
  apiRateLimit,
  corsHandler,
  requestId,
  securityHeaders,
  sendSafeError,
  stripPoweredBy,
} from "./securityHardening.js";
import {
  getProductsByTenant,
  getTenantIdBySlug,
  getUserByUid,
  getStaffTenantByEmail,
  getAppConfigByTenant,
  getCustomersByTenant,
  getStaffByTenant,
  getWorkstationsByTenant,
  getActiveSalesByTenant,
  getOpenCashSessionByStaff,
  getPayoutRequestsByTenant,
  getCustomerPayoutRequestsByTenant,
  getMessagesByTenant,
  getMessagesByChannel,
  getTableSectionsByTenant,
  getRestaurantTablesByTenant,
} from "./mariadb-adapter.js";
import {
  createProduct,
  updateProduct,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  createStaff,
  updateStaff,
  deleteStaff,
  setupTenant,
  seedProducts,
  updateProductRecipe,
  getProductRecipe,
  createModifierGroup,
  getProductModifiers,
  updateModifierOptions,
  deleteModifierGroup,
} from "./mariadb-crud.js";
import { broadcastSalesUpdate } from "./socket.js";
import { handleEnrollment, handleStartDemo } from "./auth-handler.js";
import { requireAuth, optionalAuth } from "./auth-middleware.js";
import { clearSeededDemoData, seedDemoData } from "./demo-seed.js";
import { featureSetForPackage, getHostedPackage, hasPackageFeature, JPOS_PACKAGE_ADDONS, JPOS_PACKAGES, type PackageFeature } from "../shared/packageCatalog.js";
import {
  canManageAi,
  deleteInsight,
  generateInsights,
  generateStaffScores,
  getAiSettings,
  listAiModels,
  listInsights,
  listStaffScores,
  requireAiRoleAccess,
  requireAiStaffScoreAccess,
  saveAiSettings,
  serializeAiSettings,
  testAiProviderContact,
} from "./ai.js";
import { applyApprovedInventoryAgentSteps, generateInventoryAgentProposal } from "./aiInventoryAgent.js";
import {
  generateTenantVapidKeys,
  getPushOverview,
  removePushSubscription,
  savePushSubscription,
  sendPushNotification,
} from "./pushNotifications.js";
import { getManagerActionCenter, getManagerActivityCsv, getManagerActivityHistory, getManagerAuditReport } from "./actionCenter.js";
import { applyStockAdjustment, createManagerSaleApprovalRequest, createManagerStockAdjustmentRequest, decideManagerTask, getManagerTaskQueue, syncManagerTasksFromSignals } from "./managerTasks.js";
import {
  cancelCashCustodyTransfer,
  confirmCashCustodyTransfer,
  createCashCloseCheckpoint,
  createCashCustodyTransfer,
  exportCashCloseCheckpointCsv,
  exportManagerCashMovementsCsv,
  getCashCloseCheckpoints,
  getCashClosePreview,
  getCashCustodyTransfers,
  getManagerCashMovements,
  getManagerCashSummary,
  recordManagerCashMovement,
  recordRegisterWalletCashMovement,
  recordWalletCashMovement,
  transferCashSessionToManagerFloat,
} from "./managerCash.js";
import { recordAuditEventSafe } from "./audit.js";
import {
  approveStockTakeSession,
  createStockTakeRule,
  createStockTakeSession,
  deleteStockTakeRule,
  getMyStockTakeAssignments,
  getStockTakeExportPack,
  getStockTakeSuggestions,
  getStockTakeRules,
  getStockTakeSession,
  getStockTakeSessions,
  requestStockTakeRecount,
  runDueStockTakeRules,
  submitStockTakeCount,
  updateStockTakeRule,
} from "./stockTake.js";
import {
  approveReorderRecommendation,
  createReorderNotificationRule,
  dismissReorderRecommendation,
  listReorderNotificationRules,
  listReorderRecommendations,
  refreshReorderRecommendations,
  runReorderNotificationRule,
  updateReorderNotificationRule,
} from "./reorderRecommendations.js";
import { getStockValuationReport } from "./stockReports.js";
import { getPaymentProviderReconciliationReport } from "./paymentReports.js";
import { getMarginReport } from "./marginReports.js";
import { getOperationalAnalyticsReport } from "./operationalReports.js";
import { getAccountingJournalReport } from "./accountingJournal.js";
import { getEcommerceMarketplaceExport } from "./ecommerceIntegrations.js";
import { ingestDeliveryOrder, listDeliveryOrders, updateDeliveryOrderStatus } from "./deliveryIntegrations.js";
import {
  authenticateIntegrationApiKey,
  createIntegrationApiKey,
  ingestStockWebhook,
  listIntegrationApiKeys,
  listIntegrationWebhookEvents,
  revokeIntegrationApiKey,
} from "./integrationAccess.js";
import { getCustomerCampaignExport } from "./customerSegments.js";
import { getCustomerDataExport } from "./customerDataExport.js";
import { listCustomerConsents, upsertCustomerConsents } from "./customerConsents.js";
import { applyRetentionPolicy, getRetentionPolicy, getRetentionPreview, saveRetentionPolicy } from "./retentionPolicy.js";
import { cancelStaffShift, clockIn, clockOut, createStaffShift, endBreak, getMyAttendanceStatus, getTimesheetPayrollReport, listStaffShifts, publishRoster, startBreak, updateStaffShift } from "./staffScheduling.js";
import { createTipPoolRule, generateTipPoolPayouts, listTipPoolPayouts, listTipPoolRules, previewTipPoolPayouts, updateTipPoolRule } from "./tipPooling.js";
import { addStaffCoachingNote, getStaffPerformanceReport } from "./staffPerformance.js";
import { getTaxPeriods, getVatTaxReport, lockTaxPeriod } from "./taxReports.js";
import {
  completeStockTransferOrder,
  createInventoryLocation,
  createStockTransferOrder,
  listInventoryLocations,
  listProductLocationStocks,
  listStockTransferOrders,
  updateInventoryLocation,
  upsertProductLocationStock,
} from "./inventoryLocations.js";
import {
  createHardwareDevice,
  deleteHardwareDevice,
  listHardwareDeviceEvents,
  listHardwareDevices,
  queueCashDrawerPulseForNoSale,
  queueKitchenPrintJobsForSale,
  testHardwareDevice,
  updateHardwareDevice,
} from "./hardwareAdapters.js";
import {
  addLaybyPayment,
  cancelLaybyOrder,
  completeLaybyOrder,
  createLaybyOrder,
  getLaybyOrderById,
  listLaybyOrders,
} from "./layby.js";
import {
  createEventBooking,
  deleteEventBooking,
  listEventBookings,
  updateEventBooking,
} from "./eventBookings.js";
import {
  createPromotion,
  listPromotions,
  updatePromotion,
  validatePromotionForSale,
} from "./promotions.js";
import { stripSensitiveVerification, verifySensitiveActionForRequest, type SensitiveActionType } from "./sensitiveActions.js";
import { listManagerOverrides } from "./managerOverrides.js";
import {
  calculateLoyaltyAward,
  createLoyaltyRewardRule,
  createLoyaltyTier,
  listLoyaltyRewardRules,
  listLoyaltyTiers,
  updateLoyaltyRewardRule,
  updateLoyaltyTier,
} from "./loyalty.js";
import {
  batchCreateProducts,
  batchUpdateProductPrices,
  exportCustomersCsv,
  exportInventoryCsv,
  importCustomers,
  importInventory,
} from "./batchOperations.js";
import {
  normalizeRole, canManageCash, canManagePush, canUseActionCenter,
  canManageInventory, canGenerateVapidKeys, canUseDevMaintenance,
  requireDevMaintenance, auditActorFromRequest, tenantIdFromRequest, auditChangedFields,
  integrationSecretFromRequest, auditRouteEvent, denyWithAudit, requireTenantRouteAccess,
  enforceSensitiveAction, customerSensitiveAction, staffSensitiveAction,
  createTenantLocalSyncSecret,
} from "./routes/_helpers.js";
export { createTenantLocalSyncSecret };

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp(io: any = null) {
  const app = express();
  if (io) app.set("io", io);
  
  // Force production mode if an older Railway deployment env is still present.
  if (process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID) {
    process.env.NODE_ENV = "production";
  }
  
  const isProduction = process.env.NODE_ENV === "production";
  const isTest = process.env.VITEST === "1" || process.env.NODE_ENV === "test";

  applyTrustProxy(app);
  app.disable('x-powered-by');
  app.use(stripPoweredBy);
  app.use(requestId);
  app.use(apiRateLimit);
  app.use(corsHandler);
  app.use(securityHeaders(isProduction));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use('/uploads', express.static(path.resolve(__dirname, '..', 'public', 'uploads'), {
    dotfiles: 'deny',
    index: false,
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=300');
    },
  }));

  const shouldExposeLicenceServer =
    process.env.JPOS_HOSTED === "true" ||
    Boolean(process.env.LICENCE_SECRET && (process.env.ADMIN_API_KEY || process.env.LICENCE_ADMIN_KEY));

  if (shouldExposeLicenceServer) {
    const { licenceRouter } = await import("./licenceServer.js");
    app.use("/api", licenceRouter);
  }

  const licence = await import("./licenceMiddleware.js");
  await licence.initialiseLicence();

  async function getTenantPackageContext(tenantId: string) {
    const info = licence.getLicenceInfo();
    if (licence.shouldEnforceLicence() && info.payload) {
      const tier = info.payload.tier;
      const pkg = getHostedPackage(tier);
      const catalogPackage = JPOS_PACKAGES.find((p) => p.id === tier) || pkg;
      return {
        source: "licence",
        package: {
          ...catalogPackage,
          id: tier,
          maxRegisters: info.payload.maxRegisters,
          features: info.payload.features,
        },
      };
    }

    const cfg = await getAppConfigByTenant(tenantId);
    const tier = cfg?.business?.packageTier || process.env.JPOS_HOSTED_PACKAGE_TIER || "free";
    const pkg = getHostedPackage(tier);
    return {
      source: "hosted",
      package: {
        ...pkg,
        features: featureSetForPackage(pkg.id),
      },
    };
  }

  async function getTenantPackageUsage(tenantId: string) {
    const [productRows, staffRows, customerRows, registerRows] = await Promise.all([
      query<any>("SELECT COUNT(*) AS count FROM products WHERE tenant_id = ?", [tenantId]),
      query<any>("SELECT COUNT(*) AS count FROM staff WHERE tenant_id = ?", [tenantId]),
      query<any>("SELECT COUNT(*) AS count FROM customers WHERE tenant_id = ?", [tenantId]),
      query<any>("SELECT COUNT(*) AS count FROM cash_sessions WHERE tenant_id = ? AND status = 'open'", [tenantId]),
    ]);

    return {
      products: Number(productRows[0]?.count || 0),
      staff: Number(staffRows[0]?.count || 0),
      customers: Number(customerRows[0]?.count || 0),
      activeRegisters: Number(registerRows[0]?.count || 0),
    };
  }

  function limitReached(current: number, limit: number) {
    return limit !== -1 && current >= limit;
  }

  function packageLimitResponse(res: Response, details: { packageId: string; limitName: string; limit: number; current?: number }) {
    return res.status(403).json({
      error: "Package limit reached",
      package: details.packageId,
      limitName: details.limitName,
      limit: details.limit,
      current: details.current,
      upgrade: "Upgrade your MasePOS package to unlock more capacity",
    });
  }

  async function requirePackageCapacity(
    req: Request,
    res: Response,
    next: NextFunction,
    usageKey: "products" | "staff" | "customers" | "activeRegisters",
    limitKey: "maxProducts" | "maxStaff" | "maxCustomers" | "maxRegisters",
    limitName: string
  ) {
    try {
      const context = await getTenantPackageContext(req.params.tenantId);
      const usage = await getTenantPackageUsage(req.params.tenantId);
      const limit = Number((context.package as any)[limitKey]);
      if (limitReached(Number((usage as any)[usageKey]), limit)) {
        void auditRouteEvent(req, "permission.denied", "security", {
          attemptedAction: `package.capacity.${usageKey}`,
          reason: "package_limit_reached",
          package: context.package.id,
          limitName,
          limit,
          current: Number((usage as any)[usageKey]),
        }, auditActorFromRequest(req).staffId, "permission");
        packageLimitResponse(res, {
          packageId: context.package.id,
          limitName,
          limit,
          current: Number((usage as any)[usageKey]),
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  }

  function requirePackageFeature(feature: PackageFeature) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const context = await getTenantPackageContext(req.params.tenantId);
        if (!hasPackageFeature(context.package.features, feature)) {
          void auditRouteEvent(req, "permission.denied", "security", {
            attemptedAction: `package.feature.${feature}`,
            reason: "feature_not_available",
            package: context.package.id,
            feature,
          }, auditActorFromRequest(req).staffId, "permission");
          return res.status(403).json({
            error: "Feature not available on your package",
            package: context.package.id,
            feature,
            upgrade: "Upgrade your MasePOS package to unlock this feature",
          });
        }
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  function requireAiPackageAccess(req: Request, res: Response, next: NextFunction) {
    if (normalizeRole(req.user?.role) === "dev") return next();
    return requirePackageFeature("ai")(req, res, next);
  }

  // Security headers are installed at the top of createApp() (securityHeaders).
  // The audit-driven additions (CSP, COOP, CORP, X-Permitted-Cross-Domain-Policies,
  // Origin-Agent-Cluster) live in server/securityHardening.ts so they can be
  // unit-tested and version-controlled independently.

  // Rate limiting for auth endpoints. Production stays strict, while local
  // development gets enough headroom that repeated UI testing does not lock you out.
  const createAuthRateLimit = (windowMs: number, max: number) => {
    const attempts = new Map<string, { count: number; resetTime: number }>();
    
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (process.env.AUTH_RATE_LIMIT_DISABLED === "true") {
        return next();
      }

      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      
      const record = attempts.get(ip);
      if (!record || now > record.resetTime) {
        attempts.set(ip, { count: 1, resetTime: now + windowMs });
        return next();
      }
      
      record.count++;
      if (record.count > max) {
        res.setHeader("Retry-After", Math.ceil((record.resetTime - now) / 1000));
        res.status(429).json({ error: "Too many requests. Please try again later." });
        return;
      }
      
      next();
    };
  };

  // Apply rate limiting to auth endpoints
  const parsePositiveEnvNumber = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const authRateLimitWindowMs = parsePositiveEnvNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
  const authRateLimitMax = parsePositiveEnvNumber(process.env.AUTH_RATE_LIMIT_MAX, isProduction ? 5 : 200);
  const authRateLimit = createAuthRateLimit(authRateLimitWindowMs, authRateLimitMax);
  const integrationWebhookRateLimit = createAuthRateLimit(
    parsePositiveEnvNumber(process.env.INTEGRATION_WEBHOOK_RATE_LIMIT_WINDOW_MS, 60 * 1000),
    parsePositiveEnvNumber(process.env.INTEGRATION_WEBHOOK_RATE_LIMIT_MAX, isProduction ? 120 : 500)
  );
  const sensitiveRouteRateLimit = createAuthRateLimit(
    parsePositiveEnvNumber(process.env.SENSITIVE_ROUTE_RATE_LIMIT_WINDOW_MS, 60 * 1000),
    parsePositiveEnvNumber(process.env.SENSITIVE_ROUTE_RATE_LIMIT_MAX, isProduction ? 30 : 300)
  );

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/licence/info", (req, res) => {
    const info = licence.getLicenceInfo();
    res.json({
      enabled: info.enabled,
      valid: info.valid,
      lockedOut: info.lockedOut,
      reason: info.reason,
      lastOnlineCheck: info.lastOnlineCheck || null,
      lastOnlineSuccess: info.lastOnlineSuccess || null,
      tier: info.payload?.tier,
      tenantName: info.payload?.tenantName,
      maxRegisters: info.payload?.maxRegisters,
      features: info.payload?.features || [],
      expiresAt: info.payload?.expiresAt ? new Date(info.payload.expiresAt * 1000).toISOString() : null,
    });
  });

  app.get("/api/packages", (_req, res) => {
    res.json({
      packages: JPOS_PACKAGES,
      addOns: JPOS_PACKAGE_ADDONS,
    });
  });

  app.use("/api", licence.requireValidLicence);

  app.post("/api/demo/start", handleStartDemo);
  app.post("/api/enroll", handleEnrollment);

  // Dev-only routes. They expose DB internals (db-test returns raw
  // query output; init-db re-runs DDL). In production these MUST be
  // disabled — the licence check above does not block them on a
  // self-hosted install. Operator override: ENABLE_DEV_ROUTES=true.
  if (!isProduction || process.env.ENABLE_DEV_ROUTES === "true") {
    const { devRouter } = await import("./routes/dev.js");
    app.use("/api/dev", devRouter);
  }

  const { authRouter } = await import("./routes/auth.js");
  app.use("/api/auth", authRouter);

  app.use("/api/mariadb/tenants/:tenantId", requireAuth, requireTenantRouteAccess);

  // Authenticated lookups: these expose email/name/role for cross-tenant
  // user resolution. Previously they were optionalAuth (i.e. unauthenticated
  // callers could enumerate staff by guessing emails). Now requireAuth +
  // tenant scoping via the licence check above.
  app.get("/api/mariadb/users/:uid", requireAuth, async (req, res) => {
    try {
      const user = await getUserByUid(req.params.uid);
      res.json(user || null);
    } catch (err) {
      sendSafeError(res, 500, "Failed to load user", err, req);
    }
  });

  app.get("/api/mariadb/staff", requireAuth, async (req, res) => {
    try {
      const { email } = req.query;
      if (typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ error: "Email query parameter is required" });
      }
      const staff = await getStaffTenantByEmail(email.trim().toLowerCase());
      return res.json(staff || null);
    } catch (err) {
      sendSafeError(res, 500, "Failed to load staff", err, req);
    }
  });

  const { productsRouter } = await import("./routes/products.js");
  app.use("/api/mariadb/tenants/:tenantId/products", productsRouter);

  const { customersRouter } = await import("./routes/customers.js");
  app.use("/api/mariadb/tenants/:tenantId/customers", customersRouter);

  // ── Extracted routers (ponytail refactor) ────────────────────────────────
  const { salesRouter } = await import("./routes/sales.js");
  app.use("/api/mariadb/tenants/:tenantId/sales", salesRouter);

  const { cashRouter } = await import("./routes/cash.js");
  app.use("/api/mariadb/tenants/:tenantId", cashRouter);

  const { inventoryRouter } = await import("./routes/inventory.js");
  app.use("/api/mariadb/tenants/:tenantId", inventoryRouter);

  const { settingsRouter } = await import("./routes/settings.js");
  app.use("/api/mariadb/tenants/:tenantId", settingsRouter);

  const { reportsRouter } = await import("./routes/reports.js");
  app.use("/api/mariadb/tenants/:tenantId", reportsRouter);

  const { tablesRouter } = await import("./routes/tables.js");
  app.use("/api/mariadb/tenants/:tenantId", tablesRouter);

  const { workstationsRouter } = await import("./routes/workstations.js");
  app.use("/api/mariadb/tenants/:tenantId", workstationsRouter);
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/mariadb/tenants/:tenantId/package-limits", requireAuth, async (req, res) => {
    try {
      const [context, usage] = await Promise.all([
        getTenantPackageContext(req.params.tenantId),
        getTenantPackageUsage(req.params.tenantId),
      ]);
      const pkg = context.package;
      const localServerSync = hasPackageFeature(pkg.features, "local_server_sync");
      const localSyncSharedSecret = createTenantLocalSyncSecret(req.params.tenantId, localServerSync);
      res.json({
        source: context.source,
        package: pkg,
        localServerSync,
        ...(localSyncSharedSecret ? { localSyncSharedSecret } : {}),
        usage,
        remaining: {
          products: pkg.maxProducts === -1 ? -1 : Math.max(0, pkg.maxProducts - usage.products),
          staff: pkg.maxStaff === -1 ? -1 : Math.max(0, pkg.maxStaff - usage.staff),
          customers: pkg.maxCustomers === -1 ? -1 : Math.max(0, pkg.maxCustomers - usage.customers),
          activeRegisters: pkg.maxRegisters === -1 ? -1 : Math.max(0, pkg.maxRegisters - usage.activeRegisters),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  app.post("/api/integrations/:tenantId/stock-sync", integrationWebhookRateLimit, async (req, res) => {
    try {
      const apiKey = await authenticateIntegrationApiKey(req.params.tenantId, integrationSecretFromRequest(req));
      if (!apiKey) return res.status(401).json({ error: "Invalid integration API key" });
      const event = await ingestStockWebhook(req.params.tenantId, req.body || {}, apiKey);
      res.status(event.status === "duplicate" ? 200 : 202).json({
        status: event.status,
        eventId: event.id,
        result: event.result,
        duplicateOf: (event as any).duplicateOf || null,
      });
    } catch (err: any) {
      res.status(err?.eventId ? 400 : 500).json({
        error: err.message,
        eventId: err?.eventId || null,
      });
    }
  });

  const { staffRouter } = await import("./routes/staff.js");
  app.use("/api/mariadb/tenants/:tenantId/staff", staffRouter);
  app.use("/api/mariadb/tenants/:tenantId/workforce", staffRouter);

  app.get("/api/mariadb/tenants/:tenantId/live", requireAuth, async (req, res) => {
    try {
      const tenantId = req.params.tenantId;
      const toNumber = (value: unknown): number => {
        if (typeof value === "number") return Number.isFinite(value) ? value : 0;
        if (typeof value === "string") {
          const parsed = parseFloat(value);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };

      const cfg = await getAppConfigByTenant(tenantId);
      const isRestaurantMode = Boolean(cfg?.business?.isRestaurantMode);

      const registerRows = await query<any>(
        `
          SELECT
            cs.id AS cashSessionId,
            cs.staff_id AS staffId,
            cs.staff_name AS staffName,
            cs.opened_at AS openedAt,
            cs.opening_float AS openingFloat,
            cs.expected_cash AS expectedCash,
            cs.actual_cash AS actualCash,
            cs.accumulated_tips AS accumulatedTips,
            cs.net_tips AS netTips,
            SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) AS completedCount,
            SUM(CASE WHEN s.status = 'completed' THEN s.total ELSE 0 END) AS completedRevenue,
            SUM(CASE WHEN s.status IN ('open','kitchen','pending') THEN 1 ELSE 0 END) AS activeOrders,
            MAX(s.created_at) AS lastSaleAt,
            SUM(CASE WHEN s.status = 'completed' AND s.payment_method = 'cash' THEN s.total ELSE 0 END) AS cashRevenue,
            SUM(CASE WHEN s.status = 'completed' AND s.payment_method IN ('card','payfast','qr','bnpl') THEN s.total ELSE 0 END) AS cardRevenue,
            SUM(CASE WHEN s.status = 'completed' AND s.payment_method = 'wallet' THEN s.total ELSE 0 END) AS walletRevenue
          FROM cash_sessions cs
          LEFT JOIN sales s
            ON s.tenant_id = cs.tenant_id
           AND s.staff_id = cs.staff_id
           AND s.created_at >= cs.opened_at
          WHERE cs.tenant_id = ?
            AND cs.status = 'open'
          GROUP BY cs.id
          ORDER BY cs.opened_at ASC
        `,
        [tenantId]
      );

      const registers = registerRows.map((r: any) => ({
        cashSessionId: String(r.cashSessionId),
        staffId: String(r.staffId),
        staffName: String(r.staffName || ""),
        openedAt: r.openedAt,
        openingFloat: toNumber(r.openingFloat),
        expectedCash: toNumber(r.expectedCash),
        actualCash: toNumber(r.actualCash),
        accumulatedTips: toNumber(r.accumulatedTips),
        netTips: toNumber(r.netTips),
        completedCount: toNumber(r.completedCount),
        completedRevenue: toNumber(r.completedRevenue),
        activeOrders: toNumber(r.activeOrders),
        lastSaleAt: r.lastSaleAt,
        cashRevenue: toNumber(r.cashRevenue),
        cardRevenue: toNumber(r.cardRevenue),
        walletRevenue: toNumber(r.walletRevenue),
      }));

      const pg = isPostgres();
      const salesSummaryRows = await query<any>(
        pg
          ? `
              SELECT
                SUM(CASE WHEN status IN ('open','kitchen','pending') THEN 1 ELSE 0 END) AS activeOrdersCount,
                SUM(CASE WHEN status = 'completed' AND created_at >= (NOW() - INTERVAL '60 minutes') THEN 1 ELSE 0 END) AS lastHourCompletedCount,
                SUM(CASE WHEN status = 'completed' AND created_at >= (NOW() - INTERVAL '60 minutes') THEN total ELSE 0 END) AS lastHourCompletedRevenue,
                SUM(CASE WHEN status = 'completed' AND created_at::date = CURRENT_DATE THEN 1 ELSE 0 END) AS todayCompletedCount,
                SUM(CASE WHEN status = 'completed' AND created_at::date = CURRENT_DATE THEN total ELSE 0 END) AS todayCompletedRevenue,
                SUM(CASE WHEN is_tab = 1 AND status = 'open' THEN 1 ELSE 0 END) AS openTabsCount
              FROM sales
              WHERE tenant_id = ?
            `
          : `
              SELECT
                SUM(CASE WHEN status IN ('open','kitchen','pending') THEN 1 ELSE 0 END) AS activeOrdersCount,
                SUM(CASE WHEN status = 'completed' AND created_at >= (NOW() - INTERVAL 60 MINUTE) THEN 1 ELSE 0 END) AS lastHourCompletedCount,
                SUM(CASE WHEN status = 'completed' AND created_at >= (NOW() - INTERVAL 60 MINUTE) THEN total ELSE 0 END) AS lastHourCompletedRevenue,
                SUM(CASE WHEN status = 'completed' AND DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS todayCompletedCount,
                SUM(CASE WHEN status = 'completed' AND DATE(created_at) = CURDATE() THEN total ELSE 0 END) AS todayCompletedRevenue,
                SUM(CASE WHEN is_tab = 1 AND status = 'open' THEN 1 ELSE 0 END) AS openTabsCount
              FROM sales
              WHERE tenant_id = ?
            `,
        [tenantId]
      );
      const salesSummary = salesSummaryRows[0] || {};

      let restaurant: any = null;
      if (isRestaurantMode) {
        const tableRows = await query<any>(
          `
            SELECT
              s.table_number AS "tableNumber",
              COUNT(*) AS "activeOrders",
              MIN(s.created_at) AS "oldestOrderAt",
              SUM(s.total) AS "activeOrderValue"
            FROM sales s
            WHERE s.tenant_id = ?
              AND s.table_number IS NOT NULL
              AND s.table_number <> ''
              AND s.status IN ('open','kitchen','pending')
            GROUP BY s.table_number
            ORDER BY "oldestOrderAt" ASC
          `,
          [tenantId]
        );

        const activeTablesCountRows = await query<any>(
          `SELECT COUNT(*) AS activeTableCount FROM restaurant_tables WHERE tenant_id = ? AND status = 'active'`,
          [tenantId]
        );

        const staffRows = await query<any>(
          pg
            ? `
                SELECT
                  st.id AS staffId,
                  st.name AS staffName,
                  st.role AS staffRole,
                  SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) AS completedCount,
                  SUM(CASE WHEN s.status = 'completed' THEN s.total ELSE 0 END) AS completedRevenue,
                  SUM(CASE WHEN s.status IN ('open','kitchen','pending') THEN 1 ELSE 0 END) AS activeOrders,
                  MAX(s.created_at) AS lastSaleAt
                FROM staff st
                LEFT JOIN sales s
                  ON s.tenant_id = st.tenant_id
                 AND s.staff_id = st.id
                 AND s.created_at >= (NOW() - INTERVAL '60 minutes')
                WHERE st.tenant_id = ?
                  AND st.status = 'active'
                GROUP BY st.id
                ORDER BY completedRevenue DESC, completedCount DESC
              `
            : `
                SELECT
                  st.id AS staffId,
                  st.name AS staffName,
                  st.role AS staffRole,
                  SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) AS completedCount,
                  SUM(CASE WHEN s.status = 'completed' THEN s.total ELSE 0 END) AS completedRevenue,
                  SUM(CASE WHEN s.status IN ('open','kitchen','pending') THEN 1 ELSE 0 END) AS activeOrders,
                  MAX(s.created_at) AS lastSaleAt
                FROM staff st
                LEFT JOIN sales s
                  ON s.tenant_id = st.tenant_id
                 AND s.staff_id = st.id
                 AND s.created_at >= (NOW() - INTERVAL 60 MINUTE)
                WHERE st.tenant_id = ?
                  AND st.status = 'active'
                GROUP BY st.id
                ORDER BY completedRevenue DESC, completedCount DESC
              `,
          [tenantId]
        );

        const workstationRows = await query<any>(
          `SELECT id, name, type FROM workstations WHERE tenant_id = ? AND status = 'active' ORDER BY name ASC`,
          [tenantId]
        );
        const workstationTimingRows = await query<any>(
          `SELECT
             si.workstation_id AS workstationId,
             si.status,
             si.ordered_at AS orderedAt,
             si.accepted_at AS acceptedAt,
             si.ready_at AS readyAt,
             si.delivered_at AS deliveredAt,
             s.status AS saleStatus
           FROM sale_items si
           JOIN sales s
             ON s.id = si.sale_id
            AND s.tenant_id = ?
           WHERE si.workstation_id IS NOT NULL
           ORDER BY COALESCE(si.delivered_at, si.ready_at, si.accepted_at, si.ordered_at, s.created_at) DESC
           LIMIT 2000`,
          [tenantId]
        );

        restaurant = {
          tables: {
            activeTableCount: toNumber(activeTablesCountRows?.[0]?.activeTableCount),
            openTableCount: tableRows.length,
            openTables: tableRows.map((t: any) => ({
              tableNumber: String(t.tableNumber),
              activeOrders: toNumber(t.activeOrders),
              oldestOrderAt: t.oldestOrderAt,
              activeOrderValue: toNumber(t.activeOrderValue),
            })),
          },
          staffPerformance: staffRows.map((s: any) => ({
            staffId: String(s.staffId),
            staffName: String(s.staffName || ""),
            staffRole: String(s.staffRole || ""),
            completedCount: toNumber(s.completedCount),
            completedRevenue: toNumber(s.completedRevenue),
            activeOrders: toNumber(s.activeOrders),
            lastSaleAt: s.lastSaleAt,
          })),
          workstationQueues: buildLiveWorkstationQueueRows(workstationRows, workstationTimingRows),
        };
      }

      const dashboardKpis = await getDashboardKpis(tenantId);

      res.json({
        tenantId,
        isRestaurantMode,
        serverTime: new Date().toISOString(),
        dashboardKpis,
        retail: {
          openRegisterCount: registers.length,
          registers,
        },
        totals: {
          activeOrdersCount: toNumber(salesSummary.activeOrdersCount),
          openTabsCount: toNumber(salesSummary.openTabsCount),
          lastHour: {
            completedCount: toNumber(salesSummary.lastHourCompletedCount),
            completedRevenue: toNumber(salesSummary.lastHourCompletedRevenue),
          },
          today: {
            completedCount: toNumber(salesSummary.todayCompletedCount),
            completedRevenue: toNumber(salesSummary.todayCompletedRevenue),
          },
        },
        restaurant,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/setup", requireAuth, async (req, res) => {
    try {
      const data = await setupTenant(req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/seed-products", requireAuth, async (req, res) => {
    try {
      await seedProducts(req.params.tenantId, req.body.products);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/demo-seed/:mode", requireAuth, async (req, res) => {
    try {
      const mode = req.params.mode === "restaurant" ? "restaurant" : "retail";
      await seedDemoData(req.params.tenantId, mode);
      res.json({ success: true, mode });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/demo-seed", requireAuth, async (req, res) => {
    try {
      await clearSeededDemoData(req.params.tenantId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/customers/by-email", optionalAuth, async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) return res.status(400).json({ error: "Email is required" });
      const rows = await query("SELECT * FROM customers WHERE email = ?", [email]);
      if (rows.length === 0) return res.json(null);
      const r = rows[0] as any;
      const consents = await listCustomerConsents(r.tenant_id, r.id);
      const customer = {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        address: r.address,
        notes: r.notes,
        loyaltyPoints: r.loyalty_points,
        loyaltyMemberStatus: r.loyalty_member_status || "active",
        loyaltyTierId: r.loyalty_tier_id || null,
        membershipCardId: r.membership_card_id || null,
        membershipBarcode: r.membership_barcode || null,
        membershipStartedAt: r.membership_started_at || null,
        walletBalance: r.wallet_balance,
        accountEnabled: Boolean(r.account_enabled),
        accountLimit: r.account_limit !== null ? Number(r.account_limit) : 0,
        accountBalance: r.account_balance !== null ? Number(r.account_balance) : 0,
        uid: r.uid,
        isAnonymized: Boolean(r.is_anonymized),
        anonymizedAt: r.anonymized_at || null,
        anonymizedBy: r.anonymized_by || null,
        anonymizedByName: r.anonymized_by_name || null,
        anonymizationReason: r.anonymization_reason || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        consents,
      };
      res.json({ customer, tenantId: r.tenant_id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    "/api/mariadb/tenants/:tenantId/products",
    requireAuth,
    validateSchema(ProductSchema),
    (req, res, next) => requirePackageCapacity(req, res, next, "products", "maxProducts", "products"),
    async (req, res, next) => {
      if (!req.body.imageUrl) return next();
      return requirePackageFeature("images")(req, res, next);
    },
    async (req, res) => {
    try {
      const data = await createProduct(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put(
    "/api/mariadb/tenants/:tenantId/products/:id",
    requireAuth,
    validateSchema(ProductSchema),
    async (req, res, next) => {
      if (!req.body.imageUrl) return next();
      return requirePackageFeature("images")(req, res, next);
    },
    async (req, res) => {
    try {
      const data = await updateProduct(req.params.tenantId, req.params.id, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/products/:id/stock-adjustments", sensitiveRouteRateLimit, requireAuth, async (req, res) => {
    try {
      const stockInput = stripSensitiveVerification(req.body || {});
      const delta = Number((stockInput as any)?.delta);
      const reason = String((stockInput as any)?.reason || "").trim();
      if (!Number.isFinite(delta) || delta === 0) {
        res.status(400).json({ error: "Stock adjustment quantity must be a non-zero number" });
        return;
      }
      if (reason.length < 3) {
        res.status(400).json({ error: "A stock adjustment reason is required" });
        return;
      }

      const actor = {
        staffId: req.user?.staffId || req.user?.uid || (stockInput as any)?.staffId || null,
        staffName: req.user?.name || (stockInput as any)?.staffName || null,
      };
      const payload = {
        productId: req.params.id,
        productName: (stockInput as any)?.productName || null,
        delta,
        reason,
        note: (stockInput as any)?.note || null,
        requestedBy: actor.staffId,
        requestedByName: actor.staffName,
      };

      if (!canManageInventory(req.user?.role)) {
        const task = await createManagerStockAdjustmentRequest(req.params.tenantId, payload);
        res.status(202).json({
          approvalRequired: true,
          message: "Stock adjustment request sent to the manager Action Center.",
          task,
        });
        return;
      }

      const sensitiveResponse = await enforceSensitiveAction(req, res, "stock_adjustment", {
        productId: req.params.id,
        delta,
        reason,
      });
      if (sensitiveResponse) return;

      const result = await applyStockAdjustment(req.params.tenantId, payload, actor);
      res.json({
        approvalRequired: false,
        message: "Stock adjusted and logged.",
        result,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post(
    "/api/mariadb/tenants/:tenantId/customers",
    requireAuth,
    validateSchema(CustomerSchema),
    (req, res, next) => requirePackageCapacity(req, res, next, "customers", "maxCustomers", "customers"),
    async (req, res) => {
    try {
      const data = await createCustomer(req.params.tenantId, {
        ...req.body,
        consentActor: auditActorFromRequest(req),
      });
      await auditRouteEvent(req, "customer.created", "customer", {
        customerName: data?.name || req.body?.name || null,
        changedFields: auditChangedFields(req.body || {}),
      }, data?.id || null, "customer_admin");
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/customers/:id", requireAuth, validateSchema(CustomerUpdateSchema), async (req, res) => {
    try {
      const customerUpdates = stripSensitiveVerification(req.body || {});
      const sensitiveAction = customerSensitiveAction(customerUpdates);
      if (sensitiveAction) {
        const sensitiveResponse = await enforceSensitiveAction(req, res, sensitiveAction, {
          customerId: req.params.id,
          changedFields: auditChangedFields(customerUpdates),
        });
        if (sensitiveResponse) return;
      }

      const data = await updateCustomer(req.params.tenantId, req.params.id, {
        ...customerUpdates,
        consentActor: auditActorFromRequest(req),
      });
      await auditRouteEvent(req, "customer.updated", "customer", {
        customerName: data?.name || (customerUpdates as any)?.name || null,
        changedFields: auditChangedFields(customerUpdates || {}),
      }, req.params.id, "customer_admin");
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/customers/:id", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "customers.anonymize", "Manager access is required to anonymize customer profiles.", {
          customerId: req.params.id,
        });
      }
      const result = await deleteCustomer(req.params.tenantId, req.params.id, {
        ...auditActorFromRequest(req),
        reason: req.body?.reason || null,
      });
      await auditRouteEvent(req, "customer.deleted", "customer", {
        customerId: req.params.id,
        mode: result.mode || "anonymized",
        retainedSaleCount: result.retainedSaleCount ?? null,
      }, req.params.id, "customer_admin");
      res.json(result);
    } catch (err: any) {
      const message = String(err?.message || "");
      res.status(message.includes("not found") ? 404 : message.includes("cannot be anonymized") ? 409 : 500).json({ error: err.message });
    }
  });

  app.post(
    "/api/mariadb/tenants/:tenantId/staff",
    requireAuth,
    validateSchema(StaffSchema),
    (req, res, next) => requirePackageCapacity(req, res, next, "staff", "maxStaff", "staff members"),
    async (req, res) => {
    try {
      const data = await createStaff(req.params.tenantId, req.body);
      await auditRouteEvent(req, "staff.created", "staff", {
        staffName: data?.name || req.body?.name || null,
        role: data?.role || req.body?.role || null,
        changedFields: auditChangedFields(req.body || {}),
      }, data?.id || null, "staff_admin");
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/staff/:id", requireAuth, validateSchema(StaffUpdateSchema), async (req, res) => {
    try {
      const staffUpdates = stripSensitiveVerification(req.body || {});
      const sensitiveAction = staffSensitiveAction(staffUpdates);
      if (sensitiveAction) {
        const sensitiveResponse = await enforceSensitiveAction(req, res, sensitiveAction, {
          targetStaffId: req.params.id,
          changedFields: auditChangedFields(staffUpdates),
        });
        if (sensitiveResponse) return;
      }

      const data = await updateStaff(req.params.tenantId, req.params.id, staffUpdates);
      await auditRouteEvent(req, "staff.updated", "staff", {
        staffName: data?.name || (staffUpdates as any)?.name || null,
        role: data?.role || (staffUpdates as any)?.role || null,
        changedFields: auditChangedFields(staffUpdates || {}),
      }, req.params.id, "staff_admin");
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/staff/:id", requireAuth, async (req, res) => {
    try {
      await deleteStaff(req.params.tenantId, req.params.id);
      await auditRouteEvent(req, "staff.deleted", "staff", {
        targetStaffId: req.params.id,
      }, req.params.id, "staff_admin");
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Bulk Items & Inventory Expansion
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/mariadb/products/:productId/recipe", requireAuth, async (req, res) => {
    try {
      const recipe = await getProductRecipe(req.params.productId);
      res.json(recipe);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/products/:productId/recipe", requireAuth, async (req, res) => {
    try {
      await updateProductRecipe(req.params.productId, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/products/:productId/modifiers", requireAuth, async (req, res) => {
    try {
      const mods = await getProductModifiers(req.params.productId);
      res.json(mods);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/products/:productId/modifiers", requireAuth, async (req, res) => {
    try {
      const id = await createModifierGroup(req.params.productId, req.body);
      res.json({ id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/modifiers/:modifierId/options", requireAuth, async (req, res) => {
    try {
      await updateModifierOptions(req.params.modifierId, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/modifiers/:modifierId", requireAuth, async (req, res) => {
    try {
      await deleteModifierGroup(req.params.modifierId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const { payfastRouter } = await import("./routes/payfast.js");
  app.use("/api/payfast", payfastRouter);

  if (!isProduction && !isTest) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (isProduction) {
    const rawBasePath = process.env.BASE_PATH || process.env.VITE_BASE_PATH || '/';
    const basePath =
      rawBasePath && rawBasePath !== '/'
        ? `/${rawBasePath.replace(/^\/+|\/+$/g, '')}`
        : '';

    const distDir = path.resolve(__dirname, '..', 'dist');
    const staticMountPath = basePath || '/';

    app.use(staticMountPath, express.static(distDir, {
      setHeaders(res, filePath) {
        const fileName = path.basename(filePath);
        if (fileName === 'sw.js' || fileName === 'manifest.webmanifest' || fileName === 'index.html') {
          res.setHeader('Cache-Control', 'no-store');
          return;
        }

        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));

    if (basePath) {
      app.get('/', (req, res) => {
        res.redirect(302, `${basePath}/`);
      });
    }

    app.get(staticMountPath === '/' ? '*' : `${staticMountPath}/*`, (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(distDir, 'index.html'), (err) => {
        if (err) {
          console.error("sendFile error:", err);
          if (!res.headersSent) {
            res.status(500).send(`Error loading index.html from ${distDir}`);
          }
        }
      });
    });
  }

  // Centralized error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error("Server error:", err.message, {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      stack: err.stack?.split("\n").slice(0, 5).join("\n"),
    });

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).json({
      error: isProduction ? "Internal server error" : err.message,
      requestId: req.requestId,
      ...(isTest ? { stack: err.stack } : {})
    });
  });

  return app;
}

export async function startServer() {
  const app = await createApp();
  const PORT = Number(process.env.PORT || 8080);
  
  // Create HTTP server and attach Socket.IO
  const httpServer = http.createServer(app);
  const io = setupSocketIO(httpServer);
  app.set("io", io);
  
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`${isPostgres() ? "Postgres" : "MariaDB"}-connected POS system ready`);
    console.log(`Socket.IO server initialized`);
    console.log(`__dirname is: ${__dirname}`);
    console.log(`distDir is: ${path.resolve(__dirname, '..', 'dist')}`);
  });
  
  return { app, httpServer };
}

function setupRoutes(app: any, io: any) {
  // Routes are defined in createApp for backward compatibility
  // This function is a placeholder for future refactoring
}

export { setupRoutes };
