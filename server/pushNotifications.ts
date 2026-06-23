import webPush from "web-push";
import { query } from "./db.js";
export type PushNotificationPayload = {
    title: string;
    body: string;
    url?: string;
    tag?: string;
    icon?: string;
    badge?: string;
    requireInteraction?: boolean;
    vibrate?: number[];
    data?: Record<string, unknown>;
    actions?: {
        action: string;
        title: string;
        icon?: string;
    }[];
};
type PushSettings = {
    tenantId: string;
    publicKey: string | null;
    privateKey: string | null;
    subject: string;
    enabled: boolean;
};
const DEFAULT_SUBJECT = process.env.WEB_PUSH_SUBJECT || process.env.VAPID_SUBJECT || "mailto:dev@masepos.local";
function bool(value: unknown) {
    return value === true || value === 1 || value === "1";
}
function nowId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
function normalizeSubscription(input: any) {
    const endpoint = String(input?.endpoint || "").trim();
    const p256dh = String(input?.keys?.p256dh || input?.p256dh || "").trim();
    const auth = String(input?.keys?.auth || input?.auth || "").trim();
    const expirationTime = input?.expirationTime ? new Date(input.expirationTime) : null;
    if (!endpoint || !p256dh || !auth) {
        throw new Error("Push subscription endpoint, p256dh, and auth are required");
    }
    return { endpoint, p256dh, auth, expirationTime };
}
export async function ensurePushNotificationSchema() {
    await query(`
    CREATE TABLE IF NOT EXISTS push_notification_settings (
      tenant_id TEXT PRIMARY KEY,
      vapid_public_key TEXT,
      vapid_private_key TEXT,
      subject TEXT NOT NULL DEFAULT '${DEFAULT_SUBJECT.replace(/'/g, "''")}',
      enabled SMALLINT DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      staff_id TEXT,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      expiration_time TIMESTAMP NULL,
      device_label TEXT,
      user_agent TEXT,
      disabled_at TIMESTAMP NULL,
      last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, endpoint)
    )
  `);
    await query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant ON push_subscriptions (tenant_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_staff ON push_subscriptions (tenant_id, staff_id)`);
}
export async function getPushSettings(tenantId: string): Promise<PushSettings> {
    const rows = await query<any>(`SELECT tenant_id, vapid_public_key, vapid_private_key, subject, enabled
       FROM push_notification_settings
      WHERE tenant_id = $1
      LIMIT 1`, [tenantId]);
    const row = rows[0];
    if (row) {
        return {
            tenantId,
            publicKey: row.vapid_public_key || null,
            privateKey: row.vapid_private_key || null,
            subject: row.subject || DEFAULT_SUBJECT,
            enabled: bool(row.enabled),
        };
    }
    return {
        tenantId,
        publicKey: process.env.WEB_PUSH_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || null,
        privateKey: process.env.WEB_PUSH_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY || null,
        subject: DEFAULT_SUBJECT,
        enabled: true,
    };
}
export async function getPushOverview(tenantId: string) {
    const settings = await getPushSettings(tenantId);
    const counts = await query<any>(`SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN disabled_at IS NULL THEN 1 ELSE 0 END) AS active
     FROM push_subscriptions
     WHERE tenant_id = $1`, [tenantId]);
    return {
        configured: Boolean(settings.publicKey && settings.privateKey && settings.enabled),
        enabled: settings.enabled,
        publicKey: settings.publicKey,
        subject: settings.subject,
        subscriptionCount: Number(counts[0]?.total || 0),
        activeSubscriptionCount: Number(counts[0]?.active || 0),
    };
}
export async function generateTenantVapidKeys(tenantId: string, subject?: string) {
    const keys = webPush.generateVAPIDKeys();
    const finalSubject = String(subject || DEFAULT_SUBJECT).trim() || DEFAULT_SUBJECT;
    await query(`INSERT INTO push_notification_settings
       (tenant_id, vapid_public_key, vapid_private_key, subject, enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
     ON CONFLICT (tenant_id)
     DO UPDATE SET vapid_public_key = EXCLUDED.vapid_public_key,
                   vapid_private_key = EXCLUDED.vapid_private_key,
                   subject = EXCLUDED.subject,
                   enabled = 1,
                   updated_at = NOW()`, [tenantId, keys.publicKey, keys.privateKey, finalSubject]);
    return getPushOverview(tenantId);
}
export async function savePushSubscription(tenantId: string, staffId: string | null, payload: any, meta: {
    deviceLabel?: string;
    userAgent?: string;
} = {}) {
    const sub = normalizeSubscription(payload);
    const id = nowId("pushsub");
    const deviceLabel = String(meta.deviceLabel || "Browser device").slice(0, 160);
    const userAgent = String(meta.userAgent || "").slice(0, 500);
    await query(`INSERT INTO push_subscriptions
       (id, tenant_id, staff_id, endpoint, p256dh, auth, expiration_time, device_label, user_agent, disabled_at, last_seen_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NOW(), NOW(), NOW())
     ON CONFLICT (tenant_id, endpoint)
     DO UPDATE SET staff_id = EXCLUDED.staff_id,
                   p256dh = EXCLUDED.p256dh,
                   auth = EXCLUDED.auth,
                   expiration_time = EXCLUDED.expiration_time,
                   device_label = EXCLUDED.device_label,
                   user_agent = EXCLUDED.user_agent,
                   disabled_at = NULL,
                   last_seen_at = NOW(),
                   updated_at = NOW()`, [id, tenantId, staffId, sub.endpoint, sub.p256dh, sub.auth, sub.expirationTime, deviceLabel, userAgent]);
    return getPushOverview(tenantId);
}
export async function removePushSubscription(tenantId: string, endpoint: string) {
    await query(`UPDATE push_subscriptions
        SET disabled_at = NOW(), updated_at = NOW()
      WHERE tenant_id = $1 AND endpoint = $2`, [tenantId, endpoint]);
    return getPushOverview(tenantId);
}
async function activeSubscriptions(tenantId: string, staffIds?: string[]) {
    if (staffIds?.length) {
        const placeholders = staffIds.map(() => "$1").join(", ");
        return query<any>(`SELECT id, endpoint, p256dh, auth, expiration_time
         FROM push_subscriptions
        WHERE tenant_id = $1 AND disabled_at IS NULL AND staff_id IN (${placeholders})`, [tenantId, ...staffIds]);
    }
    return query<any>(`SELECT id, endpoint, p256dh, auth, expiration_time
       FROM push_subscriptions
      WHERE tenant_id = $1 AND disabled_at IS NULL`, [tenantId]);
}
export async function sendPushNotification(tenantId: string, payload: PushNotificationPayload, options: {
    staffIds?: string[];
    ttl?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
} = {}) {
    const settings = await getPushSettings(tenantId);
    if (!settings.enabled || !settings.publicKey || !settings.privateKey) {
        return { attempted: 0, sent: 0, failed: 0, skipped: "vapid_not_configured" };
    }
    webPush.setVapidDetails(settings.subject, settings.publicKey, settings.privateKey);
    const rows = await activeSubscriptions(tenantId, options.staffIds);
    let sent = 0;
    let failed = 0;
    await Promise.all(rows.map(async (row) => {
        try {
            await webPush.sendNotification({
                endpoint: row.endpoint,
                expirationTime: row.expiration_time ? new Date(row.expiration_time).getTime() : null,
                keys: { p256dh: row.p256dh, auth: row.auth },
            }, JSON.stringify(payload), {
                TTL: options.ttl ?? 120,
                urgency: options.urgency ?? "normal",
            });
            sent += 1;
        }
        catch (err: any) {
            failed += 1;
            if (err?.statusCode === 404 || err?.statusCode === 410) {
                await query(`UPDATE push_subscriptions SET disabled_at = NOW(), updated_at = NOW() WHERE tenant_id = $1 AND id = $2`, [tenantId, row.id]);
            }
            else {
                console.warn("Push notification delivery failed:", err?.message || err);
            }
        }
    }));
    return { attempted: rows.length, sent, failed };
}
