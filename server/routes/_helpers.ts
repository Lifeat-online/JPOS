/**
 * Shared route helpers extracted from app.ts.
 * Keeps role checks, audit wrappers, and sensitive-action enforcement
 * in one place so every router imports from here instead of duplicating.
 */
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { recordAuditEventSafe } from "../audit.js";
import { verifySensitiveActionForRequest, type SensitiveActionType } from "../sensitiveActions.js";
import { query } from "../db.js";

// ── Role helpers ─────────────────────────────────────────────────────────────

export function normalizeRole(role: unknown) {
  return String(role || "").toLowerCase();
}

export function canManageCash(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "manager" || r === "dev";
}

export function canManagePush(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "manager" || r === "dev";
}

export function canUseActionCenter(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "manager" || r === "dev";
}

export function canManageInventory(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "manager" || r === "dev";
}

export function canManageBookings(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "manager" || r === "dev";
}

export function canGenerateVapidKeys(role: unknown) {
  return normalizeRole(role) === "dev";
}

export function canUseDevMaintenance(role: unknown) {
  const r = normalizeRole(role);
  return r === "dev" || r === "admin";
}

export function canManageAi(role: unknown) {
  const r = normalizeRole(role);
  return r === "admin" || r === "manager" || r === "dev";
}

// ── Middleware ────────────────────────────────────────────────────────────────

export function requireDevMaintenance(req: Request, res: Response, next: NextFunction) {
  if (canUseDevMaintenance(req.user?.role)) return next();
  return res.status(403).json({ error: "Dev or admin access is required for database maintenance." });
}

// Manager/admin/dev gate for privileged mutations (staff management, seeding,
// demo-data). Blocks cashier/chef tokens from privileged operations.
export function requireManagerRole(req: Request, res: Response, next: NextFunction) {
  const r = normalizeRole(req.user?.role);
  if (r === "admin" || r === "manager" || r === "dev") return next();
  return denyWithAudit(req, res, "authz.insufficient_role", "Manager or admin access is required.", {
    requiredRole: "manager|admin|dev",
  });
}

// Managers and above always pass; other staff need the permission granted on
// their staff profile (staff.permissions JSON), matching the client's views.
export function requireStaffPermission(permission: string, action: string, message: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (canManageInventory(req.user?.role)) return next();
      const staffId = req.user?.staffId || req.user?.uid;
      const rows = staffId
        ? await query<any>(`SELECT permissions FROM staff WHERE tenant_id = $1 AND id = $2 AND status = 'active' LIMIT 1`, [req.user?.tenantId, staffId])
        : [];
      let permissions: Record<string, unknown> = {};
      try {
        permissions = typeof rows[0]?.permissions === "string" ? JSON.parse(rows[0].permissions) : rows[0]?.permissions || {};
      } catch {
        permissions = {};
      }
      if (permissions[permission] === true) return next();
      return denyWithAudit(req, res, action, message, { requiredPermission: permission });
    } catch (err) {
      next(err);
    }
  };
}

// ── Staff role hierarchy ─────────────────────────────────────────────────
// "dev" is platform-level and is never granted through the tenant API; only
// admins grant "admin". Staff can only manage people at or below their rank.

const STAFF_ROLE_RANK: Record<string, number> = { cashier: 1, chef: 1, manager: 2, admin: 3, dev: 4 };

export function staffRoleRank(role: unknown) {
  return STAFF_ROLE_RANK[normalizeRole(role)] || 0;
}

export function assignableStaffRoles(actorRole: unknown): string[] {
  const r = normalizeRole(actorRole);
  if (r === "dev" || r === "admin") return ["admin", "manager", "cashier", "chef"];
  if (r === "manager") return ["manager", "cashier", "chef"];
  return [];
}

export function requireTenantRouteAccess(req: Request, res: Response, next: NextFunction) {
  const routeTenantId = String(req.params.tenantId || "").trim();
  const tokenTenantId = String(req.user?.tenantId || "").trim();
  if (!routeTenantId || (tokenTenantId && routeTenantId === tokenTenantId)) return next();
  return denyWithAudit(req, res, "tenant.cross_access", "This user cannot access the requested tenant.", {
    routeTenantId,
    tokenTenantId,
  });
}

// ── Actor / audit helpers ─────────────────────────────────────────────────────

export function auditActorFromRequest(req: Request) {
  return {
    staffId: req.user?.staffId || req.user?.uid || null,
    staffName: req.user?.name || null,
    role: req.user?.role || null,
  };
}

export function tenantIdFromRequest(req: Request) {
  return (req.params?.tenantId as string) || req.user?.tenantId || null;
}

