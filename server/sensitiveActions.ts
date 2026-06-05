import bcrypt from "bcryptjs";
import type { Request } from "express";
import { query } from "./db.js";
import { recordAuditEventSafe } from "./audit.js";

export const SENSITIVE_ACTION_TYPES = [
  "refund",
  "void",
  "no_sale",
  "cash_movement",
  "manual_discount",
  "manager_override",
  "account_balance_edit",
  "wallet_adjustment",
  "stock_adjustment",
  "settings_change",
] as const;

export type SensitiveActionType = typeof SENSITIVE_ACTION_TYPES[number];

type SensitiveVerificationInput = {
  actionType?: string | null;
  password?: string | null;
  pin?: string | null;
  reason?: string | null;
};

type SensitiveActionResult =
  | { ok: true; actionType: SensitiveActionType; staffId: string | null; staffName: string | null }
  | {
      ok: false;
      status: 401 | 403 | 428;
      actionType: SensitiveActionType;
      actionLabel: string;
      message: string;
    };

const actionTypeSet = new Set<string>(SENSITIVE_ACTION_TYPES);

const actionLabels: Record<SensitiveActionType, string> = {
  refund: "process a refund",
  void: "void a sale",
  no_sale: "open the cash drawer",
  cash_movement: "record a cash movement",
  manual_discount: "change a manual discount",
  manager_override: "approve a manager override",
  account_balance_edit: "edit an account balance",
  wallet_adjustment: "adjust a wallet balance",
  stock_adjustment: "adjust stock",
  settings_change: "change settings",
};

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeActionType(value: SensitiveActionType | string): SensitiveActionType {
  const normalized = String(value || "").trim();
  if (actionTypeSet.has(normalized)) return normalized as SensitiveActionType;
  return "manager_override";
}

function getHeader(req: Request, name: string) {
  const getter = req.get || (req as any).header;
  if (typeof getter !== "function") return null;
  return getter.call(req, name);
}

function extractVerification(req: Request): SensitiveVerificationInput {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const nested = (body as any).sensitiveVerification && typeof (body as any).sensitiveVerification === "object"
    ? (body as any).sensitiveVerification
    : {};

  return {
    actionType: cleanText(nested.actionType ?? (body as any).sensitiveActionType),
    password: cleanText(nested.password ?? (body as any).sensitiveActionPassword ?? getHeader(req, "x-sensitive-action-password")),
    pin: cleanText(nested.pin ?? (body as any).sensitiveActionPin ?? getHeader(req, "x-sensitive-action-pin")),
    reason: cleanText(nested.reason ?? (body as any).sensitiveActionReason),
  };
}

function auditDetails(req: Request, actionType: SensitiveActionType, details: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    actionType,
    method: req.method,
    route: req.originalUrl || req.url,
    actorRole: req.user?.role || null,
    ...details,
    ...extra,
  };
}

async function compareCredential(value: string | null | undefined, hash: string | null | undefined) {
  if (!value || !hash) return false;
  try {
    return await bcrypt.compare(value, hash);
  } catch {
    return false;
  }
}

export function stripSensitiveVerification<T extends Record<string, any> | null | undefined>(body: T): T {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const copy = { ...(body as Record<string, any>) };
  delete copy.sensitiveVerification;
  delete copy.sensitiveActionToken;
  delete copy.sensitiveActionType;
  delete copy.sensitiveActionPassword;
  delete copy.sensitiveActionPin;
  delete copy.sensitiveActionReason;
  return copy as T;
}

export async function verifySensitiveActionForRequest(
  req: Request,
  requestedActionType: SensitiveActionType | string,
  details: Record<string, unknown> = {}
): Promise<SensitiveActionResult> {
  const actionType = normalizeActionType(requestedActionType);
  const actionLabel = actionLabels[actionType];
  const tenantId = req.params?.tenantId || req.user?.tenantId || null;
  const actorId = req.user?.staffId || req.user?.uid || null;
  const actorName = req.user?.name || null;
  const verification = extractVerification(req);

  if (!tenantId || !actorId) {
    return {
      ok: false,
      status: 401,
      actionType,
      actionLabel,
      message: "Sign in again before completing this sensitive action.",
    };
  }

  if (!verification.password && !verification.pin) {
    return {
      ok: false,
      status: 428,
      actionType,
      actionLabel,
      message: `Re-enter your password or PIN to ${actionLabel}.`,
    };
  }

  const staffRows = await query<any>(
    `SELECT id, name, password_hash AS passwordHash, security_pin_hash AS securityPinHash
       FROM staff
      WHERE tenant_id = ? AND id = ? AND status = 'active'
      LIMIT 1`,
    [tenantId, actorId]
  );
  const staff = staffRows[0];
  const passwordHash = staff?.passwordHash ?? staff?.password_hash ?? null;
  const pinHash = staff?.securityPinHash ?? staff?.security_pin_hash ?? null;

  const pinMatches = await compareCredential(verification.pin, pinHash);
  const passwordMatches = !pinMatches && await compareCredential(verification.password, passwordHash);

  if (!staff || (!pinMatches && !passwordMatches)) {
    await recordAuditEventSafe({
      tenantId,
      action: "sensitive_action.failed",
      entityType: "security",
      entityId: actorId,
      staffId: actorId,
      staffName: actorName,
      source: "sensitive_action",
      details: auditDetails(req, actionType, details, {
        reason: verification.reason || null,
        credentialMode: verification.pin ? "pin_or_password" : "password",
      }),
    });
    return {
      ok: false,
      status: 403,
      actionType,
      actionLabel,
      message: "Sensitive action verification failed.",
    };
  }

  await recordAuditEventSafe({
    tenantId,
    action: "sensitive_action.verified",
    entityType: "security",
    entityId: actorId,
    staffId: actorId,
    staffName: staff.name || actorName,
    source: "sensitive_action",
    details: auditDetails(req, actionType, details, {
      reason: verification.reason || null,
      credentialMode: pinMatches ? "pin" : "password",
    }),
  });

  return {
    ok: true,
    actionType,
    staffId: actorId,
    staffName: staff.name || actorName,
  };
}
