import { getConnection, query } from "./db.js";
import { applyProductStockDelta, recordAuditEvent } from "./audit.js";

type StockTakeType = "full" | "cycle" | "spot_check";
type StockTakeStatus = "draft" | "active" | "submitted" | "approved" | "cancelled";

type Actor = {
  staffId?: string | null;
  staffName?: string | null;
  role?: string | null;
};

type StockTakeAssignment = {
  productId: string;
  assignedTo?: string | null;
  assignedToName?: string | null;
};

type CreateStockTakeInput = {
  name?: string | null;
  type?: StockTakeType | string | null;
  dueAt?: string | null;
  notes?: string | null;
  assignments?: StockTakeAssignment[];
};

type CountInput = {
  countedQuantity: number;
  note?: string | null;
};

type RecountInput = {
  note?: string | null;
};

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

function nullableNumber(...values: unknown[]) {
  const value = values.find((item) => item !== undefined);
  return value === null || value === undefined ? null : toNumber(value);
}

function cleanString(value: unknown, max = 255) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function normalizeType(value: unknown): StockTakeType {
  const type = String(value || "cycle").trim();
  return type === "full" || type === "spot_check" ? type : "cycle";
}

function canOverrideStockTake(actor: Actor) {
  const role = String(actor.role || "").toLowerCase();
  return role === "admin" || role === "manager" || role === "dev";
}

function rowToItem(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    sessionId: row.sessionId ?? row.session_id,
    productId: row.productId ?? row.product_id,
    productName: row.productName ?? row.product_name,
    barcode: row.barcode,
    expectedQuantity: toNumber(row.expectedQuantity ?? row.expected_quantity),
    countedQuantity: nullableNumber(row.countedQuantity, row.counted_quantity),
    varianceQuantity: nullableNumber(row.varianceQuantity, row.variance_quantity),
    assignedTo: row.assignedTo ?? row.assigned_to,
    assignedToName: row.assignedToName ?? row.assigned_to_name,
    countedBy: row.countedBy ?? row.counted_by,
    countedByName: row.countedByName ?? row.counted_by_name,
    status: row.status || "assigned",
    countedAt: row.countedAt ?? row.counted_at,
    confirmedAt: row.confirmedAt ?? row.confirmed_at,
    confirmedBy: row.confirmedBy ?? row.confirmed_by,
    confirmedByName: row.confirmedByName ?? row.confirmed_by_name,
    note: row.note,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

function rowToSession(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    name: row.name,
    type: row.type || "cycle",
    status: row.status || "active",
    assignedBy: row.assignedBy ?? row.assigned_by,
    assignedByName: row.assignedByName ?? row.assigned_by_name,
    dueAt: row.dueAt ?? row.due_at,
    notes: row.notes,
    submittedAt: row.submittedAt ?? row.submitted_at,
    approvedAt: row.approvedAt ?? row.approved_at,
    approvedBy: row.approvedBy ?? row.approved_by,
    approvedByName: row.approvedByName ?? row.approved_by_name,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
    itemCount: toNumber(row.itemCount ?? row.item_count),
    countedCount: toNumber(row.countedCount ?? row.counted_count),
    varianceCount: toNumber(row.varianceCount ?? row.variance_count),
  };
}

async function getStaffNameMap(tenantId: string, staffIds: string[]) {
  const ids = [...new Set(staffIds.filter(Boolean))];
  if (!ids.length) return new Map<string, string>();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await query<any>(
    `SELECT id, name FROM staff WHERE tenant_id = ? AND id IN (${placeholders})`,
    [tenantId, ...ids]
  );
  return new Map(rows.map((row: any) => [String(row.id), String(row.name || row.id)]));
}

