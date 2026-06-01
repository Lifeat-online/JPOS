import { query } from "./db.js";
import { createSimplePdfBase64 } from "./pdfExport.js";

type StockReportFilters = {
  from?: string | null;
  to?: string | null;
  limit?: string | number | null;
};

const DEFAULT_LOCATION_ID = "main";
const DEFAULT_LOCATION_NAME = "Primary stock pool";
const LOCATION_NOTE = "Single stock pool until multi-location inventory is enabled.";

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function money(value: number) {
  return Number(toNumber(value).toFixed(2));
}

function quantity(value: number) {
  return Number(toNumber(value).toFixed(3));
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
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

function clampLimit(value: unknown, fallback = 500, max = 2000) {
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

function addDateFilters(where: string[], params: unknown[], column: string, filters: StockReportFilters) {
  const from = dayBoundary(filters.from);
  const to = dayBoundary(filters.to, true);
  if (from) {
    where.push(`${column} >= ?`);
    params.push(from);
  }
  if (to) {
    where.push(`${column} <= ?`);
    params.push(to);
  }
}

function buildReceivedPurchaseOrdersQuery(tenantId: string, filters: StockReportFilters, limit: number) {
  const where = ["tenant_id = ?", "status = 'received'", "received_at IS NOT NULL"];
  const params: unknown[] = [tenantId];
  addDateFilters(where, params, "received_at", filters);
  params.push(limit);
  return {
    sql: `SELECT id,
                 vendor_id AS vendorId,
                 items,
                 total_amount AS totalAmount,
                 invoice_number AS invoiceNumber,
                 invoice_date AS invoiceDate,
                 received_at AS receivedAt,
                 received_by_name AS receivedByName,
                 receiving_note AS receivingNote,
                 received_total_amount AS receivedTotalAmount
            FROM purchase_orders
           WHERE ${where.join(" AND ")}
           ORDER BY received_at DESC, created_at DESC
           LIMIT ?`,
    params,
  };
}

function buildMovementSummaryQuery(tenantId: string, filters: StockReportFilters) {
  const where = ["sm.tenant_id = ?"];
  const params: unknown[] = [tenantId];
  addDateFilters(where, params, "sm.created_at", filters);
  return {
    sql: `SELECT COALESCE(sm.reason_code, 'adjustment') AS reasonCode,
                 COUNT(*) AS movementCount,
                 SUM(CASE WHEN sm.quantity_delta > 0 THEN sm.quantity_delta ELSE 0 END) AS quantityIn,
                 SUM(CASE WHEN sm.quantity_delta < 0 THEN ABS(sm.quantity_delta) ELSE 0 END) AS quantityOut,
                 SUM(sm.quantity_delta) AS netQuantity,
                 SUM(sm.quantity_delta * COALESCE(NULLIF(p.cost_price, 0), NULLIF(p.price, 0), 0)) AS valueDelta
            FROM stock_movements sm
            LEFT JOIN products p ON p.tenant_id = sm.tenant_id AND p.id = sm.product_id
           WHERE ${where.join(" AND ")}
           GROUP BY COALESCE(sm.reason_code, 'adjustment')
           ORDER BY reasonCode ASC`,
    params,
  };
}

function expiryStatus(row: any) {
  const status = String(row.status || "active");
  const remaining = toNumber(row.remainingQuantity ?? row.remaining_quantity);
  if (status === "depleted" || remaining <= 0) return "depleted";
  const rawExpiry = row.expiryDate ?? row.expiry_date;
  if (!rawExpiry) return "ok";
  const date = new Date(`${String(rawExpiry).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "ok";
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 14) return "expiring";
  return "ok";
}

function reportDateLabel(value: unknown) {
  return value ? String(value).slice(0, 10) : "";
}

function productName(row: any) {
  return String(row.productName ?? row.product_name ?? row.name ?? row.productId ?? row.product_id ?? "").trim();
}

export async function getStockValuationReport(tenantId: string, filters: StockReportFilters = {}) {
  const limit = clampLimit(filters.limit);
  const generatedAt = new Date().toISOString();
  const receivedPurchaseOrdersQuery = buildReceivedPurchaseOrdersQuery(tenantId, filters, limit);
  const movementSummaryQuery = buildMovementSummaryQuery(tenantId, filters);

  const [products, rawBatches, rawPurchaseOrders, movementRows] = await Promise.all([
    query<any>(
      `SELECT id,
              name,
              category,
              section,
              stock,
              min_stock AS minStock,
              price,
              cost_price AS costPrice
         FROM products
        WHERE tenant_id = ?
        ORDER BY name ASC
        LIMIT ?`,
      [tenantId, limit]
    ),
    query<any>(
      `SELECT id,
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
              received_by_name AS receivedByName,
              status,
              note,
              created_at AS createdAt
         FROM stock_batches
        WHERE tenant_id = ?
        ORDER BY
          CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
          expiry_date ASC,
          received_at DESC,
          created_at DESC
        LIMIT ?`,
      [tenantId, limit]
    ),
    query<any>(receivedPurchaseOrdersQuery.sql, receivedPurchaseOrdersQuery.params),
    query<any>(movementSummaryQuery.sql, movementSummaryQuery.params),
  ]);

  const batchRows = rawBatches.map((row: any) => {
    const receivedQuantity = quantity(toNumber(row.receivedQuantity ?? row.received_quantity));
    const remainingQuantity = quantity(toNumber(row.remainingQuantity ?? row.remaining_quantity));
    const unitCost = money(toNumber(row.unitCost ?? row.unit_cost));
    const status = expiryStatus(row);
    return {
      id: row.id,
      productId: row.productId ?? row.product_id,
      productName: productName(row),
      purchaseOrderId: row.purchaseOrderId ?? row.purchase_order_id ?? null,
      vendorId: row.vendorId ?? row.vendor_id ?? null,
      supplierInvoiceNumber: row.supplierInvoiceNumber ?? row.supplier_invoice_number ?? null,
      supplierInvoiceDate: row.supplierInvoiceDate ?? row.supplier_invoice_date ?? null,
      batchNumber: row.batchNumber ?? row.batch_number ?? null,
      receivedQuantity,
      remainingQuantity,
      unitCost,
      receivedValue: money(receivedQuantity * unitCost),
      remainingValue: money(remainingQuantity * unitCost),
      expiryDate: row.expiryDate ?? row.expiry_date ?? null,
      receivedAt: row.receivedAt ?? row.received_at ?? null,
      receivedByName: row.receivedByName ?? row.received_by_name ?? null,
      status,
      locationId: DEFAULT_LOCATION_ID,
      locationName: DEFAULT_LOCATION_NAME,
      note: row.note || null,
    };
  });

  const batchByProduct = new Map<string, { quantity: number; value: number }>();
  for (const batch of batchRows) {
    if (batch.status === "depleted") continue;
    const key = String(batch.productId || "");
    const existing = batchByProduct.get(key) || { quantity: 0, value: 0 };
    batchByProduct.set(key, {
      quantity: quantity(existing.quantity + batch.remainingQuantity),
      value: money(existing.value + batch.remainingValue),
    });
  }

  const productRows = products.map((product: any) => {
    const currentStock = quantity(toNumber(product.stock));
    const unitCost = money(toNumber(product.costPrice ?? product.cost_price) || toNumber(product.price));
    const retailPrice = money(toNumber(product.price));
    const batchTotals = batchByProduct.get(String(product.id)) || { quantity: 0, value: 0 };
    const unbatchedQuantity = quantity(Math.max(0, currentStock - batchTotals.quantity));
    const unbatchedValue = money(unbatchedQuantity * unitCost);
    const productBookValue = money(currentStock * unitCost);
    return {
      productId: product.id,
      productName: product.name,
      category: product.category || "",
      productSection: product.section || "",
      currentStock,
      minStock: quantity(toNumber(product.minStock ?? product.min_stock)),
      unitCost,
      retailPrice,
      productBookValue,
      batchTrackedQuantity: quantity(batchTotals.quantity),
      batchTrackedValue: money(batchTotals.value),
      unbatchedQuantity,
      unbatchedValue,
      locationId: DEFAULT_LOCATION_ID,
      locationName: DEFAULT_LOCATION_NAME,
      marginPercent: retailPrice > 0 ? money(((retailPrice - unitCost) / retailPrice) * 100) : 0,
    };
  });

  const receivingRows = rawPurchaseOrders.flatMap((order: any) => {
    const items = safeParse(order.items, []);
    if (!Array.isArray(items)) return [];
    return items.map((item: any, index: number) => {
      const orderedQuantity = quantity(toNumber(item.quantity));
      const receivedQuantity = quantity(toNumber(item.receivedQuantity ?? item.received_quantity ?? orderedQuantity));
      const unitCost = money(toNumber(item.receivedPrice ?? item.received_price ?? item.expectedPrice ?? item.expected_price));
      const varianceQuantity = quantity(toNumber(item.varianceQuantity ?? item.variance_quantity ?? (receivedQuantity - orderedQuantity)));
      return {
        purchaseOrderId: order.id,
        lineIndex: index,
        invoiceNumber: order.invoiceNumber ?? order.invoice_number ?? item.invoiceNumber ?? item.invoice_number ?? null,
        invoiceDate: order.invoiceDate ?? order.invoice_date ?? item.invoiceDate ?? item.invoice_date ?? null,
        receivedAt: order.receivedAt ?? order.received_at ?? item.receivedAt ?? item.received_at ?? null,
        receivedByName: order.receivedByName ?? order.received_by_name ?? item.receivedByName ?? item.received_by_name ?? null,
        productId: item.productId ?? item.product_id ?? null,
        productName: productName(item),
        orderedQuantity,
        receivedQuantity,
        varianceQuantity,
        unitCost,
        receivedValue: money(receivedQuantity * unitCost),
        batchNumber: item.batchNumber ?? item.batch_number ?? null,
        expiryDate: item.expiryDate ?? item.expiry_date ?? null,
        locationId: DEFAULT_LOCATION_ID,
        locationName: DEFAULT_LOCATION_NAME,
        note: item.receivingNote ?? item.receiving_note ?? order.receivingNote ?? order.receiving_note ?? null,
      };
    });
  });

  const movements = movementRows.map((row: any) => ({
    reasonCode: row.reasonCode ?? row.reason_code ?? "adjustment",
    movementCount: toNumber(row.movementCount ?? row.movement_count),
    quantityIn: quantity(toNumber(row.quantityIn ?? row.quantity_in)),
    quantityOut: quantity(toNumber(row.quantityOut ?? row.quantity_out)),
    netQuantity: quantity(toNumber(row.netQuantity ?? row.net_quantity)),
    valueDelta: money(toNumber(row.valueDelta ?? row.value_delta)),
    locationId: DEFAULT_LOCATION_ID,
    locationName: DEFAULT_LOCATION_NAME,
  }));

  const summary = {
    totalProducts: productRows.length,
    currentStockQuantity: quantity(productRows.reduce((sum: number, row: any) => sum + row.currentStock, 0)),
    productBookValue: money(productRows.reduce((sum: number, row: any) => sum + row.productBookValue, 0)),
    batchTrackedQuantity: quantity(productRows.reduce((sum: number, row: any) => sum + row.batchTrackedQuantity, 0)),
    batchRemainingValue: money(productRows.reduce((sum: number, row: any) => sum + row.batchTrackedValue, 0)),
    unbatchedQuantity: quantity(productRows.reduce((sum: number, row: any) => sum + row.unbatchedQuantity, 0)),
    unbatchedValue: money(productRows.reduce((sum: number, row: any) => sum + row.unbatchedValue, 0)),
    receivedQuantity: quantity(receivingRows.reduce((sum: number, row: any) => sum + row.receivedQuantity, 0)),
    receivedValue: money(receivingRows.reduce((sum: number, row: any) => sum + row.receivedValue, 0)),
    varianceQuantity: quantity(receivingRows.reduce((sum: number, row: any) => sum + row.varianceQuantity, 0)),
    expiredBatchValue: money(batchRows.filter((row: any) => row.status === "expired").reduce((sum: number, row: any) => sum + row.remainingValue, 0)),
    expiringBatchValue: money(batchRows.filter((row: any) => row.status === "expiring").reduce((sum: number, row: any) => sum + row.remainingValue, 0)),
    movementValueDelta: money(movements.reduce((sum: number, row: any) => sum + row.valueDelta, 0)),
  };

  const locationRows = [{
    locationId: DEFAULT_LOCATION_ID,
    locationName: DEFAULT_LOCATION_NAME,
    currentStockQuantity: summary.currentStockQuantity,
    productBookValue: summary.productBookValue,
    batchTrackedQuantity: summary.batchTrackedQuantity,
    batchRemainingValue: summary.batchRemainingValue,
    unbatchedQuantity: summary.unbatchedQuantity,
    receivedQuantity: summary.receivedQuantity,
    receivedValue: summary.receivedValue,
    movementQuantityIn: quantity(movements.reduce((sum: number, row: any) => sum + row.quantityIn, 0)),
    movementQuantityOut: quantity(movements.reduce((sum: number, row: any) => sum + row.quantityOut, 0)),
    movementValueDelta: summary.movementValueDelta,
    note: LOCATION_NOTE,
  }];

  const header = [
    "section",
    "generatedAt",
    "locationId",
    "locationName",
    "productId",
    "productName",
    "category",
    "productSection",
    "referenceType",
    "referenceId",
    "batchNumber",
    "invoiceNumber",
    "status",
    "quantity",
    "unitCost",
    "value",
    "varianceQuantity",
    "reasonCode",
    "detail",
  ];

  const csvRows: unknown[][] = [
    ["summary", generatedAt, "", "", "", "", "", "", "tenant", tenantId, "", "", "", summary.currentStockQuantity, "", summary.productBookValue, summary.varianceQuantity, "", JSON.stringify(summary)],
    ...locationRows.map((row: any) => ["location_impact", generatedAt, row.locationId, row.locationName, "", "", "", "", "location", row.locationId, "", "", "", row.currentStockQuantity, "", row.productBookValue, "", "", row.note]),
    ...productRows.map((row: any) => ["product_valuation", generatedAt, row.locationId, row.locationName, row.productId, row.productName, row.category, row.productSection, "product", row.productId, "", "", "", row.currentStock, row.unitCost, row.productBookValue, "", "", `Batch tracked ${row.batchTrackedQuantity}; unbatched ${row.unbatchedQuantity}`]),
    ...batchRows.map((row: any) => ["batch_impact", generatedAt, row.locationId, row.locationName, row.productId, row.productName, "", "", "batch", row.id, row.batchNumber, row.supplierInvoiceNumber, row.status, row.remainingQuantity, row.unitCost, row.remainingValue, "", "", `Received ${row.receivedQuantity} on ${reportDateLabel(row.receivedAt)}; expires ${reportDateLabel(row.expiryDate) || "none"}`]),
    ...receivingRows.map((row: any) => ["receiving_impact", generatedAt, row.locationId, row.locationName, row.productId, row.productName, "", "", "purchase_order", row.purchaseOrderId, row.batchNumber, row.invoiceNumber, "received", row.receivedQuantity, row.unitCost, row.receivedValue, row.varianceQuantity, "receiving", row.note || ""]),
    ...movements.map((row: any) => ["movement_impact", generatedAt, row.locationId, row.locationName, "", "", "", "", "stock_movement", row.reasonCode, "", "", "", row.netQuantity, "", row.valueDelta, "", row.reasonCode, `${row.movementCount} movements; in ${row.quantityIn}; out ${row.quantityOut}`]),
  ];

  const csv = [header, ...csvRows].map((row) => row.map(csvCell).join(",")).join("\n");
  const topProducts = [...productRows]
    .sort((a: any, b: any) => b.productBookValue - a.productBookValue)
    .slice(0, 12);
  const riskBatches = batchRows
    .filter((row: any) => row.status === "expired" || row.status === "expiring")
    .slice(0, 12);
  const pdfBase64 = createSimplePdfBase64("MasePOS stock valuation and receiving impact pack", [
    {
      heading: "Summary",
      rows: [
        `Products: ${summary.totalProducts}`,
        `Book value: R${summary.productBookValue.toFixed(2)}`,
        `Batch value: R${summary.batchRemainingValue.toFixed(2)}`,
        `Unbatched value: R${summary.unbatchedValue.toFixed(2)}`,
        `Received value in period: R${summary.receivedValue.toFixed(2)}`,
        `Receiving variance quantity: ${summary.varianceQuantity.toFixed(3)}`,
      ],
    },
    {
      heading: "Location impact",
      rows: locationRows.map((row: any) => [
        row.locationName,
        `stock ${row.currentStockQuantity}`,
        `value R${row.productBookValue.toFixed(2)}`,
        `received R${row.receivedValue.toFixed(2)}`,
        row.note,
      ]),
    },
    {
      heading: "Top valuation",
      rows: topProducts.map((row: any) => [
        row.productName,
        `stock ${row.currentStock}`,
        `unit R${row.unitCost.toFixed(2)}`,
        `value R${row.productBookValue.toFixed(2)}`,
        `unbatched ${row.unbatchedQuantity}`,
      ]),
    },
    {
      heading: "Batch risk",
      rows: riskBatches.length
        ? riskBatches.map((row: any) => [
            row.productName,
            row.status,
            row.batchNumber || "no batch",
            `remaining ${row.remainingQuantity}`,
            `value R${row.remainingValue.toFixed(2)}`,
          ])
        : ["No expired or expiring batches in this pack."],
    },
    {
      heading: "Receiving impact",
      rows: receivingRows.slice(0, 16).map((row: any) => [
        row.productName,
        row.invoiceNumber || row.purchaseOrderId,
        `received ${row.receivedQuantity}`,
        `variance ${row.varianceQuantity}`,
        `value R${row.receivedValue.toFixed(2)}`,
      ]),
    },
    {
      heading: "Movement value impact",
      rows: movements.map((row: any) => [
        row.reasonCode,
        `${row.movementCount} moves`,
        `in ${row.quantityIn}`,
        `out ${row.quantityOut}`,
        `value R${row.valueDelta.toFixed(2)}`,
      ]),
    },
  ]);

  const today = generatedAt.slice(0, 10);
  return {
    filename: `masepos-stock-valuation-impact-${today}.csv`,
    pdfFilename: `masepos-stock-valuation-impact-${today}.pdf`,
    mimeType: "text/csv",
    pdfMimeType: "application/pdf",
    generatedAt,
    filters: {
      from: dayBoundary(filters.from),
      to: dayBoundary(filters.to, true),
      limit,
      locationMode: "single_stock_pool",
    },
    summary,
    productRows,
    batchRows,
    receivingRows,
    movementRows: movements,
    locationRows,
    csv,
    pdfBase64,
  };
}
