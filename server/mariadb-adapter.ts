import { query } from "./db.ts";

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
  return {
    payfastMerchantId: row.payfast_merchant_id,
    payfastMerchantKey: row.payfast_merchant_key,
    payfastPassphrase: row.payfast_passphrase,
    payfastSandbox: Boolean(row.payfast_sandbox),
    business: row.business ? JSON.parse(row.business) : undefined,
    categories: row.categories ? JSON.parse(row.categories) : undefined,
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
  return query(
    `
      SELECT *
      FROM sales
      WHERE tenant_id = ?
        AND status IN ('completed','pending','open','kitchen')
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [tenantId]
  );
}

export async function getOpenCashSessionByStaff(tenantId: string, staffId: string) {
  const rows = await query(
    `SELECT *
     FROM cash_sessions
     WHERE tenant_id = ?
       AND staff_id = ?
       AND status = 'open'
     LIMIT 1`,
    [tenantId, staffId]
  );
  return rows.length > 0 ? rows[0] : null;
}
