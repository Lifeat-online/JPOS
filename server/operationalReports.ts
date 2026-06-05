import { query } from "./db.js";
import { createSimplePdfBase64 } from "./pdfExport.js";

type OperationalReportFilters = {
  from?: string | null;
  to?: string | null;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number((Number.isFinite(parsed) ? parsed : 0).toFixed(2));
}

function quantity(value: unknown) {
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

function resolveRange(filters: OperationalReportFilters = {}) {
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
    fromDate: dateLabel(from),
    toDate: dateLabel(to),
    label: `${dateLabel(from)} to ${dateLabel(to)}`,
  };
}

function dayKey(value: unknown) {
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toISOString().slice(0, 10);
}

function minutesBetween(start: unknown, end: unknown) {
  const started = new Date(start as any);
  const ended = new Date(end as any);
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) return null;
  return Math.max(0, Math.round((ended.getTime() - started.getTime()) / 60000));
}

function ageMinutesSince(value: unknown, now: Date) {
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
}

function average(total: number, count: number) {
  return count > 0 ? money(total / count) : 0;
}

function basketSegment(total: number) {
  if (total < 100) return "Under R100";
  if (total < 250) return "R100 - R249";
  if (total < 500) return "R250 - R499";
  return "R500+";
}

function tabAgeBucket(ageMinutes: number) {
  if (ageMinutes < 60) return "Under 1h";
  if (ageMinutes < 120) return "1h - 2h";
  if (ageMinutes < 240) return "2h - 4h";
  return "Over 4h";
}

function addBreakdownRow(map: Map<string, any>, key: string, label: string, value: any) {
  const row = map.get(key) || {
    key,
    label,
    count: 0,
    quantity: 0,
    revenue: 0,
    saleIds: new Set<string>(),
  };
  row.count += 1;
  row.quantity = quantity(row.quantity + Number(value.quantity || 0));
  row.revenue = money(row.revenue + Number(value.revenue || 0));
  if (value.saleId) row.saleIds.add(value.saleId);
  map.set(key, row);
}

function finalizePerformanceRows(map: Map<string, any>) {
  return Array.from(map.values()).map(row => ({
    key: row.key,
    label: row.label,
    lineCount: row.count,
    saleCount: row.saleIds?.size || 0,
    quantity: quantity(row.quantity),
    revenue: money(row.revenue),
    averageLineRevenue: average(row.revenue, row.count),
  })).sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity);
}

