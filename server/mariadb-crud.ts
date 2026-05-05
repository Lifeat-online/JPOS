import pool, { query, getConnection } from "./db.ts";
import { Product, Customer, Staff, Sale, Workstation, AppConfig } from "../src/types.ts";

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

export async function createTableSection(
  tenantId: string,
  section: any
): Promise<any> {
  const id = `sec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO table_sections (id, tenant_id, name, color, \`order\`, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, tenantId, section.name, section.color || null, section.order || 0]
  );
  return { id, ...section };
}

export async function createRestaurantTable(
  tenantId: string,
  table: any
): Promise<any> {
  const id = `tbl_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO restaurant_tables (id, tenant_id, label, section_id, capacity, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, tenantId, table.label, table.sectionId || null, table.capacity || 1, table.status || "active"]
  );
  return { id, ...table };
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

export async function updateTableSection(
  tenantId: string,
  sectionId: string,
  updates: any
): Promise<any> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.color !== undefined) {
    fields.push("color = ?");
    values.push(updates.color);
  }
  if (updates.order !== undefined) {
    fields.push("`order` = ?");
    values.push(updates.order);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = NOW()");
  values.push(tenantId, sectionId);

  await query(
    `UPDATE table_sections SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );
  return { id: sectionId, ...updates };
}

export async function updateRestaurantTable(
  tenantId: string,
  tableId: string,
  updates: any
): Promise<any> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.label !== undefined) {
    fields.push("label = ?");
    values.push(updates.label);
  }
  if (updates.sectionId !== undefined) {
    fields.push("section_id = ?");
    values.push(updates.sectionId);
  }
  if (updates.capacity !== undefined) {
    fields.push("capacity = ?");
    values.push(updates.capacity);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = NOW()");
  values.push(tenantId, tableId);

  await query(
    `UPDATE restaurant_tables SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );
  return { id: tableId, ...updates };
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

export async function deleteTableSection(tenantId: string, sectionId: string): Promise<void> {
  await query(`DELETE FROM table_sections WHERE tenant_id = ? AND id = ?`, [tenantId, sectionId]);
}

export async function deleteRestaurantTable(tenantId: string, tableId: string): Promise<void> {
  await query(`DELETE FROM restaurant_tables WHERE tenant_id = ? AND id = ?`, [tenantId, tableId]);
}

// ─────────────────────────────────────────────────────────────────────────
// Sale Operations
// ─────────────────────────────────────────────────────────────────────────

export async function createSale(tenantId: string, sale: Partial<Sale>): Promise<Sale> {
  const id = `sale_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
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

    // Insert items
    if (sale.items && Array.isArray(sale.items)) {
      for (const item of sale.items) {
        const itemId = `item_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await conn.query(
          `INSERT INTO sale_items (
            id, sale_id, product_id, product_name, price, quantity, status,
            workstation_id, ordered_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [
            itemId,
            id,
            item.productId || null,
            item.name,
            item.price,
            item.quantity,
            item.status || "pending",
            item.workstationId || null,
          ]
        );
      }
    }

    await conn.commit();
    return { id, ...sale } as Sale;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function updateSaleItem(
  tenantId: string,
  saleId: string,
  itemId: string,
  updates: any
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);

    if (updates.status === 'accepted') {
      fields.push("accepted_at = NOW()");
    } else if (updates.status === 'ready') {
      fields.push("ready_at = NOW()");
    } else if (updates.status === 'delivered') {
      fields.push("delivered_at = NOW()");
    }
  }

  if (updates.actionStaffId !== undefined) {
    fields.push("action_staff_id = ?");
    values.push(updates.actionStaffId);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = NOW()");
  values.push(saleId, itemId);

  await query(
    `UPDATE sale_items SET ${fields.join(", ")} WHERE sale_id = ? AND id = ?`,
    values
  );
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

// ─────────────────────────────────────────────────────────────────────────
// Payout Request Operations
// ─────────────────────────────────────────────────────────────────────────

export async function createPayoutRequest(
  tenantId: string,
  data: any
): Promise<any> {
  const id = `payout_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO payout_requests (
      id, tenant_id, staff_id, staff_name, amount, status, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      data.staffId || null,
      data.staffName || null,
      data.amount,
      data.status || "pending",
      data.note || null,
    ]
  );
  return { id, ...data };
}

export async function updatePayoutRequest(
  tenantId: string,
  id: string,
  updates: any
): Promise<any> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.processedAt !== undefined) {
    fields.push("processed_at = ?");
    values.push(updates.processedAt);
  }
  if (updates.processedBy !== undefined) {
    fields.push("processed_by = ?");
    values.push(updates.processedBy);
  }
  if (updates.note !== undefined) {
    fields.push("note = ?");
    values.push(updates.note);
  }

  fields.push("updated_at = NOW()");
  values.push(tenantId, id);

  await query(
    `UPDATE payout_requests SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

  const rows = await query(`SELECT * FROM payout_requests WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    id,
  ]);
  return rows[0];
}

