import { getConnection, isPostgres, query } from "./db.js";
import type { Product, Customer, Staff, Sale, Workstation, AppConfig, OrderItem, BulkItem, RecipeItem, ModifierGroup, ModifierOption } from "./types.js";

const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY;
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE;

if (!PAYFAST_MERCHANT_ID || !PAYFAST_MERCHANT_KEY || !PAYFAST_PASSPHRASE) {
  console.warn("⚠️  PayFast credentials not configured. Payment processing will fail.");
}

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
      permissions, assigned_sections, assigned_categories, id_number, pay_rate, pay_type,
      accumulated_leave, wallet_balance, metrics, badges, rank, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      staff.name,
      staff.role,
      staff.email,
      staff.phone || null,
      staff.status || "active",
      staff.permissions ? JSON.stringify(staff.permissions) : "{}",
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
  // Whitelist column names to prevent SQL injection
  const orderCol = isPostgres() 
    ? '"order"' 
    : '`order`';
  await query(
    `INSERT INTO table_sections (id, tenant_id, name, color, ${orderCol}, created_at, updated_at)
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
    const rows = await query(
      `SELECT
        id,
        tenant_id AS tenantId,
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
      WHERE tenant_id = ? AND id = ?`,
      [tenantId, productId]
    );
    return rows[0] as Product;
  }

  await query(
    `UPDATE products SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

  const rows = await query(
    `SELECT
      id,
      tenant_id AS tenantId,
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
    WHERE tenant_id = ? AND id = ?`,
    [tenantId, productId]
  );
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
    const r = rows[0] as any;
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      address: r.address,
      notes: r.notes,
      loyaltyPoints: r.loyalty_points !== null ? Number(r.loyalty_points) : 0,
      walletBalance: r.wallet_balance !== null ? Number(r.wallet_balance) : 0,
      uid: r.uid,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    } as Customer;
  }

  await query(
    `UPDATE customers SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

  const rows = await query(`SELECT * FROM customers WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    customerId,
  ]);
  const r = rows[0] as any;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    address: r.address,
    notes: r.notes,
    loyaltyPoints: r.loyalty_points !== null ? Number(r.loyalty_points) : 0,
    walletBalance: r.wallet_balance !== null ? Number(r.wallet_balance) : 0,
    uid: r.uid,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  } as Customer;
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
  if (updates.permissions !== undefined) {
    fields.push("permissions = ?");
    values.push(JSON.stringify(updates.permissions));
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
  if (updates.walletBalanceDelta !== undefined) {
    fields.push("wallet_balance = COALESCE(wallet_balance, 0) + ?");
    values.push(updates.walletBalanceDelta);
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
        metrics,
        badges,
        rank,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM staff
      WHERE tenant_id = ? AND id = ?`,
      [tenantId, staffId]
    );
    const r = rows[0] as any;
    return {
      ...r,
      permissions: safeParse(r.permissions, {}),
      assignedSections: safeParse(r.assignedSections, []),
      assignedCategories: safeParse(r.assignedCategories, []),
      metrics: safeParse(r.metrics, {}),
      badges: safeParse(r.badges, []),
    } as Staff;
  }

  await query(
    `UPDATE staff SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

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
      metrics,
      badges,
      rank,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM staff
    WHERE tenant_id = ? AND id = ?`,
    [tenantId, staffId]
  );
  const r = rows[0] as any;
  return {
    ...r,
    permissions: safeParse(r.permissions, {}),
    assignedSections: safeParse(r.assignedSections, []),
    assignedCategories: safeParse(r.assignedCategories, []),
    metrics: safeParse(r.metrics, {}),
    badges: safeParse(r.badges, []),
  } as Staff;
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
    const orderCol = isPostgres() ? '"order"' : "`order`";
    fields.push(`${orderCol} = ?`);
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

    // Insert items & Deduct stock
    if (sale.items && Array.isArray(sale.items)) {
      for (const item of sale.items) {
        const itemId = generateSaleItemId();
        const productId = (item as any).productId || item.id || null;
        
        await conn.query(
          `INSERT INTO sale_items (
            id, sale_id, product_id, product_name, price, quantity, status,
            workstation_id, ordered_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [
            itemId,
            id,
            productId,
            item.name,
            item.price,
            item.quantity,
            (item as OrderItem).status || "pending",
            item.workstationId || null,
          ]
        );

        // 1. Deduct Bulk Stock from Recipe
        if (productId) {
          const [recipe] = await conn.query<any>(
            `SELECT bulk_item_id, quantity FROM product_recipes WHERE product_id = ?`,
            [productId]
          );
          for (const r of recipe) {
            await conn.query(
              `UPDATE bulk_items SET stock = stock - ? WHERE id = ?`,
              [r.quantity * item.quantity, r.bulk_item_id]
            );
          }
        }

        // 2. Deduct Bulk Stock from Modifiers
        if (item.selectedModifiers && Array.isArray(item.selectedModifiers)) {
          for (const mod of item.selectedModifiers) {
            const [opt] = await conn.query<any>(
              `SELECT bulk_item_id, bulk_quantity FROM modifier_options WHERE id = ?`,
              [mod.optionId]
            );
            if (opt.length > 0 && opt[0].bulk_item_id) {
              await conn.query(
                `UPDATE bulk_items SET stock = stock - ? WHERE id = ?`,
                [opt[0].bulk_quantity * item.quantity, opt[0].bulk_item_id]
              );
            }
          }
        }
      }
    }

    // Insert payments
    if (sale.payments && Array.isArray(sale.payments)) {
      for (const p of sale.payments) {
        const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await conn.query(
          `INSERT INTO sale_payments (
            id, sale_id, method, amount, tendered_amount, change_amount, tip_amount, cash_out_amount, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            paymentId,
            id,
            p.method,
            p.amount,
            p.tenderedAmount || 0,
            p.changeAmount || 0,
            p.tipAmount || 0,
            p.cashOutAmount || 0,
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

function generateSaleItemId() {
  return `item_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

export async function updateSale(
  tenantId: string,
  saleId: string,
  updates: Partial<Sale>
): Promise<Sale> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.customerId !== undefined) {
      fields.push("customer_id = ?");
      values.push(updates.customerId || null);
    }
    if (updates.userId !== undefined) {
      fields.push("user_id = ?");
      values.push(updates.userId || null);
    }
    if (updates.staffId !== undefined) {
      fields.push("staff_id = ?");
      values.push(updates.staffId || null);
    }
    if (updates.total !== undefined) {
      fields.push("total = ?");
      values.push(updates.total || 0);
    }
    if (updates.subtotal !== undefined) {
      fields.push("subtotal = ?");
      values.push(updates.subtotal || 0);
    }
    if (updates.taxAmount !== undefined) {
      fields.push("tax_amount = ?");
      values.push(updates.taxAmount || 0);
    }
    if (updates.taxRate !== undefined) {
      fields.push("tax_rate = ?");
      values.push(updates.taxRate || 0);
    }
    if (updates.taxInclusive !== undefined) {
      fields.push("tax_inclusive = ?");
      values.push(updates.taxInclusive ? 1 : 0);
    }
    if (updates.paymentMethod !== undefined) {
      fields.push("payment_method = ?");
      values.push(updates.paymentMethod);
    }
    if (updates.tenderedAmount !== undefined) {
      fields.push("tendered_amount = ?");
      values.push(updates.tenderedAmount || 0);
    }
    if (updates.changeAmount !== undefined) {
      fields.push("change_amount = ?");
      values.push(updates.changeAmount || 0);
    }
    if (updates.tipAmount !== undefined) {
      fields.push("tip_amount = ?");
      values.push(updates.tipAmount || 0);
    }
    if (updates.cashOutAmount !== undefined) {
      fields.push("cash_out_amount = ?");
      values.push(updates.cashOutAmount || 0);
    }
    if (updates.pointsDiscount !== undefined) {
      fields.push("points_discount = ?");
      values.push(updates.pointsDiscount || 0);
    }
    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if (updates.payfast_payment_id !== undefined) {
      fields.push("payfast_payment_id = ?");
      values.push(updates.payfast_payment_id || null);
    }
    if (updates.tableNumber !== undefined) {
      fields.push("table_number = ?");
      values.push(updates.tableNumber || null);
    }
    if (updates.isTab !== undefined) {
      fields.push("is_tab = ?");
      values.push(updates.isTab ? 1 : 0);
    }
    if (updates.tabName !== undefined) {
      fields.push("tab_name = ?");
      values.push(updates.tabName || null);
    }

    if (fields.length > 0) {
      fields.push("updated_at = NOW()");
      values.push(tenantId, saleId);
      await conn.query(
        `UPDATE sales SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
        values
      );
    }

    if (updates.items !== undefined) {
      // Get existing items to preserve their status and timestamps
      let existingItems: any[] = [];
      try {
        const [result] = await conn.query<any>(`SELECT * FROM sale_items WHERE sale_id = ?`, [saleId]);
        existingItems = result;
      } catch (error) {
        console.warn('Failed to fetch existing items:', error);
      }
      
      const existingMap = new Map();
      for (const ex of existingItems) {
        existingMap.set(ex.id, ex);
      }

      await conn.query(`DELETE FROM sale_items WHERE sale_id = ?`, [saleId]);

      for (const rawItem of updates.items) {
        const item = rawItem as OrderItem & { productId?: string };
        const saleItemId = item.id && item.productId ? item.id : generateSaleItemId();
        const productId = item.productId || item.id || null;
        
        // Preserve status and timestamps if it exists
        const ex = existingMap.get(saleItemId);
        const finalStatus = ex ? ex.status : (item.status || "pending");
        const finalOrderedAt = ex?.ordered_at || (item.orderedAt ? new Date(item.orderedAt) : null);
        const finalAcceptedAt = ex?.accepted_at || (item.acceptedAt ? new Date(item.acceptedAt) : null);
        const finalReadyAt = ex?.ready_at || (item.readyAt ? new Date(item.readyAt) : null);
        const finalDeliveredAt = ex?.delivered_at || (item.deliveredAt ? new Date(item.deliveredAt) : null);

        await conn.query(
          `INSERT INTO sale_items (
            id, sale_id, product_id, product_name, price, quantity, status,
            workstation_id, ordered_at, accepted_at, ready_at, delivered_at,
            action_staff_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            saleItemId,
            saleId,
            productId,
            item.name,
            item.price || 0,
            item.quantity || 0,
            finalStatus,
            item.workstationId || null,
            finalOrderedAt,
            finalAcceptedAt,
            finalReadyAt,
            finalDeliveredAt,
            item.actionStaffId || null,
          ]
        );
      }
    }

    if (updates.payments !== undefined) {
      await conn.query(`DELETE FROM sale_payments WHERE sale_id = ?`, [saleId]);
      for (const p of updates.payments) {
        const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await conn.query(
          `INSERT INTO sale_payments (
            id, sale_id, method, amount, tendered_amount, change_amount, tip_amount, cash_out_amount, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            paymentId,
            saleId,
            p.method,
            p.amount,
            p.tenderedAmount || 0,
            p.changeAmount || 0,
            p.tipAmount || 0,
            p.cashOutAmount || 0,
          ]
        );
      }
    }

    await conn.commit();
    const sale = await getSaleById(tenantId, saleId);
    if (!sale) {
      throw new Error(`Sale ${saleId} not found after update`);
    }
    return sale;
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
  return updateSale(tenantId, saleId, { status });
}

export async function getSaleById(tenantId: string, saleId: string): Promise<Sale | null> {
  const rows = await query(
    `SELECT
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
    WHERE tenant_id = ? AND id = ?`,
    [tenantId, saleId]
  );
  
  if (rows.length === 0) return null;
  const sale = rows[0] as Sale;
  
  const items = await query(
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
    [saleId]
  );
  
  sale.items = items;

  const payments = await query(
    `SELECT
       id,
       sale_id AS saleId,
       method,
       amount,
       tendered_amount AS tenderedAmount,
       change_amount AS changeAmount,
       tip_amount AS tipAmount,
       cash_out_amount AS cashOutAmount,
       created_at AS createdAt
     FROM sale_payments
     WHERE sale_id = ?`,
    [saleId]
  );
  sale.payments = payments;

  return sale;
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
  const rows = await query<{ read_by: any }>(
    `SELECT read_by FROM messages WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, messageId]
  );
  if (rows.length === 0) return;

  const raw = rows[0].read_by;
  let readBy: string[] = [];
  if (Array.isArray(raw)) {
    readBy = raw.map(String);
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) readBy = parsed.map(String);
    } catch {}
  }

  if (!readBy.includes(userId)) readBy.push(userId);

  await query(
    `UPDATE messages SET read_by = ? WHERE tenant_id = ? AND id = ?`,
    [JSON.stringify(readBy), tenantId, messageId]
  );
}

