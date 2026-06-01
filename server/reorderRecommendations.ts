import { query } from "./db.js";
import { recordAuditEvent } from "./audit.js";
import { createPurchaseOrder } from "./mariadb-crud.js";

type ReorderStatus = "open" | "in_review" | "approved" | "ordered" | "dismissed";
type ReorderPriority = "low" | "normal" | "high" | "critical";

type ReorderActor = {
  staffId?: string | null;
  staffName?: string | null;
};

type RefreshOptions = ReorderActor & {
  daysOfCover?: number | string | null;
  vendorId?: string | null;
};

type ApprovalInput = ReorderActor & {
  note?: string | null;
  vendorId?: string | null;
  quantity?: number | string | null;
  expectedPrice?: number | string | null;
  expectedDeliveryDate?: string | null;
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

function priorityFor(stock: number, minStock: number): ReorderPriority {
  if (stock <= 0) return "critical";
  if (stock <= Math.max(1, minStock * 0.5)) return "high";
  return "normal";
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
       AND s.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
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
  const [products, activeRows, velocity] = await Promise.all([
    query<any>(
      `SELECT
         id,
         name,
         category,
         section,
         stock,
         min_stock AS minStock,
         cost_price AS costPrice,
         price,
         updated_at AS updatedAt
       FROM products
       WHERE tenant_id = ?
         AND COALESCE(stock, 0) <= GREATEST(1, COALESCE(min_stock, 0))
       ORDER BY COALESCE(stock, 0) ASC, name ASC
       LIMIT 200`,
      [tenantId]
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

  const activeByProduct = new Map(activeRows.map((row: any) => [String(row.product_id ?? row.productId), row]));
  let created = 0;
  let updated = 0;
  let skippedApproved = 0;

  for (const product of products || []) {
    const productId = String(product.id || "");
    if (!productId) continue;
    const existing = activeByProduct.get(productId);
    if (existing?.status === "approved") {
      skippedApproved += 1;
      continue;
    }

    const stock = toNumber(product.stock);
    const minStock = Math.max(1, toNumber(product.minStock, 1));
    const movement = velocity.get(productId) || velocity.get(String(product.name || ""));
    const avgDaily = movement?.avgDaily || 0;
    const targetStock = Math.max(minStock * 2, Math.ceil(avgDaily * daysOfCover + minStock));
    const recommendedQuantity = Math.max(1, Math.ceil(targetStock - stock));
    const estimatedUnitCost = toNumber(product.costPrice, toNumber(product.price));
    const estimatedTotalCost = Number((recommendedQuantity * estimatedUnitCost).toFixed(2));
    const priority = priorityFor(stock, minStock);
    const evidence = [
      `Current stock ${stock} against minimum ${minStock}`,
      `Target stock ${targetStock} using ${daysOfCover} days of cover`,
      movement?.quantitySold ? `Sold ${movement.quantitySold} in the last 90 days` : "No recent sales velocity found",
      product.category ? `Category: ${product.category}` : null,
      product.section ? `Section: ${product.section}` : null,
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
         vendor_id, source, evidence, requested_by, requested_by_name,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'min_stock', ?, ?, ?, NOW(), NOW())`,
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