export async function createCustomerPayoutRequest(
  tenantId: string,
  data: any
): Promise<any> {
  const id = `cpout_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO customer_payout_requests (
      id, tenant_id, customer_id, customer_name, customer_email, amount, status, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      data.customerId,
      data.customerName,
      data.customerEmail,
      data.amount,
      data.status || "pending",
      data.note || null,
    ]
  );
  return { id, ...data };
}

export async function updateCustomerPayoutRequest(
  tenantId: string,
  id: string,
  updates: any
): Promise<any> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.processedAt !== undefined) {
    fields.push("processed_at = ?");
    values.push(updates.processedAt);
  }
  if (updates.processedBy !== undefined) {
    fields.push("processed_by = ?");
    values.push(updates.processedBy);
  }
  if (updates.note !== undefined) {
    fields.push("note = ?");
    values.push(updates.note);
  }

  fields.push("updated_at = NOW()");
  values.push(tenantId, id);

  await query(
    `UPDATE customer_payout_requests SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

  const rows = await query(`SELECT * FROM customer_payout_requests WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    id,
  ]);
  return rows[0];
}

export async function updateAppConfig(
  tenantId: string,
  config: AppConfig
): Promise<void> {
  await query(
    `UPDATE app_settings
     SET payfast_merchant_id = ?,
         payfast_merchant_key = ?,
         payfast_passphrase = ?,
         payfast_sandbox = ?,
         business = ?,
         categories = ?,
         slug = ?,
         setup_completed = ?,
         updated_at = NOW()
     WHERE tenant_id = ?`,
    [
      config.payfastMerchantId,
      config.payfastMerchantKey,
      config.payfastPassphrase,
      config.payfastSandbox ? 1 : 0,
      JSON.stringify(config.business || {}),
      JSON.stringify(config.categories || {}),
      config.slug || null,
      config.setupCompleted ? 1 : 0,
      tenantId
    ]
  );
}

export async function createMessage(
  tenantId: string,
  data: any
): Promise<any> {
  const id = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO messages (
      id, tenant_id, channel, sender_id, sender_name, sender_role, text,
      read_by, is_dev_broadcast, is_system, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      id,
      tenantId,
      data.channel,
      data.senderId,
      data.senderName,
      data.senderRole,
      data.text,
      JSON.stringify(data.readBy || []),
      data.isDevBroadcast ? 1 : 0,
      data.isSystem ? 1 : 0,
    ]
  );
  return { id, ...data };
}

export async function markMessageRead(
  tenantId: string,
  messageId: string,
  userId: string
): Promise<void> {
  // Use JSON_ARRAY_APPEND if supported, or JSON_MERGE_PRESERVE
  // MariaDB 10.2+ JSON support
  await query(
    `UPDATE messages
     SET read_by = JSON_ARRAY_APPEND(read_by, '$', ?),
         created_at = created_at -- prevent updating created_at if OnUpdate was set (it's not but safe)
     WHERE tenant_id = ? AND id = ?
       AND NOT JSON_CONTAINS(read_by, JSON_QUOTE(?))`,
    [userId, tenantId, messageId, userId]
  );
}

export async function setupTenant(data: {
  businessName: string;
  user: { uid: string; email: string; displayName: string };
  config: any;
}): Promise<{ tenantId: string }> {
  const tenantId = `tnt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Create tenant
    await conn.query(
      `INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
      [tenantId, data.businessName]
    );

    // 2. Create or update user association
    await conn.query(
      `INSERT INTO users (uid, tenant_id, email, name, created_at, updated_at) 
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), name = VALUES(name), updated_at = NOW()`,
      [data.user.uid, tenantId, data.user.email, data.user.displayName]
    );
    
    // 3. Create staff (admin)
    const DEV_EMAIL = 'jameskoen78@gmail.com';
    const assignedRole = data.user.email === DEV_EMAIL ? 'dev' : 'admin';
    await conn.query(
      `INSERT INTO staff (id, tenant_id, name, email, role, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())
       ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), role = VALUES(role), updated_at = NOW()`,
      [data.user.uid, tenantId, data.user.displayName, data.user.email, assignedRole]
    );

    // 4. Create config
    await conn.query(
      `INSERT INTO app_settings (tenant_id, business, setup_completed, created_at, updated_at) 
       VALUES (?, ?, 0, NOW(), NOW())`,
      [tenantId, JSON.stringify({ name: data.businessName })]
    );

    // 5. Create default workstation
    const wsId = `ws_${Date.now()}_kitchen`;
    await conn.query(
      `INSERT INTO workstations (id, tenant_id, name, type, status, created_at, updated_at) 
       VALUES (?, ?, 'Kitchen', 'kitchen', 'active', NOW(), NOW())`,
      [wsId, tenantId]
    );

    await conn.commit();
    return { tenantId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function clearAllSales(tenantId: string): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Delete items first due to FK
    await conn.query(`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE tenant_id = ?)`, [tenantId]);
    await conn.query(`DELETE FROM sales WHERE tenant_id = ?`, [tenantId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function seedProducts(tenantId: string, products: any[]): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const p of products) {
      const id = `prod_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await conn.query(
        `INSERT INTO products (
          id, tenant_id, name, price, category, section, stock, min_stock, barcode, image_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          id,
          tenantId,
          p.name,
          p.price,
          p.category,
          p.section || null,
          p.stock || 0,
          p.minStock || null,
          p.barcode || null,
          p.imageUrl || null,
        ]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
