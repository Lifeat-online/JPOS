import { query } from "./db.js";
import { createSimplePdfBase64 } from "./pdfExport.js";

type PaymentProviderReportFilters = {
  from?: string | null;
  to?: string | null;
  provider?: string | null;
  status?: string | null;
  method?: string | null;
  limit?: string | number | null;
};

const PROVIDER_METHODS = new Set(["card", "payfast", "qr", "bnpl"]);
const SENSITIVE_CARD_FIELDS = ["pan", "cvv", "cvc", "card_number", "cardNumber", "expiry", "trackData"];

function clean(value: unknown) {
  return String(value || "").trim();
}

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number((Number.isFinite(parsed) ? parsed : 0).toFixed(2));
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
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

function normalizeStatus(value: unknown) {
  const status = clean(value).toLowerCase();
  return status || "unconfirmed";
}

function reviewState(status: string) {
  if (["approved", "confirmed", "settled", "refunded", "partial_refund"].includes(status)) return "matched";
  if (["failed", "reversed"].includes(status)) return "exception";
  return "needs_review";
}

function countBy<T>(items: T[], keyFor: (item: T) => string | null | undefined) {
  const counts = new Map<string, { count: number; amount: number }>();
  for (const item of items as any[]) {
    const key = clean(keyFor(item)) || "Unspecified";
    const existing = counts.get(key) || { count: 0, amount: 0 };
    existing.count += 1;
    existing.amount = money(existing.amount + money(item.amount));
    counts.set(key, existing);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, ...value }))
    .sort((a, b) => b.count - a.count || b.amount - a.amount);
}

function buildWhere(tenantId: string, filters: PaymentProviderReportFilters) {
  const where = ["s.tenant_id = ?"];
  const params: unknown[] = [tenantId];
  const from = dayBoundary(filters.from);
  const to = dayBoundary(filters.to, true);
  if (from) {
    where.push("s.created_at >= ?");
    params.push(from);
  }
  if (to) {
    where.push("s.created_at <= ?");
    params.push(to);
  }

  const method = clean(filters.method).toLowerCase();
  if (method && PROVIDER_METHODS.has(method)) {
    where.push("sp.method = ?");
    params.push(method);
  } else {
    where.push("sp.method IN ('card', 'payfast', 'qr', 'bnpl')");
  }

  const provider = clean(filters.provider).toLowerCase();
  if (provider) {
    where.push("LOWER(COALESCE(sp.provider, '')) = ?");
    params.push(provider);
  }

  const status = clean(filters.status).toLowerCase();
  if (status) {
    where.push("LOWER(COALESCE(sp.provider_status, 'unconfirmed')) = ?");
    params.push(status);
  }

  return { where, params };
}

