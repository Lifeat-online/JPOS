import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { getDashboardKpis } from '../../server/dashboardKpis.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('dashboard KPIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates live sales, baskets, tables, tabs, cash variance, low stock, and active staff', async () => {
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (sql.includes('FROM sales')) {
        return Promise.resolve([{
          todayCompletedCount: '4',
          todayCompletedRevenue: '460.00',
          lastHourCompletedCount: '2',
          lastHourCompletedRevenue: '260.00',
          activeOrdersCount: '3',
          activeOrderStaffCount: '2',
          openTabsCount: '2',
          openTabsValue: '300.00',
          oldestTabAt: '2026-06-05T09:00:00.000Z',
          tableSaleCount: '5',
          servedTableCount: '3',
        }]);
      }
      if (sql.includes('FROM restaurant_tables')) {
        return Promise.resolve([{ activeTableCount: '4' }]);
      }
      if (sql.includes('FROM cash_sessions')) {
        return Promise.resolve([{
          cashSessionCount: '3',
          netVariance: '-5.00',
          absoluteVariance: '15.00',
          unresolvedCount: '1',
        }]);
      }
      if (sql.includes('COUNT(*) AS lowStockCount')) {
        return Promise.resolve([{
          lowStockCount: '3',
          criticalLowStockCount: '1',
        }]);
      }
      if (sql.includes('FROM products')) {
        return Promise.resolve([
          { id: 'prod_1', name: 'Burger Buns', category: 'Food', stock: '2', minStock: '10' },
          { id: 'prod_2', name: 'Soda', category: 'Drinks', stock: '4', minStock: '6' },
        ]);
      }
      if (sql.includes('FROM staff st')) {
        return Promise.resolve([{
          activeStaffCount: '5',
          openRegisterStaffCount: '2',
        }]);
      }
      return Promise.resolve([]);
    });

    const report = await getDashboardKpis('tenant_1', new Date('2026-06-05T12:00:00.000Z'));

    expect(report.realTimeSales).toEqual({
      todayCount: 4,
      todayRevenue: 460,
      lastHourCount: 2,
      lastHourRevenue: 260,
      activeOrdersCount: 3,
    });
    expect(report.averageBasket).toEqual({
      todayAverage: 115,
      lastHourAverage: 130,
    });
    expect(report.tableTurnover).toEqual({
      activeTableCount: 4,
      servedTableCount: 3,
      tableSaleCount: 5,
      turnoverPerTable: 1.25,
    });
    expect(report.openTabs).toEqual({
      count: 2,
      totalValue: 300,
      oldestAgeMinutes: 180,
    });
    expect(report.cashVariance).toEqual({
      sessionCount: 3,
      unresolvedCount: 1,
      netVariance: -5,
      absoluteVariance: 15,
    });
    expect(report.lowStock).toMatchObject({
      count: 3,
      criticalCount: 1,
      rows: [
        { productId: 'prod_1', productName: 'Burger Buns', category: 'Food', stock: 2, minStock: 10 },
        { productId: 'prod_2', productName: 'Soda', category: 'Drinks', stock: 4, minStock: 6 },
      ],
    });
    expect(report.activeStaff).toEqual({
      activeCount: 5,
      openRegisterCount: 2,
      activeOrderStaffCount: 2,
    });
  });
});