export async function createStockTakeSession(tenantId: string, input: CreateStockTakeInput, actor: Actor) {
  const type = normalizeType(input.type);
  const assignments: Array<{ productId: string; assignedTo: string | null; assignedToName: string | null }> = [];
  for (const assignment of input.assignments || []) {
    const productId = cleanString(assignment.productId, 64);
    if (!productId) continue;
    assignments.push({
      productId,
      assignedTo: cleanString(assignment.assignedTo, 64),
      assignedToName: cleanString(assignment.assignedToName, 255),
    });
  }

  const uniqueAssignments = Array.from(new Map(assignments.map((assignment) => [assignment.productId, assignment])).values());
  if (!uniqueAssignments.length) {
    throw new Error("Choose at least one product to count.");
  }

  const productIds = uniqueAssignments.map((assignment) => assignment.productId);
  const productPlaceholders = productIds.map(() => "?").join(",");
  const products = await query<any>(
    `SELECT id, name, barcode, stock
       FROM products
      WHERE tenant_id = ? AND id IN (${productPlaceholders})`,
    [tenantId, ...productIds]
  );
  const productMap = new Map(products.map((product: any) => [String(product.id), product]));
  const missingProduct = productIds.find((productId) => !productMap.has(productId));
  if (missingProduct) {
    throw new Error(`Product not found for stocktake: ${missingProduct}`);
  }

  const staffNameMap = await getStaffNameMap(tenantId, uniqueAssignments.map((assignment) => assignment.assignedTo || ""));
  const sessionId = makeId(type === "spot_check" ? "spot" : "stkt");
  const defaultName = type === "spot_check"
    ? "Spot check"
    : type === "full"
      ? "Full stocktake"
      : "Cycle count";
  const name = cleanString(input.name, 255) || `${defaultName} ${new Date().toLocaleDateString("en-ZA")}`;
  const dueAt = cleanString(input.dueAt, 64);
  const notes = cleanString(input.notes, 2000);
  const conn = await getConnection();

  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO stock_take_sessions (
         id, tenant_id, name, type, status, assigned_by, assigned_by_name,
         due_at, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, NOW(), NOW())`,
      [
        sessionId,
        tenantId,
        name,
        type,
        actor.staffId || null,
        actor.staffName || null,
        dueAt,
        notes,
      ]
    );

    for (const assignment of uniqueAssignments) {
      const product = productMap.get(assignment.productId)!;
      const assignedToName = assignment.assignedToName || (assignment.assignedTo ? staffNameMap.get(assignment.assignedTo) : null) || null;
      await conn.query(
        `INSERT INTO stock_take_items (
           id, tenant_id, session_id, product_id, product_name, barcode,
           expected_quantity, assigned_to, assigned_to_name, status,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', NOW(), NOW())`,
        [
          makeId("stki"),
          tenantId,
          sessionId,
          product.id,
          product.name,
          product.barcode || null,
          toNumber(product.stock),
          assignment.assignedTo || null,
          assignedToName,
        ]
      );
    }

    await recordAuditEvent(conn, {
      tenantId,
      action: "stocktake.created",
      entityType: "stock_take_session",
      entityId: sessionId,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      source: type === "spot_check" ? "action_center" : "inventory",
      details: {
        name,
        type,
        dueAt,
        itemCount: uniqueAssignments.length,
      },
    });

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return getStockTakeSession(tenantId, sessionId);
}

export async function getStockTakeSessions(tenantId: string, filters: { status?: string; type?: string } = {}) {
  const where = ["s.tenant_id = ?"];
  const params: any[] = [tenantId];
  if (filters.status) {
    where.push("s.status = ?");
    params.push(filters.status);
  }
  if (filters.type) {
    where.push("s.type = ?");
    params.push(filters.type);
  }

  const rows = await query<any>(
    `SELECT s.id,
            s.tenant_id AS tenantId,
            s.name,
            s.type,
            s.status,
            s.assigned_by AS assignedBy,
            s.assigned_by_name AS assignedByName,
            s.due_at AS dueAt,
            s.notes,
            s.submitted_at AS submittedAt,
            s.approved_at AS approvedAt,
            s.approved_by AS approvedBy,
            s.approved_by_name AS approvedByName,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt,
            COUNT(i.id) AS itemCount,
            SUM(CASE WHEN i.status IN ('counted','confirmed') THEN 1 ELSE 0 END) AS countedCount,
            SUM(CASE WHEN i.variance_quantity IS NOT NULL AND ABS(i.variance_quantity) > 0.0001 THEN 1 ELSE 0 END) AS varianceCount
       FROM stock_take_sessions s
       LEFT JOIN stock_take_items i ON i.session_id = s.id AND i.tenant_id = s.tenant_id
      WHERE ${where.join(" AND ")}
      GROUP BY s.id, s.tenant_id, s.name, s.type, s.status, s.assigned_by, s.assigned_by_name,
               s.due_at, s.notes, s.submitted_at, s.approved_at, s.approved_by, s.approved_by_name,
               s.created_at, s.updated_at
      ORDER BY s.updated_at DESC
      LIMIT 50`,
    params
  );
  return rows.map(rowToSession);
}

