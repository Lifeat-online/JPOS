import { query, getConnection } from "./db.ts";
import { Product, Customer, Staff, Sale, Workstation } from "../src/types.ts";

// ─────────────────────────────────────────────────────────────────────────
// CREATE Operations
// ─────────────────────────────────────────────────────────────────────────

export async function createProduct(
  tenantId: string,
  product: Omit<Product, "id">
): Promise<Product> {
  const id = `prod_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO products (
      id, tenant_id, name, price, cost_price, section, category, sub_category,
      stock, min_stock, image_url, barcode, workstation_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      product.name,
      product.price,
      product.costPrice || 0,
      product.section || null,
      product.category,
      product.subCategory || null,
      product.stock,
      product.minStock || 0,
      product.imageUrl || null,
      product.barcode || null,
      product.workstationId || null,
    ]
  );
  return { id, ...product };
}

export async function createCustomer(
  tenantId: string,
  customer: Omit<Customer, "id">
): Promise<Customer> {
  const id = `cust_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO customers (
      id, tenant_id, name, email, phone, address, notes,
      loyalty_points, wallet_balance, uid, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      customer.name,
      customer.email,
      customer.phone || null,
      customer.address || null,
      customer.notes || null,
      customer.loyaltyPoints || 0,
      customer.walletBalance || 0,
      customer.uid || null,
    ]
  );
  return { id, ...customer };
}

export async function createStaff(
  tenantId: string,
  staff: Omit<Staff, "id">
): Promise<Staff> {
  const id = `staff_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO staff (
      id, tenant_id, name, role, email, phone, status,
      assigned_sections, assigned_categories, id_number, pay_rate, pay_type,
      accumulated_leave, wallet_balance, metrics, badges, rank, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      staff.name,
      staff.role,
      staff.email,
      staff.phone || null,
      staff.status || "active",
      staff.assignedSections ? JSON.stringify(staff.assignedSections) : "[]",
      staff.assignedCategories ? JSON.stringify(staff.assignedCategories) : "[]",
      staff.idNumber || null,
      staff.payRate || 0,
      staff.payType || null,
      staff.accumulatedLeave || 0,
      staff.walletBalance || 0,
      staff.metrics ? JSON.stringify(staff.metrics) : "{}",
      staff.badges ? JSON.stringify(staff.badges) : "[]",
      staff.rank || null,
    ]
  );
  return { id, ...staff };
}

export async function createWorkstation(
  tenantId: string,
  workstation: Omit<Workstation, "id">
): Promise<Workstation> {
  const id = `ws_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO workstations (id, tenant_id, name, type, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, tenantId, workstation.name, workstation.type, workstation.status || "active"]
  );
  return { id, ...workstation };
}

// ─────────────────────────────────────────────────────────────────────────
// UPDATE Operations
// ─────────────────────────────────────────────────────────────────────────

export async function updateProduct(
  tenantId: string,
  productId: string,
  updates: Partial<Product>
): Promise<Product> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.price !== undefined) {
    fields.push("price = ?");
    values.push(updates.price);
  }
  if (updates.costPrice !== undefined) {
    fields.push("cost_price = ?");
    values.push(updates.costPrice);
  }
  if (updates.section !== undefined) {
    fields.push("section = ?");
    values.push(updates.section);
  }
  if (updates.category !== undefined) {
    fields.push("category = ?");
    values.push(updates.category);
  }
  if (updates.subCategory !== undefined) {
    fields.push("sub_category = ?");
    values.push(updates.subCategory);
  }
  if (updates.stock !== undefined) {
    fields.push("stock = ?");
    values.push(updates.stock);
  }
  if (updates.minStock !== undefined) {
    fields.push("min_stock = ?");
    values.push(updates.minStock);
  }
  if (updates.imageUrl !== undefined) {
    fields.push("image_url = ?");
    values.push(updates.imageUrl);
  }
  if (updates.barcode !== undefined) {
    fields.push("barcode = ?");
    values.push(updates.barcode);
  }
  if (updates.workstationId !== undefined) {
    fields.push("workstation_id = ?");
    values.push(updates.workstationId);
  }

  fields.push("updated_at = NOW()");
  values.push(tenantId, productId);

  if (fields.length === 1) {
    // Only updated_at changed
    const rows = await query(`SELECT * FROM products WHERE tenant_id = ? AND id = ?`, [
      tenantId,
      productId,
    ]);
    return rows[0] as Product;
  }

  await query(
    `UPDATE products SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

  const rows = await query(`SELECT * FROM products WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    productId,
  ]);
  return rows[0] as Product;
}

export async function updateCustomer(
  tenantId: string,
  customerId: string,
  updates: Partial<Customer>
): Promise<Customer> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.email !== undefined) {
    fields.push("email = ?");
    values.push(updates.email);
  }
  if (updates.phone !== undefined) {
    fields.push("phone = ?");
    values.push(updates.phone);
  }
  if (updates.address !== undefined) {
    fields.push("address = ?");
    values.push(updates.address);
  }
  if (updates.notes !== undefined) {
    fields.push("notes = ?");
    values.push(updates.notes);
  }
  if (updates.loyaltyPoints !== undefined) {
    fields.push("loyalty_points = ?");
    values.push(updates.loyaltyPoints);
  }
  if (updates.walletBalance !== undefined) {
    fields.push("wallet_balance = ?");
    values.push(updates.walletBalance);
  }

  fields.push("updated_at = NOW()");
  values.push(tenantId, customerId);

  if (fields.length === 1) {
    const rows = await query(`SELECT * FROM customers WHERE tenant_id = ? AND id = ?`, [
      tenantId,
      customerId,
    ]);
    return rows[0] as Customer;
  }

  await query(
    `UPDATE customers SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

  const rows = await query(`SELECT * FROM customers WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    customerId,
  ]);
  return rows[0] as Customer;
}

