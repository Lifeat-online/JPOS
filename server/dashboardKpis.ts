import { isPostgres, query } from "./db.js";

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function money(value: unknown) {
  return Number(toNumber(value).toFixed(2));
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function dbTimestamp(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function ageMinutesSince(value: unknown, now: Date) {
  if (!value) return 0;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
}

function average(amount: number, count: number) {
  return count > 0 ? money(amount / count) : 0;
}

export async function getDashboardKpis(tenantId: string, now = new Date()) {
  const dayStart = startOfUtcDay(now);
  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
  const tabPredicate = "is_tab = TRUE";

  const [salesRows, activeTableRows, cashRows, lowStockSummaryRows, lowStockRows, staffRows] = await Promise.all([
    query<any>(
      `SELECT
         SUM(CASE WHEN status = 'completed' AND created_at >= ? THEN 1 ELSE 0 END) AS todayCompletedCount,
         SUM(CASE WHEN status = 'completed' AND created_at >= ? THEN total ELSE 0 END) AS todayCompletedRevenue,
         SUM(CASE WHEN status = 'completed' AND created_at >= ? THEN 1 ELSE 0 END) AS lastHourCompletedCount,
         SUM(CASE WHEN status = 'completed' AND created_at >= ? THEN total ELSE 0 END) AS lastHourCompletedRevenue,
         SUM(CASE WHEN status IN ('open','kitchen','pending') THEN 1 ELSE 0 END) AS activeOrdersCount,
         COUNT(DISTINCT CASE WHEN status IN ('open','kitchen','pending') THEN staff_id ELSE NULL END) AS activeOrderStaffCount,
         SUM(CASE WHEN ${tabPredicate} AND status = 'open' THEN 1 ELSE 0 END) AS openTabsCount,
         SUM(CASE WHEN ${tabPredicate} AND status = 'open' THEN total ELSE 0 END) AS openTabsValue,
         MIN(CASE WHEN ${tabPredicate} AND status = 'open' THEN created_at ELSE NULL END) AS oldestTabAt,
         SUM(CASE WHEN status = 'completed' AND table_number IS NOT NULL AND table_number <> '' AND created_at >= ? THEN 1 ELSE 0 END) AS tableSaleCount,
         COUNT(DISTINCT CASE WHEN status = 'completed' AND table_number IS NOT NULL AND table_number <> '' AND created_at >= ? THEN table_number ELSE NULL END) AS servedTableCount
       FROM sales
       WHERE tenant_id = ?`,
      [
        dbTimestamp(dayStart),
        dbTimestamp(dayStart),
        dbTimestamp(lastHour),
        dbTimestamp(lastHour),
        dbTimestamp(dayStart),
        dbTimestamp(dayStart),
        tenantId,
      ]
    ),
    query<any>(
      `SELECT COUNT(*) AS activeTableCount
         FROM restaurant_tables
        WHERE tenant_id = ?
          AND status = 'active'`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         COUNT(*) AS cashSessionCount,
         SUM(CASE WHEN ABS(COALESCE(difference, 0)) >= 0.01 THEN difference ELSE 0 END) AS netVariance,
         SUM(CASE WHEN ABS(COALESCE(difference, 0)) >= 0.01 THEN ABS(difference) ELSE 0 END) AS absoluteVariance,
         SUM(CASE
           WHEN ABS(COALESCE(difference, 0)) >= 0.01
            AND COALESCE(review_status, 'submitted') NOT IN ('balanced','reconciled','reviewed')
           THEN 1 ELSE 0 END) AS unresolvedCount
       FROM cash_sessions
       WHERE tenant_id = ?
         AND COALESCE(closed_at, submitted_at, created_at) >= ?
         AND COALESCE(closed_at, submitted_at, created_at) <= ?`,
      [tenantId, dbTimestamp(dayStart), dbTimestamp(now)]
    ),
    query<any>(
      `SELECT
         COUNT(*) AS lowStockCount,
         SUM(CASE WHEN COALESCE(stock, 0) <= 0 OR COALESCE(stock, 0) <= (COALESCE(min_stock, 0) * 0.5) THEN 1 ELSE 0 END) AS criticalLowStockCount
       FROM products
       WHERE tenant_id = ?
         AND COALESCE(min_stock, 0) > 0
         AND COALESCE(stock, 0) <= COALESCE(min_stock, 0)`,
      [tenantId]
    ),
    query<any>(
      `SELECT id,
              name,
              category,
              stock,
              min_stock AS minStock
         FROM products
        WHERE tenant_id = ?
          AND COALESCE(min_stock, 0) > 0
          AND COALESCE(stock, 0) <= COALESCE(min_stock, 0)
        ORDER BY (COALESCE(min_stock, 0) - COALESCE(stock, 0)) DESC, name ASC
        LIMIT 8`,
      [tenantId]
    ),
    query<any>(
      `SELECT
         COUNT(*) AS activeStaffCount,
         SUM(CASE WHEN cs.id IS NOT NULL THEN 1 ELSE 0 END) AS openRegisterStaffCount
       FROM staff st
       LEFT JOIN cash_sessions cs
         ON cs.tenant_id = st.tenant_id
        AND cs.staff_id = st.id
        AND cs.status = 'open'
       WHERE st.tenant_id = ?
         AND st.status = 'active'`,
      [tenantId]
    ),
  ]);

  const sales = salesRows[0] || {};
  const activeTables = toNumber(activeTableRows?.[0]?.activeTableCount);
  const tableSaleCount = toNumber(sales.tableSaleCount);
  const todayCompletedCount = toNumber(sales.todayCompletedCount);
  const todayCompletedRevenue = money(sales.todayCompletedRevenue);
  const lastHourCompletedCount = toNumber(sales.lastHourCompletedCount);
  const lastHourCompletedRevenue = money(sales.lastHourCompletedRevenue);
  const cash = cashRows[0] || {};
  const lowStock = lowStockSummaryRows[0] || {};
  const staff = staffRows[0] || {};

  return {
    generatedAt: now.toISOString(),
    realTimeSales: {
      todayCount: todayCompletedCount,
      todayRevenue: todayCompletedRevenue,
      lastHourCount: lastHourCompletedCount,
      lastHourRevenue: lastHourCompletedRevenue,
      activeOrdersCount: toNumber(sales.activeOrdersCount),
    },
    averageBasket: {
      todayAverage: average(todayCompletedRevenue, todayCompletedCount),
      lastHourAverage: average(lastHourCompletedRevenue, lastHourCompletedCount),
    },
    tableTurnover: {
      activeTableCount: activeTables,
      servedTableCount: toNumber(sales.servedTableCount),
      tableSaleCount,
      turnoverPerTable: activeTables > 0 ? Number((tableSaleCount / activeTables).toFixed(2)) : 0,
    },
    openTabs: {
      count: toNumber(sales.openTabsCount),
      totalValue: money(sales.openTabsValue),
      oldestAgeMinutes: ageMinutesSince(sales.oldestTabAt, now),
    },
    cashVariance: {
      sessionCount: toNumber(cash.cashSessionCount),
      unresolvedCount: toNumber(cash.unresolvedCount),
      netVariance: money(cash.netVariance),
      absoluteVariance: money(cash.absoluteVariance),
    },
    lowStock: {
      count: toNumber(lowStock.lowStockCount),
      criticalCount: toNumber(lowStock.criticalLowStockCount),
      rows: lowStockRows.map((row: any) => ({
        productId: row.id,
        productName: row.name,
        category: row.category || "Uncategorised",
        stock: toNumber(row.stock),
        minStock: toNumber(row.minStock ?? row.min_stock),
      })),
    },
    activeStaff: {
      activeCount: toNumber(staff.activeStaffCount),
      openRegisterCount: toNumber(staff.openRegisterStaffCount),
      activeOrderStaffCount: toNumber(sales.activeOrderStaffCount),
    },
  };
}
