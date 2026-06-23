import { query } from "./db.js";
import { recordAuditEventSafe } from "./audit.js";
export type ManagerOverrideInput = {
    overrideType?: string | null;
    targetType: string;
    targetId: string;
    action: string;
    status?: string | null;
    reason: string;
    requestedBy?: string | null;
    approvedBy?: string | null;
    approvedByName?: string | null;
    relatedSaleId?: string | null;
    relatedProductId?: string | null;
    source?: string | null;
    details?: unknown;
};
function id(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function clean(value: unknown, max = 255) {
    return String(value || "").trim().slice(0, max);
}
function json(value: unknown, fallback: unknown = {}) {
    if (value === undefined || value === null)
        return JSON.stringify(fallback);
    if (typeof value === "string")
        return value;
    return JSON.stringify(value);
}
function parseJson(value: unknown, fallback: any) {
    if (value === null || value === undefined || value === "")
        return fallback;
    if (typeof value !== "string")
        return value;
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function rowToOverride(row: any) {
    return {
        id: row.id,
        tenantId: row.tenantId ?? row.tenant_id,
        overrideType: row.overrideType ?? row.override_type,
        targetType: row.targetType ?? row.target_type,
        targetId: row.targetId ?? row.target_id,
        action: row.action,
        status: row.status,
        reason: row.reason,
        requestedBy: row.requestedBy ?? row.requested_by,
        approvedBy: row.approvedBy ?? row.approved_by,
        approvedByName: row.approvedByName ?? row.approved_by_name,
        relatedSaleId: row.relatedSaleId ?? row.related_sale_id,
        relatedProductId: row.relatedProductId ?? row.related_product_id,
        source: row.source,
        details: parseJson(row.details, {}),
        createdAt: row.createdAt ?? row.created_at,
    };
}
export async function recordManagerOverride(tenantId: string, input: ManagerOverrideInput) {
    const overrideType = clean(input.overrideType || "manager_task", 64) || "manager_task";
    const targetType = clean(input.targetType, 64);
    const targetId = clean(input.targetId, 128);
    const action = clean(input.action, 64);
    const status = clean(input.status, 64) || null;
    const reason = clean(input.reason, 1000);
    const source = clean(input.source || "manager_action_center", 64) || "manager_action_center";
    if (!tenantId)
        throw new Error("Tenant is required for manager override recording");
    if (!targetType || !targetId || !action)
        throw new Error("Manager override target and action are required");
    if (reason.length < 3)
        throw new Error("A manager override reason is required");
    const overrideId = id("mo");
    const details = input.details || {};
    await query(`INSERT INTO manager_overrides (
       id, tenant_id, override_type, target_type, target_id, action, status, reason,
       requested_by, approved_by, approved_by_name, related_sale_id, related_product_id,
       source, details, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`, [
        overrideId,
        tenantId,
        overrideType,
        targetType,
        targetId,
        action,
        status,
        reason,
        input.requestedBy || null,
        input.approvedBy || null,
        input.approvedByName || null,
        input.relatedSaleId || null,
        input.relatedProductId || null,
        source,
        json(details),
    ]);
    await recordAuditEventSafe({
        tenantId,
        action: "manager_override.recorded",
        entityType: "manager_override",
        entityId: overrideId,
        relatedSaleId: input.relatedSaleId || null,
        staffId: input.approvedBy || null,
        staffName: input.approvedByName || null,
        source,
        details: {
            overrideType,
            targetType,
            targetId,
            action,
            status,
            reason,
            requestedBy: input.requestedBy || null,
            relatedProductId: input.relatedProductId || null,
        },
    });
    return {
        id: overrideId,
        tenantId,
        overrideType,
        targetType,
        targetId,
        action,
        status,
        reason,
        requestedBy: input.requestedBy || null,
        approvedBy: input.approvedBy || null,
        approvedByName: input.approvedByName || null,
        relatedSaleId: input.relatedSaleId || null,
        relatedProductId: input.relatedProductId || null,
        source,
        details,
    };
}
export async function listManagerOverrides(tenantId: string, limit = 25) {
    const safeLimit = Math.max(1, Math.min(100, Number.isFinite(Number(limit)) ? Number(limit) : 25));
    const rows = await query<any>(`SELECT
       id,
       tenant_id AS tenantId,
       override_type AS overrideType,
       target_type AS targetType,
       target_id AS targetId,
       action,
       status,
       reason,
       requested_by AS requestedBy,
       approved_by AS approvedBy,
       approved_by_name AS approvedByName,
       related_sale_id AS relatedSaleId,
       related_product_id AS relatedProductId,
       source,
       details,
       created_at AS createdAt
     FROM manager_overrides
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`, [tenantId, safeLimit]);
    return rows.map(rowToOverride);
}
