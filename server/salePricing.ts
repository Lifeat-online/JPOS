import { query } from "./db.js";

// Server-side price integrity for sales. The till sends item prices and totals;
// these checks make sure they agree with the catalog and that the total cannot
// be lowered below what the configured discounts allow.

type PricedModifier = { optionId?: string | null };
export type PricedSaleItem = {
    id?: string | null;
    productId?: string | null;
    name?: string | null;
    price?: number | null;
    quantity?: number | null;
    selectedModifiers?: PricedModifier[] | null;
};
export type PricedSale = {
    items?: PricedSaleItem[] | null;
    total?: number | null;
    subtotal?: number | null;
    customerId?: string | null;
    promotionDiscount?: number | null;
    manualDiscountAmount?: number | null;
    status?: string | null;
    loyaltyPointsRedeemed?: number | null;
};
export type SalePriceMismatch = {
    productId: string | null;
    name: string;
    submittedPrice: number;
    catalogPrice: number | null;
};
export type SaleTotalProblem = {
    kind: "subtotal_mismatch" | "total_below_minimum";
    submitted: number;
    expected: number;
};

const toCents = (value: unknown) => Math.round(Number(value || 0) * 100);
const fromCents = (value: number) => value / 100;

function itemProductId(item: PricedSaleItem) {
    return String(item.productId || item.id || "").trim() || null;
}

/**
 * Compares each line's unit price with `products.price` plus the selected
 * modifier options' `price_extra` (the same formula the till uses when adding
 * to cart). Lines whose product is unknown to this tenant are mismatches too.
 */
export async function findSaleItemPriceMismatches(tenantId: string, items: PricedSaleItem[]): Promise<SalePriceMismatch[]> {
    if (!Array.isArray(items) || items.length === 0)
        return [];
    const productIds = Array.from(new Set(items.map(itemProductId).filter(Boolean))) as string[];
    const optionIds = Array.from(new Set(items.flatMap(item => (item.selectedModifiers || []).map(m => String(m?.optionId || "")).filter(Boolean))));
    const productRows = productIds.length
        ? await query<any>(`SELECT id, price FROM products WHERE tenant_id = $1 AND id = ANY($2::text[])`, [tenantId, productIds])
        : [];
    const optionRows = optionIds.length
        ? await query<any>(`SELECT mo.id, pm.product_id AS "productId", mo.price_extra AS "priceExtra"
               FROM modifier_options mo
               JOIN product_modifiers pm ON pm.id = mo.modifier_id
               JOIN products p ON p.id = pm.product_id
              WHERE p.tenant_id = $1 AND mo.id = ANY($2::text[])`, [tenantId, optionIds])
        : [];
    const productPrice = new Map<string, number>(productRows.map((row: any) => [String(row.id), toCents(row.price)]));
    const options = new Map<string, { productId: string; priceExtra: number }>(optionRows.map((row: any) => [String(row.id), { productId: String(row.productId), priceExtra: toCents(row.priceExtra) }]));
    const mismatches: SalePriceMismatch[] = [];
    for (const item of items) {
        const productId = itemProductId(item);
        const submitted = toCents(item.price);
        let expected: number | null = productId != null && productPrice.has(productId) ? productPrice.get(productId)! : null;
        for (const modifier of item.selectedModifiers || []) {
            if (expected == null)
                break;
            const option = options.get(String(modifier?.optionId || ""));
            expected = option && option.productId === productId ? expected + option.priceExtra : null;
        }
        if (expected == null || expected !== submitted) {
            mismatches.push({
                productId,
                name: String(item.name || productId || "Item"),
                submittedPrice: fromCents(submitted),
                catalogPrice: expected == null ? null : fromCents(expected),
            });
        }
    }
    return mismatches;
}

