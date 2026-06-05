import { Customer, Sale } from '../types';
import { getDate } from './date';

export type ReportPreset = 'daily' | 'weekly' | 'monthly' | 'custom';

export type ReportRange = {
  from: Date;
  to: Date;
  label: string;
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const [, year, month, day] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function resolveReportRange(
  preset: ReportPreset,
  now = new Date(),
  customFrom?: string,
  customTo?: string
): ReportRange {
  if (preset === 'weekly') {
    return { from: startOfDay(addDays(now, -6)), to: endOfDay(now), label: 'Last 7 days' };
  }
  if (preset === 'monthly') {
    return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now), label: 'Month to date' };
  }
  if (preset === 'custom') {
    let from = startOfDay(parseDateInput(customFrom, now));
    let to = endOfDay(parseDateInput(customTo, from));
    if (from > to) {
      const originalFrom = from;
      from = startOfDay(to);
      to = endOfDay(originalFrom);
    }
    return { from, to, label: `${isoDate(from)} to ${isoDate(to)}` };
  }
  return { from: startOfDay(now), to: endOfDay(now), label: 'Today' };
}

function inRange(date: Date, range: ReportRange) {
  return !Number.isNaN(date.getTime()) && date >= range.from && date <= range.to;
}

function paymentAmount(sale: Sale, method: string) {
  const payments = Array.isArray(sale.payments) ? sale.payments : [];
  const total = payments
    .filter(payment => String(payment.method || '') === method)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  if (total > 0) return total;
  return sale.paymentMethod === method ? Number(sale.total || 0) : 0;
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function asciiText(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapLine(value: string, maxLength: number) {
  const text = asciiText(value);
  if (text.length <= maxLength) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxLength) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function encodeBase64(value: string) {
  if (typeof btoa === 'function') return btoa(value);
  return '';
}

export function createSimpleReportPdfBase64(title: string, rows: string[]) {
  const lines = [title, `Generated ${new Date().toISOString()}`, '', ...rows].flatMap(line => (
    line ? wrapLine(line, 92) : ['']
  ));
  const contentLines = ['BT', '/F1 10 Tf', '50 760 Td'];
  lines.slice(0, 52).forEach((line, index) => {
    if (index > 0) contentLines.push('0 -14 Td');
    contentLines.push(`(${escapePdfText(asciiText(line))}) Tj`);
  });
  contentLines.push('ET');
  const stream = contentLines.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encodeBase64(pdf);
}

export function buildSalesReport(sales: Sale[], customers: Customer[], range: ReportRange) {
  const completedSales = sales.filter(sale => sale.status === 'completed' && inRange(getDate(sale.createdAt), range));
  const totalRevenue = completedSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const itemsSold = completedSales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0);
  const accountCustomers = customers.filter(customer => customer.accountEnabled || Number(customer.accountBalance || 0) > 0);
  const accountOwing = accountCustomers.reduce((sum, customer) => sum + Number(customer.accountBalance || 0), 0);
  const accountLimit = accountCustomers.reduce((sum, customer) => sum + Number(customer.accountLimit || 0), 0);
  const paymentTotals = ['cash', 'card', 'wallet', 'account', 'payfast', 'qr', 'bnpl'].reduce((acc, method) => ({
    ...acc,
    [method]: completedSales.reduce((sum, sale) => sum + paymentAmount(sale, method), 0),
  }), {} as Record<string, number>);

  const productCounts: Record<string, number> = {};
  completedSales.forEach(sale => {
    sale.items.forEach(item => {
      productCounts[item.name] = (productCounts[item.name] || 0) + Number(item.quantity || 0);
    });
  });
  const topProducts = Object.entries(productCounts)
    .map(([name, count]) => ({ name, value: count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const days: { name: string; revenue: number }[] = [];
  for (let date = startOfDay(range.from); date <= range.to; date = addDays(date, 1)) {
    const key = isoDate(date);
    const daySales = completedSales.filter(sale => isoDate(getDate(sale.createdAt)) === key);
    days.push({
      name: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      revenue: daySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
    });
    if (days.length >= 31) break;
  }

  const csvRows = [
    ['Receipt', 'Date', 'Customer', 'Staff', 'Payment', 'Items', 'Total'],
    ...completedSales.map(sale => [
      sale.id,
      getDate(sale.createdAt).toISOString(),
      customers.find(customer => customer.id === sale.customerId)?.name || sale.customerId || '',
      sale.staffId || '',
      sale.paymentMethod,
      sale.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      Number(sale.total || 0).toFixed(2),
    ]),
  ].map(row => row.map(csvCell).join(',')).join('\n');

  const pdfRows = [
    `Period: ${range.label}`,
    `Completed sales: ${completedSales.length}`,
    `Total revenue: R${totalRevenue.toFixed(2)}`,
    `Average order: R${(completedSales.length ? totalRevenue / completedSales.length : 0).toFixed(2)}`,
    `Items sold: ${itemsSold}`,
    `Account sales: R${(paymentTotals.account || 0).toFixed(2)}`,
    `Account owing: R${accountOwing.toFixed(2)} of R${accountLimit.toFixed(2)}`,
    '',
    'Top products',
    ...topProducts.map(product => `${product.name}: ${product.value}`),
  ];

  return {
    completedSales,
    totalRevenue,
    avgOrderValue: completedSales.length ? totalRevenue / completedSales.length : 0,
    itemsSold,
    accountOwing,
    accountLimit,
    accountSales: paymentTotals.account || 0,
    paymentTotals,
    dailyData: days,
    topProducts,
    csv: csvRows,
    pdfBase64: createSimpleReportPdfBase64('Jimmy POS sales report', pdfRows),
  };
}