export async function getStockTakeSession(tenantId: string, sessionId: string) {
  const sessions = await query<any>(
    `SELECT s.id,
            s.tenant_id AS tenantId,
            s.name,
            s.type,
            s.status,
            s.assigned_by AS assignedBy,
            s.assigned_by_name AS assignedByName,
            s.due_at AS dueAt,
            s.notes,
            s.submitted_at AS submittedAt,
            s.approved_at AS approvedAt,
            s.approved_by AS approvedBy,
            s.approved_by_name AS approvedByName,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt,
            COUNT(i.id) AS itemCount,
            SUM(CASE WHEN i.status IN ('counted','confirmed') THEN 1 ELSE 0 END) AS countedCount,
            SUM(CASE WHEN i.variance_quantity IS NOT NULL AND ABS(i.variance_quantity) > 0.0001 THEN 1 ELSE 0 END) AS varianceCount
       FROM stock_take_sessions s
       LEFT JOIN stock_take_items i ON i.session_id = s.id AND i.tenant_id = s.tenant_id
      WHERE s.tenant_id = ? AND s.id = ?
      GROUP BY s.id, s.tenant_id, s.name, s.type, s.status, s.assigned_by, s.assigned_by_name,
               s.due_at, s.notes, s.submitted_at, s.approved_at, s.approved_by, s.approved_by_name,
               s.created_at, s.updated_at
      LIMIT 1`,
    [tenantId, sessionId]
  );
  const session = sessions[0];
  if (!session) return null;

  const items = await query<any>(
    `SELECT id,
            tenant_id AS tenantId,
            session_id AS sessionId,
            product_id AS productId,
            product_name AS productName,
            barcode,
            expected_quantity AS expectedQuantity,
            counted_quantity AS countedQuantity,
            variance_quantity AS varianceQuantity,
            assigned_to AS assignedTo,
            assigned_to_name AS assignedToName,
            counted_by AS countedBy,
            counted_by_name AS countedByName,
            status,
            counted_at AS countedAt,
            confirmed_at AS confirmedAt,
            confirmed_by AS confirmedBy,
            confirmed_by_name AS confirmedByName,
            note,
            created_at AS createdAt,
            updated_at AS updatedAt
       FROM stock_take_items
      WHERE tenant_id = ? AND session_id = ?
      ORDER BY status = 'recount' DESC, product_name ASC`,
    [tenantId, sessionId]
  );

  return {
    ...rowToSession(session),
    items: items.map(rowToItem),
  };
}

export async function getMyStockTakeAssignments(tenantId: string, staffId: string) {
  const id = cleanString(staffId, 64);
  if (!id) throw new Error("Staff identity is required to load stocktake assignments.");
  const rows = await query<any>(
    `SELECT i.id,
            i.tenant_id AS tenantId,
            i.session_id AS sessionId,
            i.product_id AS productId,
            i.product_name AS productName,
            i.barcode,
            i.expected_quantity AS expectedQuantity,
            i.counted_quantity AS countedQuantity,
            i.variance_quantity AS varianceQuantity,
            i.assigned_to AS assignedTo,
            i.assigned_to_name AS assignedToName,
            i.counted_by AS countedBy,
            i.counted_by_name AS countedByName,
            i.status,
            i.counted_at AS countedAt,
            i.confirmed_at AS confirmedAt,
            i.confirmed_by AS confirmedBy,
            i.confirmed_by_name AS confirmedByName,
            i.note,
            i.created_at AS createdAt,
            i.updated_at AS updatedAt,
            s.name AS sessionName,
            s.type AS sessionType,
            s.due_at AS dueAt
       FROM stock_take_items i
       JOIN stock_take_sessions s ON s.id = i.session_id AND s.tenant_id = i.tenant_id
      WHERE i.tenant_id = ?
        AND i.assigned_to = ?
        AND s.status IN ('active','submitted')
        AND i.status IN ('assigned','counted','recount')
      ORDER BY s.due_at IS NULL ASC, s.due_at ASC, i.status = 'recount' DESC, i.product_name ASC`,
    [tenantId, id]
  );
  return rows.map((row) => ({
    ...rowToItem(row),
    sessionName: row.sessionName ?? row.session_name,
    sessionType: row.sessionType ?? row.session_type,
    dueAt: row.dueAt ?? row.due_at,
  }));
}

