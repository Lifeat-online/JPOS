import { query } from "./db.js";
import { recordAuditEventSafe } from "./audit.js";

export type DeliveryProvider = "uber_eats" | "mr_d";
export type DeliveryOrderStatus = "new" | "accepted" | "preparing" | "ready" | "dispatched" | "completed" | "cancelled";

type Actor = {
  staffId?: string | null;
  staffName?: string | null;
};

type DeliveryOrderInput = {
  provider?: string | null;
  externalOrderId?: string | null;
  status?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  subtotal?: number | string | null;
  deliveryFee?: number | string | null;
  tipAmount?: number | string | null;
  discountAmount?: number | string | null;
  total?: number | string | null;
  currency?: string | null;
  placedAt?: string | null;
  acceptedAt?: string | null;
  dueAt?: string | null;
  saleId?: string | null;
  items?: any[];
  rawPayload?: any;
};

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clean(value: unknown, max = 255) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : "";
}

function nullable(value: unknown, max = 255) {
  return clean(value, max) || null;
}

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number((Number.isFinite(parsed) ? parsed : 0).toFixed(2));
}

function quantity(value: unknown) {
  const parsed = Number(value || 0);
  return Math.max(0, Number((Number.isFinite(parsed) ? parsed : 1).toFixed(3)));
}

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function parseJson(value: unknown, fallback: any) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeDeliveryProvider(value: unknown): DeliveryProvider {
  const text = clean(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  if (text === "uber" || text === "uber_eats" || text === "ubereats") return "uber_eats";
  if (text === "mr_d" || text === "mrd" || text === "mr_d_food" || text === "mr_d_foods") return "mr_d";
  throw new Error("Unsupported delivery provider");
}

export function normalizeDeliveryStatus(value: unknown): DeliveryOrderStatus {
  const text = clean(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  if (!text || ["created", "received", "pending", "placed", "new"].includes(text)) return "new";
  if (["accepted", "confirmed"].includes(text)) return "accepted";
  if (["preparing", "in_progress", "cooking"].includes(text)) return "preparing";
  if (["ready", "ready_for_pickup", "ready_for_collection"].includes(text)) return "ready";
  if (["dispatched", "picked_up", "collected", "out_for_delivery"].includes(text)) return "dispatched";
  if (["completed", "delivered", "fulfilled"].includes(text)) return "completed";
  if (["cancelled", "canceled", "rejected"].includes(text)) return "cancelled";
  return "new";
}

function readPath(source: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => current?.[key], source);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function normalizeItems(input: DeliveryOrderInput, raw: any) {
  const rawItems = Array.isArray(input.items)
    ? input.items
    : Array.isArray(raw?.items)
      ? raw.items
      : Array.isArray(raw?.order_items)
        ? raw.order_items
        : Array.isArray(raw?.cart?.items)
          ? raw.cart.items
          : [];

  return rawItems.map((item: any, index: number) => {
    const productName = clean(item.productName ?? item.product_name ?? item.name ?? item.title ?? item.item_name, 255) || `Delivery item ${index + 1}`;
    return {
      id: id("doi"),
      externalItemId: nullable(item.externalItemId ?? item.external_item_id ?? item.id ?? item.uuid, 128),
      productId: nullable(item.productId ?? item.product_id ?? item.posProductId ?? item.sku, 64),
      productName,
      quantity: quantity(item.quantity ?? item.qty ?? item.count ?? 1),
      price: money(item.price ?? item.unit_price ?? item.unitPrice ?? item.total_price ?? item.total ?? 0),
      note: nullable(item.note ?? item.instructions ?? item.special_instructions, 1000),
      modifiers: Array.isArray(item.modifiers) ? item.modifiers : Array.isArray(item.options) ? item.options : [],
    };
  });
}

function normalizeOrderInput(input: DeliveryOrderInput) {
  const raw = input.rawPayload || input;
  const provider = normalizeDeliveryProvider(input.provider ?? raw.provider ?? raw.source);
  const externalOrderId = clean(
    input.externalOrderId
      ?? readPath(raw, ["externalOrderId", "external_order_id", "orderId", "order_id", "id", "uuid", "display_id"]),
    128
  );
  if (!externalOrderId) throw new Error("External delivery order ID is required");

  const items = normalizeItems(input, raw);
  const itemSubtotal = money(items.reduce((sum, item) => sum + item.quantity * item.price, 0));
  const subtotal = money(input.subtotal ?? readPath(raw, ["subtotal", "totals.subtotal", "cart.subtotal"]) ?? itemSubtotal);
  const deliveryFee = money(input.deliveryFee ?? readPath(raw, ["deliveryFee", "delivery_fee", "totals.delivery_fee"]));
  const tipAmount = money(input.tipAmount ?? readPath(raw, ["tipAmount", "tip_amount", "totals.tip"]));
  const discountAmount = money(input.discountAmount ?? readPath(raw, ["discountAmount", "discount_amount", "totals.discount"]));
  const total = money(input.total ?? readPath(raw, ["total", "total_amount", "totals.total"]) ?? subtotal + deliveryFee + tipAmount - discountAmount);

  return {
    provider,
    externalOrderId,
    status: normalizeDeliveryStatus(input.status ?? raw.status ?? raw.order_status),
    customerName: nullable(input.customerName ?? readPath(raw, ["customerName", "customer.name", "customer.full_name"]), 255),
    customerPhone: nullable(input.customerPhone ?? readPath(raw, ["customerPhone", "customer.phone", "customer.mobile"]), 64),
    deliveryAddress: nullable(input.deliveryAddress ?? readPath(raw, ["deliveryAddress", "delivery.address", "customer.address"]), 2000),
    subtotal,
    deliveryFee,
    tipAmount,
    discountAmount,
    total,
    currency: clean(input.currency ?? raw.currency, 8) || "ZAR",
    placedAt: dateOrNull(input.placedAt ?? readPath(raw, ["placedAt", "placed_at", "created_at", "createdAt"])),
    acceptedAt: dateOrNull(input.acceptedAt ?? readPath(raw, ["acceptedAt", "accepted_at"])),
    dueAt: dateOrNull(input.dueAt ?? readPath(raw, ["dueAt", "due_at", "ready_by", "promised_at"])),
    saleId: nullable(input.saleId ?? raw.saleId ?? raw.sale_id, 64),
    rawPayload: raw,
    items,
  };
}

function serializeOrder(row: any, items: any[] = []) {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    provider: row.provider,
    externalOrderId: row.externalOrderId ?? row.external_order_id,
    status: row.status,
    customerName: row.customerName ?? row.customer_name ?? null,
    customerPhone: row.customerPhone ?? row.customer_phone ?? null,
    deliveryAddress: row.deliveryAddress ?? row.delivery_address ?? null,
    subtotal: money(row.subtotal),
    deliveryFee: money(row.deliveryFee ?? row.delivery_fee),
    tipAmount: money(row.tipAmount ?? row.tip_amount),
    discountAmount: money(row.discountAmount ?? row.discount_amount),
    total: money(row.total),
    currency: row.currency || "ZAR",
    placedAt: row.placedAt ?? row.placed_at ?? null,
    acceptedAt: row.acceptedAt ?? row.accepted_at ?? null,
    dueAt: row.dueAt ?? row.due_at ?? null,
    saleId: row.saleId ?? row.sale_id ?? null,
    rawPayload: parseJson(row.rawPayload ?? row.raw_payload, {}),
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
    items: items.map(item => ({
      id: item.id,
      externalItemId: item.externalItemId ?? item.external_item_id ?? null,
      productId: item.productId ?? item.product_id ?? null,
      productName: item.productName ?? item.product_name,
      quantity: quantity(item.quantity),
      price: money(item.price),
      note: item.note || null,
      modifiers: parseJson(item.modifiers, []),
    })),
  };
}

export async function ingestDeliveryOrder(tenantId: string, input: DeliveryOrderInput, actor: Actor = {}) {
  const normalized = normalizeOrderInput(input);
  const existing = await query<any>(
    `SELECT id FROM delivery_orders
      WHERE tenant_id = ? AND provider = ? AND external_order_id = ?
      LIMIT 1`,
    [tenantId, normalized.provider, normalized.externalOrderId]
  );
  const orderId = existing[0]?.id || id("do");
  const rawPayload = JSON.stringify(normalized.rawPayload || {});

  if (existing.length > 0) {
    await query(
      `UPDATE delivery_orders
          SET status = ?,
              customer_name = ?,
              customer_phone = ?,
              delivery_address = ?,
              subtotal = ?,
              delivery_fee = ?,
              tip_amount = ?,
              discount_amount = ?,
              total = ?,
              currency = ?,
              placed_at = ?,
              accepted_at = ?,
              due_at = ?,
              sale_id = ?,
              raw_payload = ?,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [
        normalized.status,
        normalized.customerName,
        normalized.customerPhone,
        normalized.deliveryAddress,
        normalized.subtotal,
        normalized.deliveryFee,
        normalized.tipAmount,
        normalized.discountAmount,
        normalized.total,
        normalized.currency,
        normalized.placedAt,
        normalized.acceptedAt,
        normalized.dueAt,
        normalized.saleId,
        rawPayload,
        tenantId,
        orderId,
      ]
    );
  } else {
    await query(
      `INSERT INTO delivery_orders (
         id, tenant_id, provider, external_order_id, status, customer_name, customer_phone,
         delivery_address, subtotal, delivery_fee, tip_amount, discount_amount, total, currency,
         placed_at, accepted_at, due_at, sale_id, raw_payload, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        orderId,
        tenantId,
        normalized.provider,
        normalized.externalOrderId,
        normalized.status,
        normalized.customerName,
        normalized.customerPhone,
        normalized.deliveryAddress,
        normalized.subtotal,
        normalized.deliveryFee,
        normalized.tipAmount,
        normalized.discountAmount,
        normalized.total,
        normalized.currency,
        normalized.placedAt,
        normalized.acceptedAt,
        normalized.dueAt,
        normalized.saleId,
        rawPayload,
      ]
    );
  }

  await query(`DELETE FROM delivery_order_items WHERE tenant_id = ? AND delivery_order_id = ?`, [tenantId, orderId]);
  for (const item of normalized.items) {
    await query(
      `INSERT INTO delivery_order_items (
         id, tenant_id, delivery_order_id, external_item_id, product_id, product_name,
         quantity, price, note, modifiers, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        item.id,
        tenantId,
        orderId,
        item.externalItemId,
        item.productId,
        item.productName,
        item.quantity,
        item.price,
        item.note,
        JSON.stringify(item.modifiers || []),
      ]
    );
  }

  await recordAuditEventSafe({
    tenantId,
    action: existing.length > 0 ? "delivery_order.updated" : "delivery_order.ingested",
    entityType: "delivery_order",
    entityId: orderId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "delivery_integration",
    details: {
      provider: normalized.provider,
      externalOrderId: normalized.externalOrderId,
      status: normalized.status,
      itemCount: normalized.items.length,
      total: normalized.total,
    },
  });

  const [saved] = await listDeliveryOrders(tenantId, { id: orderId });
  return saved || serializeOrder({ id: orderId, tenant_id: tenantId, ...normalized }, normalized.items);
}

export async function listDeliveryOrders(tenantId: string, filters: { provider?: string | null; status?: string | null; id?: string | null } = {}) {
  const clauses = ["tenant_id = ?"];
  const params: any[] = [tenantId];
  if (filters.id) {
    clauses.push("id = ?");
    params.push(filters.id);
  }
  if (filters.provider) {
    clauses.push("provider = ?");
    params.push(normalizeDeliveryProvider(filters.provider));
  }
  if (filters.status) {
    clauses.push("status = ?");
    params.push(normalizeDeliveryStatus(filters.status));
  }

  const orders = await query<any>(
    `SELECT
       id,
       tenant_id AS tenantId,
       provider,
       external_order_id AS externalOrderId,
       status,
       customer_name AS customerName,
       customer_phone AS customerPhone,
       delivery_address AS deliveryAddress,
       subtotal,
       delivery_fee AS deliveryFee,
       tip_amount AS tipAmount,
       discount_amount AS discountAmount,
       total,
       currency,
       placed_at AS placedAt,
       accepted_at AS acceptedAt,
       due_at AS dueAt,
       sale_id AS saleId,
       raw_payload AS rawPayload,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM delivery_orders
     WHERE ${clauses.join(" AND ")}
     ORDER BY COALESCE(placed_at, created_at) DESC
     LIMIT 100`,
    params
  );
  if (orders.length === 0) return [];

  const placeholders = orders.map(() => "?").join(",");
  const items = await query<any>(
    `SELECT
       id,
       delivery_order_id AS deliveryOrderId,
       external_item_id AS externalItemId,
       product_id AS productId,
       product_name AS productName,
       quantity,
       price,
       note,
       modifiers
     FROM delivery_order_items
     WHERE tenant_id = ? AND delivery_order_id IN (${placeholders})
     ORDER BY created_at ASC, id ASC`,
    [tenantId, ...orders.map(order => order.id)]
  );
  const itemsByOrder = new Map<string, any[]>();
  for (const item of items) {
    const orderId = String(item.deliveryOrderId ?? item.delivery_order_id);
    itemsByOrder.set(orderId, [...(itemsByOrder.get(orderId) || []), item]);
  }

  return orders.map(order => serializeOrder(order, itemsByOrder.get(order.id) || []));
}

export async function updateDeliveryOrderStatus(tenantId: string, orderId: string, status: string, actor: Actor = {}) {
  const nextStatus = normalizeDeliveryStatus(status);
  await query(
    `UPDATE delivery_orders
        SET status = ?,
            accepted_at = CASE WHEN ? = 'accepted' AND accepted_at IS NULL THEN NOW() ELSE accepted_at END,
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ?`,
    [nextStatus, nextStatus, tenantId, orderId]
  );
  await recordAuditEventSafe({
    tenantId,
    action: "delivery_order.status_updated",
    entityType: "delivery_order",
    entityId: orderId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "delivery_integration",
    details: { status: nextStatus },
  });

  const [saved] = await listDeliveryOrders(tenantId, { id: orderId });
  return saved;
}
