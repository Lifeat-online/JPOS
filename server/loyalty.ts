import { query } from "./db.js";
type QueryRunner = {
    query: (sql: string, params?: any[]) => Promise<any>;
};
export type LoyaltyStatus = "active" | "inactive";
export type LoyaltyMemberStatus = "active" | "paused" | "opted_out";
export type LoyaltyRewardRuleType = "base" | "category" | "product" | "time_window";
export interface LoyaltyTier {
    id: string;
    tenantId?: string;
    name: string;
    status: LoyaltyStatus;
    minPoints: number;
    earnMultiplier: number;
    createdAt?: string | null;
    updatedAt?: string | null;
}
export interface LoyaltyRewardRule {
    id: string;
    tenantId?: string;
    name: string;
    status: LoyaltyStatus;
    ruleType: LoyaltyRewardRuleType;
    pointsPerCurrency: number;
    multiplier: number;
    bonusPoints: number;
    minSubtotal: number;
    startsAt?: string | null;
    endsAt?: string | null;
    targetProductIds: string[];
    targetCategories: string[];
    daysOfWeek: number[];
    createdAt?: string | null;
    updatedAt?: string | null;
}
export interface LoyaltySaleItem {
    id?: string | null;
    productId?: string | null;
    name?: string | null;
    category?: string | null;
    section?: string | null;
    subCategory?: string | null;
    price: number;
    quantity: number;
}
export interface LoyaltyAwardInput {
    customerId?: string | null;
    items: LoyaltySaleItem[];
    subtotal?: number | null;
    total?: number | null;
    pointsRedeemed?: number | null;
    now?: Date | string | null;
}
export interface LoyaltyAwardResult {
    enabled: boolean;
    customerFound: boolean;
    memberStatus: LoyaltyMemberStatus | null;
    previousPoints: number;
    pointsRedeemed: number;
    pointsEarned: number;
    nextPoints: number;
    tier: LoyaltyTier | null;
    matchedRules: Array<{
        id: string;
        name: string;
        points: number;
    }>;
    reason?: string;
}
function dbRunner(): QueryRunner {
    return { query: (sql: string, params?: any[]) => query(sql, params || []) };
}
async function rowsFromRunner<T = any>(runner: QueryRunner, sql: string, params: any[] = []): Promise<T[]> {
    const result = await runner.query(sql, params);
    if (Array.isArray(result) && Array.isArray(result[0]))
        return result[0] as T[];
    return (Array.isArray(result) ? result : []) as T[];
}
function numberValue(value: unknown, fallback = 0, precision = 3) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(precision)) : fallback;
}
function intValue(value: unknown, fallback = 0) {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) ? parsed : fallback;
}
function text(value: unknown, max = 255) {
    const cleaned = String(value ?? "").trim();
    return cleaned ? cleaned.slice(0, max) : null;
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
function numberArray(value: unknown): number[] {
    return safeJsonArray(value)
        .map(item => Math.floor(Number(item)))
        .filter(item => Number.isFinite(item) && item >= 0 && item <= 6);
}
function serializeList(value: unknown) {
    return JSON.stringify(safeJsonArray(value));
}
function serializeDays(value: unknown) {
    if (Array.isArray(value))
        return JSON.stringify(numberArray(value));
    return JSON.stringify(numberArray(safeJsonArray(value)));
}
function parseBusiness(row: any) {
    const raw = row?.business;
    if (!raw)
        return {};
    if (typeof raw === "object")
        return raw;
    try {
        return JSON.parse(String(raw || "{}"));
    }
    catch {
        return {};
    }
}
function normalizeTier(row: any): LoyaltyTier {
    return {
        id: row.id,
        tenantId: row.tenantId ?? row.tenant_id,
        name: row.name,
        status: row.status === "inactive" ? "inactive" : "active",
        minPoints: Math.max(0, intValue(row.minPoints ?? row.min_points)),
        earnMultiplier: Math.max(0, numberValue(row.earnMultiplier ?? row.earn_multiplier, 1)),
        createdAt: row.createdAt ?? row.created_at ?? null,
        updatedAt: row.updatedAt ?? row.updated_at ?? null,
    };
}
function normalizeRule(row: any): LoyaltyRewardRule {
    const ruleType = String(row.ruleType ?? row.rule_type ?? "base");
    return {
        id: row.id,
        tenantId: row.tenantId ?? row.tenant_id,
        name: row.name,
        status: row.status === "inactive" ? "inactive" : "active",
        ruleType: ["category", "product", "time_window"].includes(ruleType) ? ruleType as LoyaltyRewardRuleType : "base",
        pointsPerCurrency: Math.max(0, numberValue(row.pointsPerCurrency ?? row.points_per_currency, 0, 4)),
        multiplier: Math.max(0, numberValue(row.multiplier, 1, 3)),
        bonusPoints: Math.max(0, intValue(row.bonusPoints ?? row.bonus_points)),
        minSubtotal: Math.max(0, numberValue(row.minSubtotal ?? row.min_subtotal, 0, 2)),
        startsAt: row.startsAt ?? row.starts_at ?? null,
        endsAt: row.endsAt ?? row.ends_at ?? null,
        targetProductIds: safeJsonArray(row.targetProductIds ?? row.target_product_ids),
        targetCategories: safeJsonArray(row.targetCategories ?? row.target_categories),
        daysOfWeek: numberArray(row.daysOfWeek ?? row.days_of_week),
        createdAt: row.createdAt ?? row.created_at ?? null,
        updatedAt: row.updatedAt ?? row.updated_at ?? null,
    };
}
function normalizeTierPayload(input: Partial<LoyaltyTier>) {
    const name = text(input.name, 160);
    if (!name)
        throw new Error("Tier name is required.");
    return {
        name,
        status: input.status === "inactive" ? "inactive" : "active",
        minPoints: Math.max(0, intValue(input.minPoints)),
        earnMultiplier: Math.max(0, numberValue(input.earnMultiplier, 1, 3)),
    };
}
function normalizeRulePayload(input: Partial<LoyaltyRewardRule>) {
    const name = text(input.name, 160);
    if (!name)
        throw new Error("Reward rule name is required.");
    const ruleType = ["category", "product", "time_window"].includes(String(input.ruleType)) ? input.ruleType : "base";
    return {
        name,
        status: input.status === "inactive" ? "inactive" : "active",
        ruleType,
        pointsPerCurrency: Math.max(0, numberValue(input.pointsPerCurrency, 0, 4)),
        multiplier: Math.max(0, numberValue(input.multiplier, 1, 3)),
        bonusPoints: Math.max(0, intValue(input.bonusPoints)),
        minSubtotal: Math.max(0, numberValue(input.minSubtotal, 0, 2)),
        startsAt: text(input.startsAt, 40),
        endsAt: text(input.endsAt, 40),
        targetProductIds: serializeList(input.targetProductIds),
        targetCategories: serializeList(input.targetCategories),
        daysOfWeek: serializeDays(input.daysOfWeek),
    };
}
function lineGross(item: LoyaltySaleItem) {
    return numberValue(Math.max(0, Number(item.price || 0)) * Math.max(0, Number(item.quantity || 0)), 0, 2);
}
function activeOnDate(rule: LoyaltyRewardRule, now: Date) {
    if (rule.startsAt) {
        const starts = new Date(String(rule.startsAt));
        if (Number.isFinite(starts.getTime()) && starts.getTime() > now.getTime())
            return false;
    }
    if (rule.endsAt) {
        const ends = new Date(String(rule.endsAt));
        if (Number.isFinite(ends.getTime()) && ends.getTime() < now.getTime())
            return false;
    }
    if (rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(now.getDay()))
        return false;
    return true;
}
function ruleTargetSubtotal(rule: LoyaltyRewardRule, items: LoyaltySaleItem[], fallbackSubtotal: number) {
    if (rule.ruleType === "base" || rule.ruleType === "time_window")
        return fallbackSubtotal;
    const productTargets = new Set(rule.targetProductIds.map(item => item.toLowerCase()));
    const categoryTargets = new Set(rule.targetCategories.map(item => item.toLowerCase()));
    return numberValue(items.reduce((sum, item) => {
        const productId = String(item.productId || item.id || "").toLowerCase();
        const category = String(item.category || "").toLowerCase();
        const section = String(item.section || "").toLowerCase();
        const subCategory = String(item.subCategory || "").toLowerCase();
        const matches = rule.ruleType === "product"
            ? productTargets.has(productId)
            : categoryTargets.has(category) || categoryTargets.has(section) || categoryTargets.has(subCategory);
        return matches ? sum + lineGross(item) : sum;
    }, 0), 0, 2);
}
function pointsFromCurrency(amount: number, currencyPerPoint: number, multiplier = 1) {
    if (amount <= 0 || currencyPerPoint <= 0)
        return 0;
    return Math.max(0, Math.floor((amount / currencyPerPoint) * Math.max(0, multiplier)));
}
export async function listLoyaltyTiers(tenantId: string): Promise<LoyaltyTier[]> {
    const rows = await rowsFromRunner(dbRunner(), `SELECT * FROM loyalty_tiers WHERE tenant_id = $1 ORDER BY min_points ASC, name ASC`, [tenantId]);
    return rows.map(normalizeTier);
}
export async function createLoyaltyTier(tenantId: string, input: Partial<LoyaltyTier>) {
    const data = normalizeTierPayload(input);
    const id = `tier_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await query(`INSERT INTO loyalty_tiers (id, tenant_id, name, status, min_points, earn_multiplier, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`, [id, tenantId, data.name, data.status, data.minPoints, data.earnMultiplier]);
    return { id, tenantId, ...data } as LoyaltyTier;
}
export async function updateLoyaltyTier(tenantId: string, tierId: string, input: Partial<LoyaltyTier>) {
    const data = normalizeTierPayload(input);
    await query(`UPDATE loyalty_tiers
        SET name = $1, status = $2, min_points = $3, earn_multiplier = $4, updated_at = NOW()
      WHERE tenant_id = $5 AND id = $6`, [data.name, data.status, data.minPoints, data.earnMultiplier, tenantId, tierId]);
    return { id: tierId, tenantId, ...data } as LoyaltyTier;
}
export async function listLoyaltyRewardRules(tenantId: string): Promise<LoyaltyRewardRule[]> {
    const rows = await rowsFromRunner(dbRunner(), `SELECT * FROM loyalty_reward_rules WHERE tenant_id = $1 ORDER BY rule_type ASC, updated_at DESC, name ASC`, [tenantId]);
    return rows.map(normalizeRule);
}
export async function createLoyaltyRewardRule(tenantId: string, input: Partial<LoyaltyRewardRule>) {
    const data = normalizeRulePayload(input);
    const id = `reward_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await query(`INSERT INTO loyalty_reward_rules (
      id, tenant_id, name, status, rule_type, points_per_currency, multiplier, bonus_points,
      min_subtotal, starts_at, ends_at, target_product_ids, target_categories, days_of_week, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`, [
        id, tenantId, data.name, data.status, data.ruleType, data.pointsPerCurrency, data.multiplier, data.bonusPoints,
        data.minSubtotal, data.startsAt, data.endsAt, data.targetProductIds, data.targetCategories, data.daysOfWeek,
    ]);
    return { id, tenantId, ...data, targetProductIds: safeJsonArray(data.targetProductIds), targetCategories: safeJsonArray(data.targetCategories), daysOfWeek: numberArray(data.daysOfWeek) } as LoyaltyRewardRule;
}
export async function updateLoyaltyRewardRule(tenantId: string, ruleId: string, input: Partial<LoyaltyRewardRule>) {
    const data = normalizeRulePayload(input);
    await query(`UPDATE loyalty_reward_rules
        SET name = $1, status = $2, rule_type = $3, points_per_currency = $4, multiplier = $5, bonus_points = $6,
            min_subtotal = $7, starts_at = $8, ends_at = $9, target_product_ids = $10, target_categories = $11, days_of_week = $12,
            updated_at = NOW()
      WHERE tenant_id = $13 AND id = $14`, [
        data.name, data.status, data.ruleType, data.pointsPerCurrency, data.multiplier, data.bonusPoints,
        data.minSubtotal, data.startsAt, data.endsAt, data.targetProductIds, data.targetCategories, data.daysOfWeek,
        tenantId, ruleId,
    ]);
    return { id: ruleId, tenantId, ...data, targetProductIds: safeJsonArray(data.targetProductIds), targetCategories: safeJsonArray(data.targetCategories), daysOfWeek: numberArray(data.daysOfWeek) } as LoyaltyRewardRule;
}
export async function calculateLoyaltyAward(runner: QueryRunner | null, tenantId: string, input: LoyaltyAwardInput): Promise<LoyaltyAwardResult> {
    const activeRunner = runner || dbRunner();
    const baseResult: LoyaltyAwardResult = {
        enabled: false,
        customerFound: false,
        memberStatus: null,
        previousPoints: 0,
        pointsRedeemed: Math.max(0, intValue(input.pointsRedeemed)),
        pointsEarned: 0,
        nextPoints: 0,
        tier: null,
        matchedRules: [],
    };
    const customerId = text(input.customerId, 64);
    if (!customerId)
        return { ...baseResult, reason: "No customer selected." };
    const settingsRows = await rowsFromRunner(activeRunner, `SELECT business FROM app_settings WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
    const business = parseBusiness(settingsRows[0]);
    if (!business?.enableLoyalty)
        return { ...baseResult, reason: "Loyalty is disabled." };
    const customerRows = await rowsFromRunner(activeRunner, `SELECT id, loyalty_points, loyalty_member_status, loyalty_tier_id
       FROM customers
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1 FOR UPDATE`, [tenantId, customerId]);
    const customer = customerRows[0];
    if (!customer)
        return { ...baseResult, enabled: true, reason: "Customer is not a loyalty member." };
    const memberStatus: LoyaltyMemberStatus = customer.loyalty_member_status === "paused" || customer.loyalty_member_status === "opted_out"
        ? customer.loyalty_member_status
        : "active";
    const previousPoints = Math.max(0, intValue(customer.loyalty_points));
    if (memberStatus !== "active") {
        return {
            ...baseResult,
            enabled: true,
            customerFound: true,
            memberStatus,
            previousPoints,
            pointsRedeemed: 0,
            nextPoints: previousPoints,
            reason: "Customer loyalty membership is not active.",
        };
    }
    const tiers = (await rowsFromRunner(activeRunner, `SELECT * FROM loyalty_tiers WHERE tenant_id = $1 AND status = 'active' ORDER BY min_points DESC, name ASC`, [tenantId])).map(normalizeTier);
    const explicitTier = tiers.find(tier => tier.id === customer.loyalty_tier_id) || null;
    const tier = explicitTier || tiers.find(candidate => previousPoints >= candidate.minPoints) || null;
    const rules = (await rowsFromRunner(activeRunner, `SELECT * FROM loyalty_reward_rules WHERE tenant_id = $1 AND status = 'active' ORDER BY rule_type ASC, updated_at DESC`, [tenantId])).map(normalizeRule);
    const now = input.now ? new Date(input.now) : new Date();
    const items = Array.isArray(input.items) ? input.items : [];
    const subtotal = numberValue(input.subtotal ?? items.reduce((sum, item) => sum + lineGross(item), 0), 0, 2);
    const earningTotal = numberValue(input.total ?? subtotal, 0, 2);
    const baseRule = rules.find(rule => rule.ruleType === "base" && activeOnDate(rule, now) && earningTotal >= rule.minSubtotal);
    const baseCurrencyPerPoint = numberValue(baseRule?.pointsPerCurrency || business.pointsEarnedPerCurrency || 0, 0, 4);
    const tierMultiplier = tier?.earnMultiplier || 1;
    const basePoints = pointsFromCurrency(earningTotal, baseCurrencyPerPoint, tierMultiplier);
    const matchedRules: Array<{
        id: string;
        name: string;
        points: number;
    }> = [];
    if (basePoints > 0)
        matchedRules.push({ id: baseRule?.id || "base", name: baseRule?.name || "Base earning", points: basePoints });
    let extraPoints = 0;
    for (const rule of rules.filter(rule => rule.ruleType !== "base")) {
        if (!activeOnDate(rule, now))
            continue;
        if (earningTotal < rule.minSubtotal)
            continue;
        const targetSubtotal = ruleTargetSubtotal(rule, items, earningTotal);
        if (targetSubtotal <= 0)
            continue;
        const rulePoints = pointsFromCurrency(targetSubtotal, rule.pointsPerCurrency || baseCurrencyPerPoint, rule.multiplier) + rule.bonusPoints;
        if (rulePoints <= 0)
            continue;
        extraPoints += rulePoints;
        matchedRules.push({ id: rule.id, name: rule.name, points: rulePoints });
    }
    const pointsEarned = Math.max(0, Math.floor(basePoints + extraPoints));
    const pointsRedeemed = Math.min(previousPoints, Math.max(0, intValue(input.pointsRedeemed)));
    const nextPoints = Math.max(0, previousPoints - pointsRedeemed + pointsEarned);
    return {
        enabled: true,
        customerFound: true,
        memberStatus,
        previousPoints,
        pointsRedeemed,
        pointsEarned,
        nextPoints,
        tier,
        matchedRules,
    };
}