function summarizeTrend(rows: Array<{ label: string; variance: number; source: string }>) {
  const byDay = new Map<string, any>();
  for (const row of rows) {
    const current = byDay.get(row.label) || {
      label: row.label,
      registerVariance: 0,
      closeVariance: 0,
      netVariance: 0,
      absoluteVariance: 0,
      count: 0,
    };
    if (row.source === "register") current.registerVariance = money(current.registerVariance + row.variance);
    if (row.source === "eod") current.closeVariance = money(current.closeVariance + row.variance);
    current.netVariance = money(current.netVariance + row.variance);
    current.absoluteVariance = money(current.absoluteVariance + Math.abs(row.variance));
    current.count += 1;
    byDay.set(row.label, current);
  }
  return Array.from(byDay.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export async function getOperationalAnalyticsReport(tenantId: string, filters: OperationalReportFilters = {}) {
  const generatedAt = new Date().toISOString();
  const now = new Date();
  const range = resolveRange(filters);

  const itemRows = await query<any>(
    `SELECT
       s.id AS saleId,
       s.created_at AS createdAt,
       s.total AS saleTotal,
       s.tax_amount AS saleTaxAmount,
       COALESCE(s.transaction_type, 'sale') AS transactionType,
       si.id AS saleItemId,
       si.product_name AS productName,
       si.price,
       si.quantity,
       COALESCE(p.category, 'Uncategorised') AS category
     FROM sale_items si
     INNER JOIN sales s ON s.id = si.sale_id
     LEFT JOIN products p ON p.tenant_id = s.tenant_id AND p.id = si.product_id
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
    const gross = money(Number(row.price || 0) * Number(row.quantity || 0));
    saleGross.set(row.saleId, money((saleGross.get(row.saleId) || 0) + gross));
  }

  const categoryMap = new Map<string, any>();
  for (const row of itemRows) {
    const lineGross = money(Number(row.price || 0) * Number(row.quantity || 0));
    const grossForSale = saleGross.get(row.saleId) || Number(row.saleTotal || 0) || lineGross;
    const share = grossForSale !== 0 ? lineGross / grossForSale : 0;
    const netRevenue = money(lineGross - Number(row.saleTaxAmount || 0) * share);
    addBreakdownRow(categoryMap, clean(row.category) || "Uncategorised", clean(row.category) || "Uncategorised", {
      saleId: row.saleId,
      quantity: row.quantity,
      revenue: netRevenue,
    });
  }
  const categoryPerformance = finalizePerformanceRows(categoryMap);

  const completedSales = await query<any>(
    `SELECT
       s.id AS saleId,
       s.created_at AS createdAt,
       s.updated_at AS updatedAt,
       s.total,
       s.tax_amount AS taxAmount,
       s.table_number AS tableNumber,
       s.is_tab AS isTab,
       s.tab_name AS tabName,
       COUNT(si.id) AS itemLineCount,
       COALESCE(SUM(ABS(si.quantity)), 0) AS itemCount
     FROM sales s
     LEFT JOIN sale_items si ON si.sale_id = s.id
     WHERE s.tenant_id = ?
       AND s.status = 'completed'
       AND COALESCE(s.transaction_type, 'sale') = 'sale'
       AND s.created_at >= ?
       AND s.created_at <= ?
     GROUP BY s.id, s.created_at, s.updated_at, s.total, s.tax_amount, s.table_number, s.is_tab, s.tab_name
     ORDER BY s.created_at ASC`,
    [tenantId, range.fromSql, range.toSql]
  );

  const basketMap = new Map<string, any>();
  for (const sale of completedSales) {
    const gross = money(sale.total);
    const label = basketSegment(gross);
    const row = basketMap.get(label) || { label, count: 0, revenue: 0, itemCount: 0 };
    row.count += 1;
    row.revenue = money(row.revenue + gross);
    row.itemCount = quantity(row.itemCount + Number(sale.itemCount || sale.item_count || 0));
    basketMap.set(label, row);
  }
  const basketSegments = Array.from(basketMap.values()).map(row => ({
    label: row.label,
    saleCount: row.count,
    revenue: money(row.revenue),
    averageBasket: average(row.revenue, row.count),
    averageItems: row.count > 0 ? quantity(row.itemCount / row.count) : 0,
  })).sort((a, b) => {
    const order = ["Under R100", "R100 - R249", "R250 - R499", "R500+"];
    return order.indexOf(a.label) - order.indexOf(b.label);
  });

  const restaurantTables = await query<any>(
    `SELECT id, label, status
       FROM restaurant_tables
      WHERE tenant_id = ?
        AND status = 'active'
      ORDER BY label ASC`,
    [tenantId]
  );
  const tableMap = new Map<string, any>();
  for (const table of restaurantTables) {
    tableMap.set(clean(table.label || table.id), {
      tableNumber: clean(table.label || table.id),
      saleCount: 0,
      revenue: 0,
      durationMinutes: 0,
      durationCount: 0,
    });
  }
  for (const sale of completedSales) {
    const tableNumber = clean(sale.tableNumber ?? sale.table_number);
    if (!tableNumber) continue;
    const row = tableMap.get(tableNumber) || { tableNumber, saleCount: 0, revenue: 0, durationMinutes: 0, durationCount: 0 };
    row.saleCount += 1;
    row.revenue = money(row.revenue + Number(sale.total || 0));
    const duration = minutesBetween(sale.createdAt ?? sale.created_at, sale.updatedAt ?? sale.updated_at);
    if (duration !== null) {
      row.durationMinutes += duration;
      row.durationCount += 1;
    }
    tableMap.set(tableNumber, row);
  }
  const tableTurnoverRows = Array.from(tableMap.values()).map(row => ({
    tableNumber: row.tableNumber,
    saleCount: row.saleCount,
    revenue: money(row.revenue),
    averageCheck: average(row.revenue, row.saleCount),
    averageDurationMinutes: row.durationCount > 0 ? Math.round(row.durationMinutes / row.durationCount) : 0,
  })).sort((a, b) => b.saleCount - a.saleCount || b.revenue - a.revenue);
  const tableTurnoverSummary = {
    activeTableCount: restaurantTables.length,
    tableSaleCount: tableTurnoverRows.reduce((sum, row) => sum + row.saleCount, 0),
    turnoverPerTable: restaurantTables.length > 0
      ? Number((tableTurnoverRows.reduce((sum, row) => sum + row.saleCount, 0) / restaurantTables.length).toFixed(2))
      : 0,
  };

  const openTabRowsRaw = await query<any>(
    `SELECT
       id,
       created_at AS createdAt,
       updated_at AS updatedAt,
       table_number AS tableNumber,
       tab_name AS tabName,
       total,
       staff_id AS staffId,
       status
     FROM sales
     WHERE tenant_id = ?
       AND COALESCE(transaction_type, 'sale') = 'sale'
       AND status IN ('open','pending','kitchen')
       AND (is_tab = 1 OR tab_name IS NOT NULL)
     ORDER BY created_at ASC`,
    [tenantId]
  );
  const tabBucketMap = new Map<string, any>();
  const openTabs = openTabRowsRaw.map((tab: any) => {
    const ageMinutes = ageMinutesSince(tab.createdAt ?? tab.created_at, now);
    const bucket = tabAgeBucket(ageMinutes);
    const current = tabBucketMap.get(bucket) || { label: bucket, count: 0, total: 0 };
    current.count += 1;
    current.total = money(current.total + Number(tab.total || 0));
    tabBucketMap.set(bucket, current);
    return {
      saleId: tab.id,
      tabName: tab.tabName ?? tab.tab_name ?? tab.tableNumber ?? tab.table_number ?? tab.id,
      tableNumber: tab.tableNumber ?? tab.table_number ?? null,
      status: tab.status,
      total: money(tab.total),
      ageMinutes,
      ageBucket: bucket,
      staffId: tab.staffId ?? tab.staff_id ?? null,
      createdAt: tab.createdAt ?? tab.created_at,
    };
  });
  const openTabAging = {
    count: openTabs.length,
    totalValue: money(openTabs.reduce((sum, tab) => sum + tab.total, 0)),
    oldestAgeMinutes: openTabs.reduce((max, tab) => Math.max(max, tab.ageMinutes), 0),
    buckets: Array.from(tabBucketMap.values()),
    rows: openTabs.sort((a, b) => b.ageMinutes - a.ageMinutes),
  };

  const refundVoidRowsRaw = await query<any>(
    `SELECT
       id,
       created_at AS createdAt,
       total,
       COALESCE(transaction_type, 'sale') AS transactionType,
       parent_sale_id AS parentSaleId,
       refund_status AS refundStatus,
       refunded_amount AS refundedAmount,
       refund_reason AS refundReason,
       void_reason AS voidReason,
       staff_id AS staffId,
       payment_method AS paymentMethod
     FROM sales
     WHERE tenant_id = ?
       AND created_at >= ?
       AND created_at <= ?
       AND (
         COALESCE(transaction_type, 'sale') IN ('refund','void')
         OR COALESCE(refund_status, 'none') <> 'none'
         OR void_reason IS NOT NULL
       )
     ORDER BY created_at DESC`,
    [tenantId, range.fromSql, range.toSql]
  );
  const refundVoidRows = refundVoidRowsRaw.map((row: any) => {
    const transactionType = row.transactionType ?? row.transaction_type ?? "sale";
    const refundStatus = row.refundStatus ?? row.refund_status ?? "none";
    const refundedAmount = money(row.refundedAmount ?? row.refunded_amount);
    const refundReason = row.refundReason ?? row.refund_reason ?? "";
    const voidReason = row.voidReason ?? row.void_reason ?? "";
    return {
      saleId: row.id,
      createdAt: row.createdAt ?? row.created_at,
      transactionType,
      parentSaleId: row.parentSaleId ?? row.parent_sale_id ?? null,
      amount: transactionType === "sale" && refundStatus !== "none"
        ? Math.abs(refundedAmount)
        : Math.abs(money(row.total)),
      refundStatus,
      refundedAmount,
      refundReason,
      voidReason,
      reason: refundReason || voidReason,
      staffId: row.staffId ?? row.staff_id ?? null,
      paymentMethod: row.paymentMethod ?? row.payment_method ?? null,
    };
  });
  const refundRows = refundVoidRows.filter(row => row.transactionType === "refund" || (row.refundStatus && row.refundStatus !== "none"));
  const voidRows = refundVoidRows.filter(row => row.transactionType === "void" || Boolean(row.voidReason));
  const refundVoidSummary = {
    refundCount: refundRows.length,
    voidCount: voidRows.length,
    refundAmount: money(refundRows.reduce((sum, row) => sum + row.amount, 0)),
    voidAmount: money(voidRows.reduce((sum, row) => sum + row.amount, 0)),
  };

  const cashSessionRows = await query<any>(
    `SELECT
       id,
       staff_id AS staffId,
       staff_name AS staffName,
       opened_at AS openedAt,
       closed_at AS closedAt,
       submitted_at AS submittedAt,
       expected_cash AS expectedCash,
       actual_cash AS actualCash,
       difference,
       review_status AS reviewStatus,
       variance_reason AS varianceReason
     FROM cash_sessions
     WHERE tenant_id = ?
       AND COALESCE(closed_at, submitted_at, created_at) >= ?
       AND COALESCE(closed_at, submitted_at, created_at) <= ?
     ORDER BY COALESCE(closed_at, submitted_at, created_at) ASC`,
    [tenantId, range.fromSql, range.toSql]
  );
  const cashCloseRows = await query<any>(
    `SELECT
       id,
       business_date AS businessDate,
       status,
       expected_physical_cash AS expectedPhysicalCash,
       counted_physical_cash AS countedPhysicalCash,
       variance,
       custody_variance_today AS custodyVarianceToday,
       note
     FROM cash_close_checkpoints
     WHERE tenant_id = ?
       AND business_date >= ?
       AND business_date <= ?
     ORDER BY business_date ASC`,
    [tenantId, range.fromDate, range.toDate]
  );
  const cashVarianceRows = [
    ...cashSessionRows.map((row: any) => ({
      source: "register",
      id: row.id,
      label: dayKey(row.closedAt ?? row.closed_at ?? row.submittedAt ?? row.submitted_at ?? row.openedAt ?? row.opened_at),
      staffName: row.staffName ?? row.staff_name ?? row.staffId ?? row.staff_id ?? null,
      expected: money(row.expectedCash ?? row.expected_cash),
      counted: money(row.actualCash ?? row.actual_cash),
      variance: money(row.difference),
      status: row.reviewStatus ?? row.review_status ?? null,
      reason: row.varianceReason ?? row.variance_reason ?? null,
    })),
    ...cashCloseRows.map((row: any) => ({
      source: "eod",
      id: row.id,
      label: dayKey(row.businessDate ?? row.business_date),
      staffName: null,
      expected: money(row.expectedPhysicalCash ?? row.expected_physical_cash),
      counted: money(row.countedPhysicalCash ?? row.counted_physical_cash),
      variance: money(row.variance),
      status: row.status,
      reason: row.note || null,
    })),
  ];
  const cashVarianceTrend = summarizeTrend(cashVarianceRows);
  const cashVarianceSummary = {
    count: cashVarianceRows.length,
    netVariance: money(cashVarianceRows.reduce((sum, row) => sum + row.variance, 0)),
    absoluteVariance: money(cashVarianceRows.reduce((sum, row) => sum + Math.abs(row.variance), 0)),
    unresolvedCount: cashVarianceRows.filter(row => row.status && !["balanced", "reconciled"].includes(String(row.status))).length,
  };

  const summary = {
    categoryCount: categoryPerformance.length,
    basketSegmentCount: basketSegments.length,
    completedSaleCount: completedSales.length,
    tableSaleCount: tableTurnoverSummary.tableSaleCount,
    openTabCount: openTabAging.count,
    refundVoidCount: refundVoidRows.length,
    cashVarianceCount: cashVarianceSummary.count,
    cashAbsoluteVariance: cashVarianceSummary.absoluteVariance,
  };

  const csvRows: unknown[][] = [
    ["section", "generatedAt", "period", "label", "count", "quantity", "revenue", "amount", "status", "detail"],
    ["summary", generatedAt, range.label, "categoryCount", summary.categoryCount, "", "", "", "", JSON.stringify(summary)],
    ...categoryPerformance.map(row => ["category_performance", generatedAt, range.label, row.label, row.saleCount, row.quantity, row.revenue, "", "", `lines:${row.lineCount}`]),
    ...basketSegments.map(row => ["basket_segment", generatedAt, range.label, row.label, row.saleCount, row.averageItems, row.revenue, row.averageBasket, "", ""]),
    ...tableTurnoverRows.map(row => ["table_turnover", generatedAt, range.label, row.tableNumber, row.saleCount, "", row.revenue, row.averageCheck, "", `avgDuration:${row.averageDurationMinutes}`]),
    ...openTabAging.rows.map(row => ["open_tab_aging", generatedAt, range.label, row.tabName, "", "", "", row.total, row.status, `${row.ageBucket}; ${row.ageMinutes} minutes`]),
    ...refundVoidRows.map(row => ["refund_void", generatedAt, range.label, row.saleId, "", "", "", row.amount, row.transactionType, row.reason]),
    ...cashVarianceRows.map(row => ["cash_variance", generatedAt, range.label, row.label, "", "", "", row.variance, row.status, `${row.source}; ${row.reason || ""}`]),
  ];

  const pdfBase64 = createSimplePdfBase64("Jimmy POS operational analytics report", [
    {
      heading: "Summary",
      rows: [
        `Period: ${range.label}`,
        `Completed sales: ${summary.completedSaleCount}`,
        `Categories: ${summary.categoryCount}`,
        `Open tabs: ${summary.openTabCount}`,
        `Refund/void rows: ${summary.refundVoidCount}`,
        `Cash absolute variance: R${cashVarianceSummary.absoluteVariance.toFixed(2)}`,
      ],
    },
    {
      heading: "Top categories",
      rows: categoryPerformance.slice(0, 10).map(row => [row.label, `${row.saleCount} sales`, `R${row.revenue.toFixed(2)}`]),
    },
    {
      heading: "Basket segments",
      rows: basketSegments.map(row => [row.label, `${row.saleCount} sales`, `avg R${row.averageBasket.toFixed(2)}`]),
    },
    {
      heading: "Tables and tabs",
      rows: [
        `Turnover per table: ${tableTurnoverSummary.turnoverPerTable}`,
        `Oldest tab age: ${openTabAging.oldestAgeMinutes} minutes`,
        ...tableTurnoverRows.slice(0, 8).map(row => `${row.tableNumber}: ${row.saleCount} turns, R${row.revenue.toFixed(2)}`),
      ],
    },
    {
      heading: "Exceptions",
      rows: [
        `Refunds: ${refundVoidSummary.refundCount}, R${refundVoidSummary.refundAmount.toFixed(2)}`,
        `Voids: ${refundVoidSummary.voidCount}, R${refundVoidSummary.voidAmount.toFixed(2)}`,
        `Cash unresolved: ${cashVarianceSummary.unresolvedCount}`,
      ],
    },
  ]);

  return {
    filename: `jimmy-pos-operational-${range.fromDate}-${range.toDate}.csv`,
    pdfFilename: `jimmy-pos-operational-${range.fromDate}-${range.toDate}.pdf`,
    mimeType: "text/csv",
    pdfMimeType: "application/pdf",
    generatedAt,
    periodStart: range.fromSql,
    periodEnd: range.toSql,
    periodLabel: range.label,
    summary,
    categoryPerformance,
    basketSegments,
    tableTurnoverSummary,
    tableTurnoverRows,
    openTabAging,
    refundVoidSummary,
    refundVoidRows,
    cashVarianceSummary,
    cashVarianceTrend,
    cashVarianceRows,
    csv: csvRows.map(row => row.map(csvCell).join(",")).join("\n"),
    pdfBase64,
  };
}
