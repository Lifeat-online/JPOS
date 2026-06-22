import { query } from "./db.js";
import { recordAuditEvent } from "./audit.js";
import { createPurchaseOrder } from "./db-crud.js";
import { DEFAULT_INVENTORY_LOCATION_ID, ensureDefaultInventoryLocation } from "./inventoryLocations.js";

type ReorderStatus = "open" | "in_review" | "approved" | "ordered" | "dismissed";
type ReorderPriority = "low" | "normal" | "high" | "critical";
type ReorderRuleStatus = "active" | "inactive";
type ReorderRuleTriggerType = "below_threshold" | "critical_only" | "days_cover";
type ReorderRulePriority = "normal" | "high" | "critical";

type ReorderActor = {
  staffId?: string | null;
  staffName?: string | null;
};

type RefreshOptions = ReorderActor & {
  daysOfCover?: number | string | null;
  vendorId?: string | null;
  locationId?: string | null;
  sourceRuleId?: string | null;
  sourceRuleName?: string | null;
  triggerType?: ReorderRuleTriggerType | string | null;
  priority?: ReorderRulePriority | string | null;
};

type ApprovalInput = ReorderActor & {
  note?: string | null;
  vendorId?: string | null;
  quantity?: number | string | null;
  expectedPrice?: number | string | null;
  expectedDeliveryDate?: string | null;
};

