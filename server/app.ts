import dotenv from "dotenv";
import express from "express";
import path from "path";
import bodyParser from "body-parser";
import crypto from "crypto";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { getConnection, isPostgres, query } from "./db.js";
import { initDb } from "./init-db.js";
import rateLimit from "express-rate-limit";
import http from "http";
import { setupSocketIO, broadcastToMessages, broadcastToWorkstation, broadcastToTable, broadcastToTab, broadcastToSales } from "./socket.js";
import { buildLiveWorkstationQueueRows } from "./workstationStats.js";
import { getDashboardKpis } from "./dashboardKpis.js";
import { validateSchema, LoginSchema, ProductSchema, CustomerSchema, CustomerUpdateSchema, StaffSchema, StaffUpdateSchema, SaleSchema, SaleRefundSchema, SaleVoidSchema, PaymentProviderStatusSchema, WorkstationSchema, TableSectionSchema, RestaurantTableSchema, PasswordSetupSchema } from "./validation.js";
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
  deleteProduct,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  createStaff,
  updateStaff,
  deleteStaff,
  createWorkstation,
  deleteWorkstation,
  createTableSection,
  updateTableSection,
  deleteTableSection,
  createRestaurantTable,
  updateRestaurantTable,
  deleteRestaurantTable,
  createSale,
  updateSale,
  updateSaleStatus,
  updateSalePaymentProviderStatus,
  updateSaleItem,
  processSaleRefund,
  processSaleVoid,
  getSaleById,
  createPayoutRequest,
  updatePayoutRequest,
  createCustomerPayoutRequest,
  updateCustomerPayoutRequest,
  createMessage,
  markMessageRead,
  setupTenant,
  clearAllSales,
  seedProducts,
  updateAppConfig,
  getBulkItems,
  createBulkItem,
  updateBulkItem,
  deleteBulkItem,
  getVendors,
  createVendor,
  updateVendor,
  getPurchaseOrders,
  getStockBatches,
  createPurchaseOrder,
  updatePurchaseOrder,
  receivePurchaseOrder,
  updateProductRecipe,
  getProductRecipe,
  getRecipeCostingReport,
  createModifierGroup,
  updateModifierOptions,
  getProductModifiers,
  deleteModifierGroup,
} from "./mariadb-crud.js";
import { broadcastSalesUpdate } from "./socket.js";
import {
  handleEnrollment,
  handleLogin,
  handleLogout,
  handleRefreshToken,
  handleRevokeRefreshTokens,
  handleGetMe,
  handleSetupPassword,
  handleStartDemo,
  handleTwoFactorConfirm,
  handleTwoFactorDisable,
  handleTwoFactorSetup,
  handleTwoFactorStatus,
} from "./auth-handler.js";
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
import { recordOfflineSyncIssue } from "./offlineSync.js";
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeRole(role: unknown) {
  return String(role || "").toLowerCase();
}

function canManageCash(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "manager" || r === "dev";
}

function canManageCompanionDevices(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "dev";
}

function canManagePush(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "manager" || r === "dev";
}

function canUseActionCenter(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "manager" || r === "dev";
}

function canManageInventory(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "manager" || r === "dev";
}

function canManageBookings(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "manager" || r === "dev";
}

function canGenerateVapidKeys(role: unknown) {
  return normalizeRole(role) === "dev";
}

function auditActorFromRequest(req: Request) {
  return {
    staffId: req.user?.staffId || req.user?.uid || null,
    staffName: req.user?.name || null,
    role: req.user?.role || null,
  };
}

function tenantIdFromRequest(req: Request) {
  return req.params?.tenantId || req.user?.tenantId || null;
}

function auditRequestContext(req: Request, extra: Record<string, unknown> = {}) {
  return {
    method: req.method,
    route: req.originalUrl || req.url,
    ip: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.get?.("user-agent") || null,
    ...extra,
  };
}

function auditChangedFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const sensitive = new Set([
    "password",
    "passwordHash",
    "password_hash",
    "apiKey",
    "api_key",
    "accessToken",
    "refreshToken",
    "token",
    "payfastMerchantKey",
    "payfastPassphrase",
    "payfast_merchant_key",
    "payfast_passphrase",
    "merchant_key",
    "passphrase",
  ]);
  return Object.keys(value as Record<string, unknown>)
    .filter((key) => !sensitive.has(key))
    .sort();
}

function integrationSecretFromRequest(req: Request) {
  const direct = req.get("x-jimmy-integration-key") || req.get("x-jpos-integration-key");
  if (direct) return direct.trim();
  const authorization = req.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  return bearer?.[1]?.trim() || "";
}

async function auditRouteEvent(
  req: Request,
  action: string,
  entityType: string,
  details: Record<string, unknown> = {},
  entityId?: string | null,
  source = "api"
) {
  const tenantId = tenantIdFromRequest(req);
  if (!tenantId) return null;
  const actor = auditActorFromRequest(req);
  return recordAuditEventSafe({
    tenantId,
    action,
    entityType,
    entityId: entityId || null,
    staffId: actor.staffId,
    staffName: actor.staffName,
    source,
    details: auditRequestContext(req, {
      actorRole: actor.role,
      ...details,
    }),
  });
}

function denyWithAudit(
  req: Request,
  res: Response,
  attemptedAction: string,
  message: string,
  details: Record<string, unknown> = {}
) {
  void auditRouteEvent(req, "permission.denied", "security", {
    attemptedAction,
    role: req.user?.role || null,
    ...details,
  }, auditActorFromRequest(req).staffId, "permission");
  return res.status(403).json({ error: message });
}

function requireTenantRouteAccess(req: Request, res: Response, next: NextFunction) {
  const routeTenantId = String(req.params.tenantId || "").trim();
  const tokenTenantId = String(req.user?.tenantId || "").trim();
  if (!routeTenantId || !tokenTenantId || routeTenantId === tokenTenantId) {
    return next();
  }
  return denyWithAudit(req, res, "tenant.cross_access", "This user cannot access the requested tenant.", {
    routeTenantId,
    tokenTenantId,
  });
}

async function enforceSensitiveAction(
  req: Request,
  res: Response,
  actionType: SensitiveActionType,
  details: Record<string, unknown> = {}
) {
  const verification = await verifySensitiveActionForRequest(req, actionType, details);
  if (verification.ok === true) return null;
  return res.status(verification.status).json({
    error: verification.message,
    sensitiveActionRequired: verification.status === 428,
    sensitiveActionFailed: verification.status === 403,
    actionType: verification.actionType,
    actionLabel: verification.actionLabel,
  });
}

function hasOwn(body: unknown, key: string) {
  return Boolean(body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, key));
}

function customerSensitiveAction(updates: Record<string, unknown>): SensitiveActionType | null {
  if (hasOwn(updates, "walletBalance")) return "wallet_adjustment";
  if (hasOwn(updates, "accountBalance") || hasOwn(updates, "accountBalanceDelta") || hasOwn(updates, "accountLimit")) return "account_balance_edit";
  if (hasOwn(updates, "discountPercent")) return "manual_discount";
  return null;
}

function staffSensitiveAction(updates: Record<string, unknown>): SensitiveActionType | null {
  if (hasOwn(updates, "walletBalance") || hasOwn(updates, "walletBalanceDelta")) return "wallet_adjustment";
  if (hasOwn(updates, "discountPercent")) return "manual_discount";
  return null;
}

function saleMutationSensitiveAction(updates: Record<string, unknown>): SensitiveActionType | null {
  if (hasOwn(updates, "manualDiscountAmount") || hasOwn(updates, "manualDiscountReason")) return "manual_discount";
  if (hasOwn(updates, "accountBalanceDelta")) return "account_balance_edit";
  return null;
}

function drawerMovementSensitiveAction(movementType: string): SensitiveActionType | null {
  if (movementType === "no_sale") return "no_sale";
  if (["cash_drop", "cash_added", "cash_removed", "manager_adjustment"].includes(movementType)) return "cash_movement";
  return null;
}

function safeJsonField(value: unknown, fallback: any) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseImageDataUrl(dataUrl: unknown) {
  const value = String(dataUrl || "");
  const match = value.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;

  const mimeType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const buffer = Buffer.from(match[2], "base64");
  const extension =
    mimeType === "image/png" ? "png" :
    mimeType === "image/jpeg" ? "jpg" :
    mimeType === "image/webp" ? "webp" :
    mimeType === "image/gif" ? "gif" :
    "svg";

  return { buffer, mimeType, extension };
}

