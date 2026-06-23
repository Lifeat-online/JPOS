import { query } from "./db.js";
import type { QueryResultRow } from "pg";
import { listCustomerConsents, type CustomerConsentMap } from "./customerConsents.js";
type CustomerProfileRow = {
    id: string;
    tenantId?: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
    loyaltyPoints?: number | string | null;
    loyaltyMemberStatus?: string | null;
    loyaltyTierId?: string | null;
    membershipCardId?: string | null;
    membershipBarcode?: string | null;
    membershipStartedAt?: string | Date | null;
    walletBalance?: number | string | null;
    accountEnabled?: boolean | number | null;
    accountLimit?: number | string | null;
    accountBalance?: number | string | null;
    discountPercent?: number | string | null;
    uid?: string | null;
    isAnonymized?: boolean | number | null;
    anonymizedAt?: string | Date | null;
    anonymizedBy?: string | null;
    anonymizedByName?: string | null;
    anonymizationReason?: string | null;
    createdAt?: string | Date | null;
    updatedAt?: string | Date | null;
};
type CustomerSaleRow = {
    id: string;
    staffId?: string | null;
    total?: number | string | null;
    subtotal?: number | string | null;
    taxAmount?: number | string | null;
    taxRate?: number | string | null;
    paymentMethod?: string | null;
    tipAmount?: number | string | null;
    cashOutAmount?: number | string | null;
    pointsDiscount?: number | string | null;
    promotionCode?: string | null;
    promotionDiscount?: number | string | null;
    status?: string | null;
    transactionType?: string | null;
    parentSaleId?: string | null;
    refundStatus?: string | null;
    refundedAmount?: number | string | null;
    refundReason?: string | null;
    tableNumber?: string | null;
    isTab?: boolean | number | null;
    tabName?: string | null;
    createdAt?: string | Date | null;
    updatedAt?: string | Date | null;
};
function money(value: unknown) {
    const parsed = Number(value || 0);
    return Number((Number.isFinite(parsed) ? parsed : 0).toFixed(2));
}
function intValue(value: unknown) {
    const parsed = Math.floor(Number(value || 0));
    return Number.isFinite(parsed) ? parsed : 0;
}
function clean(value: unknown) {
    return String(value || "").trim();
}
function safeFilenamePart(value: unknown) {
    const text = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return text || "customer";
}
function placeholders(values: unknown[]) {
    return values.map(() => "$1").join(", ");
}
function consentSummary(consents: CustomerConsentMap) {
    return Object.fromEntries(Object.entries(consents).map(([type, record]) => [type, record.status || "unknown"]));
}
async function listSaleChildren<T extends QueryResultRow>(table: string, saleIds: string[], select: string): Promise<T[]> {
    if (saleIds.length === 0)
        return [];
    return query<T>(`${select}
      FROM ${table}
     WHERE sale_id IN (${placeholders(saleIds)})
     ORDER BY sale_id ASC, created_at ASC`, saleIds);
}
export async function getCustomerDataExport(tenantId: string, customerId: string) {
    const rows = await query<CustomerProfileRow>(`SELECT
       id,
       tenant_id AS tenantId,
       name,
       email,
       phone,
       address,
       notes,
       loyalty_points AS loyaltyPoints,
       loyalty_member_status AS loyaltyMemberStatus,
       loyalty_tier_id AS loyaltyTierId,
       membership_card_id AS membershipCardId,
       membership_barcode AS membershipBarcode,
       membership_started_at AS membershipStartedAt,
       wallet_balance AS walletBalance,
       account_enabled AS accountEnabled,
       account_limit AS accountLimit,
       account_balance AS accountBalance,
       discount_percent AS discountPercent,
       uid,
       is_anonymized AS isAnonymized,
       anonymized_at AS anonymizedAt,
       anonymized_by AS anonymizedBy,
       anonymized_by_name AS anonymizedByName,
       anonymization_reason AS anonymizationReason,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM customers
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`, [tenantId, customerId]);
    const rawCustomer = rows[0];
    if (!rawCustomer) {
        throw new Error("Customer not found.");
    }
    const profile = {
        id: rawCustomer.id,
        name: rawCustomer.name,
        email: rawCustomer.email || null,
        phone: rawCustomer.phone || null,
        address: rawCustomer.address || null,
        notes: rawCustomer.notes || null,
        loyaltyPoints: intValue(rawCustomer.loyaltyPoints),
        loyaltyMemberStatus: rawCustomer.loyaltyMemberStatus || "active",
        loyaltyTierId: rawCustomer.loyaltyTierId || null,
        membershipCardId: rawCustomer.membershipCardId || null,
        membershipBarcode: rawCustomer.membershipBarcode || null,
        membershipStartedAt: rawCustomer.membershipStartedAt || null,
        walletBalance: money(rawCustomer.walletBalance),
        accountEnabled: Boolean(rawCustomer.accountEnabled),
        accountLimit: money(rawCustomer.accountLimit),
        accountBalance: money(rawCustomer.accountBalance),
        discountPercent: money(rawCustomer.discountPercent),
        uid: rawCustomer.uid || null,
        isAnonymized: Boolean(rawCustomer.isAnonymized),
        anonymizedAt: rawCustomer.anonymizedAt || null,
        anonymizedBy: rawCustomer.anonymizedBy || null,
        anonymizedByName: rawCustomer.anonymizedByName || null,
        anonymizationReason: rawCustomer.anonymizationReason || null,
        createdAt: rawCustomer.createdAt || null,
        updatedAt: rawCustomer.updatedAt || null,
    };
    const consents = await listCustomerConsents(tenantId, customerId);
    const sales = await query<CustomerSaleRow>(`SELECT
       id,
       staff_id AS staffId,
       total,
       subtotal,
       tax_amount AS taxAmount,
       tax_rate AS taxRate,
       payment_method AS paymentMethod,
       tip_amount AS tipAmount,
       cash_out_amount AS cashOutAmount,
       points_discount AS pointsDiscount,
       promotion_code AS promotionCode,
       promotion_discount AS promotionDiscount,
       status,
       transaction_type AS transactionType,
       parent_sale_id AS parentSaleId,
       refund_status AS refundStatus,
       refunded_amount AS refundedAmount,
       refund_reason AS refundReason,
       table_number AS tableNumber,
       is_tab AS isTab,
       tab_name AS tabName,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM sales
     WHERE tenant_id = $1 AND customer_id = $2
     ORDER BY created_at DESC`, [tenantId, customerId]);
    const saleIds = sales.map(sale => sale.id);
    const saleItems = await listSaleChildren<any>("sale_items", saleIds, `SELECT
       id,
       sale_id AS saleId,
       product_id AS productId,
       product_name AS productName,
       price,
       quantity,
       status,
       workstation_id AS workstationId,
       ordered_at AS orderedAt,
       accepted_at AS acceptedAt,
       ready_at AS readyAt,
       delivered_at AS deliveredAt`);
    const salePayments = await listSaleChildren<any>("sale_payments", saleIds, `SELECT
       id,
       sale_id AS saleId,
       method,
       amount,
       tendered_amount AS tenderedAmount,
       change_amount AS changeAmount,
       tip_amount AS tipAmount,
       cash_out_amount AS cashOutAmount,
       provider,
       provider_device_id AS providerDeviceId,
       provider_reference AS providerReference,
       authorization_code AS authorizationCode,
       provider_status AS providerStatus,
       provider_note AS providerNote,
       created_at AS createdAt`);
    const itemsBySale = new Map<string, any[]>();
    for (const item of saleItems) {
        const saleId = clean(item.saleId ?? item.sale_id);
        itemsBySale.set(saleId, [...(itemsBySale.get(saleId) || []), {
                id: item.id,
                productId: item.productId ?? item.product_id ?? null,
                productName: item.productName ?? item.product_name ?? null,
                price: money(item.price),
                quantity: intValue(item.quantity),
                status: item.status || null,
                workstationId: item.workstationId ?? item.workstation_id ?? null,
                orderedAt: item.orderedAt ?? item.ordered_at ?? null,
                acceptedAt: item.acceptedAt ?? item.accepted_at ?? null,
                readyAt: item.readyAt ?? item.ready_at ?? null,
                deliveredAt: item.deliveredAt ?? item.delivered_at ?? null,
            }]);
    }
    const paymentsBySale = new Map<string, any[]>();
    for (const payment of salePayments) {
        const saleId = clean(payment.saleId ?? payment.sale_id);
        paymentsBySale.set(saleId, [...(paymentsBySale.get(saleId) || []), {
                id: payment.id,
                method: payment.method,
                amount: money(payment.amount),
                tenderedAmount: money(payment.tenderedAmount ?? payment.tendered_amount),
                changeAmount: money(payment.changeAmount ?? payment.change_amount),
                tipAmount: money(payment.tipAmount ?? payment.tip_amount),
                cashOutAmount: money(payment.cashOutAmount ?? payment.cash_out_amount),
                provider: payment.provider || null,
                providerDeviceId: payment.providerDeviceId ?? payment.provider_device_id ?? null,
                providerReference: payment.providerReference ?? payment.provider_reference ?? null,
                authorizationCode: payment.authorizationCode ?? payment.authorization_code ?? null,
                providerStatus: payment.providerStatus ?? payment.provider_status ?? null,
                providerNote: payment.providerNote ?? payment.provider_note ?? null,
                createdAt: payment.createdAt ?? payment.created_at ?? null,
            }]);
    }
    const saleHistory = sales.map(sale => ({
        id: sale.id,
        staffId: sale.staffId || null,
        total: money(sale.total),
        subtotal: money(sale.subtotal),
        taxAmount: money(sale.taxAmount),
        taxRate: money(sale.taxRate),
        paymentMethod: sale.paymentMethod || null,
        tipAmount: money(sale.tipAmount),
        cashOutAmount: money(sale.cashOutAmount),
        pointsDiscount: money(sale.pointsDiscount),
        promotionCode: sale.promotionCode || null,
        promotionDiscount: money(sale.promotionDiscount),
        status: sale.status || null,
        transactionType: sale.transactionType || "sale",
        parentSaleId: sale.parentSaleId || null,
        refundStatus: sale.refundStatus || "none",
        refundedAmount: money(sale.refundedAmount),
        refundReason: sale.refundReason || null,
        tableNumber: sale.tableNumber || null,
        isTab: Boolean(sale.isTab),
        tabName: sale.tabName || null,
        createdAt: sale.createdAt || null,
        updatedAt: sale.updatedAt || null,
        items: itemsBySale.get(sale.id) || [],
        payments: paymentsBySale.get(sale.id) || [],
    }));
    const payoutRequests = await query(`SELECT
       id,
       amount,
       status,
       created_at AS createdAt,
       processed_at AS processedAt,
       processed_by AS processedBy,
       note,
       updated_at AS updatedAt
     FROM customer_payout_requests
     WHERE tenant_id = $1 AND customer_id = $2
     ORDER BY created_at DESC`, [tenantId, customerId]);
    const laybys = await query(`SELECT
       id,
       status,
       subtotal,
       tax_amount AS taxAmount,
       total_amount AS totalAmount,
       deposit_amount AS depositAmount,
       amount_paid AS amountPaid,
       balance_due AS balanceDue,
       due_date AS dueDate,
       completed_sale_id AS completedSaleId,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM layby_orders
     WHERE tenant_id = $1 AND customer_id = $2
     ORDER BY created_at DESC`, [tenantId, customerId]);
    const completedSales = saleHistory.filter(sale => sale.status === "completed" && sale.transactionType !== "refund");
    const refundSales = saleHistory.filter(sale => sale.transactionType === "refund");
    const generatedAt = new Date().toISOString();
    const exportPayload = {
        generatedAt,
        tenantId,
        customerId,
        exportType: "customer_data",
        summary: {
            saleCount: saleHistory.length,
            completedSaleCount: completedSales.length,
            refundCount: refundSales.length,
            completedSalesTotal: money(completedSales.reduce((sum, sale) => sum + sale.total, 0)),
            refundsTotal: money(refundSales.reduce((sum, sale) => sum + Math.abs(sale.total), 0)),
            walletBalance: profile.walletBalance,
            accountEnabled: profile.accountEnabled,
            accountBalance: profile.accountBalance,
            payoutRequestCount: payoutRequests.length,
            laybyCount: laybys.length,
            consentStatuses: consentSummary(consents),
        },
        data: {
            profile,
            consents,
            sales: saleHistory,
            payoutRequests,
            laybys,
        },
    };
    return {
        ...exportPayload,
        filename: `${safeFilenamePart(profile.name)}-customer-data-${generatedAt.slice(0, 10)}.json`,
        mimeType: "application/json;charset=utf-8",
        fileContents: JSON.stringify(exportPayload, null, 2),
    };
}
