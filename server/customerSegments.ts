import { query } from "./db.js";
import { defaultCustomerConsentMap, listTenantCustomerConsents, type CustomerConsentMap, type CustomerConsentStatus, } from "./customerConsents.js";
type CustomerSegmentFilters = {
    segment?: string | null;
    limit?: string | number | null;
};
type CustomerRow = {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    loyaltyPoints?: number;
    loyaltyMemberStatus?: string | null;
    walletBalance?: number;
    accountEnabled?: boolean | number;
    accountLimit?: number;
    accountBalance?: number;
    discountPercent?: number;
    createdAt?: string | Date | null;
    updatedAt?: string | Date | null;
    consents?: Partial<CustomerConsentMap>;
};
type SaleRow = {
    id: string;
    customerId?: string | null;
    total?: number | string | null;
    paymentMethod?: string | null;
    createdAt?: string | Date | null;
};
export type CustomerCampaignRow = {
    customerId: string;
    name: string;
    email: string;
    phone: string;
    preferredChannel: "email" | "sms" | "none";
    contactable: boolean;
    primarySegment: string;
    segmentTags: string[];
    campaignHint: string;
    totalSpend: number;
    orderCount: number;
    averageOrderValue: number;
    firstPurchaseAt: string | null;
    lastPurchaseAt: string | null;
    daysSinceLastPurchase: number | null;
    loyaltyPoints: number;
    loyaltyMemberStatus: string;
    accountBalance: number;
    walletBalance: number;
    discountPercent: number;
    createdAt: string | null;
    loyaltyConsentStatus: CustomerConsentStatus;
    marketingConsentStatus: CustomerConsentStatus;
    customerPortalConsentStatus: CustomerConsentStatus;
    storedContactDetailsConsentStatus: CustomerConsentStatus;
    promotionsConsentStatus: CustomerConsentStatus;
    aiRecommendationsConsentStatus: CustomerConsentStatus;
    campaignEligible: boolean;
};
function clean(value: unknown) {
    return String(value || "").trim();
}
function money(value: unknown) {
    const parsed = Number(value || 0);
    return Number((Number.isFinite(parsed) ? parsed : 0).toFixed(2));
}
function intValue(value: unknown) {
    const parsed = Math.floor(Number(value || 0));
    return Number.isFinite(parsed) ? parsed : 0;
}
function csvCell(value: unknown) {
    if (value === null || value === undefined)
        return "";
    const text = Array.isArray(value) ? value.join("|") : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}
