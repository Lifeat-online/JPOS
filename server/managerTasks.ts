import { getConnection, query } from "./db.js";
import { applyProductStockDelta, normalizeStockMovementReasonCode, recordAuditEvent } from "./audit.js";
import { processSaleRefund, processSaleVoid } from "./db-crud.js";
import { approveStockTakeSession } from "./stockTake.js";
import { approveReorderRecommendation, dismissReorderRecommendation } from "./reorderRecommendations.js";
import { recordManagerOverride } from "./managerOverrides.js";

type TaskPriority = "low" | "normal" | "high" | "critical";
type TaskStatus = "open" | "in_review" | "approved" | "declined" | "done" | "dismissed";
type TaskAction = "start" | "assign" | "approve" | "decline" | "complete" | "dismiss";
type TaskType =
  | "cash_variance"
  | "sale_exception"
  | "refund_request"
  | "void_request"
  | "stock_adjustment_request"
  | "low_stock"
  | "ai_recommendation"
  | "stock_variance"
  | "offline_sync";

type TaskDraft = {
  tenantId: string;
  taskType: TaskType;
  title: string;
  summary?: string | null;
  priority?: TaskPriority;
  sourceType?: string | null;
  sourceId?: string | null;
  relatedSaleId?: string | null;
  relatedProductId?: string | null;
  assignedTo?: string | null;
  requestedBy?: string | null;
  dueAt?: string | null;
  details?: unknown;
};

type DecisionInput = {
  action: TaskAction;
  note?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  assignedTo?: string | null;
};

type SaleApprovalRequestInput = {
  kind: "refund" | "void";
  saleId: string;
  payload: any;
  requestedBy?: string | null;
  requestedByName?: string | null;
};

type StockAdjustmentRequestInput = {
  productId: string;
  productName?: string | null;
  delta: number;
  reason: string;
  note?: string | null;
  requestedBy?: string | null;
  requestedByName?: string | null;
};

type StockAdjustmentActor = {
  staffId?: string | null;
  staffName?: string | null;
};

const ACTIVE_STATUSES = ["open", "in_review"];

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function money(value: unknown) {
  return `R${Math.abs(toNumber(value)).toFixed(2)}`;
}

