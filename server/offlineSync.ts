import { recordAuditEvent } from "./audit.js";
import { getConnection, query } from "./db.js";
type OfflineSyncIssueInput = {
    offlineEventId?: string | null;
    localReceiptNumber?: string | null;
    deviceId?: string | null;
    operation?: string | null;
    method?: string | null;
    status?: string | null;
    attempts?: number;
    message?: string | null;
    cloudSaleId?: string | null;
    targetSaleId?: string | null;
    staffId?: string | null;
    staffName?: string | null;
    total?: number | null;
    conflictType?: string | null;
    recommendedAction?: string | null;
    syncBatchId?: string | null;
    syncSequence?: number | null;
};
function cleanString(value: unknown, maxLength = 255) {
    const text = String(value || "").trim();
    return text ? text.slice(0, maxLength) : null;
}
function toNumber(value: unknown) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
}
export function classifyOfflineSyncAction(message: unknown) {
    const classified = classifyOfflineSyncIssue(message);
    return classified.conflictType !== "sync_failure"
        ? "offline.sync_conflict"
        : "offline.sync_failed";
}
export function classifyOfflineSyncIssue(message: unknown, fallbackConflictType?: string | null) {
    const explicitType = cleanString(fallbackConflictType, 64);
    const text = String(message || "").toLowerCase();
    let conflictType = explicitType || "sync_failure";
    if (!explicitType) {
        if (/negative stock|insufficient stock|out of stock|stock.*conflict|below zero|stock short/.test(text)) {
            conflictType = "negative_stock_after_sync";
        }
        else if (/(local receipt|receipt).*(duplicate|already|conflict)|(duplicate|already|conflict).*(local receipt|receipt)/.test(text)) {
            conflictType = "duplicate_local_receipt";
        }
        else if (/(table|tab).*(duplicate|already|open|conflict)|(duplicate|already|open|conflict).*(table|tab)/.test(text)) {
            conflictType = "duplicate_table_or_tab";
        }
        else if (/(customer|order).*(duplicate|already|open|conflict)|(duplicate|already|open|conflict).*(customer|order)/.test(text)) {
            conflictType = "duplicate_customer_order";
        }
        else if (/duplicate|already exists|conflict/.test(text)) {
            conflictType = "duplicate_local_receipt";
        }
    }
    const recommendedActionByType: Record<string, string> = {
        negative_stock_after_sync: "Review the synced sale against current stock, approve the shortage, adjust stock, or create a receiving/count correction.",
        duplicate_local_receipt: "Check whether this local receipt already exists in cloud sales before retrying or dismissing the local copy.",
        duplicate_table_or_tab: "Compare the offline sale with the open table/tab and merge, close, or reassign the order before retrying.",
        duplicate_customer_order: "Check the customer/order history for a duplicate sale before retrying or dismissing the local copy.",
        sync_failure: "Review the error, retry once online, then escalate if the same device keeps failing.",
    };
    return {
        conflictType,
        recommendedAction: recommendedActionByType[conflictType] || recommendedActionByType.sync_failure,
    };
}
export async function recordOfflineSyncIssue(tenantId: string, input: OfflineSyncIssueInput) {
    const offlineEventId = cleanString(input.offlineEventId, 128);
    const message = cleanString(input.message, 1000) || "Offline sync failed.";
    if (!offlineEventId)
        throw new Error("Missing offline sale reference.");
    const classification = classifyOfflineSyncIssue(message, input.conflictType);
    const conn = await getConnection();
    try {
        await conn.beginTransaction();
        const eventId = await recordAuditEvent(conn, {
            tenantId,
            action: classification.conflictType !== "sync_failure" ? "offline.sync_conflict" : "offline.sync_failed",
            entityType: "sale",
            entityId: cleanString(input.cloudSaleId || input.targetSaleId || offlineEventId, 128),
            relatedSaleId: cleanString(input.cloudSaleId || input.targetSaleId, 128),
            staffId: cleanString(input.staffId, 128),
            staffName: cleanString(input.staffName, 255),
            source: "offline_queue",
            details: {
                offlineEventId,
                localReceiptNumber: cleanString(input.localReceiptNumber, 64),
                deviceId: cleanString(input.deviceId, 128),
                operation: cleanString(input.operation, 32),
                method: cleanString(input.method, 32),
                queueStatus: cleanString(input.status, 32),
                attempts: Math.max(0, Math.floor(toNumber(input.attempts))),
                message,
                total: toNumber(input.total),
                conflictType: classification.conflictType,
                recommendedAction: cleanString(input.recommendedAction, 1000) || classification.recommendedAction,
                syncBatchId: cleanString(input.syncBatchId, 128),
                syncSequence: input.syncSequence === undefined || input.syncSequence === null ? null : Math.max(0, Math.floor(toNumber(input.syncSequence))),
            },
        });
        await conn.commit();
        return { eventId };
    }
    catch (error) {
        await conn.rollback();
        throw error;
    }
    finally {
        conn.release();
    }
}
export async function syncOfflineSaleIssues(tenantId: string, input: {
    limit?: number;
    status?: string;
    deviceId?: string;
} = {}) {
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
    const status = input.status ? String(input.status) : null;
    const deviceId = input.deviceId ? String(input.deviceId) : null;
    const rows = await query<any>(`SELECT id, action, entity_id, related_sale_id, staff_id, staff_name, source, details, created_at
       FROM audit_events
      WHERE tenant_id = $1
        AND source = 'offline_queue'
        AND (action = 'offline.sync_conflict' OR action = 'offline.sync_failed')
        AND ($1::text IS NULL OR action = $1)
        AND ($2::text IS NULL OR (details->>'deviceId') = $2)
      ORDER BY created_at DESC
      LIMIT $3`, [tenantId, status === "conflict" ? "offline.sync_conflict" : status === "failed" ? "offline.sync_failed" : null, deviceId, limit]);
    return {
        count: rows.length,
        issues: rows.map((r: any) => ({
            id: r.id,
            action: r.action,
            saleId: r.related_sale_id || r.entity_id,
            staffId: r.staff_id,
            staffName: r.staff_name,
            deviceId: typeof r.details === "object" && r.details ? r.details.deviceId : null,
            conflictType: typeof r.details === "object" && r.details ? r.details.conflictType : null,
            recommendedAction: typeof r.details === "object" && r.details ? r.details.recommendedAction : null,
            message: typeof r.details === "object" && r.details ? r.details.message : null,
            attempts: typeof r.details === "object" && r.details ? Number(r.details.attempts || 0) : 0,
            createdAt: r.created_at,
        })),
    };
}
