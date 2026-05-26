import { query } from "./db.js";

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function safeParse(value: unknown, fallback: any) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

type ActivityFilters = {
  type?: string;
  search?: string;
  staff?: string;
  productId?: string;
  saleId?: string;
  customerId?: string;
  registerId?: string;
  source?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: string | number;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function clampLimit(value: unknown, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), 200);
}

function dayBoundary(value: unknown, endOfDay = false) {
  const raw = clean(value);
  if (!raw) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function addDateFilters(where: string[], params: unknown[], filters: ActivityFilters) {
  const from = dayBoundary(filters.from);
  const to = dayBoundary(filters.to, true);
  if (from) {
    where.push("created_at >= ?");
    params.push(from);
  }
  if (to) {
    where.push("created_at <= ?");
    params.push(to);
  }
}

function normalizeAuditEvent(event: any) {
  return {
    ...event,
    details: safeParse(event.details, {}),
  };
}

function normalizeStockMovement(movement: any) {
  return {
    ...movement,
    quantityDelta: toNumber(movement.quantityDelta),
    previousQuantity: toNumber(movement.previousQuantity),
    newQuantity: toNumber(movement.newQuantity),
  };
}

function activityTime(value: unknown) {
  const date = value ? new Date(String(value)) : new Date(0);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function getManagerActionCenter(tenantId: string) {
  const [
    auditEvents,
    stockMovements,
    lowStock,
    cashExceptions,
    saleExceptions,
    aiInsights,
  ] = await Promise.all([
    query<any>(
      `SELECT
         id,
         action,
         entity_type AS entityType,
         entity_id AS entityId,
         related_sale_id AS relatedSaleId,
         staff_id AS staffId,
         staff_name AS staffName,
         customer_id AS customerId,
         source,
         details,
         created_at AS createdAt
       FROM audit_events
       WHERE tenant_id = ?
       ORDER BY created_at DESC
       LIMIT 25`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         id,
         item_type AS itemType,
         product_id AS productId,
         bulk_item_id AS bulkItemId,
         item_name AS itemName,
         quantity_delta AS quantityDelta,
         previous_quantity AS previousQuantity,
         new_quantity AS newQuantity,
         reason,
         reference_type AS referenceType,
         reference_id AS referenceId,
         sale_id AS saleId,
         sale_item_id AS saleItemId,
         staff_id AS staffId,
         staff_name AS staffName,
         note,
         created_at AS createdAt
       FROM stock_movements
       WHERE tenant_id = ?
       ORDER BY created_at DESC
       LIMIT 25`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         id,
         name,
         category,
         section,
         stock,
         min_stock AS minStock,
         updated_at AS updatedAt
       FROM products
       WHERE tenant_id = ?
         AND COALESCE(stock, 0) <= GREATEST(1, COALESCE(min_stock, 0))
       ORDER BY COALESCE(stock, 0) ASC, name ASC
       LIMIT 20`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         id,
         staff_id AS staffId,
         staff_name AS staffName,
         expected_cash AS expectedCash,
         actual_cash AS actualCash,
         difference,
         review_status AS reviewStatus,
         status,
         opened_at AS openedAt,
         updated_at AS updatedAt
       FROM cash_sessions
       WHERE tenant_id = ?
         AND (
           review_status IN ('submitted', 'disputed')
           OR ABS(COALESCE(difference, 0)) > 0.009
         )
       ORDER BY updated_at DESC
       LIMIT 20`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         id,
         customer_id AS customerId,
         staff_id AS staffId,
         total,
         payment_method AS paymentMethod,
         status,
         transaction_type AS transactionType,
         parent_sale_id AS parentSaleId,
         refund_status AS refundStatus,
         refunded_amount AS refundedAmount,
         refund_reason AS refundReason,
         void_reason AS voidReason,
         voided_by AS voidedBy,
         updated_at AS updatedAt,
         created_at AS createdAt
       FROM sales
       WHERE tenant_id = ?
         AND (
           transaction_type IN ('refund', 'void')
           OR refund_status <> 'none'
         )
       ORDER BY updated_at DESC
       LIMIT 20`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         id,
         category,
         severity,
         title,
         summary,
         recommendation,
         evidence,
         confidence,
         status,
         created_at AS createdAt
       FROM ai_insights
       WHERE tenant_id = ?
         AND status = 'open'
         AND severity IN ('critical', 'warning')
       ORDER BY created_at DESC
       LIMIT 20`,
      [tenantId]
    ),
  ]);

  const parsedAuditEvents = auditEvents.map(normalizeAuditEvent);

  const parsedStockMovements = stockMovements.map(normalizeStockMovement);

  const parsedLowStock = lowStock.map((product) => ({
    ...product,
    stock: toNumber(product.stock),
    minStock: toNumber(product.minStock),
  }));

  const parsedCashExceptions = cashExceptions.map((session) => ({
    ...session,
    expectedCash: toNumber(session.expectedCash),
    actualCash: toNumber(session.actualCash),
    difference: toNumber(session.difference),
  }));

  const parsedSaleExceptions = saleExceptions.map((sale) => ({
    ...sale,
    total: toNumber(sale.total),
    refundedAmount: toNumber(sale.refundedAmount),
  }));

  const parsedAiInsights = aiInsights.map((insight) => ({
    ...insight,
    evidence: safeParse(insight.evidence, []),
    confidence: toNumber(insight.confidence),
  }));

  const counts = {
    auditEvents: parsedAuditEvents.length,
    stockMovements: parsedStockMovements.length,
    lowStock: parsedLowStock.length,
    cashExceptions: parsedCashExceptions.length,
    saleExceptions: parsedSaleExceptions.length,
    aiWarnings: parsedAiInsights.length,
  };

  return {
    counts,
    urgentCount:
      counts.lowStock +
      counts.cashExceptions +
      counts.saleExceptions +
      counts.aiWarnings,
    auditEvents: parsedAuditEvents,
    stockMovements: parsedStockMovements,
    lowStock: parsedLowStock,
    cashExceptions: parsedCashExceptions,
    saleExceptions: parsedSaleExceptions,
    aiInsights: parsedAiInsights,
    generatedAt: new Date().toISOString(),
  };
}

export async function getManagerActivityHistory(tenantId: string, filters: ActivityFilters = {}) {
  const type = clean(filters.type) || "all";
  const limit = clampLimit(filters.limit);
  const search = clean(filters.search).toLowerCase();
  const staff = clean(filters.staff);
  const productId = clean(filters.productId);
  const saleId = clean(filters.saleId);
  const customerId = clean(filters.customerId);
  const registerId = clean(filters.registerId);
  const source = clean(filters.source).toLowerCase();
  const action = clean(filters.action);

  const includeAudit = type !== "stock";
  const includeStock = type !== "audit";

  const auditPromise = includeAudit ? (() => {
    const where = ["tenant_id = ?"];
    const params: unknown[] = [tenantId];
    addDateFilters(where, params, filters);
    if (staff) {
      where.push("(staff_id = ? OR LOWER(COALESCE(staff_name, '')) LIKE ?)");
      params.push(staff, `%${staff.toLowerCase()}%`);
    }
    if (saleId) {
      where.push("(related_sale_id = ? OR entity_id = ?)");
      params.push(saleId, saleId);
    }
    if (customerId) {
      where.push("(customer_id = ? OR (entity_type = 'customer' AND entity_id = ?))");
      params.push(customerId, customerId);
    }
    if (registerId) {
      where.push(`(
        entity_id = ?
        OR related_sale_id IN (
          SELECT sale_id FROM cash_movements
          WHERE tenant_id = ? AND cash_session_id = ? AND sale_id IS NOT NULL
        )
      )`);
      params.push(registerId, tenantId, registerId);
    }
    if (productId) {
      where.push("entity_id = ?");
      params.push(productId);
    }
    if (source) {
      where.push("LOWER(COALESCE(source, '')) LIKE ?");
      params.push(`%${source}%`);
    }
    if (action) {
      where.push("LOWER(action) LIKE ?");
      params.push(`%${action.toLowerCase()}%`);
    }
    if (search) {
      where.push(`(
        LOWER(action) LIKE ?
        OR LOWER(entity_type) LIKE ?
        OR LOWER(COALESCE(entity_id, '')) LIKE ?
        OR LOWER(COALESCE(related_sale_id, '')) LIKE ?
        OR LOWER(COALESCE(staff_id, '')) LIKE ?
        OR LOWER(COALESCE(staff_name, '')) LIKE ?
        OR LOWER(COALESCE(customer_id, '')) LIKE ?
        OR LOWER(COALESCE(source, '')) LIKE ?
      )`);
      params.push(...Array(8).fill(`%${search}%`));
    }
    params.push(limit);
    return query<any>(
      `SELECT
         id,
         action,
         entity_type AS entityType,
         entity_id AS entityId,
         related_sale_id AS relatedSaleId,
         staff_id AS staffId,
         staff_name AS staffName,
         customer_id AS customerId,
         source,
         details,
         created_at AS createdAt
       FROM audit_events
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ?`,
      params
    );
  })() : Promise.resolve([]);

  const stockPromise = includeStock ? (() => {
    const where = ["tenant_id = ?"];
    const params: unknown[] = [tenantId];
    addDateFilters(where, params, filters);
    if (staff) {
      where.push("(staff_id = ? OR LOWER(COALESCE(staff_name, '')) LIKE ?)");
      params.push(staff, `%${staff.toLowerCase()}%`);
    }
    if (saleId) {
      where.push("(sale_id = ? OR reference_id = ?)");
      params.push(saleId, saleId);
    }
    if (customerId) {
      where.push(`(
        sale_id IN (SELECT id FROM sales WHERE tenant_id = ? AND customer_id = ?)
        OR reference_id IN (SELECT id FROM sales WHERE tenant_id = ? AND customer_id = ?)
      )`);
      params.push(tenantId, customerId, tenantId, customerId);
    }
    if (registerId) {
      where.push(`(
        reference_id = ?
        OR sale_id IN (
          SELECT sale_id FROM cash_movements
          WHERE tenant_id = ? AND cash_session_id = ? AND sale_id IS NOT NULL
        )
        OR reference_id IN (
          SELECT sale_id FROM cash_movements
          WHERE tenant_id = ? AND cash_session_id = ? AND sale_id IS NOT NULL
        )
      )`);
      params.push(registerId, tenantId, registerId, tenantId, registerId);
    }
    if (productId) {
      where.push("(product_id = ? OR bulk_item_id = ?)");
      params.push(productId, productId);
    }
    if (source) {
      where.push("LOWER(COALESCE(reference_type, '')) LIKE ?");
      params.push(`%${source}%`);
    }
    if (action) {
      where.push("LOWER(reason) LIKE ?");
      params.push(`%${action.toLowerCase()}%`);
    }
    if (search) {
      where.push(`(
        LOWER(COALESCE(item_name, '')) LIKE ?
        OR LOWER(COALESCE(product_id, '')) LIKE ?
        OR LOWER(COALESCE(bulk_item_id, '')) LIKE ?
        OR LOWER(reason) LIKE ?
        OR LOWER(COALESCE(reference_type, '')) LIKE ?
        OR LOWER(COALESCE(reference_id, '')) LIKE ?
        OR LOWER(COALESCE(sale_id, '')) LIKE ?
        OR LOWER(COALESCE(staff_id, '')) LIKE ?
        OR LOWER(COALESCE(staff_name, '')) LIKE ?
        OR LOWER(COALESCE(note, '')) LIKE ?
      )`);
      params.push(...Array(10).fill(`%${search}%`));
    }
    params.push(limit);
    return query<any>(
      `SELECT
         id,
         item_type AS itemType,
         product_id AS productId,
         bulk_item_id AS bulkItemId,
         item_name AS itemName,
         quantity_delta AS quantityDelta,
         previous_quantity AS previousQuantity,
         new_quantity AS newQuantity,
         reason,
         reference_type AS referenceType,
         reference_id AS referenceId,
         sale_id AS saleId,
         sale_item_id AS saleItemId,
         staff_id AS staffId,
         staff_name AS staffName,
         note,
         created_at AS createdAt
       FROM stock_movements
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ?`,
      params
    );
  })() : Promise.resolve([]);

  const [auditRows, stockRows] = await Promise.all([auditPromise, stockPromise]);
  const auditEvents = auditRows.map(normalizeAuditEvent);
  const stockMovements = stockRows.map(normalizeStockMovement);
  const items = [
    ...auditEvents.map((event) => ({
      kind: "audit",
      id: event.id,
      title: event.action,
      subtitle: event.entityType,
      staffId: event.staffId,
      staffName: event.staffName,
      productId: event.entityType === "product" ? event.entityId : null,
      saleId: event.relatedSaleId || (event.entityType === "sale" ? event.entityId : null),
      customerId: event.customerId,
      registerId: event.entityType === "cash_session" ? event.entityId : null,
      source: event.source,
      createdAt: event.createdAt,
      details: event.details,
    })),
    ...stockMovements.map((movement) => ({
      kind: "stock",
      id: movement.id,
      title: movement.itemName || movement.productId || movement.bulkItemId || "Stock item",
      subtitle: movement.reason,
      staffId: movement.staffId,
      staffName: movement.staffName,
      productId: movement.productId || movement.bulkItemId || null,
      saleId: movement.saleId || (movement.referenceType === "sale" ? movement.referenceId : null),
      customerId: null,
      registerId: movement.referenceType === "cash_session" ? movement.referenceId : null,
      source: movement.referenceType || null,
      quantityDelta: movement.quantityDelta,
      previousQuantity: movement.previousQuantity,
      newQuantity: movement.newQuantity,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      note: movement.note,
      createdAt: movement.createdAt,
    })),
  ]
    .sort((a, b) => activityTime(b.createdAt) - activityTime(a.createdAt))
    .slice(0, limit);

  return {
    filters: {
      type,
      search,
      staff,
      productId,
      saleId,
      customerId,
      registerId,
      source,
      action,
      from: clean(filters.from),
      to: clean(filters.to),
      limit,
    },
    counts: {
      auditEvents: auditEvents.length,
      stockMovements: stockMovements.length,
      total: items.length,
    },
    items,
    auditEvents,
    stockMovements,
    generatedAt: new Date().toISOString(),
  };
}

export async function getManagerActivityCsv(tenantId: string, filters: ActivityFilters = {}) {
  const history = await getManagerActivityHistory(tenantId, {
    ...filters,
    limit: filters.limit || 200,
  });
  const header = [
    "kind",
    "createdAt",
    "title",
    "subtitle",
    "staffId",
    "staffName",
    "customerId",
    "productId",
    "saleId",
    "registerId",
    "source",
    "quantityDelta",
    "previousQuantity",
    "newQuantity",
    "referenceType",
    "referenceId",
    "note",
  ];
  const rows = history.items.map((item: any) => [
    item.kind,
    item.createdAt,
    item.title,
    item.subtitle,
    item.staffId,
    item.staffName,
    item.customerId,
    item.productId,
    item.saleId,
    item.registerId,
    item.source,
    item.quantityDelta,
    item.previousQuantity,
    item.newQuantity,
    item.referenceType,
    item.referenceId,
    item.note || (item.details ? JSON.stringify(item.details) : ""),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");

  return {
    filename: `jimmy-pos-activity-${new Date().toISOString().slice(0, 10)}.csv`,
    mimeType: "text/csv",
    count: history.items.length,
    csv,
    generatedAt: new Date().toISOString(),
  };
}