function json(value: unknown, fallback: unknown = {}) {
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

function futureIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function rowToTask(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    taskType: row.taskType ?? row.task_type,
    title: row.title,
    summary: row.summary,
    priority: row.priority || "normal",
    status: row.status || "open",
    sourceType: row.sourceType ?? row.source_type,
    sourceId: row.sourceId ?? row.source_id,
    relatedSaleId: row.relatedSaleId ?? row.related_sale_id,
    relatedProductId: row.relatedProductId ?? row.related_product_id,
    assignedTo: row.assignedTo ?? row.assigned_to,
    requestedBy: row.requestedBy ?? row.requested_by,
    decidedBy: row.decidedBy ?? row.decided_by,
    decisionNote: row.decisionNote ?? row.decision_note,
    details: parseJson(row.details, {}),
    dueAt: row.dueAt ?? row.due_at,
    resolvedAt: row.resolvedAt ?? row.resolved_at,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

async function upsertTask(draft: TaskDraft) {
  const values = [
    makeId("task"),
    draft.tenantId,
    draft.taskType,
    draft.title,
    draft.summary || null,
    draft.priority || "normal",
    "open",
    draft.sourceType || null,
    draft.sourceId || null,
    draft.relatedSaleId || null,
    draft.relatedProductId || null,
    draft.assignedTo || null,
    draft.requestedBy || null,
    json(draft.details),
    draft.dueAt || null,
  ];

  await query(
    `INSERT INTO manager_tasks (
       id, tenant_id, task_type, title, summary, priority, status,
       source_type, source_id, related_sale_id, related_product_id,
       assigned_to, requested_by, details, due_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON CONFLICT (tenant_id, task_type, source_type, source_id)
     DO UPDATE SET
       title = CASE WHEN manager_tasks.status IN ('open','in_review') THEN EXCLUDED.title ELSE manager_tasks.title END,
       summary = CASE WHEN manager_tasks.status IN ('open','in_review') THEN EXCLUDED.summary ELSE manager_tasks.summary END,
       priority = CASE WHEN manager_tasks.status IN ('open','in_review') THEN EXCLUDED.priority ELSE manager_tasks.priority END,
       assigned_to = CASE WHEN manager_tasks.status IN ('open','in_review') THEN EXCLUDED.assigned_to ELSE manager_tasks.assigned_to END,
       details = CASE WHEN manager_tasks.status IN ('open','in_review') THEN EXCLUDED.details ELSE manager_tasks.details END,
       due_at = CASE WHEN manager_tasks.status IN ('open','in_review') THEN EXCLUDED.due_at ELSE manager_tasks.due_at END,
       updated_at = CASE WHEN manager_tasks.status IN ('open','in_review') THEN NOW() ELSE manager_tasks.updated_at END`,
    values
  );
}

export async function createManagerSaleApprovalRequest(tenantId: string, input: SaleApprovalRequestInput) {
  const taskId = makeId("task");
  const isRefund = input.kind === "refund";
  const amount = isRefund
    ? (input.payload?.items || []).reduce((sum: number, item: any) => sum + toNumber(item.quantity), 0)
    : 0;
  const title = isRefund
    ? `Approve refund for ${input.saleId}`
    : `Approve void for ${input.saleId}`;
  const summary = isRefund
    ? `${input.requestedByName || "A cashier"} requested a refund for ${amount || "selected"} item${amount === 1 ? "" : "s"}.`
    : `${input.requestedByName || "A cashier"} requested a void before payment completion.`;
  const details = {
    requestedAction: input.kind,
    saleId: input.saleId,
    requestedByName: input.requestedByName || null,
    requestedAt: new Date().toISOString(),
    reason: input.payload?.reason || null,
    payload: input.payload || {},
  };

  await query(
    `INSERT INTO manager_tasks (
       id, tenant_id, task_type, title, summary, priority, status,
       source_type, source_id, related_sale_id, requested_by, details,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'open', 'approval_request', ?, ?, ?, ?, NOW(), NOW())`,
    [
      taskId,
      tenantId,
      isRefund ? "refund_request" : "void_request",
      title,
      summary,
      "high",
      taskId,
      input.saleId,
      input.requestedBy || null,
      json(details),
    ]
  );

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: `manager_task.requested.${input.kind}`,
    entityType: "manager_task",
    entityId: taskId,
    relatedSaleId: input.saleId,
    staffId: input.requestedBy || null,
    staffName: input.requestedByName || null,
    source: "history",
    details,
  });

  return getTask(tenantId, taskId);
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function stockDirection(delta: number) {
  return delta > 0 ? "increase" : "decrease";
}

function validateStockAdjustmentInput(input: Pick<StockAdjustmentRequestInput, "productId" | "delta" | "reason">) {
  const productId = cleanText(input.productId);
  const delta = Number(input.delta);
  const reason = cleanText(input.reason);

  if (!productId) throw new Error("Product is required for a stock adjustment");
  if (!Number.isFinite(delta) || delta === 0) throw new Error("Stock adjustment quantity must be a non-zero number");
  if (reason.length < 3) throw new Error("A stock adjustment reason is required");

  return { productId, delta, reason };
}

export async function applyStockAdjustment(
  tenantId: string,
  input: Pick<StockAdjustmentRequestInput, "productId" | "delta" | "reason" | "note">,
  actor: StockAdjustmentActor = {},
  referenceId?: string | null
) {
  const { productId, delta, reason } = validateStockAdjustmentInput(input);
  const note = cleanText(input.note) || null;
  const conn = await getConnection();

  try {
    await conn.beginTransaction();
    const result = await applyProductStockDelta(conn, {
      tenantId,
      productId,
      quantityDelta: delta,
      reason: "manual_adjustment",
      reasonCode: normalizeStockMovementReasonCode(reason),
      referenceType: referenceId ? "manager_task" : "stock_adjustment",
      referenceId: referenceId || null,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      note: note ? `${reason}: ${note}` : reason,
    });

    if (!result) throw new Error("Product not found for stock adjustment");

    await recordAuditEvent(conn, {
      tenantId,
      action: "stock.adjusted",
      entityType: "product",
      entityId: productId,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      source: referenceId ? "manager_action_center" : "inventory",
      details: {
        delta,
        reason,
        note,
        referenceId: referenceId || null,
        previousQuantity: result.previousQuantity,
        newQuantity: result.newQuantity,
        appliedDelta: result.quantityDelta,
      },
    });

    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function createManagerStockAdjustmentRequest(tenantId: string, input: StockAdjustmentRequestInput) {
  const { productId, delta, reason } = validateStockAdjustmentInput(input);
  const taskId = makeId("task");
  const direction = stockDirection(delta);
  const productName = cleanText(input.productName) || "selected product";
  const note = cleanText(input.note) || null;
  const details = {
    requestedAction: "stock_adjustment",
    productId,
    productName,
    delta,
    reason,
    note,
    requestedByName: input.requestedByName || null,
    requestedAt: new Date().toISOString(),
    payload: {
      productId,
      delta,
      reason,
      note,
    },
  };

  await query(
    `INSERT INTO manager_tasks (
       id, tenant_id, task_type, title, summary, priority, status,
       source_type, source_id, related_product_id, requested_by, details,
       created_at, updated_at
     ) VALUES (?, ?, 'stock_adjustment_request', ?, ?, ?, 'open', 'approval_request', ?, ?, ?, ?, NOW(), NOW())`,
    [
      taskId,
      tenantId,
      `${direction === "increase" ? "Increase" : "Decrease"} stock for ${productName}`,
      `${input.requestedByName || "A staff member"} requested a ${direction} of ${Math.abs(delta)} unit${Math.abs(delta) === 1 ? "" : "s"}: ${reason}.`,
      Math.abs(delta) >= 10 ? "high" : "normal",
      taskId,
      productId,
      input.requestedBy || null,
      json(details),
    ]
  );

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "manager_task.requested.stock_adjustment",
    entityType: "manager_task",
    entityId: taskId,
    staffId: input.requestedBy || null,
    staffName: input.requestedByName || null,
    source: "inventory",
    details,
  });

  return getTask(tenantId, taskId);
}

export async function syncManagerTasksFromSignals(tenantId: string) {
  const [cashRows, saleRows, lowStockRows, reorderRecommendationRows, aiRows, stockTakeRows, offlineRows] = await Promise.all([
    query<any>(
      `SELECT
         id,
         staff_name AS staffName,
         expected_cash AS expectedCash,
         actual_cash AS actualCash,
         difference,
         review_status AS reviewStatus,
         status,
         updated_at AS updatedAt
       FROM cash_sessions
       WHERE tenant_id = ?
         AND status = 'closed'
         AND COALESCE(review_status, 'submitted') NOT IN ('reviewed','reconciled')
         AND (
           COALESCE(review_status, 'submitted') IN ('submitted','disputed')
           OR ABS(COALESCE(difference, 0)) > 0.009
         )
       ORDER BY updated_at DESC
       LIMIT 50`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         id,
         staff_id AS staffId,
         total,
         transaction_type AS transactionType,
         refund_status AS refundStatus,
         refunded_amount AS refundedAmount,
         refund_reason AS refundReason,
         void_reason AS voidReason,
         updated_at AS updatedAt,
         created_at AS createdAt
       FROM sales
       WHERE tenant_id = ?
         AND (
           transaction_type IN ('refund', 'void')
           OR refund_status <> 'none'
         )
       ORDER BY updated_at DESC
       LIMIT 50`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         id,
         name,
         category,
         section,
         stock,
         min_stock AS minStock
       FROM products
       WHERE tenant_id = ?
         AND COALESCE(stock, 0) <= GREATEST(1, COALESCE(min_stock, 0))
         AND NOT EXISTS (
           SELECT 1
             FROM reorder_recommendations rr
            WHERE rr.tenant_id = products.tenant_id
              AND rr.product_id = products.id
              AND rr.status IN ('open','in_review','approved')
         )
       ORDER BY COALESCE(stock, 0) ASC, name ASC
       LIMIT 50`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         id,
         product_id AS productId,
         product_name AS productName,
         status,
         priority,
         current_stock AS currentStock,
         min_stock AS minStock,
         target_stock AS targetStock,
         recommended_quantity AS recommendedQuantity,
         estimated_total_cost AS estimatedTotalCost,
         avg_daily_sales AS avgDailySales,
         evidence,
         updated_at AS updatedAt
       FROM reorder_recommendations
       WHERE tenant_id = ?
         AND status IN ('open','in_review')
       ORDER BY
         CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
         updated_at DESC
       LIMIT 50`,
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
         confidence
       FROM ai_insights
       WHERE tenant_id = ?
         AND status = 'open'
         AND severity IN ('critical', 'warning')
       ORDER BY created_at DESC
       LIMIT 50`,
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
         SUM(CASE WHEN i.variance_quantity IS NOT NULL THEN i.variance_quantity ELSE 0 END) AS netVariance,
         MAX(ABS(COALESCE(i.variance_quantity, 0))) AS largestVariance
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
       LIMIT 50`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         id,
         action,
         entity_type AS entityType,
         entity_id AS entityId,
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
       LIMIT 50`,
      [tenantId]
    ),
  ]);

  const drafts: TaskDraft[] = [];

  for (const session of cashRows) {
    const variance = toNumber(session.difference);
    drafts.push({
      tenantId,
      taskType: "cash_variance",
      title: `Review cash-up for ${session.staffName || "register"}`,
      summary: `${money(variance)} variance needs manager review before reconciliation.`,
      priority: Math.abs(variance) >= 100 ? "critical" : Math.abs(variance) > 0 ? "high" : "normal",
      sourceType: "cash_session",
      sourceId: session.id,
      details: {
        expectedCash: toNumber(session.expectedCash),
        actualCash: toNumber(session.actualCash),
        difference: variance,
        reviewStatus: session.reviewStatus,
      },
    });
  }

  for (const sale of saleRows) {
    const type = sale.transactionType === "void" ? "void" : "refund";
    const amount = Math.abs(toNumber(sale.refundedAmount || sale.total));
    drafts.push({
      tenantId,
      taskType: "sale_exception",
      title: `Review ${type} ${sale.id}`,
      summary: `${type === "void" ? "Voided sale" : "Refund"} for ${money(amount)}${sale.refundReason || sale.voidReason ? `: ${sale.refundReason || sale.voidReason}` : " with no reason captured"}.`,
      priority: amount >= 500 || !(sale.refundReason || sale.voidReason) ? "high" : "normal",
      sourceType: "sale",
      sourceId: sale.id,
      relatedSaleId: sale.id,
      requestedBy: sale.staffId || null,
      details: {
        transactionType: sale.transactionType,
        refundStatus: sale.refundStatus,
        total: toNumber(sale.total),
        refundedAmount: toNumber(sale.refundedAmount),
        reason: sale.refundReason || sale.voidReason || null,
      },
    });
  }

  for (const product of lowStockRows) {
    const stock = toNumber(product.stock);
    drafts.push({
      tenantId,
      taskType: "low_stock",
      title: `Restock ${product.name}`,
      summary: `${product.name} has ${stock} left against minimum ${toNumber(product.minStock)}.`,
      priority: stock <= 0 ? "critical" : "high",
      sourceType: "product",
      sourceId: product.id,
      relatedProductId: product.id,
      details: {
        stock,
        minStock: toNumber(product.minStock),
        category: product.category,
        section: product.section,
      },
    });
  }

  for (const recommendation of reorderRecommendationRows) {
    const quantity = toNumber(recommendation.recommendedQuantity);
    const currentStock = toNumber(recommendation.currentStock);
    const minStock = toNumber(recommendation.minStock);
    drafts.push({
      tenantId,
      taskType: "low_stock",
      title: `Approve reorder for ${recommendation.productName}`,
      summary: `Suggested order ${quantity} unit${quantity === 1 ? "" : "s"} to reach target stock ${toNumber(recommendation.targetStock)}. Current ${currentStock}, minimum ${minStock}.`,
      priority: recommendation.priority || (currentStock <= 0 ? "critical" : "high"),
      sourceType: "reorder_recommendation",
      sourceId: recommendation.id,
      relatedProductId: recommendation.productId,
      details: {
        recommendationId: recommendation.id,
        productId: recommendation.productId,
        productName: recommendation.productName,
        currentStock,
        minStock,
        targetStock: toNumber(recommendation.targetStock),
        recommendedQuantity: quantity,
        estimatedTotalCost: toNumber(recommendation.estimatedTotalCost),
        avgDailySales: toNumber(recommendation.avgDailySales),
        evidence: parseJson(recommendation.evidence, []),
        requiredAction: "approve_reorder_purchase_order",
      },
    });
  }

  for (const insight of aiRows) {
    drafts.push({
      tenantId,
      taskType: "ai_recommendation",
      title: insight.title,
      summary: insight.recommendation || insight.summary,
      priority: insight.severity === "critical" ? "critical" : "high",
      sourceType: "ai_insight",
      sourceId: insight.id,
      dueAt: futureIso(insight.severity === "critical" ? 1 : 3),
      details: {
        category: insight.category,
        severity: insight.severity,
        summary: insight.summary,
        recommendation: insight.recommendation,
        confidence: toNumber(insight.confidence),
        requiredAction: "manager_approval",
        approvalFirst: true,
        forbiddenAutoActions: [
          "auto_discount",
          "auto_order",
          "stock_change",
          "permission_change",
          "settings_change",
        ],
      },
    });
  }

  for (const session of stockTakeRows) {
    const varianceCount = toNumber(session.varianceCount);
    const netVariance = toNumber(session.netVariance);
    const isOverdue = session.status === "active";
    drafts.push({
      tenantId,
      taskType: "stock_variance",
      title: isOverdue
        ? `Finish overdue stocktake: ${session.name}`
        : `Approve stocktake variance: ${session.name}`,
      summary: isOverdue
        ? `${session.type || "Stocktake"} was due before today and still needs counts submitted.`
        : `${varianceCount} product${varianceCount === 1 ? "" : "s"} counted with variance. Net movement ${netVariance > 0 ? "+" : ""}${netVariance}.`,
      priority: isOverdue || Math.abs(netVariance) >= 10 || varianceCount >= 5 ? "high" : "normal",
      sourceType: "stock_take_session",
      sourceId: session.id,
      details: {
        name: session.name,
        type: session.type,
        status: session.status,
        dueAt: session.dueAt,
        itemCount: toNumber(session.itemCount),
        countedCount: toNumber(session.countedCount),
        varianceCount,
        netVariance,
        largestVariance: toNumber(session.largestVariance),
        requiredAction: isOverdue ? "complete_counts" : "manager_approval",
      },
    });
  }

  for (const event of offlineRows) {
    const action = String(event.action || "");
    const priority = action.includes("conflict") ? "critical" : "high";
    drafts.push({
      tenantId,
      taskType: "offline_sync",
      title: action.includes("conflict") ? "Resolve offline sync conflict" : "Review failed offline sync",
      summary: `${action || "Sync issue"}${event.entityType || event.entityId ? ` on ${event.entityType || "record"} ${event.entityId || ""}` : ""}.`,
      priority,
      sourceType: "audit_event",
      sourceId: event.id,
      details: {
        action,
        entityType: event.entityType,
        entityId: event.entityId,
        source: event.source,
        details: parseJson(event.details, {}),
        createdAt: event.createdAt,
      },
    });
  }

  for (const draft of drafts) {
    await upsertTask(draft);
  }

  return { synced: drafts.length };
}

export async function getManagerTaskQueue(tenantId: string) {
  await syncManagerTasksFromSignals(tenantId);
  const rows = await query<any>(
    `SELECT
       id,
       tenant_id AS tenantId,
       task_type AS taskType,
       title,
       summary,
       priority,
       status,
       source_type AS sourceType,
       source_id AS sourceId,
       related_sale_id AS relatedSaleId,
       related_product_id AS relatedProductId,
       assigned_to AS assignedTo,
       requested_by AS requestedBy,
       decided_by AS decidedBy,
       decision_note AS decisionNote,
       details,
       due_at AS dueAt,
       resolved_at AS resolvedAt,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM manager_tasks
     WHERE tenant_id = ?
       AND status IN ('open','in_review')
     ORDER BY
       CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       updated_at DESC
     LIMIT 75`,
    [tenantId]
  );
  const tasks = rows.map(rowToTask);
  return {
    tasks,
    counts: {
      open: tasks.filter((task) => task.status === "open").length,
      inReview: tasks.filter((task) => task.status === "in_review").length,
      critical: tasks.filter((task) => task.priority === "critical").length,
      high: tasks.filter((task) => task.priority === "high").length,
      total: tasks.length,
    },
  };
}

async function getTask(tenantId: string, taskId: string) {
  const rows = await query<any>(
    `SELECT
       id,
       tenant_id AS tenantId,
       task_type AS taskType,
       title,
       summary,
       priority,
       status,
       source_type AS sourceType,
       source_id AS sourceId,
       related_sale_id AS relatedSaleId,
       related_product_id AS relatedProductId,
       assigned_to AS assignedTo,
       requested_by AS requestedBy,
       decided_by AS decidedBy,
       decision_note AS decisionNote,
       details,
       due_at AS dueAt,
       resolved_at AS resolvedAt,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM manager_tasks
     WHERE tenant_id = ? AND id = ?
     LIMIT 1`,
    [tenantId, taskId]
  );
  return rows[0] ? rowToTask(rows[0]) : null;
}

function statusForAction(action: TaskAction): TaskStatus {
  if (action === "start" || action === "assign") return "in_review";
  if (action === "approve") return "approved";
  if (action === "decline") return "declined";
  if (action === "complete") return "done";
  return "dismissed";
}

async function applySourceDecision(tenantId: string, task: any, status: TaskStatus, input: DecisionInput) {
  if (task.sourceType === "reorder_recommendation" && task.taskType === "low_stock") {
    if (status === "approved" || status === "done") {
      return approveReorderRecommendation(tenantId, task.sourceId, {
        note: input.note || null,
        staffId: input.staffId || null,
        staffName: input.staffName || null,
      });
    }
    if (status === "declined" || status === "dismissed") {
      return dismissReorderRecommendation(tenantId, task.sourceId, {
        note: input.note || null,
        staffId: input.staffId || null,
        staffName: input.staffName || null,
      });
    }
  }

  if (task.sourceType === "approval_request" && status === "approved") {
    const details = task.details || {};
    const payload = details.payload || {};

    if (task.taskType === "stock_adjustment_request" || details.requestedAction === "stock_adjustment") {
      const productId = task.relatedProductId || payload.productId || details.productId;
      return applyStockAdjustment(
        tenantId,
        {
          productId,
          delta: toNumber(payload.delta ?? details.delta),
          reason: payload.reason || details.reason,
          note: payload.note || details.note || null,
        },
        {
          staffId: input.staffId || null,
          staffName: input.staffName || null,
        },
        task.id
      );
    }

    const saleId = task.relatedSaleId || details.saleId;
    if (!saleId) throw new Error("Approval request is missing the sale reference");

    if (task.taskType === "refund_request" || details.requestedAction === "refund") {
      return processSaleRefund(tenantId, saleId, {
        ...payload,
        staffId: input.staffId || null,
        staffName: input.staffName || null,
      });
    }

    if (task.taskType === "void_request" || details.requestedAction === "void") {
      return processSaleVoid(tenantId, saleId, {
        ...payload,
        staffId: input.staffId || null,
        staffName: input.staffName || null,
      });
    }
  }

  if (task.sourceType === "cash_session") {
    const reviewStatus = status === "declined"
      ? "disputed"
      : status === "done"
        ? "reconciled"
        : status === "approved"
          ? "reviewed"
          : null;
    if (reviewStatus) {
      await query(
        `UPDATE cash_sessions
            SET review_status = ?,
                reviewed_at = NOW(),
                reviewed_by = ?,
                manager_notes = ?,
                updated_at = NOW()
          WHERE tenant_id = ? AND id = ?`,
        [reviewStatus, input.staffId || null, input.note || null, tenantId, task.sourceId]
      );
    }
  }

  if (task.sourceType === "ai_insight" && ["approved", "declined", "done", "dismissed"].includes(status)) {
    const insightStatus = status === "approved" || status === "done" ? "done" : "dismissed";
    await query(
      `UPDATE ai_insights SET status = ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
      [insightStatus, tenantId, task.sourceId]
    );
  }

  if (task.sourceType === "stock_take_session" && task.taskType === "stock_variance" && (status === "approved" || status === "done")) {
    return approveStockTakeSession(tenantId, task.sourceId, {
      staffId: input.staffId || null,
      staffName: input.staffName || null,
      role: "manager",
    });
  }

  return null;
}

export async function decideManagerTask(tenantId: string, taskId: string, input: DecisionInput) {
  const action = input.action;
  if (!["start", "assign", "approve", "decline", "complete", "dismiss"].includes(action)) {
    throw new Error("Invalid manager task action");
  }
  const status = statusForAction(action);
  const note = String(input.note || "").trim();
  if (["approve", "decline", "complete", "dismiss"].includes(action) && !note) {
    throw new Error("A manager override reason is required for this decision");
  }

  const task = await getTask(tenantId, taskId);
  if (!task) throw new Error("Manager task not found");
  if (!ACTIVE_STATUSES.includes(task.status) && action !== "dismiss") {
    throw new Error("This manager task is already resolved");
  }

  const terminal = ["approved", "declined", "done", "dismissed"].includes(status);
  const sourceResult = await applySourceDecision(tenantId, task, status, input);

  const override = terminal
    ? await recordManagerOverride(tenantId, {
        overrideType: "manager_task",
        targetType: "manager_task",
        targetId: task.id,
        action,
        status,
        reason: note,
        requestedBy: task.requestedBy || null,
        approvedBy: input.staffId || null,
        approvedByName: input.staffName || null,
        relatedSaleId: task.relatedSaleId || null,
        relatedProductId: task.relatedProductId || null,
        source: "manager_action_center",
        details: {
          taskType: task.taskType,
          sourceType: task.sourceType,
          sourceId: task.sourceId,
          previousStatus: task.status,
          nextStatus: status,
        },
      })
    : null;

  await query(
    `UPDATE manager_tasks
        SET status = ?,
            assigned_to = COALESCE(?, assigned_to),
            decided_by = ?,
            decision_note = ?,
            resolved_at = ${terminal ? "NOW()" : "resolved_at"},
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ?`,
    [
      status,
      input.assignedTo || (action === "assign" || action === "start" ? input.staffId || null : null),
      terminal ? input.staffId || null : null,
      terminal ? note || null : task.decisionNote || null,
      tenantId,
      taskId,
    ]
  );

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: `manager_task.${status}`,
    entityType: "manager_task",
    entityId: task.id,
    relatedSaleId: task.relatedSaleId || null,
    staffId: input.staffId || null,
    staffName: input.staffName || null,
    source: "manager_action_center",
    details: {
      taskType: task.taskType,
      sourceType: task.sourceType,
      sourceId: task.sourceId,
      note: note || null,
      previousStatus: task.status,
      nextStatus: status,
    },
  });

  const updated = await getTask(tenantId, taskId);
  return {
    ...updated,
    sourceResult: sourceResult || null,
    managerOverride: override,
  };
}
