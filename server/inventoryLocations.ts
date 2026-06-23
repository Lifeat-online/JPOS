import { getConnection, query, type DbConnection } from "./db.js";
import { recordAuditEvent, recordStockMovement } from "./audit.js";

export const DEFAULT_INVENTORY_LOCATION_ID = "main";
export const DEFAULT_INVENTORY_LOCATION_NAME = "Primary stock pool";

type Queryable = Pick<DbConnection, "query">;
type InventoryLocationType = "branch" | "warehouse" | "register" | "kitchen" | "other";
type InventoryLocationStatus = "active" | "inactive";
type StockTransferStatus = "draft" | "requested" | "approved" | "in_transit" | "completed" | "cancelled";

export type InventoryActor = {
  staffId?: string | null;
  staffName?: string | null;
};

export type InventoryLocationInput = {
  id?: string | null;
  name?: string | null;
  type?: string | null;
  status?: string | null;
  isDefault?: boolean | number | null;
  address?: string | null;
  notes?: string | null;
};

export type ProductLocationStockInput = InventoryActor & {
  productId: string;
  locationId?: string | null;
  quantity?: number | string | null;
  minStock?: number | string | null;
  reorderThreshold?: number | string | null;
  note?: string | null;
};

export type StockTransferInput = InventoryActor & {
  fromLocationId?: string | null;
  toLocationId?: string | null;
  status?: StockTransferStatus | string | null;
  notes?: string | null;
  items?: Array<{
    productId?: string | null;
    productName?: string | null;
    quantity?: number | string | null;
  }>;
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clean(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : fallback;
}

function normalizeType(value: unknown): InventoryLocationType {
  const text = clean(value).toLowerCase();
  if (["branch", "warehouse", "register", "kitchen", "other"].includes(text)) return text as InventoryLocationType;
  return "branch";
}

function normalizeStatus(value: unknown): InventoryLocationStatus {
  return clean(value).toLowerCase() === "inactive" ? "inactive" : "active";
}

function normalizeTransferStatus(value: unknown): StockTransferStatus {
  const text = clean(value).toLowerCase();
  if (["draft", "requested", "approved", "in_transit", "completed", "cancelled"].includes(text)) {
    return text as StockTransferStatus;
  }
  return "requested";
}

function normalizeAssignedLocations(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean);
  const text = clean(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map((item) => clean(item)).filter(Boolean) : [];
  } catch {
    return text.split(",").map((item) => clean(item)).filter(Boolean);
  }
}

