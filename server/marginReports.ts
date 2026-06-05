import { query } from "./db.js";
import { createSimplePdfBase64 } from "./pdfExport.js";

type MarginReportFilters = {
  from?: string | null;
  to?: string | null;
};

type MarginRow = {
  key: string;
  label: string;
  quantity: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  grossMarginPercent: number;
  saleCount: number;
  missingCostCount: number;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number((Number.isFinite(parsed) ? parsed : 0).toFixed(2));
}

function qty(value: unknown) {
  const parsed = Number(value || 0);
  return Number((Number.isFinite(parsed) ? parsed : 0).toFixed(3));
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function parseDate(value: unknown, fallback: Date, endOfDay = false) {
  const text = clean(value);
  if (!text) return fallback;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(23, 59, 59, 999);
  return next;
}

function dbTimestamp(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function dateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}

function resolveRange(filters: MarginReportFilters = {}) {
  const now = new Date();
  let from = parseDate(filters.from, monthStart(now));
  let to = parseDate(filters.to, endOfDay(now), true);
  if (from > to) {
    const oldFrom = from;
    from = parseDate(filters.to, monthStart(now));
    to = endOfDay(oldFrom);
  }
  return {
    from,
    to,
    fromSql: dbTimestamp(from),
    toSql: dbTimestamp(to),
    label: `${dateLabel(from)} to ${dateLabel(to)}`,
  };
}

function marginPercent(profit: number, revenue: number) {
  return revenue > 0 ? money((profit / revenue) * 100) : 0;
}

function addToMap(map: Map<string, any>, key: string, label: string, line: any) {
  const row = map.get(key) || {
    key,
    label,
    quantity: 0,
    revenue: 0,
    cost: 0,
    grossProfit: 0,
    saleIds: new Set<string>(),
    missingCostCount: 0,
  };
  row.quantity = qty(row.quantity + line.quantity);
  row.revenue = money(row.revenue + line.netRevenue);
  row.cost = money(row.cost + line.cost);
  row.grossProfit = money(row.grossProfit + line.grossProfit);
  if (line.saleId) row.saleIds.add(line.saleId);
  row.missingCostCount += line.missingCost ? 1 : 0;
  map.set(key, row);
}

function finalizeRows(map: Map<string, any>, limit?: number): MarginRow[] {
  const rows = Array.from(map.values()).map(row => ({
    key: row.key,
    label: row.label,
    quantity: qty(row.quantity),
    revenue: money(row.revenue),
    cost: money(row.cost),
    grossProfit: money(row.grossProfit),
    grossMarginPercent: marginPercent(row.grossProfit, row.revenue),
    saleCount: row.saleIds?.size || 0,
    missingCostCount: row.missingCostCount || 0,
  })).sort((a, b) => b.grossProfit - a.grossProfit || b.revenue - a.revenue);
  return limit ? rows.slice(0, limit) : rows;
}

function periodKey(value: unknown) {
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toISOString().slice(0, 10);
}

export async function getMarginReport(tenantId: string, filters: MarginReportFilters = {}) {
  const generatedAt = new Date().toISOString();
  const range = resolveRange(filters);
  const itemRows = await query<any>(
    `SELECT
       s.id AS saleId,
       s.created_at AS createdAt,
       COALESCE(s.transaction_type, 'sale') AS transactionType,
       s.total AS saleTotal,
       s.tax_amount AS saleTaxAmount,
       s.payment_method AS salePaymentMethod,
       s.staff_id AS staffId,
       st.name AS staffName,
       si.id AS saleItemId,
       si.product_id AS productId,
       si.product_name AS productName,
       si.price,
       si.quantity,
       p.category AS category,
       p.section AS section,
       COALESCE(p.cost_price, 0) AS costPrice
     FROM sale_items si
     INNER JOIN sales s ON s.id = si.sale_id
     LEFT JOIN products p ON p.tenant_id = s.tenant_id AND p.id = si.product_id
     LEFT JOIN staff st ON st.tenant_id = s.tenant_id AND st.id = s.staff_id
     WHERE s.tenant_id = ?
       AND s.status = 'completed'
       AND COALESCE(s.transaction_type, 'sale') IN ('sale','refund')
       AND s.created_at >= ?
       AND s.created_at <= ?
     ORDER BY s.created_at ASC, s.id ASC`,
    [tenantId, range.fromSql, range.toSql]
  );

  const saleGross = new Map<string, number>();
  for (const row of itemRows) {
    const lineGross = money(Number(row.price || 0) * Number(row.quantity || 0));
    saleGross.set(row.saleId, money((saleGross.get(row.saleId) || 0) + lineGross));
  }

  const lines = itemRows.map((row: any) => {
    const lineGross = money(Number(row.price || 0) * Number(row.quantity || 0));
    const grossForSale = saleGross.get(row.saleId) || Number(row.saleTotal || 0) || lineGross;
    const share = grossForSale !== 0 ? lineGross / grossForSale : 0;
    const lineTax = money(Number(row.saleTaxAmount || 0) * share);
    const netRevenue = money(lineGross - lineTax);
    const costPrice = money(row.costPrice);
    const cost = money(costPrice * Number(row.quantity || 0));
    const grossProfit = money(netRevenue - cost);
    return {
      saleId: row.saleId,
      createdAt: row.createdAt,
      productId: row.productId || row.productName || "unknown_product",
      productName: row.productName || "Unknown product",
      category: row.category || "Uncategorised",
      section: row.section || "Unsectioned",
      staffId: row.staffId || "unassigned",
      staffName: row.staffName || row.staffId || "Unassigned staff",
      salePaymentMethod: row.salePaymentMethod || "unknown",
      quantity: qty(row.quantity),
      netRevenue,
      cost,
      grossProfit,
      missingCost: !costPrice,
    };
  });

  const byProduct = new Map<string, any>();
  const byCategory = new Map<string, any>();
  const byStaff = new Map<string, any>();
  const byPeriod = new Map<string, any>();
  const bySale = new Map<string, any>();

  for (const line of lines) {
    addToMap(byProduct, String(line.productId), line.productName, line);
    addToMap(byCategory, line.category, line.category, line);
    addToMap(byStaff, line.staffId, line.staffName, line);
    addToMap(byPeriod, periodKey(line.createdAt), periodKey(line.createdAt), line);

    const sale = bySale.get(line.saleId) || { saleId: line.saleId, revenue: 0, cost: 0, grossProfit: 0, paymentMethod: line.salePaymentMethod };
    sale.revenue = money(sale.revenue + line.netRevenue);
    sale.cost = money(sale.cost + line.cost);
    sale.grossProfit = money(sale.grossProfit + line.grossProfit);
    bySale.set(line.saleId, sale);
  }

  const paymentRows = await query<any>(
    `SELECT
       s.id AS saleId,
       s.payment_method AS salePaymentMethod,
       s.total AS saleTotal,
       sp.method AS paymentMethod,
       sp.amount AS amount
     FROM sales s
     LEFT JOIN sale_payments sp ON sp.sale_id = s.id
     WHERE s.tenant_id = ?
       AND s.status = 'completed'
       AND COALESCE(s.transaction_type, 'sale') IN ('sale','refund')
       AND s.created_at >= ?
       AND s.created_at <= ?`,
    [tenantId, range.fromSql, range.toSql]
  );
  const paymentsBySale = new Map<string, any[]>();
  for (const row of paymentRows) {
    const sale = bySale.get(row.saleId);
    if (!sale) continue;
    const method = row.paymentMethod || row.salePaymentMethod || sale.paymentMethod || "unknown";
    const amount = row.paymentMethod ? money(row.amount) : money(row.saleTotal || sale.revenue);
    paymentsBySale.set(row.saleId, [...(paymentsBySale.get(row.saleId) || []), { method, amount }]);
  }

  const byPaymentMethod = new Map<string, any>();
  for (const sale of bySale.values()) {
    const payments = paymentsBySale.get(sale.saleId) || [{ method: sale.paymentMethod || "unknown", amount: sale.revenue }];
    const basis = payments.reduce((sum, payment) => sum + Math.abs(Number(payment.amount || 0)), 0) || Math.abs(sale.revenue) || 1;
    for (const payment of payments) {
      const share = Math.abs(Number(payment.amount || 0)) / basis;
      addToMap(byPaymentMethod, payment.method, payment.method, {
        saleId: sale.saleId,
        quantity: 0,
        netRevenue: money(sale.revenue * share),
        cost: money(sale.cost * share),
        grossProfit: money(sale.grossProfit * share),
        missingCost: false,
      });
    }
  }

  const summary = {
    revenue: money(lines.reduce((sum, line) => sum + line.netRevenue, 0)),
    cost: money(lines.reduce((sum, line) => sum + line.cost, 0)),
    grossProfit: money(lines.reduce((sum, line) => sum + line.grossProfit, 0)),
    quantity: qty(lines.reduce((sum, line) => sum + line.quantity, 0)),
    saleCount: bySale.size,
    productCount: byProduct.size,
    categoryCount: byCategory.size,
    staffCount: byStaff.size,
    paymentMethodCount: byPaymentMethod.size,
    missingCostCount: lines.filter(line => line.missingCost).length,
  };
  const finalSummary = {
    ...summary,
    grossMarginPercent: marginPercent(summary.grossProfit, summary.revenue),
  };

  const productRows = finalizeRows(byProduct);
  const categoryRows = finalizeRows(byCategory);
  const staffRows = finalizeRows(byStaff);
  const paymentMethodRows = finalizeRows(byPaymentMethod);
  const periodRows = finalizeRows(byPeriod);
  const lowMarginRows = productRows.filter(row => row.revenue > 0 && row.grossMarginPercent < 30);

  const csvRows: unknown[][] = [
    ["section", "generatedAt", "period", "label", "quantity", "revenue", "cost", "grossProfit", "grossMarginPercent", "saleCount", "missingCostCount"],
    ["summary", generatedAt, range.label, "Total", finalSummary.quantity, finalSummary.revenue, finalSummary.cost, finalSummary.grossProfit, finalSummary.grossMarginPercent, finalSummary.saleCount, finalSummary.missingCostCount],
    ...productRows.map(row => ["product", generatedAt, range.label, row.label, row.quantity, row.revenue, row.cost, row.grossProfit, row.grossMarginPercent, row.saleCount, row.missingCostCount]),
    ...categoryRows.map(row => ["category", generatedAt, range.label, row.label, row.quantity, row.revenue, row.cost, row.grossProfit, row.grossMarginPercent, row.saleCount, row.missingCostCount]),
    ...staffRows.map(row => ["staff", generatedAt, range.label, row.label, row.quantity, row.revenue, row.cost, row.grossProfit, row.grossMarginPercent, row.saleCount, row.missingCostCount]),
    ...paymentMethodRows.map(row => ["payment_method", generatedAt, range.label, row.label, row.quantity, row.revenue, row.cost, row.grossProfit, row.grossMarginPercent, row.saleCount, row.missingCostCount]),
    ...periodRows.map(row => ["period", generatedAt, range.label, row.label, row.quantity, row.revenue, row.cost, row.grossProfit, row.grossMarginPercent, row.saleCount, row.missingCostCount]),
  ];

  const pdfBase64 = createSimplePdfBase64("Jimmy POS margin report", [
    {
      heading: "Summary",
      rows: [
        `Period: ${range.label}`,
        `Revenue: R${finalSummary.revenue.toFixed(2)}`,
        `Cost: R${finalSummary.cost.toFixed(2)}`,
        `Gross profit: R${finalSummary.grossProfit.toFixed(2)}`,
        `Gross margin: ${finalSummary.grossMarginPercent.toFixed(1)}%`,
        `Missing cost lines: ${finalSummary.missingCostCount}`,
      ],
    },
    {
      heading: "Top products",
      rows: productRows.slice(0, 12).map(row => [row.label, `profit ${row.grossProfit.toFixed(2)}`, `margin ${row.grossMarginPercent.toFixed(1)}%`]),
    },
    {
      heading: "Payment methods",
      rows: paymentMethodRows.map(row => [row.label, `revenue ${row.revenue.toFixed(2)}`, `profit ${row.grossProfit.toFixed(2)}`]),
    },
    {
      heading: "Low margin products",
      rows: lowMarginRows.slice(0, 12).map(row => [row.label, `margin ${row.grossMarginPercent.toFixed(1)}%`, `profit ${row.grossProfit.toFixed(2)}`]),
    },
  ]);

  return {
    filename: `jimmy-pos-margin-${dateLabel(range.from)}-${dateLabel(range.to)}.csv`,
    pdfFilename: `jimmy-pos-margin-${dateLabel(range.from)}-${dateLabel(range.to)}.pdf`,
    mimeType: "text/csv",
    pdfMimeType: "application/pdf",
    generatedAt,
    periodStart: range.fromSql,
    periodEnd: range.toSql,
    periodLabel: range.label,
    summary: finalSummary,
    productRows,
    categoryRows,
    staffRows,
    paymentMethodRows,
    periodRows,
    lowMarginRows,
    csv: csvRows.map(row => row.map(csvCell).join(",")).join("\n"),
    pdfBase64,
  };
}
