import React from 'react';
import { Download, RefreshCw, Upload, Users } from 'lucide-react';
import { exportCustomersBatchCsv, importCustomersBatch } from '../api';
import type { BatchMutationResult } from '../types';

const customerSample = `name,email,phone,loyaltyPoints,accountEnabled,accountLimit,discountPercent
Sarah Demo,sarah@example.com,0820000000,120,yes,500,5`;

function saveCsvFile(csv: string, filename: string, mimeType = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([csv], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function CustomerBatchResult({ result }: { result: BatchMutationResult | null }) {
  if (!result) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
      <div className="flex flex-wrap gap-3">
        <span>{result.dryRun ? 'Dry run' : 'Applied'}</span>
        <span>{result.created} created</span>
        <span>{result.updated} updated</span>
        <span>{result.skipped} skipped</span>
        <span>{result.errors.length} errors</span>
      </div>
      {result.errors.length > 0 && (
        <div className="mt-2 space-y-1 text-rose-600 dark:text-rose-300">
          {result.errors.slice(0, 4).map(error => (
            <p key={`${error.row}:${error.message}`}>Row {error.row}: {error.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function CustomerBatchPanel({
  tenantId,
  onCustomersUpdated,
}: {
  tenantId?: string | null;
  onCustomersUpdated?: () => void | Promise<void>;
}) {
  const [csv, setCsv] = React.useState(customerSample);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BatchMutationResult | null>(null);
  const [message, setMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const runImport = async (dryRun = false) => {
    if (!tenantId) return;
    setBusy(dryRun ? 'dry-run' : 'import');
    setMessage(null);
    try {
      const next = await importCustomersBatch(tenantId, { csv, dryRun });
      setResult(next);
      setMessage({ tone: next.errors.length ? 'error' : 'success', text: `${next.created + next.updated} customer row${next.created + next.updated === 1 ? '' : 's'} ${dryRun ? 'checked' : 'processed'}.` });
      if (!dryRun) await onCustomersUpdated?.();
    } catch (error: any) {
      setMessage({ tone: 'error', text: error?.message || 'Customer import failed.' });
    } finally {
      setBusy(null);
    }
  };

  const downloadCustomers = async () => {
    if (!tenantId) return;
    setBusy('export');
    setMessage(null);
    try {
      const pack = await exportCustomersBatchCsv(tenantId);
      saveCsvFile(pack.csv, pack.filename, pack.mimeType);
      setMessage({ tone: 'success', text: `${pack.count} customers exported.` });
    } catch (error: any) {
      setMessage({ tone: 'error', text: error?.message || 'Customer export failed.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="text-base font-black">Customer Import / Export</h3>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">All profiles, account fields, wallet balance, loyalty points, and discounts.</p>
        </div>
        <button
          type="button"
          onClick={downloadCustomers}
          disabled={!tenantId || busy === 'export'}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {busy === 'export' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export CSV
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        <textarea
          value={csv}
          onChange={event => setCsv(event.target.value)}
          className="h-36 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs font-semibold text-slate-700 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void runImport(true)}
            disabled={!tenantId || !csv.trim() || Boolean(busy)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
          >
            <RefreshCw className="h-4 w-4" />
            Dry Run
          </button>
          <button
            type="button"
            onClick={() => void runImport(false)}
            disabled={!tenantId || !csv.trim() || Boolean(busy)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
          <CustomerBatchResult result={result} />
        </div>
      </div>
      {message && (
        <div className={`mt-3 rounded-xl border px-3 py-2 text-xs font-bold ${
          message.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300'
            : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300'
        }`}>
          {message.text}
        </div>
      )}
    </section>
  );
}
