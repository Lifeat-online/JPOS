import { getConnection, isPostgres, query } from "./db.js";
import { applyProductStockDelta, recordAuditEvent } from "./audit.js";
import { assertSafePaymentProviderEvidence } from "./paymentProviderBoundary.js";
import { assertCurrentTaxPeriodOpen, assertSaleNotInLockedTaxPeriod } from "./taxReports.js";
import { DEFAULT_INVENTORY_LOCATION_ID } from "./inventoryLocations.js";
import { recordPromotionRedemption, validatePromotionForSale, type PromotionValidationInput, type PromotionValidationResult } from "./promotions.js";
import { calculateLoyaltyAward, type LoyaltyAwardResult } from "./loyalty.js";
import { CUSTOMER_CONSENT_TYPES, defaultCustomerConsentMap, listCustomerConsents, upsertCustomerConsents } from "./customerConsents.js";
import { isDevEmail } from "./auth-middleware.js";
import type { Product, Customer, Staff, Sale, Workstation, AppConfig, OrderItem, BulkItem, RecipeItem, ModifierGroup, ModifierOption, Vendor, PurchaseOrder, StockBatch } from "./types.js";

const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY;
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE;

if (!PAYFAST_MERCHANT_ID || !PAYFAST_MERCHANT_KEY || !PAYFAST_PASSPHRASE) {
  console.warn("⚠️  PayFast credentials not configured. Payment processing will fail.");
}

// ─────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────

function safeParse(str: any, fallback: any) {
  if (typeof str !== 'string') return str || fallback;
  try {
    return JSON.parse(str || JSON.stringify(fallback));
  } catch (e) {
    console.error('Failed to parse JSON field:', str, e);
    return fallback;
  }
}

function normalizeJsonField(value: any, fallback: any) {
  if (value === undefined || value === null || value === "") return fallback;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function saleHasPromotionInput(sale: any) {
  return Boolean(
    String(sale?.promotionCode || "").trim() ||
    String(sale?.promotionId || "").trim() ||
    Number(sale?.promotionDiscount || 0) > 0
  );
}

function promotionInputFromSale(sale: any): PromotionValidationInput {
  return {
    promotionId: sale?.promotionId || null,
    code: sale?.promotionCode || null,
    customerId: sale?.customerId || null,
    items: Array.isArray(sale?.items) ? sale.items : [],
    subtotal: Number(sale?.subtotal || 0),
    totalBeforeDiscount: Number(sale?.subtotal || 0),
    promotionDiscount: Number(sale?.promotionDiscount || 0),
  };
}

function loyaltyInputFromSale(sale: any) {
  return {
    customerId: sale?.customerId || null,
    items: Array.isArray(sale?.items) ? sale.items : [],
    subtotal: Number(sale?.subtotal || 0),
    total: Number(sale?.total || sale?.subtotal || 0),
    pointsRedeemed: Number(sale?.loyaltyPointsRedeemed || 0),
  };
}

function paymentTotal(payments: any[] | undefined, method: string) {
  if (!Array.isArray(payments)) return 0;
  return Number(payments.reduce((sum, payment) => (
    String(payment?.method || "") === method ? sum + Math.max(0, Number(payment?.amount || 0)) : sum
  ), 0).toFixed(2));
}

function nullableText(value: any, maxLength = 255) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function decimal(value: any, fallback = 0, precision = 3) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(precision)) : fallback;
}

function recipeYield(value: any) {
  const parsed = decimal(value, 1);
  return parsed > 0 ? parsed : 1;
}

function recipeWastePercent(value: any) {
  return Math.max(0, Math.min(100, decimal(value, 0, 2)));
}

function recipeEffectiveQuantity(row: any, saleQuantity = 1) {
  const baseQuantity = Math.max(0, decimal(row.quantity));
  const yieldQuantity = recipeYield(row.yieldQuantity ?? row.yield_quantity);
  const wastePercent = recipeWastePercent(row.wastePercent ?? row.waste_percent);
  return decimal((baseQuantity / yieldQuantity) * (1 + wastePercent / 100) * Math.max(0, Number(saleQuantity || 0)), 0);
}

function serializeRecipeRow(row: any): RecipeItem {
  const effectiveQuantity = recipeEffectiveQuantity(row);
  const costPerUnit = decimal(row.costPerUnit ?? row.cost_per_unit, 0, 4);
  return {
    bulkItemId: row.bulkItemId ?? row.bulk_item_id,
    quantity: decimal(row.quantity),
    yieldQuantity: recipeYield(row.yieldQuantity ?? row.yield_quantity),
    wastePercent: recipeWastePercent(row.wastePercent ?? row.waste_percent),
    substituteGroup: nullableText(row.substituteGroup ?? row.substitute_group, 64),
    substituteRank: Math.max(0, Math.floor(Number(row.substituteRank ?? row.substitute_rank ?? 0) || 0)),
    isOptional: Boolean(Number(row.isOptional ?? row.is_optional ?? 0)),
    bulkItemName: row.bulkItemName ?? row.bulk_item_name ?? row.name,
    unit: row.unit,
    costPerUnit,
    availableStock: decimal(row.availableStock ?? row.stock, 0),
    effectiveQuantity,
    lineCost: decimal(effectiveQuantity * costPerUnit, 0, 2),
  };
}

function chooseRecipeSubstitution(rows: any[], saleQuantity: number) {
  const sorted = [...rows].sort((a, b) => (
    (Number(a.substitute_rank ?? a.substituteRank ?? 0) - Number(b.substitute_rank ?? b.substituteRank ?? 0))
    || String(a.bulk_item_id ?? a.bulkItemId).localeCompare(String(b.bulk_item_id ?? b.bulkItemId))
  ));
  return sorted.find((row) => decimal(row.stock ?? row.availableStock ?? row.available_stock, 0) >= recipeEffectiveQuantity(row, saleQuantity)) || sorted[0];
}

async function syncDefaultProductLocationStock(tenantId: string, productId: string, stock: any, minStock: any) {
  const quantity = Math.max(0, Number(stock || 0));
  const threshold = Math.max(0, Number(minStock || 0));
  try {
    if (isPostgres()) {
      await query(
        `INSERT INTO product_location_stock (
           tenant_id, product_id, location_id, quantity, min_stock, reorder_threshold, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON CONFLICT (tenant_id, product_id, location_id)
         DO UPDATE SET quantity = EXCLUDED.quantity,
                       min_stock = EXCLUDED.min_stock,
                       reorder_threshold = EXCLUDED.reorder_threshold,
                       updated_at = NOW()`,
        [tenantId, productId, DEFAULT_INVENTORY_LOCATION_ID, quantity, threshold, threshold]
      );
      return;
    }
    await query(
      `INSERT INTO product_location_stock (
         tenant_id, product_id, location_id, quantity, min_stock, reorder_threshold, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity),
                               min_stock = VALUES(min_stock),
                               reorder_threshold = VALUES(reorder_threshold),
                               updated_at = NOW()`,
      [tenantId, productId, DEFAULT_INVENTORY_LOCATION_ID, quantity, threshold, threshold]
    );
  } catch (error: any) {
    const message = String(error?.message || "");
    if (!message.includes("product_location_stock")) throw error;
  }
}

function paymentProviderValues(payment: any) {
  const method = String(payment?.method || "");
  assertSafePaymentProviderEvidence(payment, { method, source: "sale payment" });
  const defaultStatus = method === "bnpl" ? "approved" : method === "qr" ? "confirmed" : null;
  return [
    nullableText(payment?.provider || payment?.paymentProvider, 64),
    nullableText(payment?.providerDeviceId || payment?.deviceId || payment?.terminalId, 128),
    nullableText(payment?.providerReference || payment?.reference || payment?.authorizationCode, 255),
    nullableText(payment?.authorizationCode || payment?.authCode, 128),
    nullableText(payment?.providerStatus || defaultStatus, 32),
    nullableText(payment?.providerNote || payment?.note, 500),
    nullableText(payment?.qrPayload || payment?.paymentLink || payment?.qrCode, 1000),
  ];
}

function paymentProviderSummary(payments: any[] | undefined) {
  return Array.isArray(payments)
    ? payments
      .filter((payment: any) => payment?.provider || payment?.providerDeviceId || payment?.providerReference || payment?.authorizationCode || payment?.providerNote || payment?.note)
      .map((payment: any) => ({
        method: payment.method,
        provider: payment.provider || null,
        providerDeviceId: payment.providerDeviceId || payment.deviceId || payment.terminalId || null,
        providerReference: payment.providerReference || null,
        authorizationCode: payment.authorizationCode || payment.authCode || null,
        providerStatus: payment.providerStatus || null,
        providerNote: payment.providerNote || payment.note || null,
      }))
    : [];
}

async function applyWalletSalePayment(
  conn: any,
  tenantId: string,
  saleId: string,
  context: {
    customerId?: string | null;
    staffId?: string | null;
    staffName?: string | null;
    payments?: any[];
  }
) {
  const walletAmount = paymentTotal(context.payments, "wallet");
  if (walletAmount <= 0) return null;
  if (!context.customerId) throw new Error("Select a customer before using wallet payment.");

  const [customerRows] = await conn.query(
    `SELECT id, name, wallet_balance AS walletBalance
       FROM customers
      WHERE tenant_id = ? AND id = ?
      LIMIT 1
      FOR UPDATE`,
    [tenantId, context.customerId]
  );
  const customer = (customerRows as any[])[0];
  if (!customer) throw new Error("Customer wallet not found.");

  const previousBalance = Number(customer.walletBalance || customer.wallet_balance || 0);
  if (previousBalance < walletAmount) {
    throw new Error(`Customer wallet balance is R${previousBalance.toFixed(2)}, which is not enough for this wallet payment.`);
  }
  const nextBalance = Number((previousBalance - walletAmount).toFixed(2));
  await conn.query(
    `UPDATE customers
        SET wallet_balance = ?,
            updated_at = NOW()
      WHERE tenant_id = ? AND id = ?`,
    [nextBalance, tenantId, customer.id]
  );

  await recordAuditEvent(conn, {
    tenantId,
    action: "customer_wallet.sale_payment",
    entityType: "customer_wallet",
    entityId: customer.id,
    relatedSaleId: saleId,
    staffId: context.staffId || null,
    staffName: context.staffName || null,
    customerId: customer.id,
    source: "checkout",
    details: {
      saleId,
      walletAmount,
      previousBalance,
      nextBalance,
      customerName: customer.name || null,
    },
  });

  return { previousBalance, nextBalance, walletAmount };
}

/**
 * Apply checkout completion side effects within the sale transaction.
 * Covers: loyalty points, cash session expected_cash/tips, cash movements,
 * staff metrics (orders, tips), and customer account balance.
 * Throws on any failure — caller's transaction will roll back.
 */
