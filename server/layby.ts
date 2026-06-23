import { getConnection, query, type DbConnection } from "./db.js";
import { applyProductStockDelta, recordAuditEvent } from "./audit.js";
type Queryable = Pick<DbConnection, "query">;
type LaybyPaymentMethod = "cash" | "card" | "payfast" | "wallet" | "account";
type LaybyActor = {
    staffId?: string | null;
    staffName?: string | null;
};
type LaybyPaymentInput = LaybyActor & {
    method?: LaybyPaymentMethod | string | null;
    amount?: number | string | null;
    tenderedAmount?: number | string | null;
    changeAmount?: number | string | null;
    cashSessionId?: string | null;
    note?: string | null;
};
function makeId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}
function money(value: unknown) {
    const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}
function positiveQuantity(value: unknown) {
    const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
    return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0;
}
function normalizePaymentMethod(method: unknown): LaybyPaymentMethod {
    const value = String(method || "cash").toLowerCase();
    if (["cash", "card", "payfast", "wallet", "account"].includes(value))
        return value as LaybyPaymentMethod;
    throw new Error("Unsupported lay-by payment method.");
}
function normalizeDueDate(value: unknown) {
    const dateText = String(value || "").trim();
    if (!dateText)
        throw new Error("Choose a due date for the lay-by.");
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime()))
        throw new Error("Choose a valid due date for the lay-by.");
    return dateText.slice(0, 10);
}
function serializeOrder(row: any) {
    return {
        id: row.id,
        tenantId: row.tenantId ?? row.tenant_id,
        customerId: row.customerId ?? row.customer_id,
        customerName: row.customerName ?? row.customer_name,
        staffId: row.staffId ?? row.staff_id ?? null,
        staffName: row.staffName ?? row.staff_name ?? null,
        status: row.status || "active",
        subtotal: money(row.subtotal),
        taxAmount: money(row.taxAmount ?? row.tax_amount),
        taxRate: money(row.taxRate ?? row.tax_rate),
        taxInclusive: Boolean(row.taxInclusive ?? row.tax_inclusive),
        totalAmount: money(row.totalAmount ?? row.total_amount),
        depositAmount: money(row.depositAmount ?? row.deposit_amount),
        amountPaid: money(row.amountPaid ?? row.amount_paid),
        balanceDue: money(row.balanceDue ?? row.balance_due),
        refundAmount: money(row.refundAmount ?? row.refund_amount),
        forfeitedAmount: money(row.forfeitedAmount ?? row.forfeited_amount),
        dueDate: row.dueDate ?? row.due_date ?? null,
        cancelReason: row.cancelReason ?? row.cancel_reason ?? null,
        cancelledBy: row.cancelledBy ?? row.cancelled_by ?? null,
        cancelledByName: row.cancelledByName ?? row.cancelled_by_name ?? null,
        cancelledAt: row.cancelledAt ?? row.cancelled_at ?? null,
        completedSaleId: row.completedSaleId ?? row.completed_sale_id ?? null,
        completedBy: row.completedBy ?? row.completed_by ?? null,
        completedByName: row.completedByName ?? row.completed_by_name ?? null,
        completedAt: row.completedAt ?? row.completed_at ?? null,
        createdAt: row.createdAt ?? row.created_at ?? null,
        updatedAt: row.updatedAt ?? row.updated_at ?? null,
        items: [],
        payments: [],
    };
}
function serializeItem(row: any) {
    return {
        id: row.id,
        laybyOrderId: row.laybyOrderId ?? row.layby_order_id,
        productId: row.productId ?? row.product_id ?? null,
        productName: row.productName ?? row.product_name,
        name: row.productName ?? row.product_name,
        price: money(row.price),
        quantity: positiveQuantity(row.quantity),
        reservedQuantity: positiveQuantity(row.reservedQuantity ?? row.reserved_quantity),
        createdAt: row.createdAt ?? row.created_at ?? null,
    };
}
function serializePayment(row: any) {
    return {
        id: row.id,
        laybyOrderId: row.laybyOrderId ?? row.layby_order_id,
        method: row.method,
        amount: money(row.amount),
        tenderedAmount: money(row.tenderedAmount ?? row.tendered_amount),
        changeAmount: money(row.changeAmount ?? row.change_amount),
        staffId: row.staffId ?? row.staff_id ?? null,
        staffName: row.staffName ?? row.staff_name ?? null,
        cashSessionId: row.cashSessionId ?? row.cash_session_id ?? null,
        note: row.note ?? null,
        createdAt: row.createdAt ?? row.created_at ?? null,
    };
}
async function loadLaybyOrder(executor: Queryable, tenantId: string, laybyId: string, options: {
    lock?: boolean;
} = {}) {
    const [orderRows] = await executor.query<any>(`SELECT
       id,
       tenant_id AS tenantId,
       customer_id AS customerId,
       customer_name AS customerName,
       staff_id AS staffId,
       staff_name AS staffName,
       status,
       subtotal,
       tax_amount AS taxAmount,
       tax_rate AS taxRate,
       tax_inclusive AS taxInclusive,
       total_amount AS totalAmount,
       deposit_amount AS depositAmount,
       amount_paid AS amountPaid,
       balance_due AS balanceDue,
       refund_amount AS refundAmount,
       forfeited_amount AS forfeitedAmount,
       due_date AS dueDate,
       cancel_reason AS cancelReason,
       cancelled_by AS cancelledBy,
       cancelled_by_name AS cancelledByName,
       cancelled_at AS cancelledAt,
       completed_sale_id AS completedSaleId,
       completed_by AS completedBy,
       completed_by_name AS completedByName,
       completed_at AS completedAt,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM layby_orders
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1${options.lock ? " FOR UPDATE" : ""}`, [tenantId, laybyId]);
    const order = (orderRows as any[])[0];
    if (!order)
        return null;
    const [itemsRows] = await executor.query<any>(`SELECT
       id,
       layby_order_id AS laybyOrderId,
       product_id AS productId,
       product_name AS productName,
       price,
       quantity,
       reserved_quantity AS reservedQuantity,
       created_at AS createdAt
     FROM layby_items
     WHERE layby_order_id = $1
     ORDER BY created_at ASC`, [laybyId]);
    const [paymentRows] = await executor.query<any>(`SELECT
       id,
       layby_order_id AS laybyOrderId,
       method,
       amount,
       tendered_amount AS tenderedAmount,
       change_amount AS changeAmount,
       staff_id AS staffId,
       staff_name AS staffName,
       cash_session_id AS cashSessionId,
       note,
       created_at AS createdAt
     FROM layby_payments
     WHERE layby_order_id = $1
     ORDER BY created_at ASC`, [laybyId]);
    return {
        ...serializeOrder(order),
        items: (itemsRows as any[]).map(serializeItem),
        payments: (paymentRows as any[]).map(serializePayment),
    };
}
async function insertLaybyPayment(conn: DbConnection, tenantId: string, laybyId: string, payment: LaybyPaymentInput, context: {
    saleId?: string | null;
    note?: string | null;
} = {}) {
    const amount = money(payment.amount);
    if (amount <= 0)
        throw new Error("Enter a lay-by payment amount greater than zero.");
    const method = normalizePaymentMethod(payment.method);
    const tenderedAmount = method === "cash"
        ? Math.max(amount, money(payment.tenderedAmount || amount))
        : money(payment.tenderedAmount || amount);
    const changeAmount = method === "cash"
        ? money(payment.changeAmount ?? Math.max(0, tenderedAmount - amount))
        : money(payment.changeAmount || 0);
    const id = makeId("laypay");
    await conn.query(`INSERT INTO layby_payments (
      id, layby_order_id, method, amount, tendered_amount, change_amount,
      staff_id, staff_name, cash_session_id, note, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`, [
        id,
        laybyId,
        method,
        amount,
        tenderedAmount,
        changeAmount,
        payment.staffId || null,
        payment.staffName || null,
        payment.cashSessionId || null,
        payment.note || context.note || null,
    ]);
    if (method === "cash" && payment.cashSessionId) {
        const movementId = makeId("cm");
        await conn.query(`UPDATE cash_sessions
          SET expected_cash = COALESCE(expected_cash, 0) + $1,
              updated_at = NOW()
        WHERE tenant_id = $2 AND id = $3`, [amount, tenantId, payment.cashSessionId]);
        await conn.query(`INSERT INTO cash_movements (
        id, tenant_id, cash_session_id, type, direction, amount, sale_id, payment_id,
        staff_id, staff_name, created_by, note, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`, [
            movementId,
            tenantId,
            payment.cashSessionId,
            "cash_sale",
            "in",
            amount,
            context.saleId || null,
            id,
            payment.staffId || null,
            payment.staffName || null,
            payment.staffId || null,
            context.note || "Lay-by cash payment",
        ]);
        await recordAuditEvent(conn, {
            tenantId,
            action: "cash_movement.recorded",
            entityType: "cash_movement",
            entityId: movementId,
            relatedSaleId: context.saleId || null,
            staffId: payment.staffId || null,
            staffName: payment.staffName || null,
            source: "layby",
            details: {
                laybyOrderId: laybyId,
                cashSessionId: payment.cashSessionId,
                type: "cash_sale",
                direction: "in",
                amount,
                paymentId: id,
            },
        });
    }
    return {
        id,
        laybyOrderId: laybyId,
        method,
        amount,
        tenderedAmount,
        changeAmount,
        staffId: payment.staffId || null,
        staffName: payment.staffName || null,
        cashSessionId: payment.cashSessionId || null,
        note: payment.note || context.note || null,
    };
}
async function recordCashRefund(conn: DbConnection, tenantId: string, laybyId: string, input: LaybyPaymentInput, amount: number) {
    if (amount <= 0 || normalizePaymentMethod(input.method || "cash") !== "cash" || !input.cashSessionId)
        return;
    const movementId = makeId("cm");
    await conn.query(`UPDATE cash_sessions
        SET expected_cash = COALESCE(expected_cash, 0) - $1,
            updated_at = NOW()
      WHERE tenant_id = $2 AND id = $3`, [amount, tenantId, input.cashSessionId]);
    await conn.query(`INSERT INTO cash_movements (
      id, tenant_id, cash_session_id, type, direction, amount, sale_id, payment_id,
      staff_id, staff_name, created_by, note, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`, [
        movementId,
        tenantId,
        input.cashSessionId,
        "refund",
        "out",
        amount,
        null,
        null,
        input.staffId || null,
        input.staffName || null,
        input.staffId || null,
        "Lay-by cancellation refund",
    ]);
    await recordAuditEvent(conn, {
        tenantId,
        action: "cash_movement.recorded",
        entityType: "cash_movement",
        entityId: movementId,
        staffId: input.staffId || null,
        staffName: input.staffName || null,
        source: "layby",
        details: {
            laybyOrderId: laybyId,
            cashSessionId: input.cashSessionId,
            type: "refund",
            direction: "out",
            amount,
        },
    });
}
async function reserveLaybyStock(conn: DbConnection, tenantId: string, laybyId: string, items: any[], actor: LaybyActor) {
    for (const item of items) {
        if (!item.productId)
            throw new Error(`Lay-by item "${item.productName}" is missing a product id.`);
        const result = await applyProductStockDelta(conn, {
            tenantId,
            productId: item.productId,
            itemName: item.productName,
            quantityDelta: -item.quantity,
            reason: "layby_reserve",
            reasonCode: "transfer",
            referenceType: "layby_order",
            referenceId: laybyId,
            staffId: actor.staffId || null,
            staffName: actor.staffName || null,
            note: "Reserved for lay-by",
        });
        if (!result)
            throw new Error(`Product "${item.productName}" was not found for lay-by reservation.`);
        if (Math.abs(Number(result.quantityDelta || 0) + Number(item.quantity || 0)) > 0.001) {
            throw new Error(`Not enough stock available to reserve "${item.productName}".`);
        }
    }
}
async function releaseLaybyStock(conn: DbConnection, tenantId: string, laybyId: string, items: any[], actor: LaybyActor) {
    for (const item of items) {
        if (!item.productId || Number(item.reservedQuantity || 0) <= 0)
            continue;
        await applyProductStockDelta(conn, {
            tenantId,
            productId: item.productId,
            itemName: item.productName || item.name || null,
            quantityDelta: Number(item.reservedQuantity || 0),
            reason: "layby_release",
            reasonCode: "transfer",
            referenceType: "layby_order",
            referenceId: laybyId,
            staffId: actor.staffId || null,
            staffName: actor.staffName || null,
            note: "Released from cancelled lay-by",
        });
    }
}
async function insertCompletedSaleForLayby(conn: DbConnection, tenantId: string, order: any, saleId: string) {
    const paymentMethod = order.payments.length > 1
        ? "cash"
        : (order.payments[0]?.method || "pending");
    await conn.query(`INSERT INTO sales (
      id, tenant_id, customer_id, user_id, staff_id, total, subtotal, tax_amount,
      tax_rate, tax_inclusive, payment_method, tendered_amount, change_amount,
      tip_amount, cash_out_amount, points_discount, status, payfast_payment_id,
      transaction_type, parent_sale_id, refund_status, refunded_amount, refund_reason, refunded_by,
      void_reason, voided_by,
      table_number, is_tab, tab_name,
      offline_event_id, sync_source, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, NOW(), NOW())`, [
        saleId,
        tenantId,
        order.customerId,
        null,
        order.completedBy || order.staffId || null,
        order.totalAmount,
        order.subtotal,
        order.taxAmount,
        order.taxRate,
        order.taxInclusive ? 1 : 0,
        paymentMethod,
        order.amountPaid,
        0,
        0,
        0,
        0,
        "completed",
        null,
        "layby_final",
        null,
        "none",
        0,
        null,
        null,
        null,
        null,
        null,
        0,
        null,
        null,
        "online",
    ]);
    for (const item of order.items) {
        await conn.query(`INSERT INTO sale_items (
        id, sale_id, product_id, product_name, price, quantity, status,
        workstation_id, ordered_at, delivered_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW(), NOW())`, [
            makeId("item"),
            saleId,
            item.productId || null,
            item.productName || item.name,
            item.price,
            item.quantity,
            "delivered",
            null,
        ]);
    }
    for (const payment of order.payments) {
        await conn.query(`INSERT INTO sale_payments (
        id, sale_id, method, amount, tendered_amount, change_amount, tip_amount, cash_out_amount, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`, [
            makeId("pay"),
            saleId,
            payment.method,
            payment.amount,
            payment.tenderedAmount || payment.amount,
            payment.changeAmount || 0,
            0,
            0,
        ]);
    }
    await recordAuditEvent(conn, {
        tenantId,
        action: "sale.created",
        entityType: "sale",
        entityId: saleId,
        relatedSaleId: saleId,
        staffId: order.completedBy || order.staffId || null,
        staffName: order.completedByName || order.staffName || null,
        customerId: order.customerId,
        source: "layby",
        details: {
            status: "completed",
            transactionType: "layby_final",
            laybyOrderId: order.id,
            paymentMethod,
            total: order.totalAmount,
            itemCount: order.items.length,
        },
    });
}
export async function listLaybyOrders(tenantId: string, filters: any = {}) {
    const values: any[] = [tenantId];
    const clauses = ["tenant_id = $1"];
    const status = String(filters.status || "active").toLowerCase();
    if (status && status !== "all") {
        clauses.push("status = $1");
        values.push(status);
    }
    const search = String(filters.search || "").trim();
    if (search) {
        clauses.push("(LOWER(customer_name) LIKE LOWER($1) OR LOWER(id) LIKE LOWER($2))");
        values.push(`%${search}%`, `%${search}%`);
    }
    const limit = Math.min(200, Math.max(1, Number(filters.limit || 80)));
    values.push(limit);
    const rows = await query<any>(`SELECT
       id,
       tenant_id AS tenantId,
       customer_id AS customerId,
       customer_name AS customerName,
       staff_id AS staffId,
       staff_name AS staffName,
       status,
       subtotal,
       tax_amount AS taxAmount,
       tax_rate AS taxRate,
       tax_inclusive AS taxInclusive,
       total_amount AS totalAmount,
       deposit_amount AS depositAmount,
       amount_paid AS amountPaid,
       balance_due AS balanceDue,
       refund_amount AS refundAmount,
       forfeited_amount AS forfeitedAmount,
       due_date AS dueDate,
       cancel_reason AS cancelReason,
       cancelled_by AS cancelledBy,
       cancelled_by_name AS cancelledByName,
       cancelled_at AS cancelledAt,
       completed_sale_id AS completedSaleId,
       completed_by AS completedBy,
       completed_by_name AS completedByName,
       completed_at AS completedAt,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM layby_orders
     WHERE ${clauses.join(" AND ")}
     ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, due_date ASC, created_at DESC
     LIMIT $1`, values);
    return Promise.all(rows.map(row => getLaybyOrderById(tenantId, row.id).then(order => order || serializeOrder(row))));
}
export async function getLaybyOrderById(tenantId: string, laybyId: string) {
    const executor = {
        query: async (sql: string, params?: any[]) => [await query(sql, params || [])],
    } as unknown as Queryable;
    return loadLaybyOrder(executor, tenantId, laybyId);
}
export async function createLaybyOrder(tenantId: string, data: any) {
    const items = (Array.isArray(data.items) ? data.items : [])
        .map((item: any) => ({
        productId: item.productId || item.product_id || item.id || null,
        productName: String(item.productName || item.name || "").trim(),
        price: money(item.price),
        quantity: positiveQuantity(item.quantity),
    }))
        .filter((item: any) => item.productName && item.quantity > 0);
    if (!data.customerId)
        throw new Error("Select a customer before creating a lay-by.");
    if (items.length === 0)
        throw new Error("Add at least one item before creating a lay-by.");
    const totalAmount = money(data.totalAmount ?? data.total);
    const subtotal = money(data.subtotal ?? totalAmount);
    const taxAmount = money(data.taxAmount);
    const taxRate = money(data.taxRate);
    const taxInclusive = data.taxInclusive !== false;
    if (totalAmount <= 0)
        throw new Error("Lay-by total must be greater than zero.");
    const dueDate = normalizeDueDate(data.dueDate);
    const payment = data.payment || {};
    const depositAmount = money(payment.amount ?? data.depositAmount);
    if (depositAmount <= 0)
        throw new Error("Enter a lay-by deposit greater than zero.");
    if (depositAmount > totalAmount)
        throw new Error("Lay-by deposit cannot be more than the total.");
    const id = makeId("layby");
    const conn = await getConnection();
    try {
        await conn.beginTransaction();
        let customerName = String(data.customerName || "").trim();
        if (!customerName) {
            const [customerRows] = await conn.query<any>(`SELECT name FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, data.customerId]);
            customerName = String((customerRows as any[])[0]?.name || "").trim();
        }
        if (!customerName)
            throw new Error("Selected lay-by customer was not found.");
        const balanceDue = money(totalAmount - depositAmount);
        await conn.query(`INSERT INTO layby_orders (
        id, tenant_id, customer_id, customer_name, staff_id, staff_name, status,
        subtotal, tax_amount, tax_rate, tax_inclusive, total_amount,
        deposit_amount, amount_paid, balance_due, due_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())`, [
            id,
            tenantId,
            data.customerId,
            customerName,
            data.staffId || null,
            data.staffName || null,
            "active",
            subtotal,
            taxAmount,
            taxRate,
            taxInclusive ? 1 : 0,
            totalAmount,
            depositAmount,
            depositAmount,
            balanceDue,
            dueDate,
        ]);
        for (const item of items) {
            await conn.query(`INSERT INTO layby_items (
          id, layby_order_id, product_id, product_name, price, quantity, reserved_quantity, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`, [makeId("layitem"), id, item.productId, item.productName, item.price, item.quantity, item.quantity]);
        }
        await reserveLaybyStock(conn, tenantId, id, items, {
            staffId: data.staffId || null,
            staffName: data.staffName || null,
        });
        await insertLaybyPayment(conn, tenantId, id, {
            ...payment,
            amount: depositAmount,
            staffId: payment.staffId || data.staffId || null,
            staffName: payment.staffName || data.staffName || null,
            note: payment.note || "Lay-by deposit",
        }, { note: "Lay-by deposit" });
        await recordAuditEvent(conn, {
            tenantId,
            action: "layby.created",
            entityType: "layby_order",
            entityId: id,
            staffId: data.staffId || null,
            staffName: data.staffName || null,
            customerId: data.customerId,
            source: "layby",
            details: {
                customerName,
                totalAmount,
                depositAmount,
                balanceDue,
                dueDate,
                itemCount: items.length,
            },
        });
        await conn.commit();
        const created = await getLaybyOrderById(tenantId, id);
        if (!created)
            throw new Error("Lay-by was created but could not be loaded.");
        return created;
    }
    catch (err) {
        await conn.rollback();
        throw err;
    }
    finally {
        conn.release();
    }
}
export async function addLaybyPayment(tenantId: string, laybyId: string, payment: LaybyPaymentInput) {
    const amount = money(payment.amount);
    if (amount <= 0)
        throw new Error("Enter a lay-by payment amount greater than zero.");
    const conn = await getConnection();
    try {
        await conn.beginTransaction();
        const order = await loadLaybyOrder(conn, tenantId, laybyId, { lock: true });
        if (!order)
            throw new Error("Lay-by not found.");
        if (order.status !== "active")
            throw new Error("Only active lay-bys can accept payments.");
        if (amount > order.balanceDue)
            throw new Error("Lay-by payment cannot be more than the outstanding balance.");
        await insertLaybyPayment(conn, tenantId, laybyId, payment, { note: payment.note || "Lay-by instalment" });
        const nextPaid = money(order.amountPaid + amount);
        const nextBalance = money(order.totalAmount - nextPaid);
        await conn.query(`UPDATE layby_orders
          SET amount_paid = $1,
              balance_due = $2,
              updated_at = NOW()
        WHERE tenant_id = $3 AND id = $4`, [nextPaid, nextBalance, tenantId, laybyId]);
        await recordAuditEvent(conn, {
            tenantId,
            action: "layby.payment_recorded",
            entityType: "layby_order",
            entityId: laybyId,
            staffId: payment.staffId || null,
            staffName: payment.staffName || null,
            customerId: order.customerId,
            source: "layby",
            details: {
                amount,
                method: normalizePaymentMethod(payment.method),
                previousBalance: order.balanceDue,
                balanceDue: nextBalance,
            },
        });
        await conn.commit();
        const updated = await getLaybyOrderById(tenantId, laybyId);
        if (!updated)
            throw new Error("Lay-by payment was recorded but the lay-by could not be loaded.");
        return updated;
    }
    catch (err) {
        await conn.rollback();
        throw err;
    }
    finally {
        conn.release();
    }
}
export async function completeLaybyOrder(tenantId: string, laybyId: string, data: LaybyActor & {
    payment?: LaybyPaymentInput;
}) {
    const conn = await getConnection();
    try {
        await conn.beginTransaction();
        const order = await loadLaybyOrder(conn, tenantId, laybyId, { lock: true });
        if (!order)
            throw new Error("Lay-by not found.");
        if (order.status !== "active")
            throw new Error("Only active lay-bys can be collected.");
        const saleId = makeId("sale");
        let nextPaid = order.amountPaid;
        let nextBalance = order.balanceDue;
        if (order.balanceDue > 0) {
            const payment = data.payment;
            const finalAmount = money(payment?.amount);
            if (!payment || finalAmount <= 0)
                throw new Error("Record the final lay-by payment before collection.");
            if (finalAmount !== order.balanceDue)
                throw new Error("Final lay-by payment must match the outstanding balance.");
            await insertLaybyPayment(conn, tenantId, laybyId, {
                ...payment,
                amount: finalAmount,
                staffId: payment.staffId || data.staffId || null,
                staffName: payment.staffName || data.staffName || null,
                note: payment.note || "Lay-by final payment",
            }, { saleId, note: "Lay-by final payment" });
            nextPaid = money(order.amountPaid + finalAmount);
            nextBalance = money(order.totalAmount - nextPaid);
        }
        const orderForSale = await loadLaybyOrder(conn, tenantId, laybyId, { lock: true });
        if (!orderForSale)
            throw new Error("Lay-by could not be loaded for final sale.");
        const completedOrder = {
            ...orderForSale,
            amountPaid: nextPaid,
            balanceDue: nextBalance,
            completedBy: data.staffId || null,
            completedByName: data.staffName || null,
        };
        await insertCompletedSaleForLayby(conn, tenantId, completedOrder, saleId);
        await conn.query(`UPDATE layby_orders
          SET status = 'completed',
              amount_paid = $1,
              balance_due = 0,
              completed_sale_id = $2,
              completed_by = $3,
              completed_by_name = $4,
              completed_at = NOW(),
              updated_at = NOW()
        WHERE tenant_id = $5 AND id = $6`, [nextPaid, saleId, data.staffId || null, data.staffName || null, tenantId, laybyId]);
        await recordAuditEvent(conn, {
            tenantId,
            action: "layby.completed",
            entityType: "layby_order",
            entityId: laybyId,
            relatedSaleId: saleId,
            staffId: data.staffId || null,
            staffName: data.staffName || null,
            customerId: order.customerId,
            source: "layby",
            details: {
                completedSaleId: saleId,
                totalAmount: order.totalAmount,
                amountPaid: nextPaid,
            },
        });
        await conn.commit();
        const updated = await getLaybyOrderById(tenantId, laybyId);
        if (!updated)
            throw new Error("Lay-by was completed but could not be loaded.");
        return updated;
    }
    catch (err) {
        await conn.rollback();
        throw err;
    }
    finally {
        conn.release();
    }
}
export async function cancelLaybyOrder(tenantId: string, laybyId: string, data: LaybyActor & {
    reason?: string | null;
    refundAmount?: number | string | null;
    refundMethod?: LaybyPaymentMethod | string | null;
    cashSessionId?: string | null;
}) {
    const conn = await getConnection();
    try {
        await conn.beginTransaction();
        const order = await loadLaybyOrder(conn, tenantId, laybyId, { lock: true });
        if (!order)
            throw new Error("Lay-by not found.");
        if (order.status !== "active")
            throw new Error("Only active lay-bys can be cancelled.");
        const refundAmount = money(data.refundAmount || 0);
        if (refundAmount > order.amountPaid)
            throw new Error("Lay-by refund cannot be more than the amount already paid.");
        const forfeitedAmount = money(order.amountPaid - refundAmount);
        await releaseLaybyStock(conn, tenantId, laybyId, order.items, {
            staffId: data.staffId || null,
            staffName: data.staffName || null,
        });
        await recordCashRefund(conn, tenantId, laybyId, {
            method: data.refundMethod || "cash",
            amount: refundAmount,
            cashSessionId: data.cashSessionId || null,
            staffId: data.staffId || null,
            staffName: data.staffName || null,
        }, refundAmount);
        await conn.query(`UPDATE layby_orders
          SET status = 'cancelled',
              refund_amount = $1,
              forfeited_amount = $2,
              cancel_reason = $3,
              cancelled_by = $4,
              cancelled_by_name = $5,
              cancelled_at = NOW(),
              updated_at = NOW()
        WHERE tenant_id = $6 AND id = $7`, [
            refundAmount,
            forfeitedAmount,
            data.reason || null,
            data.staffId || null,
            data.staffName || null,
            tenantId,
            laybyId,
        ]);
        await recordAuditEvent(conn, {
            tenantId,
            action: "layby.cancelled",
            entityType: "layby_order",
            entityId: laybyId,
            staffId: data.staffId || null,
            staffName: data.staffName || null,
            customerId: order.customerId,
            source: "layby",
            details: {
                reason: data.reason || null,
                amountPaid: order.amountPaid,
                refundAmount,
                forfeitedAmount,
                releasedItems: order.items.length,
            },
        });
        await conn.commit();
        const updated = await getLaybyOrderById(tenantId, laybyId);
        if (!updated)
            throw new Error("Lay-by was cancelled but could not be loaded.");
        return updated;
    }
    catch (err) {
        await conn.rollback();
        throw err;
    }
    finally {
        conn.release();
    }
}
