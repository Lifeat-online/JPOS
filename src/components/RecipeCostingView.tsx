import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Download, RefreshCw, TrendingUp } from 'lucide-react';
import { getRecipeCostingReport } from '../api';
import { RecipeCostingProductRow, RecipeCostingReport } from '../types';
import { usePosStore } from '../store/usePosStore';

function money(value: unknown) {
  const parsed = Number(value);
  return `R${Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00'}`;
}

function marginClass(value: number) {
  if (value < 20) return 'bg-red-50 text-red-700 border-red-100';
  if (value < 30) return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-emerald-50 text-emerald-700 border-emerald-100';
}

export function RecipeCostingView() {
  const tenantId = usePosStore(state => state.tenantId);
  const [report, setReport] = useState<RecipeCostingReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rows = useMemo<RecipeCostingProductRow[]>(() => report?.rows || [], [report]);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setMessage(null);
    try {
      setReport(await getRecipeCostingReport(tenantId));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not load recipe costing.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tenantId]);

  const downloadCsv = () => {
    if (!report?.csv) return;
    const blob = new Blob([report.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recipe-costing-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Calculator className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-black">Recipe Costing</h2>
          </div>
          <div className="mt-3 grid gap-2 text-sm font-bold text-slate-500 sm:grid-cols-3">
            <span>{report?.summary.recipeProductCount || 0} recipes</span>
            <span>{report?.summary.substitutionGroupCount || 0} substitutions</span>
            <span>{report?.summary.lowMarginCount || 0} low margin</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={!report?.csv}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Products</p>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{report?.summary.productCount || 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg margin</p>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{(report?.summary.avgGrossMarginPercent || 0).toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sub groups</p>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{report?.summary.substitutionGroupCount || 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Optional</p>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{report?.summary.optionalIngredientCount || 0}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_0.8fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-950">
          <span>Product</span>
          <span>Sell</span>
          <span>Recipe</span>
          <span>Unit cost</span>
          <span>Profit</span>
          <span>Margin</span>
          <span>Recipe flags</span>
        </div>

        {loading && rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm font-bold text-slate-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm font-bold text-slate-500">No recipe costing rows.</div>
        ) : rows.map(row => (
          <div
            key={row.productId}
            className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_0.8fr] items-center gap-3 border-b border-slate-100 px-4 py-4 text-sm last:border-b-0 dark:border-slate-800"
          >
            <div className="min-w-0">
              <div className="truncate font-black text-slate-900 dark:text-white">{row.productName}</div>
              <div className="mt-1 truncate text-xs font-bold text-slate-500">
                {row.section || 'No section'} / {row.category || 'No category'}
              </div>
            </div>
            <span className="font-bold text-slate-700 dark:text-slate-300">{money(row.sellingPrice)}</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">{money(row.recipeCost)}</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">{money(row.expectedUnitCost)}</span>
            <span className="font-black text-slate-900 dark:text-white">{money(row.grossProfit)}</span>
            <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${marginClass(row.grossMarginPercent)}`}>
              <TrendingUp className="h-3 w-3" />
              {row.grossMarginPercent.toFixed(1)}%
            </span>
            <span className="text-xs font-bold text-slate-500">
              {row.ingredientCount} lines / {row.substituteGroupCount} subs / {row.optionalCount} optional
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