function isoDate(value: unknown) {
    if (!value)
        return null;
    const date = new Date(value as any);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function daysBetween(later: Date, earlier: Date) {
    return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86400000));
}
function clampLimit(value: unknown, fallback = 2000, max = 10000) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return Math.min(Math.max(Math.floor(parsed), 1), max);
}
function primarySegment(tags: string[]) {
    const priority = [
        "vip",
        "frequent",
        "recent",
        "new",
        "at_risk",
        "lapsed",
        "no_purchase",
        "loyalty_active",
        "account_customer",
        "wallet_credit",
        "discount_customer",
    ];
    return priority.find(tag => tags.includes(tag)) || "general";
}
function campaignHint(segment: string) {
    if (segment === "vip")
        return "Invite to VIP preview, loyalty bonus, or high-value offer.";
    if (segment === "frequent")
        return "Send repeat-customer bundles, subscriptions, or limited-time rewards.";
    if (segment === "recent" || segment === "new")
        return "Send welcome-back message, review request, or second-purchase offer.";
    if (segment === "at_risk")
        return "Send win-back reminder before the customer lapses.";
    if (segment === "lapsed")
        return "Send stronger win-back campaign or update preference prompt.";
    if (segment === "no_purchase")
        return "Send first-purchase incentive or profile completion prompt.";
    if (segment === "account_customer")
        return "Send account statement, payment reminder, or account-only offer.";
    if (segment === "wallet_credit")
        return "Send wallet-credit reminder.";
    if (segment === "loyalty_active")
        return "Send points-balance or tier-progress campaign.";
    if (segment === "campaign_ready")
        return "Customer has contact details and marketing consent for a compliant campaign.";
    return "General customer campaign.";
}
function segmentMatches(row: CustomerCampaignRow, filter: string) {
    if (!filter || filter === "all")
        return true;
    if (filter === "contactable")
        return row.contactable;
    return row.segmentTags.includes(filter);
}
export function buildCustomerCampaignRows(customers: CustomerRow[], sales: SaleRow[], now = new Date()): CustomerCampaignRow[] {
    const aggregates = new Map<string, {
        totalSpend: number;
        orderCount: number;
        firstPurchaseAt: Date | null;
        lastPurchaseAt: Date | null;
        paymentMethods: Map<string, number>;
    }>();
    for (const sale of sales) {
        const customerId = clean(sale.customerId);
        if (!customerId)
            continue;
        const createdAt = new Date(sale.createdAt as any);
        const current = aggregates.get(customerId) || {
            totalSpend: 0,
            orderCount: 0,
            firstPurchaseAt: null,
            lastPurchaseAt: null,
            paymentMethods: new Map<string, number>(),
        };
        current.totalSpend = money(current.totalSpend + money(sale.total));
        current.orderCount += 1;
        if (!Number.isNaN(createdAt.getTime())) {
            if (!current.firstPurchaseAt || createdAt < current.firstPurchaseAt)
                current.firstPurchaseAt = createdAt;
            if (!current.lastPurchaseAt || createdAt > current.lastPurchaseAt)
                current.lastPurchaseAt = createdAt;
        }
        const method = clean(sale.paymentMethod) || "unknown";
        current.paymentMethods.set(method, (current.paymentMethods.get(method) || 0) + 1);
        aggregates.set(customerId, current);
    }
    return customers.map(customer => {
        const aggregate = aggregates.get(customer.id) || {
            totalSpend: 0,
            orderCount: 0,
            firstPurchaseAt: null,
            lastPurchaseAt: null,
            paymentMethods: new Map<string, number>(),
        };
        const email = clean(customer.email);
        const phone = clean(customer.phone);
        const tags: string[] = [];
        const daysSinceLastPurchase = aggregate.lastPurchaseAt ? daysBetween(now, aggregate.lastPurchaseAt) : null;
        const daysSinceCreated = customer.createdAt ? daysBetween(now, new Date(customer.createdAt as any)) : null;
        const totalSpend = money(aggregate.totalSpend);
        const orderCount = aggregate.orderCount;
        const loyaltyPoints = intValue(customer.loyaltyPoints);
        const accountBalance = money(customer.accountBalance);
        const walletBalance = money(customer.walletBalance);
        const discountPercent = money(customer.discountPercent);
        const consents = {
            ...defaultCustomerConsentMap(),
            ...(customer.consents || {}),
        } as CustomerConsentMap;
        const marketingConsentStatus = consents.marketing?.status || "unknown";
        const storedContactDetailsConsentStatus = consents.stored_contact_details?.status || "unknown";
        const campaignEligible = Boolean((email || phone) && marketingConsentStatus === "granted" && storedContactDetailsConsentStatus === "granted");
        if (totalSpend >= 1000 || orderCount >= 10)
            tags.push("vip");
        if (orderCount >= 5)
            tags.push("frequent");
        if (daysSinceLastPurchase !== null && daysSinceLastPurchase <= 30)
            tags.push("recent");
        if (daysSinceLastPurchase !== null && daysSinceLastPurchase > 30 && daysSinceLastPurchase <= 90)
            tags.push("at_risk");
        if (daysSinceLastPurchase !== null && daysSinceLastPurchase > 90)
            tags.push("lapsed");
        if (orderCount === 1 && daysSinceLastPurchase !== null && daysSinceLastPurchase <= 30)
            tags.push("new");
        if (orderCount === 0)
            tags.push("no_purchase");
        if (orderCount === 0 && daysSinceCreated !== null && daysSinceCreated <= 30)
            tags.push("new_profile");
        if ((customer.loyaltyMemberStatus || "active") === "active" && loyaltyPoints > 0)
            tags.push("loyalty_active");
        if (Boolean(customer.accountEnabled) || accountBalance > 0)
            tags.push("account_customer");
        if (walletBalance > 0)
            tags.push("wallet_credit");
        if (discountPercent > 0)
            tags.push("discount_customer");
        if (email || phone)
            tags.push("contactable");
        if (campaignEligible)
            tags.push("campaign_ready");
        const preferredChannel: CustomerCampaignRow["preferredChannel"] = email ? "email" : phone ? "sms" : "none";
        const segment = primarySegment(tags);
        return {
            customerId: customer.id,
            name: customer.name,
            email,
            phone,
            preferredChannel,
            contactable: Boolean(email || phone),
            primarySegment: segment,
            segmentTags: Array.from(new Set(tags.length ? tags : ["general"])),
            campaignHint: campaignHint(segment),
            totalSpend,
            orderCount,
            averageOrderValue: orderCount > 0 ? money(totalSpend / orderCount) : 0,
            firstPurchaseAt: aggregate.firstPurchaseAt ? aggregate.firstPurchaseAt.toISOString() : null,
            lastPurchaseAt: aggregate.lastPurchaseAt ? aggregate.lastPurchaseAt.toISOString() : null,
            daysSinceLastPurchase,
            loyaltyPoints,
            loyaltyMemberStatus: clean(customer.loyaltyMemberStatus) || "active",
            accountBalance,
            walletBalance,
            discountPercent,
            createdAt: isoDate(customer.createdAt),
            loyaltyConsentStatus: consents.loyalty?.status || "unknown",
            marketingConsentStatus,
            customerPortalConsentStatus: consents.customer_portal?.status || "unknown",
            storedContactDetailsConsentStatus,
            promotionsConsentStatus: consents.promotions?.status || "unknown",
            aiRecommendationsConsentStatus: consents.ai_recommendations?.status || "unknown",
            campaignEligible,
        };
    }).sort((a, b) => b.totalSpend - a.totalSpend || b.orderCount - a.orderCount || a.name.localeCompare(b.name));
}
export function buildCustomerCampaignCsv(rows: CustomerCampaignRow[]) {
    const header = [
        "customer_id",
        "name",
        "email",
        "phone",
        "preferred_channel",
        "contactable",
        "primary_segment",
        "segment_tags",
        "campaign_hint",
        "total_spend",
        "order_count",
        "average_order_value",
        "first_purchase_at",
        "last_purchase_at",
        "days_since_last_purchase",
        "loyalty_points",
        "loyalty_member_status",
        "account_balance",
        "wallet_balance",
        "discount_percent",
        "loyalty_consent_status",
        "marketing_consent_status",
        "customer_portal_consent_status",
        "stored_contact_details_consent_status",
        "promotions_consent_status",
        "ai_recommendations_consent_status",
        "campaign_eligible",
    ];
    const body = rows.map(row => [
        row.customerId,
        row.name,
        row.email,
        row.phone,
        row.preferredChannel,
        row.contactable ? "yes" : "no",
        row.primarySegment,
        row.segmentTags,
        row.campaignHint,
        row.totalSpend,
        row.orderCount,
        row.averageOrderValue,
        row.firstPurchaseAt || "",
        row.lastPurchaseAt || "",
        row.daysSinceLastPurchase ?? "",
        row.loyaltyPoints,
        row.loyaltyMemberStatus,
        row.accountBalance,
        row.walletBalance,
        row.discountPercent,
        row.loyaltyConsentStatus,
        row.marketingConsentStatus,
        row.customerPortalConsentStatus,
        row.storedContactDetailsConsentStatus,
        row.promotionsConsentStatus,
        row.aiRecommendationsConsentStatus,
        row.campaignEligible ? "yes" : "no",
    ]);
    return [header, ...body].map(row => row.map(csvCell).join(",")).join("\n");
}
function segmentSummary(rows: CustomerCampaignRow[]) {
    const counts = new Map<string, number>();
    for (const row of rows) {
        for (const tag of row.segmentTags)
            counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return Array.from(counts.entries())
        .map(([segment, count]) => ({ segment, count }))
        .sort((a, b) => b.count - a.count || a.segment.localeCompare(b.segment));
}
export async function getCustomerCampaignExport(tenantId: string, filters: CustomerSegmentFilters = {}) {
    const limit = clampLimit(filters.limit);
    const segment = clean(filters.segment).toLowerCase() || "all";
    const customers = await query<CustomerRow>(`SELECT
       id,
       name,
       email,
       phone,
       loyalty_points AS loyaltyPoints,
       loyalty_member_status AS loyaltyMemberStatus,
       wallet_balance AS walletBalance,
       account_enabled AS accountEnabled,
       account_limit AS accountLimit,
       account_balance AS accountBalance,
       discount_percent AS discountPercent,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM customers
     WHERE tenant_id = $1
     ORDER BY name ASC`, [tenantId]);
    const sales = await query<SaleRow>(`SELECT
       id,
       customer_id AS customerId,
       total,
       payment_method AS paymentMethod,
       created_at AS createdAt
     FROM sales
     WHERE tenant_id = $1
       AND customer_id IS NOT NULL
       AND customer_id <> ''
       AND status = 'completed'
       AND COALESCE(transaction_type, 'sale') = 'sale'`, [tenantId]);
    const consentsByCustomer = await listTenantCustomerConsents(tenantId);
    const customersWithConsents = customers.map(customer => ({
        ...customer,
        consents: consentsByCustomer.get(String(customer.id)) || defaultCustomerConsentMap(),
    }));
    const allRows = buildCustomerCampaignRows(customersWithConsents, sales);
    const filteredRows = allRows.filter(row => segmentMatches(row, segment)).slice(0, limit);
    const generatedAt = new Date().toISOString();
    return {
        generatedAt,
        filename: `customer-campaign-${segment}-${generatedAt.slice(0, 10)}.csv`,
        mimeType: "text/csv;charset=utf-8",
        segment,
        count: filteredRows.length,
        totalCustomers: allRows.length,
        contactableCount: allRows.filter(row => row.contactable).length,
        campaignReadyCount: allRows.filter(row => row.campaignEligible).length,
        summary: segmentSummary(allRows),
        rows: filteredRows,
        csv: buildCustomerCampaignCsv(filteredRows),
        consentNote: "Campaign-ready customers have contact details plus granted marketing and stored-contact-details consent.",
    };
}