export async function getPaymentProviderReconciliationReport(
  tenantId: string,
  filters: PaymentProviderReportFilters = {}
) {
  const generatedAt = new Date().toISOString();
  const limit = clampLimit(filters.limit);
  const { where, params } = buildWhere(tenantId, filters);
  params.push(limit);

  const rows = await query<any>(
    `SELECT
       s.id AS saleId,
       s.created_at AS createdAt,
       s.status AS saleStatus,
       s.payment_method AS paymentMethod,
       s.total AS saleTotal,
       s.customer_id AS customerId,
       s.staff_id AS staffId,
       s.table_number AS tableNumber,
       s.is_tab AS isTab,
       s.tab_name AS tabName,
       sp.id AS paymentId,
       sp.method AS method,
       sp.amount AS amount,
       sp.provider AS provider,
       sp.provider_device_id AS providerDeviceId,
       sp.provider_reference AS providerReference,
       sp.authorization_code AS authorizationCode,
       sp.provider_status AS providerStatus,
       sp.provider_note AS providerNote,
       c.name AS customerName,
       st.name AS staffName
     FROM sale_payments sp
     INNER JOIN sales s ON s.id = sp.sale_id
     LEFT JOIN customers c ON c.tenant_id = s.tenant_id AND c.id = s.customer_id
     LEFT JOIN staff st ON st.tenant_id = s.tenant_id AND st.id = s.staff_id
     WHERE ${where.join(" AND ")}
     ORDER BY s.created_at DESC, sp.created_at DESC
     LIMIT ?`,
    params
  );

  const payments = rows.map((row: any) => {
    const providerStatus = normalizeStatus(row.providerStatus ?? row.provider_status);
    const payment = {
      createdAt: row.createdAt ?? row.created_at,
      saleId: row.saleId ?? row.sale_id,
      paymentId: row.paymentId ?? row.payment_id,
      method: row.method,
      provider: row.provider || (row.method === "payfast" ? "payfast" : "unassigned"),
      providerDeviceId: row.providerDeviceId ?? row.provider_device_id ?? null,
      providerReference: row.providerReference ?? row.provider_reference ?? null,
      authorizationCode: row.authorizationCode ?? row.authorization_code ?? null,
      providerStatus,
      reviewState: reviewState(providerStatus),
      providerNote: row.providerNote ?? row.provider_note ?? null,
      amount: money(row.amount),
      saleTotal: money(row.saleTotal ?? row.sale_total),
      saleStatus: row.saleStatus ?? row.sale_status,
      paymentMethod: row.paymentMethod ?? row.payment_method,
      customerId: row.customerId ?? row.customer_id ?? null,
      customerName: row.customerName ?? row.customer_name ?? null,
      staffId: row.staffId ?? row.staff_id ?? null,
      staffName: row.staffName ?? row.staff_name ?? null,
      tableNumber: row.tableNumber ?? row.table_number ?? null,
      isTab: Boolean(row.isTab ?? row.is_tab),
      tabName: row.tabName ?? row.tab_name ?? null,
    };

    for (const forbidden of SENSITIVE_CARD_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(payment, forbidden)) {
        delete (payment as any)[forbidden];
      }
    }
    return payment;
  });

  const summary = {
    paymentCount: payments.length,
    totalAmount: money(payments.reduce((sum, payment) => sum + payment.amount, 0)),
    matchedCount: payments.filter(payment => payment.reviewState === "matched").length,
    needsReviewCount: payments.filter(payment => payment.reviewState === "needs_review").length,
    exceptionCount: payments.filter(payment => payment.reviewState === "exception").length,
    cardCount: payments.filter(payment => payment.method === "card").length,
    payfastCount: payments.filter(payment => payment.method === "payfast").length,
    qrCount: payments.filter(payment => payment.method === "qr").length,
    bnplCount: payments.filter(payment => payment.method === "bnpl").length,
  };
  const providerBreakdown = countBy(payments, payment => payment.provider);
  const statusBreakdown = countBy(payments, payment => payment.providerStatus);
  const methodBreakdown = countBy(payments, payment => payment.method);

  const header = [
    "section",
    "generatedAt",
    "createdAt",
    "saleId",
    "paymentId",
    "method",
    "provider",
    "providerDeviceId",
    "providerReference",
    "authorizationCode",
    "providerStatus",
    "reviewState",
    "amount",
    "saleStatus",
    "customerName",
    "staffName",
    "tableNumber",
    "tabName",
    "providerNote",
    "pciBoundary",
  ];
  const rowsForCsv: unknown[][] = [
    ["metadata", generatedAt, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "No PAN, CVV, CVC, card number, expiry, or track data is stored or exported."],
    ["summary", generatedAt, "", "", "", "", "paymentCount", "", "", "", "", "", summary.paymentCount, "", "", "", "", "", "", ""],
    ["summary", generatedAt, "", "", "", "", "totalAmount", "", "", "", "", "", summary.totalAmount, "", "", "", "", "", "", ""],
    ["summary", generatedAt, "", "", "", "", "matchedCount", "", "", "", "", "", summary.matchedCount, "", "", "", "", "", "", ""],
    ["summary", generatedAt, "", "", "", "", "needsReviewCount", "", "", "", "", "", summary.needsReviewCount, "", "", "", "", "", "", ""],
    ["summary", generatedAt, "", "", "", "", "exceptionCount", "", "", "", "", "", summary.exceptionCount, "", "", "", "", "", "", ""],
  ];

  for (const item of payments) {
    rowsForCsv.push([
      "payment",
      generatedAt,
      item.createdAt,
      item.saleId,
      item.paymentId,
      item.method,
      item.provider,
      item.providerDeviceId,
      item.providerReference,
      item.authorizationCode,
      item.providerStatus,
      item.reviewState,
      item.amount,
      item.saleStatus,
      item.customerName || item.customerId,
      item.staffName || item.staffId,
      item.tableNumber,
      item.tabName,
      item.providerNote,
      "No PAN/CVV exported",
    ]);
  }

  const pdfBase64 = createSimplePdfBase64("MasePOS payment provider reconciliation report", [
    {
      heading: "Summary",
      rows: [
        `Payments: ${summary.paymentCount}`,
        `Total amount: ${summary.totalAmount.toFixed(2)}`,
        `Matched: ${summary.matchedCount}`,
        `Needs review: ${summary.needsReviewCount}`,
        `Exceptions: ${summary.exceptionCount}`,
        `Card: ${summary.cardCount}`,
        `PayFast: ${summary.payfastCount}`,
        `QR/mobile wallet: ${summary.qrCount}`,
        `BNPL: ${summary.bnplCount}`,
        "PCI boundary: no PAN, CVV, CVC, card number, expiry, or track data is stored or exported.",
      ],
    },
    {
      heading: "Provider breakdown",
      rows: providerBreakdown.length
        ? providerBreakdown.slice(0, 16).map(item => [item.label, `${item.count} payments`, `amount ${item.amount.toFixed(2)}`])
        : ["No provider payments in this report."],
    },
    {
      heading: "Status breakdown",
      rows: statusBreakdown.length
        ? statusBreakdown.slice(0, 16).map(item => [item.label, `${item.count} payments`, `amount ${item.amount.toFixed(2)}`])
        : ["No provider statuses in this report."],
    },
    {
      heading: "Payment detail",
      rows: payments.slice(0, 30).map(payment => [
        payment.createdAt || "",
        payment.method,
        payment.provider,
        payment.providerStatus,
        payment.reviewState,
        payment.providerReference || payment.authorizationCode || "No reference",
        `amount ${payment.amount.toFixed(2)}`,
        payment.saleId,
      ]),
    },
  ]);

  return {
    filename: `masepos-payment-provider-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`,
    pdfFilename: `masepos-payment-provider-reconciliation-${new Date().toISOString().slice(0, 10)}.pdf`,
    mimeType: "text/csv",
    pdfMimeType: "application/pdf",
    count: payments.length,
    summary,
    providerBreakdown,
    statusBreakdown,
    methodBreakdown,
    payments,
    csv: [header, ...rowsForCsv].map(row => row.map(csvCell).join(",")).join("\n"),
    pdfBase64,
    generatedAt,
    pciBoundary: {
      storedSensitiveCardData: false,
      excludedFields: SENSITIVE_CARD_FIELDS,
      note: "Reports include provider references, device IDs, authorization/reference codes, statuses, notes, staff/customer/table context, and amounts only.",
    },
  };
}