function serializeLocation(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    name: row.name,
    type: normalizeType(row.type),
    status: normalizeStatus(row.status),
    isDefault: Boolean(Number(row.isDefault ?? row.is_default ?? 0)),
    address: row.address || null,
    notes: row.notes || null,
    productCount: toNumber(row.productCount ?? row.product_count),
    totalQuantity: toNumber(row.totalQuantity ?? row.total_quantity),
    lowStockCount: toNumber(row.lowStockCount ?? row.low_stock_count),
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

function serializeLocationStock(row: any) {
  const quantity = toNumber(row.quantity);
  const minStock = toNumber(row.minStock ?? row.min_stock);
  const reorderThreshold = toNumber(row.reorderThreshold ?? row.reorder_threshold, minStock);
  return {
    productId: row.productId ?? row.product_id,
    productName: row.productName ?? row.product_name ?? row.name,
    category: row.category || "",
    section: row.section || "",
    locationId: row.locationId ?? row.location_id,
    locationName: row.locationName ?? row.location_name,
    locationType: row.locationType ?? row.location_type,
    quantity,
    minStock,
    reorderThreshold,
    isLowStock: quantity <= Math.max(1, reorderThreshold || minStock),
    updatedBy: row.updatedBy ?? row.updated_by ?? null,
    updatedByName: row.updatedByName ?? row.updated_by_name ?? null,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

function serializeTransfer(row: any, items: any[] = []) {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    fromLocationId: row.fromLocationId ?? row.from_location_id,
    fromLocationName: row.fromLocationName ?? row.from_location_name ?? null,
    toLocationId: row.toLocationId ?? row.to_location_id,
    toLocationName: row.toLocationName ?? row.to_location_name ?? null,
    status: normalizeTransferStatus(row.status),
    requestedBy: row.requestedBy ?? row.requested_by ?? null,
    requestedByName: row.requestedByName ?? row.requested_by_name ?? null,
    approvedBy: row.approvedBy ?? row.approved_by ?? null,
    approvedByName: row.approvedByName ?? row.approved_by_name ?? null,
    completedBy: row.completedBy ?? row.completed_by ?? null,
    completedByName: row.completedByName ?? row.completed_by_name ?? null,
    notes: row.notes || null,
    completedAt: row.completedAt ?? row.completed_at ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
    items: items.map((item) => ({
      id: item.id,
      transferId: item.transferId ?? item.transfer_id,
      productId: item.productId ?? item.product_id,
      productName: item.productName ?? item.product_name,
      quantity: toNumber(item.quantity),
      fromPreviousQuantity: toNumber(item.fromPreviousQuantity ?? item.from_previous_quantity),
      fromNewQuantity: toNumber(item.fromNewQuantity ?? item.from_new_quantity),
      toPreviousQuantity: toNumber(item.toPreviousQuantity ?? item.to_previous_quantity),
      toNewQuantity: toNumber(item.toNewQuantity ?? item.to_new_quantity),
    })),
  };
}

async function run(runner: Queryable | null | undefined, sql: string, params: any[] = []) {
  return runner ? runner.query(sql, params) : query(sql, params);
}

export async function ensureDefaultInventoryLocation(tenantId: string, runner?: Queryable) {
  if (!tenantId) throw new Error("Tenant is required");
  await run(
    runner,
    `INSERT INTO inventory_locations (id, tenant_id, name, type, status, is_default, created_at, updated_at)
     VALUES (?, ?, ?, 'branch', 'active', 1, NOW(), NOW())
     ON CONFLICT (tenant_id, id) DO NOTHING`,
    [DEFAULT_INVENTORY_LOCATION_ID, tenantId, DEFAULT_INVENTORY_LOCATION_NAME]
  );

  await run(
    runner,
    `INSERT INTO product_location_stock (
       tenant_id, product_id, location_id, quantity, min_stock, reorder_threshold, created_at, updated_at
     )
     SELECT tenant_id, id, ?, COALESCE(stock, 0), COALESCE(min_stock, 0), COALESCE(min_stock, 0), NOW(), NOW()
       FROM products
      WHERE tenant_id = ?
     ON CONFLICT (tenant_id, product_id, location_id) DO NOTHING`,
    [DEFAULT_INVENTORY_LOCATION_ID, tenantId]
  );
}

export async function listInventoryLocations(tenantId: string) {
  await ensureDefaultInventoryLocation(tenantId);
  const rows = await query<any>(
    `SELECT l.id,
            l.tenant_id AS tenantId,
            l.name,
            l.type,
            l.status,
            l.is_default AS isDefault,
            l.address,
            l.notes,
            COUNT(pls.product_id) AS productCount,
            COALESCE(SUM(pls.quantity), 0) AS totalQuantity,
            SUM(CASE WHEN pls.quantity <= GREATEST(1, COALESCE(NULLIF(pls.reorder_threshold, 0), pls.min_stock, 0)) THEN 1 ELSE 0 END) AS lowStockCount,
            l.created_at AS createdAt,
            l.updated_at AS updatedAt
       FROM inventory_locations l
       LEFT JOIN product_location_stock pls
         ON pls.tenant_id = l.tenant_id
        AND pls.location_id = l.id
      WHERE l.tenant_id = ?
      GROUP BY l.id, l.tenant_id, l.name, l.type, l.status, l.is_default, l.address, l.notes, l.created_at, l.updated_at
      ORDER BY l.is_default DESC, l.name ASC`,
    [tenantId]
  );
  return rows.map(serializeLocation);
}

export async function createInventoryLocation(tenantId: string, input: InventoryLocationInput, actor: InventoryActor = {}) {
  const name = clean(input.name);
  if (!name) throw new Error("Location name is required");
  const id = clean(input.id) || makeId("loc");
  const type = normalizeType(input.type);
  const status = normalizeStatus(input.status);
  const isDefault = input.isDefault ? 1 : 0;

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    if (isDefault) {
      await conn.query(`UPDATE inventory_locations SET is_default = 0, updated_at = NOW() WHERE tenant_id = ?`, [tenantId]);
    }
    await conn.query(
      `INSERT INTO inventory_locations (
         id, tenant_id, name, type, status, is_default, address, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [id, tenantId, name, type, status, isDefault, clean(input.address) || null, clean(input.notes) || null]
    );
    await recordAuditEvent(conn, {
      tenantId,
      action: "inventory_location.created",
      entityType: "inventory_location",
      entityId: id,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      source: "inventory",
      details: { name, type, status, isDefault: Boolean(isDefault) },
    });
    await conn.commit();
    return (await listInventoryLocations(tenantId)).find((location) => location.id === id);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateInventoryLocation(tenantId: string, id: string, input: InventoryLocationInput, actor: InventoryActor = {}) {
  const fields: string[] = [];
  const values: any[] = [];
  if (input.name !== undefined) { fields.push("name = ?"); values.push(clean(input.name)); }
  if (input.type !== undefined) { fields.push("type = ?"); values.push(normalizeType(input.type)); }
  if (input.status !== undefined) { fields.push("status = ?"); values.push(normalizeStatus(input.status)); }
  if (input.address !== undefined) { fields.push("address = ?"); values.push(clean(input.address) || null); }
  if (input.notes !== undefined) { fields.push("notes = ?"); values.push(clean(input.notes) || null); }
  if (input.isDefault !== undefined) { fields.push("is_default = ?"); values.push(input.isDefault ? 1 : 0); }
  if (!fields.length) return (await listInventoryLocations(tenantId)).find((location) => location.id === id) || null;

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    if (input.isDefault) {
      await conn.query(`UPDATE inventory_locations SET is_default = 0, updated_at = NOW() WHERE tenant_id = ?`, [tenantId]);
    }
    fields.push("updated_at = NOW()");
    values.push(tenantId, id);
    await conn.query(`UPDATE inventory_locations SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`, values);
    await recordAuditEvent(conn, {
      tenantId,
      action: "inventory_location.updated",
      entityType: "inventory_location",
      entityId: id,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      source: "inventory",
      details: input,
    });
    await conn.commit();
    return (await listInventoryLocations(tenantId)).find((location) => location.id === id) || null;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function listProductLocationStocks(tenantId: string, filters: { productId?: string | null; locationId?: string | null } = {}) {
  await ensureDefaultInventoryLocation(tenantId);
  const where = ["p.tenant_id = ?"];
  const params: any[] = [tenantId];
  if (filters.productId) {
    where.push("p.id = ?");
    params.push(filters.productId);
  }
  if (filters.locationId) {
    where.push("l.id = ?");
    params.push(filters.locationId);
  }
  const rows = await query<any>(
    `SELECT p.id AS productId,
            p.name AS productName,
            p.category,
            p.section,
            l.id AS locationId,
            l.name AS locationName,
            l.type AS locationType,
            COALESCE(pls.quantity, 0) AS quantity,
            COALESCE(pls.min_stock, p.min_stock, 0) AS minStock,
            COALESCE(NULLIF(pls.reorder_threshold, 0), pls.min_stock, p.min_stock, 0) AS reorderThreshold,
            pls.updated_by AS updatedBy,
            pls.updated_by_name AS updatedByName,
            pls.updated_at AS updatedAt
       FROM products p
       CROSS JOIN inventory_locations l
       LEFT JOIN product_location_stock pls
         ON pls.tenant_id = p.tenant_id
        AND pls.product_id = p.id
        AND pls.location_id = l.id
      WHERE ${where.join(" AND ")}
        AND l.tenant_id = p.tenant_id
      ORDER BY p.name ASC, l.is_default DESC, l.name ASC`,
    params
  );
  return rows.map(serializeLocationStock);
}

async function syncProductAggregateStock(conn: Queryable, tenantId: string, productId: string) {
  const [rows] = await conn.query<any>(
    `SELECT COALESCE(SUM(quantity), 0) AS aggregateStock
       FROM product_location_stock
      WHERE tenant_id = ? AND product_id = ?`,
    [tenantId, productId]
  );
  const aggregateStock = toNumber((rows as any[])[0]?.aggregateStock ?? (rows as any[])[0]?.aggregate_stock);
  await conn.query(
    `UPDATE products SET stock = ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
    [aggregateStock, tenantId, productId]
  );
  return aggregateStock;
}

export async function upsertProductLocationStock(tenantId: string, input: ProductLocationStockInput) {
  const productId = clean(input.productId);
  const locationId = clean(input.locationId, DEFAULT_INVENTORY_LOCATION_ID);
  if (!productId) throw new Error("Product is required");
  const conn = await getConnection();

  try {
    await conn.beginTransaction();
    await ensureDefaultInventoryLocation(tenantId, conn);

    const [productRows] = await conn.query<any>(
      `SELECT id, name, stock, min_stock AS minStock FROM products WHERE tenant_id = ? AND id = ? LIMIT 1 FOR UPDATE`,
      [tenantId, productId]
    );
    const product = (productRows as any[])[0];
    if (!product) throw new Error("Product not found");

    const [locationRows] = await conn.query<any>(
      `SELECT id, name FROM inventory_locations WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantId, locationId]
    );
    const location = (locationRows as any[])[0];
    if (!location) throw new Error("Inventory location not found");

    const [existingRows] = await conn.query<any>(
      `SELECT quantity, min_stock AS minStock, reorder_threshold AS reorderThreshold
         FROM product_location_stock
        WHERE tenant_id = ? AND product_id = ? AND location_id = ?
        LIMIT 1
        FOR UPDATE`,
      [tenantId, productId, locationId]
    );
    const existing = (existingRows as any[])[0];
    const previousQuantity = toNumber(existing?.quantity);
    const quantity = Math.max(0, toNumber(input.quantity, previousQuantity));
    const minStock = Math.max(0, toNumber(input.minStock, toNumber(existing?.minStock ?? existing?.min_stock ?? product.minStock ?? product.min_stock)));
    const reorderThreshold = Math.max(0, toNumber(input.reorderThreshold, toNumber(existing?.reorderThreshold ?? existing?.reorder_threshold ?? minStock)));

    if (existing) {
      await conn.query(
        `UPDATE product_location_stock
            SET quantity = ?,
                min_stock = ?,
                reorder_threshold = ?,
                updated_by = ?,
                updated_by_name = ?,
                updated_at = NOW()
          WHERE tenant_id = ? AND product_id = ? AND location_id = ?`,
        [
          quantity,
          minStock,
          reorderThreshold,
          input.staffId || null,
          input.staffName || null,
          tenantId,
          productId,
          locationId,
        ]
      );
    } else {
      await conn.query(
        `INSERT INTO product_location_stock (
           tenant_id, product_id, location_id, quantity, min_stock, reorder_threshold,
           updated_by, updated_by_name, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [tenantId, productId, locationId, quantity, minStock, reorderThreshold, input.staffId || null, input.staffName || null]
      );
    }

    const aggregateStock = await syncProductAggregateStock(conn, tenantId, productId);
    const quantityDelta = Number((quantity - previousQuantity).toFixed(3));
    if (quantityDelta !== 0) {
      await recordStockMovement(conn, {
        tenantId,
        itemType: "product",
        productId,
        itemName: product.name,
        quantityDelta,
        previousQuantity,
        newQuantity: quantity,
        reason: "location_stock_adjustment",
        reasonCode: "adjustment",
        referenceType: "product_location_stock",
        referenceId: `${productId}:${locationId}`,
        staffId: input.staffId || null,
        staffName: input.staffName || null,
        note: input.note || `Location stock updated at ${location.name}`,
        locationId,
      });
    }
    await recordAuditEvent(conn, {
      tenantId,
      action: "inventory_location_stock.updated",
      entityType: "product_location_stock",
      entityId: `${productId}:${locationId}`,
      staffId: input.staffId || null,
      staffName: input.staffName || null,
      source: "inventory",
      details: { productId, locationId, quantity, minStock, reorderThreshold, aggregateStock },
    });
    await conn.commit();
    const [row] = await listProductLocationStocks(tenantId, { productId, locationId });
    return row;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

function cleanTransferItems(items: StockTransferInput["items"]) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      productId: clean(item?.productId),
      productName: clean(item?.productName),
      quantity: Math.max(0, toNumber(item?.quantity)),
    }))
    .filter((item) => item.productId && item.quantity > 0);
}

