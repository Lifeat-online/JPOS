import { getConnection, query } from "./db.js";
import { recordAuditEvent } from "./audit.js";
import { createSimplePdfBase64 } from "./pdfExport.js";
type TaxReportFilters = {
    from?: string | null;
    to?: string | null;
};
type TaxPeriodLockInput = {
    periodStart?: string | null;
    periodEnd?: string | null;
    note?: string | null;
};
type TaxActor = {
    staffId?: string | null;
    staffName?: string | null;
    role?: string | null;
};
const STANDARD_VAT_RATE = 15;
function clean(value: unknown) {
    return String(value || "").trim();
}
function money(value: unknown) {
    const parsed = Number(value || 0);
    return Number((Number.isFinite(parsed) ? parsed : 0).toFixed(2));
}
function csvCell(value: unknown) {
    if (value === null || value === undefined)
        return "";
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return `"${text.replace(/"/g, '""')}"`;
}
function parseDate(value: unknown, fallback: Date, endOfDay = false) {
    const text = clean(value);
    if (!text)
        return fallback;
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
function resolveRange(filters: TaxReportFilters = {}) {
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
function parseSnapshot(value: unknown) {
    if (!value)
        return null;
    if (typeof value === "object")
        return value;
    try {
        return JSON.parse(String(value));
    }
    catch {
        return null;
    }
}
function serializeTaxPeriod(row: any) {
    if (!row)
        return null;
    const summary = parseSnapshot(row.summarySnapshot ?? row.summary_snapshot);
    return {
        id: row.id,
        tenantId: row.tenantId ?? row.tenant_id,
        periodStart: row.periodStart ?? row.period_start,
        periodEnd: row.periodEnd ?? row.period_end,
        status: row.status || "locked",
        lockedAt: row.lockedAt ?? row.locked_at ?? null,
        lockedBy: row.lockedBy ?? row.locked_by ?? null,
        lockedByName: row.lockedByName ?? row.locked_by_name ?? null,
        lockNote: row.lockNote ?? row.lock_note ?? null,
        currency: row.currency || "ZAR",
        standardRate: money(row.standardRate ?? row.standard_rate ?? STANDARD_VAT_RATE),
        grossSales: money(row.grossSales ?? row.gross_sales),
        taxableSales: money(row.taxableSales ?? row.taxable_sales),
        zeroRatedSales: money(row.zeroRatedSales ?? row.zero_rated_sales),
        exemptSales: money(row.exemptSales ?? row.exempt_sales),
        outputTax: money(row.outputTax ?? row.output_tax),
        inputTax: money(row.inputTax ?? row.input_tax),
        netVatPayable: money(row.netVatPayable ?? row.net_vat_payable),
        invoiceCount: Number(row.invoiceCount ?? row.invoice_count ?? 0),
        refundCount: Number(row.refundCount ?? row.refund_count ?? 0),
        summary,
    };
}
function invoiceSign(row: any) {
    const type = clean((row.transactionType ?? row.transaction_type) || "sale").toLowerCase();
    return type === "refund" ? -1 : 1;
}
function serializeInvoiceRow(row: any) {
    const total = money(row.total);
    const taxAmount = money(row.taxAmount ?? row.tax_amount);
    const subtotal = money(row.subtotal);
    const taxRate = money(row.taxRate ?? row.tax_rate);
    const taxableSupply = taxAmount !== 0 || taxRate > 0 ? total : 0;
    const zeroRatedSupply = taxAmount === 0 && taxRate === 0 ? total : 0;
    return {
        taxInvoiceNumber: row.saleId ?? row.sale_id ?? row.id,
        saleId: row.saleId ?? row.sale_id ?? row.id,
        parentSaleId: row.parentSaleId ?? row.parent_sale_id ?? null,
        createdAt: row.createdAt ?? row.created_at,
        transactionType: clean((row.transactionType ?? row.transaction_type) || "sale").toLowerCase(),
        status: row.status,
        customerId: row.customerId ?? row.customer_id ?? null,
        customerName: row.customerName ?? row.customer_name ?? null,
        customerEmail: row.customerEmail ?? row.customer_email ?? null,
        staffId: row.staffId ?? row.staff_id ?? null,
        staffName: row.staffName ?? row.staff_name ?? null,
        paymentMethod: row.paymentMethod ?? row.payment_method,
        taxInclusive: Boolean(row.taxInclusive ?? row.tax_inclusive),
        taxRate,
        subtotal,
        taxAmount,
        total,
        taxableSupply: money(taxableSupply),
        zeroRatedSupply: money(zeroRatedSupply),
        itemCount: Number(row.itemCount ?? row.item_count ?? 0),
        unitCount: Number(row.unitCount ?? row.unit_count ?? 0),
        evidence: [
            row.saleId ?? row.sale_id ?? row.id,
            row.parentSaleId ?? row.parent_sale_id ? `parent:${row.parentSaleId ?? row.parent_sale_id}` : "",
            row.paymentMethod ?? row.payment_method,
        ].filter(Boolean).join(" | "),
    };
}
function buildBreakdown(invoices: ReturnType<typeof serializeInvoiceRow>[]) {
    const byRate = new Map<string, {
        taxRate: number;
        invoiceCount: number;
        grossSales: number;
        outputTax: number;
    }>();
    for (const invoice of invoices) {
        const key = invoice.taxRate.toFixed(2);
        const existing = byRate.get(key) || { taxRate: invoice.taxRate, invoiceCount: 0, grossSales: 0, outputTax: 0 };
        existing.invoiceCount += 1;
        existing.grossSales = money(existing.grossSales + invoice.total);
        existing.outputTax = money(existing.outputTax + invoice.taxAmount);
        byRate.set(key, existing);
    }
    return Array.from(byRate.values()).sort((a, b) => b.taxRate - a.taxRate);
}
function buildArtifacts(input: {
    generatedAt: string;
    periodLabel: string;
    invoices: ReturnType<typeof serializeInvoiceRow>[];
    summary: Record<string, any>;
    vat201Fields: Record<string, any>;
    rateBreakdown: ReturnType<typeof buildBreakdown>;
    lockedPeriod?: ReturnType<typeof serializeTaxPeriod> | null;
}) {
    const header = [
        "section",
        "generatedAt",
        "period",
        "invoiceDate",
        "taxInvoiceNumber",
        "transactionType",
        "parentSaleId",
        "customerName",
        "staffName",
        "paymentMethod",
        "taxRate",
        "subtotal",
        "taxAmount",
        "total",
        "taxableSupply",
        "zeroRatedSupply",
        "status",
        "evidence",
    ];
    const rows: unknown[][] = [
        ["metadata", input.generatedAt, input.periodLabel, "", "", "", "", "", "", "", "", "", "", "", "", "", input.lockedPeriod ? "locked" : "unlocked", "SARS VAT201 output-tax support pack; input VAT requires supplier invoice capture."],
        ["summary", input.generatedAt, input.periodLabel, "", "vat201Field1StandardRatedSupplies", "", "", "", "", "", "", "", "", input.vat201Fields.field1StandardRatedSupplies, "", "", "", ""],
        ["summary", input.generatedAt, input.periodLabel, "", "vat201Field4OutputTax", "", "", "", "", "", "", "", input.vat201Fields.field4OutputTax, "", "", "", "", ""],
        ["summary", input.generatedAt, input.periodLabel, "", "netVatPayable", "", "", "", "", "", "", "", input.summary.netVatPayable, "", "", "", "", ""],
    ];
    for (const invoice of input.invoices) {
        rows.push([
            "invoice",
            input.generatedAt,
            input.periodLabel,
            invoice.createdAt,
            invoice.taxInvoiceNumber,
            invoice.transactionType,
            invoice.parentSaleId,
            invoice.customerName || invoice.customerId || "",
            invoice.staffName || invoice.staffId || "",
            invoice.paymentMethod,
            invoice.taxRate,
            invoice.subtotal,
            invoice.taxAmount,
            invoice.total,
            invoice.taxableSupply,
            invoice.zeroRatedSupply,
            invoice.status,
            invoice.evidence,
        ]);
    }
    const pdfBase64 = createSimplePdfBase64("Jimmy POS SARS VAT output-tax pack", [
        {
            heading: "VAT201 output summary",
            rows: [
                `Period: ${input.periodLabel}`,
                `Status: ${input.lockedPeriod ? `Locked ${input.lockedPeriod.lockedAt || ""}` : "Open draft"}`,
                `Invoices/credit notes: ${input.summary.invoiceCount}`,
                `Refund credit notes: ${input.summary.refundCount}`,
                `Gross sales: R${input.summary.grossSales.toFixed(2)}`,
                `Standard-rated supplies (VAT201 field 1 support): R${input.vat201Fields.field1StandardRatedSupplies.toFixed(2)}`,
                `Output tax (VAT201 field 4 support): R${input.vat201Fields.field4OutputTax.toFixed(2)}`,
                `Input tax captured in POS: R${input.summary.inputTax.toFixed(2)}`,
                `Net VAT payable from POS data: R${input.summary.netVatPayable.toFixed(2)}`,
            ],
        },
        {
            heading: "Rate breakdown",
            rows: input.rateBreakdown.map(row => [
                `${row.taxRate.toFixed(2)}%`,
                `${row.invoiceCount} invoices`,
                `gross ${row.grossSales.toFixed(2)}`,
                `output tax ${row.outputTax.toFixed(2)}`,
            ]),
        },
        {
            heading: "Invoice evidence",
            rows: input.invoices.slice(0, 34).map(invoice => [
                invoice.taxInvoiceNumber,
                invoice.transactionType,
                invoice.customerName || invoice.customerId || "No customer",
                `total ${invoice.total.toFixed(2)}`,
                `VAT ${invoice.taxAmount.toFixed(2)}`,
            ]),
        },
        {
            heading: "Boundary",
            rows: [
                "This pack uses completed POS sales and refund credit-note rows as output-tax evidence.",
                "Input VAT is not claimed here unless supplier invoice VAT capture is added to purchasing.",
            ],
        },
    ]);
    return {
        csv: [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n"),
        pdfBase64,
    };
}
async function lockedPeriodsForRange(tenantId: string, fromSql: string, toSql: string) {
    const rows = await query<any>(`SELECT
       id,
       tenant_id AS tenantId,
       period_start AS periodStart,
       period_end AS periodEnd,
       status,
       locked_at AS lockedAt,
       locked_by AS lockedBy,
       locked_by_name AS lockedByName,
       lock_note AS lockNote,
       currency,
       standard_rate AS standardRate,
       gross_sales AS grossSales,
       taxable_sales AS taxableSales,
       zero_rated_sales AS zeroRatedSales,
       exempt_sales AS exemptSales,
       output_tax AS outputTax,
       input_tax AS inputTax,
       net_vat_payable AS netVatPayable,
       invoice_count AS invoiceCount,
       refund_count AS refundCount,
       summary_snapshot AS summarySnapshot
     FROM tax_periods
     WHERE tenant_id = $1
       AND status = 'locked'
       AND NOT (period_end < $2 OR period_start > $3)
     ORDER BY period_start DESC`, [tenantId, fromSql, toSql]);
    return rows.map(serializeTaxPeriod);
}
export async function getTaxPeriods(tenantId: string, limit: string | number | null = 24) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 24, 1), 120);
    const rows = await query<any>(`SELECT
       id,
       tenant_id AS tenantId,
       period_start AS periodStart,
       period_end AS periodEnd,
       status,
       locked_at AS lockedAt,
       locked_by AS lockedBy,
       locked_by_name AS lockedByName,
       lock_note AS lockNote,
       currency,
       standard_rate AS standardRate,
       gross_sales AS grossSales,
       taxable_sales AS taxableSales,
       zero_rated_sales AS zeroRatedSales,
       exempt_sales AS exemptSales,
       output_tax AS outputTax,
       input_tax AS inputTax,
       net_vat_payable AS netVatPayable,
       invoice_count AS invoiceCount,
       refund_count AS refundCount,
       summary_snapshot AS summarySnapshot
     FROM tax_periods
     WHERE tenant_id = $1
     ORDER BY period_end DESC
     LIMIT $2`, [tenantId, parsedLimit]);
    return rows.map(serializeTaxPeriod);
}
export async function getVatTaxReport(tenantId: string, filters: TaxReportFilters = {}) {
    const generatedAt = new Date().toISOString();
    const range = resolveRange(filters);
    const rows = await query<any>(`SELECT
       s.id AS saleId,
       s.created_at AS createdAt,
       s.status,
       COALESCE(s.transaction_type, 'sale') AS transactionType,
       s.parent_sale_id AS parentSaleId,
       s.customer_id AS customerId,
       s.staff_id AS staffId,
       s.payment_method AS paymentMethod,
       s.subtotal,
       s.tax_amount AS taxAmount,
       s.tax_rate AS taxRate,
       s.tax_inclusive AS taxInclusive,
       s.total,
       c.name AS customerName,
       c.email AS customerEmail,
       st.name AS staffName,
       COUNT(si.id) AS itemCount,
       COALESCE(SUM(ABS(si.quantity)), 0) AS unitCount
     FROM sales s
     LEFT JOIN sale_items si ON si.sale_id = s.id
     LEFT JOIN customers c ON c.tenant_id = s.tenant_id AND c.id = s.customer_id
     LEFT JOIN staff st ON st.tenant_id = s.tenant_id AND st.id = s.staff_id
     WHERE s.tenant_id = $1
       AND s.status = 'completed'
       AND COALESCE(s.transaction_type, 'sale') IN ('sale','refund')
       AND s.created_at >= $2
       AND s.created_at <= $3
     GROUP BY
       s.id, s.created_at, s.status, s.transaction_type, s.parent_sale_id,
       s.customer_id, s.staff_id, s.payment_method, s.subtotal, s.tax_amount,
       s.tax_rate, s.tax_inclusive, s.total, c.name, c.email, st.name
     ORDER BY s.created_at ASC, s.id ASC`, [tenantId, range.fromSql, range.toSql]);
    const invoices = rows.map(serializeInvoiceRow);
    const grossSales = money(invoices.reduce((sum, invoice) => sum + invoice.total, 0));
    const taxableSales = money(invoices.reduce((sum, invoice) => sum + invoice.taxableSupply, 0));
    const zeroRatedSales = money(invoices.reduce((sum, invoice) => sum + invoice.zeroRatedSupply, 0));
    const outputTax = money(invoices.reduce((sum, invoice) => sum + invoice.taxAmount, 0));
    const standardRatedInvoiceCount = invoices.filter(invoice => invoice.taxRate > 0 || invoice.taxAmount !== 0).length;
    const refundCount = invoices.filter(invoice => invoiceSign(invoice) < 0 || invoice.transactionType === "refund").length;
    const inputTax = 0;
    const summary = {
        invoiceCount: invoices.length,
        standardRatedInvoiceCount,
        refundCount,
        grossSales,
        taxableSales,
        zeroRatedSales,
        exemptSales: 0,
        outputTax,
        inputTax,
        netVatPayable: money(outputTax - inputTax),
        currency: "ZAR",
        standardRate: STANDARD_VAT_RATE,
    };
    const vat201Fields = {
        field1StandardRatedSupplies: taxableSales,
        field3ExemptAndNonSupplies: 0,
        field4OutputTax: outputTax,
        field14InputTaxCapitalGoods: 0,
        field15InputTaxOtherGoodsAndServices: 0,
        field19TotalInputTax: 0,
        netVatPayable: summary.netVatPayable,
    };
    const lockedPeriods = await lockedPeriodsForRange(tenantId, range.fromSql, range.toSql);
    const rateBreakdown = buildBreakdown(invoices);
    const artifacts = buildArtifacts({
        generatedAt,
        periodLabel: range.label,
        invoices,
        summary,
        vat201Fields,
        rateBreakdown,
        lockedPeriod: lockedPeriods[0] || null,
    });
    return {
        filename: `jimmy-pos-vat-output-${dateLabel(range.from)}-${dateLabel(range.to)}.csv`,
        pdfFilename: `jimmy-pos-vat-output-${dateLabel(range.from)}-${dateLabel(range.to)}.pdf`,
        mimeType: "text/csv",
        pdfMimeType: "application/pdf",
        generatedAt,
        periodStart: range.fromSql,
        periodEnd: range.toSql,
        periodLabel: range.label,
        locked: lockedPeriods.length > 0,
        lockedPeriods,
        summary,
        vat201Fields,
        rateBreakdown,
        invoices,
        notes: [
            "SARS VAT201 support pack: output tax is calculated from completed POS sales and refund credit notes.",
            "Input VAT is not claimed from this POS sales export; supplier invoice VAT capture is required before input-tax fields can be populated.",
            "Tax period locking stores an audit snapshot and blocks direct sale edits/voids inside locked periods.",
        ],
        ...artifacts,
    };
}
export async function lockTaxPeriod(tenantId: string, input: TaxPeriodLockInput, actor: TaxActor = {}) {
    if (!input.periodStart || !input.periodEnd) {
        throw new Error("Choose a tax period start and end date before locking.");
    }
    const range = resolveRange({ from: input.periodStart, to: input.periodEnd });
    const report = await getVatTaxReport(tenantId, { from: dateLabel(range.from), to: dateLabel(range.to) });
    const id = `tax_period_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const note = clean(input.note).slice(0, 1000) || null;
    const conn = await getConnection();
    try {
        await conn.beginTransaction();
        const [overlapRows] = await conn.query<any>(`SELECT id, period_start AS periodStart, period_end AS periodEnd
         FROM tax_periods
        WHERE tenant_id = $1
          AND status = 'locked'
          AND NOT (period_end < $2 OR period_start > $3)
        LIMIT 1`, [tenantId, range.fromSql, range.toSql]);
        const overlap = (overlapRows as any[])[0];
        if (overlap) {
            throw new Error("A locked tax period already overlaps the selected dates.");
        }
        await conn.query(`INSERT INTO tax_periods (
        id, tenant_id, period_start, period_end, status, locked_at, locked_by, locked_by_name,
        lock_note, currency, standard_rate, gross_sales, taxable_sales, zero_rated_sales,
        exempt_sales, output_tax, input_tax, net_vat_payable, invoice_count, refund_count,
        summary_snapshot, report_snapshot, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'locked', NOW(), $5, $6, $7, 'ZAR', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())`, [
            id,
            tenantId,
            range.fromSql,
            range.toSql,
            actor.staffId || null,
            actor.staffName || null,
            note,
            STANDARD_VAT_RATE,
            report.summary.grossSales,
            report.summary.taxableSales,
            report.summary.zeroRatedSales,
            report.summary.exemptSales,
            report.summary.outputTax,
            report.summary.inputTax,
            report.summary.netVatPayable,
            report.summary.invoiceCount,
            report.summary.refundCount,
            JSON.stringify(report.summary),
            JSON.stringify({
                generatedAt: report.generatedAt,
                periodStart: report.periodStart,
                periodEnd: report.periodEnd,
                periodLabel: report.periodLabel,
                summary: report.summary,
                vat201Fields: report.vat201Fields,
                rateBreakdown: report.rateBreakdown,
                invoices: report.invoices,
                notes: report.notes,
            }),
        ]);
        await recordAuditEvent(conn, {
            tenantId,
            action: "tax_period.locked",
            entityType: "tax_period",
            entityId: id,
            staffId: actor.staffId || null,
            staffName: actor.staffName || null,
            source: "tax_reporting",
            details: {
                periodStart: range.fromSql,
                periodEnd: range.toSql,
                note,
                summary: report.summary,
                vat201Fields: report.vat201Fields,
            },
        });
        await conn.commit();
        const periods = await getTaxPeriods(tenantId, 1);
        return { period: periods.find(period => period?.id === id) || periods[0], report: { ...report, locked: true } };
    }
    catch (error) {
        await conn.rollback();
        throw error;
    }
    finally {
        conn.release();
    }
}
function lockedPeriodError(action: string, row: any) {
    const start = row.periodStart ?? row.period_start;
    const end = row.periodEnd ?? row.period_end;
    return `Cannot ${action}: tax period ${start} to ${end} is locked. Record an adjustment or refund in an open period instead.`;
}
export async function assertSaleNotInLockedTaxPeriod(conn: any, tenantId: string, saleId: string, action: string) {
    const [rows] = await conn.query(`SELECT tp.id, tp.period_start AS periodStart, tp.period_end AS periodEnd
       FROM sales s
       INNER JOIN tax_periods tp
               ON tp.tenant_id = s.tenant_id
              AND tp.status = 'locked'
              AND s.created_at >= tp.period_start
              AND s.created_at <= tp.period_end
      WHERE s.tenant_id = $1
        AND s.id = $2
      LIMIT 1`, [tenantId, saleId]);
    const locked = (rows as any[])[0];
    if (locked)
        throw new Error(lockedPeriodError(action, locked));
}
export async function assertCurrentTaxPeriodOpen(conn: any, tenantId: string, action: string) {
    const [rows] = await conn.query(`SELECT id, period_start AS periodStart, period_end AS periodEnd
       FROM tax_periods
      WHERE tenant_id = $1
        AND status = 'locked'
        AND NOW() >= period_start
        AND NOW() <= period_end
      LIMIT 1`, [tenantId]);
    const locked = (rows as any[])[0];
    if (locked)
        throw new Error(lockedPeriodError(action, locked));
}
