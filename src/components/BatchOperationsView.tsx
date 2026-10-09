import React from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { batchCreateProducts, batchUpdateProductPrices, exportInventoryBatchCsv, importInventoryBatch } from '../api';
import type { BatchMutationResult } from '../types';
import { usePosStore } from '../store/usePosStore';
import { CsvImportCard, saveCsvFile } from './CsvImportCard';
import { inventoryTemplateCsv, priceTemplateCsv, productTemplateCsv } from '../utils/csvTemplates';

export function BatchOperationsView({ onProductsUpdated }: { onProductsUpdated?: () => Promise<void> | void }) {
  const tenantId = usePosStore(state => state.tenantId);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);

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
        <CsvImportCard
          title="Create Products"
          description="Add new products from a spreadsheet."
          templateFilename="products-template.csv"
          templateCsv={productTemplateCsv}
          disabled={!tenantId}
          onPreview={csv => batchCreateProducts(tenantId!, { csv, dryRun: true })}
          onImport={csv => batchCreateProducts(tenantId!, { csv })}
          onImported={() => onProductsUpdated?.()}
        />
        <CsvImportCard
          title="Update Prices"
          description="Change prices and costs, matched by barcode."
          templateFilename="price-update-template.csv"
          templateCsv={priceTemplateCsv}
          disabled={!tenantId}
          onPreview={csv => batchUpdateProductPrices(tenantId!, { csv, dryRun: true })}
          onImport={csv => batchUpdateProductPrices(tenantId!, { csv })}
          onImported={() => onProductsUpdated?.()}
        />
        <CsvImportCard
          title="Import Inventory"
          description="Set stock levels per location, matched by barcode."
          templateFilename="inventory-template.csv"
          templateCsv={inventoryTemplateCsv}
          disabled={!tenantId}
          onPreview={csv => importInventoryBatch(tenantId!, { csv, dryRun: true })}
          onImport={csv => importInventoryBatch(tenantId!, { csv })}
          onImported={() => onProductsUpdated?.()}
        />
      </div>
    </div>
  );
}