export function auditChangedFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const sensitive = new Set([
    "password", "passwordHash", "password_hash", "apiKey", "api_key",
    "accessToken", "refreshToken", "token", "payfastMerchantKey",
    "payfastPassphrase", "payfast_merchant_key", "payfast_passphrase",
    "merchant_key", "passphrase",
  ]);
  return Object.keys(value as Record<string, unknown>)
    .filter((key) => !sensitive.has(key))
    .sort();
}

export function integrationSecretFromRequest(req: Request) {
  const direct = req.get("x-jimmy-integration-key") || req.get("x-jpos-integration-key");
  if (direct) return direct.trim();
  const authorization = req.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  return bearer?.[1]?.trim() || "";
}

export async function auditRouteEvent(
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
    details: {
      method: req.method,
      route: req.originalUrl || req.url,
      ip: req.ip || req.socket?.remoteAddress || null,
      userAgent: req.get?.("user-agent") || null,
      actorRole: actor.role,
      ...details,
    },
  });
}

export function denyWithAudit(
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

export async function enforceSensitiveAction(
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

// ── Sensitive-action classifiers ──────────────────────────────────────────────

export function hasOwn(body: unknown, key: string) {
  return Boolean(body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, key));
}

export function customerSensitiveAction(updates: Record<string, unknown>): SensitiveActionType | null {
  if (hasOwn(updates, "walletBalance")) return "wallet_adjustment";
  if (hasOwn(updates, "accountBalance") || hasOwn(updates, "accountBalanceDelta") || hasOwn(updates, "accountLimit")) return "account_balance_edit";
  if (hasOwn(updates, "discountPercent")) return "manual_discount";
  return null;
}

export function staffSensitiveAction(updates: Record<string, unknown>): SensitiveActionType | null {
  if (hasOwn(updates, "walletBalance") || hasOwn(updates, "walletBalanceDelta")) return "wallet_adjustment";
  if (hasOwn(updates, "discountPercent")) return "manual_discount";
  return null;
}

export function saleMutationSensitiveAction(updates: Record<string, unknown>): SensitiveActionType | null {
  if (hasOwn(updates, "manualDiscountAmount") || hasOwn(updates, "manualDiscountReason")) return "manual_discount";
  if (hasOwn(updates, "accountBalanceDelta")) return "account_balance_edit";
  return null;
}

export function drawerMovementSensitiveAction(movementType: string): SensitiveActionType | null {
  if (movementType === "no_sale") return "no_sale";
  if (["cash_drop", "cash_added", "cash_removed", "manager_adjustment"].includes(movementType)) return "cash_movement";
  return null;
}

// ── Rate limiters ─────────────────────────────────────────────────────────
// Module-level singletons — initialized once, shared across all routers.

function parsePositiveEnvInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function makeRateLimit(windowMs: number, max: number) {
  const attempts = new Map<string, { count: number; resetTime: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.AUTH_RATE_LIMIT_DISABLED === "true") return next();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const record = attempts.get(ip);
    if (!record || now > record.resetTime) {
      attempts.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }
    record.count++;
    if (record.count > max) {
      res.setHeader("Retry-After", Math.ceil((record.resetTime - now) / 1000));
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    next();
  };
}

const isProduction = process.env.NODE_ENV === "production";

export const sensitiveRouteRateLimit = makeRateLimit(
  parsePositiveEnvInt(process.env.SENSITIVE_ROUTE_RATE_LIMIT_WINDOW_MS, 60_000),
  parsePositiveEnvInt(process.env.SENSITIVE_ROUTE_RATE_LIMIT_MAX, isProduction ? 30 : 300)
);

export const authRateLimit = makeRateLimit(
  parsePositiveEnvInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60_000),
  parsePositiveEnvInt(process.env.AUTH_RATE_LIMIT_MAX, isProduction ? 5 : 200)
);

export const integrationWebhookRateLimit = makeRateLimit(
  parsePositiveEnvInt(process.env.INTEGRATION_WEBHOOK_RATE_LIMIT_WINDOW_MS, 60_000),
  parsePositiveEnvInt(process.env.INTEGRATION_WEBHOOK_RATE_LIMIT_MAX, isProduction ? 120 : 500)
);

export function safeJsonField(value: unknown, fallback: any) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function stripSensitiveVerification<T extends Record<string, unknown>>(body: T): Omit<T, "sensitiveVerification" | "sensitiveActionToken"> {
  const { sensitiveVerification: _sv, sensitiveActionToken: _sat, ...rest } = body as any;
  return rest;
}

export function createTenantLocalSyncSecret(
  tenantId: string,
  enabled: boolean,
  secretSeed = process.env.LOCAL_SYNC_SECRET || process.env.LICENCE_SECRET || process.env.ADMIN_API_KEY || ""
) {
  if (!enabled || !secretSeed.trim()) return null;
  return crypto.createHmac("sha256", secretSeed).update(`masepos-local-sync:${tenantId}`).digest("base64url");
}

export function parseImageDataUrl(dataUrl: unknown) {
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
