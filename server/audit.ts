import { query, type DbConnection } from "./db.js";

type Queryable = Pick<DbConnection, "query">;

export const STOCK_MOVEMENT_REASON_CODES = [
  "receiving",
  "sale",
  "refund",
  "void",
  "adjustment",
  "count_correction",
  "transfer",
  "wastage",
  "shrinkage",
] as const;

export type StockMovementReasonCode = typeof STOCK_MOVEMENT_REASON_CODES[number];

const stockMovementReasonCodeSet = new Set<string>(STOCK_MOVEMENT_REASON_CODES);

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function json(value: unknown, fallback: unknown = {}) {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function normalizeStockMovementReasonCode(
  reason?: string | null,
  referenceType?: string | null
): StockMovementReasonCode {
  const raw = String(reason || "").trim().toLowerCase();
  const codeish = raw.replace(/[\s-]+/g, "_");
  if (stockMovementReasonCodeSet.has(codeish)) return codeish as StockMovementReasonCode;

  if (["sale_completed", "sale_deduction", "checkout"].includes(codeish)) return "sale";
  if (["refund_restock", "refund_reversal", "refund"].includes(codeish)) return "refund";
  if (["void_restock", "void_reversal", "void"].includes(codeish)) return "void";
  if (["manual_adjustment", "adjustment", "stock_adjustment"].includes(codeish)) return "adjustment";
  if (["stock_take", "stocktake", "cycle_count", "spot_check", "count_correction"].includes(codeish)) return "count_correction";
  if (["purchase_order", "invoice_receiving", "receiving", "received"].includes(codeish)) return "receiving";
  if (["stock_transfer", "transfer"].includes(codeish)) return "transfer";
  if (["waste", "wastage", "expired", "expiry", "spoiled", "spoilage", "damage", "damaged"].includes(codeish)) return "wastage";
  if (["shrink", "shrinkage", "theft", "loss", "lost", "missing"].includes(codeish)) return "shrinkage";

  const reference = String(referenceType || "").trim().toLowerCase();
  if (reference === "sale") return "sale";
  if (reference === "refund") return "refund";
  if (reference === "void") return "void";
  if (reference === "stock_take_session" || reference === "stock_take_item") return "count_correction";
  if (reference === "purchase_order" || reference === "receiving" || reference === "invoice") return "receiving";
  if (reference === "stock_transfer" || reference === "transfer") return "transfer";

  return "adjustment";
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
  requestId?: string | null;
  details?: unknown;
};

export async function recordAuditEvent(conn: Queryable, input: AuditEventInput) {
  const id = makeId("audit");
  await conn.query(
    `INSERT INTO audit_events (
      id, tenant_id, action, entity_type, entity_id, related_sale_id,
      staff_id, staff_name, customer_id, source, request_id, details, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
      input.requestId || null,
      json(input.details),
    ]
  );
  return id;
}

export async function recordAuditEventSafe(input: AuditEventInput) {
  if (!input.tenantId) return null;

  try {
    return await recordAuditEvent({ query } as any, input);
  } catch (error) {
    console.warn("Unable to record audit event:", error);
    return null;
  }
}

/**
 * Pulls the requestId (set by the requestId middleware in
 * server/securityHardening.ts) off the Express request, if any,
 * and returns it. Audit call sites can pass the result to
 * recordAuditEvent to correlate log entries with the original
 * inbound request — useful for cross-checking against the
 * requestId access-log entry.
 */
export function requestIdFromRequest(req: unknown): string | null {
  if (!req || typeof req !== 'object') return null;
  const r = req as { requestId?: unknown; headers?: Record<string, unknown> };
  const id = r.requestId
    ?? r.headers?.['x-request-id']
    ?? r.headers?.['X-Request-Id'];
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
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
  reasonCode?: StockMovementReasonCode | string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  saleId?: string | null;
  saleItemId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  note?: string | null;
  locationId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
};

export async function recordStockMovement(conn: Queryable, input: StockMovementInput) {
  const id = makeId("stock");
  const reasonCode = normalizeStockMovementReasonCode(input.reasonCode || input.reason, input.referenceType);
  await conn.query(
    `INSERT INTO stock_movements (
      id, tenant_id, item_type, product_id, bulk_item_id, item_name,
      quantity_delta, previous_quantity, new_quantity, reason, reason_code,
      reference_type, reference_id, sale_id, sale_item_id,
      staff_id, staff_name, note, location_id, from_location_id, to_location_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
      reasonCode,
      input.referenceType || null,
      input.referenceId || null,
      input.saleId || null,
      input.saleItemId || null,
      input.staffId || null,
      input.staffName || null,
      input.note || null,
      input.locationId || null,
      input.fromLocationId || null,
      input.toLocationId || null,
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
  const locationId = String(input.locationId || "main").trim() || "main";

  await conn.query(
    `UPDATE products SET stock = ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
    [newQuantity, input.tenantId, input.productId]
  );

  try {
    const [locationRows] = await conn.query<any>(
      `SELECT quantity
         FROM product_location_stock
        WHERE tenant_id = ? AND product_id = ? AND location_id = ?
        LIMIT 1
        FOR UPDATE`,
      [input.tenantId, input.productId, locationId]
    );
    const locationStock = (locationRows as any[])[0];
    const locationPreviousQuantity = locationStock
      ? Number(locationStock.quantity || 0)
      : previousQuantity;
    const locationNewQuantity = Math.max(0, Number((locationPreviousQuantity + appliedDelta).toFixed(3)));

    if (locationStock) {
      await conn.query(
        `UPDATE product_location_stock
            SET quantity = ?,
                updated_by = ?,
                updated_by_name = ?,
                updated_at = NOW()
          WHERE tenant_id = ? AND product_id = ? AND location_id = ?`,
        [
          locationNewQuantity,
          input.staffId || null,
          input.staffName || null,
          input.tenantId,
          input.productId,
          locationId,
        ]
      );
    } else {
      await conn.query(
        `INSERT INTO product_location_stock (
           tenant_id, product_id, location_id, quantity, min_stock, reorder_threshold,
           updated_by, updated_by_name, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 0, 0, ?, ?, NOW(), NOW())`,
        [
          input.tenantId,
          input.productId,
          locationId,
          locationNewQuantity,
          input.staffId || null,
          input.staffName || null,
        ]
      );
    }
  } catch (error: any) {
    const message = String(error?.message || "");
    if (!message.includes("product_location_stock")) throw error;
  }

  await recordStockMovement(conn, {
    ...input,
    itemType: "product",
    itemName: input.itemName || product.name || null,
    quantityDelta: appliedDelta,
    previousQuantity,
    newQuantity,
    locationId,
  });

  return { previousQuantity, newQuantity, quantityDelta: appliedDelta };
}
