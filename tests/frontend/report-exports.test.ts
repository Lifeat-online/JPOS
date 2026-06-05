import { describe, expect, it } from 'vitest';
import { Customer, Sale } from '../../src/types';
import { buildSalesReport, resolveReportRange } from '../../src/utils/reportExports';

function localDate(day: number, hour = 10) {
  return new Date(2026, 5, day, hour, 0, 0);
}

function cartItem(id: string, name: string, price: number, quantity: number) {
  return { id, name, price, quantity, category: 'Meals', stock: 100 };
}

const customers: Customer[] = [
  {
    id: 'cust_1',
    name: 'Acme, Bistro',
    email: 'accounts@example.test',
    accountEnabled: true,
    accountBalance: 200,
    accountLimit: 500,
  },
];

const sales: Sale[] = [
  {
    id: 'sale_cash',
    items: [cartItem('prod_1', 'Burger', 50, 2)],
    total: 100,
    paymentMethod: 'cash',
    payments: [{ id: 'pay_1', saleId: 'sale_cash', method: 'cash', amount: 100, createdAt: localDate(5) }],
    status: 'completed',
    customerId: 'cust_1',
    staffId: 'staff_1',
    createdAt: localDate(5),
  },
  {
    id: 'sale_account',
    items: [cartItem('prod_2', 'Soda', 50, 1)],
    total: 50,
    paymentMethod: 'account',
    payments: [{ id: 'pay_2', saleId: 'sale_account', method: 'account', amount: 50, createdAt: localDate(4) }],
    status: 'completed',
    customerId: 'cust_1',
    staffId: 'staff_2',
    createdAt: localDate(4),
  },
  {
    id: 'sale_pending',
    items: [cartItem('prod_3', 'Draft sale', 500, 1)],
    total: 500,
    paymentMethod: 'pending',
    status: 'pending',
    createdAt: localDate(5),
  },
  {
    id: 'sale_old',
    items: [cartItem('prod_4', 'Old sale', 90, 1)],
    total: 90,
    paymentMethod: 'card',
    status: 'completed',
    createdAt: new Date(2026, 4, 28, 10, 0, 0),
  },
];

describe('report export helpers', () => {
  it('resolves daily, weekly, monthly, and reversed custom ranges', () => {
    const now = localDate(5, 12);

    expect(resolveReportRange('daily', now).label).toBe('Today');

    const weekly = resolveReportRange('weekly', now);
    expect(weekly.label).toBe('Last 7 days');
    expect(weekly.from.getFullYear()).toBe(2026);
    expect(weekly.from.getMonth()).toBe(4);
    expect(weekly.from.getDate()).toBe(30);
    expect(weekly.from.getHours()).toBe(0);
    expect(weekly.to.getDate()).toBe(5);
    expect(weekly.to.getHours()).toBe(23);

    const monthly = resolveReportRange('monthly', now);
    expect(monthly.label).toBe('Month to date');
    expect(monthly.from.getDate()).toBe(1);

    const custom = resolveReportRange('custom', now, '2026-06-05', '2026-06-04');
    expect(custom.label).toBe('2026-06-04 to 2026-06-05');
    expect(custom.from.getDate()).toBe(4);
    expect(custom.to.getDate()).toBe(5);
  });

  it('builds filtered dashboard totals plus CSV and PDF exports', () => {
    const range = resolveReportRange('custom', localDate(5), '2026-06-04', '2026-06-05');
    const report = buildSalesReport(sales, customers, range);

    expect(report.completedSales.map(sale => sale.id)).toEqual(['sale_cash', 'sale_account']);
    expect(report.totalRevenue).toBe(150);
    expect(report.avgOrderValue).toBe(75);
    expect(report.itemsSold).toBe(3);
    expect(report.accountSales).toBe(50);
    expect(report.accountOwing).toBe(200);
    expect(report.accountLimit).toBe(500);
    expect(report.paymentTotals).toMatchObject({
      cash: 100,
      account: 50,
      card: 0,
    });
    expect(report.dailyData.map(day => day.revenue)).toEqual([50, 100]);
    expect(report.topProducts).toEqual([
      { name: 'Burger', value: 2 },
      { name: 'Soda', value: 1 },
    ]);
    expect(report.csv).toContain('Receipt,Date,Customer,Staff,Payment,Items,Total');
    expect(report.csv).toContain('sale_cash');
    expect(report.csv).toContain('"Acme, Bistro"');
    expect(report.csv).not.toContain('sale_pending');
    expect(report.csv).not.toContain('sale_old');
    expect(report.pdfBase64).toMatch(/^JVBER/);
  });
});
