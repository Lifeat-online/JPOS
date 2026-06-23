import crypto from "crypto";
import { query } from "./db.js";
import { recordAuditEventSafe, recordStockMovement } from "./audit.js";

export type IntegrationApiKeyStatus = "active" | "revoked";
export type IntegrationWebhookStatus = "received" | "applied" | "failed" | "duplicate";
export type IntegrationWebhookEventType = "stock.snapshot" | "stock.adjustment" | "product.price_update";

export type IntegrationActor = {
  staffId?: string | null;
  staffName?: string | null;
};

export type IntegrationApiKey = {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: IntegrationApiKeyStatus;
  lastUsedAt?: any;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
  revokedAt?: any;
  revokedBy?: string | null;
  revokedByName?: string | null;
};

export type AuthenticatedIntegrationApiKey = IntegrationApiKey & {
  keyHash: string;
};

export type IntegrationWebhookEvent = {
  id: string;
  tenantId: string;
  apiKeyId?: string | null;
  source: string;
  eventType: IntegrationWebhookEventType | string;
  idempotencyKey: string;
  status: IntegrationWebhookStatus;
  entityType?: string | null;
  entityId?: string | null;
  payload: any;
  result: any;
  errorMessage?: string | null;
  createdAt?: any;
  processedAt?: any;
};

const DEFAULT_SCOPES = ["stock:write", "products:read"];
const STOCK_SYNC_EVENT_TYPES = new Set(["stock.snapshot", "stock.adjustment", "product.price_update"]);

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

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function quantity(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("A valid stock quantity is required");
  return Math.max(0, Number(parsed.toFixed(3)));
}

function delta(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) throw new Error("A non-zero stock delta is required");
  return Number(parsed.toFixed(3));
}

function moneyOrNull(value: unknown) {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Number(Math.max(0, parsed).toFixed(2));
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

function serializeJson(value: unknown, fallback: unknown = {}) {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function normalizeScopes(input: unknown) {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? parseJson(input, input.split(","))
      : DEFAULT_SCOPES;
  const scopes = (Array.isArray(raw) ? raw : DEFAULT_SCOPES)
    .map(scope => clean(scope, 80).toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(scopes.length ? scopes : DEFAULT_SCOPES));
}

function hasScope(key: Pick<IntegrationApiKey, "scopes">, required: string) {
  return key.scopes.includes("*") || key.scopes.includes(required);
}

function normalizeEventType(value: unknown): IntegrationWebhookEventType {
  const text = clean(value, 80).toLowerCase().replace(/[\s_-]+/g, ".");
  if (text === "stock.snapshot" || text === "stock.count" || text === "stock.set") return "stock.snapshot";
  if (text === "stock.adjustment" || text === "stock.delta" || text === "stock.change") return "stock.adjustment";
  if (text === "product.price.update" || text === "product.price" || text === "price.update") return "product.price_update";
  throw new Error("Unsupported integration webhook event type");
}

function serializeApiKey(row: any): IntegrationApiKey {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    name: row.name,
    keyPrefix: row.keyPrefix ?? row.key_prefix,
    scopes: normalizeScopes(row.scopes),
    status: row.status || "active",
    lastUsedAt: row.lastUsedAt ?? row.last_used_at ?? null,
    createdBy: row.createdBy ?? row.created_by ?? null,
    createdByName: row.createdByName ?? row.created_by_name ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
    revokedAt: row.revokedAt ?? row.revoked_at ?? null,
    revokedBy: row.revokedBy ?? row.revoked_by ?? null,
    revokedByName: row.revokedByName ?? row.revoked_by_name ?? null,
  };
}

function serializeWebhookEvent(row: any): IntegrationWebhookEvent {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    apiKeyId: row.apiKeyId ?? row.api_key_id ?? null,
    source: row.source,
    eventType: row.eventType ?? row.event_type,
    idempotencyKey: row.idempotencyKey ?? row.idempotency_key,
    status: row.status || "received",
    entityType: row.entityType ?? row.entity_type ?? null,
    entityId: row.entityId ?? row.entity_id ?? null,
    payload: parseJson(row.payload, {}),
    result: parseJson(row.result, {}),
    errorMessage: row.errorMessage ?? row.error_message ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
    processedAt: row.processedAt ?? row.processed_at ?? null,
  };
}

