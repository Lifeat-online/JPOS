import { isPostgres, query } from "./db.js";

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

export async function getProductsByTenant(tenantId: string) {
  return query(
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
}

export async function getAppConfigByTenant(tenantId: string) {
  const rows = await query<{
    payfast_merchant_id: string;
    payfast_merchant_key: string;
    payfast_passphrase: string;
    payfast_sandbox: number;
    business: string | null;
    categories: string | null;
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
  return {
    payfastMerchantId: row.payfast_merchant_id,
    payfastMerchantKey: row.payfast_merchant_key,
    payfastPassphrase: row.payfast_passphrase,
    payfastSandbox: Boolean(row.payfast_sandbox),
    business,
    categories,
    slug: row.slug || undefined,
    setupCompleted: Boolean(row.setup_completed),
  };
}

export async function getCustomersByTenant(tenantId: string) {
  return query(
    `SELECT
       id,
       name,
       email,
       phone,
       address,
       notes,
       loyalty_points AS loyaltyPoints,
       wallet_balance AS walletBalance,
       uid,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM customers
     WHERE tenant_id = ?
     ORDER BY name ASC`,
    [tenantId]
  );
}

export async function getStaffByTenant(tenantId: string) {
  return query(
    `SELECT
       id,
       name,
       role,
       email,
       phone,
       status,
       assigned_sections AS assignedSections,
       assigned_categories AS assignedCategories,
       id_number AS idNumber,
       pay_rate AS payRate,
       pay_type AS payType,
       accumulated_leave AS accumulatedLeave,
       wallet_balance AS walletBalance,
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
        status,
        payfast_payment_id,
        table_number AS tableNumber,
        is_tab AS isTab,
        tab_name AS tabName,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM sales
      WHERE tenant_id = ?
        AND status IN ('completed','pending','open','kitchen')
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
  }

  return sales;
}

export async function getOpenCashSessionByStaff(tenant_id: string, staff_id: string) {
  const rows = await query(
    `SELECT *
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
       is_system AS isSystem
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
       is_system AS isSystem
     FROM messages
     WHERE tenant_id = ? AND channel = ?
     ORDER BY created_at ASC
     LIMIT ?`,
    [tenantId, channel, limit]
  );
}

export async function getTableSectionsByTenant(tenantId: string) {
  const orderCol = isPostgres() ? '"order"' : "`order`";
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