async function applyCheckoutSideEffects(
  conn: any,
  tenantId: string,
  saleId: string,
  context: {
    staffId?: string | null;
    customerId?: string | null;
    cashSessionId?: string | null;
    loyaltyPoints?: number;
    expectedCashDelta?: number;
    tipsDelta?: number;
    cashMovements?: any[];
    staffMetrics?: { ordersDelta?: number; tipsDelta?: number } | null;
    accountBalanceDelta?: number;
  }
): Promise<void> {
  const sid = saleId;

  // 1. Customer loyalty points
  if (context.loyaltyPoints !== undefined && context.customerId) {
    await conn.query(
      `UPDATE customers SET loyalty_points = ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
      [context.loyaltyPoints, tenantId, context.customerId]
    );
  }

  // 2. Cash session expected cash / tips
  if (context.cashSessionId) {
    const sessionFields: string[] = [];
    const sessionValues: (string | number | null)[] = [];
    if (context.expectedCashDelta !== undefined) {
      sessionFields.push("expected_cash = COALESCE(expected_cash, 0) + ?");
      sessionValues.push(context.expectedCashDelta);
    }
    if (context.tipsDelta !== undefined) {
      sessionFields.push("accumulated_tips = COALESCE(accumulated_tips, 0) + ?");
      sessionValues.push(context.tipsDelta);
    }
    if (sessionFields.length > 0) {
      sessionFields.push("updated_at = NOW()");
      sessionValues.push(context.cashSessionId, tenantId);
      await conn.query(
        `UPDATE cash_sessions SET ${sessionFields.join(", ")} WHERE id = ? AND tenant_id = ?`,
        sessionValues
      );
    }
  }

  // 3. Cash movements
  if (context.cashMovements && context.cashMovements.length > 0 && context.cashSessionId) {
    for (const m of context.cashMovements) {
      const movId = `cm_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await conn.query(
        `INSERT INTO cash_movements (id, tenant_id, cash_session_id, type, direction, amount, sale_id, payment_id, staff_id, staff_name, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          movId, tenantId, context.cashSessionId,
          m.type, m.direction || "neutral", m.amount, sid,
          m.paymentId || null, m.staffId || null, m.staffName || null,
          m.note || null,
        ]
      );
      await recordAuditEvent(conn, {
        tenantId,
        action: "cash_movement.recorded",
        entityType: "cash_movement",
        entityId: movId,
        relatedSaleId: sid,
        staffId: m.staffId || context.staffId || null,
        staffName: m.staffName || null,
        source: "checkout",
        details: {
          cashSessionId: context.cashSessionId,
          type: m.type,
          direction: m.direction || "neutral",
          amount: m.amount,
          paymentId: m.paymentId || null,
          note: m.note || null,
        },
      });
    }
  }

  // 4. Staff metrics (orders count and aggregated tips)
  if (context.staffMetrics && context.staffId) {
    const sm = context.staffMetrics;
    const [staffRows] = await conn.query(
      `SELECT metrics FROM staff WHERE tenant_id = ? AND id = ? LIMIT 1 FOR UPDATE`,
      [tenantId, context.staffId]
    );
    const row = (staffRows as any[])[0];
    const currentMetrics = row?.metrics ? (typeof row.metrics === 'string' ? safeParse(row.metrics, {}) : row.metrics) : {};
    const updatedMetrics = {
      ...currentMetrics,
      orders: (Number(currentMetrics.orders) || 0) + (sm.ordersDelta || 0),
      tips: (Number(currentMetrics.tips) || 0) + (sm.tipsDelta || 0),
    };
    await conn.query(
      `UPDATE staff SET metrics = ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
      [JSON.stringify(updatedMetrics), tenantId, context.staffId]
    );
  }

  // 5. Customer account balance
  if (context.accountBalanceDelta !== undefined && context.customerId) {
    await conn.query(
      `UPDATE customers SET account_balance = GREATEST(0, COALESCE(account_balance, 0) + ?), updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
      [context.accountBalanceDelta, tenantId, context.customerId]
    );
  }
}

function makeStockBatchId() {
  return `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function makeCustomerConsentEventId() {
  return `consent_evt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function anonymizedCustomerName(customerId: string) {
  const suffix = String(customerId || "customer").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `Anonymized Customer ${suffix || "PROFILE"}`;
}

async function countRows(conn: any, sql: string, params: any[]) {
  const [rows] = await conn.query(sql, params);
  const row = (rows as any[])[0] || {};
  return Number(row.count ?? row.total ?? Object.values(row)[0] ?? 0) || 0;
}

function cleanStockBatchDate(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function daysUntilDate(value: unknown) {
  const text = cleanStockBatchDate(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

async function createReceivingStockBatch(
  conn: any,
  input: {
    tenantId: string;
    productId: string;
    productName: string;
    purchaseOrderId: string;
    vendorId?: string | null;
    supplierInvoiceNumber?: string | null;
    supplierInvoiceDate?: string | null;
    batchNumber?: string | null;
    receivedQuantity: number;
    unitCost: number;
    expiryDate?: string | null;
    receivedBy?: string | null;
    receivedByName?: string | null;
    locationId?: string | null;
    note?: string | null;
  }
) {
  const id = makeStockBatchId();
  await conn.query(
    `INSERT INTO stock_batches (
      id, tenant_id, product_id, product_name, purchase_order_id, vendor_id,
      supplier_invoice_number, supplier_invoice_date, batch_number,
      received_quantity, remaining_quantity, unit_cost, expiry_date,
      received_at, received_by, received_by_name, location_id, status, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      input.tenantId,
      input.productId,
      input.productName,
      input.purchaseOrderId,
      input.vendorId || null,
      input.supplierInvoiceNumber || null,
      cleanStockBatchDate(input.supplierInvoiceDate),
      input.batchNumber || null,
      input.receivedQuantity,
      input.receivedQuantity,
      input.unitCost,
      cleanStockBatchDate(input.expiryDate),
      input.receivedBy || null,
      input.receivedByName || null,
      input.locationId || DEFAULT_INVENTORY_LOCATION_ID,
      "active",
      input.note || null,
    ]
  );
  return id;
}

async function consumeProductStockBatches(
  conn: any,
  tenantId: string,
  productId: string,
  quantity: number
) {
  let remainingToConsume = Math.max(0, Number(Number(quantity || 0).toFixed(3)));
  if (remainingToConsume <= 0) return { requestedQuantity: 0, consumedQuantity: 0, unbatchedQuantity: 0 };

  const [rows] = await conn.query(
    `SELECT id, remaining_quantity AS remainingQuantity
       FROM stock_batches
      WHERE tenant_id = ?
        AND product_id = ?
        AND status = 'active'
        AND remaining_quantity > 0
      ORDER BY
        CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
        expiry_date ASC,
        received_at ASC,
        created_at ASC
      FOR UPDATE`,
    [tenantId, productId]
  );

  let consumedQuantity = 0;
  for (const batch of rows as any[]) {
    if (remainingToConsume <= 0) break;
    const batchRemaining = Math.max(0, Number(batch.remainingQuantity || batch.remaining_quantity || 0));
    if (batchRemaining <= 0) continue;
    const consume = Math.min(batchRemaining, remainingToConsume);
    const nextRemaining = Number((batchRemaining - consume).toFixed(3));
    consumedQuantity = Number((consumedQuantity + consume).toFixed(3));
    remainingToConsume = Number((remainingToConsume - consume).toFixed(3));
    await conn.query(
      `UPDATE stock_batches
          SET remaining_quantity = ?,
              status = ?,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [nextRemaining, nextRemaining <= 0 ? "depleted" : "active", tenantId, batch.id]
    );
  }

  return {
    requestedQuantity: Number(Number(quantity || 0).toFixed(3)),
    consumedQuantity,
    unbatchedQuantity: remainingToConsume,
  };
}

async function deductCompletedSaleProductStock(
  conn: any,
  tenantId: string,
  items: any[] = [],
  context: { saleId?: string | null; staffId?: string | null; staffName?: string | null; note?: string | null } = {}
) {
  const totals = new Map<string, { quantity: number; name?: string | null }>();
  for (const item of items) {
    const productId = item.productId || item.product_id || item.id || null;
    const quantity = Number(item.quantity || 0);
    if (!productId || quantity <= 0) continue;
    const existing = totals.get(productId) || { quantity: 0, name: item.name || item.product_name || null };
    totals.set(productId, {
      quantity: existing.quantity + quantity,
      name: existing.name || item.name || item.product_name || null,
    });
  }

  for (const [productId, movement] of totals.entries()) {
    const stockDelta = await applyProductStockDelta(conn, {
      tenantId,
      productId,
      itemName: movement.name || null,
      quantityDelta: -movement.quantity,
      reason: "sale",
      reasonCode: "sale",
      referenceType: "sale",
      referenceId: context.saleId || null,
      saleId: context.saleId || null,
      staffId: context.staffId || null,
      staffName: context.staffName || null,
      note: context.note || null,
    });
    if (stockDelta && movement.quantity > 0) {
      await consumeProductStockBatches(conn, tenantId, productId, movement.quantity);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// CREATE Operations
// ─────────────────────────────────────────────────────────────────────────

type OfflineSyncConflictType =
  | "negative_stock_after_sync"
  | "duplicate_local_receipt"
  | "duplicate_table_or_tab"
  | "duplicate_customer_order";

type OfflineSyncConflict = {
  conflictType: OfflineSyncConflictType;
  recommendedAction: string;
  message: string;
  productId?: string | null;
  itemName?: string | null;
  requestedQuantity?: number;
  availableStock?: number;
  tableNumber?: string | null;
  tabName?: string | null;
  customerId?: string | null;
  existingSaleId?: string | null;
};

const offlineSyncConflictActions: Record<OfflineSyncConflictType, string> = {
  negative_stock_after_sync: "Review the synced sale against current stock, approve the shortage, adjust stock, or create a receiving/count correction.",
  duplicate_local_receipt: "Check whether this local receipt already exists in cloud sales before retrying or dismissing the local copy.",
  duplicate_table_or_tab: "Compare the offline sale with the open table/tab and merge, close, or reassign the order before retrying.",
  duplicate_customer_order: "Check the customer/order history for a duplicate sale before retrying or dismissing the local copy.",
};

function saleItemProductId(item: any) {
  return item?.productId || item?.product_id || item?.id || null;
}

function saleItemName(item: any) {
  return item?.name || item?.productName || item?.product_name || null;
}

async function collectOfflineStockConflicts(conn: any, tenantId: string, items: any[] = []) {
  const totals = new Map<string, { quantity: number; name?: string | null }>();
  for (const item of items) {
    const productId = saleItemProductId(item);
    const quantity = Number(item?.quantity || 0);
    if (!productId || quantity <= 0) continue;
    const existing = totals.get(productId) || { quantity: 0, name: saleItemName(item) };
    totals.set(productId, {
      quantity: existing.quantity + quantity,
      name: existing.name || saleItemName(item),
    });
  }

  const conflicts: OfflineSyncConflict[] = [];
  for (const [productId, item] of totals.entries()) {
    const [rows] = await conn.query(
      `SELECT id, name, stock
         FROM products
        WHERE tenant_id = ? AND id = ?
        LIMIT 1
        FOR UPDATE`,
      [tenantId, productId]
    );
    const product = (rows as any[])[0];
    if (!product) continue;
    const availableStock = Number(product.stock || 0);
    if (availableStock < item.quantity) {
      conflicts.push({
        conflictType: "negative_stock_after_sync",
        recommendedAction: offlineSyncConflictActions.negative_stock_after_sync,
        message: `${product.name || item.name || productId} would go below zero after this offline sale sync.`,
        productId,
        itemName: product.name || item.name || null,
        requestedQuantity: item.quantity,
        availableStock,
      });
    }
  }
  return conflicts;
}

async function collectOfflineSaleSyncConflicts(conn: any, tenantId: string, sale: Partial<Sale>) {
  const conflicts: OfflineSyncConflict[] = [
    ...(await collectOfflineStockConflicts(conn, tenantId, Array.isArray(sale.items) ? sale.items : [])),
  ];
  const tableNumber = String(sale.tableNumber || "").trim();
  const tabName = String(sale.tabName || "").trim();
  const customerId = sale.customerId || null;

  if (tableNumber) {
    const [rows] = await conn.query(
      `SELECT id, table_number AS tableNumber, status
         FROM sales
        WHERE tenant_id = ?
          AND table_number = ?
          AND status IN ('open', 'kitchen', 'pending')
        LIMIT 1
        FOR UPDATE`,
      [tenantId, tableNumber]
    );
    const existingSale = (rows as any[])[0];
    if (existingSale) {
      conflicts.push({
        conflictType: "duplicate_table_or_tab",
        recommendedAction: offlineSyncConflictActions.duplicate_table_or_tab,
        message: `Table ${tableNumber} already has an open order while an offline sale is syncing.`,
        tableNumber,
        existingSaleId: existingSale.id || null,
      });
    }
  }

  if (sale.isTab && (tabName || customerId)) {
    const conditions: string[] = [];
    const values: any[] = [tenantId];
    if (tabName) {
      conditions.push("LOWER(tab_name) = LOWER(?)");
      values.push(tabName);
    }
    if (customerId) {
      conditions.push("customer_id = ?");
      values.push(customerId);
    }
    const [rows] = await conn.query(
      `SELECT id, tab_name AS tabName, customer_id AS customerId, status
         FROM sales
        WHERE tenant_id = ?
          AND is_tab = 1
          AND status IN ('open', 'kitchen', 'pending')
          AND (${conditions.join(" OR ")})
        LIMIT 1
        FOR UPDATE`,
      values
    );
    const existingSale = (rows as any[])[0];
    if (existingSale) {
      conflicts.push({
        conflictType: "duplicate_table_or_tab",
        recommendedAction: offlineSyncConflictActions.duplicate_table_or_tab,
        message: `Tab ${tabName || customerId} already has an open order while an offline sale is syncing.`,
        tabName: tabName || null,
        customerId,
        existingSaleId: existingSale.id || null,
      });
    }
  }

  if (customerId && !sale.isTab) {
    const [rows] = await conn.query(
      `SELECT id, status, total
         FROM sales
        WHERE tenant_id = ?
          AND customer_id = ?
          AND status IN ('open', 'kitchen', 'pending')
        LIMIT 1
        FOR UPDATE`,
      [tenantId, customerId]
    );
    const existingSale = (rows as any[])[0];
    if (existingSale) {
      conflicts.push({
        conflictType: "duplicate_customer_order",
        recommendedAction: offlineSyncConflictActions.duplicate_customer_order,
        message: `Customer ${customerId} already has an open order while an offline sale is syncing.`,
        customerId,
        existingSaleId: existingSale.id || null,
      });
    }
  }

  return conflicts;
}

export async function createProduct(
  tenantId: string,
  product: Omit<Product, "id">
): Promise<Product> {
  const id = `prod_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO products (
      id, tenant_id, name, price, cost_price, section, category, sub_category,
      stock, min_stock, image_url, barcode, workstation_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      product.name,
      product.price,
      product.costPrice || 0,
      product.section || null,
      product.category,
      product.subCategory || null,
      product.stock,
      product.minStock || 0,
      product.imageUrl || null,
      product.barcode || null,
      product.workstationId || null,
    ]
  );
  await syncDefaultProductLocationStock(tenantId, id, product.stock, product.minStock || 0);
  return { id, ...product };
}

export async function createCustomer(
  tenantId: string,
  customer: Omit<Customer, "id">
): Promise<Customer> {
  const id = `cust_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO customers (
      id, tenant_id, name, email, phone, address, notes,
      loyalty_points, loyalty_member_status, loyalty_tier_id, membership_card_id, membership_barcode, membership_started_at,
      wallet_balance, account_enabled, account_limit, account_balance, discount_percent, uid, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      customer.name,
      customer.email,
      customer.phone || null,
      customer.address || null,
      customer.notes || null,
      customer.loyaltyPoints || 0,
      (customer as any).loyaltyMemberStatus || "active",
      (customer as any).loyaltyTierId || null,
      (customer as any).membershipCardId || null,
      (customer as any).membershipBarcode || null,
      (customer as any).membershipStartedAt || ((customer as any).loyaltyMemberStatus === "opted_out" ? null : new Date().toISOString()),
      customer.walletBalance || 0,
      customer.accountEnabled ? 1 : 0,
      customer.accountLimit || 0,
      customer.accountBalance || 0,
      customer.discountPercent || 0,
      customer.uid || null,
    ]
  );
  const consents = (customer as any).consents !== undefined
    ? await upsertCustomerConsents(tenantId, id, (customer as any).consents, (customer as any).consentActor || {})
    : defaultCustomerConsentMap();
  return {
    id,
    ...customer,
    accountEnabled: Boolean(customer.accountEnabled),
    accountLimit: Number(customer.accountLimit || 0),
    accountBalance: Number(customer.accountBalance || 0),
    discountPercent: Number(customer.discountPercent || 0),
    loyaltyMemberStatus: ((customer as any).loyaltyMemberStatus || "active") as any,
    loyaltyTierId: (customer as any).loyaltyTierId || null,
    membershipCardId: (customer as any).membershipCardId || null,
    membershipBarcode: (customer as any).membershipBarcode || null,
    membershipStartedAt: (customer as any).membershipStartedAt || null,
    isAnonymized: false,
    anonymizedAt: null,
    anonymizedBy: null,
    anonymizedByName: null,
    anonymizationReason: null,
    consents,
  };
}

export async function createStaff(
  tenantId: string,
  staff: Omit<Staff, "id">
): Promise<Staff> {
  const id = `staff_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO staff (
      id, tenant_id, name, role, email, phone, status,
      permissions, assigned_sections, assigned_categories, id_number, pay_rate, pay_type,
      accumulated_leave, wallet_balance, discount_percent, default_location_id, assigned_location_ids,
      metrics, badges, rank, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      staff.name,
      staff.role,
      staff.email,
      staff.phone || null,
      staff.status || "active",
      staff.permissions ? JSON.stringify(staff.permissions) : "{}",
      staff.assignedSections ? JSON.stringify(staff.assignedSections) : "[]",
      staff.assignedCategories ? JSON.stringify(staff.assignedCategories) : "[]",
      staff.idNumber || null,
      staff.payRate || 0,
      staff.payType || null,
      staff.accumulatedLeave || 0,
      staff.walletBalance || 0,
      staff.discountPercent || 0,
      staff.defaultLocationId || DEFAULT_INVENTORY_LOCATION_ID,
      staff.assignedLocationIds ? JSON.stringify(staff.assignedLocationIds) : "[]",
      staff.metrics ? JSON.stringify(staff.metrics) : "{}",
      staff.badges ? JSON.stringify(staff.badges) : "[]",
      staff.rank || null,
    ]
  );
  return { id, ...staff };
}

export async function createWorkstation(
  tenantId: string,
  workstation: Omit<Workstation, "id">
): Promise<Workstation> {
  const id = `ws_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO workstations (id, tenant_id, name, type, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, tenantId, workstation.name, workstation.type, workstation.status || "active"]
  );
  return { id, ...workstation };
}

export async function createTableSection(
  tenantId: string,
  section: any
): Promise<any> {
  const id = `sec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  // Whitelist column names to prevent SQL injection
  const orderCol = isPostgres() 
    ? '"order"' 
    : '`order`';
  await query(
    `INSERT INTO table_sections (id, tenant_id, name, color, ${orderCol}, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, tenantId, section.name, section.color || null, section.order || 0]
  );
  return { id, ...section };
}

export async function createRestaurantTable(
  tenantId: string,
  table: any
): Promise<any> {
  const id = `tbl_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO restaurant_tables (id, tenant_id, label, section_id, capacity, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, tenantId, table.label, table.sectionId || null, table.capacity || 1, table.status || "active"]
  );
  return { id, ...table };
}

// ─────────────────────────────────────────────────────────────────────────
// UPDATE Operations
// ─────────────────────────────────────────────────────────────────────────

export async function updateProduct(
  tenantId: string,
  productId: string,
  updates: Partial<Product>
): Promise<Product> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.price !== undefined) {
    fields.push("price = ?");
    values.push(updates.price);
  }
  if (updates.costPrice !== undefined) {
    fields.push("cost_price = ?");
    values.push(updates.costPrice);
  }
  if (updates.section !== undefined) {
    fields.push("section = ?");
    values.push(updates.section);
  }
  if (updates.category !== undefined) {
    fields.push("category = ?");
    values.push(updates.category);
  }
  if (updates.subCategory !== undefined) {
    fields.push("sub_category = ?");
    values.push(updates.subCategory);
  }
  if (updates.stock !== undefined) {
    fields.push("stock = ?");
    values.push(updates.stock);
  }
  if (updates.minStock !== undefined) {
    fields.push("min_stock = ?");
    values.push(updates.minStock);
  }
  if (updates.imageUrl !== undefined) {
    fields.push("image_url = ?");
    values.push(updates.imageUrl);
  }
  if (updates.barcode !== undefined) {
    fields.push("barcode = ?");
    values.push(updates.barcode);
  }
  if (updates.workstationId !== undefined) {
    fields.push("workstation_id = ?");
    values.push(updates.workstationId);
  }

  fields.push("updated_at = NOW()");
  values.push(tenantId, productId);

  if (fields.length === 1) {
    // Only updated_at changed
    const rows = await query(
      `SELECT
        id,
        tenant_id AS tenantId,
        name,
        price,
        cost_price AS costPrice,
        section,
        category,
        sub_category AS subCategory,
        stock,
        min_stock AS minStock,
        image_url AS imageUrl,
        barcode,
        workstation_id AS workstationId,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM products
      WHERE tenant_id = ? AND id = ?`,
      [tenantId, productId]
    );
    return rows[0] as Product;
  }

  await query(
    `UPDATE products SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

  const rows = await query(
    `SELECT
      id,
      tenant_id AS tenantId,
      name,
      price,
      cost_price AS costPrice,
      section,
      category,
      sub_category AS subCategory,
      stock,
      min_stock AS minStock,
      image_url AS imageUrl,
      barcode,
      workstation_id AS workstationId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM products
    WHERE tenant_id = ? AND id = ?`,
    [tenantId, productId]
  );
  if (updates.stock !== undefined || updates.minStock !== undefined) {
    const row = (rows as any[])[0];
    await syncDefaultProductLocationStock(tenantId, productId, row?.stock, row?.minStock ?? row?.min_stock);
  }
  return rows[0] as Product;
}

export async function updateCustomer(
  tenantId: string,
  customerId: string,
  updates: Partial<Customer>
): Promise<Customer> {
  const fields: string[] = [];
  const values: any[] = [];
  const consentInput = (updates as any).consents;
  const consentActor = (updates as any).consentActor || {};

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.email !== undefined) {
    fields.push("email = ?");
    values.push(updates.email);
  }
  if (updates.phone !== undefined) {
    fields.push("phone = ?");
    values.push(updates.phone);
  }
  if (updates.address !== undefined) {
    fields.push("address = ?");
    values.push(updates.address);
  }
  if (updates.notes !== undefined) {
    fields.push("notes = ?");
    values.push(updates.notes);
  }
  if (updates.loyaltyPoints !== undefined) {
    fields.push("loyalty_points = ?");
    values.push(updates.loyaltyPoints);
  }
  if ((updates as any).loyaltyMemberStatus !== undefined) {
    fields.push("loyalty_member_status = ?");
    values.push((updates as any).loyaltyMemberStatus || "active");
  }
  if ((updates as any).loyaltyTierId !== undefined) {
    fields.push("loyalty_tier_id = ?");
    values.push((updates as any).loyaltyTierId || null);
  }
  if ((updates as any).membershipCardId !== undefined) {
    fields.push("membership_card_id = ?");
    values.push((updates as any).membershipCardId || null);
  }
  if ((updates as any).membershipBarcode !== undefined) {
    fields.push("membership_barcode = ?");
    values.push((updates as any).membershipBarcode || null);
  }
  if ((updates as any).membershipStartedAt !== undefined) {
    fields.push("membership_started_at = ?");
    values.push((updates as any).membershipStartedAt || null);
  }
  if (updates.walletBalance !== undefined) {
    fields.push("wallet_balance = ?");
    values.push(updates.walletBalance);
  }
  if (updates.accountEnabled !== undefined) {
    fields.push("account_enabled = ?");
    values.push(updates.accountEnabled ? 1 : 0);
  }
  if (updates.accountLimit !== undefined) {
    fields.push("account_limit = ?");
    values.push(updates.accountLimit);
  }
  if (updates.accountBalance !== undefined) {
    fields.push("account_balance = ?");
    values.push(updates.accountBalance);
  }
  if (updates.discountPercent !== undefined) {
    fields.push("discount_percent = ?");
    values.push(updates.discountPercent || 0);
  }
  if ((updates as any).accountBalanceDelta !== undefined) {
    fields.push("account_balance = GREATEST(0, COALESCE(account_balance, 0) + ?)");
    values.push((updates as any).accountBalanceDelta);
  }

  fields.push("updated_at = NOW()");
  values.push(tenantId, customerId);

  if (fields.length === 1) {
    const rows = await query(`SELECT * FROM customers WHERE tenant_id = ? AND id = ?`, [
      tenantId,
      customerId,
    ]);
    const r = rows[0] as any;
    const consents = consentInput !== undefined
      ? await upsertCustomerConsents(tenantId, customerId, consentInput, consentActor)
      : await listCustomerConsents(tenantId, customerId);
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      address: r.address,
      notes: r.notes,
      loyaltyPoints: r.loyalty_points !== null ? Number(r.loyalty_points) : 0,
      loyaltyMemberStatus: r.loyalty_member_status || "active",
      loyaltyTierId: r.loyalty_tier_id || null,
      membershipCardId: r.membership_card_id || null,
      membershipBarcode: r.membership_barcode || null,
      membershipStartedAt: r.membership_started_at || null,
      walletBalance: r.wallet_balance !== null ? Number(r.wallet_balance) : 0,
      accountEnabled: Boolean(r.account_enabled),
      accountLimit: r.account_limit !== null ? Number(r.account_limit) : 0,
      accountBalance: r.account_balance !== null ? Number(r.account_balance) : 0,
      discountPercent: r.discount_percent !== null ? Number(r.discount_percent) : 0,
      uid: r.uid,
      isAnonymized: Boolean(r.is_anonymized),
      anonymizedAt: r.anonymized_at || null,
      anonymizedBy: r.anonymized_by || null,
      anonymizedByName: r.anonymized_by_name || null,
      anonymizationReason: r.anonymization_reason || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      consents,
    } as Customer;
  }

  await query(
    `UPDATE customers SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

  const rows = await query(`SELECT * FROM customers WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    customerId,
  ]);
  const r = rows[0] as any;
  const consents = consentInput !== undefined
    ? await upsertCustomerConsents(tenantId, customerId, consentInput, consentActor)
    : await listCustomerConsents(tenantId, customerId);
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    address: r.address,
    notes: r.notes,
    loyaltyPoints: r.loyalty_points !== null ? Number(r.loyalty_points) : 0,
    loyaltyMemberStatus: r.loyalty_member_status || "active",
    loyaltyTierId: r.loyalty_tier_id || null,
    membershipCardId: r.membership_card_id || null,
    membershipBarcode: r.membership_barcode || null,
    membershipStartedAt: r.membership_started_at || null,
    walletBalance: r.wallet_balance !== null ? Number(r.wallet_balance) : 0,
    accountEnabled: Boolean(r.account_enabled),
    accountLimit: r.account_limit !== null ? Number(r.account_limit) : 0,
    accountBalance: r.account_balance !== null ? Number(r.account_balance) : 0,
    discountPercent: r.discount_percent !== null ? Number(r.discount_percent) : 0,
    uid: r.uid,
    isAnonymized: Boolean(r.is_anonymized),
    anonymizedAt: r.anonymized_at || null,
    anonymizedBy: r.anonymized_by || null,
    anonymizedByName: r.anonymized_by_name || null,
    anonymizationReason: r.anonymization_reason || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    consents,
  } as Customer;
}

export async function updateStaff(
  tenantId: string,
  staffId: string,
  updates: Partial<Staff>
): Promise<Staff> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.role !== undefined) {
    fields.push("role = ?");
    values.push(updates.role);
  }
  if (updates.email !== undefined) {
    fields.push("email = ?");
    values.push(updates.email);
  }
  if (updates.phone !== undefined) {
    fields.push("phone = ?");
    values.push(updates.phone);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.permissions !== undefined) {
    fields.push("permissions = ?");
    values.push(JSON.stringify(updates.permissions));
  }
  if (updates.assignedSections !== undefined) {
    fields.push("assigned_sections = ?");
    values.push(JSON.stringify(updates.assignedSections));
  }
  if (updates.assignedCategories !== undefined) {
    fields.push("assigned_categories = ?");
    values.push(JSON.stringify(updates.assignedCategories));
  }
  if (updates.idNumber !== undefined) {
    fields.push("id_number = ?");
    values.push(updates.idNumber);
  }
  if (updates.payRate !== undefined) {
    fields.push("pay_rate = ?");
    values.push(updates.payRate);
  }
  if (updates.payType !== undefined) {
    fields.push("pay_type = ?");
    values.push(updates.payType);
  }
  if (updates.accumulatedLeave !== undefined) {
    fields.push("accumulated_leave = ?");
    values.push(updates.accumulatedLeave);
  }
  if (updates.walletBalance !== undefined) {
    fields.push("wallet_balance = ?");
    values.push(updates.walletBalance);
  }
  if (updates.walletBalanceDelta !== undefined) {
    fields.push("wallet_balance = COALESCE(wallet_balance, 0) + ?");
    values.push(updates.walletBalanceDelta);
  }
  if (updates.discountPercent !== undefined) {
    fields.push("discount_percent = ?");
    values.push(updates.discountPercent || 0);
  }
  if (updates.defaultLocationId !== undefined) {
    fields.push("default_location_id = ?");
    values.push(updates.defaultLocationId || null);
  }
  if (updates.assignedLocationIds !== undefined) {
    fields.push("assigned_location_ids = ?");
    values.push(JSON.stringify(updates.assignedLocationIds || []));
  }
  if (updates.metrics !== undefined) {
    fields.push("metrics = ?");
    values.push(JSON.stringify(updates.metrics));
  }
  if (updates.badges !== undefined) {
    fields.push("badges = ?");
    values.push(JSON.stringify(updates.badges));
  }
  if (updates.rank !== undefined) {
    fields.push("rank = ?");
    values.push(updates.rank);
  }

  fields.push("updated_at = NOW()");
  values.push(tenantId, staffId);

  if (fields.length === 1) {
    const rows = await query(
      `SELECT
        id,
        name,
        role,
        email,
        phone,
        status,
        permissions,
        assigned_sections AS assignedSections,
        assigned_categories AS assignedCategories,
        id_number AS idNumber,
        pay_rate AS payRate,
        pay_type AS payType,
        accumulated_leave AS accumulatedLeave,
        wallet_balance AS walletBalance,
        discount_percent AS discountPercent,
        default_location_id AS defaultLocationId,
        assigned_location_ids AS assignedLocationIds,
        metrics,
        badges,
        rank,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM staff
      WHERE tenant_id = ? AND id = ?`,
      [tenantId, staffId]
    );
    const r = rows[0] as any;
    return {
      ...r,
      permissions: safeParse(r.permissions, {}),
      assignedSections: safeParse(r.assignedSections, []),
      assignedCategories: safeParse(r.assignedCategories, []),
      assignedLocationIds: safeParse(r.assignedLocationIds, []),
      walletBalance: r.walletBalance !== null ? Number(r.walletBalance) : 0,
      discountPercent: r.discountPercent !== null ? Number(r.discountPercent) : 0,
      metrics: safeParse(r.metrics, {}),
      badges: safeParse(r.badges, []),
    } as Staff;
  }

  await query(
    `UPDATE staff SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

  const rows = await query(
    `SELECT
      id,
      name,
      role,
      email,
      phone,
      status,
      permissions,
      assigned_sections AS assignedSections,
      assigned_categories AS assignedCategories,
      id_number AS idNumber,
      pay_rate AS payRate,
      pay_type AS payType,
      accumulated_leave AS accumulatedLeave,
      wallet_balance AS walletBalance,
      discount_percent AS discountPercent,
      default_location_id AS defaultLocationId,
      assigned_location_ids AS assignedLocationIds,
      metrics,
      badges,
      rank,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM staff
    WHERE tenant_id = ? AND id = ?`,
    [tenantId, staffId]
  );
  const r = rows[0] as any;
  return {
    ...r,
    permissions: safeParse(r.permissions, {}),
    assignedSections: safeParse(r.assignedSections, []),
    assignedCategories: safeParse(r.assignedCategories, []),
    assignedLocationIds: safeParse(r.assignedLocationIds, []),
    walletBalance: r.walletBalance !== null ? Number(r.walletBalance) : 0,
    discountPercent: r.discountPercent !== null ? Number(r.discountPercent) : 0,
    metrics: safeParse(r.metrics, {}),
    badges: safeParse(r.badges, []),
  } as Staff;
}

export async function updateTableSection(
  tenantId: string,
  sectionId: string,
  updates: any
): Promise<any> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.color !== undefined) {
    fields.push("color = ?");
    values.push(updates.color);
  }
  if (updates.order !== undefined) {
    const orderCol = isPostgres() ? '"order"' : "`order`";
    fields.push(`${orderCol} = ?`);
    values.push(updates.order);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = NOW()");
  values.push(tenantId, sectionId);

  await query(
    `UPDATE table_sections SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );
  return { id: sectionId, ...updates };
}

export async function updateRestaurantTable(
  tenantId: string,
  tableId: string,
  updates: any
): Promise<any> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.label !== undefined) {
    fields.push("label = ?");
    values.push(updates.label);
  }
  if (updates.sectionId !== undefined) {
    fields.push("section_id = ?");
    values.push(updates.sectionId);
  }
  if (updates.capacity !== undefined) {
    fields.push("capacity = ?");
    values.push(updates.capacity);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = NOW()");
  values.push(tenantId, tableId);

  await query(
    `UPDATE restaurant_tables SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );
  return { id: tableId, ...updates };
}

// ─────────────────────────────────────────────────────────────────────────
// DELETE Operations
// ─────────────────────────────────────────────────────────────────────────

export async function getVendors(tenantId: string): Promise<Vendor[]> {
  const rows = await query(
    `SELECT
       id,
       name,
       contact_person AS contactPerson,
       email,
       phone,
       address,
       status,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM vendors
     WHERE tenant_id = ?
     ORDER BY name ASC`,
    [tenantId]
  );
  return rows as Vendor[];
}

export async function createVendor(tenantId: string, vendor: Partial<Vendor>): Promise<Vendor> {
  const id = `vendor_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO vendors (
       id, tenant_id, name, contact_person, email, phone, address, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      vendor.name,
      vendor.contactPerson || null,
      vendor.email || null,
      vendor.phone || null,
      vendor.address || null,
      vendor.status || "active",
    ]
  );
  return { id, status: "active", ...vendor } as Vendor;
}

export async function updateVendor(tenantId: string, id: string, updates: Partial<Vendor>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
  if (updates.contactPerson !== undefined) { fields.push("contact_person = ?"); values.push(updates.contactPerson || null); }
  if (updates.email !== undefined) { fields.push("email = ?"); values.push(updates.email || null); }
  if (updates.phone !== undefined) { fields.push("phone = ?"); values.push(updates.phone || null); }
  if (updates.address !== undefined) { fields.push("address = ?"); values.push(updates.address || null); }
  if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status === "inactive" ? "inactive" : "active"); }
  if (fields.length === 0) return;
  fields.push("updated_at = NOW()");
  values.push(tenantId, id);
  await query(`UPDATE vendors SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`, values);
}

export async function getPurchaseOrders(tenantId: string): Promise<PurchaseOrder[]> {
  const rows = await query(
    `SELECT
       id,
       vendor_id AS vendorId,
       status,
       type,
       recurring_frequency AS recurringFrequency,
       items,
       total_amount AS totalAmount,
       expected_delivery_date AS expectedDeliveryDate,
       invoice_status AS invoiceStatus,
       invoice_number AS invoiceNumber,
       invoice_date AS invoiceDate,
       received_at AS receivedAt,
       received_by AS receivedBy,
       received_by_name AS receivedByName,
       receiving_note AS receivingNote,
       received_total_amount AS receivedTotalAmount,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM purchase_orders
     WHERE tenant_id = ?
     ORDER BY created_at DESC`,
    [tenantId]
  );
  return (rows as any[]).map((row) => ({
    ...row,
    items: safeParse(row.items, []),
    totalAmount: Number(row.totalAmount || 0),
    receivedTotalAmount: row.receivedTotalAmount !== null && row.receivedTotalAmount !== undefined
      ? Number(row.receivedTotalAmount || 0)
      : undefined,
  })) as PurchaseOrder[];
}

export async function createPurchaseOrder(tenantId: string, order: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
  const id = `po_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const items = Array.isArray(order.items) ? order.items : [];
  const totalAmount = Number(order.totalAmount ?? items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.expectedPrice || 0), 0));
  await query(
    `INSERT INTO purchase_orders (
       id, tenant_id, vendor_id, status, type, recurring_frequency, items,
       total_amount, expected_delivery_date, invoice_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      order.vendorId || null,
      order.status || "draft",
      order.type || "once_off",
      order.recurringFrequency || null,
      normalizeJsonField(items, []),
      totalAmount,
      order.expectedDeliveryDate || null,
      order.invoiceStatus || "unpaid",
    ]
  );
  return { id, status: "draft", type: "once_off", items, totalAmount, ...order } as PurchaseOrder;
}

export async function updatePurchaseOrder(tenantId: string, id: string, updates: Partial<PurchaseOrder>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.vendorId !== undefined) { fields.push("vendor_id = ?"); values.push(updates.vendorId || null); }
  if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
  if (updates.type !== undefined) { fields.push("type = ?"); values.push(updates.type); }
  if (updates.recurringFrequency !== undefined) { fields.push("recurring_frequency = ?"); values.push(updates.recurringFrequency || null); }
  if (updates.items !== undefined) { fields.push("items = ?"); values.push(normalizeJsonField(updates.items, [])); }
  if (updates.totalAmount !== undefined) { fields.push("total_amount = ?"); values.push(updates.totalAmount || 0); }
  if (updates.expectedDeliveryDate !== undefined) { fields.push("expected_delivery_date = ?"); values.push(updates.expectedDeliveryDate || null); }
  if (updates.invoiceStatus !== undefined) { fields.push("invoice_status = ?"); values.push(updates.invoiceStatus); }
  if (fields.length === 0) return;
  fields.push("updated_at = NOW()");
  values.push(tenantId, id);
  await query(`UPDATE purchase_orders SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`, values);
}

function serializeStockBatch(row: any): StockBatch {
  const remainingQuantity = Number(row.remainingQuantity ?? row.remaining_quantity ?? 0);
  const status = row.status || "active";
  const daysToExpiry = daysUntilDate(row.expiryDate ?? row.expiry_date);
  const expiryStatus =
    status === "depleted" || remainingQuantity <= 0 ? "depleted" :
    daysToExpiry !== null && daysToExpiry < 0 ? "expired" :
    daysToExpiry !== null && daysToExpiry <= 14 ? "expiring" :
    "ok";
  return {
    id: row.id,
    tenantId: row.tenantId ?? row.tenant_id,
    productId: row.productId ?? row.product_id,
    productName: row.productName ?? row.product_name,
    purchaseOrderId: row.purchaseOrderId ?? row.purchase_order_id ?? null,
    vendorId: row.vendorId ?? row.vendor_id ?? null,
    supplierInvoiceNumber: row.supplierInvoiceNumber ?? row.supplier_invoice_number ?? null,
    supplierInvoiceDate: row.supplierInvoiceDate ?? row.supplier_invoice_date ?? null,
    batchNumber: row.batchNumber ?? row.batch_number ?? null,
    receivedQuantity: Number(row.receivedQuantity ?? row.received_quantity ?? 0),
    remainingQuantity,
    unitCost: Number(row.unitCost ?? row.unit_cost ?? 0),
    expiryDate: row.expiryDate ?? row.expiry_date ?? null,
    receivedAt: row.receivedAt ?? row.received_at ?? null,
    receivedBy: row.receivedBy ?? row.received_by ?? null,
    receivedByName: row.receivedByName ?? row.received_by_name ?? null,
    locationId: row.locationId ?? row.location_id ?? DEFAULT_INVENTORY_LOCATION_ID,
    status,
    note: row.note || null,
    daysToExpiry,
    expiryStatus,
    rotationRank: null,
    rotationGuidance: expiryStatus === "depleted" ? "Depleted" : expiryStatus === "expired" ? "Expired stock - isolate" : "Hold",
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  } as StockBatch;
}

export async function getStockBatches(tenantId: string): Promise<StockBatch[]> {
  const rows = await query(
    `SELECT
       id,
       tenant_id AS tenantId,
       product_id AS productId,
       product_name AS productName,
       purchase_order_id AS purchaseOrderId,
       vendor_id AS vendorId,
       supplier_invoice_number AS supplierInvoiceNumber,
       supplier_invoice_date AS supplierInvoiceDate,
       batch_number AS batchNumber,
       received_quantity AS receivedQuantity,
       remaining_quantity AS remainingQuantity,
       unit_cost AS unitCost,
       expiry_date AS expiryDate,
       received_at AS receivedAt,
       received_by AS receivedBy,
       received_by_name AS receivedByName,
       location_id AS locationId,
       status,
       note,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM stock_batches
     WHERE tenant_id = ?
     ORDER BY
       CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
       expiry_date ASC,
       received_at ASC,
       created_at ASC`,
    [tenantId]
  );

  const batches = (rows as any[]).map(serializeStockBatch);
  const activeByProduct = new Map<string, number>();
  for (const batch of batches) {
    if (batch.expiryStatus === "depleted" || batch.expiryStatus === "expired") continue;
    const nextRank = (activeByProduct.get(batch.productId) || 0) + 1;
    activeByProduct.set(batch.productId, nextRank);
    batch.rotationRank = nextRank;
    batch.rotationGuidance =
      nextRank === 1 ? "Use first (FEFO)" :
      batch.expiryStatus === "expiring" ? "Use soon" :
      "Hold";
  }
  return batches;
}

type PurchaseOrderReceiveLine = {
  lineIndex?: number;
  productId?: string | null;
  receivedQuantity?: number | string | null;
  receivedPrice?: number | string | null;
  expiryDate?: string | null;
  batchNumber?: string | null;
  locationId?: string | null;
  note?: string | null;
};

type PurchaseOrderReceiveInput = {
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  invoiceStatus?: "unpaid" | "paid" | string | null;
  locationId?: string | null;
  note?: string | null;
  items?: PurchaseOrderReceiveLine[];
};

type PurchaseOrderReceiveActor = {
  staffId?: string | null;
  staffName?: string | null;
};

function cleanReceivingString(value: unknown, maxLength = 255) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanReceivingNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(3)) : fallback;
}

function receiveLineKeyForIndex(index: number) {
  return `index:${index}`;
}

function receiveLineKeyForProduct(productId: unknown) {
  return `product:${String(productId || "")}`;
}

export async function receivePurchaseOrder(
  tenantId: string,
  id: string,
  input: PurchaseOrderReceiveInput = {},
  actor: PurchaseOrderReceiveActor = {}
): Promise<PurchaseOrder> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT
         id,
         vendor_id AS vendorId,
         status,
         type,
         recurring_frequency AS recurringFrequency,
         items,
         total_amount AS totalAmount,
         expected_delivery_date AS expectedDeliveryDate,
         invoice_status AS invoiceStatus,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM purchase_orders
       WHERE tenant_id = ? AND id = ?
       LIMIT 1
       FOR UPDATE`,
      [tenantId, id]
    );
    const order = (rows as any[])[0];
    if (!order) throw new Error("Purchase order not found");
    if (order.status === "received") throw new Error("Purchase order has already been received");
    if (order.status === "cancelled") throw new Error("Cancelled purchase orders cannot be received");

    const items = safeParse(order.items, []);
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Purchase order has no items to receive");
    }

    const receiveItems = Array.isArray(input.items) ? input.items : [];
    const receiveByIndex = new Map<string, PurchaseOrderReceiveLine>();
    const receiveByProduct = new Map<string, PurchaseOrderReceiveLine>();
    for (const line of receiveItems) {
      if (line.lineIndex !== undefined && line.lineIndex !== null) {
        receiveByIndex.set(receiveLineKeyForIndex(Number(line.lineIndex)), line);
      }
      if (line.productId) {
        receiveByProduct.set(receiveLineKeyForProduct(line.productId), line);
      }
    }

    const invoiceNumber = cleanReceivingString(input.invoiceNumber, 128);
    const invoiceDate = cleanReceivingString(input.invoiceDate, 32);
    const receivingNote = cleanReceivingString(input.note, 1000);
    const requestedInvoiceStatus = input.invoiceStatus || order.invoiceStatus;
    const invoiceStatus = requestedInvoiceStatus === "paid" ? "paid" : "unpaid";
    const receivedAt = new Date().toISOString();
    const receivedItems: any[] = [];
    let totalReceivedQuantity = 0;
    let totalVarianceQuantity = 0;
    let receivedTotalAmount = 0;

    for (const [index, item] of items.entries()) {
      const productId = item.productId || item.product_id || null;
      if (!productId) throw new Error(`Purchase order line ${index + 1} is missing a product`);

      const lineInput = receiveByIndex.get(receiveLineKeyForIndex(index))
        || receiveByProduct.get(receiveLineKeyForProduct(productId))
        || {};
      const orderedQuantity = cleanReceivingNumber(item.quantity, 0);
      const receivedQuantity = cleanReceivingNumber(
        lineInput.receivedQuantity === undefined || lineInput.receivedQuantity === null
          ? orderedQuantity
          : lineInput.receivedQuantity,
        orderedQuantity
      );
      if (receivedQuantity < 0) throw new Error("Received quantity cannot be negative");

      const expectedPrice = cleanReceivingNumber(item.expectedPrice, 0);
      const receivedPrice = cleanReceivingNumber(
        lineInput.receivedPrice === undefined || lineInput.receivedPrice === null
          ? expectedPrice
          : lineInput.receivedPrice,
        expectedPrice
      );
      if (receivedPrice < 0) throw new Error("Received price cannot be negative");

      const batchNumber = cleanReceivingString(lineInput.batchNumber, 128);
      const expiryDate = cleanStockBatchDate(lineInput.expiryDate);
      const locationId = cleanReceivingString(lineInput.locationId || item.locationId || item.location_id || input.locationId, 64) || DEFAULT_INVENTORY_LOCATION_ID;
      const varianceQuantity = Number((receivedQuantity - orderedQuantity).toFixed(3));
      totalReceivedQuantity += receivedQuantity;
      totalVarianceQuantity += varianceQuantity;
      receivedTotalAmount += receivedQuantity * receivedPrice;

      if (receivedQuantity > 0) {
        const noteParts = [
          invoiceNumber ? `Invoice ${invoiceNumber}` : null,
          varianceQuantity !== 0 ? `Variance ${varianceQuantity}` : null,
          cleanReceivingString(lineInput.note, 500),
          receivingNote,
        ].filter(Boolean);
        const movement = await applyProductStockDelta(conn, {
          tenantId,
          productId,
          itemName: item.productName || item.name || null,
          quantityDelta: receivedQuantity,
          reason: "purchase_order_receiving",
          reasonCode: "receiving",
          referenceType: "purchase_order",
          referenceId: id,
          staffId: actor.staffId || null,
          staffName: actor.staffName || null,
          locationId,
          note: noteParts.join(" | ") || null,
        });
        if (!movement) throw new Error(`Product ${item.productName || productId} was not found for receiving`);
        await createReceivingStockBatch(conn, {
          tenantId,
          productId,
          productName: item.productName || item.name || productId,
          purchaseOrderId: id,
          vendorId: order.vendorId || null,
          supplierInvoiceNumber: invoiceNumber,
          supplierInvoiceDate: invoiceDate,
          batchNumber,
          receivedQuantity,
          unitCost: receivedPrice,
          expiryDate,
          receivedBy: actor.staffId || null,
          receivedByName: actor.staffName || null,
          locationId,
          note: noteParts.join(" | ") || null,
        });
      }

      receivedItems.push({
        ...item,
        receivedQuantity,
        receivedPrice,
        varianceQuantity,
        expiryDate,
        batchNumber,
        receivingNote: cleanReceivingString(lineInput.note, 500),
        receivedAt,
        receivedBy: actor.staffId || null,
        receivedByName: actor.staffName || null,
        locationId,
        invoiceNumber,
        invoiceDate,
      });
    }

    if (totalReceivedQuantity <= 0) {
      throw new Error("At least one received quantity is required");
    }

    receivedTotalAmount = Number(receivedTotalAmount.toFixed(2));
    await conn.query(
      `UPDATE purchase_orders
          SET status = ?,
              invoice_status = ?,
              items = ?,
              invoice_number = ?,
              invoice_date = ?,
              received_at = NOW(),
              received_by = ?,
              received_by_name = ?,
              receiving_note = ?,
              received_total_amount = ?,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [
        "received",
        invoiceStatus,
        normalizeJsonField(receivedItems, []),
        invoiceNumber,
        invoiceDate || null,
        actor.staffId || null,
        actor.staffName || null,
        receivingNote,
        receivedTotalAmount,
        tenantId,
        id,
      ]
    );

    await recordAuditEvent(conn, {
      tenantId,
      action: "purchase_order.received",
      entityType: "purchase_order",
      entityId: id,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      source: "inventory_receiving",
      details: {
        purchaseOrderId: id,
        invoiceNumber,
        invoiceDate,
        invoiceStatus,
        receivingNote,
        totalReceivedQuantity: Number(totalReceivedQuantity.toFixed(3)),
        totalVarianceQuantity: Number(totalVarianceQuantity.toFixed(3)),
        receivedTotalAmount,
        itemCount: receivedItems.length,
      },
    });

    await conn.commit();
    return {
      id,
      vendorId: order.vendorId,
      status: "received",
      type: order.type || "once_off",
      recurringFrequency: order.recurringFrequency || undefined,
      items: receivedItems,
      totalAmount: Number(order.totalAmount || 0),
      expectedDeliveryDate: order.expectedDeliveryDate || null,
      invoiceStatus: invoiceStatus as any,
      invoiceNumber: invoiceNumber || undefined,
      invoiceDate: invoiceDate || undefined,
      receivedAt,
      receivedBy: actor.staffId || undefined,
      receivedByName: actor.staffName || undefined,
      receivingNote: receivingNote || undefined,
      receivedTotalAmount,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    } as PurchaseOrder;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function deleteProduct(tenantId: string, productId: string): Promise<void> {
  await query(`DELETE FROM products WHERE tenant_id = ? AND id = ?`, [tenantId, productId]);
}

export async function deleteCustomer(
  tenantId: string,
  customerId: string,
  actor: { staffId?: string | null; staffName?: string | null; reason?: string | null } = {},
) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [customerRows] = await conn.query(
      `SELECT
         id,
         name,
         email,
         phone,
         wallet_balance AS walletBalance,
         account_balance AS accountBalance,
         is_anonymized AS isAnonymized,
         anonymized_at AS anonymizedAt
       FROM customers
       WHERE tenant_id = ? AND id = ?
       LIMIT 1
       FOR UPDATE`,
      [tenantId, customerId],
    );
    const customer = (customerRows as any[])[0];
    if (!customer) throw new Error("Customer not found.");

    const label = anonymizedCustomerName(customerId);
    if (Boolean(customer.isAnonymized ?? customer.is_anonymized)) {
      await conn.commit();
      return {
        success: true,
        mode: "already_anonymized",
        customerId,
        anonymizedName: customer.name || label,
        anonymizedAt: customer.anonymizedAt ?? customer.anonymized_at ?? null,
        blockers: [],
      };
    }

    const walletBalance = Number(customer.walletBalance ?? customer.wallet_balance ?? 0);
    const accountBalance = Number(customer.accountBalance ?? customer.account_balance ?? 0);
    const blockerChecks = [
      {
        code: "wallet_balance",
        count: walletBalance > 0.009 ? 1 : 0,
        message: `Settle or pay out the customer's wallet balance of R${walletBalance.toFixed(2)} before anonymizing.`,
      },
      {
        code: "account_balance",
        count: accountBalance > 0.009 ? 1 : 0,
        message: `Settle the customer's account balance of R${accountBalance.toFixed(2)} before anonymizing.`,
      },
      {
        code: "open_sales",
        count: await countRows(conn, `SELECT COUNT(*) AS count FROM sales WHERE tenant_id = ? AND customer_id = ? AND status IN ('pending','open','kitchen')`, [tenantId, customerId]),
        message: "Close or cancel open orders, tabs, and kitchen orders before anonymizing.",
      },
      {
        code: "active_laybys",
        count: await countRows(conn, `SELECT COUNT(*) AS count FROM layby_orders WHERE tenant_id = ? AND customer_id = ? AND status = 'active'`, [tenantId, customerId]),
        message: "Complete or cancel active lay-bys before anonymizing.",
      },
      {
        code: "pending_payouts",
        count: await countRows(conn, `SELECT COUNT(*) AS count FROM customer_payout_requests WHERE tenant_id = ? AND customer_id = ? AND status IN ('pending','approved')`, [tenantId, customerId]),
        message: "Resolve pending or approved customer payout requests before anonymizing.",
      },
      {
        code: "active_bookings",
        count: await countRows(conn, `SELECT COUNT(*) AS count FROM event_bookings WHERE tenant_id = ? AND customer_id = ? AND status IN ('inquiry','confirmed','in_progress')`, [tenantId, customerId]),
        message: "Complete or cancel active bookings before anonymizing.",
      },
    ];
    const blockers = blockerChecks.filter(item => item.count > 0);
    if (blockers.length > 0) {
      throw new Error(`Customer cannot be anonymized yet: ${blockers.map(item => item.message).join(" ")}`);
    }

    const reason = nullableText(actor.reason, 1000) || "Customer privacy deletion request";
    await conn.query(
      `UPDATE customers
          SET name = ?,
              email = NULL,
              phone = NULL,
              address = NULL,
              notes = NULL,
              loyalty_points = 0,
              loyalty_member_status = 'opted_out',
              loyalty_tier_id = NULL,
              membership_card_id = NULL,
              membership_barcode = NULL,
              membership_started_at = NULL,
              wallet_balance = 0,
              account_enabled = 0,
              account_limit = 0,
              account_balance = 0,
              discount_percent = 0,
              uid = NULL,
              is_anonymized = 1,
              anonymized_at = NOW(),
              anonymized_by = ?,
              anonymized_by_name = ?,
              anonymization_reason = ?,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [label, actor.staffId || null, actor.staffName || null, reason, tenantId, customerId],
    );

    await conn.query(
      `UPDATE customer_payout_requests
          SET customer_name = ?,
              customer_email = NULL,
              note = NULL,
              updated_at = NOW()
        WHERE tenant_id = ? AND customer_id = ?`,
      [label, tenantId, customerId],
    );
    await conn.query(
      `UPDATE payout_requests
          SET customer_name = ?,
              customer_email = NULL,
              note = NULL,
              updated_at = NOW()
        WHERE tenant_id = ? AND customer_id = ?`,
      [label, tenantId, customerId],
    );
    await conn.query(
      `UPDATE manager_cash_movements
          SET customer_name = ?
        WHERE tenant_id = ? AND customer_id = ?`,
      [label, tenantId, customerId],
    );
    await conn.query(
      `UPDATE layby_orders
          SET customer_name = ?,
              updated_at = NOW()
        WHERE tenant_id = ? AND customer_id = ?`,
      [label, tenantId, customerId],
    );
    await conn.query(
      `UPDATE event_bookings
          SET customer_name = ?,
              contact_phone = NULL,
              contact_email = NULL,
              menu_notes = NULL,
              internal_notes = NULL,
              reminder_note = NULL,
              updated_at = NOW()
        WHERE tenant_id = ? AND customer_id = ?`,
      [label, tenantId, customerId],
    );

    for (const consentType of CUSTOMER_CONSENT_TYPES) {
      const [consentRows] = await conn.query(
        `SELECT status
           FROM customer_consents
          WHERE tenant_id = ? AND customer_id = ? AND consent_type = ?
          LIMIT 1
          FOR UPDATE`,
        [tenantId, customerId, consentType],
      );
      const previousStatus = (consentRows as any[])[0]?.status || "unknown";
      if (isPostgres()) {
        await conn.query(
          `INSERT INTO customer_consents (
             id, tenant_id, customer_id, consent_type, status, source, note,
             captured_by, captured_by_name, captured_at, expires_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, 'revoked', 'customer_anonymization', ?, ?, ?, NOW(), NULL, NOW(), NOW())
           ON CONFLICT (tenant_id, customer_id, consent_type)
           DO UPDATE SET status = 'revoked',
                         source = EXCLUDED.source,
                         note = EXCLUDED.note,
                         captured_by = EXCLUDED.captured_by,
                         captured_by_name = EXCLUDED.captured_by_name,
                         captured_at = EXCLUDED.captured_at,
                         expires_at = NULL,
                         updated_at = NOW()`,
          [`consent_${Date.now()}_${Math.random().toString(36).substring(7)}`, tenantId, customerId, consentType, reason, actor.staffId || null, actor.staffName || null],
        );
      } else {
        await conn.query(
          `INSERT INTO customer_consents (
             id, tenant_id, customer_id, consent_type, status, source, note,
             captured_by, captured_by_name, captured_at, expires_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, 'revoked', 'customer_anonymization', ?, ?, ?, NOW(), NULL, NOW(), NOW())
           ON DUPLICATE KEY UPDATE status = 'revoked',
                                   source = VALUES(source),
                                   note = VALUES(note),
                                   captured_by = VALUES(captured_by),
                                   captured_by_name = VALUES(captured_by_name),
                                   captured_at = VALUES(captured_at),
                                   expires_at = NULL,
                                   updated_at = NOW()`,
          [`consent_${Date.now()}_${Math.random().toString(36).substring(7)}`, tenantId, customerId, consentType, reason, actor.staffId || null, actor.staffName || null],
        );
      }
      await conn.query(
        `INSERT INTO customer_consent_events (
           id, tenant_id, customer_id, consent_type, previous_status, status,
           source, note, captured_by, captured_by_name, captured_at, created_at
         ) VALUES (?, ?, ?, ?, ?, 'revoked', 'customer_anonymization', ?, ?, ?, NOW(), NOW())`,
        [makeCustomerConsentEventId(), tenantId, customerId, consentType, previousStatus, reason, actor.staffId || null, actor.staffName || null],
      );
    }

    const retainedSaleCount = await countRows(conn, `SELECT COUNT(*) AS count FROM sales WHERE tenant_id = ? AND customer_id = ?`, [tenantId, customerId]);
    await recordAuditEvent(conn, {
      tenantId,
      action: "customer.anonymized",
      entityType: "customer",
      entityId: customerId,
      customerId,
      staffId: actor.staffId || null,
      staffName: actor.staffName || null,
      source: "customer_privacy",
      details: {
        reason,
        anonymizedName: label,
        retainedSaleCount,
        hadEmail: Boolean(customer.email),
        hadPhone: Boolean(customer.phone),
        consentStatusesRevoked: CUSTOMER_CONSENT_TYPES,
      },
    });

    await conn.commit();
    return {
      success: true,
      mode: "anonymized",
      customerId,
      anonymizedName: label,
      retainedSaleCount,
      revokedConsentTypes: [...CUSTOMER_CONSENT_TYPES],
      blockers: [],
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function deleteStaff(tenantId: string, staffId: string): Promise<void> {
  await query(`DELETE FROM staff WHERE tenant_id = ? AND id = ?`, [tenantId, staffId]);
}

export async function deleteWorkstation(tenantId: string, workstationId: string): Promise<void> {
  await query(`DELETE FROM workstations WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    workstationId,
  ]);
}