export async function submitStockTakeCount(tenantId: string, itemId: string, input: CountInput, actor: Actor) {
  const countedQuantity = toNumber(input.countedQuantity);
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
    throw new Error("Counted quantity must be zero or more.");
  }

  const rows = await query<any>(
    `SELECT i.id,
            i.tenant_id AS tenantId,
            i.session_id AS sessionId,
            i.product_id AS productId,
            i.product_name AS productName,
            i.expected_quantity AS expectedQuantity,
            i.assigned_to AS assignedTo,
            i.assigned_to_name AS assignedToName,
            i.status,
            s.status AS sessionStatus
       FROM stock_take_items i
       JOIN stock_take_sessions s ON s.id = i.session_id AND s.tenant_id = i.tenant_id
      WHERE i.tenant_id = ? AND i.id = ?
      LIMIT 1`,
    [tenantId, itemId]
  );
  const item = rows[0];
  if (!item) throw new Error("Stocktake item not found.");
  if (!["active", "submitted"].includes(item.sessionStatus ?? item.session_status)) {
    throw new Error("This stocktake is not open for counts.");
  }

  const assignedTo = item.assignedTo ?? item.assigned_to;
  if (!canOverrideStockTake(actor) && (!actor.staffId || assignedTo !== actor.staffId)) {
    throw new Error("This count is assigned to another staff member.");
  }

  const expectedQuantity = toNumber(item.expectedQuantity ?? item.expected_quantity);
  const varianceQuantity = Number((countedQuantity - expectedQuantity).toFixed(3));
  const note = cleanString(input.note, 1000);
  const sessionId = item.sessionId ?? item.session_id;
  await query(
    `UPDATE stock_take_items
        SET counted_quantity = ?,
            variance_quantity = ?,
            counted_by = ?,
            counted_by_name = ?,
            status = 'counted',
            counted_at = NOW(),
            note = ?,
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ?`,
    [
      countedQuantity,
      varianceQuantity,
      actor.staffId || assignedTo || null,
      actor.staffName || item.assignedToName || item.assigned_to_name || null,
      note,
      tenantId,
      itemId,
    ]
  );

  const remaining = await query<any>(
    `SELECT COUNT(*) AS remaining
       FROM stock_take_items
      WHERE tenant_id = ? AND session_id = ? AND status IN ('assigned','recount')`,
    [tenantId, sessionId]
  );
  if (toNumber(remaining[0]?.remaining) === 0) {
    await query(
      `UPDATE stock_take_sessions
          SET status = 'submitted',
              submitted_at = COALESCE(submitted_at, NOW()),
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ? AND status = 'active'`,
      [tenantId, sessionId]
    );
  }

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "stocktake.item_counted",
    entityType: "stock_take_item",
    entityId: itemId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "mobile_stocktake",
    details: {
      sessionId,
      productId: item.productId ?? item.product_id,
      productName: item.productName ?? item.product_name,
      countedQuantity,
      expectedQuantity,
      varianceQuantity,
    },
  });

  return getStockTakeSession(tenantId, sessionId);
}

