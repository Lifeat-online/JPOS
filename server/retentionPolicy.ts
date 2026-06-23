import { db, query } from "./db.js";
import { recordAuditEventSafe } from "./audit.js";

type RetentionSummary = {
  customerNotesToClear: number;
  messagesToDelete: number;
  deviceMetadataRowsToDelete: number;
  auditLogsToDelete: number;
};

export type RetentionPolicy = {
  customerNotesDays: number;
  messagesDays: number;
  deviceMetadataDays: number;
  auditLogsDays: number;
  lastAppliedAt?: string | null;
  lastAppliedBy?: string | null;
  lastAppliedByName?: string | null;
  lastResult?: RetentionSummary | null;
};

type Actor = {
  staffId?: string | null;
  staffName?: string | null;
};

type RetentionBucket = {
  cutoff: string;
  count: number;
};

export type RetentionPreview = {
  generatedAt: string;
  policy: RetentionPolicy;
  customerNotes: RetentionBucket;
  messages: RetentionBucket;
  stalePushSubscriptions: RetentionBucket;
  staleCompanionDevices: RetentionBucket;
  auditLogs: RetentionBucket;
  summary: RetentionSummary;
};

export type RetentionApplyResult = RetentionPreview & {
  appliedAt: string;
  appliedBy: string | null;
  appliedByName: string | null;
};

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  customerNotesDays: 365,
  messagesDays: 180,
  deviceMetadataDays: 90,
  auditLogsDays: 2555,
  lastAppliedAt: null,
  lastAppliedBy: null,
  lastAppliedByName: null,
  lastResult: null,
};

function parseJson(value: unknown, fallback: any) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function clampDays(value: unknown, fallback: number, min = 7, max = 3650) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function normalizeRetentionPolicy(input: unknown): RetentionPolicy {
  const raw = (input && typeof input === "object") ? input as Partial<RetentionPolicy> : {};
  return {
    customerNotesDays: clampDays(raw.customerNotesDays, DEFAULT_RETENTION_POLICY.customerNotesDays),
    messagesDays: clampDays(raw.messagesDays, DEFAULT_RETENTION_POLICY.messagesDays),
    deviceMetadataDays: clampDays(raw.deviceMetadataDays, DEFAULT_RETENTION_POLICY.deviceMetadataDays),
    auditLogsDays: clampDays(raw.auditLogsDays, DEFAULT_RETENTION_POLICY.auditLogsDays, 30, 3650),
    lastAppliedAt: raw.lastAppliedAt || null,
    lastAppliedBy: raw.lastAppliedBy || null,
    lastAppliedByName: raw.lastAppliedByName || null,
    lastResult: raw.lastResult || null,
  };
}