export async function deleteTableSection(tenantId: string, sectionId: string): Promise<void> {
  await query(`DELETE FROM table_sections WHERE tenant_id = ? AND id = ?`, [tenantId, sectionId]);
}

export async function deleteRestaurantTable(tenantId: string, tableId: string): Promise<void> {
  await query(`DELETE FROM restaurant_tables WHERE tenant_id = ? AND id = ?`, [tenantId, tableId]);
}

// ─────────────────────────────────────────────────────────────────────────
// Sale Operations
// ─────────────────────────────────────────────────────────────────────────

export async function createSale(tenantId: string, sale: Partial<Sale>): Promise<Sale> {
  const offlineEventId = (sale as any).offlineEventId || null;

  // Idempotency: if this offline sale was already synced, return the existing record
  if (offlineEventId) {
    const [existing] = await query(
      `SELECT id FROM sales WHERE tenant_id = ? AND offline_event_id = ? LIMIT 1`,
      [tenantId, offlineEventId]
    );
    if ((existing as any[])[0]) {
      const existingId = (existing as any[])[0].id;
      const existingSale = await getSaleById(tenantId, existingId);
      if (existingSale) return existingSale;
    }
  }

  const id = `sale_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await assertCurrentTaxPeriodOpen(conn, tenantId, "create sale");

    const syncSource = offlineEventId ? 'offline' : ((sale as any).syncSource || 'online');
    const offlineSyncConflicts = offlineEventId
      ? await collectOfflineSaleSyncConflicts(conn, tenantId, sale)
      : [];
    const completedSale = (sale.status || "pending") === "completed" && ((sale as any).transactionType || "sale") === "sale";
    let promotionValidation: PromotionValidationResult | null = null;
    if (completedSale && saleHasPromotionInput(sale)) {
      promotionValidation = await validatePromotionForSale(conn, tenantId, promotionInputFromSale(sale), {
        lock: true,
        assertClientDiscount: true,
      });
      if (!promotionValidation.valid || !promotionValidation.promotion) {
        throw new Error(promotionValidation.reason || "Promotion could not be applied.");
      }
      (sale as any).promotionId = promotionValidation.promotion.id;
      (sale as any).promotionCode = promotionValidation.promotion.code;
      (sale as any).promotionDiscount = promotionValidation.discountAmount;
    }

    await conn.query(
      `INSERT INTO sales (
        id, tenant_id, customer_id, user_id, staff_id, total, subtotal, tax_amount,
        tax_rate, tax_inclusive, payment_method, tendered_amount, change_amount,
        tip_amount, cash_out_amount, points_discount, promotion_id, promotion_code, promotion_discount, status, payfast_payment_id,
        transaction_type, parent_sale_id, refund_status, refunded_amount, refund_reason, refunded_by,
        void_reason, voided_by,
        table_number, is_tab, tab_name,
        offline_event_id, sync_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        tenantId,
        sale.customerId || null,
        sale.userId || null,
        sale.staffId || null,
        sale.total || 0,
        sale.subtotal || 0,
        sale.taxAmount || 0,
        sale.taxRate || 0,
        sale.taxInclusive ? 1 : 0,
        sale.paymentMethod || "pending",
        sale.tenderedAmount || 0,
        sale.changeAmount || 0,
        sale.tipAmount || 0,
        sale.cashOutAmount || 0,
        sale.pointsDiscount || 0,
        (sale as any).promotionId || null,
        (sale as any).promotionCode || null,
        (sale as any).promotionDiscount || 0,
        sale.status || "pending",
        sale.payfast_payment_id || null,
        (sale as any).transactionType || "sale",
        (sale as any).parentSaleId || null,
        (sale as any).refundStatus || "none",
        (sale as any).refundedAmount || 0,
        (sale as any).refundReason || null,
        (sale as any).refundedBy || null,
        (sale as any).voidReason || null,
        (sale as any).voidedBy || null,
        sale.tableNumber || null,
        sale.isTab ? 1 : 0,
        sale.tabName || null,
        offlineEventId,
        syncSource,
      ]
    );

    // Insert items & Deduct stock
    if (sale.items && Array.isArray(sale.items)) {
      for (const item of sale.items) {
        const itemId = generateSaleItemId();
        const productId = (item as any).productId || item.id || null;
        const stampSentAt = shouldStampWorkstationSentAt(sale.status || "pending", item);
        const orderedAtSql = stampSentAt ? timerNowExpression() : "NULL";
        
        await conn.query(
          `INSERT INTO sale_items (
            id, sale_id, product_id, product_name, price, quantity, status,
            workstation_id, ordered_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${orderedAtSql}, NOW(), NOW())`,
          [
            itemId,
            id,
            productId,
            item.name,
            item.price,
            item.quantity,
            (item as OrderItem).status || "pending",
            item.workstationId || null,
          ]
        );

        // 1. Deduct Bulk Stock from Recipe
        if (productId) {
          const [recipe] = await conn.query<any>(
            `SELECT
               r.bulk_item_id,
               r.quantity,
               r.yield_quantity,
               r.waste_percent,
               r.substitute_group,
               r.substitute_rank,
               r.is_optional,
               COALESCE(b.stock, 0) AS stock
             FROM product_recipes r
             LEFT JOIN bulk_items b ON b.id = r.bulk_item_id
             WHERE r.product_id = ?
             ORDER BY COALESCE(r.substitute_group, ''), r.substitute_rank ASC, r.bulk_item_id ASC`,
            [productId]
          );
          const standaloneRows: any[] = [];
          const substitutionGroups = new Map<string, any[]>();
          for (const r of recipe) {
            const group = nullableText(r.substitute_group, 64);
            if (!group) {
              standaloneRows.push(r);
              continue;
            }
            substitutionGroups.set(group, [...(substitutionGroups.get(group) || []), r]);
          }
          const rowsToDeduct = [
            ...standaloneRows,
            ...Array.from(substitutionGroups.values()).map((rows) => chooseRecipeSubstitution(rows, item.quantity)),
          ].filter(Boolean);

          for (const r of rowsToDeduct) {
            await conn.query(
              `UPDATE bulk_items SET stock = stock - ? WHERE id = ?`,
              [recipeEffectiveQuantity(r, item.quantity), r.bulk_item_id]
            );
          }
        }

        // 2. Deduct Bulk Stock from Modifiers
        if (item.selectedModifiers && Array.isArray(item.selectedModifiers)) {
          for (const mod of item.selectedModifiers) {
            const [opt] = await conn.query<any>(
              `SELECT bulk_item_id, bulk_quantity FROM modifier_options WHERE id = ?`,
              [mod.optionId]
            );
            if (opt.length > 0 && opt[0].bulk_item_id) {
              await conn.query(
                `UPDATE bulk_items SET stock = stock - ? WHERE id = ?`,
                [opt[0].bulk_quantity * item.quantity, opt[0].bulk_item_id]
              );
            }
          }
        }
      }
    }

    if (completedSale) {
      await deductCompletedSaleProductStock(conn, tenantId, sale.items || [], {
        saleId: id,
        staffId: sale.staffId || null,
        note: "Completed sale stock deduction",
      });
    }

    // Insert payments
    if (sale.payments && Array.isArray(sale.payments)) {
      for (const p of sale.payments) {
        const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await conn.query(
          `INSERT INTO sale_payments (
            id, sale_id, method, amount, tendered_amount, change_amount, tip_amount, cash_out_amount,
            provider, provider_device_id, provider_reference, authorization_code, provider_status, provider_note, qr_payload,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            paymentId,
            id,
            p.method,
            p.amount,
            p.tenderedAmount || 0,
            p.changeAmount || 0,
            p.tipAmount || 0,
            p.cashOutAmount || 0,
            ...paymentProviderValues(p),
          ]
        );
      }
    }

    if (completedSale && promotionValidation) {
      await recordPromotionRedemption(conn, tenantId, id, promotionInputFromSale(sale), promotionValidation, sale.staffId || null);
    }

    const walletSalePayment = completedSale
      ? await applyWalletSalePayment(conn, tenantId, id, {
        customerId: sale.customerId || null,
        staffId: sale.staffId || null,
        payments: sale.payments as any[] | undefined,
      })
      : null;
    let loyaltyAward: LoyaltyAwardResult | null = null;
    if (completedSale && sale.customerId) {
      loyaltyAward = await calculateLoyaltyAward(conn, tenantId, loyaltyInputFromSale(sale));
      if (loyaltyAward.enabled && loyaltyAward.customerFound && loyaltyAward.memberStatus === "active") {
        (sale as any).loyaltyPoints = loyaltyAward.nextPoints;
        (sale as any).loyaltyPointsEarned = loyaltyAward.pointsEarned;
      }
    }

    await recordAuditEvent(conn, {
      tenantId,
      action: "sale.created",
      entityType: "sale",
      entityId: id,
      relatedSaleId: id,
      staffId: sale.staffId || null,
      customerId: sale.customerId || null,
      details: {
        status: sale.status || "pending",
        transactionType: (sale as any).transactionType || "sale",
        paymentMethod: sale.paymentMethod || "pending",
        paymentProviders: paymentProviderSummary(sale.payments as any[] | undefined),
        total: Number(sale.total || 0),
        itemCount: Array.isArray(sale.items) ? sale.items.length : 0,
        walletPaymentAmount: walletSalePayment?.walletAmount || 0,
        loyaltyPointsEarned: loyaltyAward?.pointsEarned || 0,
        loyaltyPointsRedeemed: loyaltyAward?.pointsRedeemed || 0,
        loyaltyTier: loyaltyAward?.tier?.name || null,
        promotionCode: (sale as any).promotionCode || null,
        promotionDiscount: Number((sale as any).promotionDiscount || 0),
        offlineEventId,
        syncSource,
        cashSessionId: (sale as any).cashSessionId || null,
        deviceId: (sale as any).deviceId || null,
        localReceiptNumber: (sale as any).localReceiptNumber || null,
      },
    });

    // Record offline sync audit event when this is an offline sync
    if (offlineEventId) {
      await recordAuditEvent(conn, {
        tenantId,
        action: "offline.sale_synced",
        entityType: "sale",
        entityId: id,
        relatedSaleId: id,
        staffId: sale.staffId || null,
        customerId: sale.customerId || null,
        details: {
          offlineEventId,
          localReceiptNumber: (sale as any).localReceiptNumber || null,
          deviceId: (sale as any).deviceId || null,
          syncBatchId: (sale as any).syncBatchId || null,
          syncSequence: (sale as any).syncSequence ?? null,
          syncEventType: (sale as any).syncEventType || null,
          syncEventVersion: (sale as any).syncEventVersion || null,
        },
      });

      if (offlineSyncConflicts.length > 0) {
        const primaryConflict = offlineSyncConflicts[0];
        await recordAuditEvent(conn, {
          tenantId,
          action: "offline.sync_conflict",
          entityType: "sale",
          entityId: id,
          relatedSaleId: id,
          staffId: sale.staffId || null,
          customerId: sale.customerId || null,
          source: "offline_queue",
          details: {
            offlineEventId,
            localReceiptNumber: (sale as any).localReceiptNumber || null,
            deviceId: (sale as any).deviceId || null,
            operation: "create_sale",
            syncBatchId: (sale as any).syncBatchId || null,
            syncSequence: (sale as any).syncSequence ?? null,
            syncEventType: (sale as any).syncEventType || null,
            conflictType: primaryConflict.conflictType,
            recommendedAction: primaryConflict.recommendedAction,
            message: primaryConflict.message,
            conflicts: offlineSyncConflicts,
          },
        });
      }
    }

    // Transaction-safe checkout side effects (atomic with sale)
    if ((sale.status || "pending") === "completed") {
      await applyCheckoutSideEffects(conn, tenantId, id, {
        staffId: sale.staffId || null,
        customerId: sale.customerId || null,
        cashSessionId: (sale as any).cashSessionId || null,
        loyaltyPoints: (sale as any).loyaltyPoints,
        expectedCashDelta: (sale as any).expectedCashDelta,
        tipsDelta: (sale as any).tipsDelta,
        cashMovements: (sale as any).cashMovements,
        staffMetrics: (sale as any).staffMetrics || null,
        accountBalanceDelta: (sale as any).accountBalanceDelta,
      });
    }

    await conn.commit();
    return { id, ...sale } as Sale;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function generateSaleItemId() {
  return `item_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

function shouldStampWorkstationSentAt(status: unknown, item: any) {
  return String(status || "").toLowerCase() === "kitchen" && Boolean(item?.workstationId);
}

function timestampExpression(value: unknown, fallbackSql = "NULL") {
  return value ? "?" : fallbackSql;
}

function timerNowExpression() {
  return typeof isPostgres === "function" && isPostgres() ? "CURRENT_TIMESTAMP" : "UTC_TIMESTAMP()";
}

export async function updateSale(
  tenantId: string,
  saleId: string,
  updates: Partial<Sale>
): Promise<Sale> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [existingSaleResult] = await conn.query<any>(
      `SELECT status, transaction_type, staff_id, customer_id, offline_event_id FROM sales WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantId, saleId]
    );
    const existingSale = (existingSaleResult as any[])[0] || null;
    const updateOfflineEventId = (updates as any).offlineEventId || null;

    if (updateOfflineEventId && existingSale?.offline_event_id === updateOfflineEventId && existingSale?.status === "completed") {
      await conn.commit();
      const sale = await getSaleById(tenantId, saleId);
      if (sale) return sale;
    }

    await assertSaleNotInLockedTaxPeriod(conn, tenantId, saleId, "update sale");

    const nextStatus = updates.status !== undefined ? updates.status : existingSale?.status;
    const nextTransactionType = (updates as any).transactionType !== undefined ? ((updates as any).transactionType || "sale") : (existingSale?.transaction_type || "sale");
    const completingSale = existingSale?.status !== "completed" && nextStatus === "completed" && nextTransactionType === "sale";
    let promotionValidation: PromotionValidationResult | null = null;
    if (completingSale && saleHasPromotionInput(updates)) {
      const actualCustomerId = updates.customerId !== undefined ? (updates.customerId || null) : (existingSale?.customer_id || null);
      const promotionSale: any = {
        ...updates,
        customerId: actualCustomerId,
      };
      if (!Array.isArray(promotionSale.items)) {
        const [saleItemsResult] = await conn.query<any>(
          `SELECT product_id AS productId, product_name AS name, price, quantity FROM sale_items WHERE sale_id = ?`,
          [saleId]
        );
        promotionSale.items = saleItemsResult as any[];
      }
      promotionValidation = await validatePromotionForSale(conn, tenantId, promotionInputFromSale(promotionSale), {
        lock: true,
        assertClientDiscount: true,
      });
      if (!promotionValidation.valid || !promotionValidation.promotion) {
        throw new Error(promotionValidation.reason || "Promotion could not be applied.");
      }
      (updates as any).promotionId = promotionValidation.promotion.id;
      (updates as any).promotionCode = promotionValidation.promotion.code;
      (updates as any).promotionDiscount = promotionValidation.discountAmount;
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.customerId !== undefined) {
      fields.push("customer_id = ?");
      values.push(updates.customerId || null);
    }
    if (updates.userId !== undefined) {
      fields.push("user_id = ?");
      values.push(updates.userId || null);
    }
    if (updates.staffId !== undefined) {
      fields.push("staff_id = ?");
      values.push(updates.staffId || null);
    }
    if (updates.total !== undefined) {
      fields.push("total = ?");
      values.push(updates.total || 0);
    }
    if (updates.subtotal !== undefined) {
      fields.push("subtotal = ?");
      values.push(updates.subtotal || 0);
    }
    if (updates.taxAmount !== undefined) {
      fields.push("tax_amount = ?");
      values.push(updates.taxAmount || 0);
    }
    if (updates.taxRate !== undefined) {
      fields.push("tax_rate = ?");
      values.push(updates.taxRate || 0);
    }
    if (updates.taxInclusive !== undefined) {
      fields.push("tax_inclusive = ?");
      values.push(updates.taxInclusive ? 1 : 0);
    }
    if (updates.paymentMethod !== undefined) {
      fields.push("payment_method = ?");
      values.push(updates.paymentMethod);
    }
    if (updates.tenderedAmount !== undefined) {
      fields.push("tendered_amount = ?");
      values.push(updates.tenderedAmount || 0);
    }
    if (updates.changeAmount !== undefined) {
      fields.push("change_amount = ?");
      values.push(updates.changeAmount || 0);
    }
    if (updates.tipAmount !== undefined) {
      fields.push("tip_amount = ?");
      values.push(updates.tipAmount || 0);
    }
    if (updates.cashOutAmount !== undefined) {
      fields.push("cash_out_amount = ?");
      values.push(updates.cashOutAmount || 0);
    }
    if (updates.pointsDiscount !== undefined) {
      fields.push("points_discount = ?");
      values.push(updates.pointsDiscount || 0);
    }
    if ((updates as any).promotionId !== undefined) {
      fields.push("promotion_id = ?");
      values.push((updates as any).promotionId || null);
    }
    if ((updates as any).promotionCode !== undefined) {
      fields.push("promotion_code = ?");
      values.push((updates as any).promotionCode || null);
    }
    if ((updates as any).promotionDiscount !== undefined) {
      fields.push("promotion_discount = ?");
      values.push((updates as any).promotionDiscount || 0);
    }
    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if ((updates as any).transactionType !== undefined) {
      fields.push("transaction_type = ?");
      values.push((updates as any).transactionType || "sale");
    }
    if ((updates as any).parentSaleId !== undefined) {
      fields.push("parent_sale_id = ?");
      values.push((updates as any).parentSaleId || null);
    }
    if ((updates as any).refundStatus !== undefined) {
      fields.push("refund_status = ?");
      values.push((updates as any).refundStatus || "none");
    }
    if ((updates as any).refundedAmount !== undefined) {
      fields.push("refunded_amount = ?");
      values.push((updates as any).refundedAmount || 0);
    }
    if ((updates as any).refundReason !== undefined) {
      fields.push("refund_reason = ?");
      values.push((updates as any).refundReason || null);
    }
    if ((updates as any).refundedBy !== undefined) {
      fields.push("refunded_by = ?");
      values.push((updates as any).refundedBy || null);
    }
    if ((updates as any).voidReason !== undefined) {
      fields.push("void_reason = ?");
      values.push((updates as any).voidReason || null);
    }
    if ((updates as any).voidedBy !== undefined) {
      fields.push("voided_by = ?");
      values.push((updates as any).voidedBy || null);
    }
    if (updates.payfast_payment_id !== undefined) {
      fields.push("payfast_payment_id = ?");
      values.push(updates.payfast_payment_id || null);
    }
    if (updates.tableNumber !== undefined) {
      fields.push("table_number = ?");
      values.push(updates.tableNumber || null);
    }
    if (updates.isTab !== undefined) {
      fields.push("is_tab = ?");
      values.push(updates.isTab ? 1 : 0);
    }
    if (updates.tabName !== undefined) {
      fields.push("tab_name = ?");
      values.push(updates.tabName || null);
    }
    if ((updates as any).offlineEventId !== undefined) {
      fields.push("offline_event_id = ?");
      values.push((updates as any).offlineEventId || null);
    }
    if ((updates as any).syncSource !== undefined) {
      fields.push("sync_source = ?");
      values.push((updates as any).syncSource || 'online');
    }
    if (fields.length > 0) {
      fields.push("updated_at = NOW()");
      values.push(tenantId, saleId);
      await conn.query(
        `UPDATE sales SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
        values
      );
    }

    if (updates.items !== undefined) {
      // Get existing items to preserve their status and timestamps
      let existingItems: any[] = [];
      try {
        const [result] = await conn.query<any>(`SELECT * FROM sale_items WHERE sale_id = ?`, [saleId]);
        existingItems = result;
      } catch (error) {
        console.warn('Failed to fetch existing items:', error);
      }
      
      const existingMap = new Map();
      for (const ex of existingItems) {
        existingMap.set(ex.id, ex);
      }

      await conn.query(`DELETE FROM sale_items WHERE sale_id = ?`, [saleId]);

      for (const rawItem of updates.items) {
        const item = rawItem as OrderItem & { productId?: string };
        const saleItemId = item.id && item.productId ? item.id : generateSaleItemId();
        const productId = item.productId || item.id || null;
        
        // Preserve status and timestamps if it exists
        const ex = existingMap.get(saleItemId);
        const finalStatus = ex ? ex.status : (item.status || "pending");
        const shouldStampSentAt = !ex?.ordered_at && shouldStampWorkstationSentAt(nextStatus, item);
        const finalOrderedAt = ex?.ordered_at || null;
        const finalAcceptedAt = ex?.accepted_at || null;
        const finalReadyAt = ex?.ready_at || null;
        const finalDeliveredAt = ex?.delivered_at || null;
        const orderedAtSql = shouldStampSentAt ? timerNowExpression() : timestampExpression(finalOrderedAt);
        const acceptedAtSql = timestampExpression(finalAcceptedAt);
        const readyAtSql = timestampExpression(finalReadyAt);
        const deliveredAtSql = timestampExpression(finalDeliveredAt);
        const timestampValues = [
          ...(finalOrderedAt && !shouldStampSentAt ? [finalOrderedAt] : []),
          ...(finalAcceptedAt ? [finalAcceptedAt] : []),
          ...(finalReadyAt ? [finalReadyAt] : []),
          ...(finalDeliveredAt ? [finalDeliveredAt] : []),
        ];

        await conn.query(
          `INSERT INTO sale_items (
            id, sale_id, product_id, product_name, price, quantity, status,
            workstation_id, ordered_at, accepted_at, ready_at, delivered_at,
            action_staff_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${orderedAtSql}, ${acceptedAtSql}, ${readyAtSql}, ${deliveredAtSql}, ?, NOW(), NOW())`,
          [
            saleItemId,
            saleId,
            productId,
            item.name,
            item.price || 0,
            item.quantity || 0,
            finalStatus,
            item.workstationId || null,
            ...timestampValues,
            item.actionStaffId || null,
          ]
        );
      }
    }

    if (updates.payments !== undefined) {
      await conn.query(`DELETE FROM sale_payments WHERE sale_id = ?`, [saleId]);
      for (const p of updates.payments) {
        const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await conn.query(
          `INSERT INTO sale_payments (
            id, sale_id, method, amount, tendered_amount, change_amount, tip_amount, cash_out_amount,
            provider, provider_device_id, provider_reference, authorization_code, provider_status, provider_note, qr_payload,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            paymentId,
            saleId,
            p.method,
            p.amount,
            p.tenderedAmount || 0,
            p.changeAmount || 0,
            p.tipAmount || 0,
            p.cashOutAmount || 0,
            ...paymentProviderValues(p),
          ]
        );
      }
    }

    const shouldDeductStock = completingSale;
    let walletSalePayment: Awaited<ReturnType<typeof applyWalletSalePayment>> | null = null;
    let offlineSyncConflicts: OfflineSyncConflict[] = [];
    let loyaltyAward: LoyaltyAwardResult | null = null;
    if (shouldDeductStock) {
      let itemsForStock = updates.items as any[] | undefined;
      if (!itemsForStock) {
        const [saleItemsResult] = await conn.query<any>(
          `SELECT product_id, product_name, quantity FROM sale_items WHERE sale_id = ?`,
          [saleId]
        );
        itemsForStock = saleItemsResult as any[];
      }
      if (updateOfflineEventId) {
        offlineSyncConflicts = await collectOfflineStockConflicts(conn, tenantId, itemsForStock || []);
      }
      await deductCompletedSaleProductStock(conn, tenantId, itemsForStock || [], {
        saleId,
        staffId: updates.staffId || existingSale?.staff_id || null,
        note: "Sale status changed to completed",
      });
      if (promotionValidation) {
        await recordPromotionRedemption(
          conn,
          tenantId,
          saleId,
          promotionInputFromSale({
            ...updates,
            customerId: updates.customerId !== undefined ? (updates.customerId || null) : (existingSale?.customer_id || null),
            items: itemsForStock || [],
          }),
          promotionValidation,
          updates.staffId || existingSale?.staff_id || null
        );
      }
      const actualCustomerIdForLoyalty = updates.customerId !== undefined ? (updates.customerId || null) : (existingSale?.customer_id || null);
      if (actualCustomerIdForLoyalty) {
        loyaltyAward = await calculateLoyaltyAward(conn, tenantId, loyaltyInputFromSale({
          ...updates,
          customerId: actualCustomerIdForLoyalty,
          items: itemsForStock || [],
        }));
        if (loyaltyAward.enabled && loyaltyAward.customerFound && loyaltyAward.memberStatus === "active") {
          (updates as any).loyaltyPoints = loyaltyAward.nextPoints;
          (updates as any).loyaltyPointsEarned = loyaltyAward.pointsEarned;
        }
      }

      let paymentsForWallet = updates.payments as any[] | undefined;
      if (!paymentsForWallet) {
        const [paymentRows] = await conn.query<any>(
          `SELECT method, amount
             FROM sale_payments
            WHERE sale_id = ?`,
          [saleId]
        );
        paymentsForWallet = paymentRows as any[];
      }
      walletSalePayment = await applyWalletSalePayment(conn, tenantId, saleId, {
        customerId: updates.customerId !== undefined ? updates.customerId || null : existingSale?.customer_id || null,
        staffId: updates.staffId || existingSale?.staff_id || null,
        payments: paymentsForWallet,
      });
    }

    const offlineEventId = updateOfflineEventId;
    await recordAuditEvent(conn, {
      tenantId,
      action: shouldDeductStock ? "sale.completed" : "sale.updated",
      entityType: "sale",
      entityId: saleId,
      relatedSaleId: saleId,
      staffId: updates.staffId || existingSale?.staff_id || null,
      customerId: updates.customerId || existingSale?.customer_id || null,
      details: {
        previousStatus: existingSale?.status || null,
        nextStatus,
        previousTransactionType: existingSale?.transaction_type || null,
        nextTransactionType,
        changedFields: Object.keys(updates || {}),
        paymentProviders: paymentProviderSummary((updates as any).payments),
        walletPaymentAmount: walletSalePayment?.walletAmount || 0,
        loyaltyPointsEarned: loyaltyAward?.pointsEarned || 0,
        loyaltyPointsRedeemed: loyaltyAward?.pointsRedeemed || 0,
        loyaltyTier: loyaltyAward?.tier?.name || null,
        promotionCode: (updates as any).promotionCode || null,
        promotionDiscount: Number((updates as any).promotionDiscount || 0),
        offlineEventId,
        cashSessionId: (updates as any).cashSessionId || null,
        deviceId: (updates as any).deviceId || null,
        localReceiptNumber: (updates as any).localReceiptNumber || null,
      },
    });

    // Record offline sync audit event when this is an offline sync
    if (offlineEventId && shouldDeductStock) {
      await recordAuditEvent(conn, {
        tenantId,
        action: "offline.sale_synced",
        entityType: "sale",
        entityId: saleId,
        relatedSaleId: saleId,
        staffId: updates.staffId || existingSale?.staff_id || null,
        customerId: updates.customerId || existingSale?.customer_id || null,
        details: {
          offlineEventId,
          localReceiptNumber: (updates as any).localReceiptNumber || null,
          deviceId: (updates as any).deviceId || null,
          syncBatchId: (updates as any).syncBatchId || null,
          syncSequence: (updates as any).syncSequence ?? null,
          syncEventType: (updates as any).syncEventType || null,
          syncEventVersion: (updates as any).syncEventVersion || null,
        },
      });

      if (offlineSyncConflicts.length > 0) {
        const primaryConflict = offlineSyncConflicts[0];
        await recordAuditEvent(conn, {
          tenantId,
          action: "offline.sync_conflict",
          entityType: "sale",
          entityId: saleId,
          relatedSaleId: saleId,
          staffId: updates.staffId || existingSale?.staff_id || null,
          customerId: updates.customerId || existingSale?.customer_id || null,
          source: "offline_queue",
          details: {
            offlineEventId,
            localReceiptNumber: (updates as any).localReceiptNumber || null,
            deviceId: (updates as any).deviceId || null,
            operation: "update_sale",
            syncBatchId: (updates as any).syncBatchId || null,
            syncSequence: (updates as any).syncSequence ?? null,
            syncEventType: (updates as any).syncEventType || null,
            conflictType: primaryConflict.conflictType,
            recommendedAction: primaryConflict.recommendedAction,
            message: primaryConflict.message,
            conflicts: offlineSyncConflicts,
          },
        });
      }
    }

    // Transaction-safe checkout side effects (atomic with sale update)
    if (shouldDeductStock) {
      const actualStaffId = updates.staffId || existingSale?.staff_id || null;
      const actualCustomerId = updates.customerId !== undefined ? (updates.customerId || null) : (existingSale?.customer_id || null);
      await applyCheckoutSideEffects(conn, tenantId, saleId, {
        staffId: actualStaffId,
        customerId: actualCustomerId,
        cashSessionId: (updates as any).cashSessionId || null,
        loyaltyPoints: (updates as any).loyaltyPoints,
        expectedCashDelta: (updates as any).expectedCashDelta,
        tipsDelta: (updates as any).tipsDelta,
        cashMovements: (updates as any).cashMovements,
        staffMetrics: (updates as any).staffMetrics || null,
        accountBalanceDelta: (updates as any).accountBalanceDelta,
      });
    }

    await conn.commit();
    const sale = await getSaleById(tenantId, saleId);
    if (!sale) {
      throw new Error(`Sale ${saleId} not found after update`);
    }
    return sale;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function updateSaleItem(
  tenantId: string,
  saleId: string,
  itemId: string,
  updates: any
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);

    if (updates.status === 'accepted') {
      fields.push(`accepted_at = COALESCE(accepted_at, ${timerNowExpression()})`);
    } else if (updates.status === 'ready') {
      fields.push(`ready_at = COALESCE(ready_at, ${timerNowExpression()})`);
    } else if (updates.status === 'delivered') {
      fields.push(`delivered_at = COALESCE(delivered_at, ${timerNowExpression()})`);
    }
  }

  if (updates.actionStaffId !== undefined) {
    fields.push("action_staff_id = ?");
    values.push(updates.actionStaffId);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = NOW()");
  values.push(saleId, itemId);

  await query(
    `UPDATE sale_items SET ${fields.join(", ")} WHERE sale_id = ? AND id = ?`,
    values
  );
}

export async function updateSaleStatus(
  tenantId: string,
  saleId: string,
  status: Sale["status"]
): Promise<Sale> {
  return updateSale(tenantId, saleId, { status });
}

export type SalePaymentProviderStatusInput = {
  provider?: string | null;
  providerDeviceId?: string | null;
  providerReference?: string | null;
  authorizationCode?: string | null;
  providerStatus: string;
  providerNote?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  requestId?: string | null;
};

export async function updateSalePaymentProviderStatus(
  tenantId: string,
  saleId: string,
  paymentId: string,
  input: SalePaymentProviderStatusInput
): Promise<Sale> {
  const providerStatus = nullableText(input.providerStatus, 32);
  if (!providerStatus) throw new Error("Choose a provider status before saving.");

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    // Reconciling a payment's provider status can change the totals
    // reported to SARS — block when the sale is in a locked period.
    await assertSaleNotInLockedTaxPeriod(conn, tenantId, saleId, "update sale payment provider status");

    const [paymentRows] = await conn.query<any>(
      `SELECT
         sp.id,
         sp.method,
         sp.provider,
         sp.provider_device_id AS providerDeviceId,
         sp.provider_reference AS providerReference,
         sp.authorization_code AS authorizationCode,
         sp.provider_status AS providerStatus,
         s.customer_id AS customerId
       FROM sale_payments sp
       INNER JOIN sales s ON s.id = sp.sale_id
       WHERE s.tenant_id = ?
         AND sp.sale_id = ?
         AND sp.id = ?
       LIMIT 1
       FOR UPDATE`,
      [tenantId, saleId, paymentId]
    );
    const payment = (paymentRows as any[])[0];
    if (!payment) throw new Error("Payment not found for this sale.");

    const nextProvider = nullableText(input.provider ?? payment.provider, 64);
    const nextDeviceId = nullableText((input as any).providerDeviceId ?? payment.providerDeviceId, 128);
    const nextReference = nullableText(input.providerReference ?? payment.providerReference, 255);
    const nextAuthorizationCode = nullableText((input as any).authorizationCode ?? payment.authorizationCode, 128);
    const nextNote = nullableText(input.providerNote, 500);
    assertSafePaymentProviderEvidence({
      method: payment.method,
      provider: nextProvider,
      providerDeviceId: nextDeviceId,
      providerReference: nextReference,
      authorizationCode: nextAuthorizationCode,
      providerStatus,
      providerNote: nextNote,
    }, { source: "provider reconciliation" });

    await conn.query(
      `UPDATE sale_payments
          SET provider = ?,
              provider_device_id = ?,
              provider_reference = ?,
              authorization_code = ?,
              provider_status = ?,
              provider_note = ?,
              updated_at = NOW()
        WHERE sale_id = ?
          AND id = ?`,
      [nextProvider, nextDeviceId, nextReference, nextAuthorizationCode, providerStatus, nextNote, saleId, paymentId]
    );

    await recordAuditEvent(conn, {
      tenantId,
      action: "payment.provider_reconciled",
      entityType: "sale_payment",
      entityId: paymentId,
      relatedSaleId: saleId,
      staffId: input.staffId || null,
      staffName: input.staffName || null,
      customerId: payment.customerId || null,
      requestId: input.requestId || null,
      source: "provider_reconciliation",
      details: {
        saleId,
        paymentId,
        method: payment.method,
        previousProvider: payment.provider || null,
        previousProviderDeviceId: payment.providerDeviceId || null,
        previousProviderReference: payment.providerReference || null,
        previousAuthorizationCode: payment.authorizationCode || null,
        previousProviderStatus: payment.providerStatus || null,
        provider: nextProvider,
        providerDeviceId: nextDeviceId,
        providerReference: nextReference,
        authorizationCode: nextAuthorizationCode,
        providerStatus,
        providerNote: nextNote,
      },
    });

    await conn.commit();
    const sale = await getSaleById(tenantId, saleId);
    if (!sale) throw new Error("Provider status was saved but the sale could not be loaded.");
    return sale;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export type SaleRefundInput = {
  items: { saleItemId: string; quantity: number }[];
  reason: string;
  method: "cash" | "card" | "wallet" | "bnpl";
  restock?: boolean;
  staffId?: string | null;
  staffName?: string | null;
  cashSessionId?: string | null;
  provider?: string | null;
  providerReference?: string | null;
  providerStatus?: "refunded" | "partial_refund" | "reversed" | "settled" | string | null;
  providerNote?: string | null;
};

export async function processSaleRefund(tenantId: string, saleId: string, input: SaleRefundInput): Promise<Sale> {
  const reason = String(input.reason || "").trim();
  if (!reason) throw new Error("Please add a refund reason before continuing.");
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Choose at least one item to refund.");
  }

  const conn = await getConnection();
  const refundId = `refund_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  try {
    await conn.beginTransaction();

    // Refunding a sale touches the locked tax period — block it.
    await assertSaleNotInLockedTaxPeriod(conn, tenantId, saleId, "refund sale");

    const [saleResult] = await conn.query<any>(
      `SELECT id, tenant_id, customer_id, user_id, staff_id, total, subtotal, tax_amount,
              tax_rate, tax_inclusive, payment_method, status, transaction_type,
              refund_status, refunded_amount
         FROM sales
        WHERE tenant_id = ? AND id = ?
        LIMIT 1`,
      [tenantId, saleId]
    );
    const saleRows = saleResult as any[];
    const original = saleRows[0];
    if (!original) throw new Error("Sale not found.");
    if (original.status !== "completed" || original.transaction_type === "refund") {
      throw new Error("Only completed sales can be refunded.");
    }

    const [originalPaymentResult] = await conn.query<any>(
      `SELECT
         id,
         method,
         provider,
         provider_reference AS providerReference,
         provider_status AS providerStatus,
         provider_note AS providerNote
       FROM sale_payments
       WHERE sale_id = ?`,
      [saleId]
    );
    const originalPaymentRows = originalPaymentResult as any[];
    const originalProviderPayment = originalPaymentRows.find(payment => payment.method === input.method)
      || (input.method === "bnpl" ? originalPaymentRows.find(payment => payment.method === "bnpl") : null);

    const [itemResult] = await conn.query<any>(
      `SELECT id, product_id AS productId, product_name AS name, price, quantity
         FROM sale_items
        WHERE sale_id = ?`,
      [saleId]
    );
    const itemRows = itemResult as any[];
    const originalItems = new Map(itemRows.map(item => [String(item.id), item]));

    const [priorResult] = await conn.query<any>(
      `SELECT ABS(si.quantity) AS quantity, si.product_id AS productId
         FROM sales s
         INNER JOIN sale_items si ON si.sale_id = s.id
        WHERE s.tenant_id = ?
          AND s.parent_sale_id = ?
          AND s.transaction_type = 'refund'`,
      [tenantId, saleId]
    );
    const priorRows = priorResult as any[];
    const refundedByProduct = new Map<string, number>();
    for (const row of priorRows) {
      const key = String(row.productId || "");
      refundedByProduct.set(key, (refundedByProduct.get(key) || 0) + Number(row.quantity || 0));
    }

    const refundItems: any[] = [];
    let refundSubtotal = 0;

    for (const requested of input.items) {
      const originalItem = originalItems.get(String(requested.saleItemId));
      if (!originalItem) throw new Error("One of the selected items no longer exists on this sale.");
      const productId = String(originalItem.productId || "");
      const quantity = Math.max(0, Math.floor(Number(requested.quantity || 0)));
      const alreadyRefunded = refundedByProduct.get(productId) || 0;
      const remaining = Math.max(0, Number(originalItem.quantity || 0) - alreadyRefunded);
      if (quantity <= 0 || quantity > remaining) {
        throw new Error(`${originalItem.name} can only refund ${remaining} more.`);
      }

      refundedByProduct.set(productId, alreadyRefunded + quantity);
      const price = Number(originalItem.price || 0);
      refundSubtotal += price * quantity;
      refundItems.push({
        id: `item_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        productId: originalItem.productId || null,
        name: originalItem.name,
        price,
        quantity: -quantity,
      });
    }

    const originalTotal = Math.max(0, Number(original.total || 0));
    const originalTaxAmount = Math.max(0, Number(original.tax_amount || 0));
    const ratio = originalTotal > 0 ? Math.min(1, refundSubtotal / originalTotal) : 0;
    const refundTax = Number((originalTaxAmount * ratio).toFixed(2));
    const refundTotal = Number(refundSubtotal.toFixed(2));
    const signedTotal = -refundTotal;
    const signedTax = -refundTax;
    const signedSubtotal = Number((signedTotal - signedTax).toFixed(2));
    const newRefundedAmount = Number((Number(original.refunded_amount || 0) + refundTotal).toFixed(2));
    const refundStatus = newRefundedAmount >= originalTotal - 0.01 ? "full" : "partial";
    const providerRefundStatus = input.providerStatus
      || (refundStatus === "full" ? "refunded" : "partial_refund");
    const refundPayment: any = {
      method: input.method,
      provider: input.method === "bnpl" ? (input.provider || originalProviderPayment?.provider || "bnpl") : null,
      providerReference: input.method === "bnpl" ? (input.providerReference || originalProviderPayment?.providerReference || null) : null,
      providerStatus: input.method === "bnpl" ? providerRefundStatus : null,
      providerNote: input.method === "bnpl" ? (input.providerNote || reason) : null,
    };

    await conn.query(
      `INSERT INTO sales (
        id, tenant_id, customer_id, user_id, staff_id, total, subtotal, tax_amount,
        tax_rate, tax_inclusive, payment_method, tendered_amount, change_amount,
        tip_amount, cash_out_amount, points_discount, status, transaction_type,
        parent_sale_id, refund_status, refunded_amount, refund_reason, refunded_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'completed', 'refund', ?, 'none', ?, ?, ?, NOW(), NOW())`,
      [
        refundId,
        tenantId,
        original.customer_id || null,
        original.user_id || null,
        input.staffId || original.staff_id || null,
        signedTotal,
        signedSubtotal,
        signedTax,
        original.tax_rate || 0,
        original.tax_inclusive ? 1 : 0,
        input.method,
        signedTotal,
        saleId,
        refundTotal,
        reason,
        input.staffId || null,
      ]
    );

    for (const item of refundItems) {
      await conn.query(
        `INSERT INTO sale_items (
          id, sale_id, product_id, product_name, price, quantity, status,
          ordered_at, delivered_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'delivered', ${timerNowExpression()}, ${timerNowExpression()}, NOW(), NOW())`,
        [item.id, refundId, item.productId, item.name, item.price, item.quantity]
      );

      if (input.restock && item.productId) {
        await applyProductStockDelta(conn, {
          tenantId,
          productId: item.productId,
          itemName: item.name,
          quantityDelta: Math.abs(Number(item.quantity || 0)),
          reason: "refund_restock",
          reasonCode: "refund",
          referenceType: "refund",
          referenceId: refundId,
          saleId: refundId,
          saleItemId: item.id,
          staffId: input.staffId || null,
          staffName: input.staffName || null,
          note: reason,
        });
      }
    }

    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await conn.query(
      `INSERT INTO sale_payments (
        id, sale_id, method, amount, tendered_amount, change_amount, tip_amount, cash_out_amount,
        provider, provider_device_id, provider_reference, authorization_code, provider_status, provider_note, qr_payload,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        paymentId,
        refundId,
        input.method,
        signedTotal,
        signedTotal,
        ...paymentProviderValues(refundPayment),
      ]
    );

    await conn.query(
      `UPDATE sales
          SET refunded_amount = ?,
              refund_status = ?,
              refund_reason = ?,
              refunded_by = ?,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [newRefundedAmount, refundStatus, reason, input.staffId || null, tenantId, saleId]
    );

    if (input.method === "bnpl") {
      await conn.query(
        `UPDATE sale_payments
            SET provider_status = ?,
                provider_note = ?,
                updated_at = NOW()
          WHERE sale_id = ?
            AND method = 'bnpl'`,
        [providerRefundStatus, input.providerNote || reason, saleId]
      );
    }

    if (input.method === "wallet" && original.customer_id) {
      await conn.query(
        `UPDATE customers SET wallet_balance = COALESCE(wallet_balance, 0) + ?, updated_at = NOW() WHERE tenant_id = ? AND id = ?`,
        [refundTotal, tenantId, original.customer_id]
      );
    }

    if (input.method === "cash" && input.cashSessionId) {
      const cashMovementId = `cash_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await conn.query(
        `UPDATE cash_sessions
            SET expected_cash = COALESCE(expected_cash, 0) - ?,
                updated_at = NOW()
          WHERE tenant_id = ? AND id = ?`,
        [refundTotal, tenantId, input.cashSessionId]
      );
      await conn.query(
        `INSERT INTO cash_movements (
          id, tenant_id, cash_session_id, type, direction, amount, sale_id, payment_id,
          staff_id, staff_name, created_by, note, created_at
        ) VALUES (?, ?, ?, 'refund', 'out', ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          cashMovementId,
          tenantId,
          input.cashSessionId,
          refundTotal,
          refundId,
          paymentId,
          input.staffId || null,
          input.staffName || null,
          input.staffId || null,
          reason,
        ]
      );
      await recordAuditEvent(conn, {
        tenantId,
        action: "cash_movement.recorded",
        entityType: "cash_movement",
        entityId: cashMovementId,
        relatedSaleId: refundId,
        staffId: input.staffId || null,
        staffName: input.staffName || null,
        customerId: original.customer_id || null,
        source: "refund",
        details: {
          cashSessionId: input.cashSessionId,
          originalSaleId: saleId,
          refundSaleId: refundId,
          type: "refund",
          direction: "out",
          amount: refundTotal,
          paymentId,
          note: reason,
        },
      });
    }

    await recordAuditEvent(conn, {
      tenantId,
      action: "sale.refunded",
      entityType: "sale",
      entityId: refundId,
      relatedSaleId: saleId,
      staffId: input.staffId || null,
      staffName: input.staffName || null,
      customerId: original.customer_id || null,
      requestId: (input as any).requestId || null,
      details: {
        originalSaleId: saleId,
        refundTotal,
        method: input.method,
        provider: refundPayment.provider || null,
        providerReference: refundPayment.providerReference || null,
        providerStatus: refundPayment.providerStatus || null,
        restock: Boolean(input.restock),
        reason,
        itemCount: refundItems.length,
      },
    });

    await conn.commit();
    const refundSale = await getSaleById(tenantId, refundId);
    if (!refundSale) throw new Error("Refund was recorded but could not be loaded.");
    return refundSale;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export type SaleVoidInput = {
  reason: string;
  restock?: boolean;
  staffId?: string | null;
  staffName?: string | null;
  requestId?: string | null;
};

export async function processSaleVoid(tenantId: string, saleId: string, input: SaleVoidInput): Promise<Sale> {
  const reason = String(input.reason || "").trim();
  if (!reason) throw new Error("Please add a void reason before continuing.");

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [saleResult] = await conn.query<any>(
      `SELECT id, status, transaction_type, customer_id, staff_id
         FROM sales
        WHERE tenant_id = ? AND id = ?
        LIMIT 1`,
      [tenantId, saleId]
    );
    const saleRows = saleResult as any[];
    const sale = saleRows[0];
    if (!sale) throw new Error("Sale not found.");
    if (sale.transaction_type === "refund" || sale.transaction_type === "void") {
      throw new Error("This transaction cannot be voided.");
    }
    if (sale.status === "completed") {
      throw new Error("Completed sales must be handled through the refund flow.");
    }
    await assertSaleNotInLockedTaxPeriod(conn, tenantId, saleId, "void sale");

    const [itemResult] = await conn.query<any>(
      `SELECT product_id AS productId, quantity
         FROM sale_items
        WHERE sale_id = ?`,
      [saleId]
    );
    const items = itemResult as any[];

    if (input.restock) {
      for (const item of items) {
        if (!item.productId) continue;
        await applyProductStockDelta(conn, {
          tenantId,
          productId: item.productId,
          quantityDelta: Math.max(0, Number(item.quantity || 0)),
          reason: "void_restock",
          reasonCode: "void",
          referenceType: "void",
          referenceId: saleId,
          saleId,
          staffId: input.staffId || sale.staff_id || null,
          staffName: input.staffName || null,
          note: reason,
        });
      }
    }

    await conn.query(
      `UPDATE sales
          SET status = 'failed',
              transaction_type = 'void',
              void_reason = ?,
              voided_by = ?,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [reason, input.staffId || null, tenantId, saleId]
    );

    await recordAuditEvent(conn, {
      tenantId,
      action: "sale.voided",
      entityType: "sale",
      entityId: saleId,
      relatedSaleId: saleId,
      staffId: input.staffId || sale.staff_id || null,
      staffName: input.staffName || null,
      customerId: sale.customer_id || null,
      requestId: input.requestId || null,
      details: {
        previousStatus: sale.status,
        previousTransactionType: sale.transaction_type,
        restock: Boolean(input.restock),
        reason,
      },
    });

    await conn.commit();
    const voidedSale = await getSaleById(tenantId, saleId);
    if (!voidedSale) throw new Error("Void was recorded but could not be loaded.");
    return voidedSale;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getSaleById(tenantId: string, saleId: string): Promise<Sale | null> {
  const rows = await query(
    `SELECT
      id,
      tenant_id AS tenantId,
      customer_id AS customerId,
      user_id AS userId,
      staff_id AS staffId,
      total,
      subtotal,
      tax_amount AS taxAmount,
      tax_rate AS taxRate,
      tax_inclusive AS taxInclusive,
      payment_method AS paymentMethod,
      tendered_amount AS tenderedAmount,
      change_amount AS changeAmount,
      tip_amount AS tipAmount,
      cash_out_amount AS cashOutAmount,
      points_discount AS pointsDiscount,
      promotion_id AS promotionId,
      promotion_code AS promotionCode,
      promotion_discount AS promotionDiscount,
      status,
      transaction_type AS transactionType,
      parent_sale_id AS parentSaleId,
      refund_status AS refundStatus,
      refunded_amount AS refundedAmount,
      refund_reason AS refundReason,
      refunded_by AS refundedBy,
      void_reason AS voidReason,
      voided_by AS voidedBy,
      payfast_payment_id,
      table_number AS tableNumber,
      is_tab AS isTab,
      tab_name AS tabName,
      offline_event_id AS offlineEventId,
      sync_source AS syncSource,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sales
    WHERE tenant_id = ? AND id = ?`,
    [tenantId, saleId]
  );
  
  if (rows.length === 0) return null;
  const sale = rows[0] as Sale;
  
  const items = await query(
    `SELECT
       id,
       product_id AS productId,
       product_name AS name,
       price,
       quantity,
       status,
       workstation_id AS workstationId,
       ordered_at AS orderedAt,
       accepted_at AS acceptedAt,
       ready_at AS readyAt,
       delivered_at AS deliveredAt,
       action_staff_id AS actionStaffId
     FROM sale_items
     WHERE sale_id = ?`,
    [saleId]
  );
  
  sale.items = items;

  const payments = await query(
    `SELECT
       id,
       sale_id AS saleId,
       method,
       amount,
       tendered_amount AS tenderedAmount,
       change_amount AS changeAmount,
       tip_amount AS tipAmount,
       cash_out_amount AS cashOutAmount,
       provider,
       provider_device_id AS providerDeviceId,
       provider_reference AS providerReference,
       authorization_code AS authorizationCode,
       provider_status AS providerStatus,
       provider_note AS providerNote,
       qr_payload AS qrPayload,
       created_at AS createdAt
     FROM sale_payments
     WHERE sale_id = ?`,
    [saleId]
  );
  sale.payments = payments;

  return sale;
}

// ─────────────────────────────────────────────────────────────────────────
// Payout Request Operations
// ─────────────────────────────────────────────────────────────────────────

export async function createPayoutRequest(
  tenantId: string,
  data: any
): Promise<any> {
  const id = `payout_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const amount = Number(data.amount || 0);
  if (!data.staffId) throw new Error("Choose the staff wallet first.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a payout amount greater than zero.");

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [staffRows] = await conn.query<any>(
      `SELECT id, name, wallet_balance AS walletBalance
         FROM staff
        WHERE tenant_id = ? AND id = ?
        LIMIT 1
        FOR UPDATE`,
      [tenantId, data.staffId]
    );
    const staff = (staffRows as any[])[0];
    if (!staff) throw new Error("Staff wallet not found.");
    const previousBalance = Number(staff.walletBalance || staff.wallet_balance || 0);
    if (previousBalance < amount) throw new Error("Staff wallet balance is not enough for this payout request.");
    const nextBalance = Number((previousBalance - amount).toFixed(2));

    await conn.query(
      `UPDATE staff
          SET wallet_balance = ?,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [nextBalance, tenantId, data.staffId]
    );

    await conn.query(
      `INSERT INTO payout_requests (
        id, tenant_id, staff_id, staff_name, amount, status, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        tenantId,
        data.staffId,
        data.staffName || staff.name || null,
        amount,
        data.status || "pending",
        data.note || null,
      ]
    );

    await recordAuditEvent(conn, {
      tenantId,
      action: "staff_wallet.payout_requested",
      entityType: "staff_wallet",
      entityId: data.staffId,
      staffId: data.staffId,
      staffName: data.staffName || staff.name || null,
      source: "staff_portal",
      details: {
        payoutRequestId: id,
        amount,
        previousBalance,
        nextBalance,
        status: data.status || "pending",
      },
    });

    await conn.commit();
    return { id, ...data, amount, status: data.status || "pending" };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updatePayoutRequest(
  tenantId: string,
  id: string,
  updates: any
): Promise<any> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.processedAt !== undefined) {
    fields.push("processed_at = ?");
    values.push(updates.processedAt);
  }
  if (updates.processedBy !== undefined) {
    fields.push("processed_by = ?");
    values.push(updates.processedBy);
  }
  if (updates.note !== undefined) {
    fields.push("note = ?");
    values.push(updates.note);
  }

  fields.push("updated_at = NOW()");
  values.push(tenantId, id);

  await query(
    `UPDATE payout_requests SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

  const rows = await query(`SELECT * FROM payout_requests WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    id,
  ]);
  return rows[0];
}

export async function createCustomerPayoutRequest(
  tenantId: string,
  data: any
): Promise<any> {
  const id = `cpout_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const amount = Number(data.amount || 0);
  if (!data.customerId) throw new Error("Choose the customer wallet first.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a payout amount greater than zero.");

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [customerRows] = await conn.query<any>(
      `SELECT id, name, email, wallet_balance AS walletBalance
         FROM customers
        WHERE tenant_id = ? AND id = ?
        LIMIT 1
        FOR UPDATE`,
      [tenantId, data.customerId]
    );
    const customer = (customerRows as any[])[0];
    if (!customer) throw new Error("Customer wallet not found.");
    const previousBalance = Number(customer.walletBalance || customer.wallet_balance || 0);
    if (previousBalance < amount) throw new Error("Customer wallet balance is not enough for this payout request.");
    const nextBalance = Number((previousBalance - amount).toFixed(2));

    await conn.query(
      `UPDATE customers
          SET wallet_balance = ?,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [nextBalance, tenantId, data.customerId]
    );

    await conn.query(
      `INSERT INTO customer_payout_requests (
        id, tenant_id, customer_id, customer_name, customer_email, amount, status, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        tenantId,
        data.customerId,
        data.customerName || customer.name || null,
        data.customerEmail || customer.email || null,
        amount,
        data.status || "pending",
        data.note || null,
      ]
    );

    await recordAuditEvent(conn, {
      tenantId,
      action: "customer_wallet.payout_requested",
      entityType: "customer_wallet",
      entityId: data.customerId,
      customerId: data.customerId,
      source: "client_portal",
      details: {
        payoutRequestId: id,
        amount,
        previousBalance,
        nextBalance,
        status: data.status || "pending",
      },
    });

    await conn.commit();
    return { id, ...data, amount, status: data.status || "pending" };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateCustomerPayoutRequest(
  tenantId: string,
  id: string,
  updates: any
): Promise<any> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.processedAt !== undefined) {
    fields.push("processed_at = ?");
    values.push(updates.processedAt);
  }
  if (updates.processedBy !== undefined) {
    fields.push("processed_by = ?");
    values.push(updates.processedBy);
  }
  if (updates.note !== undefined) {
    fields.push("note = ?");
    values.push(updates.note);
  }

  fields.push("updated_at = NOW()");
  values.push(tenantId, id);

  await query(
    `UPDATE customer_payout_requests SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`,
    values
  );

  const rows = await query(`SELECT * FROM customer_payout_requests WHERE tenant_id = ? AND id = ?`, [
    tenantId,
    id,
  ]);
  return rows[0];
}

export async function updateAppConfig(
  tenantId: string,
  config: AppConfig
): Promise<void> {
  const businessName = String(config.business?.name || tenantId).trim() || tenantId;

  await query(
    isPostgres()
      ? `INSERT INTO tenants (id, name, created_at, updated_at)
         VALUES (?, ?, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`
      : `INSERT INTO tenants (id, name, created_at, updated_at)
         VALUES (?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE id = id`,
    [tenantId, businessName]
  );

  const values = [
    tenantId,
    config.payfastMerchantId || PAYFAST_MERCHANT_ID || "10000100",
    config.payfastMerchantKey || PAYFAST_MERCHANT_KEY || "46f0cd694581a",
    config.payfastPassphrase || PAYFAST_PASSPHRASE || "jt7v60h69n8a1",
    config.payfastSandbox ? 1 : 0,
    JSON.stringify(config.business || {}),
    JSON.stringify(config.categories || {}),
    JSON.stringify((config as any).retentionPolicy || {}),
    config.slug || null,
    config.setupCompleted ? 1 : 0,
  ];

  await query(
    isPostgres()
      ? `INSERT INTO app_settings (
           tenant_id,
           payfast_merchant_id,
           payfast_merchant_key,
           payfast_passphrase,
           payfast_sandbox,
           business,
           categories,
           retention_policy,
           slug,
           setup_completed,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET
           payfast_merchant_id = EXCLUDED.payfast_merchant_id,
           payfast_merchant_key = EXCLUDED.payfast_merchant_key,
           payfast_passphrase = EXCLUDED.payfast_passphrase,
           payfast_sandbox = EXCLUDED.payfast_sandbox,
           business = EXCLUDED.business,
           categories = EXCLUDED.categories,
           retention_policy = EXCLUDED.retention_policy,
           slug = EXCLUDED.slug,
           setup_completed = EXCLUDED.setup_completed,
           updated_at = NOW()`
      : `INSERT INTO app_settings (
           tenant_id,
           payfast_merchant_id,
           payfast_merchant_key,
           payfast_passphrase,
           payfast_sandbox,
           business,
           categories,
           retention_policy,
           slug,
           setup_completed,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           payfast_merchant_id = VALUES(payfast_merchant_id),
           payfast_merchant_key = VALUES(payfast_merchant_key),
           payfast_passphrase = VALUES(payfast_passphrase),
           payfast_sandbox = VALUES(payfast_sandbox),
           business = VALUES(business),
           categories = VALUES(categories),
           retention_policy = VALUES(retention_policy),
           slug = VALUES(slug),
           setup_completed = VALUES(setup_completed),
           updated_at = NOW()`,
    values
  );
}

export async function createMessage(
  tenantId: string,
  data: any
): Promise<any> {
  const id = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO messages (
      id, tenant_id, channel, sender_id, sender_name, sender_role, text,
      read_by, is_dev_broadcast, is_system, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      id,
      tenantId,
      data.channel,
      data.senderId,
      data.senderName,
      data.senderRole,
      data.text,
      JSON.stringify(data.readBy || []),
      data.isDevBroadcast ? 1 : 0,
      data.isSystem || data.isSystemNotification ? 1 : 0,
    ]
  );
  return { id, ...data };
}

export async function markMessageRead(
  tenantId: string,
  messageId: string,
  userId: string
): Promise<void> {
  const rows = await query<{ read_by: any }>(
    `SELECT read_by FROM messages WHERE tenant_id = ? AND id = ? LIMIT 1`,
    [tenantId, messageId]
  );
  if (rows.length === 0) return;

  const raw = rows[0].read_by;
  let readBy: string[] = [];
  if (Array.isArray(raw)) {
    readBy = raw.map(String);
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) readBy = parsed.map(String);
    } catch {}
  }

  if (!readBy.includes(userId)) readBy.push(userId);

  await query(
    `UPDATE messages SET read_by = ? WHERE tenant_id = ? AND id = ?`,
    [JSON.stringify(readBy), tenantId, messageId]
  );
}

export async function setupTenant(data: {
  businessName: string;
  user: { uid: string; email: string; displayName: string };
  config?: any;
}): Promise<{ tenantId: string }> {
  const tenantId = `tnt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const config = data.config || {};
  const businessConfig = {
    ...config.business,
    name: data.businessName,
    packageTier: config.business?.packageTier || process.env.JPOS_HOSTED_PACKAGE_TIER || "free",
  };
  
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const pg = isPostgres();

    // 1. Create tenant
    await conn.query(
      `INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
      [tenantId, data.businessName]
    );

    // 2. Create or update user association
    await conn.query(
      pg
        ? `INSERT INTO users (uid, tenant_id, email, name, created_at, updated_at)
           VALUES (?, ?, ?, ?, NOW(), NOW())
           ON CONFLICT (uid) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, name = EXCLUDED.name, updated_at = NOW()`
        : `INSERT INTO users (uid, tenant_id, email, name, created_at, updated_at) 
           VALUES (?, ?, ?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), name = VALUES(name), updated_at = NOW()`,
      [data.user.uid, tenantId, data.user.email, data.user.displayName]
    );
    
    // 3. Create staff (admin) — dev role only when the env-gated bootstrap
    // backdoor is enabled (dev/staging only, never in production).
    const assignedRole = isDevEmail(data.user.email) ? 'dev' : 'admin';
    await conn.query(
      pg
        ? `INSERT INTO staff (id, tenant_id, name, email, role, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())
           ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, updated_at = NOW()`
        : `INSERT INTO staff (id, tenant_id, name, email, role, status, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())
           ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), role = VALUES(role), updated_at = NOW()`,
      [data.user.uid, tenantId, data.user.displayName, data.user.email, assignedRole]
    );

    // 4. Create config and mark setup completed
    await conn.query(
      `INSERT INTO app_settings (
        tenant_id,
        payfast_merchant_id,
        payfast_merchant_key,
        payfast_passphrase,
        payfast_sandbox,
        business,
        categories,
        slug,
        setup_completed,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        tenantId,
        config.payfastMerchantId || PAYFAST_MERCHANT_ID,
        config.payfastMerchantKey || PAYFAST_MERCHANT_KEY,
        config.payfastPassphrase || PAYFAST_PASSPHRASE,
        config.payfastSandbox ? 1 : 0,
        JSON.stringify(businessConfig),
        config.categories ? JSON.stringify(config.categories) : null,
        config.slug || null,
        1,
      ]
    );

    // 5. Create default workstation
    const wsId = `ws_${Date.now()}_kitchen`;
    await conn.query(
      `INSERT INTO workstations (id, tenant_id, name, type, status, created_at, updated_at) 
       VALUES (?, ?, 'Kitchen', 'kitchen', 'active', NOW(), NOW())`,
      [wsId, tenantId]
    );

    await conn.commit();
    return { tenantId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function clearAllSales(tenantId: string): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    // Delete items first due to FK
    await conn.query(`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE tenant_id = ?)`, [tenantId]);
    await conn.query(`DELETE FROM sales WHERE tenant_id = ?`, [tenantId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function seedProducts(tenantId: string, products: any[]): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    for (const p of products) {
      const [existing] = await conn.query<{ id: string }>(
        `SELECT id FROM products
         WHERE tenant_id = ?
           AND (
             (barcode IS NOT NULL AND barcode <> '' AND barcode = ?)
             OR (name = ? AND category = ? AND COALESCE(section, '') = COALESCE(?, ''))
           )
         ORDER BY created_at ASC, id ASC`,
        [tenantId, p.barcode || null, p.name, p.category, p.section || null]
      );
      if (existing.length > 0) {
        const duplicateIds = existing.slice(1).map(row => row.id);
        if (duplicateIds.length > 0) {
          await conn.query(
            `DELETE FROM products WHERE tenant_id = ? AND id IN (${duplicateIds.map(() => "?").join(", ")})`,
            [tenantId, ...duplicateIds]
          );
        }
        continue;
      }

      const id = `prod_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await conn.query(
        `INSERT INTO products (
          id, tenant_id, name, price, category, section, stock, min_stock, barcode, image_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          id,
          tenantId,
          p.name,
          p.price,
          p.category,
          p.section || null,
          p.stock || 0,
          p.minStock || null,
          p.barcode || null,
          p.imageUrl || null,
        ]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Inventory Expansion (Bulk Items, Recipes, Modifiers)
// ─────────────────────────────────────────────────────────────────────────

export async function getBulkItems(tenantId: string): Promise<BulkItem[]> {
  const rows = await query(
    `SELECT
       id,
       name,
       item_type AS itemType,
       unit,
       stock,
       min_stock AS minStock,
       cost_per_unit AS costPerUnit,
       barcode,
       pack_name AS packName,
       pack_quantity AS packQuantity,
       single_unit_name AS singleUnitName,
       created_at AS createdAt,
       updated_at AS updatedAt
     FROM bulk_items WHERE tenant_id = ?`,
    [tenantId]
  );
  return rows as BulkItem[];
}

export async function createBulkItem(tenantId: string, item: Partial<BulkItem>): Promise<BulkItem> {
  const id = `bulk_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const itemType = item.itemType === 'bulk' ? 'bulk' : 'single';
  await query(
    `INSERT INTO bulk_items (
       id, tenant_id, name, item_type, unit, stock, min_stock, cost_per_unit,
       barcode, pack_name, pack_quantity, single_unit_name, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      tenantId,
      item.name,
      itemType,
      item.unit || 'items',
      item.stock || 0,
      item.minStock || 0,
      item.costPerUnit || 0,
      item.barcode || null,
      itemType === 'bulk' ? (item.packName || 'Case') : null,
      itemType === 'bulk' ? (item.packQuantity || 1) : 1,
      item.singleUnitName || 'item'
    ]
  );
  return { id, itemType, ...item } as BulkItem;
}

export async function updateBulkItem(tenantId: string, id: string, updates: Partial<BulkItem>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
  if (updates.itemType !== undefined) { fields.push("item_type = ?"); values.push(updates.itemType === 'bulk' ? 'bulk' : 'single'); }
  if (updates.unit !== undefined) { fields.push("unit = ?"); values.push(updates.unit); }
  if (updates.stock !== undefined) { fields.push("stock = ?"); values.push(updates.stock); }
  if (updates.minStock !== undefined) { fields.push("min_stock = ?"); values.push(updates.minStock); }
  if (updates.costPerUnit !== undefined) { fields.push("cost_per_unit = ?"); values.push(updates.costPerUnit); }
  if (updates.barcode !== undefined) { fields.push("barcode = ?"); values.push(updates.barcode); }
  if (updates.packName !== undefined) { fields.push("pack_name = ?"); values.push(updates.packName || null); }
  if (updates.packQuantity !== undefined) { fields.push("pack_quantity = ?"); values.push(updates.packQuantity || 1); }
  if (updates.singleUnitName !== undefined) { fields.push("single_unit_name = ?"); values.push(updates.singleUnitName || 'item'); }
  if (fields.length === 0) return;
  fields.push("updated_at = NOW()");
  values.push(tenantId, id);
  await query(`UPDATE bulk_items SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`, values);
}

export async function deleteBulkItem(tenantId: string, id: string): Promise<void> {
  await query(`DELETE FROM bulk_items WHERE tenant_id = ? AND id = ?`, [tenantId, id]);
}

export async function updateProductRecipe(productId: string, recipe: RecipeItem[]): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM product_recipes WHERE product_id = ?`, [productId]);
    for (const r of recipe) {
      await conn.query(
        `INSERT INTO product_recipes (
           product_id, bulk_item_id, quantity, yield_quantity, waste_percent,
           substitute_group, substitute_rank, is_optional
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productId,
          r.bulkItemId,
          decimal(r.quantity),
          recipeYield(r.yieldQuantity),
          recipeWastePercent(r.wastePercent),
          nullableText(r.substituteGroup, 64),
          Math.max(0, Math.floor(Number(r.substituteRank || 0))),
          r.isOptional ? 1 : 0,
        ]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getProductRecipe(productId: string): Promise<RecipeItem[]> {
  const rows = await query(
    `SELECT
       r.bulk_item_id AS bulkItemId,
       r.quantity,
       r.yield_quantity AS yieldQuantity,
       r.waste_percent AS wastePercent,
       r.substitute_group AS substituteGroup,
       r.substitute_rank AS substituteRank,
       r.is_optional AS isOptional,
       b.name AS bulkItemName,
       b.unit,
       b.cost_per_unit AS costPerUnit,
       b.stock AS availableStock
     FROM product_recipes r
     JOIN bulk_items b ON r.bulk_item_id = b.id
     WHERE r.product_id = ?
     ORDER BY COALESCE(r.substitute_group, ''), r.substitute_rank ASC, b.name ASC`,
    [productId]
  );
  return (rows as any[]).map(serializeRecipeRow);
}

function csvCell(value: any) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function getRecipeCostingReport(tenantId: string) {
  const [products, recipeRows] = await Promise.all([
    query<any>(
      `SELECT
         id AS productId,
         name AS productName,
         category,
         section,
         price AS sellingPrice,
         cost_price AS productCost
       FROM products
       WHERE tenant_id = ?
       ORDER BY name ASC`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         p.id AS productId,
         r.bulk_item_id AS bulkItemId,
         r.quantity,
         r.yield_quantity AS yieldQuantity,
         r.waste_percent AS wastePercent,
         r.substitute_group AS substituteGroup,
         r.substitute_rank AS substituteRank,
         r.is_optional AS isOptional,
         b.name AS bulkItemName,
         b.unit,
         b.cost_per_unit AS costPerUnit,
         b.stock AS availableStock
       FROM products p
       INNER JOIN product_recipes r ON r.product_id = p.id
       INNER JOIN bulk_items b ON b.id = r.bulk_item_id AND b.tenant_id = p.tenant_id
       WHERE p.tenant_id = ?
       ORDER BY p.name ASC, COALESCE(r.substitute_group, ''), r.substitute_rank ASC, b.name ASC`,
      [tenantId]
    ),
  ]);

  const recipeByProduct = new Map<string, any[]>();
  for (const row of recipeRows || []) {
    const productId = String(row.productId || "");
    recipeByProduct.set(productId, [...(recipeByProduct.get(productId) || []), row]);
  }

  const rows = (products || []).map((product: any) => {
    const rawLines = recipeByProduct.get(String(product.productId)) || [];
    const lines = rawLines.map((row) => serializeRecipeRow(row)).map((line) => ({ ...line, costed: false }));
    const costedBulkIds = new Set<string>();
    const groupRows = new Map<string, any[]>();

    for (const raw of rawLines) {
      const group = nullableText(raw.substituteGroup ?? raw.substitute_group, 64);
      if (!group) {
        const line = serializeRecipeRow(raw);
        if (!line.isOptional) costedBulkIds.add(line.bulkItemId);
        continue;
      }
      groupRows.set(group, [...(groupRows.get(group) || []), raw]);
    }

    for (const alternatives of groupRows.values()) {
      const chosen = serializeRecipeRow(chooseRecipeSubstitution(alternatives, 1));
      if (!chosen.isOptional) costedBulkIds.add(chosen.bulkItemId);
    }

    const reportLines = lines.map((line) => ({ ...line, costed: costedBulkIds.has(line.bulkItemId) }));
    const recipeCost = decimal(reportLines.reduce((sum, line) => sum + (line.costed ? Number(line.lineCost || 0) : 0), 0), 0, 2);
    const productCost = decimal(product.productCost ?? product.cost_price, 0, 2);
    const sellingPrice = decimal(product.sellingPrice ?? product.price, 0, 2);
    const expectedUnitCost = recipeCost > 0 ? recipeCost : productCost;
    const grossProfit = decimal(sellingPrice - expectedUnitCost, 0, 2);
    const grossMarginPercent = sellingPrice > 0 ? decimal((grossProfit / sellingPrice) * 100, 0, 2) : 0;

    return {
      productId: product.productId,
      productName: product.productName,
      category: product.category || null,
      section: product.section || null,
      sellingPrice,
      productCost,
      recipeCost,
      expectedUnitCost,
      grossProfit,
      grossMarginPercent,
      ingredientCount: reportLines.length,
      substituteGroupCount: groupRows.size,
      optionalCount: reportLines.filter((line) => line.isOptional).length,
      lines: reportLines,
    };
  });

  const recipeRowsOnly = rows.filter((row) => row.ingredientCount > 0);
  const avgGrossMarginPercent = rows.length
    ? decimal(rows.reduce((sum, row) => sum + row.grossMarginPercent, 0) / rows.length, 0, 2)
    : 0;
  const csvRows = [
    ["Product", "Section", "Category", "Selling Price", "Product Cost", "Recipe Cost", "Expected Unit Cost", "Gross Profit", "Gross Margin %", "Ingredients", "Substitution Groups", "Optional Ingredients"],
    ...rows.map((row) => [
      row.productName,
      row.section || "",
      row.category || "",
      row.sellingPrice,
      row.productCost,
      row.recipeCost,
      row.expectedUnitCost,
      row.grossProfit,
      row.grossMarginPercent,
      row.ingredientCount,
      row.substituteGroupCount,
      row.optionalCount,
    ]),
  ].map((line) => line.map(csvCell).join(",")).join("\n");

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      productCount: rows.length,
      recipeProductCount: recipeRowsOnly.length,
      avgGrossMarginPercent,
      lowMarginCount: rows.filter((row) => row.grossMarginPercent < 30).length,
      substitutionGroupCount: rows.reduce((sum, row) => sum + row.substituteGroupCount, 0),
      optionalIngredientCount: rows.reduce((sum, row) => sum + row.optionalCount, 0),
    },
    rows,
    csv: csvRows,
  };
}

export async function createModifierGroup(productId: string, group: Partial<ModifierGroup>): Promise<string> {
  const id = `mod_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  await query(
    `INSERT INTO product_modifiers (id, product_id, name, type, required, min_selection, max_selection, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, productId, group.name, group.type || 'single', group.required ? 1 : 0, group.minSelection || 0, group.maxSelection || 1]
  );
  return id;
}

export async function deleteModifierGroup(modifierId: string): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM modifier_options WHERE modifier_id = ?`, [modifierId]);
    await conn.query(`DELETE FROM product_modifiers WHERE id = ?`, [modifierId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function updateModifierOptions(modifierId: string, options: Partial<ModifierOption>[]): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM modifier_options WHERE modifier_id = ?`, [modifierId]);
    for (const opt of options) {
      const id = `opt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await conn.query(
        `INSERT INTO modifier_options (id, modifier_id, name, price_extra, bulk_item_id, bulk_quantity, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [id, modifierId, opt.name, opt.priceExtra || 0, opt.bulkItemId || null, opt.bulkQuantity || 0]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getProductModifiers(productId: string): Promise<ModifierGroup[]> {
  const groups = await query(
    `SELECT id, product_id AS productId, name, type, required, min_selection AS minSelection, max_selection AS maxSelection
     FROM product_modifiers WHERE product_id = ?`,
    [productId]
  );
  
  for (const g of groups as ModifierGroup[]) {
    const options = await query(
      `SELECT id, modifier_id AS modifierId, name, price_extra AS priceExtra, bulk_item_id AS bulkItemId, bulk_quantity AS bulkQuantity
       FROM modifier_options WHERE modifier_id = ?`,
      [g.id]
    );
    g.options = options as ModifierOption[];
  }
  return groups as ModifierGroup[];
}
