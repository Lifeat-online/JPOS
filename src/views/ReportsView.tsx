import React from 'react';
import { Customer, Sale } from '../types';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, BarChart3, Calculator, CalendarDays, Clock3, Download, FileText, LockKeyhole, RefreshCw, ShieldCheck, TrendingUp, Users, Presentation, DollarSign, ReceiptText } from 'lucide-react';
import { AiInsightStrip } from '../components/AiInsightStrip';
import { buildSalesReport, ReportPreset, resolveReportRange } from '../utils/reportExports';
import { exportAccountingJournalReport, exportMarginReport, exportOperationalReport, exportVatTaxReport, getTaxPeriods, lockTaxPeriod as lockTaxPeriodApi } from '../api';
import type { AccountingJournalReport, MarginReport, MarginReportRow, OperationalReport, TaxPeriod, VatTaxReport } from '../types';

interface ReportsViewProps {
  sales: Sale[];
  customers: Customer[];
  tenantId?: string | null;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
const REPORT_PRESETS: { key: ReportPreset; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'custom', label: 'Custom' },
];

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function marginTone(value: number) {
  if (value < 20) return 'text-rose-600 dark:text-rose-400';
  if (value < 30) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function minutesLabel(value: number) {
  const minutes = Math.max(0, Math.round(value || 0));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ sales, customers, tenantId }) => {
  const [reportNow] = React.useState(() => new Date());
  const [reportPreset, setReportPreset] = React.useState<ReportPreset>('weekly');
  const [customFrom, setCustomFrom] = React.useState(() => dateInputValue(reportNow));
  const [customTo, setCustomTo] = React.useState(() => dateInputValue(reportNow));
  const reportRange = React.useMemo(
    () => resolveReportRange(reportPreset, reportNow, customFrom, customTo),
    [customFrom, customTo, reportNow, reportPreset]
  );
  const report = React.useMemo(
    () => buildSalesReport(sales, customers, reportRange),
    [customers, reportRange, sales]
  );
  const {
    accountLimit,
    accountOwing,
    accountSales,
    avgOrderValue,
    completedSales,
    dailyData,
    itemsSold,
    topProducts,
    totalRevenue,
  } = report;
  const reportFileRange = `${dateInputValue(reportRange.from)}_${dateInputValue(reportRange.to)}`;
  const [taxReport, setTaxReport] = React.useState<VatTaxReport | null>(null);
  const [taxPeriods, setTaxPeriods] = React.useState<TaxPeriod[]>([]);
  const [taxLoading, setTaxLoading] = React.useState(false);
  const [taxError, setTaxError] = React.useState<string | null>(null);
  const [taxLockNote, setTaxLockNote] = React.useState('');
  const [marginReport, setMarginReport] = React.useState<MarginReport | null>(null);
  const [marginLoading, setMarginLoading] = React.useState(false);
  const [marginError, setMarginError] = React.useState<string | null>(null);
  const [operationalReport, setOperationalReport] = React.useState<OperationalReport | null>(null);
  const [operationalLoading, setOperationalLoading] = React.useState(false);
  const [operationalError, setOperationalError] = React.useState<string | null>(null);
  const [accountingReport, setAccountingReport] = React.useState<AccountingJournalReport | null>(null);
  const [accountingLoading, setAccountingLoading] = React.useState(false);
  const [accountingError, setAccountingError] = React.useState<string | null>(null);
  const taxFilters = React.useMemo(() => ({
    from: dateInputValue(reportRange.from),
    to: dateInputValue(reportRange.to),
  }), [reportRange]);
  const operationalSaleCount = operationalReport?.basketSegments.reduce((sum, row) => sum + row.saleCount, 0) || 0;
  const operationalRevenue = operationalReport?.basketSegments.reduce((sum, row) => sum + row.revenue, 0) || 0;
  const operationalAverageBasket = operationalSaleCount > 0 ? operationalRevenue / operationalSaleCount : 0;

  const handleDownloadCsv = React.useCallback(() => {
    saveBlob(new Blob([report.csv], { type: 'text/csv;charset=utf-8' }), `sales-report-${reportFileRange}.csv`);
  }, [report.csv, reportFileRange]);

  const handleDownloadPdf = React.useCallback(() => {
    const buffer = base64ToArrayBuffer(report.pdfBase64);
    saveBlob(new Blob([buffer], { type: 'application/pdf' }), `sales-report-${reportFileRange}.pdf`);
  }, [report.pdfBase64, reportFileRange]);

  const loadTaxPack = React.useCallback(async () => {
    if (!tenantId) {
      setTaxReport(null);
      setTaxPeriods([]);
      return;
    }
    setTaxLoading(true);
    setTaxError(null);
    try {
      const [nextReport, nextPeriods] = await Promise.all([
        exportVatTaxReport(tenantId, taxFilters),
        getTaxPeriods(tenantId),
      ]);
      setTaxReport(nextReport);
      setTaxPeriods(nextPeriods);
    } catch (error: any) {
      setTaxError(error?.message || 'Unable to load VAT report');
    } finally {
      setTaxLoading(false);
    }
  }, [taxFilters, tenantId]);

  React.useEffect(() => {
    void loadTaxPack();
  }, [loadTaxPack]);

  const handleDownloadTaxCsv = React.useCallback(() => {
    if (!taxReport) return;
    saveBlob(new Blob([taxReport.csv], { type: taxReport.mimeType || 'text/csv;charset=utf-8' }), taxReport.filename);
  }, [taxReport]);

  const handleDownloadTaxPdf = React.useCallback(() => {
    if (!taxReport) return;
    const buffer = base64ToArrayBuffer(taxReport.pdfBase64);
    saveBlob(new Blob([buffer], { type: taxReport.pdfMimeType || 'application/pdf' }), taxReport.pdfFilename);
  }, [taxReport]);

  const handleLockTaxPeriod = React.useCallback(async () => {
    if (!tenantId) return;
    setTaxLoading(true);
    setTaxError(null);
    try {
      const result = await lockTaxPeriodApi(tenantId, {
        periodStart: taxFilters.from,
        periodEnd: taxFilters.to,
        note: taxLockNote || null,
      });
      setTaxReport(result.report);
      setTaxLockNote('');
      setTaxPeriods(await getTaxPeriods(tenantId));
    } catch (error: any) {
      setTaxError(error?.message || 'Unable to lock tax period');
    } finally {
      setTaxLoading(false);
    }
  }, [taxFilters, taxLockNote, tenantId]);

  const loadMarginPack = React.useCallback(async () => {
    if (!tenantId) {
      setMarginReport(null);
      return;
    }
    setMarginLoading(true);
    setMarginError(null);
    try {
      setMarginReport(await exportMarginReport(tenantId, taxFilters));
    } catch (error: any) {
      setMarginError(error?.message || 'Unable to load margin report');
    } finally {
      setMarginLoading(false);
    }
  }, [taxFilters, tenantId]);

  React.useEffect(() => {
    void loadMarginPack();
  }, [loadMarginPack]);

  const handleDownloadMarginCsv = React.useCallback(() => {
    if (!marginReport) return;
    saveBlob(new Blob([marginReport.csv], { type: marginReport.mimeType || 'text/csv;charset=utf-8' }), marginReport.filename);
  }, [marginReport]);

  const handleDownloadMarginPdf = React.useCallback(() => {
    if (!marginReport) return;
    const buffer = base64ToArrayBuffer(marginReport.pdfBase64);
    saveBlob(new Blob([buffer], { type: marginReport.pdfMimeType || 'application/pdf' }), marginReport.pdfFilename);
  }, [marginReport]);

  const loadOperationalPack = React.useCallback(async () => {
    if (!tenantId) {
      setOperationalReport(null);
      return;
    }
    setOperationalLoading(true);
    setOperationalError(null);
    try {
      setOperationalReport(await exportOperationalReport(tenantId, taxFilters));
    } catch (error: any) {
      setOperationalError(error?.message || 'Unable to load operational analytics report');
    } finally {
      setOperationalLoading(false);
    }
  }, [taxFilters, tenantId]);

  React.useEffect(() => {
    void loadOperationalPack();
  }, [loadOperationalPack]);

  const handleDownloadOperationalCsv = React.useCallback(() => {
    if (!operationalReport) return;
    saveBlob(new Blob([operationalReport.csv], { type: operationalReport.mimeType || 'text/csv;charset=utf-8' }), operationalReport.filename);
  }, [operationalReport]);

  const handleDownloadOperationalPdf = React.useCallback(() => {
    if (!operationalReport) return;
    const buffer = base64ToArrayBuffer(operationalReport.pdfBase64);
    saveBlob(new Blob([buffer], { type: operationalReport.pdfMimeType || 'application/pdf' }), operationalReport.pdfFilename);
  }, [operationalReport]);

  const loadAccountingPack = React.useCallback(async () => {
    if (!tenantId) {
      setAccountingReport(null);
      return;
    }
    setAccountingLoading(true);
    setAccountingError(null);
    try {
      setAccountingReport(await exportAccountingJournalReport(tenantId, taxFilters));
    } catch (error: any) {
      setAccountingError(error?.message || 'Unable to load accounting journal export');
    } finally {
      setAccountingLoading(false);
    }
  }, [taxFilters, tenantId]);

  React.useEffect(() => {
    void loadAccountingPack();
  }, [loadAccountingPack]);

  const handleDownloadAccountingCsv = React.useCallback(() => {
    if (!accountingReport) return;
    saveBlob(new Blob([accountingReport.csv], { type: accountingReport.mimeType || 'text/csv;charset=utf-8' }), accountingReport.filename);
  }, [accountingReport]);

  const handleDownloadAccountingPdf = React.useCallback(() => {
    if (!accountingReport) return;
    const buffer = base64ToArrayBuffer(accountingReport.pdfBase64);
    saveBlob(new Blob([buffer], { type: accountingReport.pdfMimeType || 'application/pdf' }), accountingReport.pdfFilename);
  }, [accountingReport]);

  const handleDownloadAccountingTarget = React.useCallback((targetId: string) => {
    const targetExport = (accountingReport?.targetExports || []).find(target => target.targetId === targetId);
    if (!targetExport) return;
    saveBlob(new Blob([targetExport.csv], { type: targetExport.mimeType || 'text/csv;charset=utf-8' }), targetExport.filename);
  }, [accountingReport]);

  const renderMarginRows = (rows: MarginReportRow[]) => (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.slice(0, 5).map(row => (
        <div key={row.key} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-slate-800 dark:text-slate-100">{row.label}</div>
            <div className="text-xs font-bold text-slate-500">R{row.revenue.toFixed(2)} revenue</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-black text-slate-900 dark:text-white">R{row.grossProfit.toFixed(2)}</div>
            <div className={`text-xs font-black ${marginTone(row.grossMarginPercent)}`}>{row.grossMarginPercent.toFixed(1)}%</div>
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <div className="py-8 text-center text-sm font-bold text-slate-400">No margin rows.</div>
      )}
    </div>
  );

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Analytics Dashboard</h2>
          <p className="text-slate-500 font-medium">Revenue tracking, average order value, and top products for {reportRange.label.toLowerCase()}.</p>
        </div>

        <AiInsightStrip tenantId={tenantId || null} compact />

        <div className="bg-white dark:bg-slate-900 p-4 lg:p-5 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {REPORT_PRESETS.map(preset => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setReportPreset(preset.key)}
                  className={`px-4 py-2 rounded-2xl text-sm font-black transition-colors ${
                    reportPreset === preset.key
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {reportPreset === 'custom' && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-3 py-2">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(event) => setCustomFrom(event.target.value)}
                      className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-3 py-2">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      value={customTo}
                      onChange={(event) => setCustomTo(event.target.value)}
                      className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none"
                    />
                  </label>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  PDF
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 rounded-2xl flex items-center justify-center">
              <DollarSign className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Total Rev</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">R{totalRevenue.toFixed(2)}</div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Avg Order</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">R{avgOrderValue.toFixed(2)}</div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-purple-50 dark:bg-purple-900/20 text-purple-500 rounded-2xl flex items-center justify-center">
              <Presentation className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Total Sales</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">{completedSales.length}</div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-orange-50 dark:bg-orange-900/20 text-orange-500 rounded-2xl flex items-center justify-center">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Items Sold</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">
                {itemsSold}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-2xl flex items-center justify-center">
              <ReceiptText className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Account Owing</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">R{accountOwing.toFixed(2)}</div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-amber-50 dark:bg-amber-900/20 text-amber-500 rounded-2xl flex items-center justify-center">
              <DollarSign className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Account Sales</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">R{accountSales.toFixed(2)}</div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 rounded-2xl flex items-center justify-center">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Credit Left</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">R{Math.max(0, accountLimit - accountOwing).toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-black mb-6">Revenue ({reportRange.label})</h3>
            <div className="w-full min-w-0">
              <ResponsiveContainer width="100%" height={320} minWidth={0} minHeight={0}>
                <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, strokeWidth: 4, fill: '#fff' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-black mb-6">Top Products (Units Sold)</h3>
            <div className="w-full min-w-0">
              <ResponsiveContainer width="100%" height={320} minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={topProducts}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {topProducts.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {topProducts.map((p, idx) => (
                  <div key={p.name} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                      <span className="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{p.name}</span>
                    </div>
                    <span className="font-black text-slate-900 dark:text-white">{p.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5 mb-6">
            <div>
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-2">
                <Calculator className="w-4 h-4" />
                Margin Report
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">Gross Margin Breakdown</h3>
              <p className="text-sm font-semibold text-slate-500 mt-1">{marginReport?.periodLabel || reportRange.label}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadMarginPack}
                disabled={marginLoading || !tenantId}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-slate-100 text-slate-700 text-sm font-black hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RefreshCw className={`w-4 h-4 ${marginLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleDownloadMarginCsv}
                disabled={!marginReport}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Margin CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadMarginPdf}
                disabled={!marginReport}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                Margin PDF
              </button>
            </div>
          </div>

          {marginError && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              {marginError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Revenue</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">R{(marginReport?.summary.revenue || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Cost</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">R{(marginReport?.summary.cost || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Profit</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">R{(marginReport?.summary.grossProfit || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Margin</div>
              <div className={`text-2xl font-black mt-1 ${marginTone(marginReport?.summary.grossMarginPercent || 0)}`}>{(marginReport?.summary.grossMarginPercent || 0).toFixed(1)}%</div>
            </div>
          </div>

          <div className="grid lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Products</div>
              {renderMarginRows(marginReport?.productRows || [])}
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Categories</div>
              {renderMarginRows(marginReport?.categoryRows || [])}
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Staff</div>
              {renderMarginRows(marginReport?.staffRows || [])}
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Payment</div>
              {renderMarginRows(marginReport?.paymentMethodRows || [])}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5 mb-6">
            <div>
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-2">
                <BarChart3 className="w-4 h-4" />
                Operational Analytics
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">Daily Operations Pack</h3>
              <p className="text-sm font-semibold text-slate-500 mt-1">{operationalReport?.periodLabel || reportRange.label}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadOperationalPack}
                disabled={operationalLoading || !tenantId}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-slate-100 text-slate-700 text-sm font-black hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RefreshCw className={`w-4 h-4 ${operationalLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleDownloadOperationalCsv}
                disabled={!operationalReport}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Ops CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadOperationalPdf}
                disabled={!operationalReport}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                Ops PDF
              </button>
            </div>
          </div>

          {operationalError && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              {operationalError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Categories</div>
                <BarChart3 className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{operationalReport?.summary.categoryCount || 0}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Avg Basket</div>
                <ReceiptText className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">R{operationalAverageBasket.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Open Tabs</div>
                <Clock3 className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{operationalReport?.summary.openTabCount || 0}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Cash Variance</div>
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">R{(operationalReport?.summary.cashAbsoluteVariance || 0).toFixed(2)}</div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Category Performance</div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(operationalReport?.categoryPerformance || []).slice(0, 5).map(row => (
                  <div key={row.key} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-800 dark:text-slate-100">{row.label}</div>
                      <div className="text-xs font-bold text-slate-500">{row.saleCount} sales - {row.quantity} units</div>
                    </div>
                    <div className="text-right text-sm font-black text-slate-900 dark:text-white">R{row.revenue.toFixed(2)}</div>
                  </div>
                ))}
                {(!operationalReport || operationalReport.categoryPerformance.length === 0) && (
                  <div className="py-8 text-center text-sm font-bold text-slate-400">No category rows.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Basket Segments</div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(operationalReport?.basketSegments || []).map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <div className="text-sm font-black text-slate-800 dark:text-slate-100">{row.label}</div>
                      <div className="text-xs font-bold text-slate-500">{row.saleCount} sales - {row.averageItems.toFixed(1)} items avg</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-slate-900 dark:text-white">R{row.averageBasket.toFixed(2)}</div>
                      <div className="text-xs font-bold text-slate-500">avg</div>
                    </div>
                  </div>
                ))}
                {(!operationalReport || operationalReport.basketSegments.length === 0) && (
                  <div className="py-8 text-center text-sm font-bold text-slate-400">No basket rows.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Table Turnover</div>
                <div className="text-xs font-black text-slate-500">{operationalReport?.tableTurnoverSummary.turnoverPerTable.toFixed(2) || '0.00'} / table</div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(operationalReport?.tableTurnoverRows || []).slice(0, 5).map(row => (
                  <div key={row.tableNumber} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <div className="text-sm font-black text-slate-800 dark:text-slate-100">{row.tableNumber}</div>
                      <div className="text-xs font-bold text-slate-500">{row.saleCount} turns - {minutesLabel(row.averageDurationMinutes)} avg</div>
                    </div>
                    <div className="text-right text-sm font-black text-slate-900 dark:text-white">R{row.averageCheck.toFixed(2)}</div>
                  </div>
                ))}
                {(!operationalReport || operationalReport.tableTurnoverRows.length === 0) && (
                  <div className="py-8 text-center text-sm font-bold text-slate-400">No table rows.</div>
                )}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Open Tab Aging</div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {(operationalReport?.openTabAging.buckets || []).map(bucket => (
                  <div key={bucket.label} className="rounded-2xl bg-slate-50 dark:bg-slate-950 px-3 py-2">
                    <div className="text-xs font-black text-slate-500">{bucket.label}</div>
                    <div className="text-sm font-black text-slate-900 dark:text-white">{bucket.count} tabs - R{bucket.total.toFixed(2)}</div>
                  </div>
                ))}
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(operationalReport?.openTabAging.rows || []).slice(0, 3).map(row => (
                  <div key={row.saleId} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-800 dark:text-slate-100">{row.tabName}</div>
                      <div className="text-xs font-bold text-slate-500">{row.ageBucket} - {minutesLabel(row.ageMinutes)}</div>
                    </div>
                    <div className="text-sm font-black text-slate-900 dark:text-white">R{row.total.toFixed(2)}</div>
                  </div>
                ))}
                {(!operationalReport || operationalReport.openTabAging.rows.length === 0) && (
                  <div className="py-8 text-center text-sm font-bold text-slate-400">No open tabs.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Refunds And Voids</div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 px-3 py-2">
                  <div className="text-xs font-black text-slate-500">Refunds</div>
                  <div className="text-sm font-black text-slate-900 dark:text-white">{operationalReport?.refundVoidSummary.refundCount || 0} - R{(operationalReport?.refundVoidSummary.refundAmount || 0).toFixed(2)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 px-3 py-2">
                  <div className="text-xs font-black text-slate-500">Voids</div>
                  <div className="text-sm font-black text-slate-900 dark:text-white">{operationalReport?.refundVoidSummary.voidCount || 0} - R{(operationalReport?.refundVoidSummary.voidAmount || 0).toFixed(2)}</div>
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(operationalReport?.refundVoidRows || []).slice(0, 4).map(row => (
                  <div key={row.saleId} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black capitalize text-slate-800 dark:text-slate-100">{row.transactionType}</div>
                      <div className="truncate text-xs font-bold text-slate-500">{row.reason || row.refundStatus || row.saleId}</div>
                    </div>
                    <div className="text-sm font-black text-slate-900 dark:text-white">R{row.amount.toFixed(2)}</div>
                  </div>
                ))}
                {(!operationalReport || operationalReport.refundVoidRows.length === 0) && (
                  <div className="py-8 text-center text-sm font-bold text-slate-400">No refund or void rows.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Cash Variance Trend</div>
                <div className="text-xs font-black text-slate-500">{operationalReport?.cashVarianceSummary.unresolvedCount || 0} unresolved</div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(operationalReport?.cashVarianceTrend || []).slice(-5).map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <div className="text-sm font-black text-slate-800 dark:text-slate-100">{row.label}</div>
                      <div className="text-xs font-bold text-slate-500">{row.count} variance rows</div>
                    </div>
                    <div className={`text-sm font-black ${row.netVariance === 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}`}>
                      R{row.netVariance.toFixed(2)}
                    </div>
                  </div>
                ))}
                {(!operationalReport || operationalReport.cashVarianceTrend.length === 0) && (
                  <div className="py-8 text-center text-sm font-bold text-slate-400">No cash variance rows.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5 mb-6">
            <div>
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 mb-2">
                <FileText className="w-4 h-4" />
                Accounting Journal
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">Export Foundation</h3>
              <p className="text-sm font-semibold text-slate-500 mt-1">{accountingReport?.periodLabel || reportRange.label}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadAccountingPack}
                disabled={accountingLoading || !tenantId}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-slate-100 text-slate-700 text-sm font-black hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RefreshCw className={`w-4 h-4 ${accountingLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleDownloadAccountingCsv}
                disabled={!accountingReport}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Journal CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadAccountingPdf}
                disabled={!accountingReport}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                Journal PDF
              </button>
            </div>
          </div>

          {accountingError && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              {accountingError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Entries</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{accountingReport?.summary.entryCount || 0}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Debits</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">R{(accountingReport?.summary.totalDebits || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Credits</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">R{(accountingReport?.summary.totalCredits || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Balance</div>
              <div className={`text-2xl font-black mt-1 ${accountingReport?.summary.balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                R{(accountingReport?.summary.outOfBalance || 0).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Targets</div>
              <div className="space-y-2">
                {(accountingReport?.integrationTargets || []).map(target => {
                  const targetExport = (accountingReport?.targetExports || []).find(exportPack => exportPack.targetId === target.id);
                  return (
                    <div key={target.id} className="rounded-2xl bg-slate-50 dark:bg-slate-950 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-black text-slate-900 dark:text-white">{target.name}</div>
                          <div className="truncate text-xs font-bold text-slate-500">{target.requiredFields.slice(0, 4).join(', ')}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadAccountingTarget(target.id)}
                          disabled={!targetExport}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800 dark:hover:bg-slate-800"
                          title={`${target.name} CSV`}
                          aria-label={`${target.name} CSV`}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {(!accountingReport || accountingReport.integrationTargets.length === 0) && (
                  <div className="py-8 text-center text-sm font-bold text-slate-400">No target mappings.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Account Map</div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                {(accountingReport?.accountMappings || []).slice(0, 8).map(account => (
                  <div key={account.key} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-800 dark:text-slate-100">{account.name}</div>
                      <div className="text-xs font-bold uppercase text-slate-500">{account.type}</div>
                    </div>
                    <div className="text-sm font-black text-slate-900 dark:text-white">{account.code}</div>
                  </div>
                ))}
                {(!accountingReport || accountingReport.accountMappings.length === 0) && (
                  <div className="py-8 text-center text-sm font-bold text-slate-400">No account mappings.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">Journal Lines</div>
                <div className="text-xs font-black text-slate-500">{accountingReport?.summary.lineCount || 0} lines</div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                {(accountingReport?.journalLines || []).slice(0, 8).map(line => (
                  <div key={`${line.entryId}-${line.lineNumber}`} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-800 dark:text-slate-100">{line.accountCode} - {line.accountName}</div>
                      <div className="truncate text-xs font-bold text-slate-500">{line.reference} - {line.memo}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">DR R{line.debit.toFixed(2)}</div>
                      <div className="text-xs font-black text-blue-600 dark:text-blue-400">CR R{line.credit.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
                {(!accountingReport || accountingReport.journalLines.length === 0) && (
                  <div className="py-8 text-center text-sm font-bold text-slate-400">No journal lines.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5 mb-6">
            <div>
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-2">
                <ShieldCheck className="w-4 h-4" />
                VAT Output Pack
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">SARS VAT201 Support</h3>
              <p className="text-sm font-semibold text-slate-500 mt-1">{taxReport?.periodLabel || reportRange.label} · {taxReport?.locked ? 'Locked' : 'Draft'}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadTaxPack}
                disabled={taxLoading || !tenantId}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-slate-100 text-slate-700 text-sm font-black hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RefreshCw className={`w-4 h-4 ${taxLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleDownloadTaxCsv}
                disabled={!taxReport}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                VAT CSV
              </button>
              <button
                type="button"
                onClick={handleDownloadTaxPdf}
                disabled={!taxReport}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                VAT PDF
              </button>
            </div>
          </div>

          {taxError && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              {taxError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Output Tax</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">R{(taxReport?.summary.outputTax || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Net VAT</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">R{(taxReport?.summary.netVatPayable || 0).toFixed(2)}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Invoices</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{taxReport?.summary.invoiceCount || 0}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Refunds</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{taxReport?.summary.refundCount || 0}</div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="grid grid-cols-5 bg-slate-100 dark:bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500">
                <span className="col-span-2">Invoice</span>
                <span>Type</span>
                <span>VAT</span>
                <span>Total</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {(taxReport?.invoices || []).slice(0, 8).map(invoice => (
                  <div key={invoice.taxInvoiceNumber} className="grid grid-cols-5 px-4 py-3 text-sm items-center">
                    <span className="col-span-2 font-black text-slate-800 dark:text-slate-100 truncate">{invoice.taxInvoiceNumber}</span>
                    <span className="font-bold capitalize text-slate-500">{invoice.transactionType}</span>
                    <span className="font-black text-slate-800 dark:text-slate-100">R{invoice.taxAmount.toFixed(2)}</span>
                    <span className="font-black text-slate-800 dark:text-slate-100">R{invoice.total.toFixed(2)}</span>
                  </div>
                ))}
                {(!taxReport || taxReport.invoices.length === 0) && (
                  <div className="px-4 py-8 text-center text-sm font-bold text-slate-400">No completed tax invoices in this period.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Period Lock</div>
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${taxReport?.locked ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                  <LockKeyhole className="w-3.5 h-3.5" />
                  {taxReport?.locked ? 'Locked' : 'Open'}
                </div>
              </div>
              <textarea
                value={taxLockNote}
                onChange={(event) => setTaxLockNote(event.target.value)}
                rows={3}
                placeholder="Lock note"
                disabled={taxReport?.locked}
                className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleLockTaxPeriod}
                disabled={taxLoading || !tenantId || !taxReport || taxReport.locked}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 text-white text-sm font-black hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950"
              >
                <LockKeyhole className="w-4 h-4" />
                Lock Period
              </button>
              <div className="space-y-2">
                {taxPeriods.slice(0, 3).map(period => (
                  <div key={period.id} className="rounded-2xl bg-slate-50 dark:bg-slate-950 px-3 py-2">
                    <div className="text-xs font-black text-slate-800 dark:text-slate-100">
                      {dateInputValue(new Date(period.periodStart))} to {dateInputValue(new Date(period.periodEnd))}
                    </div>
                    <div className="text-xs font-bold text-slate-500">VAT R{period.outputTax.toFixed(2)} · {period.invoiceCount} invoices</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
