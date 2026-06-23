import { getConnection, query } from "./db.js";
import type { QueryResultRow } from "pg";
import { applyProductStockDelta, recordAuditEvent } from "./audit.js";
type StockTakeType = "full" | "cycle" | "spot_check";
type StockTakeStatus = "draft" | "active" | "submitted" | "approved" | "cancelled";
type StockTakeRuleStatus = "active" | "paused";
type StockTakeProductScope = "random" | "low_stock" | "category" | "manual";
type VarianceReason = "count_error" | "shrinkage" | "wastage" | "damage" | "expiry" | "supplier_delivery" | "transfer" | "sale_missed" | "theft_loss" | "other";
type VarianceSeverity = "none" | "low" | "medium" | "high" | "critical";
type Actor = {
    staffId?: string | null;
    staffName?: string | null;
    role?: string | null;
    requestId?: string | null;
};
type StockTakeAssignment = {
    productId: string;
    assignedTo?: string | null;
    assignedToName?: string | null;
};
type CreateStockTakeInput = {
    name?: string | null;
    type?: StockTakeType | string | null;
    dueAt?: string | null;
    notes?: string | null;
    assignments?: StockTakeAssignment[];
};
type CountInput = {
    countedQuantity: number;
    note?: string | null;
    varianceReason?: string | null;
    requestId?: string | null;
};
type RecountInput = {
    note?: string | null;
    requestId?: string | null;
};
type StockTakeRuleInput = {
    name?: string | null;
    status?: StockTakeRuleStatus | string | null;
    runTime?: string | null;
    productScope?: StockTakeProductScope | string | null;
    productCount?: number | string | null;
    category?: string | null;
    productIds?: string[] | null;
    assignedTo?: string | null;
    assignedToName?: string | null;
};
type RunDueRulesOptions = {
    ruleId?: string | null;
    force?: boolean;
    now?: Date;
};
type StockTakeSuggestionSignal = {
    productId: string;
    productName?: string | null;
    quantity?: number;
    count?: number;
    lastSeenAt?: string | null;
};
const VARIANCE_REASONS: Record<VarianceReason, {
    label: string;
    stockReasonCode: "count_correction" | "shrinkage" | "wastage" | "transfer";
    sensitive: boolean;
}> = {
    count_error: { label: "Count error", stockReasonCode: "count_correction", sensitive: false },
    shrinkage: { label: "Shrinkage", stockReasonCode: "shrinkage", sensitive: true },
    wastage: { label: "Wastage", stockReasonCode: "wastage", sensitive: true },
    damage: { label: "Damaged stock", stockReasonCode: "wastage", sensitive: true },
    expiry: { label: "Expired stock", stockReasonCode: "wastage", sensitive: true },
    supplier_delivery: { label: "Supplier delivery mismatch", stockReasonCode: "count_correction", sensitive: false },
    transfer: { label: "Transfer mismatch", stockReasonCode: "transfer", sensitive: false },
    sale_missed: { label: "Missed sale posting", stockReasonCode: "count_correction", sensitive: false },
    theft_loss: { label: "Theft/loss", stockReasonCode: "shrinkage", sensitive: true },
    other: { label: "Other variance", stockReasonCode: "count_correction", sensitive: false },
};
function makeId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function toNumber(value: unknown) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}
function nullableNumber(...values: unknown[]) {
    const value = values.find((item) => item !== undefined);
    return value === null || value === undefined ? null : toNumber(value);
}
function toBoolean(value: unknown) {
    if (typeof value === "boolean")
        return value;
    if (typeof value === "number")
        return value !== 0;
    if (typeof value === "string")
        return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    return false;
}
function json(value: unknown, fallback: unknown = []) {
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
function cleanString(value: unknown, max = 255) {
    const text = String(value || "").trim();
    return text ? text.slice(0, max) : null;
}
function normalizeType(value: unknown): StockTakeType {
    const type = String(value || "cycle").trim();
    return type === "full" || type === "spot_check" ? type : "cycle";
}
function canOverrideStockTake(actor: Actor) {
    const role = String(actor.role || "").toLowerCase();
    return role === "admin" || role === "manager" || role === "dev";
}
function normalizeRunTime(value: unknown) {
    const time = String(value || "08:00").trim();
    if (!/^\d{2}:\d{2}$/.test(time))
        return "08:00";
    const [hours, minutes] = time.split(":").map(Number);
    if (hours > 23 || minutes > 59)
        return "08:00";
    return time;
}
function normalizeProductScope(value: unknown): StockTakeProductScope {
    const scope = String(value || "random").trim();
    if (scope === "low_stock" || scope === "category" || scope === "manual")
        return scope;
    return "random";
}
function normalizeRuleStatus(value: unknown): StockTakeRuleStatus {
    return String(value || "active").trim() === "paused" ? "paused" : "active";
}
function normalizeVarianceReason(value: unknown, absVariance: number): VarianceReason | null {
    if (absVariance <= 0.0001)
        return null;
    const reason = String(value || "count_error").trim().toLowerCase().replace(/[\s-]+/g, "_") as VarianceReason;
    return VARIANCE_REASONS[reason] ? reason : "other";
}
function varianceSeverity(absVariance: number, expectedQuantity: number, reason: VarianceReason | null): VarianceSeverity {
    if (absVariance <= 0.0001)
        return "none";
    const percentage = expectedQuantity > 0 ? (absVariance / expectedQuantity) * 100 : 100;
    const sensitive = reason ? VARIANCE_REASONS[reason]?.sensitive : false;
    if (absVariance >= 20 || percentage >= 50 || (sensitive && absVariance >= 10))
        return "critical";
    if (absVariance >= 10 || percentage >= 25 || (sensitive && absVariance >= 1))
        return "high";
    if (absVariance >= 5 || percentage >= 10 || sensitive)
        return "medium";
    return "low";
}
function supervisorRecountThreshold(expectedQuantity: number) {
    return Number((expectedQuantity > 0 ? Math.max(5, expectedQuantity * 0.2) : 1).toFixed(3));
}
function needsSupervisorRecount(absVariance: number, expectedQuantity: number, reason: VarianceReason | null, severity: VarianceSeverity) {
    if (absVariance <= 0.0001)
        return false;
    const threshold = supervisorRecountThreshold(expectedQuantity);
    const sensitive = reason ? VARIANCE_REASONS[reason]?.sensitive : false;
    return absVariance >= threshold || severity === "high" || severity === "critical" || (sensitive && absVariance >= 1);
}
function stockReasonCodeForVariance(reason: unknown) {
    const normalized = normalizeVarianceReason(reason, 1) || "count_error";
    return VARIANCE_REASONS[normalized]?.stockReasonCode || "count_correction";
}
function csvValue(value: unknown) {
    if (value === null || value === undefined)
        return "";
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function slug(value: unknown) {
    return String(value || "stocktake")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "stocktake";
}
function normalizeProductCount(value: unknown) {
    const count = Math.round(toNumber(value));
    return Math.max(1, Math.min(100, count || 5));
}
function localDateParts(now = new Date()) {
    const timeZone = process.env.APP_TIMEZONE || "Africa/Johannesburg";
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(now).reduce<Record<string, string>>((acc, part) => {
        if (part.type !== "literal")
            acc[part.type] = part.value;
        return acc;
    }, {});
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${parts.hour}:${parts.minute}`,
    };
}
function dateOnly(value: unknown) {
    if (!value)
        return null;
    if (value instanceof Date)
        return value.toISOString().slice(0, 10);
    const text = String(value);
    return text.match(/\d{4}-\d{2}-\d{2}/)?.[0] || text.slice(0, 10);
}
function rowToItem(row: any) {
    return {
        id: row.id,
        tenantId: row.tenantId ?? row.tenant_id,
        sessionId: row.sessionId ?? row.session_id,
        productId: row.productId ?? row.product_id,
        productName: row.productName ?? row.product_name,
        barcode: row.barcode,
        expectedQuantity: toNumber(row.expectedQuantity ?? row.expected_quantity),
        countedQuantity: nullableNumber(row.countedQuantity, row.counted_quantity),
        varianceQuantity: nullableNumber(row.varianceQuantity, row.variance_quantity),
        assignedTo: row.assignedTo ?? row.assigned_to,
        assignedToName: row.assignedToName ?? row.assigned_to_name,
        countedBy: row.countedBy ?? row.counted_by,
        countedByName: row.countedByName ?? row.counted_by_name,
        varianceReason: row.varianceReason ?? row.variance_reason,
        varianceReasonLabel: row.varianceReasonLabel ?? row.variance_reason_label,
        varianceSeverity: row.varianceSeverity ?? row.variance_severity ?? "none",
        supervisorRecountRequired: toBoolean(row.supervisorRecountRequired ?? row.supervisor_recount_required),
        supervisorRecountThreshold: toNumber(row.supervisorRecountThreshold ?? row.supervisor_recount_threshold),
        supervisorRecountAt: row.supervisorRecountAt ?? row.supervisor_recount_at,
        supervisorRecountBy: row.supervisorRecountBy ?? row.supervisor_recount_by,
        supervisorRecountByName: row.supervisorRecountByName ?? row.supervisor_recount_by_name,
        status: row.status || "assigned",
        countedAt: row.countedAt ?? row.counted_at,
        confirmedAt: row.confirmedAt ?? row.confirmed_at,
        confirmedBy: row.confirmedBy ?? row.confirmed_by,
        confirmedByName: row.confirmedByName ?? row.confirmed_by_name,
        note: row.note,
        createdAt: row.createdAt ?? row.created_at,
        updatedAt: row.updatedAt ?? row.updated_at,
    };
}
function rowToSession(row: any) {
    return {
        id: row.id,
        tenantId: row.tenantId ?? row.tenant_id,
        name: row.name,
        type: row.type || "cycle",
        status: row.status || "active",
        assignedBy: row.assignedBy ?? row.assigned_by,
        assignedByName: row.assignedByName ?? row.assigned_by_name,
        dueAt: row.dueAt ?? row.due_at,
        notes: row.notes,
        submittedAt: row.submittedAt ?? row.submitted_at,
        approvedAt: row.approvedAt ?? row.approved_at,
        approvedBy: row.approvedBy ?? row.approved_by,
        approvedByName: row.approvedByName ?? row.approved_by_name,
        createdAt: row.createdAt ?? row.created_at,
        updatedAt: row.updatedAt ?? row.updated_at,
        itemCount: toNumber(row.itemCount ?? row.item_count),
        countedCount: toNumber(row.countedCount ?? row.counted_count),
        varianceCount: toNumber(row.varianceCount ?? row.variance_count),
        supervisorRecountCount: toNumber(row.supervisorRecountCount ?? row.supervisor_recount_count),
    };
}
function rowToRule(row: any) {
    return {
        id: row.id,
        tenantId: row.tenantId ?? row.tenant_id,
        name: row.name,
        status: row.status || "active",
        scheduleType: row.scheduleType ?? row.schedule_type ?? "daily",
        runTime: row.runTime ?? row.run_time ?? "08:00",
        productScope: row.productScope ?? row.product_scope ?? "random",
        productCount: toNumber((row.productCount ?? row.product_count) || 5),
        category: row.category,
        productIds: parseJson(row.productIds ?? row.product_ids, []),
        assignedTo: row.assignedTo ?? row.assigned_to,
        assignedToName: row.assignedToName ?? row.assigned_to_name,
        lastRunForDate: dateOnly(row.lastRunForDate ?? row.last_run_for_date),
        lastRunAt: row.lastRunAt ?? row.last_run_at,
        createdBy: row.createdBy ?? row.created_by,
        createdByName: row.createdByName ?? row.created_by_name,
        createdAt: row.createdAt ?? row.created_at,
        updatedAt: row.updatedAt ?? row.updated_at,
    };
}
function stockTakeRiskLevel(score: number) {
    if (score >= 75)
        return "critical";
    if (score >= 45)
        return "high";
    if (score >= 20)
        return "medium";
    return "low";
}
function addSignal(map: Map<string, StockTakeSuggestionSignal>, row: any, quantityKeys: string[], countKeys: string[] = []) {
    const productId = String(row.productId ?? row.product_id ?? "");
    if (!productId)
        return;
    const signal: StockTakeSuggestionSignal = {
        productId,
        productName: row.productName ?? row.product_name ?? null,
        quantity: 0,
        count: 0,
        lastSeenAt: row.lastSeenAt ?? row.last_seen_at ?? row.lastVarianceAt ?? row.last_variance_at ?? null,
    };
    for (const key of quantityKeys) {
        signal.quantity = toNumber(row[key] ?? signal.quantity);
        if (signal.quantity)
            break;
    }
    for (const key of countKeys) {
        signal.count = toNumber(row[key] ?? signal.count);
        if (signal.count)
            break;
    }
    map.set(productId, signal);
}
async function recentRows<T extends QueryResultRow = any>(sql: string, params: any[]) {
    return query<T>(sql, params);
}
export async function getStockTakeSuggestions(tenantId: string, input: {
    limit?: string | number;
} = {}) {
    const limit = Math.min(Math.max(Math.round(toNumber(input.limit) || 12), 1), 50);
    const [products, shrinkageRows, wastageRows, varianceRows, expiryRows, velocityRows,] = await Promise.all([
        query<any>(`SELECT id, name, barcode, category, section, stock, min_stock AS minStock
         FROM products
        WHERE tenant_id = $1
        LIMIT 500`, [tenantId]),
        recentRows<any>(`SELECT product_id AS productId,
              MAX(item_name) AS productName,
              SUM(ABS(quantity_delta)) AS signalQuantity,
              COUNT(*) AS signalCount,
              MAX(created_at) AS lastSeenAt
         FROM stock_movements
        WHERE tenant_id = $1
          AND product_id IS NOT NULL
          AND reason_code = 'shrinkage'
          AND created_at >= NOW() - INTERVAL '90 days'
        GROUP BY product_id`, [tenantId]),
        recentRows<any>(`SELECT product_id AS productId,
              MAX(item_name) AS productName,
              SUM(ABS(quantity_delta)) AS signalQuantity,
              COUNT(*) AS signalCount,
              MAX(created_at) AS lastSeenAt
         FROM stock_movements
        WHERE tenant_id = $1
          AND product_id IS NOT NULL
          AND reason_code = 'wastage'
          AND created_at >= NOW() - INTERVAL '90 days'
        GROUP BY product_id`, [tenantId]),
        recentRows<any>(`SELECT product_id AS productId,
              MAX(product_name) AS productName,
              SUM(ABS(variance_quantity)) AS varianceQuantity,
              COUNT(*) AS varianceCount,
              MAX(updated_at) AS lastVarianceAt
         FROM stock_take_items
        WHERE tenant_id = $1
          AND variance_quantity IS NOT NULL
          AND ABS(variance_quantity) > 0.0001
          AND updated_at >= NOW() - INTERVAL '90 days'
        GROUP BY product_id`, [tenantId]),
        query<any>(`SELECT product_id AS productId,
              MAX(product_name) AS productName,
              SUM(remaining_quantity) AS expiryQuantity,
              MIN(expiry_date) AS nextExpiryDate
         FROM stock_batches
        WHERE tenant_id = $1
          AND status = 'active'
          AND remaining_quantity > 0
          AND expiry_date IS NOT NULL
          AND expiry_date <= CURRENT_DATE + INTERVAL '14 days'
        GROUP BY product_id`, [tenantId]),
        recentRows<any>(`SELECT si.product_id AS productId,
              MAX(si.product_name) AS productName,
              SUM(si.quantity) AS quantitySold,
              COUNT(DISTINCT s.id) AS saleCount
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
        WHERE s.tenant_id = $1
          AND s.status = 'completed'
          AND s.created_at >= NOW() - INTERVAL '90 days'
        GROUP BY si.product_id`, [tenantId]),
    ]);
    const shrinkage = new Map<string, StockTakeSuggestionSignal>();
    const wastage = new Map<string, StockTakeSuggestionSignal>();
    const variances = new Map<string, StockTakeSuggestionSignal>();
    const expiries = new Map<string, StockTakeSuggestionSignal>();
    const velocity = new Map<string, StockTakeSuggestionSignal>();
    for (const row of shrinkageRows)
        addSignal(shrinkage, row, ["signalQuantity", "signal_quantity"], ["signalCount", "signal_count"]);
    for (const row of wastageRows)
        addSignal(wastage, row, ["signalQuantity", "signal_quantity"], ["signalCount", "signal_count"]);
    for (const row of varianceRows)
        addSignal(variances, row, ["varianceQuantity", "variance_quantity"], ["varianceCount", "variance_count"]);
    for (const row of expiryRows)
        addSignal(expiries, { ...row, lastSeenAt: row.nextExpiryDate ?? row.next_expiry_date }, ["expiryQuantity", "expiry_quantity"]);
    for (const row of velocityRows)
        addSignal(velocity, row, ["quantitySold", "quantity_sold"], ["saleCount", "sale_count"]);
    const suggestions = (products || []).map((product: any) => {
        const productId = String(product.id || "");
        const stock = toNumber(product.stock);
        const minStock = toNumber(product.minStock ?? product.min_stock);
        const shrinkageSignal = shrinkage.get(productId);
        const wastageSignal = wastage.get(productId);
        const varianceSignal = variances.get(productId);
        const expirySignal = expiries.get(productId);
        const velocitySignal = velocity.get(productId);
        const quantitySold = toNumber(velocitySignal?.quantity);
        const avgDailySales = quantitySold / 90;
        const daysCover = avgDailySales > 0 ? stock / avgDailySales : null;
        const reasons: string[] = [];
        const evidence: string[] = [];
        let score = 0;
        if (stock <= Math.max(1, minStock || 0)) {
            score += stock <= 0 ? 35 : 24;
            reasons.push(stock <= 0 ? "out_of_stock" : "low_stock");
            evidence.push(`Current stock ${stock} is at or below minimum ${minStock || 1}`);
        }
        if (shrinkageSignal?.quantity) {
            score += 22 + Math.min(18, shrinkageSignal.quantity);
            reasons.push("recent_shrinkage");
            evidence.push(`${shrinkageSignal.quantity} shrinkage unit${shrinkageSignal.quantity === 1 ? "" : "s"} recorded recently`);
        }
        if (wastageSignal?.quantity) {
            score += 18 + Math.min(14, wastageSignal.quantity);
            reasons.push("recent_wastage");
            evidence.push(`${wastageSignal.quantity} wastage/damage unit${wastageSignal.quantity === 1 ? "" : "s"} recorded recently`);
        }
        if (varianceSignal?.quantity) {
            score += 24 + Math.min(20, varianceSignal.quantity);
            reasons.push("recent_variance");
            evidence.push(`${varianceSignal.quantity} absolute stocktake variance over ${varianceSignal.count || 1} count${varianceSignal.count === 1 ? "" : "s"}`);
        }
        if (expirySignal?.quantity) {
            score += 20 + Math.min(12, expirySignal.quantity);
            reasons.push("expiry_risk");
            evidence.push(`${expirySignal.quantity} unit${expirySignal.quantity === 1 ? "" : "s"} expiring within 14 days`);
        }
        if (daysCover !== null && daysCover <= 14) {
            score += daysCover <= 7 ? 18 : 10;
            reasons.push("sales_velocity");
            evidence.push(`${avgDailySales.toFixed(2)} average daily sales leaves about ${Math.max(0, daysCover).toFixed(1)} days of cover`);
        }
        return {
            productId,
            productName: product.name,
            barcode: product.barcode || null,
            category: product.category || null,
            section: product.section || null,
            stock,
            minStock,
            score: Math.round(score),
            riskLevel: stockTakeRiskLevel(score),
            reasons: [...new Set(reasons)],
            evidence,
            signals: {
                shrinkageQuantity: toNumber(shrinkageSignal?.quantity),
                wastageQuantity: toNumber(wastageSignal?.quantity),
                varianceQuantity: toNumber(varianceSignal?.quantity),
                expiryQuantity: toNumber(expirySignal?.quantity),
                quantitySold,
                avgDailySales: Number(avgDailySales.toFixed(3)),
                daysCover: daysCover === null ? null : Number(daysCover.toFixed(1)),
                lastIssueAt: shrinkageSignal?.lastSeenAt || wastageSignal?.lastSeenAt || varianceSignal?.lastSeenAt || expirySignal?.lastSeenAt || null,
            },
        };
    })
        .filter((item: any) => item.score > 0)
        .sort((a: any, b: any) => b.score - a.score || a.productName.localeCompare(b.productName))
        .slice(0, limit);
    return {
        suggestions,
        generatedAt: new Date().toISOString(),
        signalWindowDays: 90,
        expiryWindowDays: 14,
    };
}
async function getStaffNameMap(tenantId: string, staffIds: string[]) {
    const ids = [...new Set(staffIds.filter(Boolean))];
    if (!ids.length)
        return new Map<string, string>();
    const placeholders = ids.map(() => "$1").join(",");
    const rows = await query<any>(`SELECT id, name FROM staff WHERE tenant_id = $1 AND id IN (${placeholders})`, [tenantId, ...ids]);
    return new Map(rows.map((row: any) => [String(row.id), String(row.name || row.id)]));
}
function normalizeRuleInput(input: StockTakeRuleInput) {
    const productScope = normalizeProductScope(input.productScope);
    const productIds = Array.isArray(input.productIds)
        ? [...new Set(input.productIds.map((id) => cleanString(id, 64)).filter(Boolean) as string[])]
        : [];
    return {
        name: cleanString(input.name, 255) || "Daily spot check",
        status: normalizeRuleStatus(input.status),
        runTime: normalizeRunTime(input.runTime),
        productScope,
        productCount: normalizeProductCount(input.productCount),
        category: productScope === "category" ? cleanString(input.category, 255) : null,
        productIds: productScope === "manual" ? productIds : [],
        assignedTo: cleanString(input.assignedTo, 64),
        assignedToName: cleanString(input.assignedToName, 255),
    };
}
async function selectRuleProducts(tenantId: string, rule: any) {
    const scope = rule.productScope ?? rule.product_scope ?? "random";
    const count = normalizeProductCount(rule.productCount ?? rule.product_count);
    const category = cleanString(rule.category, 255);
    const productIds = parseJson(rule.productIds ?? rule.product_ids, [])
        .map((id: unknown) => cleanString(id, 64))
        .filter(Boolean) as string[];
    if (scope === "manual") {
        if (!productIds.length)
            return [];
        const placeholders = productIds.map(() => "$1").join(",");
        return query<any>(`SELECT id, name, stock, min_stock AS minStock, barcode
         FROM products
        WHERE tenant_id = $1 AND id IN (${placeholders})
        ORDER BY name ASC
        LIMIT $2`, [tenantId, ...productIds, count]);
    }
    if (scope === "category" && category) {
        return query<any>(`SELECT id, name, stock, min_stock AS minStock, barcode
         FROM products
        WHERE tenant_id = $1 AND category = $2
        ORDER BY name ASC
        LIMIT $3`, [tenantId, category, count]);
    }
    if (scope === "low_stock") {
        return query<any>(`SELECT id, name, stock, min_stock AS minStock, barcode
         FROM products
        WHERE tenant_id = $1
          AND stock <= CASE WHEN COALESCE(min_stock, 0) > 0 THEN min_stock ELSE 10 END
        ORDER BY stock ASC, name ASC
        LIMIT $2`, [tenantId, count]);
    }
    return query<any>(`SELECT id, name, stock, min_stock AS minStock, barcode
       FROM products
      WHERE tenant_id = $1
      ORDER BY RANDOM()
      LIMIT $2`, [tenantId, count]);
}
export async function getStockTakeRules(tenantId: string) {
    const rows = await query<any>(`SELECT id,
            tenant_id AS tenantId,
            name,
            status,
            schedule_type AS scheduleType,
            run_time AS runTime,
            product_scope AS productScope,
            product_count AS productCount,
            category,
            product_ids AS productIds,
            assigned_to AS assignedTo,
            assigned_to_name AS assignedToName,
            last_run_for_date AS lastRunForDate,
            last_run_at AS lastRunAt,
            created_by AS createdBy,
            created_by_name AS createdByName,
            created_at AS createdAt,
            updated_at AS updatedAt
       FROM stock_take_rules
      WHERE tenant_id = $1
      ORDER BY status ASC, run_time ASC, name ASC`, [tenantId]);
    return rows.map(rowToRule);
}
export async function createStockTakeRule(tenantId: string, input: StockTakeRuleInput, actor: Actor) {
    const rule = normalizeRuleInput(input);
    if (rule.productScope === "category" && !rule.category) {
        throw new Error("Choose a category for this spot-check rule.");
    }
    if (rule.productScope === "manual" && !rule.productIds.length) {
        throw new Error("Choose at least one product for a manual spot-check rule.");
    }
    const staffNameMap = await getStaffNameMap(tenantId, rule.assignedTo ? [rule.assignedTo] : []);
    const assignedToName = rule.assignedToName || (rule.assignedTo ? staffNameMap.get(rule.assignedTo) : null) || null;
    const ruleId = makeId("stkr");
    await query(`INSERT INTO stock_take_rules (
       id, tenant_id, name, status, schedule_type, run_time, product_scope, product_count,
       category, product_ids, assigned_to, assigned_to_name, created_by, created_by_name,
       created_at, updated_at
     ) VALUES ($1, $2, $3, $4, 'daily', $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`, [
        ruleId,
        tenantId,
        rule.name,
        rule.status,
        rule.runTime,
        rule.productScope,
        rule.productCount,
        rule.category,
        json(rule.productIds, []),
        rule.assignedTo,
        assignedToName,
        actor.staffId || null,
        actor.staffName || null,
    ]);
    await recordAuditEvent({ query } as any, {
        tenantId,
        action: "stocktake.rule_created",
        entityType: "stock_take_rule",
        entityId: ruleId,
        staffId: actor.staffId || null,
        staffName: actor.staffName || null,
        source: "stocktake_rules",
        details: { ...rule, assignedToName },
    });
    const rules = await getStockTakeRules(tenantId);
    return rules.find((item) => item.id === ruleId) || rowToRule({
        id: ruleId,
        tenantId,
        ...rule,
        assignedToName,
        scheduleType: "daily",
    });
}
export async function updateStockTakeRule(tenantId: string, ruleId: string, input: StockTakeRuleInput, actor: Actor) {
    const existingRows = await query<any>(`SELECT * FROM stock_take_rules WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, ruleId]);
    const existing = existingRows[0];
    if (!existing)
        throw new Error("Stocktake rule not found.");
    const current = rowToRule(existing);
    const next = normalizeRuleInput({
        name: input.name ?? current.name,
        status: input.status ?? current.status,
        runTime: input.runTime ?? current.runTime,
        productScope: input.productScope ?? current.productScope,
        productCount: input.productCount ?? current.productCount,
        category: input.category ?? current.category,
        productIds: input.productIds ?? current.productIds,
        assignedTo: input.assignedTo ?? current.assignedTo,
        assignedToName: input.assignedToName ?? current.assignedToName,
    });
    if (next.productScope === "category" && !next.category) {
        throw new Error("Choose a category for this spot-check rule.");
    }
    if (next.productScope === "manual" && !next.productIds.length) {
        throw new Error("Choose at least one product for a manual spot-check rule.");
    }
    const staffNameMap = await getStaffNameMap(tenantId, next.assignedTo ? [next.assignedTo] : []);
    const assignedToName = next.assignedToName || (next.assignedTo ? staffNameMap.get(next.assignedTo) : null) || null;
    await query(`UPDATE stock_take_rules
        SET name = $1,
            status = $2,
            run_time = $3,
            product_scope = $4,
            product_count = $5,
            category = $6,
            product_ids = $7,
            assigned_to = $8,
            assigned_to_name = $9,
            updated_at = NOW()
      WHERE tenant_id = $10 AND id = $11`, [
        next.name,
        next.status,
        next.runTime,
        next.productScope,
        next.productCount,
        next.category,
        json(next.productIds, []),
        next.assignedTo,
        assignedToName,
        tenantId,
        ruleId,
    ]);
    await recordAuditEvent({ query } as any, {
        tenantId,
        action: "stocktake.rule_updated",
        entityType: "stock_take_rule",
        entityId: ruleId,
        staffId: actor.staffId || null,
        staffName: actor.staffName || null,
        source: "stocktake_rules",
        details: { ...next, assignedToName },
    });
    const rules = await getStockTakeRules(tenantId);
    return rules.find((item) => item.id === ruleId) || null;
}
export async function deleteStockTakeRule(tenantId: string, ruleId: string, actor: Actor) {
    const existingRows = await query<any>(`SELECT id, name FROM stock_take_rules WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, ruleId]);
    if (!existingRows[0])
        throw new Error("Stocktake rule not found.");
    await query(`DELETE FROM stock_take_rules WHERE tenant_id = $1 AND id = $2`, [tenantId, ruleId]);
    await recordAuditEvent({ query } as any, {
        tenantId,
        action: "stocktake.rule_deleted",
        entityType: "stock_take_rule",
        entityId: ruleId,
        staffId: actor.staffId || null,
        staffName: actor.staffName || null,
        source: "stocktake_rules",
        details: { name: existingRows[0].name },
    });
    return { success: true };
}
export async function runDueStockTakeRules(tenantId: string, actor: Actor, options: RunDueRulesOptions = {}) {
    const { date: today, time } = localDateParts(options.now);
    const where = ["tenant_id = $1", "status = 'active'"];
    const params: any[] = [tenantId];
    if (options.ruleId) {
        where.push("id = $1");
        params.push(options.ruleId);
    }
    const rules = await query<any>(`SELECT * FROM stock_take_rules WHERE ${where.join(" AND ")} ORDER BY run_time ASC, name ASC`, params);
    const generated: any[] = [];
    const skipped: any[] = [];
    for (const rawRule of rules) {
        const rule = rowToRule(rawRule);
        const alreadyRan = dateOnly(rule.lastRunForDate) === today;
        const dueByTime = String(rule.runTime || "08:00") <= time;
        if (!options.force && (alreadyRan || !dueByTime)) {
            skipped.push({
                ruleId: rule.id,
                name: rule.name,
                reason: alreadyRan ? "already_generated_today" : "not_due_yet",
            });
            continue;
        }
        const products = await selectRuleProducts(tenantId, rule);
        if (!products.length) {
            skipped.push({ ruleId: rule.id, name: rule.name, reason: "no_matching_products" });
            continue;
        }
        const session = await createStockTakeSession(tenantId, {
            name: `${rule.name} - ${today}`,
            type: "spot_check",
            dueAt: `${today}T${rule.runTime || "08:00"}`,
            notes: `Generated by daily spot-check rule: ${rule.name}`,
            assignments: products.map((product: any) => ({
                productId: product.id,
                assignedTo: rule.assignedTo || null,
                assignedToName: rule.assignedToName || null,
            })),
        }, actor);
        await query(`UPDATE stock_take_rules
          SET last_run_for_date = $1,
              last_run_at = NOW(),
              updated_at = NOW()
        WHERE tenant_id = $2 AND id = $3`, [today, tenantId, rule.id]);
        await recordAuditEvent({ query } as any, {
            tenantId,
            action: "stocktake.rule_run",
            entityType: "stock_take_rule",
            entityId: rule.id,
            staffId: actor.staffId || null,
            staffName: actor.staffName || null,
            source: "stocktake_rules",
            details: {
                sessionId: session?.id || null,
                date: today,
                productCount: products.length,
                productScope: rule.productScope,
            },
        });
        generated.push({ rule, session, productCount: products.length });
    }
    return {
        generated,
        skipped,
        generatedAt: new Date().toISOString(),
    };
}
export async function createStockTakeSession(tenantId: string, input: CreateStockTakeInput, actor: Actor) {
    const type = normalizeType(input.type);
    const assignments: Array<{
        productId: string;
        assignedTo: string | null;
        assignedToName: string | null;
    }> = [];
    for (const assignment of input.assignments || []) {
        const productId = cleanString(assignment.productId, 64);
        if (!productId)
            continue;
        assignments.push({
            productId,
            assignedTo: cleanString(assignment.assignedTo, 64),
            assignedToName: cleanString(assignment.assignedToName, 255),
        });
    }
    const uniqueAssignments = Array.from(new Map(assignments.map((assignment) => [assignment.productId, assignment])).values());
    if (!uniqueAssignments.length) {
        throw new Error("Choose at least one product to count.");
    }
    const productIds = uniqueAssignments.map((assignment) => assignment.productId);
    const productPlaceholders = productIds.map(() => "$1").join(",");
    const products = await query<any>(`SELECT id, name, barcode, stock
       FROM products
      WHERE tenant_id = $1 AND id IN (${productPlaceholders})`, [tenantId, ...productIds]);
    const productMap = new Map(products.map((product: any) => [String(product.id), product]));
    const missingProduct = productIds.find((productId) => !productMap.has(productId));
    if (missingProduct) {
        throw new Error(`Product not found for stocktake: ${missingProduct}`);
    }
    const staffNameMap = await getStaffNameMap(tenantId, uniqueAssignments.map((assignment) => assignment.assignedTo || ""));
    const sessionId = makeId(type === "spot_check" ? "spot" : "stkt");
    const defaultName = type === "spot_check"
        ? "Spot check"
        : type === "full"
            ? "Full stocktake"
            : "Cycle count";
    const name = cleanString(input.name, 255) || `${defaultName} ${new Date().toLocaleDateString("en-ZA")}`;
    const dueAt = cleanString(input.dueAt, 64);
    const notes = cleanString(input.notes, 2000);
    const conn = await getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(`INSERT INTO stock_take_sessions (
         id, tenant_id, name, type, status, assigned_by, assigned_by_name,
         due_at, notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, NOW(), NOW())`, [
            sessionId,
            tenantId,
            name,
            type,
            actor.staffId || null,
            actor.staffName || null,
            dueAt,
            notes,
        ]);
        for (const assignment of uniqueAssignments) {
            const product = productMap.get(assignment.productId)!;
            const assignedToName = assignment.assignedToName || (assignment.assignedTo ? staffNameMap.get(assignment.assignedTo) : null) || null;
            await conn.query(`INSERT INTO stock_take_items (
           id, tenant_id, session_id, product_id, product_name, barcode,
           expected_quantity, assigned_to, assigned_to_name, status,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'assigned', NOW(), NOW())`, [
                makeId("stki"),
                tenantId,
                sessionId,
                product.id,
                product.name,
                product.barcode || null,
                toNumber(product.stock),
                assignment.assignedTo || null,
                assignedToName,
            ]);
        }
        await recordAuditEvent(conn, {
            tenantId,
            action: "stocktake.created",
            entityType: "stock_take_session",
            entityId: sessionId,
            staffId: actor.staffId || null,
            staffName: actor.staffName || null,
            source: type === "spot_check" ? "action_center" : "inventory",
            details: {
                name,
                type,
                dueAt,
                itemCount: uniqueAssignments.length,
            },
        });
        await conn.commit();
    }
    catch (err) {
        await conn.rollback();
        throw err;
    }
    finally {
        conn.release();
    }
    return getStockTakeSession(tenantId, sessionId);
}
export async function getStockTakeSessions(tenantId: string, filters: {
    status?: string;
    type?: string;
} = {}) {
    const where = ["s.tenant_id = $1"];
    const params: any[] = [tenantId];
    if (filters.status) {
        where.push("s.status = $1");
        params.push(filters.status);
    }
    if (filters.type) {
        where.push("s.type = $1");
        params.push(filters.type);
    }
    const rows = await query<any>(`SELECT s.id,
            s.tenant_id AS tenantId,
            s.name,
            s.type,
            s.status,
            s.assigned_by AS assignedBy,
            s.assigned_by_name AS assignedByName,
            s.due_at AS dueAt,
            s.notes,
            s.submitted_at AS submittedAt,
            s.approved_at AS approvedAt,
            s.approved_by AS approvedBy,
            s.approved_by_name AS approvedByName,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt,
            COUNT(i.id) AS itemCount,
            SUM(CASE WHEN i.status IN ('counted','confirmed') THEN 1 ELSE 0 END) AS countedCount,
            SUM(CASE WHEN i.variance_quantity IS NOT NULL AND ABS(i.variance_quantity) > 0.0001 THEN 1 ELSE 0 END) AS varianceCount,
            SUM(CASE WHEN COALESCE(i.supervisor_recount_required, 0) <> 0 AND i.supervisor_recount_at IS NULL THEN 1 ELSE 0 END) AS supervisorRecountCount
       FROM stock_take_sessions s
       LEFT JOIN stock_take_items i ON i.session_id = s.id AND i.tenant_id = s.tenant_id
      WHERE ${where.join(" AND ")}
      GROUP BY s.id, s.tenant_id, s.name, s.type, s.status, s.assigned_by, s.assigned_by_name,
               s.due_at, s.notes, s.submitted_at, s.approved_at, s.approved_by, s.approved_by_name,
               s.created_at, s.updated_at
      ORDER BY s.updated_at DESC
      LIMIT 50`, params);
    return rows.map(rowToSession);
}
export async function getStockTakeSession(tenantId: string, sessionId: string) {
    const sessions = await query<any>(`SELECT s.id,
            s.tenant_id AS tenantId,
            s.name,
            s.type,
            s.status,
            s.assigned_by AS assignedBy,
            s.assigned_by_name AS assignedByName,
            s.due_at AS dueAt,
            s.notes,
            s.submitted_at AS submittedAt,
            s.approved_at AS approvedAt,
            s.approved_by AS approvedBy,
            s.approved_by_name AS approvedByName,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt,
            COUNT(i.id) AS itemCount,
            SUM(CASE WHEN i.status IN ('counted','confirmed') THEN 1 ELSE 0 END) AS countedCount,
            SUM(CASE WHEN i.variance_quantity IS NOT NULL AND ABS(i.variance_quantity) > 0.0001 THEN 1 ELSE 0 END) AS varianceCount,
            SUM(CASE WHEN COALESCE(i.supervisor_recount_required, 0) <> 0 AND i.supervisor_recount_at IS NULL THEN 1 ELSE 0 END) AS supervisorRecountCount
       FROM stock_take_sessions s
       LEFT JOIN stock_take_items i ON i.session_id = s.id AND i.tenant_id = s.tenant_id
      WHERE s.tenant_id = $1 AND s.id = $2
      GROUP BY s.id, s.tenant_id, s.name, s.type, s.status, s.assigned_by, s.assigned_by_name,
               s.due_at, s.notes, s.submitted_at, s.approved_at, s.approved_by, s.approved_by_name,
               s.created_at, s.updated_at
      LIMIT 1`, [tenantId, sessionId]);
    const session = sessions[0];
    if (!session)
        return null;
    const items = await query<any>(`SELECT id,
            tenant_id AS tenantId,
            session_id AS sessionId,
            product_id AS productId,
            product_name AS productName,
            barcode,
            expected_quantity AS expectedQuantity,
            counted_quantity AS countedQuantity,
            variance_quantity AS varianceQuantity,
            assigned_to AS assignedTo,
            assigned_to_name AS assignedToName,
            counted_by AS countedBy,
            counted_by_name AS countedByName,
            variance_reason AS varianceReason,
            variance_reason_label AS varianceReasonLabel,
            variance_severity AS varianceSeverity,
            supervisor_recount_required AS supervisorRecountRequired,
            supervisor_recount_threshold AS supervisorRecountThreshold,
            supervisor_recount_at AS supervisorRecountAt,
            supervisor_recount_by AS supervisorRecountBy,
            supervisor_recount_by_name AS supervisorRecountByName,
            status,
            counted_at AS countedAt,
            confirmed_at AS confirmedAt,
            confirmed_by AS confirmedBy,
            confirmed_by_name AS confirmedByName,
            note,
            created_at AS createdAt,
            updated_at AS updatedAt
       FROM stock_take_items
      WHERE tenant_id = $1 AND session_id = $2
      ORDER BY status = 'recount' DESC, product_name ASC`, [tenantId, sessionId]);
    return {
        ...rowToSession(session),
        items: items.map(rowToItem),
    };
}
export async function getStockTakeExportPack(tenantId: string, sessionId: string) {
    const session = await getStockTakeSession(tenantId, sessionId);
    if (!session)
        throw new Error("Stocktake session not found.");
    const headers = [
        "Session ID",
        "Session Name",
        "Status",
        "Product ID",
        "Product",
        "Barcode",
        "Assigned To",
        "Expected Quantity",
        "Counted Quantity",
        "Variance Quantity",
        "Variance Reason",
        "Variance Severity",
        "Supervisor Recount Required",
        "Supervisor Recount At",
        "Counted By",
        "Confirmed By",
        "Line Status",
        "Note",
    ];
    const rows = (session.items || []).map((item: any) => [
        session.id,
        session.name,
        session.status,
        item.productId,
        item.productName,
        item.barcode || "",
        item.assignedToName || item.assignedTo || "",
        item.expectedQuantity,
        item.countedQuantity ?? "",
        item.varianceQuantity ?? "",
        item.varianceReasonLabel || "",
        item.varianceSeverity || "none",
        item.supervisorRecountRequired ? "yes" : "no",
        item.supervisorRecountAt || "",
        item.countedByName || item.countedBy || "",
        item.confirmedByName || item.confirmedBy || "",
        item.status,
        item.note || "",
    ]);
    const csv = [headers, ...rows]
        .map((row) => row.map(csvValue).join(","))
        .join("\n");
    return {
        filename: `${slug(session.name)}-${session.id}-stocktake-export.csv`,
        generatedAt: new Date().toISOString(),
        headers,
        rows,
        csv,
        varianceReasons: Object.entries(VARIANCE_REASONS).map(([value, config]) => ({
            value,
            label: config.label,
            stockReasonCode: config.stockReasonCode,
            supervisorSensitive: config.sensitive,
        })),
        session: {
            id: session.id,
            name: session.name,
            type: session.type,
            status: session.status,
            itemCount: session.itemCount,
            countedCount: session.countedCount,
            varianceCount: session.varianceCount,
            supervisorRecountCount: session.supervisorRecountCount,
        },
    };
}
export async function getMyStockTakeAssignments(tenantId: string, staffId: string) {
    const id = cleanString(staffId, 64);
    if (!id)
        throw new Error("Staff identity is required to load stocktake assignments.");
    const rows = await query<any>(`SELECT i.id,
            i.tenant_id AS tenantId,
            i.session_id AS sessionId,
            i.product_id AS productId,
            i.product_name AS productName,
            i.barcode,
            i.expected_quantity AS expectedQuantity,
            i.counted_quantity AS countedQuantity,
            i.variance_quantity AS varianceQuantity,
            i.assigned_to AS assignedTo,
            i.assigned_to_name AS assignedToName,
            i.counted_by AS countedBy,
            i.counted_by_name AS countedByName,
            i.variance_reason AS varianceReason,
            i.variance_reason_label AS varianceReasonLabel,
            i.variance_severity AS varianceSeverity,
            i.supervisor_recount_required AS supervisorRecountRequired,
            i.supervisor_recount_threshold AS supervisorRecountThreshold,
            i.supervisor_recount_at AS supervisorRecountAt,
            i.supervisor_recount_by AS supervisorRecountBy,
            i.supervisor_recount_by_name AS supervisorRecountByName,
            i.status,
            i.counted_at AS countedAt,
            i.confirmed_at AS confirmedAt,
            i.confirmed_by AS confirmedBy,
            i.confirmed_by_name AS confirmedByName,
            i.note,
            i.created_at AS createdAt,
            i.updated_at AS updatedAt,
            s.name AS sessionName,
            s.type AS sessionType,
            s.due_at AS dueAt
       FROM stock_take_items i
       JOIN stock_take_sessions s ON s.id = i.session_id AND s.tenant_id = i.tenant_id
      WHERE i.tenant_id = $1
        AND i.assigned_to = $2
        AND s.status IN ('active','submitted')
        AND i.status IN ('assigned','counted','recount')
      ORDER BY s.due_at IS NULL ASC, s.due_at ASC, i.status = 'recount' DESC, i.product_name ASC`, [tenantId, id]);
    return rows.map((row) => ({
        ...rowToItem(row),
        sessionName: row.sessionName ?? row.session_name,
        sessionType: row.sessionType ?? row.session_type,
        dueAt: row.dueAt ?? row.due_at,
    }));
}
export async function submitStockTakeCount(tenantId: string, itemId: string, input: CountInput, actor: Actor) {
    const countedQuantity = toNumber(input.countedQuantity);
    if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
        throw new Error("Counted quantity must be zero or more.");
    }
    const rows = await query<any>(`SELECT i.id,
            i.tenant_id AS tenantId,
            i.session_id AS sessionId,
            i.product_id AS productId,
            i.product_name AS productName,
            i.expected_quantity AS expectedQuantity,
            i.assigned_to AS assignedTo,
            i.assigned_to_name AS assignedToName,
            i.supervisor_recount_required AS supervisorRecountRequired,
            i.status,
            s.status AS sessionStatus
       FROM stock_take_items i
       JOIN stock_take_sessions s ON s.id = i.session_id AND s.tenant_id = i.tenant_id
      WHERE i.tenant_id = $1 AND i.id = $2
      LIMIT 1`, [tenantId, itemId]);
    const item = rows[0];
    if (!item)
        throw new Error("Stocktake item not found.");
    if (!["active", "submitted"].includes(item.sessionStatus ?? item.session_status)) {
        throw new Error("This stocktake is not open for counts.");
    }
    const assignedTo = item.assignedTo ?? item.assigned_to;
    if (!canOverrideStockTake(actor) && (!actor.staffId || assignedTo !== actor.staffId)) {
        throw new Error("This count is assigned to another staff member.");
    }
    const expectedQuantity = toNumber(item.expectedQuantity ?? item.expected_quantity);
    const varianceQuantity = Number((countedQuantity - expectedQuantity).toFixed(3));
    const absVariance = Math.abs(varianceQuantity);
    const varianceReason = normalizeVarianceReason(input.varianceReason, absVariance);
    const varianceReasonLabel = varianceReason ? VARIANCE_REASONS[varianceReason].label : null;
    const severity = varianceSeverity(absVariance, expectedQuantity, varianceReason);
    const recountThreshold = supervisorRecountThreshold(expectedQuantity);
    const supervisorRequired = needsSupervisorRecount(absVariance, expectedQuantity, varianceReason, severity);
    const supervisorRecountPerformed = supervisorRequired && canOverrideStockTake(actor);
    const note = cleanString(input.note, 1000);
    const sessionId = item.sessionId ?? item.session_id;
    await query(`UPDATE stock_take_items
        SET counted_quantity = $1,
            variance_quantity = $2,
            variance_reason = $3,
            variance_reason_label = $4,
            variance_severity = $5,
            supervisor_recount_required = $6,
            supervisor_recount_threshold = $7,
            supervisor_recount_at = $8,
            supervisor_recount_by = $9,
            supervisor_recount_by_name = $10,
            counted_by = $11,
            counted_by_name = $12,
            status = 'counted',
            counted_at = NOW(),
            note = $13,
            updated_at = NOW()
      WHERE tenant_id = $14 AND id = $15`, [
        countedQuantity,
        varianceQuantity,
        varianceReason,
        varianceReasonLabel,
        severity,
        supervisorRequired ? 1 : 0,
        supervisorRequired ? recountThreshold : 0,
        supervisorRecountPerformed ? new Date() : null,
        supervisorRecountPerformed ? actor.staffId || null : null,
        supervisorRecountPerformed ? actor.staffName || null : null,
        actor.staffId || assignedTo || null,
        actor.staffName || item.assignedToName || item.assigned_to_name || null,
        note,
        tenantId,
        itemId,
    ]);
    const remaining = await query<any>(`SELECT COUNT(*) AS remaining
       FROM stock_take_items
      WHERE tenant_id = $1 AND session_id = $2 AND status IN ('assigned','recount')`, [tenantId, sessionId]);
    if (toNumber(remaining[0]?.remaining) === 0) {
        await query(`UPDATE stock_take_sessions
          SET status = 'submitted',
              submitted_at = COALESCE(submitted_at, NOW()),
              updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2 AND status = 'active'`, [tenantId, sessionId]);
    }
    await recordAuditEvent({ query } as any, {
        tenantId,
        action: "stocktake.item_counted",
        entityType: "stock_take_item",
        entityId: itemId,
        requestId: input.requestId || actor.requestId || null,
        staffId: actor.staffId || null,
        staffName: actor.staffName || null,
        source: "mobile_stocktake",
        details: {
            sessionId,
            productId: item.productId ?? item.product_id,
            productName: item.productName ?? item.product_name,
            countedQuantity,
            expectedQuantity,
            varianceQuantity,
            varianceReason,
            varianceReasonLabel,
            varianceSeverity: severity,
            supervisorRecountRequired: supervisorRequired,
            supervisorRecountThreshold: supervisorRequired ? recountThreshold : 0,
            supervisorRecountPerformed,
        },
    });
    return getStockTakeSession(tenantId, sessionId);
}
export async function requestStockTakeRecount(tenantId: string, itemId: string, input: RecountInput, actor: Actor) {
    const rows = await query<any>(`SELECT i.id,
            i.session_id AS sessionId,
            i.product_id AS productId,
            i.product_name AS productName,
            i.expected_quantity AS expectedQuantity,
            i.variance_quantity AS varianceQuantity
       FROM stock_take_items i
       JOIN stock_take_sessions s ON s.id = i.session_id AND s.tenant_id = i.tenant_id
      WHERE i.tenant_id = $1 AND i.id = $2 AND s.status IN ('active','submitted')
      LIMIT 1`, [tenantId, itemId]);
    const item = rows[0];
    if (!item)
        throw new Error("Stocktake item not found or not open.");
    const expectedQuantity = toNumber(item.expectedQuantity ?? item.expected_quantity);
    await query(`UPDATE stock_take_items
        SET status = 'recount',
            supervisor_recount_required = 1,
            supervisor_recount_threshold = $1,
            supervisor_recount_at = NULL,
            supervisor_recount_by = NULL,
            supervisor_recount_by_name = NULL,
            note = $2,
            updated_at = NOW()
      WHERE tenant_id = $3 AND id = $4`, [supervisorRecountThreshold(expectedQuantity), cleanString(input.note, 1000), tenantId, itemId]);
    await query(`UPDATE stock_take_sessions
        SET status = 'active',
            updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2 AND status = 'submitted'`, [tenantId, item.sessionId ?? item.session_id]);
    await recordAuditEvent({ query } as any, {
        tenantId,
        action: "stocktake.recount_requested",
        entityType: "stock_take_item",
        entityId: itemId,
        requestId: input.requestId || actor.requestId || null,
        staffId: actor.staffId || null,
        staffName: actor.staffName || null,
        source: "manager_action_center",
        details: {
            sessionId: item.sessionId ?? item.session_id,
            productId: item.productId ?? item.product_id,
            productName: item.productName ?? item.product_name,
            note: cleanString(input.note, 1000),
        },
    });
    return getStockTakeSession(tenantId, item.sessionId ?? item.session_id);
}
export async function approveStockTakeSession(tenantId: string, sessionId: string, actor: Actor) {
    const conn = await getConnection();
    const applied: any[] = [];
    try {
        await conn.beginTransaction();
        const [sessionRows] = await conn.query<any>(`SELECT id, name, type, status
         FROM stock_take_sessions
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
        FOR UPDATE`, [tenantId, sessionId]);
        const session = sessionRows[0];
        if (!session)
            throw new Error("Stocktake session not found.");
        if (!["active", "submitted"].includes(session.status)) {
            throw new Error("Only active or submitted stocktakes can be approved.");
        }
        const [items] = await conn.query<any>(`SELECT id,
              product_id AS productId,
              product_name AS productName,
              expected_quantity AS expectedQuantity,
              counted_quantity AS countedQuantity,
              variance_quantity AS varianceQuantity,
              variance_reason AS varianceReason,
              variance_reason_label AS varianceReasonLabel,
              variance_severity AS varianceSeverity,
              supervisor_recount_required AS supervisorRecountRequired,
              supervisor_recount_at AS supervisorRecountAt,
              status
         FROM stock_take_items
        WHERE tenant_id = $1 AND session_id = $2
        ORDER BY product_name ASC
        FOR UPDATE`, [tenantId, sessionId]);
        if (!items.length)
            throw new Error("This stocktake has no products.");
        const uncounted = items.filter((item: any) => !["counted", "confirmed"].includes(item.status));
        if (uncounted.length) {
            throw new Error("All assigned products must be counted or recounted before approval.");
        }
        const pendingSupervisorRecounts = items.filter((item: any) => (toBoolean(item.supervisorRecountRequired ?? item.supervisor_recount_required)
            && !item.supervisorRecountAt
            && Math.abs(toNumber(item.varianceQuantity ?? item.variance_quantity)) > 0.0001));
        if (pendingSupervisorRecounts.length) {
            throw new Error("Supervisor recount is required before approval for high-risk stocktake variances.");
        }
        for (const item of items) {
            const variance = toNumber(item.varianceQuantity ?? item.variance_quantity);
            if (Math.abs(variance) > 0.0001) {
                const varianceReason = item.varianceReason ?? item.variance_reason ?? "count_error";
                const varianceReasonLabel = item.varianceReasonLabel ?? item.variance_reason_label ?? VARIANCE_REASONS.count_error.label;
                const result = await applyProductStockDelta(conn, {
                    tenantId,
                    productId: item.productId ?? item.product_id,
                    itemName: item.productName ?? item.product_name,
                    quantityDelta: variance,
                    reason: "stock_take",
                    reasonCode: stockReasonCodeForVariance(varianceReason),
                    referenceType: "stock_take_session",
                    referenceId: sessionId,
                    staffId: actor.staffId || null,
                    staffName: actor.staffName || null,
                    note: `Approved ${session.type === "spot_check" ? "spot check" : "stocktake"}: ${session.name} (${varianceReasonLabel})`,
                });
                if (result) {
                    applied.push({
                        itemId: item.id,
                        productId: item.productId ?? item.product_id,
                        productName: item.productName ?? item.product_name,
                        ...result,
                    });
                }
            }
            await conn.query(`UPDATE stock_take_items
            SET status = 'confirmed',
                confirmed_at = NOW(),
                confirmed_by = $1,
                confirmed_by_name = $2,
                updated_at = NOW()
          WHERE tenant_id = $3 AND id = $4`, [actor.staffId || null, actor.staffName || null, tenantId, item.id]);
        }
        await conn.query(`UPDATE stock_take_sessions
          SET status = 'approved',
              approved_at = NOW(),
              approved_by = $1,
              approved_by_name = $2,
              updated_at = NOW()
        WHERE tenant_id = $3 AND id = $4`, [actor.staffId || null, actor.staffName || null, tenantId, sessionId]);
        await recordAuditEvent(conn, {
            tenantId,
            action: "stocktake.approved",
            entityType: "stock_take_session",
            requestId: actor.requestId || null,
            entityId: sessionId,
            staffId: actor.staffId || null,
            staffName: actor.staffName || null,
            source: "manager_action_center",
            details: {
                name: session.name,
                type: session.type,
                itemCount: items.length,
                adjustedItemCount: applied.length,
                totalVariance: Number(applied.reduce((sum, item) => sum + toNumber(item.quantityDelta), 0).toFixed(3)),
            },
        });
        await conn.commit();
    }
    catch (err) {
        await conn.rollback();
        throw err;
    }
    finally {
        conn.release();
    }
    const session = await getStockTakeSession(tenantId, sessionId);
    return {
        ...session,
        applied,
    };
}
