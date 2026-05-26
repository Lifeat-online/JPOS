import type { DbConnection } from "./db.js";

type Queryable = Pick<DbConnection, "query">;

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function json(value: unknown, fallback: unknown = {}) {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export type AuditEventInput = {
  tenantId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  relatedSaleId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  customerId?: string | null;
  source?: string | null;
  details?: unknown;
};

export async function recordAuditEvent(conn: Queryable, input: AuditEventInput) {
  const id = makeId("audit");
  await conn.query(
    `INSERT INTO audit_events (
      id, tenant_id, action, entity_type, entity_id, related_sale_id,
      staff_id, staff_name, customer_id, source, details, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      id,
      input.tenantId,
      input.action,
      input.entityType,
      input.entityId || null,
      input.relatedSaleId || null,
      input.staffId || null,
      input.staffName || null,
      input.customerId || null,
      input.source || "server",
      json(input.details),
    ]
  );
  return id;
}

export type StockMovementInput = {
  tenantId: string;
  itemType: "product" | "bulk";
  productId?: string | null;
  bulkItemId?: string | null;
  itemName?: string | null;
  quantityDelta: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  referenceType?: string | null;
  referenceId?: string | null;
  saleId?: string | null;
  saleItemId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  note?: string | null;
};

export async function recordStockMovement(conn: Queryable, input: StockMovementInput) {
  const id = makeId("stock");
  await conn.query(
    `INSERT INTO stock_movements (
      id, tenant_id, item_type, product_id, bulk_item_id, item_name,
      quantity_delta, previous_quantity, new_quantity, reason,
      reference_type, reference_id, sale_id, sale_item_id,
      staff_id, staff_name, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      id,
      input.tenantId,
      input.itemType,
      input.productId || null,
      input.bulkItemId || null,
      input.itemName || null,
      input.quantityDelta,
      input.previousQuantity,
      input.newQuantity,
      input.reason,
      input.referenceType || null,
      input.referenceId || null,
      input.saleId || null,
      input.saleItemId || null,
      input.staffId || null,
      input.staffName || null,
      input.note || null,
    ]
  );
  return id;
}

export async function applyProductStockDelta(
  conn: Queryable,
  input: Omit<StockMovementInput, "itemType" | "previousQuantity" | "newQuantity"> & {
    productId: string;
  }
) {
  const [rows] = await conn.query<any>(
    `SELECT id, name, stock
       FROM products
      WHERE tenant_id = ? AND id = ?
      LIMIT 1
      FOR UPDATE`,
    [input.tenantId, input.productId]
  );
  const product = (rows as any[])[0];
  if (!product) return null;

  const previousQuantity = Number(product.stock || 0);
  const rawNewQuantity = previousQuantity + Number(input.quantityDelta || 0);
  const newQuantity = Math.max(0, Number(rawNewQuantity.toFixed(3)));
  const appliedDelta = Number((newQuantity - previousQuantity).toFixed(3));

  await conn.query(
    `UPDATE products SET stock = ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
    [newQuantity, input.tenantId, input.productId]
  );

  await recordStockMovement(conn, {
    ...input,
    itemType: "product",
    itemName: input.itemName || product.name || null,
    quantityDelta: appliedDelta,
    previousQuantity,
    newQuantity,
  });

  return { previousQuantity, newQuantity, quantityDelta: appliedDelta };
}
