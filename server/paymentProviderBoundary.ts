export const PROVIDER_REFERENCE_METHODS = new Set(["payfast", "card", "qr", "bnpl"]);
export const PROVIDER_TOKEN_ALLOWED_METHODS = new Set(["payfast", "qr", "bnpl"]);

const PROVIDERS_BY_METHOD: Record<string, Set<string>> = {
  payfast: new Set(["payfast"]),
  card: new Set([
    "adumo",
    "card_terminal",
    "external_terminal",
    "fnb",
    "generic_terminal",
    "ikhokha",
    "nedbank",
    "other_terminal",
    "speedpoint",
    "standard_bank",
    "yoco",
    "yoco_terminal",
  ]),
  qr: new Set([
    "generic_qr",
    "masterpass",
    "mobile_wallet",
    "qr",
    "scan_to_pay",
    "snapscan",
    "yoco",
    "yoco_payment_link",
    "zapper",
  ]),
  bnpl: new Set(["bnpl", "mobicred", "payflex", "payjustnow"]),
};

const EVIDENCE_FIELDS = [
  "provider",
  "paymentProvider",
  "providerDeviceId",
  "deviceId",
  "terminalId",
  "providerReference",
  "reference",
  "authorizationCode",
  "authCode",
  "providerStatus",
  "providerNote",
  "note",
  "qrPayload",
  "paymentLink",
  "qrCode",
];

const TOKEN_FIELD_PATTERN = /(^|_|\b)(providerToken|paymentToken|cardToken|networkToken|walletToken|token)(_|$|\b)/i;
const SENSITIVE_FIELD_PATTERN = /(pan|primaryAccountNumber|cardNumber|card_number|card-number|cvv|cvc|securityCode|security_code|expiry|expiration|trackData|track_data|magstripe|magneticStripe)/i;
const CVV_VALUE_PATTERN = /\b(?:cvv|cvc|security\s*code)\s*[:=#-]?\s*\d{3,4}\b/i;
const TRACK_VALUE_PATTERN = /(?:track\s*[12]\s*[:=#-]?|%B\d{13,19}\^|;\d{13,19}=)/i;

type BoundaryContext = {
  method?: string | null;
  source?: string;
  allowMissingMethod?: boolean;
};

function normalizeMethod(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeProvider(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function hasProviderEvidence(payment: any) {
  return EVIDENCE_FIELDS.some((field) => hasValue(payment?.[field]));
}

function luhnValid(digits: string) {
  let sum = 0;
  let doubleDigit = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (Number.isNaN(digit)) return false;
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return sum > 0 && sum % 10 === 0;
}

function cardLikeNumbers(value: unknown) {
  const text = String(value ?? "");
  const matches = text.match(/(?:\d[\s-]?){13,19}/g) || [];

  return matches
    .map((match) => match.replace(/\D/g, ""))
    .filter((digits) => digits.length >= 13 && digits.length <= 19)
    .filter((digits) => /^[3456]/.test(digits) && luhnValid(digits));
}

function sensitiveValueReasons(field: string, value: unknown) {
  if (!hasValue(value)) return [];

  const reasons: string[] = [];
  const text = String(value);

  if (SENSITIVE_FIELD_PATTERN.test(field)) {
    reasons.push(`${field} is not allowed in provider evidence`);
  }
  if (CVV_VALUE_PATTERN.test(text)) {
    reasons.push(`${field} appears to contain CVV/CVC data`);
  }
  if (TRACK_VALUE_PATTERN.test(text)) {
    reasons.push(`${field} appears to contain card track data`);
  }
  if (cardLikeNumbers(text).length > 0) {
    reasons.push(`${field} appears to contain a card PAN`);
  }

  return reasons;
}

function tokenFields(payment: any) {
  if (!payment || typeof payment !== "object") return [];

  return Object.entries(payment)
    .filter(([key, value]) => TOKEN_FIELD_PATTERN.test(key) && hasValue(value))
    .map(([key]) => key);
}

function sensitiveEvidenceIssues(payment: any) {
  if (!payment || typeof payment !== "object") return [];

  const issues: string[] = [];
  const checked = new Set<string>();

  for (const field of EVIDENCE_FIELDS) {
    checked.add(field);
    issues.push(...sensitiveValueReasons(field, payment[field]));
  }

  for (const [field, value] of Object.entries(payment)) {
    if (checked.has(field)) continue;
    if (SENSITIVE_FIELD_PATTERN.test(field) || TOKEN_FIELD_PATTERN.test(field)) {
      issues.push(...sensitiveValueReasons(field, value));
    }
  }

  return issues;
}

function providerIsAllowedForMethod(method: string, provider: unknown) {
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) return true;
  const allowed = PROVIDERS_BY_METHOD[method];
  return !allowed || allowed.has(normalizedProvider);
}

export function getPaymentProviderEvidenceIssues(payment: any, context: BoundaryContext = {}) {
  const method = normalizeMethod(context.method ?? payment?.method);
  const source = context.source ? `${context.source}: ` : "";
  const issues: string[] = [];

  issues.push(...sensitiveEvidenceIssues(payment).map((issue) => `${source}${issue}`));

  const evidencePresent = hasProviderEvidence(payment);
  const tokens = tokenFields(payment);

  if (!method && (evidencePresent || tokens.length > 0) && !context.allowMissingMethod) {
    issues.push(`${source}provider evidence needs a payment method`);
  }

  if (method && evidencePresent && !PROVIDER_REFERENCE_METHODS.has(method)) {
    issues.push(`${source}provider evidence can only be stored for PayFast, card terminal, QR/SnapScan/Yoco, or BNPL payments`);
  }

  if (method && evidencePresent && !providerIsAllowedForMethod(method, payment?.provider ?? payment?.paymentProvider)) {
    issues.push(`${source}${payment.provider || payment.paymentProvider} is not an approved provider for ${method} payments`);
  }

  if (method && tokens.length > 0 && !PROVIDER_TOKEN_ALLOWED_METHODS.has(method)) {
    issues.push(`${source}provider tokens can only be accepted for PayFast, QR/SnapScan/Yoco, or BNPL provider rails`);
  }

  if (tokens.length > 0) {
    for (const field of tokens) {
      issues.push(...sensitiveValueReasons(field, payment[field]).map((issue) => `${source}${issue}`));
    }
  }

  return Array.from(new Set(issues));
}

export function assertSafePaymentProviderEvidence(payment: any, context: BoundaryContext = {}) {
  const issues = getPaymentProviderEvidenceIssues(payment, context);
  if (issues.length > 0) {
    throw new Error(`Unsafe payment provider evidence: ${issues.join("; ")}`);
  }
}

export function sanitizePaymentProviderEvidence(payment: any) {
  return {
    provider: payment?.provider ?? payment?.paymentProvider ?? null,
    providerDeviceId: payment?.providerDeviceId ?? payment?.deviceId ?? payment?.terminalId ?? null,
    providerReference: payment?.providerReference ?? payment?.reference ?? payment?.authorizationCode ?? null,
    authorizationCode: payment?.authorizationCode ?? payment?.authCode ?? null,
    providerStatus: payment?.providerStatus ?? null,
    providerNote: payment?.providerNote ?? payment?.note ?? null,
    qrPayload: payment?.qrPayload ?? payment?.paymentLink ?? payment?.qrCode ?? null,
  };
}