export function hashIntegrationApiKey(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function timingSafeHashEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function generateSecret() {
  return `jpos_live_${crypto.randomBytes(24).toString("base64url")}`;
}

export async function createIntegrationApiKey(
  tenantId: string,
  input: { name?: string | null; scopes?: unknown } = {},
  actor: IntegrationActor = {}
) {
  const secret = generateSecret();
  const keyHash = hashIntegrationApiKey(secret);
  const apiKey: IntegrationApiKey = {
    id: id("iak"),
    tenantId,
    name: clean(input.name, 160) || "ERP stock sync",
    keyPrefix: secret.slice(0, 18),
    scopes: normalizeScopes(input.scopes),
    status: "active",
    createdBy: actor.staffId || null,
    createdByName: actor.staffName || null,
  };

  await query(
    `INSERT INTO integration_api_keys (
       id, tenant_id, name, key_hash, key_prefix, scopes, status,
       created_by, created_by_name, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NOW())`,
    [
      apiKey.id,
      tenantId,
      apiKey.name,
      keyHash,
      apiKey.keyPrefix,
      JSON.stringify(apiKey.scopes),
      apiKey.createdBy,
      apiKey.createdByName,
    ]
  );

  await recordAuditEventSafe({
    tenantId,
    action: "integration.api_key_created",
    entityType: "integration_api_key",
    entityId: apiKey.id,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "integration_access",
    details: { name: apiKey.name, keyPrefix: apiKey.keyPrefix, scopes: apiKey.scopes },
  });

  return { key: apiKey, secret };
}

export async function listIntegrationApiKeys(tenantId: string) {
  const rows = await query<any>(
    `SELECT id, tenant_id, name, key_prefix, scopes, status, last_used_at,
            created_by, created_by_name, created_at, revoked_at, revoked_by, revoked_by_name
       FROM integration_api_keys
      WHERE tenant_id = ?
      ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows.map(serializeApiKey);
}

export async function revokeIntegrationApiKey(tenantId: string, keyId: string, actor: IntegrationActor = {}) {
  await query(
    `UPDATE integration_api_keys
        SET status = 'revoked',
            revoked_at = NOW(),
            revoked_by = ?,
            revoked_by_name = ?
      WHERE tenant_id = ? AND id = ?`,
    [actor.staffId || null, actor.staffName || null, tenantId, keyId]
  );

  await recordAuditEventSafe({
    tenantId,
    action: "integration.api_key_revoked",
    entityType: "integration_api_key",
    entityId: keyId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "integration_access",
  });

  return listIntegrationApiKeys(tenantId).then(keys => keys.find(key => key.id === keyId) || null);
}

export async function authenticateIntegrationApiKey(tenantId: string, secret: string | null | undefined) {
  const token = clean(secret, 255);
  if (!token) return null;
  const incomingHash = hashIntegrationApiKey(token);
  const rows = await query<any>(
    `SELECT id, tenant_id, name, key_hash, key_prefix, scopes, status, last_used_at,
            created_by, created_by_name, created_at, revoked_at, revoked_by, revoked_by_name
       FROM integration_api_keys
      WHERE tenant_id = ? AND status = 'active'`,
    [tenantId]
  );
  const row = rows.find(candidate => timingSafeHashEquals(String((candidate.keyHash ?? candidate.key_hash) || ""), incomingHash));
  if (!row) return null;

  await query(
    `UPDATE integration_api_keys SET last_used_at = NOW() WHERE tenant_id = ? AND id = ?`,
    [tenantId, row.id]
  );

  return {
    ...serializeApiKey(row),
    keyHash: incomingHash,
  } as AuthenticatedIntegrationApiKey;
}

export async function listIntegrationWebhookEvents(
  tenantId: string,
  filters: { status?: string | null; source?: string | null; limit?: string | number | null } = {}
) {
  const where = ["tenant_id = ?"];
  const params: any[] = [tenantId];
  const status = clean(filters.status, 40);
  const source = clean(filters.source, 80);
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (source) {
    where.push("source = ?");
    params.push(source);
  }
  const limit = Math.min(200, Math.max(1, Number(filters.limit || 50) || 50));
  params.push(limit);
  const rows = await query<any>(
    `SELECT id, tenant_id, api_key_id, source, event_type, idempotency_key, status,
            entity_type, entity_id, payload, result, error_message, created_at, processed_at
       FROM integration_webhook_events
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ?`,
    params
  );
  return rows.map(serializeWebhookEvent);
}

function normalizeWebhookPayload(payload: any) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const source = clean(raw.source ?? raw.provider ?? raw.system ?? raw.erp, 80) || "external_system";
  const eventType = normalizeEventType(raw.eventType ?? raw.event_type ?? raw.type);
  const idempotencyKey = clean(
    raw.idempotencyKey ?? raw.idempotency_key ?? raw.eventId ?? raw.event_id ?? raw.externalEventId ?? raw.external_event_id,
    160
  );
  if (!idempotencyKey) throw new Error("An idempotency key is required");
  if (!STOCK_SYNC_EVENT_TYPES.has(eventType)) throw new Error("Unsupported integration webhook event type");

  const items = Array.isArray(raw.items) && raw.items.length > 0 ? raw.items : [raw];
  return { source, eventType, idempotencyKey, items, raw };
}

async function findProductForSync(tenantId: string, item: any) {
  const productId = nullable(item.productId ?? item.product_id ?? item.posProductId ?? item.pos_product_id, 64);
  const barcode = nullable(item.barcode ?? item.sku ?? item.SKU ?? item.externalSku ?? item.external_sku, 128);

  if (productId) {
    const rows = await query<any>(
      `SELECT id, name, stock, min_stock, barcode
         FROM products
        WHERE tenant_id = ? AND id = ?
        LIMIT 1`,
      [tenantId, productId]
    );
    if (rows[0]) return rows[0];
  }

  if (barcode) {
    const rows = await query<any>(
      `SELECT id, name, stock, min_stock, barcode
         FROM products
        WHERE tenant_id = ? AND barcode = ?
        LIMIT 1`,
      [tenantId, barcode]
    );
    if (rows[0]) return rows[0];
  }

  throw new Error(`Product not found for sync item ${productId || barcode || "unknown"}`);
}

async function upsertLocationStock(
  tenantId: string,
  productId: string,
  locationId: string,
  quantityValue: number,
  actor: IntegrationActor
) {
  await query(
    `INSERT INTO product_location_stock (
       tenant_id, product_id, location_id, quantity, min_stock, reorder_threshold,
       updated_by, updated_by_name, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 0, 0, ?, ?, NOW(), NOW())
     ON CONFLICT (tenant_id, product_id, location_id)
     DO UPDATE SET quantity = EXCLUDED.quantity,
                   updated_by = EXCLUDED.updated_by,
                   updated_by_name = EXCLUDED.updated_by_name,
                   updated_at = NOW()`,
    [tenantId, productId, locationId, quantityValue, actor.staffId || null, actor.staffName || null]
  );
}

async function readLocationQuantity(tenantId: string, productId: string, locationId: string, fallback: number) {
  try {
    const rows = await query<any>(
      `SELECT quantity
         FROM product_location_stock
        WHERE tenant_id = ? AND product_id = ? AND location_id = ?
        LIMIT 1`,
      [tenantId, productId, locationId]
    );
    return rows[0] ? Number(rows[0].quantity || 0) : fallback;
  } catch (error: any) {
    const message = String(error?.message || "");
    if (!message.includes("product_location_stock")) throw error;
    return fallback;
  }
}

async function applyStockSyncItem(
  tenantId: string,
  eventId: string,
  eventType: IntegrationWebhookEventType,
  item: any,
  actor: IntegrationActor
) {
  const product = await findProductForSync(tenantId, item);
  const productId = String(product.id);
  const productName = String(product.name || item.productName || item.product_name || productId);
  const previousQuantity = Number(product.stock || 0);
  const locationId = clean(item.locationId ?? item.location_id ?? item.warehouseId ?? item.warehouse_id, 64) || "main";

  if (eventType === "product.price_update") {
    const price = moneyOrNull(item.price ?? item.sellingPrice ?? item.selling_price);
    const costPrice = moneyOrNull(item.costPrice ?? item.cost_price ?? item.unitCost ?? item.unit_cost);
    if (price === null && costPrice === null) throw new Error("A price or cost price is required");

    const assignments: string[] = [];
    const params: any[] = [];
    if (price !== null) {
      assignments.push("price = ?");
      params.push(price);
    }
    if (costPrice !== null) {
      assignments.push("cost_price = ?");
      params.push(costPrice);
    }
    params.push(tenantId, productId);
    await query(
      `UPDATE products SET ${assignments.join(", ")}, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
      params
    );
    return { productId, productName, price, costPrice, locationId, quantityDelta: 0, previousQuantity, newQuantity: previousQuantity };
  }

  const nextQuantity = eventType === "stock.snapshot"
    ? quantity(item.quantity ?? item.stock ?? item.onHand ?? item.on_hand)
    : Math.max(0, Number((previousQuantity + delta(item.delta ?? item.quantityDelta ?? item.quantity_delta ?? item.adjustment)).toFixed(3)));
  const appliedDelta = Number((nextQuantity - previousQuantity).toFixed(3));
  const previousLocationQuantity = await readLocationQuantity(tenantId, productId, locationId, previousQuantity);
  const nextLocationQuantity = eventType === "stock.snapshot"
    ? nextQuantity
    : Math.max(0, Number((previousLocationQuantity + appliedDelta).toFixed(3)));

  await query(
    `UPDATE products SET stock = ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
    [nextQuantity, tenantId, productId]
  );
  await upsertLocationStock(tenantId, productId, locationId, nextLocationQuantity, actor);

  await recordStockMovement({ query } as any, {
    tenantId,
    itemType: "product",
    productId,
    itemName: productName,
    quantityDelta: appliedDelta,
    previousQuantity,
    newQuantity: nextQuantity,
    reason: eventType === "stock.snapshot" ? "ERP stock snapshot" : "ERP stock adjustment",
    reasonCode: eventType === "stock.snapshot" ? "count_correction" : "adjustment",
    referenceType: "integration_webhook",
    referenceId: eventId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    note: nullable(item.note ?? item.reason, 1000),
    locationId,
  });

  return { productId, productName, locationId, quantityDelta: appliedDelta, previousQuantity, newQuantity: nextQuantity };
}

export async function ingestStockWebhook(
  tenantId: string,
  payload: unknown,
  apiKey: Pick<AuthenticatedIntegrationApiKey, "id" | "name" | "keyPrefix" | "scopes"> | null
) {
  if (!apiKey || !hasScope(apiKey, "stock:write")) {
    throw new Error("Integration API key does not have stock sync access");
  }

  const normalized = normalizeWebhookPayload(payload);
  const existing = await query<any>(
    `SELECT id, tenant_id, api_key_id, source, event_type, idempotency_key, status,
            entity_type, entity_id, payload, result, error_message, created_at, processed_at
       FROM integration_webhook_events
      WHERE tenant_id = ? AND source = ? AND idempotency_key = ?
      LIMIT 1`,
    [tenantId, normalized.source, normalized.idempotencyKey]
  );
  if (existing[0]) {
    const event = serializeWebhookEvent(existing[0]);
    return { ...event, status: "duplicate" as IntegrationWebhookStatus, duplicateOf: event.id };
  }

  const eventId = id("iwe");
  await query(
    `INSERT INTO integration_webhook_events (
       id, tenant_id, api_key_id, source, event_type, idempotency_key,
       status, payload, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'received', ?, NOW())`,
    [
      eventId,
      tenantId,
      apiKey.id,
      normalized.source,
      normalized.eventType,
      normalized.idempotencyKey,
      serializeJson(normalized.raw),
    ]
  );

  try {
    const items = [];
    for (const item of normalized.items) {
      items.push(await applyStockSyncItem(tenantId, eventId, normalized.eventType, item, {
        staffId: apiKey.id,
        staffName: apiKey.name,
      }));
    }
    const entity = items[0] || null;
    const result = {
      appliedCount: items.length,
      source: normalized.source,
      eventType: normalized.eventType,
      items,
    };

    await query(
      `UPDATE integration_webhook_events
          SET status = 'applied',
              entity_type = ?,
              entity_id = ?,
              result = ?,
              processed_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [
        normalized.eventType === "product.price_update" ? "product_price" : "product_stock",
        entity?.productId || null,
        serializeJson(result),
        tenantId,
        eventId,
      ]
    );

    await recordAuditEventSafe({
      tenantId,
      action: "integration.stock_sync_applied",
      entityType: "integration_webhook_event",
      entityId: eventId,
      staffId: apiKey.id,
      staffName: apiKey.name,
      source: "integration_webhook",
      details: {
        source: normalized.source,
        eventType: normalized.eventType,
        idempotencyKey: normalized.idempotencyKey,
        apiKeyPrefix: apiKey.keyPrefix,
        appliedCount: items.length,
      },
    });

    return serializeWebhookEvent({
      id: eventId,
      tenant_id: tenantId,
      api_key_id: apiKey.id,
      source: normalized.source,
      event_type: normalized.eventType,
      idempotency_key: normalized.idempotencyKey,
      status: "applied",
      entity_type: normalized.eventType === "product.price_update" ? "product_price" : "product_stock",
      entity_id: entity?.productId || null,
      payload: normalized.raw,
      result,
    });
  } catch (error: any) {
    const message = clean(error?.message || "Integration webhook failed", 2000);
    await query(
      `UPDATE integration_webhook_events
          SET status = 'failed',
              error_message = ?,
              processed_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [message, tenantId, eventId]
    );
    await recordAuditEventSafe({
      tenantId,
      action: "integration.webhook_failed",
      entityType: "integration_webhook_event",
      entityId: eventId,
      staffId: apiKey.id,
      staffName: apiKey.name,
      source: "integration_webhook",
      details: {
        source: normalized.source,
        eventType: normalized.eventType,
        idempotencyKey: normalized.idempotencyKey,
        error: message,
      },
    });
    throw Object.assign(new Error(message), { eventId });
  }
}
