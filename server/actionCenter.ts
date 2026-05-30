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
  deviceId?: string;
  source?: string;
  action?: string;
  audience?: string;
  from?: string;
  to?: string;
  limit?: string | number;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function clampLimit(value: unknown, fallback = 50, max = 1000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), max);
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

function detailString(details: unknown, keys: string[]) {
  const value = details && typeof details === "object" ? details as Record<string, unknown> : {};
  for (const key of keys) {
    const raw = value[key];
    if (raw !== null && raw !== undefined && String(raw).trim()) return String(raw);
  }
  return null;
}

function normalizeStockMovement(movement: any) {
  return {
    ...movement,
    reasonCode: movement.reasonCode || movement.reason_code || null,
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

function normalizeReportAudience(value: unknown) {
  const audience = clean(value).toLowerCase();
  if (audience === "accountant" || audience === "compliance" || audience === "owner") return audience;
  return "owner";
}

function titleText(item: any) {
  return String(item?.title || "").toLowerCase();
}

function sourceText(item: any) {
  return String(item?.source || "").toLowerCase();
}

function numericDetail(item: any, keys: string[]) {
  const details = item?.details && typeof item.details === "object" ? item.details : {};
  for (const key of keys) {
    const value = details[key];
    if (value !== null && value !== undefined && value !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function amountForReport(item: any) {
  if (item.kind === "stock") return null;
  return numericDetail(item, ["amount", "total", "refundTotal", "walletAmount", "walletPaymentAmount", "cashSessionDelta"]);
}

function reviewFocusForReport(audience: string, item: any) {
  const title = titleText(item);
  const source = sourceText(item);
  if (audience === "accountant") {
    if (item.kind === "stock") return "stock movement";
    if (title.includes("cash") || source.includes("cash")) return "cash control";
    if (title.includes("wallet")) return "wallet liability";
    if (title.includes("refund") || title.includes("void")) return "refund or void";
    if (title.startsWith("sale.")) return "sales support";
    return "supporting audit";
  }
  if (audience === "compliance") {
    if (title === "permission.denied" || title.startsWith("auth.")) return "security access";
    if (title.startsWith("settings.") || title.startsWith("staff.")) return "administration change";
    if (title.startsWith("customer.")) return "customer data change";
    if (title.startsWith("ai.")) return "AI approval trace";
    if (title.startsWith("offline.")) return "offline sync trace";
    return "retention trail";
  }
  if (title.includes("refund") || title.includes("void")) return "sales exception";
  if (title.includes("cash") || source.includes("cash")) return "cash exception";
  if (item.kind === "stock") return "stock movement";
  if (title.startsWith("ai.")) return "AI action";
  if (title === "permission.denied") return "blocked action";
  return "owner review";
}

function countBy(items: any[], keyFn: (item: any) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = clean(keyFn(item) || "Unspecified") || "Unspecified";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export async function getManagerActionCenter(tenantId: string) {
  const [
    auditEvents,
    stockMovements,
    lowStock,
    cashExceptions,
    saleExceptions,
    aiInsights,
    stockTakeExceptions,
    offlineSyncIssues,
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
         reason_code AS reasonCode,
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
    query<any>(
      `SELECT
         s.id,
         s.name,
         s.type,
         s.status,
         s.due_at AS dueAt,
         s.updated_at AS updatedAt,
         COUNT(i.id) AS itemCount,
         SUM(CASE WHEN i.counted_quantity IS NOT NULL THEN 1 ELSE 0 END) AS countedCount,
         SUM(CASE WHEN i.variance_quantity IS NOT NULL AND ABS(i.variance_quantity) > 0.0001 THEN 1 ELSE 0 END) AS varianceCount,
         SUM(CASE WHEN i.variance_quantity IS NOT NULL THEN i.variance_quantity ELSE 0 END) AS netVariance
       FROM stock_take_sessions s
       LEFT JOIN stock_take_items i ON i.session_id = s.id AND i.tenant_id = s.tenant_id
       WHERE s.tenant_id = ?
         AND s.status IN ('active','submitted')
         AND (
           s.status = 'submitted'
           OR (s.status = 'active' AND s.due_at IS NOT NULL AND s.due_at < NOW())
         )
       GROUP BY s.id, s.name, s.type, s.status, s.due_at, s.updated_at
       HAVING
         (s.status = 'active' AND s.due_at IS NOT NULL AND s.due_at < NOW())
         OR SUM(CASE WHEN i.variance_quantity IS NOT NULL AND ABS(i.variance_quantity) > 0.0001 THEN 1 ELSE 0 END) > 0
       ORDER BY
         CASE WHEN s.status = 'submitted' THEN 0 ELSE 1 END,
         s.updated_at DESC
       LIMIT 20`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         id,
         action,
         entity_type AS entityType,
         entity_id AS entityId,
         staff_id AS staffId,
         staff_name AS staffName,
         source,
         details,
         created_at AS createdAt
       FROM audit_events
       WHERE tenant_id = ?
         AND action NOT LIKE 'manager_task.%'
         AND (
           action IN ('offline.sync_failed', 'offline.sync_conflict')
           OR action LIKE 'sync.%'
           OR action LIKE '%sync_failed%'
           OR action LIKE '%sync_conflict%'
           OR action LIKE '%sync.conflict%'
         )
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

  const parsedStockTakeExceptions = stockTakeExceptions.map((session) => ({
    ...session,
    itemCount: toNumber(session.itemCount),
    countedCount: toNumber(session.countedCount),
    varianceCount: toNumber(session.varianceCount),
    netVariance: toNumber(session.netVariance),
  }));

  const parsedOfflineSyncIssues = offlineSyncIssues.map((event) => ({
    ...event,
    details: safeParse(event.details, {}),
  }));

  const counts = {
    auditEvents: parsedAuditEvents.length,
    stockMovements: parsedStockMovements.length,
    lowStock: parsedLowStock.length,
    cashExceptions: parsedCashExceptions.length,
    saleExceptions: parsedSaleExceptions.length,
    aiWarnings: parsedAiInsights.length,
    stockTakeExceptions: parsedStockTakeExceptions.length,
    offlineSyncIssues: parsedOfflineSyncIssues.length,
  };

  return {
    counts,
    urgentCount:
      counts.lowStock +
      counts.cashExceptions +
      counts.saleExceptions +
      counts.aiWarnings +
      counts.stockTakeExceptions +
      counts.offlineSyncIssues,
    auditEvents: parsedAuditEvents,
    stockMovements: parsedStockMovements,
    lowStock: parsedLowStock,
    cashExceptions: parsedCashExceptions,
    saleExceptions: parsedSaleExceptions,
    aiInsights: parsedAiInsights,
    stockTakeExceptions: parsedStockTakeExceptions,
    offlineSyncIssues: parsedOfflineSyncIssues,
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
  const deviceId = clean(filters.deviceId);
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
      where.push("(customer_id = ? OR (entity_type = 'customer' AND entity_id = ?) OR LOWER(COALESCE(details, '')) LIKE ?)");
      params.push(customerId, customerId, `%${customerId.toLowerCase()}%`);
    }
    if (registerId) {
      where.push(`(
        entity_id = ?
        OR LOWER(COALESCE(details, '')) LIKE ?
        OR related_sale_id IN (
          SELECT sale_id FROM cash_movements
          WHERE tenant_id = ? AND cash_session_id = ? AND sale_id IS NOT NULL
        )
      )`);
      params.push(registerId, `%${registerId.toLowerCase()}%`, tenantId, registerId);
    }
    if (deviceId) {
      where.push(`(
        entity_id = ?
        OR LOWER(COALESCE(details, '')) LIKE ?
      )`);
      params.push(deviceId, `%${deviceId.toLowerCase()}%`);
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
        OR LOWER(COALESCE(details, '')) LIKE ?
      )`);
      params.push(...Array(9).fill(`%${search}%`));
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
    if (deviceId) {
      where.push(`(
        reference_id = ?
        OR sale_id IN (
          SELECT related_sale_id FROM audit_events
          WHERE tenant_id = ? AND related_sale_id IS NOT NULL AND LOWER(COALESCE(details, '')) LIKE ?
        )
        OR reference_id IN (
          SELECT related_sale_id FROM audit_events
          WHERE tenant_id = ? AND related_sale_id IS NOT NULL AND LOWER(COALESCE(details, '')) LIKE ?
        )
      )`);
      params.push(deviceId, tenantId, `%${deviceId.toLowerCase()}%`, tenantId, `%${deviceId.toLowerCase()}%`);
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
      where.push("(LOWER(reason) LIKE ? OR LOWER(COALESCE(reason_code, '')) LIKE ?)");
      params.push(`%${action.toLowerCase()}%`, `%${action.toLowerCase().replace(/[\s-]+/g, "_")}%`);
    }
    if (search) {
      where.push(`(
        LOWER(COALESCE(item_name, '')) LIKE ?
        OR LOWER(COALESCE(product_id, '')) LIKE ?
        OR LOWER(COALESCE(bulk_item_id, '')) LIKE ?
        OR LOWER(reason) LIKE ?
        OR LOWER(COALESCE(reason_code, '')) LIKE ?
        OR LOWER(COALESCE(reference_type, '')) LIKE ?
        OR LOWER(COALESCE(reference_id, '')) LIKE ?
        OR LOWER(COALESCE(sale_id, '')) LIKE ?
        OR LOWER(COALESCE(staff_id, '')) LIKE ?
        OR LOWER(COALESCE(staff_name, '')) LIKE ?
        OR LOWER(COALESCE(note, '')) LIKE ?
      )`);
      params.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search.replace(/[\s-]+/g, "_")}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      );
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
         reason_code AS reasonCode,
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
    ...auditEvents.map((event) => {
      const details = event.details || {};
      return {
        kind: "audit",
        id: event.id,
        title: event.action,
        subtitle: event.entityType,
        staffId: event.staffId,
        staffName: event.staffName,
        productId: event.entityType === "product" ? event.entityId : null,
        saleId: event.relatedSaleId || (event.entityType === "sale" ? event.entityId : null),
        customerId: event.customerId || detailString(details, ["customerId", "targetCustomerId"]),
        registerId: event.entityType === "cash_session" ? event.entityId : detailString(details, ["cashSessionId", "registerId"]),
        deviceId: event.entityType === "companion_device_assignment" ? detailString(details, ["deviceId"]) || event.entityId : detailString(details, ["deviceId"]),
        localReceiptNumber: detailString(details, ["localReceiptNumber"]),
        source: event.source,
        createdAt: event.createdAt,
        details,
      };
    }),
    ...stockMovements.map((movement) => ({
      kind: "stock",
      id: movement.id,
      title: movement.itemName || movement.productId || movement.bulkItemId || "Stock item",
      subtitle: movement.reason,
      reasonCode: movement.reasonCode,
      staffId: movement.staffId,
      staffName: movement.staffName,
      productId: movement.productId || movement.bulkItemId || null,
      saleId: movement.saleId || (movement.referenceType === "sale" ? movement.referenceId : null),
      customerId: null,
      registerId: movement.referenceType === "cash_session" ? movement.referenceId : null,
      deviceId: null,
      localReceiptNumber: null,
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
      deviceId,
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
    "reasonCode",
    "staffId",
    "staffName",
    "customerId",
    "productId",
    "saleId",
    "registerId",
    "deviceId",
    "localReceiptNumber",
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
    item.reasonCode,
    item.staffId,
    item.staffName,
    item.customerId,
    item.productId,
    item.saleId,
    item.registerId,
    item.deviceId,
    item.localReceiptNumber,
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
    filename: `masepos-activity-${new Date().toISOString().slice(0, 10)}.csv`,
    mimeType: "text/csv",
    count: history.items.length,
    csv,
    generatedAt: new Date().toISOString(),
  };
}

export async function getManagerAuditReport(tenantId: string, filters: ActivityFilters = {}) {
  const audience = normalizeReportAudience(filters.audience);
  const generatedAt = new Date().toISOString();
  const history = await getManagerActivityHistory(tenantId, {
    ...filters,
    limit: filters.limit || 500,
  });
  const items = history.items as any[];
  const auditItems = items.filter((item: any) => item.kind === "audit");
  const stockItems = items.filter((item: any) => item.kind === "stock");
  const titleMatches = (pattern: RegExp) => items.filter((item: any) => pattern.test(String(item.title || ""))).length;
  const titleOrSourceMatches = (pattern: RegExp) => items.filter((item: any) => (
    pattern.test(String(item.title || "")) || pattern.test(String(item.source || ""))
  )).length;

  const header = [
    "section",
    "audience",
    "generatedAt",
    "createdAt",
    "kind",
    "actionOrMetric",
    "entityOrReason",
    "staffId",
    "staffName",
    "customerId",
    "productId",
    "saleId",
    "registerId",
    "deviceId",
    "localReceiptNumber",
    "source",
    "amount",
    "quantityDelta",
    "reviewFocus",
    "details",
  ];

  const filterSummary = {
    ...history.filters,
    audience,
  };

  const rows: unknown[][] = [
    ["metadata", audience, generatedAt, "", "", "tenantId", tenantId, "", "", "", "", "", "", "", "", "", "", "", "report context", ""],
    ["metadata", audience, generatedAt, "", "", "filters", "", "", "", "", "", "", "", "", "", "", "", "", "report context", JSON.stringify(filterSummary)],
    ["summary", audience, generatedAt, "", "", "totalRows", items.length, "", "", "", "", "", "", "", "", "", "", "", "report summary", ""],
    ["summary", audience, generatedAt, "", "", "auditEvents", auditItems.length, "", "", "", "", "", "", "", "", "", "", "", "report summary", ""],
    ["summary", audience, generatedAt, "", "", "stockMovements", stockItems.length, "", "", "", "", "", "", "", "", "", "", "", "report summary", ""],
    ["summary", audience, generatedAt, "", "", "salesEvents", titleMatches(/^sale\./i), "", "", "", "", "", "", "", "", "", "", "", "report summary", ""],
    ["summary", audience, generatedAt, "", "", "cashEvents", titleOrSourceMatches(/cash|wallet/i), "", "", "", "", "", "", "", "", "", "", "", "report summary", ""],
    ["summary", audience, generatedAt, "", "", "permissionDenied", titleMatches(/^permission\.denied$/i), "", "", "", "", "", "", "", "", "", "", "", "report summary", ""],
    ["summary", audience, generatedAt, "", "", "authEvents", titleMatches(/^auth\./i), "", "", "", "", "", "", "", "", "", "", "", "report summary", ""],
    ["summary", audience, generatedAt, "", "", "settingsChanges", titleMatches(/^settings\./i), "", "", "", "", "", "", "", "", "", "", "", "report summary", ""],
    ["summary", audience, generatedAt, "", "", "customerChanges", titleMatches(/^customer\./i), "", "", "", "", "", "", "", "", "", "", "", "report summary", ""],
    ["summary", audience, generatedAt, "", "", "staffChanges", titleMatches(/^staff\./i), "", "", "", "", "", "", "", "", "", "", "", "report summary", ""],
    ["summary", audience, generatedAt, "", "", "aiEvents", titleMatches(/^ai\./i), "", "", "", "", "", "", "", "", "", "", "", "report summary", ""],
    ["summary", audience, generatedAt, "", "", "offlineEvents", titleMatches(/^offline\./i), "", "", "", "", "", "", "", "", "", "", "", "report summary", ""],
  ];

  for (const [action, count] of countBy(auditItems, (item) => item.title).slice(0, 40)) {
    rows.push(["breakdown", audience, generatedAt, "", "", "action", action, "", "", "", "", "", "", "", "", "", count, "", "action breakdown", ""]);
  }

  for (const [source, count] of countBy(items, (item) => item.source).slice(0, 25)) {
    rows.push(["breakdown", audience, generatedAt, "", "", "source", source, "", "", "", "", "", "", "", "", "", count, "", "source breakdown", ""]);
  }

  for (const [staff, count] of countBy(items, (item) => item.staffName || item.staffId).slice(0, 25)) {
    rows.push(["breakdown", audience, generatedAt, "", "", "staff", staff, "", "", "", "", "", "", "", "", "", count, "", "staff breakdown", ""]);
  }

  for (const [reason, count] of countBy(stockItems, (item) => item.reasonCode || item.subtitle).slice(0, 25)) {
    rows.push(["breakdown", audience, generatedAt, "", "", "stockReason", reason, "", "", "", "", "", "", "", "", "", count, "", "stock breakdown", ""]);
  }

  for (const item of items) {
    rows.push([
      "activity",
      audience,
      generatedAt,
      item.createdAt,
      item.kind,
      item.title,
      item.subtitle || item.reasonCode || "",
      item.staffId,
      item.staffName,
      item.customerId,
      item.productId,
      item.saleId,
      item.registerId,
      item.deviceId,
      item.localReceiptNumber,
      item.source,
      amountForReport(item),
      item.quantityDelta,
      reviewFocusForReport(audience, item),
      item.note || (item.details ? JSON.stringify(item.details) : ""),
    ]);
  }

  return {
    filename: `masepos-${audience}-audit-report-${new Date().toISOString().slice(0, 10)}.csv`,
    mimeType: "text/csv",
    audience,
    count: items.length,
    summary: {
      totalRows: items.length,
      auditEvents: auditItems.length,
      stockMovements: stockItems.length,
      salesEvents: titleMatches(/^sale\./i),
      cashEvents: titleOrSourceMatches(/cash|wallet/i),
      permissionDenied: titleMatches(/^permission\.denied$/i),
      authEvents: titleMatches(/^auth\./i),
      settingsChanges: titleMatches(/^settings\./i),
      customerChanges: titleMatches(/^customer\./i),
      staffChanges: titleMatches(/^staff\./i),
      aiEvents: titleMatches(/^ai\./i),
      offlineEvents: titleMatches(/^offline\./i),
    },
    csv: [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"),
    generatedAt,
  };
}