function cashSessionResponse(r: any) {
  const toNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  return {
    id: r.id,
    tenantId: r.tenant_id,
    staffId: r.staff_id,
    staffName: r.staff_name,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
    reviewedBy: r.reviewed_by,
    reconciledAt: r.reconciled_at,
    reconciledBy: r.reconciled_by,
    openingFloat: toNumber(r.opening_float),
    openingBreakdown: safeJsonField(r.opening_breakdown, {}),
    expectedCash: toNumber(r.expected_cash),
    actualCash: toNumber(r.actual_cash),
    closingBreakdown: safeJsonField(r.closing_breakdown, {}),
    difference: toNumber(r.difference),
    accumulatedTips: toNumber(r.accumulated_tips),
    netTips: toNumber(r.net_tips),
    status: r.status,
    reviewStatus: r.review_status || (r.status === "open" ? "in_progress" : "submitted"),
    notes: r.notes,
    managerNotes: r.manager_notes,
    varianceReason: r.variance_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
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

function toMoneyNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
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

let PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
let PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY;
let PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE;
let PAYFAST_SANDBOX = process.env.PAYFAST_SANDBOX === "true";

if (!PAYFAST_MERCHANT_ID || !PAYFAST_MERCHANT_KEY || !PAYFAST_PASSPHRASE) {
  console.warn("⚠️  PayFast credentials not configured. Payment processing will fail.");
}

async function getAppConfig(tenantId: string) {
  try {
    const config = await getAppConfigByTenant(tenantId);
    if (config) {
      return {
        merchant_id: config.payfastMerchantId || PAYFAST_MERCHANT_ID,
        merchant_key: config.payfastMerchantKey || PAYFAST_MERCHANT_KEY,
        passphrase: config.payfastPassphrase || PAYFAST_PASSPHRASE,
        sandbox: config.payfastSandbox !== undefined ? config.payfastSandbox : PAYFAST_SANDBOX,
      };
    }
  } catch (err) {
    console.error("Error fetching config from database:", err);
  }
  return {
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
    passphrase: PAYFAST_PASSPHRASE,
    sandbox: PAYFAST_SANDBOX,
  };
}

function generatePayFastSignature(data: any, passphrase?: string) {
  let queryString = "";
  Object.keys(data).forEach((key) => {
    if (data[key] !== "" && key !== "signature") {
      queryString += `${key}=${encodeURIComponent(data[key]).replace(/%20/g, "+")}&`;
    }
  });

  queryString = queryString.substring(0, queryString.length - 1);
  if (passphrase) {
    queryString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
  }

  return crypto.createHash("md5").update(queryString).digest("hex");
}

function getPublicBaseUrl(req: Request) {
  const configured = String(process.env.PUBLIC_APP_URL || process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;

  const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol || "https";
  const host = req.get("host");
  return host ? `${protocol}://${host}` : "";
}

function safePayFastText(value: unknown, fallback: string, maxLength = 100) {
  const text = String(value || "").trim();
  return (text || fallback).slice(0, maxLength);
}

export async function createApp(io: any = null) {
  const app = express();
  if (io) app.set("io", io);
  
  // Force production mode if running on Railway
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
  app.use(bodyParser.json({ limit: "1mb" }));
  app.use(bodyParser.urlencoded({ extended: false, limit: "1mb" }));
  app.use('/uploads', express.static(path.resolve(__dirname, '..', 'public', 'uploads'), {
    dotfiles: 'deny',
    index: false,
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=300');
    },
  }));

  if (process.env.JPOS_HOSTED === "true") {
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

  const realtimeIo = () => app.get("io") || io;

  const workstationItemsForSale = (sale: any) => {
    const items = Array.isArray(sale?.items) ? sale.items : [];
    return items.filter((item: any) => item?.workstationId || item?.workstation_id);
  };

  const orderLabelForPush = (sale: any) => {
    if (sale?.isTab) return sale?.tabName ? `Tab ${sale.tabName}` : "Tab order";
    if (sale?.tableNumber || sale?.table_number) return `Table ${sale.tableNumber || sale.table_number}`;
    return "Takeaway order";
  };

  const sendWorkstationOrderPush = async (tenantId: string, sale: any) => {
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
      data: {
        type: "workstation_order",
        saleId: sale.id,
      },
      actions: [
        { action: "open-workstation", title: "Open queue" },
      ],
    }, { urgency: "high", ttl: 300 }).catch((err) => {
      console.warn("Workstation push failed:", err?.message || err);
    });
  };

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
    app.get("/api/dev/db-test", async (req, res) => {
      try {
        const conn = await getConnection();
        try {
          const rows = await conn.query("SELECT 1 as val");
          res.json({ status: "ok", postgres: isPostgres(), rows });
        } finally {
          conn.release();
        }
      } catch (err) {
        sendSafeError(res, 500, "Database probe failed", err, req);
      }
    });

    app.post("/api/dev/init-db", async (req, res) => {
      try {
        await initDb();
        res.json({ success: true, message: "Database schema initialized successfully" });
      } catch (err) {
        sendSafeError(res, 500, "Schema initialization failed", err, req);
      }
    });
  }

  app.post("/api/auth/login", authRateLimit, validateSchema(LoginSchema), handleLogin);
  app.post("/api/auth/logout", handleLogout);
  app.post("/api/auth/refresh", authRateLimit, handleRefreshToken);
  app.post("/api/auth/refresh-tokens/revoke", requireAuth, handleRevokeRefreshTokens);
  app.get("/api/auth/me", requireAuth, handleGetMe);
  app.post("/api/auth/setup-password", sensitiveRouteRateLimit, requireAuth, validateSchema(PasswordSetupSchema), handleSetupPassword);
  app.get("/api/auth/2fa", requireAuth, handleTwoFactorStatus);
  app.post("/api/auth/2fa/setup", sensitiveRouteRateLimit, requireAuth, handleTwoFactorSetup);
  app.post("/api/auth/2fa/confirm", sensitiveRouteRateLimit, requireAuth, handleTwoFactorConfirm);
  app.post("/api/auth/2fa/disable", sensitiveRouteRateLimit, requireAuth, handleTwoFactorDisable);

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

  app.get("/api/mariadb/tenants/:tenantId/products", requireAuth, async (req, res) => {
    try {
      const products = await getProductsByTenant(req.params.tenantId, {
        locationId: typeof req.query.locationId === "string" ? req.query.locationId : null,
        staffId: req.user?.staffId || null,
        role: req.user?.role || null,
      });
      res.json(products);
    } catch (err: any) {
      const status = String(err?.message || "").includes("not assigned") ? 403 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/batch/products/create", sensitiveRouteRateLimit, requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "batch.products_create", "Manager access is required for batch product creation.");
      }
      const result = await batchCreateProducts(req.params.tenantId, req.body || {}, auditActorFromRequest(req));
      await auditRouteEvent(req, "batch.products_created", "product", {
        dryRun: result.dryRun,
        created: result.created,
        skipped: result.skipped,
        errorCount: result.errors.length,
      }, null, "inventory_batch");
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/batch/products/prices", sensitiveRouteRateLimit, requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "batch.product_prices_update", "Manager access is required for batch price updates.");
      }
      const result = await batchUpdateProductPrices(req.params.tenantId, req.body || {}, auditActorFromRequest(req));
      await auditRouteEvent(req, "batch.product_prices_updated", "product", {
        dryRun: result.dryRun,
        updated: result.updated,
        skipped: result.skipped,
        errorCount: result.errors.length,
      }, null, "inventory_batch");
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/batch/inventory/export", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "batch.inventory_export", "Manager access is required for inventory exports.");
      }
      const pack = await exportInventoryCsv(req.params.tenantId, {
        locationId: typeof req.query.locationId === "string" ? req.query.locationId : null,
      });
      await auditRouteEvent(req, "batch.inventory_exported", "inventory", {
        count: pack.count,
        locationId: typeof req.query.locationId === "string" ? req.query.locationId : null,
      }, null, "inventory_batch");
      res.json(pack);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/batch/inventory/import", sensitiveRouteRateLimit, requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "batch.inventory_import", "Manager access is required for inventory imports.");
      }
      const result = await importInventory(req.params.tenantId, req.body || {}, auditActorFromRequest(req));
      await auditRouteEvent(req, "batch.inventory_imported", "inventory", {
        dryRun: result.dryRun,
        updated: result.updated,
        skipped: result.skipped,
        errorCount: result.errors.length,
      }, null, "inventory_batch");
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/inventory-locations", requireAuth, async (req, res) => {
    try {
      res.json(await listInventoryLocations(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/inventory-locations", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "inventory_locations.create", "Manager access is required to create inventory locations.");
      }
      const location = await createInventoryLocation(req.params.tenantId, req.body || {}, auditActorFromRequest(req));
      res.status(201).json(location);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/inventory-locations/:locationId", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "inventory_locations.update", "Manager access is required to update inventory locations.", {
          locationId: req.params.locationId,
        });
      }
      const location = await updateInventoryLocation(req.params.tenantId, req.params.locationId, req.body || {}, auditActorFromRequest(req));
      res.json(location);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/inventory-location-stock", requireAuth, async (req, res) => {
    try {
      res.json(await listProductLocationStocks(req.params.tenantId, {
        productId: typeof req.query.productId === "string" ? req.query.productId : null,
        locationId: typeof req.query.locationId === "string" ? req.query.locationId : null,
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/inventory-location-stock", sensitiveRouteRateLimit, requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "inventory_location_stock.update", "Manager access is required to adjust location stock.");
      }
      const stock = await upsertProductLocationStock(req.params.tenantId, {
        ...(req.body || {}),
        ...auditActorFromRequest(req),
      });
      res.json(stock);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/stock-transfers", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "stock_transfers.view", "Manager access is required to view stock transfers.");
      }
      res.json(await listStockTransferOrders(req.params.tenantId, {
        status: typeof req.query.status === "string" ? req.query.status : null,
        limit: typeof req.query.limit === "string" ? req.query.limit : null,
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/stock-transfers", sensitiveRouteRateLimit, requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "stock_transfers.create", "Manager access is required to create stock transfers.");
      }
      const transfer = await createStockTransferOrder(req.params.tenantId, {
        ...(req.body || {}),
        ...auditActorFromRequest(req),
      });
      res.status(201).json(transfer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/stock-transfers/:transferId/complete", sensitiveRouteRateLimit, requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "stock_transfers.complete", "Manager access is required to complete stock transfers.", {
          transferId: req.params.transferId,
        });
      }
      const transfer = await completeStockTransferOrder(req.params.tenantId, req.params.transferId, auditActorFromRequest(req));
      res.json(transfer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/config", requireAuth, async (req, res) => {
    try {
      const config = await getAppConfigByTenant(req.params.tenantId);
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/promotions", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "promotions.view", "Manager access is required for promotions.");
      }
      res.json(await listPromotions(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/promotions", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "promotions.create", "Manager access is required to create promotions.");
      }
      const promotion = await createPromotion(req.params.tenantId, req.body || {}, auditActorFromRequest(req));
      await auditRouteEvent(req, "promotion.created", "promotion", {
        promotionId: promotion.id,
        code: promotion.code,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
      }, promotion.id, "promotions");
      res.status(201).json(promotion);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/promotions/validate", requireAuth, async (req, res) => {
    try {
      const result = await validatePromotionForSale(null, req.params.tenantId, req.body || {});
      if (!result.valid) return res.status(400).json({ ...result, error: result.reason || "Promotion could not be applied." });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/promotions/:promotionId", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "promotions.update", "Manager access is required to update promotions.");
      }
      const promotion = await updatePromotion(req.params.tenantId, req.params.promotionId, req.body || {}, auditActorFromRequest(req));
      await auditRouteEvent(req, "promotion.updated", "promotion", {
        promotionId: promotion.id,
        code: promotion.code,
        status: promotion.status,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
      }, promotion.id, "promotions");
      res.json(promotion);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/loyalty/tiers", requireAuth, async (req, res) => {
    try {
      res.json(await listLoyaltyTiers(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/loyalty/tiers", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "loyalty.tier_create", "Manager access is required to create loyalty tiers.");
      }
      const tier = await createLoyaltyTier(req.params.tenantId, req.body || {});
      await auditRouteEvent(req, "loyalty.tier_created", "loyalty_tier", {
        tierId: tier.id,
        name: tier.name,
        minPoints: tier.minPoints,
        earnMultiplier: tier.earnMultiplier,
      }, tier.id, "loyalty");
      res.status(201).json(tier);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/loyalty/tiers/:tierId", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "loyalty.tier_update", "Manager access is required to update loyalty tiers.");
      }
      const tier = await updateLoyaltyTier(req.params.tenantId, req.params.tierId, req.body || {});
      await auditRouteEvent(req, "loyalty.tier_updated", "loyalty_tier", {
        tierId: tier.id,
        name: tier.name,
        status: tier.status,
      }, tier.id, "loyalty");
      res.json(tier);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/loyalty/reward-rules", requireAuth, async (req, res) => {
    try {
      res.json(await listLoyaltyRewardRules(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/loyalty/reward-rules", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "loyalty.rule_create", "Manager access is required to create loyalty reward rules.");
      }
      const rule = await createLoyaltyRewardRule(req.params.tenantId, req.body || {});
      await auditRouteEvent(req, "loyalty.reward_rule_created", "loyalty_reward_rule", {
        ruleId: rule.id,
        name: rule.name,
        ruleType: rule.ruleType,
      }, rule.id, "loyalty");
      res.status(201).json(rule);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/loyalty/reward-rules/:ruleId", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "loyalty.rule_update", "Manager access is required to update loyalty reward rules.");
      }
      const rule = await updateLoyaltyRewardRule(req.params.tenantId, req.params.ruleId, req.body || {});
      await auditRouteEvent(req, "loyalty.reward_rule_updated", "loyalty_reward_rule", {
        ruleId: rule.id,
        name: rule.name,
        status: rule.status,
        ruleType: rule.ruleType,
      }, rule.id, "loyalty");
      res.json(rule);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/loyalty/preview", requireAuth, async (req, res) => {
    try {
      res.json(await calculateLoyaltyAward(null, req.params.tenantId, req.body || {}));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/push/status", requireAuth, async (req, res) => {
    try {
      res.json(await getPushOverview(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/push/vapid/generate", requireAuth, async (req, res) => {
    try {
      if (!canGenerateVapidKeys(req.user?.role)) {
        return denyWithAudit(req, res, "push.vapid_generate", "Only Dev users can generate VAPID keys");
      }
      const result = await generateTenantVapidKeys(req.params.tenantId, req.body?.subject);
      await auditRouteEvent(req, "settings.push_vapid_generated", "settings", {
        subject: req.body?.subject || null,
      }, req.params.tenantId, "push");
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/push/subscriptions", requireAuth, async (req, res) => {
    try {
      const overview = await savePushSubscription(
        req.params.tenantId,
        req.user?.staffId || req.user?.uid || null,
        req.body?.subscription || req.body,
        {
          deviceLabel: req.body?.deviceLabel,
          userAgent: req.get("user-agent") || "",
        }
      );
      res.json(overview);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/push/subscriptions", requireAuth, async (req, res) => {
    try {
      const endpoint = String(req.body?.endpoint || req.query.endpoint || "").trim();
      if (!endpoint) {
        return res.status(400).json({ error: "Push subscription endpoint is required" });
      }
      res.json(await removePushSubscription(req.params.tenantId, endpoint));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/push/test", requireAuth, async (req, res) => {
    try {
      if (!canManagePush(req.user?.role)) {
        return denyWithAudit(req, res, "push.test_send", "Only managers, admins, and devs can send test push notifications");
      }
      const staffIds = req.user?.staffId ? [String(req.user.staffId)] : undefined;
      const result = await sendPushNotification(req.params.tenantId, {
        title: "MasePOS push test",
        body: "Browser push is ready for workstation orders, ready messages, and staff alerts.",
        url: "/messages",
        tag: `dev-push-test-${Date.now()}`,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        requireInteraction: true,
        vibrate: [120, 60, 120],
        data: { type: "dev_push_test" },
        actions: [
          { action: "open-messages", title: "Open messages" },
        ],
      }, { staffIds, urgency: "high", ttl: 60 });
      await auditRouteEvent(req, "settings.push_test_sent", "settings", {
        success: true,
        recipientStaffIds: staffIds || [],
      }, req.params.tenantId, "push");
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/package-limits", requireAuth, async (req, res) => {
    try {
      const [context, usage] = await Promise.all([
        getTenantPackageContext(req.params.tenantId),
        getTenantPackageUsage(req.params.tenantId),
      ]);
      const pkg = context.package;
      res.json({
        source: context.source,
        package: pkg,
        localServerSync: hasPackageFeature(pkg.features, "local_server_sync"),
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

  app.get(
    "/api/mariadb/tenants/:tenantId/ai/settings",
    requireAuth,
    requireAiPackageAccess,
    requireAiRoleAccess,
    async (req, res) => {
      try {
        const settings = await getAiSettings(req.params.tenantId);
        res.json(serializeAiSettings(settings));
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.put(
    "/api/mariadb/tenants/:tenantId/ai/settings",
    requireAuth,
    requireAiPackageAccess,
    async (req, res) => {
      try {
        if (!canManageAi(req.user?.role)) {
          return denyWithAudit(req, res, "ai.settings_update", "Only managers, admins, and devs can manage AI settings");
        }
        const settings = await saveAiSettings(req.params.tenantId, req.body || {});
        await auditRouteEvent(req, "ai.settings_updated", "settings", {
          provider: settings.provider,
          model: settings.model,
          enabled: settings.enabled,
          insightsEnabled: settings.insightsEnabled,
          staffScoringEnabled: settings.staffScoringEnabled,
          changedFields: auditChangedFields(req.body || {}),
          apiKeySubmitted: req.body?.apiKey !== undefined,
        }, req.params.tenantId, "ai");
        res.json(serializeAiSettings(settings));
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/mariadb/tenants/:tenantId/ai/models",
    requireAuth,
    requireAiPackageAccess,
    async (req, res) => {
      try {
        if (!canManageAi(req.user?.role)) {
          return denyWithAudit(req, res, "ai.models_list", "Only managers, admins, and devs can manage AI settings");
        }
        const models = await listAiModels(req.params.tenantId, req.body || {});
        await auditRouteEvent(req, "ai.models_listed", "settings", {
          provider: req.body?.provider || null,
          modelCount: models.length,
        }, req.params.tenantId, "ai");
        res.json({ models });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/mariadb/tenants/:tenantId/ai/test",
    sensitiveRouteRateLimit,
    requireAuth,
    requireAiPackageAccess,
    async (req, res) => {
      try {
        if (!canManageAi(req.user?.role)) {
          return denyWithAudit(req, res, "ai.provider_test", "Only managers, admins, and devs can test AI provider credentials");
        }
        const result = await testAiProviderContact(req.params.tenantId, req.body || {});
        await auditRouteEvent(req, "ai.provider_tested", "settings", {
          provider: result.provider,
          model: result.model,
          imageCount: Array.isArray(req.body?.images) ? req.body.images.length : 0,
          documentCount: Array.isArray(req.body?.documents) ? req.body.documents.length : 0,
          messageLength: String(req.body?.message || "").length,
        }, req.params.tenantId, "ai");
        res.json(result);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.get(
    "/api/mariadb/tenants/:tenantId/ai/insights",
    requireAuth,
    requireAiPackageAccess,
    requireAiRoleAccess,
    async (req, res) => {
      try {
        res.json(await listInsights(req.params.tenantId));
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.delete(
    "/api/mariadb/tenants/:tenantId/ai/insights/:insightId",
    requireAuth,
    requireAiPackageAccess,
    requireAiRoleAccess,
    async (req, res) => {
      try {
        res.json(await deleteInsight(req.params.tenantId, req.params.insightId));
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/mariadb/tenants/:tenantId/ai/insights/generate",
    requireAuth,
    requireAiPackageAccess,
    requireAiRoleAccess,
    async (req, res) => {
      try {
        res.json(await generateInsights(req.params.tenantId, req.user?.staffId || null));
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/mariadb/tenants/:tenantId/ai/insights/sync-tasks",
    requireAuth,
    requireAiPackageAccess,
    requireAiRoleAccess,
    async (req, res) => {
      try {
        if (!canManageAi(req.user?.role)) {
          return denyWithAudit(req, res, "ai.insights_sync_tasks", "Only managers, admins, and devs can sync AI recommendation tasks");
        }
        const result = await syncManagerTasksFromSignals(req.params.tenantId);
        await auditRouteEvent(req, "ai.insights_synced_to_tasks", "manager_task", {
          synced: result.synced,
          approvalFirst: true,
        }, req.params.tenantId, "ai");
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.get(
    "/api/mariadb/tenants/:tenantId/ai/staff-scores",
    requireAuth,
    requireAiPackageAccess,
    requireAiStaffScoreAccess,
    async (req, res) => {
      try {
        res.json(await listStaffScores(req.params.tenantId));
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/mariadb/tenants/:tenantId/ai/staff-scores/generate",
    requireAuth,
    requireAiPackageAccess,
    requireAiStaffScoreAccess,
    async (req, res) => {
      try {
        res.json(await generateStaffScores(req.params.tenantId, req.user?.staffId || null));
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/mariadb/tenants/:tenantId/ai/agent/inventory/proposal",
    requireAuth,
    requireAiPackageAccess,
    requireAiRoleAccess,
    async (req, res) => {
      try {
        res.json(await generateInventoryAgentProposal(req.params.tenantId, req.body || {}, { actor: auditActorFromRequest(req) }));
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.post(
    "/api/mariadb/tenants/:tenantId/ai/agent/inventory/apply",
    requireAuth,
    requireAiPackageAccess,
    requireAiRoleAccess,
    async (req, res) => {
      try {
        const fullAutopilot = Boolean(req.body?.fullAutopilot);
        if (fullAutopilot && normalizeRole(req.user?.role) !== "dev") {
          return denyWithAudit(req, res, "ai.inventory_full_autopilot", "Full autopilot is restricted to Dev users", {
            stepCount: Array.isArray(req.body?.steps) ? req.body.steps.length : 0,
          });
        }
        const runId = req.body?.runId || req.body?.proposalId || null;
        const result = await applyApprovedInventoryAgentSteps(req.params.tenantId, req.body?.steps || [], {
          fullAutopilot,
          runId,
          actor: auditActorFromRequest(req),
        });
        await auditRouteEvent(req, "ai.inventory_steps_applied", "ai_agent_run", {
          runId,
          fullAutopilot,
          requestedStepCount: Array.isArray(req.body?.steps) ? req.body.steps.length : 0,
          appliedCount: result.applied.length,
          skippedCount: result.skipped.length,
          appliedTypes: result.applied.map((step: any) => step.type),
          skippedTypes: result.skipped.map((step: any) => step.type),
        }, runId, "ai");
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.put("/api/mariadb/tenants/:tenantId/settings/app", requireAuth, async (req, res) => {
    try {
      if (req.body?.business?.logoUrl) {
        const context = await getTenantPackageContext(req.params.tenantId);
        if (!hasPackageFeature(context.package.features, "own_logo")) {
          void auditRouteEvent(req, "permission.denied", "security", {
            attemptedAction: "settings.logo_update",
            role: req.user?.role || null,
            package: context.package.id,
            feature: "own_logo",
          }, auditActorFromRequest(req).staffId, "permission");
          return res.status(403).json({
            error: "Feature not available on your package",
            package: context.package.id,
            feature: "own_logo",
            upgrade: "Upgrade your MasePOS package to use your own logo",
          });
        }
      }
      const settingsUpdate = stripSensitiveVerification(req.body || {});
      const sensitiveResponse = await enforceSensitiveAction(req, res, "settings_change", {
        changedFields: auditChangedFields(settingsUpdate || {}),
        businessFields: auditChangedFields((settingsUpdate as any)?.business || {}),
      });
      if (sensitiveResponse) return;

      await updateAppConfig(req.params.tenantId, settingsUpdate);
      await auditRouteEvent(req, "settings.app_updated", "settings", {
        changedFields: auditChangedFields(settingsUpdate || {}),
        businessFields: auditChangedFields((settingsUpdate as any)?.business || {}),
      }, req.params.tenantId, "settings");
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/settings/retention-policy", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "retention_policy.view", "Manager access is required to view retention settings.");
      }
      res.json(await getRetentionPolicy(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/settings/retention-policy", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "retention_policy.update", "Manager access is required to update retention settings.");
      }
      res.json(await saveRetentionPolicy(req.params.tenantId, req.body || {}, auditActorFromRequest(req)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/settings/retention-policy/preview", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "retention_policy.preview", "Manager access is required to preview retention cleanup.");
      }
      res.json(await getRetentionPreview(req.params.tenantId, req.body || undefined));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/settings/retention-policy/apply", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "retention_policy.apply", "Manager access is required to apply retention cleanup.");
      }
      res.json(await applyRetentionPolicy(req.params.tenantId, req.body || undefined, auditActorFromRequest(req)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/settings/logo", requireAuth, async (req, res) => {
    try {
      const context = await getTenantPackageContext(req.params.tenantId);
      if (!hasPackageFeature(context.package.features, "own_logo")) {
        void auditRouteEvent(req, "permission.denied", "security", {
          attemptedAction: "settings.logo_upload",
          role: req.user?.role || null,
          package: context.package.id,
          feature: "own_logo",
        }, auditActorFromRequest(req).staffId, "permission");
        return res.status(403).json({
          error: "Feature not available on your package",
          package: context.package.id,
          feature: "own_logo",
          upgrade: "Upgrade your MasePOS package to upload your own logo",
        });
      }

      const parsed = parseImageDataUrl(req.body?.dataUrl);
      if (!parsed) {
        return res.status(400).json({ error: "Upload a PNG, JPG, WebP, GIF, or SVG logo file" });
      }
      if (parsed.buffer.length > 2 * 1024 * 1024) {
        return res.status(413).json({ error: "Logo file is too large. Use an image smaller than 2MB" });
      }

      const tenantId = req.params.tenantId.replace(/[^a-zA-Z0-9_-]/g, "_");
      const uploadDir = path.resolve(__dirname, "..", "public", "uploads", "tenant-logos");
      await fs.mkdir(uploadDir, { recursive: true });
      const fileName = `${tenantId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${parsed.extension}`;
      await fs.writeFile(path.join(uploadDir, fileName), parsed.buffer);
      const logoUrl = `/uploads/tenant-logos/${fileName}`;

      const currentConfig = await getAppConfigByTenant(req.params.tenantId);
      if (!currentConfig) {
        return res.status(404).json({ error: "Tenant settings not found" });
      }
      const nextConfig = {
        ...currentConfig,
        business: {
          ...(currentConfig.business || {}),
          logoUrl,
        },
      };
      await updateAppConfig(req.params.tenantId, nextConfig);
      await auditRouteEvent(req, "settings.logo_uploaded", "settings", {
        logoUrl,
        mimeType: parsed.mimeType,
        sizeBytes: parsed.buffer.length,
      }, req.params.tenantId, "settings");

      res.json({ logoUrl, config: nextConfig });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/action-center", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "action_center.view", "Manager access is required for the action center.");
      }
      res.json(await getManagerActionCenter(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/action-center/tasks", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "action_center.tasks_view", "Manager access is required for action center tasks.");
      }
      res.json(await getManagerTaskQueue(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/action-center/activity", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "action_center.activity_view", "Manager access is required for action center activity.");
      }
      res.json(await getManagerActivityHistory(req.params.tenantId, req.query));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/manager-overrides", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "manager_overrides.view", "Manager access is required for override history.");
      }
      res.json(await listManagerOverrides(req.params.tenantId, Number(req.query.limit || 25)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/action-center/activity/export", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "action_center.activity_export", "Manager access is required for action center activity export.");
      }
      res.json(await getManagerActivityCsv(req.params.tenantId, req.query));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/action-center/activity/report", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "action_center.audit_report_export", "Manager access is required for audit reports.");
      }
      const report = await getManagerAuditReport(req.params.tenantId, req.query);
      await auditRouteEvent(req, "audit_report.exported", "audit_report", {
        audience: report.audience,
        rowCount: report.count,
        filters: req.query || {},
      }, null, "action_center");
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/payment-provider-reconciliation/report", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "payment_provider_reconciliation.report_export", "Manager access is required for payment provider reconciliation reports.");
      }
      const report = await getPaymentProviderReconciliationReport(req.params.tenantId, req.query);
      await auditRouteEvent(req, "payment_provider_reconciliation.report_exported", "payment_provider_reconciliation", {
        rowCount: report.count,
        filters: req.query || {},
        pciBoundary: report.pciBoundary,
      }, null, "payment_provider_reconciliation");
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/tax/periods", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "tax.periods_view", "Manager access is required for tax periods.");
      }
      res.json(await getTaxPeriods(req.params.tenantId, typeof req.query.limit === "string" ? req.query.limit : 24));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/tax/vat-report", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "tax.vat_report_export", "Manager access is required for VAT reports.");
      }
      const report = await getVatTaxReport(req.params.tenantId, req.query);
      await auditRouteEvent(req, "tax_report.exported", "tax_report", {
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        invoiceCount: report.summary.invoiceCount,
        outputTax: report.summary.outputTax,
        locked: report.locked,
      }, null, "tax_reporting");
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/tax/periods/lock", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "tax.period_lock", "Manager access is required to lock tax periods.");
      }
      res.json(await lockTaxPeriod(req.params.tenantId, req.body || {}, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
        role: req.user?.role || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/reports/margins", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "reports.margins_view", "Manager access is required for margin reports.");
      }
      const report = await getMarginReport(req.params.tenantId, req.query);
      await auditRouteEvent(req, "margin_report.exported", "margin_report", {
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        revenue: report.summary.revenue,
        grossProfit: report.summary.grossProfit,
        grossMarginPercent: report.summary.grossMarginPercent,
      }, null, "reporting");
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/reports/operational", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "reports.operational_view", "Manager access is required for operational analytics reports.");
      }
      const report = await getOperationalAnalyticsReport(req.params.tenantId, req.query);
      await auditRouteEvent(req, "operational_report.exported", "operational_report", {
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        categoryCount: report.summary.categoryCount,
        openTabCount: report.summary.openTabCount,
        refundVoidCount: report.summary.refundVoidCount,
        cashAbsoluteVariance: report.summary.cashAbsoluteVariance,
      }, null, "reporting");
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/reports/accounting-journal", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "reports.accounting_journal_view", "Manager access is required for accounting journal exports.");
      }
      const report = await getAccountingJournalReport(req.params.tenantId, req.query);
      await auditRouteEvent(req, "accounting_journal.exported", "accounting_journal", {
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        entryCount: report.summary.entryCount,
        lineCount: report.summary.lineCount,
        totalDebits: report.summary.totalDebits,
        totalCredits: report.summary.totalCredits,
        balanced: report.summary.balanced,
      }, null, "reporting");
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/integrations/ecommerce/products-export", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "integrations.ecommerce_export", "Manager access is required for marketplace exports.");
      }
      const report = await getEcommerceMarketplaceExport(req.params.tenantId, req.query);
      await auditRouteEvent(req, "integrations.ecommerce_exported", "ecommerce_integration", {
        productCount: report.summary.productCount,
        targetCount: report.summary.targetCount,
        targets: report.targets.map(target => target.id),
      }, null, "integration");
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/integrations/api-keys", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "integrations.api_keys_view", "Manager access is required for integration API keys.");
      }
      res.json(await listIntegrationApiKeys(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/integrations/api-keys", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "integrations.api_key_create", "Manager access is required for integration API keys.");
      }
      const created = await createIntegrationApiKey(req.params.tenantId, req.body || {}, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      });
      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/integrations/api-keys/:keyId/revoke", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "integrations.api_key_revoke", "Manager access is required for integration API keys.");
      }
      const key = await revokeIntegrationApiKey(req.params.tenantId, req.params.keyId, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      });
      if (!key) return res.status(404).json({ error: "Integration API key not found" });
      res.json(key);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/integrations/webhook-events", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "integrations.webhook_events_view", "Manager access is required for integration webhook history.");
      }
      res.json(await listIntegrationWebhookEvents(req.params.tenantId, {
        source: typeof req.query.source === "string" ? req.query.source : null,
        status: typeof req.query.status === "string" ? req.query.status : null,
        limit: typeof req.query.limit === "string" ? req.query.limit : 50,
      }));
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

  app.get("/api/mariadb/tenants/:tenantId/integrations/delivery/orders", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "integrations.delivery_orders_view", "Manager access is required for delivery orders.");
      }
      res.json(await listDeliveryOrders(req.params.tenantId, {
        provider: typeof req.query.provider === "string" ? req.query.provider : null,
        status: typeof req.query.status === "string" ? req.query.status : null,
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/integrations/delivery/orders", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "integrations.delivery_order_ingest", "Manager access is required to ingest delivery orders.");
      }
      const order = await ingestDeliveryOrder(req.params.tenantId, req.body, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      });
      await auditRouteEvent(req, "delivery_order.ingest_route", "delivery_order", {
        provider: order.provider,
        externalOrderId: order.externalOrderId,
        status: order.status,
        itemCount: order.items.length,
      }, order.id, "integration");
      res.status(201).json(order);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/integrations/delivery/orders/:orderId/status", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "integrations.delivery_order_status", "Manager access is required to update delivery orders.");
      }
      const order = await updateDeliveryOrderStatus(req.params.tenantId, req.params.orderId, req.body?.status, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      });
      if (!order) return res.status(404).json({ error: "Delivery order not found" });
      res.json(order);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/action-center/tasks/:taskId", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "action_center.task_decide", "Manager access is required for action center tasks.", {
          taskId: req.params.taskId,
        });
      }
      const decisionInput = stripSensitiveVerification(req.body || {});
      const sensitiveResponse = await enforceSensitiveAction(req, res, "manager_override", {
        taskId: req.params.taskId,
        action: (decisionInput as any)?.action || null,
      });
      if (sensitiveResponse) return;

      res.json(await decideManagerTask(req.params.tenantId, req.params.taskId, {
        action: (decisionInput as any)?.action,
        note: (decisionInput as any)?.note,
        assignedTo: (decisionInput as any)?.assignedTo,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/stocktakes", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "stocktake.sessions_view", "Manager access is required for stocktake sessions.");
      }
      res.json(await getStockTakeSessions(req.params.tenantId, {
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        type: typeof req.query.type === "string" ? req.query.type : undefined,
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/stocktakes", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "stocktake.create", "Manager access is required to start a stocktake.");
      }
      const session = await createStockTakeSession(req.params.tenantId, req.body || {}, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
        role: req.user?.role || null,
      });
      res.status(201).json(session);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/stocktakes/suggestions", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "stocktake.suggestions_view", "Manager access is required for stocktake suggestions.");
      }
      res.json(await getStockTakeSuggestions(req.params.tenantId, {
        limit: typeof req.query.limit === "string" ? req.query.limit : undefined,
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/stocktakes/rules", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "stocktake.rules_view", "Manager access is required for stocktake rules.");
      }
      res.json(await getStockTakeRules(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/stocktakes/rules", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "stocktake.rule_create", "Manager access is required to create stocktake rules.");
      }
      res.status(201).json(await createStockTakeRule(req.params.tenantId, req.body || {}, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
        role: req.user?.role || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/stocktakes/rules/run-due", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "stocktake.rule_run_due", "Manager access is required to run stocktake rules.");
      }
      res.json(await runDueStockTakeRules(req.params.tenantId, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
        role: req.user?.role || null,
      }, {
        ruleId: req.body?.ruleId || null,
        force: Boolean(req.body?.force),
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/stocktakes/rules/:ruleId", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "stocktake.rule_update", "Manager access is required to update stocktake rules.", {
          ruleId: req.params.ruleId,
        });
      }
      res.json(await updateStockTakeRule(req.params.tenantId, req.params.ruleId, req.body || {}, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
        role: req.user?.role || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/stocktakes/rules/:ruleId", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "stocktake.rule_delete", "Manager access is required to delete stocktake rules.", {
          ruleId: req.params.ruleId,
        });
      }
      res.json(await deleteStockTakeRule(req.params.tenantId, req.params.ruleId, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
        role: req.user?.role || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/stocktakes/my-assignments", requireAuth, async (req, res) => {
    try {
      const staffId = String(req.query.staffId || req.user?.staffId || req.user?.uid || "").trim();
      res.json(await getMyStockTakeAssignments(req.params.tenantId, staffId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/stocktakes/:sessionId/export-pack", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "stocktake.export_pack", "Manager access is required to export stocktake packs.", {
          sessionId: req.params.sessionId,
        });
      }
      res.json(await getStockTakeExportPack(req.params.tenantId, req.params.sessionId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/stocktakes/:sessionId", requireAuth, async (req, res) => {
    try {
      const session = await getStockTakeSession(req.params.tenantId, req.params.sessionId);
      if (!session) {
        res.status(404).json({ error: "Stocktake session not found" });
        return;
      }
      if (!canUseActionCenter(req.user?.role)) {
        const staffId = req.user?.staffId || req.user?.uid || null;
        session.items = (session.items || []).filter((item: any) => item.assignedTo === staffId);
      }
      res.json(session);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/stocktakes/items/:itemId/count", sensitiveRouteRateLimit, requireAuth, async (req, res) => {
    try {
      const sensitiveResponse = await enforceSensitiveAction(req, res, "stock_adjustment", {
        itemId: req.params.itemId,
        countedQuantity: Number(req.body?.countedQuantity),
      });
      if (sensitiveResponse) return;
      res.json(await submitStockTakeCount(req.params.tenantId, req.params.itemId, {
        countedQuantity: Number(req.body?.countedQuantity),
        note: req.body?.note || null,
        varianceReason: req.body?.varianceReason || null,
        requestId: req.requestId || null,
      }, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
        role: req.user?.role || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/stocktakes/items/:itemId/recount", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "stocktake.recount_request", "Manager access is required to request a recount.", {
          itemId: req.params.itemId,
        });
      }
      const sensitiveResponse = await enforceSensitiveAction(req, res, "manager_override", {
        itemId: req.params.itemId,
        action: "recount_request",
      });
      if (sensitiveResponse) return;
      res.json(await requestStockTakeRecount(req.params.tenantId, req.params.itemId, {
        note: req.body?.note || null,
        requestId: req.requestId || null,
      }, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
        role: req.user?.role || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/stocktakes/:sessionId/approve", sensitiveRouteRateLimit, requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "stocktake.approve", "Manager access is required to approve a stocktake.", {
          sessionId: req.params.sessionId,
        });
      }
      const sensitiveResponse = await enforceSensitiveAction(req, res, "manager_override", {
        sessionId: req.params.sessionId,
        action: "stocktake_approval",
      });
      if (sensitiveResponse) return;
      res.json(await approveStockTakeSession(req.params.tenantId, req.params.sessionId, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
        role: req.user?.role || null,
        requestId: req.requestId || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/customers", requireAuth, async (req, res) => {
    try {
      const customers = await getCustomersByTenant(req.params.tenantId);
      res.json(customers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/batch/customers/export", requireAuth, async (req, res) => {
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

  app.post("/api/mariadb/tenants/:tenantId/batch/customers/import", sensitiveRouteRateLimit, requireAuth, async (req, res) => {
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

  app.get("/api/mariadb/tenants/:tenantId/customers/campaign-export", requireAuth, async (req, res) => {
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

  app.get("/api/mariadb/tenants/:tenantId/customers/:id/consents", requireAuth, async (req, res) => {
    try {
      res.json(await listCustomerConsents(req.params.tenantId, req.params.id));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/customers/:id/data-export", requireAuth, async (req, res) => {
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

  app.put("/api/mariadb/tenants/:tenantId/customers/:id/consents", requireAuth, async (req, res) => {
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

  app.get("/api/mariadb/tenants/:tenantId/staff", requireAuth, async (req, res) => {
    try {
      const staff = await getStaffByTenant(req.params.tenantId);
      res.json(staff);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/workforce/shifts", requireAuth, async (req, res) => {
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
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/workforce/shifts", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.shifts.create", "Manager access is required to schedule shifts.");
      }
      res.json(await createStaffShift(req.params.tenantId, req.body || {}, auditActorFromRequest(req)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/workforce/shifts/:shiftId", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.shifts.update", "Manager access is required to edit shifts.");
      }
      res.json(await updateStaffShift(req.params.tenantId, req.params.shiftId, req.body || {}, auditActorFromRequest(req)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/workforce/shifts/:shiftId", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.shifts.cancel", "Manager access is required to cancel shifts.");
      }
      res.json(await cancelStaffShift(req.params.tenantId, req.params.shiftId, auditActorFromRequest(req)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/workforce/roster/publish", requireAuth, async (req, res) => {
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
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/workforce/timesheet-payroll", requireAuth, async (req, res) => {
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
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/workforce/staff-performance", requireAuth, async (req, res) => {
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
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/workforce/staff-performance/coaching-notes", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.staff_performance.coaching_note", "Manager access is required to add staff coaching notes.");
      }
      res.json(await addStaffCoachingNote(req.params.tenantId, req.body || {}, auditActorFromRequest(req)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/workforce/tip-pool-rules", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.tip_pool_rules.view", "Manager access is required to view tip pool rules.");
      }
      res.json(await listTipPoolRules(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/workforce/tip-pool-rules", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.tip_pool_rules.create", "Manager access is required to create tip pool rules.");
      }
      res.json(await createTipPoolRule(req.params.tenantId, req.body || {}, auditActorFromRequest(req)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/workforce/tip-pool-rules/:ruleId", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.tip_pool_rules.update", "Manager access is required to update tip pool rules.");
      }
      res.json(await updateTipPoolRule(req.params.tenantId, req.params.ruleId, req.body || {}, auditActorFromRequest(req)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/workforce/tip-pools/preview", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.tip_pool.preview", "Manager access is required to preview tip pool payouts.");
      }
      res.json(await previewTipPoolPayouts(req.params.tenantId, req.body || {}));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/workforce/tip-pools/generate", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.tip_pool.generate", "Manager access is required to generate tip pool payouts.");
      }
      res.json(await generateTipPoolPayouts(req.params.tenantId, req.body || {}, auditActorFromRequest(req)));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/workforce/tip-pool-payouts", requireAuth, async (req, res) => {
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
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/workforce/attendance/me", requireAuth, async (req, res) => {
    try {
      const actor = auditActorFromRequest(req);
      const requestedStaffId = req.query.staffId ? String(req.query.staffId) : actor.staffId;
      if (!requestedStaffId) return res.status(400).json({ error: "Staff member is required." });
      if (requestedStaffId !== actor.staffId && !canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.attendance.view", "Manager access is required to view another staff member's attendance.");
      }
      res.json(await getMyAttendanceStatus(req.params.tenantId, requestedStaffId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/workforce/clock-in", requireAuth, async (req, res) => {
    try {
      const actor = auditActorFromRequest(req);
      const requestedStaffId = req.body?.staffId || actor.staffId;
      if (requestedStaffId !== actor.staffId && !canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.clock_in", "Manager access is required to clock in another staff member.");
      }
      res.json(await clockIn(req.params.tenantId, { ...req.body, staffId: requestedStaffId }, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/workforce/break/start", requireAuth, async (req, res) => {
    try {
      const actor = auditActorFromRequest(req);
      const requestedStaffId = req.body?.staffId || actor.staffId;
      if (!requestedStaffId) return res.status(400).json({ error: "Staff member is required." });
      if (requestedStaffId !== actor.staffId && !canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.break_start", "Manager access is required to start another staff member's break.");
      }
      res.json(await startBreak(req.params.tenantId, requestedStaffId, req.body?.at || null));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/workforce/break/end", requireAuth, async (req, res) => {
    try {
      const actor = auditActorFromRequest(req);
      const requestedStaffId = req.body?.staffId || actor.staffId;
      if (!requestedStaffId) return res.status(400).json({ error: "Staff member is required." });
      if (requestedStaffId !== actor.staffId && !canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.break_end", "Manager access is required to end another staff member's break.");
      }
      res.json(await endBreak(req.params.tenantId, requestedStaffId, req.body?.at || null));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/workforce/clock-out", requireAuth, async (req, res) => {
    try {
      const actor = auditActorFromRequest(req);
      const requestedStaffId = req.body?.staffId || actor.staffId;
      if (!requestedStaffId) return res.status(400).json({ error: "Staff member is required." });
      if (requestedStaffId !== actor.staffId && !canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "workforce.clock_out", "Manager access is required to clock out another staff member.");
      }
      res.json(await clockOut(req.params.tenantId, { ...req.body, staffId: requestedStaffId }, actor));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/workstations", requireAuth, async (req, res) => {
    try {
      const workstations = await getWorkstationsByTenant(req.params.tenantId);
      res.json(workstations);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/hardware-devices", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "hardware.devices_view", "Manager access is required for hardware devices.");
      }
      res.json(await listHardwareDevices(req.params.tenantId, {
        deviceType: typeof req.query.deviceType === "string" ? req.query.deviceType : null,
        status: typeof req.query.status === "string" ? req.query.status : null,
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/hardware-devices", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "hardware.device_create", "Manager access is required for hardware devices.");
      }
      res.status(201).json(await createHardwareDevice(req.params.tenantId, req.body || {}, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/hardware-devices/:deviceId", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "hardware.device_update", "Manager access is required for hardware devices.");
      }
      const device = await updateHardwareDevice(req.params.tenantId, req.params.deviceId, req.body || {}, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      });
      if (!device) return res.status(404).json({ error: "Hardware device not found" });
      res.json(device);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/hardware-devices/:deviceId", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "hardware.device_delete", "Manager access is required for hardware devices.");
      }
      res.json(await deleteHardwareDevice(req.params.tenantId, req.params.deviceId, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/hardware-devices/:deviceId/test", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "hardware.device_test", "Manager access is required for hardware device tests.");
      }
      const result = await testHardwareDevice(req.params.tenantId, req.params.deviceId, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }, req.body || {});
      if (!result) return res.status(404).json({ error: "Hardware device not found" });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/hardware-events", requireAuth, async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "hardware.events_view", "Manager access is required for hardware events.");
      }
      res.json(await listHardwareDeviceEvents(req.params.tenantId, typeof req.query.limit === "string" ? req.query.limit : 50));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/sales", requireAuth, async (req, res) => {
    try {
      const data = await getActiveSalesByTenant(req.params.tenantId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/laybys", requireAuth, async (req, res) => {
    try {
      res.json(await listLaybyOrders(req.params.tenantId, req.query || {}));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/laybys", requireAuth, async (req, res) => {
    try {
      const order = await createLaybyOrder(req.params.tenantId, {
        ...req.body,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      });
      res.json(order);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/laybys/:laybyId", requireAuth, async (req, res) => {
    try {
      const order = await getLaybyOrderById(req.params.tenantId, req.params.laybyId);
      if (!order) {
        res.status(404).json({ error: "Lay-by not found" });
        return;
      }
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/laybys/:laybyId/payments", requireAuth, async (req, res) => {
    try {
      const order = await addLaybyPayment(req.params.tenantId, req.params.laybyId, {
        ...req.body,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      });
      res.json(order);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/laybys/:laybyId/complete", requireAuth, async (req, res) => {
    try {
      const order = await completeLaybyOrder(req.params.tenantId, req.params.laybyId, {
        ...req.body,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
        payment: req.body?.payment
          ? {
            ...req.body.payment,
            staffId: req.user?.staffId || req.user?.uid || null,
            staffName: req.user?.name || null,
          }
          : undefined,
      });
      const liveIo = realtimeIo();
      if (liveIo && order.completedSaleId) broadcastSalesUpdate(liveIo, req.params.tenantId, order.completedSaleId);
      res.json(order);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/laybys/:laybyId/cancel", requireAuth, async (req, res) => {
    try {
      const order = await cancelLaybyOrder(req.params.tenantId, req.params.laybyId, {
        ...req.body,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      });
      res.json(order);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/event-bookings", requireAuth, async (req, res) => {
    try {
      if (!canManageBookings(req.user?.role)) {
        return denyWithAudit(req, res, "event_bookings.view", "Manager access is required for event bookings.");
      }
      res.json(await listEventBookings(req.params.tenantId, {
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        eventType: typeof req.query.eventType === "string" ? req.query.eventType : undefined,
        reminderStatus: typeof req.query.reminderStatus === "string" ? req.query.reminderStatus : undefined,
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/event-bookings", requireAuth, async (req, res) => {
    try {
      if (!canManageBookings(req.user?.role)) {
        return denyWithAudit(req, res, "event_bookings.create", "Manager access is required to create event bookings.");
      }
      res.json(await createEventBooking(req.params.tenantId, {
        ...req.body,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/event-bookings/:id", requireAuth, async (req, res) => {
    try {
      if (!canManageBookings(req.user?.role)) {
        return denyWithAudit(req, res, "event_bookings.update", "Manager access is required to update event bookings.", {
          bookingId: req.params.id,
        });
      }
      res.json(await updateEventBooking(req.params.tenantId, req.params.id, {
        ...req.body,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/event-bookings/:id", requireAuth, async (req, res) => {
    try {
      if (!canManageBookings(req.user?.role)) {
        return denyWithAudit(req, res, "event_bookings.delete", "Manager access is required to delete event bookings.", {
          bookingId: req.params.id,
        });
      }
      res.json(await deleteEventBooking(req.params.tenantId, req.params.id, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/sales", sensitiveRouteRateLimit, requireAuth, validateSchema(SaleSchema), async (req, res) => {
    try {
      const saleInput = stripSensitiveVerification(req.body || {});
      const sensitiveAction = saleMutationSensitiveAction(saleInput);
      if (sensitiveAction) {
        const sensitiveResponse = await enforceSensitiveAction(req, res, sensitiveAction, {
          saleId: null,
          changedFields: auditChangedFields(saleInput),
        });
        if (sensitiveResponse) return;
      }

      const sale = await createSale(req.params.tenantId, saleInput);
      
      // Broadcast to workstations if order has workstation items
      const liveIo = realtimeIo();
      if (liveIo && sale.items && Array.isArray(sale.items)) {
        const hasWorkstationItems = sale.items.some((item: any) => item.workstationId);
        if (hasWorkstationItems) {
          broadcastSalesUpdate(liveIo, req.params.tenantId, sale.id);
        }
      }
      await sendWorkstationOrderPush(req.params.tenantId, sale);
      queueKitchenPrintJobsForSale(req.params.tenantId, sale, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }).catch(err => console.warn("Unable to queue kitchen print jobs:", err?.message || err));
      
      res.json(sale);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/sales/:saleId", requireAuth, async (req, res) => {
    try {
      const sale = await getSaleById(req.params.tenantId, req.params.saleId);
      if (!sale) {
        res.status(404).json({ error: "Sale not found" });
        return;
      }
      res.json(sale);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/sales/:saleId", sensitiveRouteRateLimit, requireAuth, async (req, res) => {
    try {
      const hasPayload = req.body && typeof req.body === "object" && Object.keys(req.body).length > 0;
      if (!hasPayload) {
        res.status(400).json({ error: "Missing sale updates" });
        return;
      }
      const saleUpdate = stripSensitiveVerification(req.body || {});
      const sensitiveAction = saleMutationSensitiveAction(saleUpdate);
      if (sensitiveAction) {
        const sensitiveResponse = await enforceSensitiveAction(req, res, sensitiveAction, {
          saleId: req.params.saleId,
          changedFields: auditChangedFields(saleUpdate),
        });
        if (sensitiveResponse) return;
      }

      const sale = await updateSale(req.params.tenantId, req.params.saleId, saleUpdate);
      const liveIo = realtimeIo();
      if (liveIo) broadcastSalesUpdate(liveIo, req.params.tenantId, sale.id);
      if ((saleUpdate as any)?.status === "kitchen") {
        await sendWorkstationOrderPush(req.params.tenantId, sale);
        queueKitchenPrintJobsForSale(req.params.tenantId, sale, {
          staffId: req.user?.staffId || req.user?.uid || null,
          staffName: req.user?.name || null,
        }).catch(err => console.warn("Unable to queue kitchen print jobs:", err?.message || err));
      }
      res.json(sale);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/sales/:saleId/payments/:paymentId/provider-status", sensitiveRouteRateLimit, requireAuth, validateSchema(PaymentProviderStatusSchema), async (req, res) => {
    try {
      if (!canUseActionCenter(req.user?.role)) {
        return denyWithAudit(req, res, "payment.provider_reconcile", "Manager access is required to reconcile provider payments.", {
          saleId: req.params.saleId,
          paymentId: req.params.paymentId,
        });
      }
      const sale = await updateSalePaymentProviderStatus(req.params.tenantId, req.params.saleId, req.params.paymentId, {
        ...req.body,
        staffId: req.user?.staffId || null,
        staffName: req.user?.name || null,
        requestId: req.requestId || null,
      });
      const liveIo = realtimeIo();
      if (liveIo) broadcastSalesUpdate(liveIo, req.params.tenantId, sale.id);
      res.json(sale);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/sales/:saleId/refund", sensitiveRouteRateLimit, requireAuth, validateSchema(SaleRefundSchema), async (req, res) => {
    try {
      const refundInput = stripSensitiveVerification(req.body || {});
      const role = String(req.user?.role || "").toLowerCase();
      if (!["admin", "manager", "dev"].includes(role)) {
        const task = await createManagerSaleApprovalRequest(req.params.tenantId, {
          kind: "refund",
          saleId: req.params.saleId,
          payload: {
            ...refundInput,
            staffId: (refundInput as any).staffId || req.user?.staffId || null,
            staffName: (refundInput as any).staffName || req.user?.name || null,
          },
          requestedBy: req.user?.staffId || req.user?.uid || (refundInput as any).staffId || null,
          requestedByName: req.user?.name || (refundInput as any).staffName || null,
        });
        res.status(202).json({
          approvalRequired: true,
          message: "Refund request sent to the manager Action Center.",
          task,
        });
        return;
      }

      const sensitiveResponse = await enforceSensitiveAction(req, res, "refund", {
        saleId: req.params.saleId,
        method: (refundInput as any).method || null,
        itemCount: Array.isArray((refundInput as any).items) ? (refundInput as any).items.length : 0,
      });
      if (sensitiveResponse) return;

      const refund = await processSaleRefund(req.params.tenantId, req.params.saleId, {
        ...refundInput,
        staffId: (refundInput as any).staffId || req.user?.staffId || null,
        staffName: (refundInput as any).staffName || req.user?.name || null,
        requestId: req.requestId || null,
      });
      const liveIo = realtimeIo();
      if (liveIo) broadcastSalesUpdate(liveIo, req.params.tenantId, refund.id);
      res.json(refund);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/sales/:saleId/void", sensitiveRouteRateLimit, requireAuth, validateSchema(SaleVoidSchema), async (req, res) => {
    try {
      const voidInput = stripSensitiveVerification(req.body || {});
      const role = String(req.user?.role || "").toLowerCase();
      if (!["admin", "manager", "dev"].includes(role)) {
        const task = await createManagerSaleApprovalRequest(req.params.tenantId, {
          kind: "void",
          saleId: req.params.saleId,
          payload: {
            ...voidInput,
            staffId: (voidInput as any).staffId || req.user?.staffId || null,
            staffName: (voidInput as any).staffName || req.user?.name || null,
          },
          requestedBy: req.user?.staffId || req.user?.uid || (voidInput as any).staffId || null,
          requestedByName: req.user?.name || (voidInput as any).staffName || null,
        });
        res.status(202).json({
          approvalRequired: true,
          message: "Void request sent to the manager Action Center.",
          task,
        });
        return;
      }

      const sensitiveResponse = await enforceSensitiveAction(req, res, "void", {
        saleId: req.params.saleId,
        restock: Boolean((voidInput as any).restock),
      });
      if (sensitiveResponse) return;

      const voided = await processSaleVoid(req.params.tenantId, req.params.saleId, {
        ...voidInput,
        staffId: (voidInput as any).staffId || req.user?.staffId || null,
        staffName: (voidInput as any).staffName || req.user?.name || null,
        requestId: req.requestId || null,
      });
      const liveIo = realtimeIo();
      if (liveIo) broadcastSalesUpdate(liveIo, req.params.tenantId, voided.id);
      res.json(voided);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/sales/:saleId/items/:itemId", requireAuth, async (req, res) => {
    try {
      await updateSaleItem(req.params.tenantId, req.params.saleId, req.params.itemId, req.body);
      const liveIo = realtimeIo();
      if (liveIo) broadcastSalesUpdate(liveIo, req.params.tenantId, req.params.saleId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/offline-sync/issues", requireAuth, async (req, res) => {
    try {
      const result = await recordOfflineSyncIssue(req.params.tenantId, req.body || {});
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

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

  app.get("/api/mariadb/tenants/:tenantId/messages", requireAuth, async (req, res) => {
    try {
      const { channel, limit } = req.query;
      let data;
      if (channel) {
        data = await getMessagesByChannel(req.params.tenantId, channel as string, limit ? parseInt(limit as string) : 100);
      } else {
        data = await getMessagesByTenant(req.params.tenantId, limit ? parseInt(limit as string) : 100);
      }
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/messages", requireAuth, async (req, res) => {
    try {
      const data = await createMessage(req.params.tenantId, req.body);
      const liveIo = realtimeIo();
      if (liveIo) {
        broadcastToMessages(liveIo, req.params.tenantId, {
          type: "new_message",
          message: data,
        });
      }
      if (req.body?.isSystemNotification || req.body?.isSystem || req.body?.senderRole === "workstation") {
        await sendPushNotification(req.params.tenantId, {
          title: req.body?.senderName ? `${req.body.senderName} notification` : "Staff notification",
          body: String(req.body?.text || "New staff notification"),
          url: "/messages",
          tag: `staff-message-${data.id}`,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          vibrate: [130, 70, 130],
          data: {
            type: "staff_message",
            messageId: data.id,
            channel: req.body?.channel || "general",
          },
          actions: [
            { action: "open-messages", title: "Open messages" },
          ],
        }, { urgency: "high", ttl: 300 }).catch((err) => {
          console.warn("Staff message push failed:", err?.message || err);
        });
      }
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/table-sections", requireAuth, async (req, res) => {
    try {
      const data = await getTableSectionsByTenant(req.params.tenantId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/table-sections", requireAuth, validateSchema(TableSectionSchema), async (req, res) => {
    try {
      const data = await createTableSection(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/table-sections/:id", requireAuth, validateSchema(TableSectionSchema), async (req, res) => {
    try {
      const data = await updateTableSection(req.params.tenantId, req.params.id, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/table-sections/:id", requireAuth, async (req, res) => {
    try {
      await deleteTableSection(req.params.tenantId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/restaurant-tables", requireAuth, async (req, res) => {
    try {
      const data = await getRestaurantTablesByTenant(req.params.tenantId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/restaurant-tables", requireAuth, validateSchema(RestaurantTableSchema), async (req, res) => {
    try {
      const data = await createRestaurantTable(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/restaurant-tables/:id", requireAuth, validateSchema(RestaurantTableSchema), async (req, res) => {
    try {
      const data = await updateRestaurantTable(req.params.tenantId, req.params.id, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/restaurant-tables/:id", requireAuth, async (req, res) => {
    try {
      await deleteRestaurantTable(req.params.tenantId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/messages/:id/read", requireAuth, async (req, res) => {
    try {
      await markMessageRead(req.params.tenantId, req.params.id, req.body.userId);
      res.json({ success: true });
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

  app.delete("/api/mariadb/tenants/:tenantId/products/:id", requireAuth, async (req, res) => {
    try {
      await deleteProduct(req.params.tenantId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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

  app.post("/api/mariadb/tenants/:tenantId/workstations", requireAuth, validateSchema(WorkstationSchema), async (req, res) => {
    try {
      const data = await createWorkstation(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/workstations/:id", requireAuth, async (req, res) => {
    try {
      await deleteWorkstation(req.params.tenantId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/companion-device-assignments", requireAuth, async (req, res) => {
    try {
      const rows = await query(
        `SELECT cda.id,
                cda.tenant_id AS tenantId,
                cda.device_id AS deviceId,
                cda.device_name AS deviceName,
                cda.workstation_id AS workstationId,
                w.name AS workstationName,
                w.type AS workstationType,
                cda.default_mode AS defaultMode,
                cda.assigned_by AS assignedBy,
                cda.created_at AS createdAt,
                cda.updated_at AS updatedAt
           FROM companion_device_assignments cda
           LEFT JOIN workstations w ON w.id = cda.workstation_id AND w.tenant_id = cda.tenant_id
          WHERE cda.tenant_id = ?
          ORDER BY cda.updated_at DESC`,
        [req.params.tenantId]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/companion-device-assignments/:deviceId", requireAuth, async (req, res) => {
    try {
      const rows = await query(
        `SELECT cda.id,
                cda.tenant_id AS tenantId,
                cda.device_id AS deviceId,
                cda.device_name AS deviceName,
                cda.workstation_id AS workstationId,
                w.name AS workstationName,
                w.type AS workstationType,
                cda.default_mode AS defaultMode,
                cda.assigned_by AS assignedBy,
                cda.created_at AS createdAt,
                cda.updated_at AS updatedAt
           FROM companion_device_assignments cda
           LEFT JOIN workstations w ON w.id = cda.workstation_id AND w.tenant_id = cda.tenant_id
          WHERE cda.tenant_id = ? AND cda.device_id = ?
          LIMIT 1`,
        [req.params.tenantId, req.params.deviceId]
      );
      res.json(rows[0] || null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/companion-device-assignments/:deviceId", requireAuth, async (req, res) => {
    try {
      if (!canManageCompanionDevices(req.user?.role)) {
        return denyWithAudit(req, res, "companion_device.assign", "Only admins and devs can assign companion devices", {
          deviceId: req.params.deviceId,
        });
      }

      const deviceId = String(req.params.deviceId || "").trim();
      const workstationId = String(req.body?.workstationId || "").trim();
      const deviceName = String(req.body?.deviceName || "Mobile device").trim().slice(0, 120);
      const defaultMode = ["wireless_scanner", "pole_display"].includes(req.body?.defaultMode)
        ? req.body.defaultMode
        : "wireless_scanner";
      if (!deviceId || !workstationId) {
        return res.status(400).json({ error: "Device and workstation are required" });
      }

      const workstationRows = await query(
        `SELECT id FROM workstations WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [req.params.tenantId, workstationId]
      );
      if (!workstationRows[0]) {
        return res.status(404).json({ error: "Workstation not found" });
      }

      const id = `cda_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (isPostgres()) {
        await query(
          `INSERT INTO companion_device_assignments
             (id, tenant_id, device_id, device_name, workstation_id, default_mode, assigned_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
           ON CONFLICT (tenant_id, device_id)
           DO UPDATE SET device_name = EXCLUDED.device_name,
                         workstation_id = EXCLUDED.workstation_id,
                         default_mode = EXCLUDED.default_mode,
                         assigned_by = EXCLUDED.assigned_by,
                         updated_at = NOW()`,
          [id, req.params.tenantId, deviceId, deviceName || "Mobile device", workstationId, defaultMode, req.user?.staffId || null]
        );
      } else {
        await query(
          `INSERT INTO companion_device_assignments
             (id, tenant_id, device_id, device_name, workstation_id, default_mode, assigned_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             device_name = VALUES(device_name),
             workstation_id = VALUES(workstation_id),
             default_mode = VALUES(default_mode),
             assigned_by = VALUES(assigned_by),
             updated_at = CURRENT_TIMESTAMP`,
          [id, req.params.tenantId, deviceId, deviceName || "Mobile device", workstationId, defaultMode, req.user?.staffId || null]
        );
      }

      const rows = await query(
        `SELECT cda.id,
                cda.tenant_id AS tenantId,
                cda.device_id AS deviceId,
                cda.device_name AS deviceName,
                cda.workstation_id AS workstationId,
                w.name AS workstationName,
                w.type AS workstationType,
                cda.default_mode AS defaultMode,
                cda.assigned_by AS assignedBy,
                cda.created_at AS createdAt,
                cda.updated_at AS updatedAt
           FROM companion_device_assignments cda
           LEFT JOIN workstations w ON w.id = cda.workstation_id AND w.tenant_id = cda.tenant_id
          WHERE cda.tenant_id = ? AND cda.device_id = ?
          LIMIT 1`,
        [req.params.tenantId, deviceId]
      );
      await auditRouteEvent(req, "settings.companion_device_assigned", "companion_device_assignment", {
        deviceId,
        deviceName: deviceName || "Mobile device",
        workstationId,
        defaultMode,
      }, rows[0]?.id || deviceId, "device_admin");
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/companion-device-assignments/:deviceId", requireAuth, async (req, res) => {
    try {
      if (!canManageCompanionDevices(req.user?.role)) {
        return denyWithAudit(req, res, "companion_device.revoke", "Only admins and devs can revoke companion device assignments", {
          deviceId: req.params.deviceId,
        });
      }
      await query(
        `DELETE FROM companion_device_assignments WHERE tenant_id = ? AND device_id = ?`,
        [req.params.tenantId, req.params.deviceId]
      );
      await auditRouteEvent(req, "settings.companion_device_revoked", "companion_device_assignment", {
        deviceId: req.params.deviceId,
      }, req.params.deviceId, "device_admin");
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/sales", requireAuth, async (req, res) => {
    try {
      await clearAllSales(req.params.tenantId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/customer-payout-requests", requireAuth, async (req, res) => {
    try {
      const data = await createCustomerPayoutRequest(req.params.tenantId, req.body);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/cash-sessions", optionalAuth, async (req, res) => {
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/cash-sessions/:id/movements", requireAuth, async (req, res) => {
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/manager-cash/summary", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.summary_view", "Only managers and admins can view the manager float.");
      }
      res.json(await getManagerCashSummary(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/manager-cash/movements", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.movements_view", "Only managers and admins can view manager cash movements.");
      }
      res.json(await getManagerCashMovements(req.params.tenantId, {
        limit: typeof req.query.limit === "string" ? req.query.limit : 40,
        movementType: typeof req.query.movementType === "string" ? req.query.movementType : null,
        direction: typeof req.query.direction === "string" ? req.query.direction : null,
        cashSource: typeof req.query.cashSource === "string" ? req.query.cashSource : null,
        sourceType: typeof req.query.sourceType === "string" ? req.query.sourceType : null,
        staffId: typeof req.query.staffId === "string" ? req.query.staffId : null,
        customerId: typeof req.query.customerId === "string" ? req.query.customerId : null,
        from: typeof req.query.from === "string" ? req.query.from : null,
        to: typeof req.query.to === "string" ? req.query.to : null,
        search: typeof req.query.search === "string" ? req.query.search : null,
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/manager-cash/movements/export", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.movements_export", "Only managers and admins can export manager cash movements.");
      }
      res.json(await exportManagerCashMovementsCsv(req.params.tenantId, {
        limit: typeof req.query.limit === "string" ? req.query.limit : 500,
        movementType: typeof req.query.movementType === "string" ? req.query.movementType : null,
        direction: typeof req.query.direction === "string" ? req.query.direction : null,
        cashSource: typeof req.query.cashSource === "string" ? req.query.cashSource : null,
        sourceType: typeof req.query.sourceType === "string" ? req.query.sourceType : null,
        staffId: typeof req.query.staffId === "string" ? req.query.staffId : null,
        customerId: typeof req.query.customerId === "string" ? req.query.customerId : null,
        from: typeof req.query.from === "string" ? req.query.from : null,
        to: typeof req.query.to === "string" ? req.query.to : null,
        search: typeof req.query.search === "string" ? req.query.search : null,
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/manager-cash/movements", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.movement_create", "Only managers and admins can record manager cash movements.");
      }
      const movementInput = stripSensitiveVerification(req.body || {});
      const sensitiveResponse = await enforceSensitiveAction(req, res, "cash_movement", {
        movementType: (movementInput as any)?.movementType || null,
        direction: (movementInput as any)?.direction || null,
        amount: (movementInput as any)?.amount || 0,
      });
      if (sensitiveResponse) return;

      const movement = await recordManagerCashMovement(req.params.tenantId, movementInput || {}, {
        staffId: req.user?.staffId,
        staffName: req.user?.name,
        role: req.user?.role,
      });
      res.status(201).json(movement);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/manager-cash/transfers", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.transfers_view", "Only managers and admins can view cash custody transfers.");
      }
      res.json(await getCashCustodyTransfers(
        req.params.tenantId,
        typeof req.query.status === "string" ? req.query.status : null,
        Number(req.query.limit || 25)
      ));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/manager-cash/transfers", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.transfer_request", "Only managers and admins can request cash custody transfers.");
      }
      const transfer = await createCashCustodyTransfer(req.params.tenantId, req.body || {}, {
        staffId: req.user?.staffId,
        staffName: req.user?.name,
        role: req.user?.role,
      });
      res.status(201).json(transfer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/manager-cash/transfers/:transferId/confirm", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.transfer_confirm", "Only managers and admins can confirm cash custody transfers.", {
          transferId: req.params.transferId,
        });
      }
      const transfer = await confirmCashCustodyTransfer(req.params.tenantId, req.params.transferId, req.body || {}, {
        staffId: req.user?.staffId,
        staffName: req.user?.name,
        role: req.user?.role,
      });
      res.json(transfer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/manager-cash/transfers/:transferId/cancel", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.transfer_cancel", "Only managers and admins can cancel cash custody transfers.", {
          transferId: req.params.transferId,
        });
      }
      const result = await cancelCashCustodyTransfer(req.params.tenantId, req.params.transferId, req.body || {}, {
        staffId: req.user?.staffId,
        staffName: req.user?.name,
        role: req.user?.role,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/manager-cash/close/preview", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.close_preview", "Only managers and admins can preview end-of-day cash close.");
      }
      res.json(await getCashClosePreview(
        req.params.tenantId,
        typeof req.query.businessDate === "string" ? req.query.businessDate : null
      ));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/manager-cash/close", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.close_view", "Only managers and admins can view end-of-day cash close records.");
      }
      res.json(await getCashCloseCheckpoints(req.params.tenantId, Number(req.query.limit || 20)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/manager-cash/close", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.close_create", "Only managers and admins can create end-of-day cash close checkpoints.");
      }
      const checkpoint = await createCashCloseCheckpoint(req.params.tenantId, req.body || {}, {
        staffId: req.user?.staffId,
        staffName: req.user?.name,
        role: req.user?.role,
      });
      res.status(201).json(checkpoint);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/manager-cash/close/:checkpointId/export", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.close_export", "Only managers and admins can export end-of-day cash close records.", {
          checkpointId: req.params.checkpointId,
        });
      }
      res.json(await exportCashCloseCheckpointCsv(req.params.tenantId, req.params.checkpointId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/manager-cash/wallet-cash", requireAuth, async (req, res) => {
    try {
      if (!canManageCash(req.user?.role)) {
        return denyWithAudit(req, res, "manager_cash.wallet_cash_reconcile", "Only managers and admins can reconcile wallet cash.");
      }
      const walletInput = stripSensitiveVerification(req.body || {});
      const sensitiveResponse = await enforceSensitiveAction(req, res, "wallet_adjustment", {
        ownerType: (walletInput as any)?.ownerType || null,
        ownerId: (walletInput as any)?.ownerId || null,
        movementType: (walletInput as any)?.movementType || null,
        amount: (walletInput as any)?.amount || 0,
      });
      if (sensitiveResponse) return;

      const result = await recordWalletCashMovement(req.params.tenantId, walletInput || {}, {
        staffId: req.user?.staffId,
        staffName: req.user?.name,
        role: req.user?.role,
        requestId: req.requestId || null,
      });
      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/cash-sessions/:id/wallet-cash", requireAuth, async (req, res) => {
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/cash-sessions", requireAuth, async (req, res) => {
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
      // staffId/staffName are derived from the JWT — never trust the body
      // here, otherwise a cashier could open a register "as" another staff
      // member and the audit trail would be falsified.
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/cash-sessions/:id/movements", requireAuth, async (req, res) => {
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/cash-sessions/:id", requireAuth, async (req, res) => {
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
      // tipsDelta flows into staff.wallet_balance indirectly; it must be
      // positive-only. A negative or non-numeric value is rejected.
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
        // The server-computed walletTipsDelta is always non-negative
        // (Math.max(0, recordedTips + Math.min(0, difference))), and
        // the client-supplied tipsDelta is now positive-only-validated
        // above. Both feed into staff.wallet_balance, so any wallet
        // credit must be authorised via a recent password/PIN check.
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/cash-sessions/:id/review", requireAuth, async (req, res) => {
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/payout-requests", requireAuth, async (req, res) => {
    try {
      const requests = await getPayoutRequestsByTenant(req.params.tenantId);
      res.json(requests);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/customer-payout-requests", requireAuth, async (req, res) => {
    try {
      const requests = await getCustomerPayoutRequestsByTenant(req.params.tenantId);
      res.json(requests);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/payout-requests", requireAuth, async (req, res) => {
    try {
      const request = await createPayoutRequest(req.params.tenantId, req.body);
      res.json(request);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/payout-requests/:id", requireAuth, async (req, res) => {
    try {
      const request = await updatePayoutRequest(req.params.tenantId, req.params.id, req.body);
      res.json(request);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/customer-payout-requests/:id", requireAuth, async (req, res) => {
    try {
      const request = await updateCustomerPayoutRequest(req.params.tenantId, req.params.id, req.body);
      res.json(request);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Bulk Items & Inventory Expansion
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/mariadb/tenants/:tenantId/vendors", requireAuth, async (req, res) => {
    try {
      res.json(await getVendors(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/vendors", requireAuth, async (req, res) => {
    try {
      res.json(await createVendor(req.params.tenantId, req.body || {}));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/vendors/:id", requireAuth, async (req, res) => {
    try {
      await updateVendor(req.params.tenantId, req.params.id, req.body || {});
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/purchase-orders", requireAuth, async (req, res) => {
    try {
      res.json(await getPurchaseOrders(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/stock-batches", requireAuth, async (req, res) => {
    try {
      res.json(await getStockBatches(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/stock-reports/valuation", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "stock_report.valuation_export", "Manager access is required for stock valuation reports.");
      }
      const report = await getStockValuationReport(req.params.tenantId, req.query);
      await auditRouteEvent(req, "stock_report.valuation_exported", "stock_report", {
        rowCount: report.productRows.length + report.batchRows.length + report.receivingRows.length,
        receivedValue: report.summary.receivedValue,
        productBookValue: report.summary.productBookValue,
        filters: req.query || {},
      }, null, "inventory");
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/reorder-recommendations", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "reorder_recommendations.view", "Manager access is required for reorder recommendations.");
      }
      res.json(await listReorderRecommendations(req.params.tenantId, {
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        limit: typeof req.query.limit === "string" ? req.query.limit : undefined,
      }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/reorder-recommendations/refresh", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "reorder_recommendations.refresh", "Manager access is required to refresh reorder recommendations.");
      }
      res.json(await refreshReorderRecommendations(req.params.tenantId, {
        daysOfCover: req.body?.daysOfCover,
        vendorId: req.body?.vendorId || null,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/reorder-notification-rules", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "reorder_notification_rules.view", "Manager access is required for reorder notification rules.");
      }
      res.json(await listReorderNotificationRules(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/reorder-notification-rules", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "reorder_notification_rules.create", "Manager access is required to create reorder notification rules.");
      }
      res.json(await createReorderNotificationRule(req.params.tenantId, {
        ...req.body,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/reorder-notification-rules/:id", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "reorder_notification_rules.update", "Manager access is required to update reorder notification rules.", {
          ruleId: req.params.id,
        });
      }
      res.json(await updateReorderNotificationRule(req.params.tenantId, req.params.id, {
        ...req.body,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/reorder-notification-rules/:id/run", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "reorder_notification_rules.run", "Manager access is required to run reorder notification rules.", {
          ruleId: req.params.id,
        });
      }
      res.json(await runReorderNotificationRule(req.params.tenantId, req.params.id, {
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/reorder-recommendations/:id/approve", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "reorder_recommendations.approve", "Manager access is required to approve reorder recommendations.", {
          recommendationId: req.params.id,
        });
      }
      res.json(await approveReorderRecommendation(req.params.tenantId, req.params.id, {
        ...req.body,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/reorder-recommendations/:id/dismiss", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "reorder_recommendations.dismiss", "Manager access is required to dismiss reorder recommendations.", {
          recommendationId: req.params.id,
        });
      }
      res.json(await dismissReorderRecommendation(req.params.tenantId, req.params.id, {
        note: req.body?.note || null,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
      }));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/purchase-orders", requireAuth, async (req, res) => {
    try {
      res.json(await createPurchaseOrder(req.params.tenantId, req.body || {}));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/purchase-orders/:id", requireAuth, async (req, res) => {
    try {
      if (req.body?.status === "received") {
        if (!canManageInventory(req.user?.role)) {
          return denyWithAudit(req, res, "purchase_order.receive", "Only managers can receive purchase orders.", {
            purchaseOrderId: req.params.id,
          });
        }
        const actor = auditActorFromRequest(req);
        const received = await receivePurchaseOrder(req.params.tenantId, req.params.id, req.body || {}, actor);
        res.json(received);
        return;
      }
      await updatePurchaseOrder(req.params.tenantId, req.params.id, req.body || {});
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/purchase-orders/:id/receive", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "purchase_order.receive", "Only managers can receive purchase orders.", {
          purchaseOrderId: req.params.id,
        });
      }
      const actor = auditActorFromRequest(req);
      const received = await receivePurchaseOrder(req.params.tenantId, req.params.id, req.body || {}, actor);
      res.json(received);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/bulk-items", requireAuth, async (req, res) => {
    try {
      const items = await getBulkItems(req.params.tenantId);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mariadb/tenants/:tenantId/bulk-items", requireAuth, async (req, res) => {
    try {
      const item = await createBulkItem(req.params.tenantId, req.body);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/mariadb/tenants/:tenantId/bulk-items/:id", requireAuth, async (req, res) => {
    try {
      await updateBulkItem(req.params.tenantId, req.params.id, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mariadb/tenants/:tenantId/bulk-items/:id", requireAuth, async (req, res) => {
    try {
      await deleteBulkItem(req.params.tenantId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/mariadb/tenants/:tenantId/recipe-costing-report", requireAuth, async (req, res) => {
    try {
      if (!canManageInventory(req.user?.role)) {
        return denyWithAudit(req, res, "recipe_costing_report.view", "Manager access is required for recipe costing reports.");
      }
      res.json(await getRecipeCostingReport(req.params.tenantId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

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

  app.post("/api/payfast/generate", requireAuth, async (req, res) => {
    try {
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ error: "Valid amount is required" });
        return;
      }

      const config = await getAppConfig(req.user!.tenantId);
      if (!config.merchant_id || !config.merchant_key) {
        res.status(400).json({ error: "PayFast credentials are not configured" });
        return;
      }

      const publicBaseUrl = getPublicBaseUrl(req);
      const fields: Record<string, string> = {
        merchant_id: String(config.merchant_id),
        merchant_key: String(config.merchant_key),
        amount: amount.toFixed(2),
        item_name: safePayFastText(req.body?.item_name || req.body?.itemName, "MasePOS Purchase"),
      };

      const saleId = safePayFastText(req.body?.sale_id || req.body?.saleId, "", 64);
      if (saleId) fields.m_payment_id = saleId;
      if (req.body?.return_url) fields.return_url = String(req.body.return_url);
      if (req.body?.cancel_url) fields.cancel_url = String(req.body.cancel_url);
      if (publicBaseUrl) fields.notify_url = `${publicBaseUrl}/api/payfast/notify`;

      fields.signature = generatePayFastSignature(fields, config.passphrase);
      res.json({
        url: config.sandbox ? "https://sandbox.payfast.co.za/eng/process" : "https://www.payfast.co.za/eng/process",
        fields,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/payfast/notify", sensitiveRouteRateLimit, async (req, res) => {
    try {
      const { m_payment_id, pf_payment_id, payment_status, signature, ...otherData } = req.body;
      const calculatedSignature = generatePayFastSignature({ m_payment_id, pf_payment_id, payment_status, ...otherData }, PAYFAST_PASSPHRASE);

      if (signature !== calculatedSignature) {
        console.warn("Invalid PayFast signature");
        return res.status(400).send("Invalid signature");
      }

      if (payment_status === "COMPLETE") {
        console.log("Payment completed:", pf_payment_id);
      }

      res.status(200).send("OK");
    } catch (err: any) {
      console.error("PayFast webhook error:", err);
      res.status(500).send("Internal Server Error");
    }
  });

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
    console.error("Server error:", err.message);
    
    if (res.headersSent) {
      return next(err);
    }
    
    res.status(500).json({
      error: isProduction ? "Internal server error" : err.message,
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
