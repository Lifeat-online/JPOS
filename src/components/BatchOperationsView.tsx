import React from 'react';
import { BadgeDollarSign, Download, PackagePlus, RefreshCw, Warehouse } from 'lucide-react';
import { batchCreateProducts, batchUpdateProductPrices, exportInventoryBatchCsv, importInventoryBatch } from '../api';
import type { BatchMutationResult } from '../types';
import { usePosStore } from '../store/usePosStore';

const productSample = `name,price,costPrice,category,section,stock,minStock,barcode
Chocolate Muffin,32,14,Bakery,Food,24,6,BAK-001`;

const priceSample = `barcode,price,costPrice
BAK-001,35,15`;

const inventorySample = `barcode,locationId,quantity,minStock,reorderThreshold
BAK-001,main,36,8,10`;

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

function ResultSummary({ result }: { result: BatchMutationResult | null }) {
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

function BatchCard({
  title,
  icon: Icon,
  csv,
  setCsv,
  busy,
  result,
  onDryRun,
  onApply,
}: {
  title: string;
  icon: React.ElementType;
  csv: string;
  setCsv: (value: string) => void;
  busy: boolean;
  result: BatchMutationResult | null;
  onDryRun: () => void;
  onApply: () => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-black text-slate-900 dark:text-white">{title}</h3>
        </div>
        {busy && <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />}
      </div>
      <textarea
        value={csv}
        onChange={event => setCsv(event.target.value)}
        className="h-32 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs font-semibold text-slate-700 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onDryRun}
          disabled={busy || !csv.trim()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
        >
          Dry Run
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={busy || !csv.trim()}
          className="rounded-lg bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
        >
          Import
        </button>
      </div>
      <div className="mt-3">
        <ResultSummary result={result} />
      </div>
    </section>
  );
}

export function BatchOperationsView({ onProductsUpdated }: { onProductsUpdated?: () => Promise<void> | void }) {
  const tenantId = usePosStore(state => state.tenantId);
  const [productCsv, setProductCsv] = React.useState(productSample);
  const [priceCsv, setPriceCsv] = React.useState(priceSample);
  const [inventoryCsv, setInventoryCsv] = React.useState(inventorySample);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [productResult, setProductResult] = React.useState<BatchMutationResult | null>(null);
  const [priceResult, setPriceResult] = React.useState<BatchMutationResult | null>(null);
  const [inventoryResult, setInventoryResult] = React.useState<BatchMutationResult | null>(null);

  const run = async (
    key: string,
    action: () => Promise<BatchMutationResult>,
    setResult: (result: BatchMutationResult) => void,
  ) => {
    if (!tenantId) return;
    setBusy(key);
    setMessage(null);
    try {
      const result = await action();
      setResult(result);
      setMessage({ tone: result.errors.length ? 'error' : 'success', text: `${result.created + result.updated} row${result.created + result.updated === 1 ? '' : 's'} ${result.dryRun ? 'checked' : 'processed'}.` });
      if (!result.dryRun) await onProductsUpdated?.();
    } catch (error: any) {
      setMessage({ tone: 'error', text: error?.message || 'Batch operation failed.' });
    } finally {
      setBusy(null);
    }
  };

  const downloadInventory = async () => {
    if (!tenantId) return;
    setBusy('inventory-export');
    setMessage(null);
    try {
      const pack = await exportInventoryBatchCsv(tenantId);
      saveCsvFile(pack.csv, pack.filename, pack.mimeType);
      setMessage({ tone: 'success', text: `${pack.count} inventory rows exported.` });
    } catch (error: any) {
      setMessage({ tone: 'error', text: error?.message || 'Inventory export failed.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">Batch Operations</h2>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">Products, prices, and inventory stock.</p>
        </div>
        <button
          type="button"
          onClick={downloadInventory}
          disabled={busy === 'inventory-export' || !tenantId}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
        >
          {busy === 'inventory-export' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Inventory
        </button>
      </div>

      {message && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-bold ${
          message.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300'
            : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <BatchCard
          title="Create Products"
          icon={PackagePlus}
          csv={productCsv}
          setCsv={setProductCsv}
          busy={busy === 'products'}
          result={productResult}
          onDryRun={() => void run('products', () => batchCreateProducts(tenantId!, { csv: productCsv, dryRun: true }), setProductResult)}
          onApply={() => void run('products', () => batchCreateProducts(tenantId!, { csv: productCsv }), setProductResult)}
        />
        <BatchCard
          title="Update Prices"
          icon={BadgeDollarSign}
          csv={priceCsv}
          setCsv={setPriceCsv}
          busy={busy === 'prices'}
          result={priceResult}
          onDryRun={() => void run('prices', () => batchUpdateProductPrices(tenantId!, { csv: priceCsv, dryRun: true }), setPriceResult)}
          onApply={() => void run('prices', () => batchUpdateProductPrices(tenantId!, { csv: priceCsv }), setPriceResult)}
        />
        <BatchCard
          title="Import Inventory"
          icon={Warehouse}
          csv={inventoryCsv}
          setCsv={setInventoryCsv}
          busy={busy === 'inventory'}
          result={inventoryResult}
          onDryRun={() => void run('inventory', () => importInventoryBatch(tenantId!, { csv: inventoryCsv, dryRun: true }), setInventoryResult)}
          onApply={() => void run('inventory', () => importInventoryBatch(tenantId!, { csv: inventoryCsv }), setInventoryResult)}
        />
      </div>
    </div>
  );
}
