import { isPostgres, query } from "./db.js";
import {
  cashierCanAccessLocation,
  DEFAULT_INVENTORY_LOCATION_ID,
  getStaffInventoryLocationAccess,
  listProductLocationStocks,
} from "./inventoryLocations.js";
import { defaultCustomerConsentMap, listTenantCustomerConsents } from "./customerConsents.js";

// ─────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────

function safeParse(str: any, fallback: any) {
  if (typeof str !== 'string') return str || fallback;
  try {
    return JSON.parse(str || JSON.stringify(fallback));
  } catch (e) {
    console.error('Failed to parse JSON field:', str, e);
    return fallback;
  }
}
export async function getTenantIdBySlug(slug: string) {
  const rows = await query<{ tenant_id: string }>(
    "SELECT tenant_id FROM slugs WHERE slug = ? LIMIT 1",
    [slug.toLowerCase()]
  );
  return rows.length > 0 ? rows[0].tenant_id : null;
}

export async function getUserByUid(uid: string) {
  const rows = await query<{
    uid: string;
    tenant_id: string | null;
    email: string;
    name: string;
  }>(
    `SELECT uid, tenant_id, email, name FROM users WHERE uid = ? LIMIT 1`,
    [uid]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function getStaffTenantByEmail(email: string) {
  const rows = await query<{
    tenant_id: string;
    id: string;
    name: string;
    role: string;
    email: string;
  }>(
    `SELECT tenant_id, id, name, role, email FROM staff WHERE email = ? LIMIT 1`,
    [email]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function getProductsByTenant(
  tenantId: string,
  options: { locationId?: string | null; staffId?: string | null; role?: string | null } = {}
) {
  const locationAccess = await getStaffInventoryLocationAccess(tenantId, options.staffId);
  const activeLocationId = String(options.locationId || locationAccess.defaultLocationId || DEFAULT_INVENTORY_LOCATION_ID);
  if (!cashierCanAccessLocation(options.role || locationAccess.role, locationAccess, activeLocationId)) {
    throw new Error("This staff member is not assigned to the selected inventory location.");
  }

  const products = await query<any>(
    `
    SELECT
      id,
      name,
      price,
      cost_price AS costPrice,
      section,
      category,
      sub_category AS subCategory,
      stock,
      min_stock AS minStock,
      image_url AS imageUrl,
      barcode,
      workstation_id AS workstationId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM products
    WHERE tenant_id = ?
    ORDER BY name ASC
    `,
    [tenantId]
  );
  const locationStocks = await listProductLocationStocks(tenantId);
  const stocksByProduct = new Map<string, any[]>();
  for (const stock of locationStocks) {
    const key = String(stock.productId || "");
    stocksByProduct.set(key, [...(stocksByProduct.get(key) || []), stock]);
  }

  return products.map((product: any) => {
    const stocks = stocksByProduct.get(String(product.id)) || [];
    const active = stocks.find((stock) => stock.locationId === activeLocationId)
      || stocks.find((stock) => stock.locationId === DEFAULT_INVENTORY_LOCATION_ID)
      || null;
    return {
      ...product,
      stock: active ? active.quantity : Number(product.stock || 0),
      minStock: active ? active.minStock : Number(product.minStock ?? product.min_stock ?? 0),
      aggregateStock: Number(product.stock || 0),
      activeLocationId,
      locationStock: active || null,
      locationStocks: stocks,
    };
  });
}

export async function getAppConfigByTenant(tenantId: string) {
  const rows = await query<{
    payfast_merchant_id: string;
    payfast_merchant_key: string;
    payfast_passphrase: string;
    payfast_sandbox: number;
    business: string | null;
    categories: string | null;
    retention_policy: string | null;
    slug: string | null;
    setup_completed: number;
  }>(
    `SELECT
       payfast_merchant_id,
       payfast_merchant_key,
       payfast_passphrase,
       payfast_sandbox,
       business,
       categories,
       retention_policy,
       slug,
       setup_completed
     FROM app_settings
     WHERE tenant_id = ?
     LIMIT 1`,
    [tenantId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const business =
    typeof row.business === "string" ? (row.business ? JSON.parse(row.business) : undefined) : (row.business ?? undefined);
  const categories =
    typeof row.categories === "string"
      ? (row.categories ? JSON.parse(row.categories) : undefined)
      : (row.categories ?? undefined);
  const retentionPolicy =
    typeof row.retention_policy === "string"
      ? (row.retention_policy ? JSON.parse(row.retention_policy) : undefined)
      : (row.retention_policy ?? undefined);
  return {
    payfastMerchantId: row.payfast_merchant_id,
    payfastMerchantKey: row.payfast_merchant_key,
    payfastPassphrase: row.payfast_passphrase,
    payfastSandbox: Boolean(row.payfast_sandbox),
    business,
    categories,
    retentionPolicy,
    slug: row.slug || undefined,
    setupCompleted: Boolean(row.setup_completed),
  };
}

export async function getCustomersByTenant(tenantId: string) {
  const rows = await query(
    `SELECT
       id,
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
     WHERE tenant_id = ?
     ORDER BY name ASC`,
    [tenantId]
  );
  const consentsByCustomer = await listTenantCustomerConsents(tenantId);
  return rows.map((r: any) => ({
    ...r,
    loyaltyPoints: r.loyaltyPoints !== null ? Number(r.loyaltyPoints) : 0,
    loyaltyMemberStatus: r.loyaltyMemberStatus || "active",
    loyaltyTierId: r.loyaltyTierId || null,
    membershipCardId: r.membershipCardId || null,
    membershipBarcode: r.membershipBarcode || null,
    membershipStartedAt: r.membershipStartedAt || null,
    walletBalance: r.walletBalance !== null ? Number(r.walletBalance) : 0,
    accountEnabled: Boolean(r.accountEnabled),
    accountLimit: r.accountLimit !== null ? Number(r.accountLimit) : 0,
    accountBalance: r.accountBalance !== null ? Number(r.accountBalance) : 0,
    discountPercent: r.discountPercent !== null ? Number(r.discountPercent) : 0,
    isAnonymized: Boolean(r.isAnonymized),
    anonymizedAt: r.anonymizedAt || null,
    anonymizedBy: r.anonymizedBy || null,
    anonymizedByName: r.anonymizedByName || null,
    anonymizationReason: r.anonymizationReason || null,
    consents: consentsByCustomer.get(String(r.id)) || defaultCustomerConsentMap(),
  }));
}

export async function getStaffByTenant(tenantId: string) {
  const rows = await query(
    `SELECT
       id,
       name,
       role,
       email,
       phone,
       status,
       permissions,
       assigned_sections AS assignedSections,
       assigned_categories AS assignedCategories,
       id_number AS idNumber,
       pay_rate AS payRate,
       pay_type AS payType,
       accumulated_leave AS accumulatedLeave,
       wallet_balance AS walletBalance,
       discount_percent AS discountPercent,
       default_location_id AS defaultLocationId,
       assigned_location_ids AS assignedLocationIds,
       metrics,
       badges,
       rank,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM staff
     WHERE tenant_id = ?
     ORDER BY name ASC`,
    [tenantId]
  );
  
  return rows.map((r: any) => ({
    ...r,
    permissions: safeParse(r.permissions, {}),
    assignedSections: safeParse(r.assignedSections, []),
    assignedCategories: safeParse(r.assignedCategories, []),
    assignedLocationIds: safeParse(r.assignedLocationIds, []),
    walletBalance: r.walletBalance !== null ? Number(r.walletBalance) : 0,
    discountPercent: r.discountPercent !== null ? Number(r.discountPercent) : 0,
    metrics: safeParse(r.metrics, {}),
    badges: safeParse(r.badges, []),
  }));
}

export async function getWorkstationsByTenant(tenantId: string) {
  return query(
    `SELECT
       id,
       name,
       type,
       status,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM workstations
     WHERE tenant_id = ?
     ORDER BY name ASC`,
    [tenantId]
  );
}

export async function getActiveSalesByTenant(tenantId: string) {
  const sales = await query<any>(
    `
      SELECT
        id,
        tenant_id AS tenantId,
        customer_id AS customerId,
        user_id AS userId,
        staff_id AS staffId,
        total,
        subtotal,
        tax_amount AS taxAmount,
        tax_rate AS taxRate,
        tax_inclusive AS taxInclusive,
        payment_method AS paymentMethod,
        tendered_amount AS tenderedAmount,
        change_amount AS changeAmount,
        tip_amount AS tipAmount,
        cash_out_amount AS cashOutAmount,
        points_discount AS pointsDiscount,
        promotion_id AS promotionId,
        promotion_code AS promotionCode,
        promotion_discount AS promotionDiscount,
        status,
        transaction_type AS transactionType,
        parent_sale_id AS parentSaleId,
        refund_status AS refundStatus,
        refunded_amount AS refundedAmount,
        refund_reason AS refundReason,
        refunded_by AS refundedBy,
        void_reason AS voidReason,
        voided_by AS voidedBy,
        payfast_payment_id,
        table_number AS tableNumber,
        is_tab AS isTab,
        tab_name AS tabName,
        offline_event_id AS offlineEventId,
        sync_source AS syncSource,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sales
      WHERE tenant_id = ?
        AND (status IN ('completed','pending','open','kitchen') OR transaction_type = 'void')
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [tenantId]
  );

  // Fetch items for each sale
  for (const sale of sales) {
    sale.items = await query(
      `SELECT
         id,
         product_id AS productId,
         product_name AS name,
         price,
         quantity,
         status,
         workstation_id AS workstationId,
         ordered_at AS orderedAt,
         accepted_at AS acceptedAt,
         ready_at AS readyAt,
         delivered_at AS deliveredAt,
         action_staff_id AS actionStaffId
       FROM sale_items
       WHERE sale_id = ?`,
      [sale.id]
    );

    sale.payments = await query(
      `SELECT
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
         qr_payload AS qrPayload,
         created_at AS createdAt
       FROM sale_payments
       WHERE sale_id = ?`,
      [sale.id]
    );
  }

  return sales;
}

export async function getOpenCashSessionByStaff(tenant_id: string, staff_id: string) {
  const rows = await query(
    `SELECT
      id,
      tenant_id,
      staff_id,
      staff_name,
      opened_at,
      closed_at,
      submitted_at,
      reviewed_at,
      reviewed_by,
      reconciled_at,
      reconciled_by,
      opening_float,
      opening_breakdown,
      expected_cash,
      actual_cash,
      closing_breakdown,
      difference,
      accumulated_tips,
      net_tips,
      status,
      review_status,
      notes,
      manager_notes,
      variance_reason,
      created_at,
      updated_at
     FROM cash_sessions
     WHERE tenant_id = ?
       AND staff_id = ?
       AND status = 'open'
     LIMIT 1`,
    [tenant_id, staff_id]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function getPayoutRequestsByTenant(tenant_id: string) {
  return query(
    `SELECT
       id,
       tenant_id AS tenantId,
       staff_id AS staffId,
       staff_name AS staffName,
       amount,
       status,
       created_at AS createdAt,
       processed_at AS processedAt,
       processed_by AS processedBy,
       note
     FROM payout_requests
     WHERE tenant_id = ?
     ORDER BY created_at DESC`,
    [tenant_id]
  );
}

export async function getCustomerPayoutRequestsByTenant(tenant_id: string) {
  return query(
    `SELECT
       id,
       tenant_id AS tenantId,
       customer_id AS customerId,
       customer_name AS customerName,
       customer_email AS customerEmail,
       amount,
       status,
       created_at AS createdAt,
       processed_at AS processedAt,
       processed_by AS processedBy,
       note
     FROM customer_payout_requests
     WHERE tenant_id = ?
     ORDER BY created_at DESC`,
    [tenant_id]
  );
}

export async function getMessagesByTenant(tenantId: string, limit = 100) {
  return query(
    `SELECT
       id,
       tenant_id AS tenantId,
       channel,
       sender_id AS senderId,
       sender_name AS senderName,
       sender_role AS senderRole,
       text,
       created_at AS createdAt,
       read_by AS readBy,
       is_dev_broadcast AS isDevBroadcast,
       is_system AS isSystem,
       is_system AS isSystemNotification
     FROM messages
     WHERE tenant_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [tenantId, limit]
  );
}

export async function getMessagesByChannel(tenantId: string, channel: string, limit = 100) {
  return query(
    `SELECT
       id,
       tenant_id AS tenantId,
       channel,
       sender_id AS senderId,
       sender_name AS senderName,
       sender_role AS senderRole,
       text,
       created_at AS createdAt,
       read_by AS readBy,
       is_dev_broadcast AS isDevBroadcast,
       is_system AS isSystem,
       is_system AS isSystemNotification
     FROM messages
     WHERE tenant_id = ? AND channel = ?
     ORDER BY created_at ASC
     LIMIT ?`,
    [tenantId, channel, limit]
  );
}

export async function getTableSectionsByTenant(tenantId: string) {
  // Whitelist column names to prevent SQL injection
  const orderCol = isPostgres() 
    ? '"order"' 
    : '`order`';
  return query(
    `SELECT
       id,
       tenant_id AS tenantId,
       name,
       color,
       ${orderCol},
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM table_sections
     WHERE tenant_id = ?
     ORDER BY ${orderCol} ASC`,
    [tenantId]
  );
}

export async function getRestaurantTablesByTenant(tenantId: string) {
  return query(
    `SELECT
       id,
       tenant_id AS tenantId,
       label,
       section_id AS sectionId,
       capacity,
       status,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM restaurant_tables
     WHERE tenant_id = ?
     ORDER BY label ASC`,
    [tenantId]
  );
}
