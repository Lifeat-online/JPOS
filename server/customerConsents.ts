import { isPostgres, query } from "./db.js";
import { recordAuditEventSafe } from "./audit.js";

export const CUSTOMER_CONSENT_TYPES = [
  "loyalty",
  "marketing",
  "customer_portal",
  "stored_contact_details",
  "promotions",
  "ai_recommendations",
] as const;

export const CUSTOMER_CONSENT_STATUSES = [
  "unknown",
  "granted",
  "denied",
  "revoked",
] as const;

export type CustomerConsentType = typeof CUSTOMER_CONSENT_TYPES[number];
export type CustomerConsentStatus = typeof CUSTOMER_CONSENT_STATUSES[number];

export type CustomerConsentRecord = {
  consentType: CustomerConsentType;
  status: CustomerConsentStatus;
  source: string | null;
  note: string | null;
  capturedBy: string | null;
  capturedByName: string | null;
  capturedAt: string | Date | null;
  expiresAt: string | Date | null;
  updatedAt: string | Date | null;
};

export type CustomerConsentMap = Record<CustomerConsentType, CustomerConsentRecord>;

type ConsentActor = {
  staffId?: string | null;
  staffName?: string | null;
};

type NormalizedConsentInput = {
  consentType: CustomerConsentType;
  status: CustomerConsentStatus;
  source: string | null;
  note: string | null;
  capturedAt: string | null;
  expiresAt: string | null;
};

const consentTypeSet = new Set<string>(CUSTOMER_CONSENT_TYPES);
const consentStatusSet = new Set<string>(CUSTOMER_CONSENT_STATUSES);

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function nullableText(value: unknown, maxLength = 255) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeConsentType(value: unknown): CustomerConsentType | null {
  const type = String(value || "").trim().toLowerCase();
  return consentTypeSet.has(type) ? type as CustomerConsentType : null;
}

function normalizeConsentStatus(value: unknown): CustomerConsentStatus | null {
  const status = String(value || "").trim().toLowerCase();
  return consentStatusSet.has(status) ? status as CustomerConsentStatus : null;
}

