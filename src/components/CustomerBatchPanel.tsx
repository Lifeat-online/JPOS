import React from 'react';
import { Download, RefreshCw, Users } from 'lucide-react';
import { exportCustomersBatchCsv, importCustomersBatch } from '../api';
import { CsvImportCard, saveCsvFile } from './CsvImportCard';
import { customerTemplateCsv } from '../utils/csvTemplates';

export function CustomerBatchPanel({
  tenantId,
  onCustomersUpdated,
}: {
  tenantId?: string | null;
  onCustomersUpdated?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);

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

      <div className="mt-4">
        <CsvImportCard
          title="Import customers"
          templateFilename="customers-template.csv"
          templateCsv={customerTemplateCsv}
          disabled={!tenantId}
          onPreview={csv => importCustomersBatch(tenantId!, { csv, dryRun: true })}
          onImport={csv => importCustomersBatch(tenantId!, { csv })}
          onImported={() => onCustomersUpdated?.()}
        />
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
