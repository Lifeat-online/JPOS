import React, { useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, ShoppingCart, X } from 'lucide-react';
import { approveReorderRecommendation, apiGet, dismissReorderRecommendation, getReorderRecommendations, refreshReorderRecommendations } from '../api';
import { ReorderRecommendation, Vendor } from '../types';
import { usePosStore } from '../store/usePosStore';

type Message = { tone: 'success' | 'error'; text: string } | null;

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return `R${number(value).toFixed(2)}`;
}

function priorityClass(priority: ReorderRecommendation['priority']) {
  if (priority === 'critical') return 'bg-red-50 text-red-700 border-red-100';
  if (priority === 'high') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-slate-50 text-slate-600 border-slate-100';
}

export function ReorderRecommendationsView() {
  const tenantId = usePosStore(state => state.tenantId);
  const [recommendations, setRecommendations] = useState<ReorderRecommendation[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [daysOfCover, setDaysOfCover] = useState(14);
  const [vendorId, setVendorId] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeRecommendations = useMemo(
    () => recommendations.filter(item => item.status === 'open' || item.status === 'in_review' || item.status === 'approved'),
    [recommendations]
  );

  const totals = useMemo(() => ({
    quantity: activeRecommendations.reduce((sum, item) => sum + number(item.recommendedQuantity), 0),
    cost: activeRecommendations.reduce((sum, item) => sum + number(item.estimatedTotalCost), 0),
    critical: activeRecommendations.filter(item => item.priority === 'critical').length,
  }), [activeRecommendations]);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [rows, vendorRows] = await Promise.all([
        getReorderRecommendations(tenantId),
        apiGet<Vendor[]>(`/api/mariadb/tenants/${tenantId}/vendors`),
      ]);
      setRecommendations(rows);
      setVendors(vendorRows.filter(vendor => vendor.status !== 'inactive'));
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load reorder recommendations.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tenantId]);

  const refresh = async () => {
    if (!tenantId) return;
    setLoading(true);
    setMessage(null);
    try {
      const result = await refreshReorderRecommendations(tenantId, {
        daysOfCover,
        vendorId: vendorId || null,
      });
      setRecommendations(result.recommendations);
      setMessage({ tone: 'success', text: `${result.created} created, ${result.updated} updated.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not refresh reorder recommendations.' });
    } finally {
      setLoading(false);
    }
  };

  const approve = async (item: ReorderRecommendation) => {
    if (!tenantId) return;
    setBusyId(item.id);
    setMessage(null);
    try {
      const result = await approveReorderRecommendation(tenantId, item.id, {
        vendorId: vendorId || item.vendorId || null,
        quantity: item.recommendedQuantity,
        expectedPrice: item.estimatedUnitCost,
        note: 'Approved from reorder recommendations',
      });
      setMessage({ tone: 'success', text: result.alreadyOrdered ? 'Purchase order already exists.' : 'Draft purchase order created.' });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not approve reorder recommendation.' });
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (item: ReorderRecommendation) => {
    if (!tenantId) return;
    setBusyId(item.id);
    setMessage(null);
    try {
      await dismissReorderRecommendation(tenantId, item.id, 'Dismissed from reorder recommendations');
      setMessage({ tone: 'success', text: 'Recommendation dismissed.' });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not dismiss reorder recommendation.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-black">Reorder Queue</h2>
          </div>
          <div className="mt-3 grid gap-2 text-sm font-bold text-slate-500 sm:grid-cols-3">
            <span>{activeRecommendations.length} active</span>
            <span>{totals.quantity} units</span>
            <span>{money(totals.cost)} estimate</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
            Cover
            <input
              type="number"
              min={1}
              max={120}
              value={daysOfCover}
              onChange={event => setDaysOfCover(Math.max(1, Number(event.target.value) || 14))}
              className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>
          <select
            value={vendorId}
            onChange={event => setVendorId(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">No vendor</option>
            {vendors.map(vendor => (
              <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${
          message.tone === 'success'
            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
            : 'border-red-100 bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr_1fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-950">
          <span>Product</span>
          <span>Stock</span>
          <span>Target</span>
          <span>Order</span>
          <span>Estimate</span>
          <span>Priority</span>
          <span className="text-right">Actions</span>
        </div>

        {loading && activeRecommendations.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm font-bold text-slate-500">Loading...</div>
        ) : activeRecommendations.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm font-bold text-slate-500">No active reorder recommendations.</div>
        ) : (
          activeRecommendations.map(item => (
            <div
              key={item.id}
              className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr_1fr] items-center gap-3 border-b border-slate-100 px-4 py-4 text-sm last:border-b-0 dark:border-slate-800"
            >
              <div className="min-w-0">
                <div className="truncate font-black text-slate-900 dark:text-white">{item.productName}</div>
                <div className="mt-1 truncate text-xs font-bold text-slate-500">
                  {item.avgDailySales ? `${item.avgDailySales.toFixed(2)} daily avg` : 'No velocity'}
                </div>
              </div>
              <span className="font-bold text-slate-700 dark:text-slate-300">{item.currentStock} / {item.minStock}</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">{item.targetStock}</span>
              <span className="font-black text-slate-900 dark:text-white">{item.recommendedQuantity}</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">{money(item.estimatedTotalCost)}</span>
              <span className={`w-fit rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${priorityClass(item.priority)}`}>
                {item.priority}
              </span>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => approve(item)}
                  disabled={busyId === item.id}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  title="Approve reorder"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(item)}
                  disabled={busyId === item.id}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  title="Dismiss reorder"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
