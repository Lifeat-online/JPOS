import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Download, FileText, Loader2, MapPin, PackageCheck, Search } from 'lucide-react';
import { apiGet, getStockValuationReport } from '../api';
import { StockBatch, StockValuationReport } from '../types';
import { usePosStore } from '../store/usePosStore';

function formatDate(value: any) {
  if (!value) return 'No expiry';
  return String(value).slice(0, 10);
}

function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function expiryTone(batch: StockBatch) {
  if (batch.expiryStatus === 'expired') return 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/40';
  if (batch.expiryStatus === 'expiring') return 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40';
  if (batch.expiryStatus === 'depleted') return 'bg-slate-50 text-slate-400 border-slate-100 dark:bg-slate-900 dark:text-slate-500 dark:border-slate-800';
  return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40';
}

function downloadBase64Pdf(base64: string, filename: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const blob = new Blob([bytes], { type: mimeType || 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(contents: string, filename: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType || 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function StockBatchesView() {
  const tenantId = usePosStore(s => s.tenantId);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [report, setReport] = useState<StockValuationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!tenantId) return;
      setLoading(true);
      try {
        const [batchResult, reportResult] = await Promise.allSettled([
          apiGet<StockBatch[]>(`/api/mariadb/tenants/${tenantId}/stock-batches`),
          getStockValuationReport(tenantId),
        ]);
        if (!mounted) return;
        setBatches(batchResult.status === 'fulfilled' ? batchResult.value || [] : []);
        setReport(reportResult.status === 'fulfilled' ? reportResult.value : null);
        if (batchResult.status === 'rejected') console.error('Stock batch fetch error:', batchResult.reason);
        if (reportResult.status === 'rejected') console.error('Stock valuation report fetch error:', reportResult.reason);
      } catch (err) {
        console.error('Stock batch fetch error:', err);
        if (mounted) {
          setBatches([]);
          setReport(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [tenantId]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return batches;
    return batches.filter(batch => [
      batch.productName,
      batch.batchNumber,
      batch.supplierInvoiceNumber,
      batch.rotationGuidance,
    ].some(value => String(value || '').toLowerCase().includes(needle)));
  }, [batches, search]);

  const stats = useMemo(() => ({
    active: batches.filter(batch => batch.expiryStatus !== 'depleted').length,
    expiring: batches.filter(batch => batch.expiryStatus === 'expiring').length,
    expired: batches.filter(batch => batch.expiryStatus === 'expired').length,
    remaining: batches.reduce((sum, batch) => sum + Number(batch.remainingQuantity || 0), 0),
    stockValue: report?.summary.productBookValue ?? batches.reduce((sum, batch) => sum + Number(batch.remainingQuantity || 0) * Number(batch.unitCost || 0), 0),
    batchValue: report?.summary.batchRemainingValue ?? batches.reduce((sum, batch) => sum + Number(batch.remainingQuantity || 0) * Number(batch.unitCost || 0), 0),
    unbatchedQuantity: report?.summary.unbatchedQuantity ?? 0,
    atRiskValue: (report?.summary.expiredBatchValue || 0) + (report?.summary.expiringBatchValue || 0),
  }), [batches, report]);

  const downloadReport = async (format: 'csv' | 'pdf') => {
    if (!tenantId) return;
    setExporting(format);
    try {
      const pack = report || await getStockValuationReport(tenantId);
      if (!report) setReport(pack);
      if (format === 'pdf') {
        downloadBase64Pdf(pack.pdfBase64, pack.pdfFilename || 'masepos-stock-valuation-impact.pdf', pack.pdfMimeType);
      } else {
        downloadTextFile(pack.csv, pack.filename || 'masepos-stock-valuation-impact.csv', pack.mimeType);
      }
    } catch (err) {
      console.error('Stock valuation export error:', err);
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-100 dark:border-slate-800/60 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">Stock Batches</h2>
          <p className="text-sm font-medium text-slate-500">FEFO rotation, valuation, and supplier invoice traceability</p>
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-3 w-full xl:w-auto">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => downloadReport('pdf')}
              disabled={exporting !== null}
              title="Download valuation PDF"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-primary disabled:opacity-60 dark:bg-white dark:text-slate-950"
            >
              {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              PDF
            </button>
            <button
              type="button"
              onClick={() => downloadReport('csv')}
              disabled={exporting !== null}
              title="Download valuation CSV"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200"
            >
              {exporting === 'csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              CSV
            </button>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold dark:text-white"
              placeholder="Product, batch, invoice"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/60 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active Batches</p>
          <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">{stats.active}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/60 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stock Value</p>
          <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">{formatMoney(stats.stockValue)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/60 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Batch Value</p>
          <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">{formatMoney(stats.batchValue)}</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/40 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Unbatched Units</p>
          <p className="mt-2 text-3xl font-black text-amber-700 dark:text-amber-300">{stats.unbatchedQuantity.toFixed(3)}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900/40 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-600">At-Risk Value</p>
          <p className="mt-2 text-3xl font-black text-red-700 dark:text-red-300">{formatMoney(stats.atRiskValue)}</p>
        </div>
      </div>

      {report?.locationRows?.map(location => (
        <div key={location.locationId} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/60 p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MapPin className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-black text-slate-900 dark:text-white">{location.locationName}</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{location.note}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-right">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Units</p>
                <p className="text-sm font-black text-slate-900 dark:text-white">{location.currentStockQuantity.toFixed(3)}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Received</p>
                <p className="text-sm font-black text-slate-900 dark:text-white">{formatMoney(location.receivedValue)}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Movement In/Out</p>
                <p className="text-sm font-black text-slate-900 dark:text-white">{location.movementQuantityIn.toFixed(3)} / {location.movementQuantityOut.toFixed(3)}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Value Impact</p>
                <p className="text-sm font-black text-slate-900 dark:text-white">{formatMoney(location.movementValueDelta)}</p>
              </div>
            </div>
          </div>
        </div>
      ))}

      {filtered.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-[24px] border border-dashed border-slate-200 dark:border-slate-700/60">
          <PackageCheck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No stock batches found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(batch => (
            <div key={batch.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/60 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-lg font-black text-slate-900 dark:text-white truncate">{batch.productName}</p>
                  <p className="text-xs font-bold text-slate-400 mt-1">
                    {batch.batchNumber || 'No batch ref'} {batch.supplierInvoiceNumber ? `- Invoice ${batch.supplierInvoiceNumber}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${expiryTone(batch)}`}>
                  {batch.expiryStatus}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Remaining</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white">{Number(batch.remainingQuantity || 0).toFixed(3)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Received</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white">{Number(batch.receivedQuantity || 0).toFixed(3)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Unit Cost</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white">R{Number(batch.unitCost || 0).toFixed(2)}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-[#0B1120] px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  <CalendarClock className="w-4 h-4" /> {formatDate(batch.expiryDate)}
                </span>
                <span className="inline-flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-[#0B1120] px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  <PackageCheck className="w-4 h-4" /> {batch.rotationGuidance || 'Hold'}
                </span>
                {batch.expiryStatus === 'expired' && (
                  <span className="inline-flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs font-bold text-red-600 dark:text-red-300">
                    <AlertTriangle className="w-4 h-4" /> Reconcile
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
