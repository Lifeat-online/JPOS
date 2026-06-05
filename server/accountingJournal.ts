import { query } from "./db.js";
import { createSimplePdfBase64 } from "./pdfExport.js";

type AccountingJournalFilters = {
  from?: string | null;
  to?: string | null;
};

type AccountMapping = {
  key: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "income" | "expense" | "equity";
};

const ACCOUNTS: Record<string, AccountMapping> = {
  cash: { key: "cash", code: "1000", name: "Cash on hand", type: "asset" },
  cardClearing: { key: "cardClearing", code: "1010", name: "Card terminal clearing", type: "asset" },
  payfastClearing: { key: "payfastClearing", code: "1020", name: "PayFast clearing", type: "asset" },
  qrClearing: { key: "qrClearing", code: "1030", name: "QR/mobile-wallet clearing", type: "asset" },
  bnplClearing: { key: "bnplClearing", code: "1040", name: "BNPL clearing", type: "asset" },
  customerAccounts: { key: "customerAccounts", code: "1200", name: "Customer accounts receivable", type: "asset" },
  inventory: { key: "inventory", code: "1300", name: "Inventory asset", type: "asset" },
  walletLiability: { key: "walletLiability", code: "2100", name: "Customer wallet liability", type: "liability" },
  vatOutput: { key: "vatOutput", code: "2200", name: "VAT output tax", type: "liability" },
  salesRevenue: { key: "salesRevenue", code: "4000", name: "Sales revenue", type: "income" },
  cogs: { key: "cogs", code: "5000", name: "Cost of goods sold", type: "expense" },
  cashVariance: { key: "cashVariance", code: "5900", name: "Cash over/short", type: "expense" },
  unallocatedTender: { key: "unallocatedTender", code: "1099", name: "Unallocated tender clearing", type: "asset" },
};

const PAYMENT_ACCOUNTS: Record<string, AccountMapping> = {
  cash: ACCOUNTS.cash,
  card: ACCOUNTS.cardClearing,
  payfast: ACCOUNTS.payfastClearing,
  qr: ACCOUNTS.qrClearing,
  bnpl: ACCOUNTS.bnplClearing,
  account: ACCOUNTS.customerAccounts,
  wallet: ACCOUNTS.walletLiability,
  pending: ACCOUNTS.unallocatedTender,
};

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