export async function updateStaff(
  tenantId: string,
  staffId: string,
  updates: Partial<Staff>
): Promise<Staff> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.role !== undefined) {
    fields.push("role = ?");
    values.push(updates.role);
  }
  if (updates.email !== undefined) {
    fields.push("email = ?");
    values.push(updates.email);
  }
  if (updates.phone !== undefined) {
    fields.push("phone = ?");
    values.push(updates.phone);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.assignedSections !== undefined) {
    fields.push("assigned_sections = ?");
    values.push(JSON.stringify(updates.assignedSections));
  }
  if (updates.assignedCategories !== undefined) {
    fields.push("assigned_categories = ?");
    values.push(JSON.stringify(updates.assignedCategories));
  }
  if (updates.idNumber !== undefined) {
    fields.push("id_number = ?");
    values.push(updates.idNumber);
  }
  if (updates.payRate !== undefined) {
    fields.push("pay_rate = ?");
    values.push(updates.payRate);
  }
  if (updates.payType !== undefined) {
    fields.push("pay_type = ?");
    values.push(updates.payType);
  }
  if (updates.accumulatedLeave !== undefined) {
    fields.push("accumulated_leave = ?");
    values.push(updates.accumulatedLeave);
  }
  if (updates.walletBalance !== undefined) {
    fields.push("wallet_balance = ?");
    values.push(updates.walletBalance);
  }
  if (updates.metrics !== undefined) {
    fields.push("metrics = ?");
    values.push(JSON.stringify(updates.metrics));
  }
  if (updates.badges !== undefined) {
    fields.push("badges = ?");
    values.push(JSON.stringify(updates.badges));
  }
  if (updates.rank !== undefined) {
    fields.push("rank = ?");
    values.push(updates.rank);
  }

  fields.push("updated_at = NOW()");
  values.push(tenantId, staffId);

  if (fields.length === 1) {
    const rows = await query(`SELECT * FROM staff WHERE tenant_id = ? AND id = ?`, [
      tenantId,
      staffId,
    ]);
    return rows[0] as Staff;
  }

  await query(
    `UPDATE staff SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

  const rows = await query(`SELECT * FROM staff WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    staffId,
  ]);
  return rows[0] as Staff;
}

// ─────────────────────────────────────────────────────────────────────────
// DELETE Operations
// ─────────────────────────────────────────────────────────────────────────

export async function deleteProduct(tenantId: string, productId: string): Promise<void> {
  await query(`DELETE FROM products WHERE tenant_id = ? AND id = ?`, [tenantId, productId]);
}

export async function deleteCustomer(tenantId: string, customerId: string): Promise<void> {
  await query(`DELETE FROM customers WHERE tenant_id = ? AND id = ?`, [tenantId, customerId]);
}

export async function deleteStaff(tenantId: string, staffId: string): Promise<void> {
  await query(`DELETE FROM staff WHERE tenant_id = ? AND id = ?`, [tenantId, staffId]);
}

export async function deleteWorkstation(tenantId: string, workstationId: string): Promise<void> {
  await query(`DELETE FROM workstations WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    workstationId,
  ]);
}

// ─────────────────────────────────────────────────────────────────────────
// Sale Operations
// ─────────────────────────────────────────────────────────────────────────

export async function createSale(tenantId: string, sale: Partial<Sale>): Promise<Sale> {
  const id = `sale_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO sales (
      id, tenant_id, customer_id, user_id, staff_id, total, subtotal, tax_amount,
      tax_rate, tax_inclusive, payment_method, tendered_amount, change_amount,
      tip_amount, cash_out_amount, points_discount, status, payfast_payment_id,
      table_number, is_tab, tab_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      sale.customerId || null,
      sale.userId || null,
      sale.staffId || null,
      sale.total || 0,
      sale.subtotal || 0,
      sale.taxAmount || 0,
      sale.taxRate || 0,
      sale.taxInclusive ? 1 : 0,
      sale.paymentMethod || "pending",
      sale.tenderedAmount || 0,
      sale.changeAmount || 0,
      sale.tipAmount || 0,
      sale.cashOutAmount || 0,
      sale.pointsDiscount || 0,
      sale.status || "pending",
      sale.payfast_payment_id || null,
      sale.tableNumber || null,
      sale.isTab ? 1 : 0,
      sale.tabName || null,
    ]
  );
  return { id, ...sale } as Sale;
}

export async function updateSaleStatus(
  tenantId: string,
  saleId: string,
  status: Sale["status"]
): Promise<Sale> {
  await query(
    `UPDATE sales SET status = ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
    [status, tenantId, saleId]
  );

  const rows = await query(`SELECT * FROM sales WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    saleId,
  ]);
  return rows[0] as Sale;
}

export async function getSaleById(tenantId: string, saleId: string): Promise<Sale | null> {
  const rows = await query(`SELECT * FROM sales WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    saleId,
  ]);
  return rows.length > 0 ? (rows[0] as Sale) : null;
}