export async function setupTenant(data: {
  businessName: string;
  user: { uid: string; email: string; displayName: string };
  config?: any;
}): Promise<{ tenantId: string }> {
  const tenantId = `tnt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const config = data.config || {};
  const businessConfig = {
    ...config.business,
    name: data.businessName,
    packageTier: config.business?.packageTier || process.env.JPOS_HOSTED_PACKAGE_TIER || "free",
  };
  
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const pg = isPostgres();

    // 1. Create tenant
    await conn.query(
      `INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
      [tenantId, data.businessName]
    );

    // 2. Create or update user association
    await conn.query(
      pg
        ? `INSERT INTO users (uid, tenant_id, email, name, created_at, updated_at)
           VALUES (?, ?, ?, ?, NOW(), NOW())
           ON CONFLICT (uid) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, name = EXCLUDED.name, updated_at = NOW()`
        : `INSERT INTO users (uid, tenant_id, email, name, created_at, updated_at) 
           VALUES (?, ?, ?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), name = VALUES(name), updated_at = NOW()`,
      [data.user.uid, tenantId, data.user.email, data.user.displayName]
    );
    
    // 3. Create staff (admin)
    const DEV_EMAIL = 'jameskoen78@gmail.com';
    const assignedRole = String(data.user.email || '').trim().toLowerCase() === DEV_EMAIL ? 'dev' : 'admin';
    await conn.query(
      pg
        ? `INSERT INTO staff (id, tenant_id, name, email, role, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, updated_at = NOW()`
        : `INSERT INTO staff (id, tenant_id, name, email, role, status, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())
           ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), role = VALUES(role), updated_at = NOW()`,
      [data.user.uid, tenantId, data.user.displayName, data.user.email, assignedRole]
    );

    // 4. Create config and mark setup completed
    await conn.query(
      `INSERT INTO app_settings (
        tenant_id,
        payfast_merchant_id,
        payfast_merchant_key,
        payfast_passphrase,
        payfast_sandbox,
        business,
        categories,
        slug,
        setup_completed,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        tenantId,
        config.payfastMerchantId || PAYFAST_MERCHANT_ID,
        config.payfastMerchantKey || PAYFAST_MERCHANT_KEY,
        config.payfastPassphrase || PAYFAST_PASSPHRASE,
        config.payfastSandbox ? 1 : 0,
        JSON.stringify(businessConfig),
        config.categories ? JSON.stringify(config.categories) : null,
        config.slug || null,
        1,
      ]
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
  const conn = await getConnection();
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
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    for (const p of products) {
      const [existing] = await conn.query<{ id: string }>(
        `SELECT id FROM products
         WHERE tenant_id = ?
           AND (
             (barcode IS NOT NULL AND barcode <> '' AND barcode = ?)
             OR (name = ? AND category = ? AND COALESCE(section, '') = COALESCE(?, ''))
           )
         ORDER BY created_at ASC, id ASC`,
        [tenantId, p.barcode || null, p.name, p.category, p.section || null]
      );
      if (existing.length > 0) {
        const duplicateIds = existing.slice(1).map(row => row.id);
        if (duplicateIds.length > 0) {
          await conn.query(
            `DELETE FROM products WHERE tenant_id = ? AND id IN (${duplicateIds.map(() => "?").join(", ")})`,
            [tenantId, ...duplicateIds]
          );
        }
        continue;
      }

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

// ─────────────────────────────────────────────────────────────────────────
// Inventory Expansion (Bulk Items, Recipes, Modifiers)
// ─────────────────────────────────────────────────────────────────────────

export async function getBulkItems(tenantId: string): Promise<BulkItem[]> {
  const rows = await query(
    `SELECT
       id,
       name,
       item_type AS itemType,
       unit,
       stock,
       min_stock AS minStock,
       cost_per_unit AS costPerUnit,
       barcode,
       pack_name AS packName,
       pack_quantity AS packQuantity,
       single_unit_name AS singleUnitName,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM bulk_items WHERE tenant_id = ?`,
    [tenantId]
  );
  return rows as BulkItem[];
}

export async function createBulkItem(tenantId: string, item: Partial<BulkItem>): Promise<BulkItem> {
  const id = `bulk_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const itemType = item.itemType === 'bulk' ? 'bulk' : 'single';
  await query(
    `INSERT INTO bulk_items (
       id, tenant_id, name, item_type, unit, stock, min_stock, cost_per_unit,
       barcode, pack_name, pack_quantity, single_unit_name, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      item.name,
      itemType,
      item.unit || 'items',
      item.stock || 0,
      item.minStock || 0,
      item.costPerUnit || 0,
      item.barcode || null,
      itemType === 'bulk' ? (item.packName || 'Case') : null,
      itemType === 'bulk' ? (item.packQuantity || 1) : 1,
      item.singleUnitName || 'item'
    ]
  );
  return { id, itemType, ...item } as BulkItem;
}

export async function updateBulkItem(tenantId: string, id: string, updates: Partial<BulkItem>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
  if (updates.itemType !== undefined) { fields.push("item_type = ?"); values.push(updates.itemType === 'bulk' ? 'bulk' : 'single'); }
  if (updates.unit !== undefined) { fields.push("unit = ?"); values.push(updates.unit); }
  if (updates.stock !== undefined) { fields.push("stock = ?"); values.push(updates.stock); }
  if (updates.minStock !== undefined) { fields.push("min_stock = ?"); values.push(updates.minStock); }
  if (updates.costPerUnit !== undefined) { fields.push("cost_per_unit = ?"); values.push(updates.costPerUnit); }
  if (updates.barcode !== undefined) { fields.push("barcode = ?"); values.push(updates.barcode); }
  if (updates.packName !== undefined) { fields.push("pack_name = ?"); values.push(updates.packName || null); }
  if (updates.packQuantity !== undefined) { fields.push("pack_quantity = ?"); values.push(updates.packQuantity || 1); }
  if (updates.singleUnitName !== undefined) { fields.push("single_unit_name = ?"); values.push(updates.singleUnitName || 'item'); }
  if (fields.length === 0) return;
  fields.push("updated_at = NOW()");
  values.push(tenantId, id);
  await query(`UPDATE bulk_items SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`, values);
}

export async function deleteBulkItem(tenantId: string, id: string): Promise<void> {
  await query(`DELETE FROM bulk_items WHERE tenant_id = ? AND id = ?`, [tenantId, id]);
}

export async function updateProductRecipe(productId: string, recipe: RecipeItem[]): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM product_recipes WHERE product_id = ?`, [productId]);
    for (const r of recipe) {
      await conn.query(
        `INSERT INTO product_recipes (product_id, bulk_item_id, quantity) VALUES (?, ?, ?)`,
        [productId, r.bulkItemId, r.quantity]
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

export async function getProductRecipe(productId: string): Promise<RecipeItem[]> {
  const rows = await query(
    `SELECT r.bulk_item_id AS bulkItemId, r.quantity, b.name AS bulkItemName, b.unit
     FROM product_recipes r
     JOIN bulk_items b ON r.bulk_item_id = b.id
     WHERE r.product_id = ?`,
    [productId]
  );
  return rows as RecipeItem[];
}

export async function createModifierGroup(productId: string, group: Partial<ModifierGroup>): Promise<string> {
  const id = `mod_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO product_modifiers (id, product_id, name, type, required, min_selection, max_selection, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, productId, group.name, group.type || 'single', group.required ? 1 : 0, group.minSelection || 0, group.maxSelection || 1]
  );
  return id;
}

export async function deleteModifierGroup(modifierId: string): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM modifier_options WHERE modifier_id = ?`, [modifierId]);
    await conn.query(`DELETE FROM product_modifiers WHERE id = ?`, [modifierId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function updateModifierOptions(modifierId: string, options: Partial<ModifierOption>[]): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM modifier_options WHERE modifier_id = ?`, [modifierId]);
    for (const opt of options) {
      const id = `opt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await conn.query(
        `INSERT INTO modifier_options (id, modifier_id, name, price_extra, bulk_item_id, bulk_quantity, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [id, modifierId, opt.name, opt.priceExtra || 0, opt.bulkItemId || null, opt.bulkQuantity || 0]
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

export async function getProductModifiers(productId: string): Promise<ModifierGroup[]> {
  const groups = await query(
    `SELECT id, product_id AS productId, name, type, required, min_selection AS minSelection, max_selection AS maxSelection
     FROM product_modifiers WHERE product_id = ?`,
    [productId]
  );
  
  for (const g of groups as ModifierGroup[]) {
    const options = await query(
      `SELECT id, modifier_id AS modifierId, name, price_extra AS priceExtra, bulk_item_id AS bulkItemId, bulk_quantity AS bulkQuantity
       FROM modifier_options WHERE modifier_id = ?`,
      [g.id]
    );
    g.options = options as ModifierOption[];
  }
  return groups as ModifierGroup[];
}