type ReorderNotificationRuleInput = ReorderActor & {
  name?: string | null;
  status?: ReorderRuleStatus | string | null;
  locationId?: string | null;
  triggerType?: ReorderRuleTriggerType | string | null;
  priority?: ReorderRulePriority | string | null;
  daysOfCover?: number | string | null;
  vendorId?: string | null;
  notifyRoles?: string[] | string | null;
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanString(value: unknown, max = 255) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampDays(value: unknown) {
  const parsed = Math.floor(toNumber(value, 14));
  if (parsed < 1) return 14;
  return Math.min(parsed, 120);
}

function json(value: unknown, fallback: unknown = []) {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
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

function normalizeNotifyRoles(value: unknown, fallback: string[] = ["manager", "owner"]) {
  const raw = value === undefined || value === null || value === ""
    ? fallback
    : Array.isArray(value)
      ? value
      : parseJson(value, fallback);
  if (!Array.isArray(raw)) return fallback;
  const roles = raw
    .map((role) => cleanString(role, 32))
    .filter((role): role is string => Boolean(role));
  return Array.from(new Set(roles)).slice(0, 10);
}

function priorityFor(stock: number, minStock: number): ReorderPriority {
  if (stock <= 0) return "critical";
  if (stock <= Math.max(1, minStock * 0.5)) return "high";
  return "normal";
}

function normalizeRuleStatus(value: unknown, fallback: ReorderRuleStatus = "active"): ReorderRuleStatus {
  return value === "inactive" ? "inactive" : fallback;
}

function normalizeTriggerType(value: unknown, fallback: ReorderRuleTriggerType = "below_threshold"): ReorderRuleTriggerType {
  return value === "critical_only" || value === "days_cover" || value === "below_threshold"
    ? value
    : fallback;
}

function normalizeRulePriority(value: unknown, fallback: ReorderRulePriority = "high"): ReorderRulePriority {
  return value === "critical" || value === "high" || value === "normal" ? value : fallback;
}

function maxPriority(base: ReorderPriority, requested?: ReorderRulePriority | string | null): ReorderPriority {
  const priority = normalizeRulePriority(requested, "normal") as ReorderPriority;
  const rank: Record<ReorderPriority, number> = { low: 0, normal: 1, high: 2, critical: 3 };
  return rank[priority] > rank[base] ? priority : base;
}

function serializeRule(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    name: row.name,
    status: normalizeRuleStatus(row.status),
    locationId: row.locationId ?? row.location_id ?? null,
    triggerType: normalizeTriggerType(row.triggerType ?? row.trigger_type),
    priority: normalizeRulePriority(row.priority),
    daysOfCover: toNumber(row.daysOfCover ?? row.days_of_cover, 14),
    vendorId: row.vendorId ?? row.vendor_id ?? null,
    notifyRoles: normalizeNotifyRoles(row.notifyRoles ?? row.notify_roles),
    lastRunAt: row.lastRunAt ?? row.last_run_at ?? null,
    lastResult: parseJson(row.lastResult ?? row.last_result, {}),
    createdBy: row.createdBy ?? row.created_by ?? null,
    createdByName: row.createdByName ?? row.created_by_name ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

function serializeRecommendation(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    productId: row.productId ?? row.product_id,
    productName: row.productName ?? row.product_name,
    status: row.status as ReorderStatus,
    priority: (row.priority || "high") as ReorderPriority,
    currentStock: toNumber(row.currentStock ?? row.current_stock),
    minStock: toNumber(row.minStock ?? row.min_stock),
    targetStock: toNumber(row.targetStock ?? row.target_stock),
    recommendedQuantity: toNumber(row.recommendedQuantity ?? row.recommended_quantity),
    estimatedUnitCost: toNumber(row.estimatedUnitCost ?? row.estimated_unit_cost),
    estimatedTotalCost: toNumber(row.estimatedTotalCost ?? row.estimated_total_cost),
    avgDailySales: toNumber(row.avgDailySales ?? row.avg_daily_sales),
    daysOfCover: toNumber(row.daysOfCover ?? row.days_of_cover, 14),
    vendorId: row.vendorId ?? row.vendor_id ?? null,
    locationId: row.locationId ?? row.location_id ?? null,
    source: row.source || "min_stock",
    evidence: parseJson(row.evidence, []),
    purchaseOrderId: row.purchaseOrderId ?? row.purchase_order_id ?? null,
    requestedBy: row.requestedBy ?? row.requested_by ?? null,
    requestedByName: row.requestedByName ?? row.requested_by_name ?? null,
    approvedBy: row.approvedBy ?? row.approved_by ?? null,
    approvedByName: row.approvedByName ?? row.approved_by_name ?? null,
    approvedAt: row.approvedAt ?? row.approved_at ?? null,
    dismissedAt: row.dismissedAt ?? row.dismissed_at ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

async function getProductVelocity(tenantId: string) {
  const rows = await query<any>(
    `SELECT
       si.product_id AS productId,
       si.product_name AS productName,
       SUM(si.quantity) AS quantitySold,
       COUNT(DISTINCT s.id) AS saleCount
     FROM sale_items si
     INNER JOIN sales s ON s.id = si.sale_id
     WHERE s.tenant_id = ?
       AND s.status = 'completed'
       AND s.created_at >= NOW() - INTERVAL '90 days'
     GROUP BY si.product_id, si.product_name`,
    [tenantId]
  ).catch(async () => query<any>(
    `SELECT
       si.product_id AS productId,
       si.product_name AS productName,
       SUM(si.quantity) AS quantitySold,
       COUNT(DISTINCT s.id) AS saleCount
     FROM sale_items si
     INNER JOIN sales s ON s.id = si.sale_id
     WHERE s.tenant_id = ?
       AND s.status = 'completed'
        AND s.created_at >= NOW() - INTERVAL '90 days'
     GROUP BY si.product_id, si.product_name`,
    [tenantId]
  ));

  const byProduct = new Map<string, { quantitySold: number; avgDaily: number; saleCount: number }>();
  for (const row of rows || []) {
    const quantitySold = toNumber(row.quantitySold);
    const value = {
      quantitySold,
      avgDaily: quantitySold / 90,
      saleCount: toNumber(row.saleCount),
    };
    if (row.productId) byProduct.set(String(row.productId), value);
    if (row.productName) byProduct.set(String(row.productName), value);
  }
  return byProduct;
}

export async function listReorderRecommendations(
  tenantId: string,
  filters: { status?: string | string[]; limit?: string | number } = {}
) {
  const statuses = (Array.isArray(filters.status) ? filters.status : String(filters.status || "open,in_review").split(","))
    .map((status) => String(status || "").trim())
    .filter((status): status is ReorderStatus => ["open", "in_review", "approved", "ordered", "dismissed"].includes(status));
  const limit = Math.min(Math.max(Math.floor(toNumber(filters.limit, 100)), 1), 500);
  const where = ["tenant_id = ?"];
  const params: any[] = [tenantId];
  if (statuses.length) {
    where.push(`status IN (${statuses.map(() => "?").join(", ")})`);
    params.push(...statuses);
  }
  params.push(limit);

  const rows = await query<any>(
    `SELECT
       id,
       tenant_id AS tenantId,
       product_id AS productId,
       product_name AS productName,
       status,
       priority,
       current_stock AS currentStock,
       min_stock AS minStock,
       target_stock AS targetStock,
       recommended_quantity AS recommendedQuantity,
       estimated_unit_cost AS estimatedUnitCost,
       estimated_total_cost AS estimatedTotalCost,
       avg_daily_sales AS avgDailySales,
       days_of_cover AS daysOfCover,
       vendor_id AS vendorId,
       location_id AS locationId,
       source,
       evidence,
       purchase_order_id AS purchaseOrderId,
       requested_by AS requestedBy,
       requested_by_name AS requestedByName,
       approved_by AS approvedBy,
       approved_by_name AS approvedByName,
       approved_at AS approvedAt,
       dismissed_at AS dismissedAt,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM reorder_recommendations
     WHERE ${where.join(" AND ")}
     ORDER BY
       CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       updated_at DESC
     LIMIT ?`,
    params
  );
  return rows.map(serializeRecommendation);
}

export async function refreshReorderRecommendations(tenantId: string, options: RefreshOptions = {}) {
  const daysOfCover = clampDays(options.daysOfCover);
  const locationIdFilter = cleanString(options.locationId, 64);
  const triggerType = normalizeTriggerType(options.triggerType);
  const productWhere = ["p.tenant_id = ?"];
  const productParams: any[] = [DEFAULT_INVENTORY_LOCATION_ID, DEFAULT_INVENTORY_LOCATION_ID, tenantId];
  if (triggerType !== "days_cover") {
    productWhere.push(`COALESCE(pls.quantity, p.stock, 0) <= GREATEST(1, COALESCE(NULLIF(pls.reorder_threshold, 0), pls.min_stock, p.min_stock, 0))`);
  }
  if (locationIdFilter) {
    productWhere.push(`COALESCE(pls.location_id, ?) = ?`);
    productParams.push(DEFAULT_INVENTORY_LOCATION_ID, locationIdFilter);
  }
  await ensureDefaultInventoryLocation(tenantId);
  const [products, activeRows, velocity] = await Promise.all([
    query<any>(
      `SELECT
         p.id,
         p.name,
         p.category,
         p.section,
         COALESCE(pls.quantity, p.stock, 0) AS stock,
         COALESCE(NULLIF(pls.reorder_threshold, 0), pls.min_stock, p.min_stock, 0) AS minStock,
         p.cost_price AS costPrice,
         p.price,
         COALESCE(pls.location_id, ?) AS locationId,
         COALESCE(l.name, 'Primary stock pool') AS locationName,
         p.updated_at AS updatedAt
       FROM products p
       LEFT JOIN product_location_stock pls
         ON pls.tenant_id = p.tenant_id
        AND pls.product_id = p.id
       LEFT JOIN inventory_locations l
         ON l.tenant_id = p.tenant_id
        AND l.id = COALESCE(pls.location_id, ?)
       WHERE ${productWhere.join("\n         AND ")}
       ORDER BY COALESCE(pls.quantity, p.stock, 0) ASC, p.name ASC
       LIMIT 200`,
      productParams
    ),
    query<any>(
      `SELECT *
       FROM reorder_recommendations
       WHERE tenant_id = ?
         AND status IN ('open','in_review','approved')`,
      [tenantId]
    ),
    getProductVelocity(tenantId),
  ]);

  const activeByProduct = new Map(activeRows.map((row: any) => [
    `${String(row.product_id ?? row.productId)}:${String(row.location_id ?? row.locationId ?? DEFAULT_INVENTORY_LOCATION_ID)}`,
    row,
  ]));
  let created = 0;
  let updated = 0;
  let skippedApproved = 0;

  for (const product of products || []) {
    const productId = String(product.id || "");
    if (!productId) continue;
    const locationId = String(product.locationId || product.location_id || DEFAULT_INVENTORY_LOCATION_ID);
    const locationName = String(product.locationName || product.location_name || "Primary stock pool");
    const existing = activeByProduct.get(`${productId}:${locationId}`);
    if (existing?.status === "approved") {
      skippedApproved += 1;
      continue;
    }

    const stock = toNumber(product.stock);
    const minStock = Math.max(1, toNumber(product.minStock, 1));
    const movement = velocity.get(productId) || velocity.get(String(product.name || ""));
    const avgDaily = movement?.avgDaily || 0;
    const daysRemaining = avgDaily > 0 ? stock / avgDaily : null;
    if (triggerType === "critical_only" && stock > 0) continue;
    if (triggerType === "days_cover" && stock > minStock && (daysRemaining === null || daysRemaining > daysOfCover)) continue;

    const targetStock = Math.max(minStock * 2, Math.ceil(avgDaily * daysOfCover + minStock));
    const recommendedQuantity = Math.max(1, Math.ceil(targetStock - stock));
    const estimatedUnitCost = toNumber(product.costPrice, toNumber(product.price));
    const estimatedTotalCost = Number((recommendedQuantity * estimatedUnitCost).toFixed(2));
    const priority = maxPriority(priorityFor(stock, minStock), options.priority);
    const source = options.sourceRuleId ? "reorder_rule" : "location_min_stock";
    const evidence = [
      options.sourceRuleName ? `Rule: ${options.sourceRuleName}` : null,
      `Current stock ${stock} against minimum ${minStock}`,
      `Target stock ${targetStock} using ${daysOfCover} days of cover`,
      daysRemaining !== null ? `${Number(daysRemaining.toFixed(1))} days of cover remaining` : null,
      movement?.quantitySold ? `Sold ${movement.quantitySold} in the last 90 days` : "No recent sales velocity found",
      product.category ? `Category: ${product.category}` : null,
      product.section ? `Section: ${product.section}` : null,
      `Location: ${locationName}`,
    ].filter(Boolean);

    if (existing?.id) {
      await query(
        `UPDATE reorder_recommendations
            SET product_name = ?,
                priority = ?,
                current_stock = ?,
                min_stock = ?,
                target_stock = ?,
                recommended_quantity = ?,
                estimated_unit_cost = ?,
                estimated_total_cost = ?,
                avg_daily_sales = ?,
                days_of_cover = ?,
                vendor_id = COALESCE(?, vendor_id),
                location_id = ?,
                source = ?,
                evidence = ?,
                requested_by = COALESCE(requested_by, ?),
                requested_by_name = COALESCE(requested_by_name, ?),
                updated_at = NOW()
          WHERE tenant_id = ? AND id = ?`,
        [
          product.name,
          priority,
          stock,
          minStock,
          targetStock,
          recommendedQuantity,
          estimatedUnitCost,
          estimatedTotalCost,
          Number(avgDaily.toFixed(3)),
          daysOfCover,
          options.vendorId || null,
          locationId,
          source,
          json(evidence),
          options.staffId || null,
          options.staffName || null,
          tenantId,
          existing.id,
        ]
      );
      updated += 1;
      continue;
    }

    await query(
      `INSERT INTO reorder_recommendations (
         id, tenant_id, product_id, product_name, status, priority,
         current_stock, min_stock, target_stock, recommended_quantity,
         estimated_unit_cost, estimated_total_cost, avg_daily_sales, days_of_cover,
         vendor_id, location_id, source, evidence, requested_by, requested_by_name,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        makeId("reorder"),
        tenantId,
        productId,
        product.name,
        priority,
        stock,
        minStock,
        targetStock,
        recommendedQuantity,
        estimatedUnitCost,
        estimatedTotalCost,
        Number(avgDaily.toFixed(3)),
        daysOfCover,
        options.vendorId || null,
        locationId,
        source,
        json(evidence),
        options.staffId || null,
        options.staffName || null,
      ]
    );
    created += 1;
  }

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "reorder_recommendations.refreshed",
    entityType: "reorder_recommendation",
    staffId: options.staffId || null,
    staffName: options.staffName || null,
    source: "inventory",
    details: {
      daysOfCover,
      locationId: locationIdFilter || null,
      triggerType,
      sourceRuleId: options.sourceRuleId || null,
      productCount: products.length,
      created,
      updated,
      skippedApproved,
    },
  });

  return {
    created,
    updated,
    skippedApproved,
    recommendations: await listReorderRecommendations(tenantId, { status: "open,in_review,approved" }),
  };
}

export async function listReorderNotificationRules(tenantId: string) {
  const rows = await query<any>(
    `SELECT
       id,
       tenant_id AS tenantId,
       name,
       status,
       location_id AS locationId,
       trigger_type AS triggerType,
       priority,
       days_of_cover AS daysOfCover,
       vendor_id AS vendorId,
       notify_roles AS notifyRoles,
       last_run_at AS lastRunAt,
       last_result AS lastResult,
       created_by AS createdBy,
       created_by_name AS createdByName,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM reorder_notification_rules
     WHERE tenant_id = ?
     ORDER BY
       CASE status WHEN 'active' THEN 0 ELSE 1 END,
       updated_at DESC`,
    [tenantId]
  );
  return rows.map(serializeRule);
}

export async function getReorderNotificationRule(tenantId: string, id: string) {
  const rows = await query<any>(
    `SELECT *
     FROM reorder_notification_rules
     WHERE tenant_id = ? AND id = ?
     LIMIT 1`,
    [tenantId, id]
  );
  return rows[0] ? serializeRule(rows[0]) : null;
}

export async function createReorderNotificationRule(
  tenantId: string,
  input: ReorderNotificationRuleInput = {}
) {
  const id = makeId("reorder_rule");
  const locationId = cleanString(input.locationId, 64);
  const name = cleanString(input.name) || (locationId ? `Reorder watch for ${locationId}` : "All locations reorder watch");
  const status = normalizeRuleStatus(input.status);
  const triggerType = normalizeTriggerType(input.triggerType);
  const priority = normalizeRulePriority(input.priority);
  const daysOfCover = clampDays(input.daysOfCover);
  const vendorId = cleanString(input.vendorId, 64);
  const notifyRoles = normalizeNotifyRoles(input.notifyRoles);

  await query(
    `INSERT INTO reorder_notification_rules (
       id, tenant_id, name, status, location_id, trigger_type, priority,
       days_of_cover, vendor_id, notify_roles, last_result,
       created_by, created_by_name, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      name,
      status,
      locationId,
      triggerType,
      priority,
      daysOfCover,
      vendorId,
      json(notifyRoles),
      json({}, {}),
      input.staffId || null,
      input.staffName || null,
    ]
  );

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "reorder_notification_rule.created",
    entityType: "reorder_notification_rule",
    entityId: id,
    staffId: input.staffId || null,
    staffName: input.staffName || null,
    source: "inventory",
    details: {
      name,
      status,
      locationId,
      triggerType,
      priority,
      daysOfCover,
      vendorId,
      notifyRoles,
    },
  });

  return getReorderNotificationRule(tenantId, id);
}

export async function updateReorderNotificationRule(
  tenantId: string,
  id: string,
  input: ReorderNotificationRuleInput = {}
) {
  const existing = await getReorderNotificationRule(tenantId, id);
  if (!existing) throw new Error("Reorder notification rule not found");

  const fields: string[] = [];
  const values: any[] = [];
  const changes: Record<string, any> = {};

  if (input.name !== undefined) {
    const name = cleanString(input.name);
    if (!name) throw new Error("Rule name is required");
    fields.push("name = ?");
    values.push(name);
    changes.name = name;
  }
  if (input.status !== undefined) {
    const status = normalizeRuleStatus(input.status, existing.status);
    fields.push("status = ?");
    values.push(status);
    changes.status = status;
  }
  if (input.locationId !== undefined) {
    const locationId = cleanString(input.locationId, 64);
    fields.push("location_id = ?");
    values.push(locationId);
    changes.locationId = locationId;
  }
  if (input.triggerType !== undefined) {
    const triggerType = normalizeTriggerType(input.triggerType, existing.triggerType);
    fields.push("trigger_type = ?");
    values.push(triggerType);
    changes.triggerType = triggerType;
  }
  if (input.priority !== undefined) {
    const priority = normalizeRulePriority(input.priority, existing.priority);
    fields.push("priority = ?");
    values.push(priority);
    changes.priority = priority;
  }
  if (input.daysOfCover !== undefined) {
    const daysOfCover = clampDays(input.daysOfCover);
    fields.push("days_of_cover = ?");
    values.push(daysOfCover);
    changes.daysOfCover = daysOfCover;
  }
  if (input.vendorId !== undefined) {
    const vendorId = cleanString(input.vendorId, 64);
    fields.push("vendor_id = ?");
    values.push(vendorId);
    changes.vendorId = vendorId;
  }
  if (input.notifyRoles !== undefined) {
    const notifyRoles = normalizeNotifyRoles(input.notifyRoles);
    fields.push("notify_roles = ?");
    values.push(json(notifyRoles));
    changes.notifyRoles = notifyRoles;
  }

  if (fields.length === 0) return existing;
  fields.push("updated_at = NOW()");
  values.push(tenantId, id);
  await query(
    `UPDATE reorder_notification_rules
        SET ${fields.join(", ")}
      WHERE tenant_id = ? AND id = ?`,
    values
  );

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "reorder_notification_rule.updated",
    entityType: "reorder_notification_rule",
    entityId: id,
    staffId: input.staffId || null,
    staffName: input.staffName || null,
    source: "inventory",
    details: changes,
  });

  return getReorderNotificationRule(tenantId, id);
}

export async function runReorderNotificationRule(
  tenantId: string,
  id: string,
  input: ReorderActor = {}
) {
  const rule = await getReorderNotificationRule(tenantId, id);
  if (!rule) throw new Error("Reorder notification rule not found");
  if (rule.status !== "active") throw new Error("Inactive reorder notification rules cannot be run");

  const result = await refreshReorderRecommendations(tenantId, {
    daysOfCover: rule.daysOfCover,
    vendorId: rule.vendorId || null,
    locationId: rule.locationId || null,
    sourceRuleId: rule.id,
    sourceRuleName: rule.name,
    triggerType: rule.triggerType,
    priority: rule.priority,
    staffId: input.staffId || null,
    staffName: input.staffName || null,
  });
  const runResult = {
    locationId: rule.locationId || null,
    triggerType: rule.triggerType,
    priority: rule.priority,
    daysOfCover: rule.daysOfCover,
    vendorId: rule.vendorId || null,
    created: result.created,
    updated: result.updated,
    skippedApproved: result.skippedApproved,
    recommendationCount: result.recommendations.filter((item) => !rule.locationId || item.locationId === rule.locationId).length,
  };

  await query(
    `UPDATE reorder_notification_rules
        SET last_run_at = NOW(),
            last_result = ?,
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ?`,
    [json(runResult, {}), tenantId, id]
  );

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "reorder_notification_rule.ran",
    entityType: "reorder_notification_rule",
    entityId: id,
    staffId: input.staffId || null,
    staffName: input.staffName || null,
    source: "inventory",
    details: runResult,
  });

  return {
    rule: await getReorderNotificationRule(tenantId, id),
    result: {
      ...result,
      ruleRun: runResult,
    },
  };
}

