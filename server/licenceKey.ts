import crypto from "crypto";

export type LicenceFeature =
  | "jpos_branding"
  | "own_logo"
  | "images"
  | "ai"
  | "analytics"
  | "local_server_sync"
  | "api_access"
  | "multi_location"
  | "full_branding"
  | "priority_support"
  | "updates";

export type LicenceTier = "free" | "starter" | "business" | "whitelabel";

export interface LicencePayload {
  licenceId: string;
  tenantName: string;
  maxRegisters: number;
  features: LicenceFeature[];
  issuedAt: number;
  expiresAt: number | null;
  tier: LicenceTier;
}

export interface LicenceValidationResult {
  valid: boolean;
  payload?: LicencePayload;
  error?: string;
}

const KEY_PREFIX = "JPOS-";

export function generateLicenceKey(payload: LicencePayload, secret: string): string {
  assertSecret(secret);
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(payloadBase64, secret);
  return `${KEY_PREFIX}${payloadBase64}.${signature}`;
}

export function verifyLicenceKey(key: string, secret: string): LicenceValidationResult {
  if (!secret) {
    return { valid: false, error: "Licence secret is not configured" };
  }

  if (!key.startsWith(KEY_PREFIX)) {
    return { valid: false, error: "Invalid key format" };
  }

  const withoutPrefix = key.slice(KEY_PREFIX.length);
  const dotIndex = withoutPrefix.lastIndexOf(".");
  if (dotIndex === -1) {
    return { valid: false, error: "Invalid key format" };
  }

  const payloadBase64 = withoutPrefix.slice(0, dotIndex);
  const providedSignature = withoutPrefix.slice(dotIndex + 1);
  const expectedSignature = signPayload(payloadBase64, secret);

  if (!safeEqual(providedSignature, expectedSignature)) {
    return { valid: false, error: "Invalid key signature" };
  }

  let payload: LicencePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
  } catch {
    return { valid: false, error: "Corrupted key payload" };
  }

  const shapeError = validatePayloadShape(payload);
  if (shapeError) {
    return { valid: false, error: shapeError };
  }

  if (payload.expiresAt !== null && Date.now() / 1000 > payload.expiresAt) {
    return { valid: false, error: "Licence key has expired" };
  }

  return { valid: true, payload };
}

export function hashLicenceKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function signPayload(payloadBase64: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payloadBase64).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function assertSecret(secret: string) {
  if (!secret) {
    throw new Error("LICENCE_SECRET must be set");
  }
}

function validatePayloadShape(payload: LicencePayload): string | null {
  if (!payload || typeof payload !== "object") return "Invalid key payload";
  if (!payload.licenceId || typeof payload.licenceId !== "string") return "Missing licence ID";
  if (!payload.tenantName || typeof payload.tenantName !== "string") return "Missing tenant name";
  if (!Number.isInteger(payload.maxRegisters)) return "Invalid register limit";
  if (!Array.isArray(payload.features)) return "Invalid feature list";
  if (!["free", "starter", "business", "whitelabel"].includes(payload.tier)) return "Invalid tier";
  if (!Number.isFinite(payload.issuedAt)) return "Invalid issue date";
  if (payload.expiresAt !== null && !Number.isFinite(payload.expiresAt)) return "Invalid expiry date";
  return null;
}