export async function createStockTransferOrder(tenantId: string, input: StockTransferInput) {
  const fromLocationId = clean(input.fromLocationId);
  const toLocationId = clean(input.toLocationId);
  if (!fromLocationId || !toLocationId) throw new Error("Choose source and destination locations");
  if (fromLocationId === toLocationId) throw new Error("Source and destination locations must be different");
  const items = cleanTransferItems(input.items);
  if (!items.length) throw new Error("Choose at least one product to transfer");

  const id = makeId("transfer");
  const status = normalizeTransferStatus(input.status);
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await ensureDefaultInventoryLocation(tenantId, conn);
    await conn.query(
      `INSERT INTO stock_transfer_orders (
         id, tenant_id, from_location_id, to_location_id, status,
         requested_by, requested_by_name, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        tenantId,
        fromLocationId,
        toLocationId,
        status,
        input.staffId || null,
        input.staffName || null,
        clean(input.notes) || null,
      ]
    );

    for (const item of items) {
      const [productRows] = await conn.query<any>(
        `SELECT id, name FROM products WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, item.productId]
      );
      const product = (productRows as any[])[0];
      if (!product) throw new Error(`Product ${item.productId} was not found`);
      await conn.query(
        `INSERT INTO stock_transfer_items (
           id, tenant_id, transfer_id, product_id, product_name, quantity, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [makeId("transfer_item"), tenantId, id, item.productId, item.productName || product.name, item.quantity]
      );
    }

    await recordAuditEvent(conn, {
      tenantId,
      action: "stock_transfer.created",
      entityType: "stock_transfer",
      entityId: id,
      staffId: input.staffId || null,
      staffName: input.staffName || null,
      source: "inventory",
      details: { fromLocationId, toLocationId, status, itemCount: items.length },
    });
    await conn.commit();
    return getStockTransferOrder(tenantId, id);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function getLocationQuantity(conn: Queryable, tenantId: string, productId: string, locationId: string, fallbackProductMinStock = 0) {
  const [rows] = await conn.query<any>(
    `SELECT quantity, min_stock AS minStock, reorder_threshold AS reorderThreshold
       FROM product_location_stock
      WHERE tenant_id = ? AND product_id = ? AND location_id = ?
      LIMIT 1
      FOR UPDATE`,
    [tenantId, productId, locationId]
  );
  const row = (rows as any[])[0];
  return {
    exists: Boolean(row),
    quantity: toNumber(row?.quantity),
    minStock: toNumber(row?.minStock ?? row?.min_stock, fallbackProductMinStock),
    reorderThreshold: toNumber(row?.reorderThreshold ?? row?.reorder_threshold, fallbackProductMinStock),
  };
}

export async function completeStockTransferOrder(tenantId: string, id: string, actor: InventoryActor = {}) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [orderRows] = await conn.query<any>(
      `SELECT * FROM stock_transfer_orders WHERE tenant_id = ? AND id = ? LIMIT 1 FOR UPDATE`,
      [tenantId, id]
    );
    const order = (orderRows as any[])[0];
    if (!order) throw new Error("Stock transfer was not found");
    if (order.status === "completed") throw new Error("Stock transfer is already completed");
    if (order.status === "cancelled") throw new Error("Cancelled stock transfers cannot be completed");

    const [itemRows] = await conn.query<any>(
      `SELECT * FROM stock_transfer_items WHERE tenant_id = ? AND transfer_id = ? ORDER BY created_at ASC`,
      [tenantId, id]
    );
    const items = itemRows as any[];
    if (!items.length) throw new Error("Stock transfer has no items");

    for (const item of items) {
      const productId = String(item.product_id || item.productId);
      const quantity = Math.max(0, toNumber(item.quantity));
      const [productRows] = await conn.query<any>(
        `SELECT id, name, min_stock AS minStock FROM products WHERE tenant_id = ? AND id = ? LIMIT 1 FOR UPDATE`,
        [tenantId, productId]
      );
      const product = (productRows as any[])[0];
      if (!product) throw new Error(`Product ${productId} was not found`);

      const from = await getLocationQuantity(conn, tenantId, productId, order.from_location_id, toNumber(product.minStock ?? product.min_stock));
      if (from.quantity < quantity) {
        throw new Error(`${product.name} has only ${from.quantity} available at ${order.from_location_id}`);
      }
      const to = await getLocationQuantity(conn, tenantId, productId, order.to_location_id, toNumber(product.minStock ?? product.min_stock));
      const fromNew = Number((from.quantity - quantity).toFixed(3));
      const toNew = Number((to.quantity + quantity).toFixed(3));

      await conn.query(
        `UPDATE product_location_stock
            SET quantity = ?, updated_by = ?, updated_by_name = ?, updated_at = NOW()
          WHERE tenant_id = ? AND product_id = ? AND location_id = ?`,
        [fromNew, actor.staffId || null, actor.staffName || null, tenantId, productId, order.from_location_id]
      );
      if (to.exists) {
        await conn.query(
          `UPDATE product_location_stock
              SET quantity = ?, updated_by = ?, updated_by_name = ?, updated_at = NOW()
            WHERE tenant_id = ? AND product_id = ? AND location_id = ?`,
          [toNew, actor.staffId || null, actor.staffName || null, tenantId, productId, order.to_location_id]
        );
      } else {
        await conn.query(
          `INSERT INTO product_location_stock (
             tenant_id, product_id, location_id, quantity, min_stock, reorder_threshold,
             updated_by, updated_by_name, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [tenantId, productId, order.to_location_id, toNew, to.minStock, to.reorderThreshold, actor.staffId || null, actor.staffName || null]
        );
      }

      await conn.query(
        `UPDATE stock_transfer_items
            SET from_previous_quantity = ?,
                from_new_quantity = ?,
                to_previous_quantity = ?,
                to_new_quantity = ?,
                updated_at = NOW()
          WHERE tenant_id = ? AND id = ?`,
        [from.quantity, fromNew, to.quantity, toNew, tenantId, item.id]
      );
      await syncProductAggregateStock(conn, tenantId, productId);
      await recordStockMovement(conn, {
        tenantId,
        itemType: "product",
        productId,
        itemName: item.product_name || product.name,
        quantityDelta: -quantity,
        previousQuantity: from.quantity,
        newQuantity: fromNew,
        reason: "stock_transfer",
        reasonCode: "transfer",
        referenceType: "stock_transfer",
        referenceId: id,
        staffId: actor.staffId || null,
        staffName: actor.staffName || null,
        note: `Transfer to ${order.to_location_id}`,
        locationId: order.from_location_id,
        fromLocationId: order.from_location_id,
        toLocationId: order.to_location_id,
      });
      await recordStockMovement(conn, {
        tenantId,
        itemType: "product",
        productId,
        itemName: item.product_name || product.name,
        quantityDelta: quantity,
        previousQuantity: to.quantity,
        newQuantity: toNew,
        reason: "stock_transfer",
        reasonCode: "transfer",
        referenceType: "stock_transfer",
        referenceId: id,
        staffId: actor.staffId || null,
        staffName: actor.staffName || null,
        note: `Transfer from ${order.from_location_id}`,
        locationId: order.to_location_id,
        fromLocationId: order.from_location_id,
        toLocationId: order.to_location_id,
      });
    }

    await conn.query(
      `UPDATE stock_transfer_orders
          SET status = 'completed',
              completed_by = ?,
              completed_by_name = ?,
              completed_at = NOW(),
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [actor.staffId || null, actor.staffName || null, tenantId, id]
    );
    await recordAuditEvent(conn, {
      tenantId,
      action: "stock_transfer.completed",
      entityType: "stock_transfer",
      entityId: id,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      source: "inventory",
      details: {
        fromLocationId: order.from_location_id,
        toLocationId: order.to_location_id,
        itemCount: items.length,
      },
    });
    await conn.commit();
    return getStockTransferOrder(tenantId, id);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function listStockTransferOrders(tenantId: string, filters: { status?: string | null; limit?: number | string | null } = {}) {
  const params: any[] = [tenantId];
  const where = ["sto.tenant_id = ?"];
  if (filters.status) {
    where.push("sto.status = ?");
    params.push(normalizeTransferStatus(filters.status));
  }
  const limit = Math.min(Math.max(Math.floor(toNumber(filters.limit, 100)), 1), 500);
  params.push(limit);
  const rows = await query<any>(
    `SELECT sto.*,
            from_location.name AS fromLocationName,
            to_location.name AS toLocationName
       FROM stock_transfer_orders sto
       LEFT JOIN inventory_locations from_location
         ON from_location.tenant_id = sto.tenant_id
        AND from_location.id = sto.from_location_id
       LEFT JOIN inventory_locations to_location
         ON to_location.tenant_id = sto.tenant_id
        AND to_location.id = sto.to_location_id
      WHERE ${where.join(" AND ")}
      ORDER BY sto.updated_at DESC
      LIMIT ?`,
    params
  );
  if (!rows.length) return [];
  const ids = rows.map((row: any) => row.id);
  const itemRows = await query<any>(
    `SELECT *
       FROM stock_transfer_items
      WHERE tenant_id = ?
        AND transfer_id IN (${ids.map(() => "?").join(", ")})
      ORDER BY created_at ASC`,
    [tenantId, ...ids]
  );
  const itemsByTransfer = new Map<string, any[]>();
  for (const item of itemRows) {
    const key = String(item.transfer_id || item.transferId);
    itemsByTransfer.set(key, [...(itemsByTransfer.get(key) || []), item]);
  }
  return rows.map((row: any) => serializeTransfer(row, itemsByTransfer.get(row.id) || []));
}

export async function getStockTransferOrder(tenantId: string, id: string) {
  const transfers = await listStockTransferOrders(tenantId, { limit: 500 });
  return transfers.find((transfer) => transfer.id === id) || null;
}

export async function getStaffInventoryLocationAccess(tenantId: string, staffId?: string | null) {
  await ensureDefaultInventoryLocation(tenantId);
  if (!staffId) {
    return { defaultLocationId: DEFAULT_INVENTORY_LOCATION_ID, assignedLocationIds: [] };
  }
  const rows = await query<any>(
    `SELECT default_location_id AS defaultLocationId,
            assigned_location_ids AS assignedLocationIds,
            role
       FROM staff
      WHERE tenant_id = ? AND id = ?
      LIMIT 1`,
    [tenantId, staffId]
  );
  const staff = rows[0];
  if (!staff) return { defaultLocationId: DEFAULT_INVENTORY_LOCATION_ID, assignedLocationIds: [] };
  const assignedLocationIds = normalizeAssignedLocations(staff.assignedLocationIds ?? staff.assigned_location_ids);
  return {
    defaultLocationId: clean(staff.defaultLocationId ?? staff.default_location_id, assignedLocationIds[0] || DEFAULT_INVENTORY_LOCATION_ID),
    assignedLocationIds,
    role: staff.role || null,
  };
}

export function cashierCanAccessLocation(role: string | null | undefined, access: { assignedLocationIds?: string[] }, locationId?: string | null) {
  const normalizedRole = clean(role).toLowerCase();
  if (["admin", "manager", "dev"].includes(normalizedRole)) return true;
  const assigned = access.assignedLocationIds || [];
  if (!assigned.length) return true;
  return assigned.includes(clean(locationId, DEFAULT_INVENTORY_LOCATION_ID));
}
