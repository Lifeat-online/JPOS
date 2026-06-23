import { query } from "./db.js";
type QueryRunner = {
    query: (sql: string, params?: any[]) => Promise<any>;
};
export type PromotionDiscountType = "percent" | "fixed";
export type PromotionStatus = "active" | "inactive";
export type PromotionAppliesTo = "cart" | "products" | "categories";
export type PromotionCustomerScope = "all" | "selected" | "no_customer";
export interface Promotion {
    id: string;
    tenantId?: string;
    code: string;
    name: string;
    description?: string | null;
    status: PromotionStatus;
    discountType: PromotionDiscountType;
    discountValue: number;
    startsAt?: string | null;
    endsAt?: string | null;
    minSubtotal: number;
    maxDiscountAmount?: number | null;
    appliesTo: PromotionAppliesTo;
    targetProductIds: string[];
    targetCategories: string[];
    customerScope: PromotionCustomerScope;
    targetCustomerIds: string[];
    totalRedemptionLimit?: number | null;
    perCustomerLimit?: number | null;
    redemptionCount: number;
    createdBy?: string | null;
    createdByName?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
}
export interface PromotionSaleItem {
    id?: string | null;
    productId?: string | null;
    name?: string | null;
    category?: string | null;
    section?: string | null;
    subCategory?: string | null;
    price: number;
    quantity: number;
}
export interface PromotionValidationInput {
    promotionId?: string | null;
    code?: string | null;
    customerId?: string | null;
    items: PromotionSaleItem[];
    subtotal?: number | null;
    totalBeforeDiscount?: number | null;
    promotionDiscount?: number | null;
    now?: Date | string | null;
}
export interface PromotionValidationResult {
    valid: boolean;
    reason?: string;
    promotion: Promotion | null;
    discountAmount: number;
    targetSubtotal: number;
    remainingRedemptions?: number | null;
}
export interface PromotionActor {
    staffId?: string | null;
    staffName?: string | null;
}
const emptyResult = (reason: string): PromotionValidationResult => ({
    valid: false,
    reason,
    promotion: null,
    discountAmount: 0,
    targetSubtotal: 0,
});
function dbRunner(): QueryRunner {
    return { query: (sql: string, params?: any[]) => query(sql, params || []) };
}
async function rowsFromRunner<T = any>(runner: QueryRunner, sql: string, params: any[] = []): Promise<T[]> {
    const result = await runner.query(sql, params);
    if (Array.isArray(result) && Array.isArray(result[0]))
        return result[0] as T[];
    return (Array.isArray(result) ? result : []) as T[];
}
function safeJsonArray(value: unknown): string[] {
    if (Array.isArray(value))
        return value.map(item => String(item).trim()).filter(Boolean);
    if (value === null || value === undefined || value === "")
        return [];
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed))
                return parsed.map(item => String(item).trim()).filter(Boolean);
        }
        catch {
            return value.split(",").map(item => item.trim()).filter(Boolean);
        }
    }
    return [];
}
function listFromInput(value: unknown): string[] {
    return safeJsonArray(value).map(item => item.trim()).filter(Boolean);
}
function numeric(value: unknown, fallback = 0, precision = 2) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(precision)) : fallback;
}
function optionalLimit(value: unknown): number | null {
    if (value === null || value === undefined || value === "")
        return null;
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function optionalMoney(value: unknown): number | null {
    if (value === null || value === undefined || value === "")
        return null;
    const parsed = numeric(value, 0);
    return parsed > 0 ? parsed : null;
}
function nullableText(value: unknown, max = 255): string | null {
    const text = String(value ?? "").trim();
    return text ? text.slice(0, max) : null;
}
export function normalizePromotionCode(value: unknown): string {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, "")
        .toUpperCase()
        .slice(0, 64);
}
function serializeList(value: unknown): string {
    return JSON.stringify(listFromInput(value));
}
function normalizePromotionRow(row: any): Promotion {
    return {
        id: row.id,
        tenantId: row.tenantId ?? row.tenant_id,
        code: row.code,
        name: row.name,
        description: row.description ?? null,
        status: row.status === "inactive" ? "inactive" : "active",
        discountType: (row.discountType ?? row.discount_type) === "fixed" ? "fixed" : "percent",
        discountValue: numeric(row.discountValue ?? row.discount_value),
        startsAt: row.startsAt ?? row.starts_at ?? null,
        endsAt: row.endsAt ?? row.ends_at ?? null,
        minSubtotal: numeric(row.minSubtotal ?? row.min_subtotal),
        maxDiscountAmount: optionalMoney(row.maxDiscountAmount ?? row.max_discount_amount),
        appliesTo: ["products", "categories"].includes(String(row.appliesTo ?? row.applies_to))
            ? String(row.appliesTo ?? row.applies_to) as PromotionAppliesTo
            : "cart",
        targetProductIds: safeJsonArray(row.targetProductIds ?? row.target_product_ids),
        targetCategories: safeJsonArray(row.targetCategories ?? row.target_categories),
        customerScope: ["selected", "no_customer"].includes(String(row.customerScope ?? row.customer_scope))
            ? String(row.customerScope ?? row.customer_scope) as PromotionCustomerScope
            : "all",
        targetCustomerIds: safeJsonArray(row.targetCustomerIds ?? row.target_customer_ids),
        totalRedemptionLimit: optionalLimit(row.totalRedemptionLimit ?? row.total_redemption_limit),
        perCustomerLimit: optionalLimit(row.perCustomerLimit ?? row.per_customer_limit),
        redemptionCount: Math.max(0, Math.floor(Number(row.redemptionCount ?? row.redemption_count ?? 0) || 0)),
        createdBy: row.createdBy ?? row.created_by ?? null,
        createdByName: row.createdByName ?? row.created_by_name ?? null,
        createdAt: row.createdAt ?? row.created_at ?? null,
        updatedAt: row.updatedAt ?? row.updated_at ?? null,
    };
}
function normalizePromotionPayload(input: Partial<Promotion>, actor: PromotionActor = {}) {
    const code = normalizePromotionCode((input as any).code);
    if (!code)
        throw new Error("Promotion code is required.");
    const discountType: PromotionDiscountType = input.discountType === "fixed" ? "fixed" : "percent";
    const discountValue = numeric((input as any).discountValue ?? (input as any).discount_value);
    if (discountValue <= 0)
        throw new Error("Promotion discount value must be greater than zero.");
    if (discountType === "percent" && discountValue > 100)
        throw new Error("Percentage promotions cannot exceed 100%.");
    const appliesTo: PromotionAppliesTo = input.appliesTo === "products" || input.appliesTo === "categories" ? input.appliesTo : "cart";
    const customerScope: PromotionCustomerScope = input.customerScope === "selected" || input.customerScope === "no_customer" ? input.customerScope : "all";
    return {
        code,
        name: nullableText(input.name, 160) || code,
        description: nullableText(input.description, 500),
        status: input.status === "inactive" ? "inactive" : "active",
        discountType,
        discountValue,
        startsAt: nullableText(input.startsAt, 40),
        endsAt: nullableText(input.endsAt, 40),
        minSubtotal: Math.max(0, numeric(input.minSubtotal)),
        maxDiscountAmount: optionalMoney(input.maxDiscountAmount),
        appliesTo,
        targetProductIds: serializeList(input.targetProductIds),
        targetCategories: serializeList(input.targetCategories),
        customerScope,
        targetCustomerIds: serializeList(input.targetCustomerIds),
        totalRedemptionLimit: optionalLimit(input.totalRedemptionLimit),
        perCustomerLimit: optionalLimit(input.perCustomerLimit),
        createdBy: nullableText(actor.staffId, 64),
        createdByName: nullableText(actor.staffName, 255),
    };
}
function lineGross(item: PromotionSaleItem) {
    return numeric(Math.max(0, Number(item.price || 0)) * Math.max(0, Number(item.quantity || 0)));
}
function targetSubtotalForPromotion(promotion: Promotion, items: PromotionSaleItem[]) {
    if (promotion.appliesTo === "cart") {
        return numeric(items.reduce((sum, item) => sum + lineGross(item), 0));
    }
    const productTargets = new Set(promotion.targetProductIds.map(item => item.toLowerCase()));
    const categoryTargets = new Set(promotion.targetCategories.map(item => item.toLowerCase()));
    const matching = items.filter(item => {
        const productId = String(item.productId || item.id || "").toLowerCase();
        const category = String(item.category || "").toLowerCase();
        const section = String(item.section || "").toLowerCase();
        const subCategory = String(item.subCategory || "").toLowerCase();
        if (promotion.appliesTo === "products")
            return productTargets.has(productId);
        return categoryTargets.has(category) || categoryTargets.has(section) || categoryTargets.has(subCategory);
    });
    return numeric(matching.reduce((sum, item) => sum + lineGross(item), 0));
}
function discountForPromotion(promotion: Promotion, targetSubtotal: number, cartSubtotal: number) {
    if (targetSubtotal <= 0 || cartSubtotal <= 0)
        return 0;
    const raw = promotion.discountType === "fixed"
        ? promotion.discountValue
        : targetSubtotal * (promotion.discountValue / 100);
    const cappedByPromotion = promotion.maxDiscountAmount
        ? Math.min(raw, promotion.maxDiscountAmount)
        : raw;
    return numeric(Math.min(cappedByPromotion, targetSubtotal, cartSubtotal));
}
function dateIsAfter(value: unknown, now: Date) {
    if (!value)
        return false;
    const date = new Date(String(value));
    return Number.isFinite(date.getTime()) && date.getTime() > now.getTime();
}
function dateIsBefore(value: unknown, now: Date) {
    if (!value)
        return false;
    const date = new Date(String(value));
    return Number.isFinite(date.getTime()) && date.getTime() < now.getTime();
}
async function findPromotionForValidation(runner: QueryRunner, tenantId: string, input: PromotionValidationInput, lock = false) {
    const code = normalizePromotionCode(input.code);
    const promotionId = nullableText(input.promotionId, 64);
    if (!code && !promotionId)
        return null;
    const clauses: string[] = [];
    const params: any[] = [tenantId];
    if (promotionId) {
        clauses.push("id = $1");
        params.push(promotionId);
    }
    if (code) {
        clauses.push("code = $1");
        params.push(code);
    }
    const rows = await rowsFromRunner(runner, `SELECT * FROM promotions WHERE tenant_id = $1 AND (${clauses.join(" OR ")}) LIMIT 1${lock ? " FOR UPDATE" : ""}`, params);
    return rows[0] ? normalizePromotionRow(rows[0]) : null;
}
async function redemptionCount(runner: QueryRunner, tenantId: string, promotionId: string, customerId?: string | null) {
    const params = [tenantId, promotionId, ...(customerId ? [customerId] : [])];
    const rows = await rowsFromRunner(runner, `SELECT COUNT(*) AS count FROM promotion_redemptions WHERE tenant_id = $1 AND promotion_id = $2${customerId ? " AND customer_id = ?" : ""}`, params);
    return Math.max(0, Math.floor(Number(rows[0]?.count ?? rows[0]?.COUNT ?? 0) || 0));
}
export async function listPromotions(tenantId: string): Promise<Promotion[]> {
    const rows = await rowsFromRunner(dbRunner(), `SELECT * FROM promotions WHERE tenant_id = $1 ORDER BY updated_at DESC, name ASC`, [tenantId]);
    return rows.map(normalizePromotionRow);
}
export async function createPromotion(tenantId: string, input: Partial<Promotion>, actor: PromotionActor = {}) {
    const data = normalizePromotionPayload(input, actor);
    const id = `promo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await query(`INSERT INTO promotions (
      id, tenant_id, code, name, description, status, discount_type, discount_value,
      starts_at, ends_at, min_subtotal, max_discount_amount, applies_to,
      target_product_ids, target_categories, customer_scope, target_customer_ids,
      total_redemption_limit, per_customer_limit, created_by, created_by_name, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())`, [
        id, tenantId, data.code, data.name, data.description, data.status, data.discountType, data.discountValue,
        data.startsAt, data.endsAt, data.minSubtotal, data.maxDiscountAmount, data.appliesTo,
        data.targetProductIds, data.targetCategories, data.customerScope, data.targetCustomerIds,
        data.totalRedemptionLimit, data.perCustomerLimit, data.createdBy, data.createdByName,
    ]);
    const [created] = await listPromotions(tenantId).then(rows => rows.filter(row => row.id === id));
    return created || { id, tenantId, ...input, code: data.code } as Promotion;
}
export async function updatePromotion(tenantId: string, promotionId: string, input: Partial<Promotion>, actor: PromotionActor = {}) {
    const data = normalizePromotionPayload(input, actor);
    await query(`UPDATE promotions
        SET code = $1,
            name = $2,
            description = $3,
            status = $4,
            discount_type = $5,
            discount_value = $6,
            starts_at = $7,
            ends_at = $8,
            min_subtotal = $9,
            max_discount_amount = $10,
            applies_to = $11,
            target_product_ids = $12,
            target_categories = $13,
            customer_scope = $14,
            target_customer_ids = $15,
            total_redemption_limit = $16,
            per_customer_limit = $17,
            updated_at = NOW()
      WHERE tenant_id = $18 AND id = $19`, [
        data.code, data.name, data.description, data.status, data.discountType, data.discountValue,
        data.startsAt, data.endsAt, data.minSubtotal, data.maxDiscountAmount, data.appliesTo,
        data.targetProductIds, data.targetCategories, data.customerScope, data.targetCustomerIds,
        data.totalRedemptionLimit, data.perCustomerLimit, tenantId, promotionId,
    ]);
    const [updated] = await listPromotions(tenantId).then(rows => rows.filter(row => row.id === promotionId));
    return updated || { id: promotionId, tenantId, ...input, code: data.code } as Promotion;
}
export async function validatePromotionForSale(runner: QueryRunner | null, tenantId: string, input: PromotionValidationInput, options: {
    lock?: boolean;
    assertClientDiscount?: boolean;
} = {}): Promise<PromotionValidationResult> {
    const activeRunner = runner || dbRunner();
    const promotion = await findPromotionForValidation(activeRunner, tenantId, input, Boolean(options.lock));
    if (!promotion)
        return emptyResult("Promotion code was not found.");
    if (promotion.status !== "active")
        return { ...emptyResult("Promotion is inactive."), promotion };
    const now = input.now ? new Date(input.now) : new Date();
    if (dateIsAfter(promotion.startsAt, now))
        return { ...emptyResult("Promotion is not active yet."), promotion };
    if (dateIsBefore(promotion.endsAt, now))
        return { ...emptyResult("Promotion has expired."), promotion };
    const items = Array.isArray(input.items) ? input.items : [];
    const cartSubtotal = numeric(input.subtotal ?? input.totalBeforeDiscount ?? items.reduce((sum, item) => sum + lineGross(item), 0));
    if (cartSubtotal <= 0)
        return { ...emptyResult("Promotion needs a cart total greater than zero."), promotion };
    if (cartSubtotal < promotion.minSubtotal) {
        return { ...emptyResult(`Promotion requires a minimum subtotal of R${promotion.minSubtotal.toFixed(2)}.`), promotion };
    }
    const customerId = nullableText(input.customerId, 64);
    if (promotion.customerScope === "no_customer" && customerId) {
        return { ...emptyResult("Promotion is only valid when no customer is selected."), promotion };
    }
    if (promotion.customerScope === "selected") {
        if (!customerId)
            return { ...emptyResult("Promotion is limited to selected customers."), promotion };
        const allowed = new Set(promotion.targetCustomerIds.map(item => item.toLowerCase()));
        if (!allowed.has(customerId.toLowerCase()))
            return { ...emptyResult("Promotion is not valid for this customer."), promotion };
    }
    if (promotion.totalRedemptionLimit && promotion.redemptionCount >= promotion.totalRedemptionLimit) {
        return { ...emptyResult("Promotion redemption limit has been reached."), promotion };
    }
    if (promotion.perCustomerLimit && customerId) {
        const usedByCustomer = await redemptionCount(activeRunner, tenantId, promotion.id, customerId);
        if (usedByCustomer >= promotion.perCustomerLimit) {
            return { ...emptyResult("Customer redemption limit has been reached."), promotion };
        }
    }
    const targetSubtotal = targetSubtotalForPromotion(promotion, items);
    if (targetSubtotal <= 0)
        return { ...emptyResult("Promotion does not match any cart items."), promotion };
    const discountAmount = discountForPromotion(promotion, targetSubtotal, cartSubtotal);
    if (discountAmount <= 0)
        return { ...emptyResult("Promotion did not produce a discount."), promotion };
    if (options.assertClientDiscount) {
        const requestedDiscount = numeric(input.promotionDiscount);
        if (Math.abs(requestedDiscount - discountAmount) > 0.01) {
            return {
                ...emptyResult(`Promotion discount should be R${discountAmount.toFixed(2)}.`),
                promotion,
                discountAmount,
                targetSubtotal,
            };
        }
    }
    return {
        valid: true,
        promotion,
        discountAmount,
        targetSubtotal,
        remainingRedemptions: promotion.totalRedemptionLimit
            ? Math.max(0, promotion.totalRedemptionLimit - promotion.redemptionCount)
            : null,
    };
}
export async function recordPromotionRedemption(runner: QueryRunner, tenantId: string, saleId: string, input: PromotionValidationInput, validation: PromotionValidationResult, staffId?: string | null) {
    if (!validation.valid || !validation.promotion || validation.discountAmount <= 0)
        return;
    const id = `promo_red_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const promotion = validation.promotion;
    await runner.query(`INSERT INTO promotion_redemptions (
      id, tenant_id, promotion_id, promotion_code, sale_id, customer_id, staff_id,
      discount_amount, subtotal, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`, [
        id,
        tenantId,
        promotion.id,
        promotion.code,
        saleId,
        nullableText(input.customerId, 64),
        nullableText(staffId, 64),
        validation.discountAmount,
        numeric(input.subtotal ?? validation.targetSubtotal),
    ]);
    await runner.query(`UPDATE promotions SET redemption_count = redemption_count + 1, updated_at = NOW() WHERE tenant_id = $1 AND id = $2`, [tenantId, promotion.id]);
}