export async function getReorderRecommendation(tenantId: string, id: string) {
  const rows = await query<any>(
    `SELECT *
     FROM reorder_recommendations
     WHERE tenant_id = ? AND id = ?
     LIMIT 1`,
    [tenantId, id]
  );
  return rows[0] ? serializeRecommendation(rows[0]) : null;
}

export async function approveReorderRecommendation(tenantId: string, id: string, input: ApprovalInput = {}) {
  const recommendation = await getReorderRecommendation(tenantId, id);
  if (!recommendation) throw new Error("Reorder recommendation not found");
  if (recommendation.status === "ordered" && recommendation.purchaseOrderId) {
    return { recommendation, purchaseOrder: null, alreadyOrdered: true };
  }
  if (recommendation.status === "dismissed") throw new Error("Dismissed reorder recommendations cannot be approved");

  const quantity = Math.max(1, Math.ceil(toNumber(input.quantity, recommendation.recommendedQuantity)));
  const expectedPrice = Math.max(0, toNumber(input.expectedPrice, recommendation.estimatedUnitCost));
  const totalAmount = Number((quantity * expectedPrice).toFixed(2));
  const purchaseOrder = await createPurchaseOrder(tenantId, {
    vendorId: input.vendorId || recommendation.vendorId || null,
    status: "draft",
    type: "once_off",
    items: [{
      productId: recommendation.productId,
      productName: recommendation.productName,
      locationId: recommendation.locationId || DEFAULT_INVENTORY_LOCATION_ID,
      quantity,
      expectedPrice,
      sourceRecommendationId: recommendation.id,
    }],
    totalAmount,
    expectedDeliveryDate: input.expectedDeliveryDate || null,
  } as any);

  await query(
    `UPDATE reorder_recommendations
        SET status = 'ordered',
            purchase_order_id = ?,
            vendor_id = COALESCE(?, vendor_id),
            recommended_quantity = ?,
            estimated_unit_cost = ?,
            estimated_total_cost = ?,
            approved_by = ?,
            approved_by_name = ?,
            approved_at = NOW(),
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ?`,
    [
      purchaseOrder.id,
      input.vendorId || null,
      quantity,
      expectedPrice,
      totalAmount,
      input.staffId || null,
      input.staffName || null,
      tenantId,
      id,
    ]
  );

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "reorder_recommendation.approved",
    entityType: "reorder_recommendation",
    entityId: id,
    staffId: input.staffId || null,
    staffName: input.staffName || null,
    source: "inventory",
    details: {
      purchaseOrderId: purchaseOrder.id,
      productId: recommendation.productId,
      productName: recommendation.productName,
      locationId: recommendation.locationId || DEFAULT_INVENTORY_LOCATION_ID,
      quantity,
      expectedPrice,
      note: input.note || null,
    },
  });

  return {
    recommendation: await getReorderRecommendation(tenantId, id),
    purchaseOrder,
    alreadyOrdered: false,
  };
}

export async function dismissReorderRecommendation(tenantId: string, id: string, input: ReorderActor & { note?: string | null } = {}) {
  const recommendation = await getReorderRecommendation(tenantId, id);
  if (!recommendation) throw new Error("Reorder recommendation not found");
  if (recommendation.status === "ordered") throw new Error("Ordered reorder recommendations cannot be dismissed");

  await query(
    `UPDATE reorder_recommendations
        SET status = 'dismissed',
            dismissed_at = NOW(),
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ?`,
    [tenantId, id]
  );

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "reorder_recommendation.dismissed",
    entityType: "reorder_recommendation",
    entityId: id,
    staffId: input.staffId || null,
    staffName: input.staffName || null,
    source: "inventory",
    details: {
      productId: recommendation.productId,
      productName: recommendation.productName,
      note: input.note || null,
    },
  });

  return getReorderRecommendation(tenantId, id);
}