function cutoffForDays(days: number) {
  const date = new Date(Date.now() - days * 86400000);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function countRows(sql: string, params: any[]) {
  const rows = await query<any>(sql, params);
  const row = rows[0] || {};
  return Number(row.count ?? row.total ?? Object.values(row)[0] ?? 0) || 0;
}

export async function getRetentionPolicy(tenantId: string): Promise<RetentionPolicy> {
  const row = await db
    .selectFrom("app_settings")
    .select("retention_policy as retentionPolicy")
    .where("tenant_id", "=", tenantId)
    .limit(1)
    .executeTakeFirst();
  return normalizeRetentionPolicy(parseJson(row?.retentionPolicy, {}));
}

export async function saveRetentionPolicy(tenantId: string, policyInput: unknown, actor: Actor = {}) {
  const current = await getRetentionPolicy(tenantId);
  const policy = normalizeRetentionPolicy({ ...current, ...(policyInput as any || {}) });
  const serialized = JSON.stringify(policy);
  await query(
    `INSERT INTO app_settings (tenant_id, retention_policy, created_at, updated_at)
         VALUES (?, ?, NOW(), NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET retention_policy = EXCLUDED.retention_policy,
                                               updated_at = NOW()`,
    [tenantId, serialized],
  );
  await recordAuditEventSafe({
    tenantId,
    action: "retention_policy.updated",
    entityType: "retention_policy",
    entityId: tenantId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "retention",
    details: { policy },
  });
  return policy;
}

export async function getRetentionPreview(tenantId: string, policyInput?: unknown): Promise<RetentionPreview> {
  const base = await getRetentionPolicy(tenantId);
  const policy = policyInput ? normalizeRetentionPolicy({ ...base, ...(policyInput as any || {}) }) : base;
  const customerNotesCutoff = cutoffForDays(policy.customerNotesDays);
  const messagesCutoff = cutoffForDays(policy.messagesDays);
  const deviceCutoff = cutoffForDays(policy.deviceMetadataDays);
  const auditCutoff = cutoffForDays(policy.auditLogsDays);

  const [customerNotesCount, messagesCount, pushCount, companionCount, auditCount] = await Promise.all([
    countRows(
      `SELECT COUNT(*) AS count
         FROM customers
        WHERE tenant_id = ?
          AND notes IS NOT NULL
          AND notes <> ''
          AND COALESCE(updated_at, created_at) < ?`,
      [tenantId, customerNotesCutoff],
    ),
    countRows(
      `SELECT COUNT(*) AS count
         FROM messages
        WHERE tenant_id = ? AND created_at < ?`,
      [tenantId, messagesCutoff],
    ),
    countRows(
      `SELECT COUNT(*) AS count
         FROM push_subscriptions
        WHERE tenant_id = ?
          AND COALESCE(disabled_at, last_seen_at, updated_at, created_at) < ?`,
      [tenantId, deviceCutoff],
    ),
    countRows(
      `SELECT COUNT(*) AS count
         FROM companion_device_assignments
        WHERE tenant_id = ? AND updated_at < ?`,
      [tenantId, deviceCutoff],
    ),
    countRows(
      `SELECT COUNT(*) AS count
         FROM audit_events
        WHERE tenant_id = ?
          AND created_at < ?
          AND action NOT LIKE 'retention_policy.%'`,
      [tenantId, auditCutoff],
    ),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    policy,
    customerNotes: { cutoff: customerNotesCutoff, count: customerNotesCount },
    messages: { cutoff: messagesCutoff, count: messagesCount },
    stalePushSubscriptions: { cutoff: deviceCutoff, count: pushCount },
    staleCompanionDevices: { cutoff: deviceCutoff, count: companionCount },
    auditLogs: { cutoff: auditCutoff, count: auditCount },
    summary: {
      customerNotesToClear: customerNotesCount,
      messagesToDelete: messagesCount,
      deviceMetadataRowsToDelete: pushCount + companionCount,
      auditLogsToDelete: auditCount,
    },
  };
}

export async function applyRetentionPolicy(tenantId: string, policyInput?: unknown, actor: Actor = {}): Promise<RetentionApplyResult> {
  const preview = await getRetentionPreview(tenantId, policyInput);
  await query(
    `UPDATE customers
        SET notes = NULL,
            updated_at = NOW()
      WHERE tenant_id = ?
        AND notes IS NOT NULL
        AND notes <> ''
        AND COALESCE(updated_at, created_at) < ?`,
    [tenantId, preview.customerNotes.cutoff],
  );
  await query(`DELETE FROM messages WHERE tenant_id = ? AND created_at < ?`, [tenantId, preview.messages.cutoff]);
  await query(
    `DELETE FROM push_subscriptions
      WHERE tenant_id = ?
        AND COALESCE(disabled_at, last_seen_at, updated_at, created_at) < ?`,
    [tenantId, preview.stalePushSubscriptions.cutoff],
  );
  await query(`DELETE FROM companion_device_assignments WHERE tenant_id = ? AND updated_at < ?`, [tenantId, preview.staleCompanionDevices.cutoff]);
  await query(
    `DELETE FROM audit_events
      WHERE tenant_id = ?
        AND created_at < ?
        AND action NOT LIKE 'retention_policy.%'`,
    [tenantId, preview.auditLogs.cutoff],
  );

  const appliedAt = new Date().toISOString();
  const appliedPolicy = normalizeRetentionPolicy({
    ...preview.policy,
    lastAppliedAt: appliedAt,
    lastAppliedBy: actor.staffId || null,
    lastAppliedByName: actor.staffName || null,
    lastResult: preview.summary,
  });
  await query(
    `INSERT INTO app_settings (tenant_id, retention_policy, created_at, updated_at)
         VALUES (?, ?, NOW(), NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET retention_policy = EXCLUDED.retention_policy,
                                               updated_at = NOW()`,
    [tenantId, JSON.stringify(appliedPolicy)],
  );
  await recordAuditEventSafe({
    tenantId,
    action: "retention_policy.applied",
    entityType: "retention_policy",
    entityId: tenantId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "retention",
    details: {
      policy: preview.policy,
      summary: preview.summary,
      cutoffs: {
        customerNotes: preview.customerNotes.cutoff,
        messages: preview.messages.cutoff,
        deviceMetadata: preview.stalePushSubscriptions.cutoff,
        auditLogs: preview.auditLogs.cutoff,
      },
    },
  });

  return {
    ...preview,
    policy: appliedPolicy,
    appliedAt,
    appliedBy: actor.staffId || null,
    appliedByName: actor.staffName || null,
  };
}