function normalizeDateText(value: unknown) {
  const text = nullableText(value, 64);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function defaultCustomerConsentMap(): CustomerConsentMap {
  const now: null = null;
  return CUSTOMER_CONSENT_TYPES.reduce((map, consentType) => {
    map[consentType] = {
      consentType,
      status: "unknown",
      source: null,
      note: null,
      capturedBy: null,
      capturedByName: null,
      capturedAt: null,
      expiresAt: null,
      updatedAt: now,
    };
    return map;
  }, {} as CustomerConsentMap);
}

function serializeConsent(row: any): CustomerConsentRecord | null {
  const consentType = normalizeConsentType(row?.consentType ?? row?.consent_type);
  if (!consentType) return null;
  return {
    consentType,
    status: normalizeConsentStatus(row?.status) || "unknown",
    source: row?.source || null,
    note: row?.note || null,
    capturedBy: row?.capturedBy ?? row?.captured_by ?? null,
    capturedByName: row?.capturedByName ?? row?.captured_by_name ?? null,
    capturedAt: row?.capturedAt ?? row?.captured_at ?? null,
    expiresAt: row?.expiresAt ?? row?.expires_at ?? null,
    updatedAt: row?.updatedAt ?? row?.updated_at ?? null,
  };
}

export function serializeCustomerConsentMap(rows: any[] = []): CustomerConsentMap {
  const map = defaultCustomerConsentMap();
  for (const row of rows) {
    const record = serializeConsent(row);
    if (record) map[record.consentType] = record;
  }
  return map;
}

export function normalizeCustomerConsentInput(input: unknown): NormalizedConsentInput[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const entries: NormalizedConsentInput[] = [];
  for (const [key, rawValue] of Object.entries(input as Record<string, any>)) {
    const consentType = normalizeConsentType(key);
    if (!consentType || !rawValue || typeof rawValue !== "object") continue;
    const status = normalizeConsentStatus(rawValue.status);
    if (!status) continue;
    entries.push({
      consentType,
      status,
      source: nullableText(rawValue.source, 80) || "customer_profile",
      note: nullableText(rawValue.note, 1000),
      capturedAt: normalizeDateText(rawValue.capturedAt ?? rawValue.captured_at),
      expiresAt: normalizeDateText(rawValue.expiresAt ?? rawValue.expires_at),
    });
  }
  return entries;
}

async function selectCurrentConsentStatus(tenantId: string, customerId: string, consentType: CustomerConsentType) {
  const rows = await query<{ status?: string }>(
    `SELECT status
       FROM customer_consents
      WHERE tenant_id = ? AND customer_id = ? AND consent_type = ?
      LIMIT 1`,
    [tenantId, customerId, consentType],
  );
  return normalizeConsentStatus(rows[0]?.status) || "unknown";
}

export async function listCustomerConsents(tenantId: string, customerId: string): Promise<CustomerConsentMap> {
  const rows = await query(
    `SELECT
       consent_type AS consentType,
       status,
       source,
       note,
       captured_by AS capturedBy,
       captured_by_name AS capturedByName,
       captured_at AS capturedAt,
       expires_at AS expiresAt,
       updated_at AS updatedAt
     FROM customer_consents
     WHERE tenant_id = ? AND customer_id = ?`,
    [tenantId, customerId],
  );
  return serializeCustomerConsentMap(rows as any[]);
}

export async function listTenantCustomerConsents(tenantId: string): Promise<Map<string, CustomerConsentMap>> {
  const rows = await query(
    `SELECT
       customer_id AS customerId,
       consent_type AS consentType,
       status,
       source,
       note,
       captured_by AS capturedBy,
       captured_by_name AS capturedByName,
       captured_at AS capturedAt,
       expires_at AS expiresAt,
       updated_at AS updatedAt
     FROM customer_consents
     WHERE tenant_id = ?`,
    [tenantId],
  );
  const grouped = new Map<string, any[]>();
  for (const row of rows as any[]) {
    const customerId = String(row.customerId ?? row.customer_id ?? "").trim();
    if (!customerId) continue;
    grouped.set(customerId, [...(grouped.get(customerId) || []), row]);
  }
  const result = new Map<string, CustomerConsentMap>();
  for (const [customerId, consentRows] of grouped.entries()) {
    result.set(customerId, serializeCustomerConsentMap(consentRows));
  }
  return result;
}

export async function upsertCustomerConsents(
  tenantId: string,
  customerId: string,
  input: unknown,
  actor: ConsentActor = {},
): Promise<CustomerConsentMap> {
  const entries = normalizeCustomerConsentInput(input);
  if (entries.length === 0) return listCustomerConsents(tenantId, customerId);

  const changes: Array<{ consentType: CustomerConsentType; previousStatus: CustomerConsentStatus; status: CustomerConsentStatus }> = [];
  for (const entry of entries) {
    const previousStatus = await selectCurrentConsentStatus(tenantId, customerId, entry.consentType);
    const id = makeId("consent");
    const capturedAt = entry.capturedAt || null;
    if (isPostgres()) {
      await query(
        `INSERT INTO customer_consents (
           id, tenant_id, customer_id, consent_type, status, source, note,
           captured_by, captured_by_name, captured_at, expires_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?::timestamptz, NOW()), ?::timestamptz, NOW(), NOW())
         ON CONFLICT (tenant_id, customer_id, consent_type)
         DO UPDATE SET status = EXCLUDED.status,
                       source = EXCLUDED.source,
                       note = EXCLUDED.note,
                       captured_by = EXCLUDED.captured_by,
                       captured_by_name = EXCLUDED.captured_by_name,
                       captured_at = EXCLUDED.captured_at,
                       expires_at = EXCLUDED.expires_at,
                       updated_at = NOW()`,
        [
          id,
          tenantId,
          customerId,
          entry.consentType,
          entry.status,
          entry.source,
          entry.note,
          actor.staffId || null,
          actor.staffName || null,
          capturedAt,
          entry.expiresAt,
        ],
      );
    } else {
      await query(
        `INSERT INTO customer_consents (
           id, tenant_id, customer_id, consent_type, status, source, note,
           captured_by, captured_by_name, captured_at, expires_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE status = VALUES(status),
                                 source = VALUES(source),
                                 note = VALUES(note),
                                 captured_by = VALUES(captured_by),
                                 captured_by_name = VALUES(captured_by_name),
                                 captured_at = VALUES(captured_at),
                                 expires_at = VALUES(expires_at),
                                 updated_at = NOW()`,
        [
          id,
          tenantId,
          customerId,
          entry.consentType,
          entry.status,
          entry.source,
          entry.note,
          actor.staffId || null,
          actor.staffName || null,
          capturedAt,
          entry.expiresAt,
        ],
      );
    }

    await query(
      `INSERT INTO customer_consent_events (
         id, tenant_id, customer_id, consent_type, previous_status, status,
         source, note, captured_by, captured_by_name, captured_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), NOW())`,
      [
        makeId("consent_evt"),
        tenantId,
        customerId,
        entry.consentType,
        previousStatus,
        entry.status,
        entry.source,
        entry.note,
        actor.staffId || null,
        actor.staffName || null,
        capturedAt,
      ],
    );
    changes.push({ consentType: entry.consentType, previousStatus, status: entry.status });
  }

  await recordAuditEventSafe({
    tenantId,
    action: "customer.consent_updated",
    entityType: "customer",
    entityId: customerId,
    customerId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "customer_admin",
    details: { changes },
  });

  return listCustomerConsents(tenantId, customerId);
}