export async function requestStockTakeRecount(tenantId: string, itemId: string, input: RecountInput, actor: Actor) {
  const rows = await query<any>(
    `SELECT i.id,
            i.session_id AS sessionId,
            i.product_id AS productId,
            i.product_name AS productName
       FROM stock_take_items i
       JOIN stock_take_sessions s ON s.id = i.session_id AND s.tenant_id = i.tenant_id
      WHERE i.tenant_id = ? AND i.id = ? AND s.status IN ('active','submitted')
      LIMIT 1`,
    [tenantId, itemId]
  );
  const item = rows[0];
  if (!item) throw new Error("Stocktake item not found or not open.");

  await query(
    `UPDATE stock_take_items
        SET status = 'recount',
            note = ?,
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ?`,
    [cleanString(input.note, 1000), tenantId, itemId]
  );
  await query(
    `UPDATE stock_take_sessions
        SET status = 'active',
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ? AND status = 'submitted'`,
    [tenantId, item.sessionId ?? item.session_id]
  );

  await recordAuditEvent({ query } as any, {
    tenantId,
    action: "stocktake.recount_requested",
    entityType: "stock_take_item",
    entityId: itemId,
    staffId: actor.staffId || null,
    staffName: actor.staffName || null,
    source: "manager_action_center",
    details: {
      sessionId: item.sessionId ?? item.session_id,
      productId: item.productId ?? item.product_id,
      productName: item.productName ?? item.product_name,
      note: cleanString(input.note, 1000),
    },
  });

  return getStockTakeSession(tenantId, item.sessionId ?? item.session_id);
}

export async function approveStockTakeSession(tenantId: string, sessionId: string, actor: Actor) {
  const conn = await getConnection();
  const applied: any[] = [];

  try {
    await conn.beginTransaction();
    const [sessionRows] = await conn.query<any>(
      `SELECT id, name, type, status
         FROM stock_take_sessions
        WHERE tenant_id = ? AND id = ?
        LIMIT 1
        FOR UPDATE`,
      [tenantId, sessionId]
    );
    const session = sessionRows[0];
    if (!session) throw new Error("Stocktake session not found.");
    if (!["active", "submitted"].includes(session.status)) {
      throw new Error("Only active or submitted stocktakes can be approved.");
    }

    const [items] = await conn.query<any>(
      `SELECT id,
              product_id AS productId,
              product_name AS productName,
              expected_quantity AS expectedQuantity,
              counted_quantity AS countedQuantity,
              variance_quantity AS varianceQuantity,
              status
         FROM stock_take_items
        WHERE tenant_id = ? AND session_id = ?
        ORDER BY product_name ASC
        FOR UPDATE`,
      [tenantId, sessionId]
    );

    if (!items.length) throw new Error("This stocktake has no products.");
    const uncounted = items.filter((item: any) => !["counted", "confirmed"].includes(item.status));
    if (uncounted.length) {
      throw new Error("All assigned products must be counted or recounted before approval.");
    }

    for (const item of items) {
      const variance = toNumber(item.varianceQuantity ?? item.variance_quantity);
      if (Math.abs(variance) > 0.0001) {
        const result = await applyProductStockDelta(conn, {
          tenantId,
          productId: item.productId ?? item.product_id,
          itemName: item.productName ?? item.product_name,
          quantityDelta: variance,
          reason: "stock_take",
          referenceType: "stock_take_session",
          referenceId: sessionId,
          staffId: actor.staffId || null,
          staffName: actor.staffName || null,
          note: `Approved ${session.type === "spot_check" ? "spot check" : "stocktake"}: ${session.name}`,
        });
        if (result) {
          applied.push({
            itemId: item.id,
            productId: item.productId ?? item.product_id,
            productName: item.productName ?? item.product_name,
            ...result,
          });
        }
      }

      await conn.query(
        `UPDATE stock_take_items
            SET status = 'confirmed',
                confirmed_at = NOW(),
                confirmed_by = ?,
                confirmed_by_name = ?,
                updated_at = NOW()
          WHERE tenant_id = ? AND id = ?`,
        [actor.staffId || null, actor.staffName || null, tenantId, item.id]
      );
    }

    await conn.query(
      `UPDATE stock_take_sessions
          SET status = 'approved',
              approved_at = NOW(),
              approved_by = ?,
              approved_by_name = ?,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [actor.staffId || null, actor.staffName || null, tenantId, sessionId]
    );

    await recordAuditEvent(conn, {
      tenantId,
      action: "stocktake.approved",
      entityType: "stock_take_session",
      entityId: sessionId,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      source: "manager_action_center",
      details: {
        name: session.name,
        type: session.type,
        itemCount: items.length,
        adjustedItemCount: applied.length,
        totalVariance: Number(applied.reduce((sum, item) => sum + toNumber(item.quantityDelta), 0).toFixed(3)),
      },
    });

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const session = await getStockTakeSession(tenantId, sessionId);
  return {
    ...session,
    applied,
  };
}