function rowsToCsv(header: string[], rows: unknown[][]) {
  return [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
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

function dayKey(value: unknown) {
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return clean(value) || "Unknown";
  return date.toISOString().slice(0, 10);
}

function resolveRange(filters: AccountingJournalFilters = {}) {
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

function normalDebit(amount: number) {
  return amount >= 0 ? { debit: money(amount), credit: 0 } : { debit: 0, credit: money(Math.abs(amount)) };
}

function normalCredit(amount: number) {
  return amount >= 0 ? { debit: 0, credit: money(amount) } : { debit: money(Math.abs(amount)), credit: 0 };
}

function paymentAccount(method: unknown) {
  return PAYMENT_ACCOUNTS[clean(method).toLowerCase()] || ACCOUNTS.unallocatedTender;
}

function buildTargetExports(journalLines: any[], range: ReturnType<typeof resolveRange>) {
  const targetConfigs = [
    {
      targetId: "sage",
      targetName: "Sage",
      filename: `jimmy-pos-sage-journal-${range.fromDate}-${range.toDate}.csv`,
      requiredFields: ["Date", "Reference", "Description", "Account Code", "Debit", "Credit", "Tax Type"],
      header: ["Date", "Reference", "Description", "Account Code", "Debit", "Credit", "Tax Type", "Contact", "External Reference"],
      rows: journalLines.map(line => [
        line.entryDate,
        line.sageReference,
        line.memo,
        line.accountCode,
        line.debit || "",
        line.credit || "",
        line.taxCode || "NONE",
        line.contactName || line.staffName || "",
        line.externalReference || line.reference,
      ]),
    },
    {
      targetId: "xero",
      targetName: "Xero",
      filename: `jimmy-pos-xero-journal-${range.fromDate}-${range.toDate}.csv`,
      requiredFields: ["Narration", "Date", "Line Amount", "Account Code", "Tax Type", "Tracking"],
      header: ["Narration", "Date", "Description", "AccountCode", "TaxType", "LineAmount", "Reference", "TrackingName1", "TrackingOption1"],
      rows: journalLines.map(line => [
        line.memo,
        line.entryDate,
        `${line.reference} ${line.accountName}`,
        line.accountCode,
        line.taxCode || "NONE",
        money(line.debit - line.credit),
        line.xeroReference,
        "Jimmy POS Source",
        line.sourceType,
      ]),
    },
    {
      targetId: "quickbooks",
      targetName: "QuickBooks",
      filename: `jimmy-pos-quickbooks-journal-${range.fromDate}-${range.toDate}.csv`,
      requiredFields: ["Journal Date", "Journal No", "Account", "Debits", "Credits", "Name", "Memo"],
      header: ["Journal No", "Journal Date", "Account", "Debits", "Credits", "Description", "Name", "Memo", "Location", "Class"],
      rows: journalLines.map(line => [
        line.quickBooksReference,
        line.entryDate,
        `${line.accountCode} ${line.accountName}`,
        line.debit || "",
        line.credit || "",
        line.memo,
        line.contactName || line.staffName || "",
        line.externalReference || line.reference,
        "",
        line.sourceType,
      ]),
    },
  ];

  return targetConfigs.map(target => ({
    targetId: target.targetId,
    targetName: target.targetName,
    status: "export_ready",
    filename: target.filename,
    mimeType: "text/csv",
    requiredFields: target.requiredFields,
    lineCount: target.rows.length,
    csv: rowsToCsv(target.header, target.rows),
  }));
}

export async function getAccountingJournalReport(tenantId: string, filters: AccountingJournalFilters = {}) {
  const generatedAt = new Date().toISOString();
  const range = resolveRange(filters);

  const [sales, payments, itemCosts, cashVarianceRows] = await Promise.all([
    query<any>(
      `SELECT
         s.id AS saleId,
         s.created_at AS createdAt,
         COALESCE(s.transaction_type, 'sale') AS transactionType,
         s.parent_sale_id AS parentSaleId,
         s.subtotal,
         s.tax_amount AS taxAmount,
         s.total,
         s.payment_method AS paymentMethod,
         s.customer_id AS customerId,
         c.name AS customerName,
         s.staff_id AS staffId,
         st.name AS staffName
       FROM sales s
       LEFT JOIN customers c ON c.tenant_id = s.tenant_id AND c.id = s.customer_id
       LEFT JOIN staff st ON st.tenant_id = s.tenant_id AND st.id = s.staff_id
       WHERE s.tenant_id = ?
         AND s.status = 'completed'
         AND COALESCE(s.transaction_type, 'sale') IN ('sale','refund')
         AND s.created_at >= ?
         AND s.created_at <= ?
       ORDER BY s.created_at ASC, s.id ASC`,
      [tenantId, range.fromSql, range.toSql]
    ),
    query<any>(
      `SELECT
         s.id AS saleId,
         s.payment_method AS salePaymentMethod,
         sp.id AS paymentId,
         sp.method,
         sp.amount,
         sp.provider,
         sp.provider_reference AS providerReference,
         sp.authorization_code AS authorizationCode
       FROM sales s
       LEFT JOIN sale_payments sp ON sp.sale_id = s.id
       WHERE s.tenant_id = ?
         AND s.status = 'completed'
         AND COALESCE(s.transaction_type, 'sale') IN ('sale','refund')
         AND s.created_at >= ?
         AND s.created_at <= ?`,
      [tenantId, range.fromSql, range.toSql]
    ),
    query<any>(
      `SELECT
         s.id AS saleId,
         s.created_at AS createdAt,
         si.id AS saleItemId,
         si.product_id AS productId,
         si.product_name AS productName,
         si.quantity,
         COALESCE(p.cost_price, 0) AS costPrice
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.tenant_id = s.tenant_id AND p.id = si.product_id
       WHERE s.tenant_id = ?
         AND s.status = 'completed'
         AND COALESCE(s.transaction_type, 'sale') IN ('sale','refund')
         AND s.created_at >= ?
         AND s.created_at <= ?`,
      [tenantId, range.fromSql, range.toSql]
    ),
    query<any>(
      `SELECT
         id,
         staff_id AS staffId,
         staff_name AS staffName,
         COALESCE(closed_at, submitted_at, created_at) AS postedAt,
         expected_cash AS expectedCash,
         actual_cash AS actualCash,
         difference,
         variance_reason AS varianceReason,
         review_status AS reviewStatus
       FROM cash_sessions
       WHERE tenant_id = ?
         AND COALESCE(closed_at, submitted_at, created_at) >= ?
         AND COALESCE(closed_at, submitted_at, created_at) <= ?
         AND ABS(COALESCE(difference, 0)) >= 0.01
       ORDER BY COALESCE(closed_at, submitted_at, created_at) ASC`,
      [tenantId, range.fromSql, range.toSql]
    ),
  ]);

  const paymentsBySale = new Map<string, any[]>();
  for (const row of payments) {
    const saleId = row.saleId ?? row.sale_id;
    if (!saleId || !(row.paymentId ?? row.payment_id)) continue;
    paymentsBySale.set(String(saleId), [...(paymentsBySale.get(String(saleId)) || []), row]);
  }

  const costsBySale = new Map<string, number>();
  let missingCostLineCount = 0;
  for (const row of itemCosts) {
    const saleId = String(row.saleId ?? row.sale_id);
    const quantity = Number(row.quantity || 0);
    const costPrice = money(row.costPrice ?? row.cost_price);
    if (!costPrice && row.productId) missingCostLineCount += 1;
    costsBySale.set(saleId, money((costsBySale.get(saleId) || 0) + quantity * costPrice));
  }

  const journalLines: any[] = [];
  const addLine = (context: Record<string, any>, account: AccountMapping, amount: number, side: "debit" | "credit") => {
    const rounded = money(amount);
    if (Math.abs(rounded) < 0.01) return;
    const posting = side === "debit" ? normalDebit(rounded) : normalCredit(rounded);
    journalLines.push({
      lineNumber: journalLines.length + 1,
      entryId: context.entryId,
      entryDate: context.entryDate,
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      sourceLineId: context.sourceLineId || null,
      reference: context.reference,
      memo: context.memo,
      accountKey: account.key,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      debit: posting.debit,
      credit: posting.credit,
      amount: money(posting.debit - posting.credit),
      currency: "ZAR",
      taxCode: context.taxCode || "",
      contactId: context.contactId || null,
      contactName: context.contactName || null,
      staffId: context.staffId || null,
      staffName: context.staffName || null,
      paymentMethod: context.paymentMethod || null,
      externalReference: context.externalReference || context.reference,
      sageReference: context.reference,
      xeroReference: context.reference,
      quickBooksReference: context.reference,
    });
  };

  for (const sale of sales) {
    const saleId = sale.saleId ?? sale.sale_id;
    const transactionType = clean((sale.transactionType ?? sale.transaction_type) || "sale").toLowerCase();
    const total = money(sale.total);
    const taxAmount = money(sale.taxAmount ?? sale.tax_amount);
    const subtotal = money(sale.subtotal || total - taxAmount);
    const reference = transactionType === "refund"
      ? `REFUND-${saleId}`
      : `SALE-${saleId}`;
    const context = {
      entryId: `sale:${saleId}`,
      entryDate: dayKey(sale.createdAt ?? sale.created_at),
      sourceType: transactionType,
      sourceId: saleId,
      reference,
      memo: transactionType === "refund" ? "Refund journal" : "Sales journal",
      contactId: sale.customerId ?? sale.customer_id ?? null,
      contactName: sale.customerName ?? sale.customer_name ?? null,
      staffId: sale.staffId ?? sale.staff_id ?? null,
      staffName: sale.staffName ?? sale.staff_name ?? null,
      taxCode: taxAmount ? "VAT15" : "NONE",
    };

    const salePayments = paymentsBySale.get(String(saleId)) || [{
      paymentId: null,
      method: sale.paymentMethod ?? sale.payment_method ?? "pending",
      amount: total,
    }];
    let paymentTotal = 0;
    for (const payment of salePayments) {
      const amount = money(payment.amount);
      paymentTotal = money(paymentTotal + amount);
      addLine({
        ...context,
        sourceLineId: payment.paymentId ?? payment.payment_id ?? null,
        memo: `${context.memo} tender`,
        paymentMethod: payment.method || sale.paymentMethod || sale.payment_method,
        externalReference: payment.providerReference ?? payment.provider_reference ?? payment.authorizationCode ?? payment.authorization_code ?? reference,
      }, paymentAccount(payment.method || sale.paymentMethod || sale.payment_method), amount, "debit");
    }
    const unallocated = money(total - paymentTotal);
    if (Math.abs(unallocated) >= 0.01) {
      addLine({
        ...context,
        memo: `${context.memo} unallocated tender delta`,
        paymentMethod: "unallocated",
      }, ACCOUNTS.unallocatedTender, unallocated, "debit");
    }

    addLine(context, ACCOUNTS.salesRevenue, subtotal, "credit");
    addLine(context, ACCOUNTS.vatOutput, taxAmount, "credit");

    const costAmount = money(costsBySale.get(String(saleId)) || 0);
    if (Math.abs(costAmount) >= 0.01) {
      addLine({ ...context, sourceType: "sale_cogs", memo: `${context.memo} cost of goods` }, ACCOUNTS.cogs, costAmount, "debit");
      addLine({ ...context, sourceType: "sale_cogs", memo: `${context.memo} inventory relief` }, ACCOUNTS.inventory, costAmount, "credit");
    }
  }

  for (const row of cashVarianceRows) {
    const variance = money(row.difference);
    const reference = `CASH-VARIANCE-${row.id}`;
    const context = {
      entryId: `cash_variance:${row.id}`,
      entryDate: dayKey(row.postedAt ?? row.posted_at),
      sourceType: "cash_variance",
      sourceId: row.id,
      reference,
      memo: row.varianceReason ?? row.variance_reason ?? row.reviewStatus ?? row.review_status ?? "Cash-up variance",
      staffId: row.staffId ?? row.staff_id ?? null,
      staffName: row.staffName ?? row.staff_name ?? null,
      paymentMethod: "cash",
    };
    addLine(context, ACCOUNTS.cash, variance, "debit");
    addLine(context, ACCOUNTS.cashVariance, variance, "credit");
  }

  const totalDebits = money(journalLines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredits = money(journalLines.reduce((sum, line) => sum + line.credit, 0));
  const entryIds = new Set(journalLines.map(line => line.entryId));
  const summary = {
    entryCount: entryIds.size,
    lineCount: journalLines.length,
    salesCount: sales.filter((row: any) => clean((row.transactionType ?? row.transaction_type) || "sale").toLowerCase() === "sale").length,
    refundCount: sales.filter((row: any) => clean(row.transactionType ?? row.transaction_type).toLowerCase() === "refund").length,
    paymentLineCount: journalLines.filter(line => line.sourceType === "sale" || line.sourceType === "refund").filter(line => line.paymentMethod).length,
    cogsLineCount: journalLines.filter(line => line.sourceType === "sale_cogs").length,
    cashVarianceLineCount: journalLines.filter(line => line.sourceType === "cash_variance").length,
    missingCostLineCount,
    totalDebits,
    totalCredits,
    outOfBalance: money(totalDebits - totalCredits),
    balanced: Math.abs(money(totalDebits - totalCredits)) < 0.01,
  };

  const csvHeader = [
    "entryDate",
    "entryId",
    "sourceType",
    "sourceId",
    "reference",
    "memo",
    "accountCode",
    "accountName",
    "debit",
    "credit",
    "currency",
    "taxCode",
    "contactName",
    "staffName",
    "paymentMethod",
    "sageReference",
    "xeroReference",
    "quickBooksReference",
  ];
  const csvRows = journalLines.map(line => [
    line.entryDate,
    line.entryId,
    line.sourceType,
    line.sourceId,
    line.reference,
    line.memo,
    line.accountCode,
    line.accountName,
    line.debit,
    line.credit,
    line.currency,
    line.taxCode,
    line.contactName,
    line.staffName,
    line.paymentMethod,
    line.sageReference,
    line.xeroReference,
    line.quickBooksReference,
  ]);

  const accountMappings = Object.values(ACCOUNTS);
  const targetExports = buildTargetExports(journalLines, range);
  const integrationTargets = targetExports.map(target => ({
    id: target.targetId,
    name: target.targetName,
    status: target.status,
    filename: target.filename,
    requiredFields: target.requiredFields,
  }));

  const pdfBase64 = createSimplePdfBase64("Jimmy POS accounting journal export", [
    {
      heading: "Journal summary",
      rows: [
        `Period: ${range.label}`,
        `Entries: ${summary.entryCount}`,
        `Lines: ${summary.lineCount}`,
        `Debits: R${summary.totalDebits.toFixed(2)}`,
        `Credits: R${summary.totalCredits.toFixed(2)}`,
        `Out of balance: R${summary.outOfBalance.toFixed(2)}`,
        `Missing cost lines: ${summary.missingCostLineCount}`,
      ],
    },
    {
      heading: "Account mappings",
      rows: accountMappings.map(account => [account.code, account.name, account.type]),
    },
    {
      heading: "Integration exports",
      rows: integrationTargets.map(target => [target.name, target.status, target.filename, target.requiredFields.join(", ")]),
    },
    {
      heading: "First journal lines",
      rows: journalLines.slice(0, 20).map(line => [
        line.entryDate,
        line.reference,
        line.accountCode,
        line.accountName,
        `DR ${line.debit.toFixed(2)}`,
        `CR ${line.credit.toFixed(2)}`,
      ]),
    },
  ]);

  return {
    filename: `jimmy-pos-accounting-journal-${range.fromDate}-${range.toDate}.csv`,
    pdfFilename: `jimmy-pos-accounting-journal-${range.fromDate}-${range.toDate}.pdf`,
    mimeType: "text/csv",
    pdfMimeType: "application/pdf",
    generatedAt,
    periodStart: range.fromSql,
    periodEnd: range.toSql,
    periodLabel: range.label,
    summary,
    accountMappings,
    integrationTargets,
    targetExports,
    journalLines,
    csv: rowsToCsv(csvHeader, csvRows),
    pdfBase64,
  };
}