async function maxDiscountAllowances(tenantId: string, customerId: string | null, pointsRedeemed: number | null) {
    const settingsRows = await query<any>(`SELECT business FROM app_settings WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
    let business: any = settingsRows[0]?.business || {};
    if (typeof business === "string") {
        try {
            business = JSON.parse(business);
        }
        catch {
            business = {};
        }
    }
    const customer = customerId
        ? (await query<any>(`SELECT discount_percent AS "discountPercent", loyalty_points AS "loyaltyPoints" FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, customerId]))[0] || null
        : null;
    const clamp = (value: unknown) => Math.max(0, Math.min(100, Number(value || 0)));
    // Happy-hour windows are evaluated on the till's local clock, so the
    // server allows any enabled rule rather than re-checking the time window.
    const percents = [
        ...(business.happyHourDiscounts || []).filter((rule: any) => rule?.enabled).map((rule: any) => clamp(rule.discountPercent)),
    ];
    if (customer) {
        percents.push(clamp(customer.discountPercent));
        percents.push(...Object.values(business.roleDiscounts || {}).map(clamp));
    }
    let pointsCapCents = 0;
    const required = Number(business.pointsRequiredForDiscount || 0);
    if (customer && business.enableLoyalty && required > 0) {
        // Completed sales may only discount for points they actually redeem
        // (redemption is deducted from the balance in createSale/updateSale).
        // Open/parked sales don't redeem yet, so the balance is the limit.
        const balance = Math.max(0, Number(customer.loyaltyPoints || 0));
        const usablePoints = pointsRedeemed == null ? balance : Math.min(balance, Math.max(0, Number(pointsRedeemed) || 0));
        pointsCapCents = Math.floor(usablePoints / required) * toCents(business.discountAmountForPoints);
    }
    return { maxPercent: Math.max(0, ...percents), pointsCapCents };
}

/**
 * Checks the submitted subtotal equals the sum of the lines, and that the
 * total is not below the lowest value the configured discounts could produce.
 * Promotion amounts are validated separately in createSale/updateSale and
 * manual discounts require sensitive-action verification at the route.
 */
export async function findSaleTotalProblem(tenantId: string, sale: PricedSale): Promise<SaleTotalProblem | null> {
    const items = Array.isArray(sale.items) ? sale.items : [];
    const lineCount = Math.max(1, items.length);
    const itemsSubtotal = items.reduce((sum, item) => sum + toCents(item.price) * Number(item.quantity || 0), 0);
    if (sale.subtotal != null && Math.abs(toCents(sale.subtotal) - itemsSubtotal) > lineCount) {
        return { kind: "subtotal_mismatch", submitted: Number(sale.subtotal), expected: fromCents(itemsSubtotal) };
    }
    if (sale.total == null)
        return null;
    const pointsRedeemed = sale.status === "completed" ? Number(sale.loyaltyPointsRedeemed || 0) : null;
    const { maxPercent, pointsCapCents } = await maxDiscountAllowances(tenantId, sale.customerId || null, pointsRedeemed);
    const minimum = Math.round(itemsSubtotal * (1 - maxPercent / 100))
        - toCents(sale.promotionDiscount)
        - toCents(sale.manualDiscountAmount)
        - pointsCapCents
        - lineCount;
    if (toCents(sale.total) < minimum) {
        return { kind: "total_below_minimum", submitted: Number(sale.total), expected: fromCents(Math.max(0, minimum)) };
    }
    return null;
}

export function describePriceMismatches(mismatches: SalePriceMismatch[]) {
    const names = mismatches.slice(0, 3).map(m => m.name).join(", ");
    const more = mismatches.length > 3 ? ` and ${mismatches.length - 3} more` : "";
    return `${names}${more}`;
}

/**
 * Lines already stored on the sale were verified when they were added, and
 * stored lines do not keep their modifier selection, so on updates only new
 * or re-priced lines are checked against the catalog.
 */
export async function filterLinesNotOnSale(tenantId: string, saleId: string, items: PricedSaleItem[]): Promise<PricedSaleItem[]> {
    const rows = await query<any>(`SELECT si.product_id AS "productId", si.price
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
          WHERE s.tenant_id = $1 AND si.sale_id = $2`, [tenantId, saleId]);
    const stored = new Set(rows.map((row: any) => `${row.productId}|${toCents(row.price)}`));
    return items.filter(item => !stored.has(`${itemProductId(item)}|${toCents(item.price)}`));
}

export async function loadStoredSaleForPricing(tenantId: string, saleId: string): Promise<PricedSale | null> {
    const sales = await query<any>(`SELECT customer_id AS "customerId", promotion_discount AS "promotionDiscount", status
           FROM sales WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, saleId]);
    if (!sales[0])
        return null;
    const items = await query<any>(`SELECT product_id AS "productId", product_name AS name, price, quantity FROM sale_items WHERE sale_id = $1`, [saleId]);
    return {
        customerId: sales[0].customerId || null,
        promotionDiscount: Number(sales[0].promotionDiscount || 0),
        status: sales[0].status || null,
        items: items.map((row: any) => ({ ...row, price: Number(row.price), quantity: Number(row.quantity) })),
    };
}
