import React from 'react';
import { CheckCircle2, Clock3, PackageCheck, Plus, RefreshCw, Truck, XCircle } from 'lucide-react';
import { getDeliveryOrders, ingestDeliveryOrder, updateDeliveryOrderStatus } from '../api';
import type { DeliveryOrder, DeliveryOrderStatus, DeliveryProvider } from '../types';

type DeliveryOrdersViewProps = {
  tenantId?: string | null;
};

const providerLabels: Record<DeliveryProvider, string> = {
  uber_eats: 'Uber Eats',
  mr_d: 'Mr D',
};

const statusTone: Record<DeliveryOrderStatus, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200',
  accepted: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200',
  preparing: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  dispatched: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200',
  completed: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200',
};

function formatDate(value: any) {
  if (!value) return 'No time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function parseItems(text: string) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [name, qty, price] = line.split(',').map(part => part.trim());
      return {
        productName: name || 'Delivery item',
        quantity: Number(qty || 1),
        price: Number(price || 0),
      };
    });
}

export function DeliveryOrdersView({ tenantId }: DeliveryOrdersViewProps) {
  const [orders, setOrders] = React.useState<DeliveryOrder[]>([]);
  const [provider, setProvider] = React.useState<'all' | DeliveryProvider>('all');
  const [status, setStatus] = React.useState<'all' | DeliveryOrderStatus>('all');
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = React.useState({
    provider: 'uber_eats' as DeliveryProvider,
    externalOrderId: '',
    customerName: '',
    customerPhone: '',
    deliveryAddress: '',
    total: '',
    itemsText: 'Burger,1,89.99',
  });

  const loadOrders = React.useCallback(async () => {
    if (!tenantId) {
      setOrders([]);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      setOrders(await getDeliveryOrders(tenantId, {
        provider: provider === 'all' ? null : provider,
        status: status === 'all' ? null : status,
      }));
    } catch (err: any) {
      setMessage({ tone: 'error', text: err?.message || 'Delivery orders could not be loaded.' });
    } finally {
      setLoading(false);
    }
  }, [provider, status, tenantId]);

  React.useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const submitOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId || !form.externalOrderId.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      await ingestDeliveryOrder(tenantId, {
        provider: form.provider,
        externalOrderId: form.externalOrderId.trim(),
        customerName: form.customerName.trim() || null,
        customerPhone: form.customerPhone.trim() || null,
        deliveryAddress: form.deliveryAddress.trim() || null,
        total: Number(form.total || 0),
        status: 'new',
        items: parseItems(form.itemsText),
        rawPayload: { source: 'manual_delivery_intake' },
      });
      setForm(prev => ({ ...prev, externalOrderId: '', customerName: '', customerPhone: '', deliveryAddress: '', total: '' }));
      setMessage({ tone: 'success', text: 'Delivery order ingested.' });
      await loadOrders();
    } catch (err: any) {
      setMessage({ tone: 'error', text: err?.message || 'Delivery order could not be ingested.' });
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (order: DeliveryOrder, nextStatus: DeliveryOrderStatus) => {
    if (!tenantId) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateDeliveryOrderStatus(tenantId, order.id, nextStatus);
      await loadOrders();
    } catch (err: any) {
      setMessage({ tone: 'error', text: err?.message || 'Delivery order status could not be updated.' });
    } finally {
      setSaving(false);
    }
  };

  const activeCount = orders.filter(order => !['completed', 'cancelled'].includes(order.status)).length;
  const readyCount = orders.filter(order => order.status === 'ready').length;
  const totalValue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950 lg:p-10">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                <Truck className="h-4 w-4" />
                Delivery Channels
              </div>
              <h2 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Incoming Orders</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{activeCount} active orders</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={provider}
                onChange={event => setProvider(event.target.value as any)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="all">All providers</option>
                <option value="uber_eats">Uber Eats</option>
                <option value="mr_d">Mr D</option>
              </select>
              <select
                value={status}
                onChange={event => setStatus(event.target.value as any)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="all">All statuses</option>
                {(['new', 'accepted', 'preparing', 'ready', 'dispatched', 'completed', 'cancelled'] as DeliveryOrderStatus[]).map(value => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadOrders()}
                disabled={loading || !tenantId}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {message && (
            <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${
              message.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'
            }`}>
              {message.text}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Active</div>
              <div className="mt-1 text-3xl font-black text-slate-900 dark:text-white">{activeCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Ready</div>
              <div className="mt-1 text-3xl font-black text-emerald-600 dark:text-emerald-400">{readyCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Value</div>
              <div className="mt-1 text-3xl font-black text-slate-900 dark:text-white">R{totalValue.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <form onSubmit={submitOrder} className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
            <Plus className="h-4 w-4" />
            Manual Intake
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <select
              value={form.provider}
              onChange={event => setForm(prev => ({ ...prev, provider: event.target.value as DeliveryProvider }))}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            >
              <option value="uber_eats">Uber Eats</option>
              <option value="mr_d">Mr D</option>
            </select>
            <input
              value={form.externalOrderId}
              onChange={event => setForm(prev => ({ ...prev, externalOrderId: event.target.value }))}
              placeholder="External order ID"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
            <input
              value={form.total}
              onChange={event => setForm(prev => ({ ...prev, total: event.target.value }))}
              inputMode="decimal"
              placeholder="Total"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
            <input
              value={form.customerName}
              onChange={event => setForm(prev => ({ ...prev, customerName: event.target.value }))}
              placeholder="Customer"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
            <input
              value={form.customerPhone}
              onChange={event => setForm(prev => ({ ...prev, customerPhone: event.target.value }))}
              placeholder="Phone"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
            <input
              value={form.deliveryAddress}
              onChange={event => setForm(prev => ({ ...prev, deliveryAddress: event.target.value }))}
              placeholder="Address"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
            <textarea
              value={form.itemsText}
              onChange={event => setForm(prev => ({ ...prev, itemsText: event.target.value }))}
              rows={3}
              placeholder="Item,qty,price"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
            <button
              type="submit"
              disabled={saving || !form.externalOrderId.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-black text-white shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Ingest
            </button>
          </div>
        </form>

        <div className="grid gap-4 xl:grid-cols-2">
          {orders.map(order => (
            <div key={order.id} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-widest text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      {providerLabels[order.provider] || order.provider}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${statusTone[order.status]}`}>
                      {order.status}
                    </span>
                  </div>
                  <h3 className="mt-3 truncate text-2xl font-black text-slate-900 dark:text-white">#{order.externalOrderId}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{order.customerName || 'Walk-in'} {order.customerPhone ? `- ${order.customerPhone}` : ''}</p>
                  {order.deliveryAddress && <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-300">{order.deliveryAddress}</p>}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-slate-900 dark:text-white">R{order.total.toFixed(2)}</div>
                  <div className="mt-1 text-xs font-bold text-slate-400">{formatDate(order.placedAt || order.createdAt)}</div>
                </div>
              </div>

              <div className="mt-5 divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4 dark:divide-slate-800 dark:bg-slate-950">
                {order.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-800 dark:text-slate-100">{item.productName}</div>
                      {item.note && <div className="truncate text-xs font-bold text-slate-500">{item.note}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-slate-900 dark:text-white">x{item.quantity}</div>
                      <div className="text-xs font-bold text-slate-500">R{item.price.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
                {order.items.length === 0 && (
                  <div className="py-6 text-center text-sm font-bold text-slate-400">No items.</div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void changeStatus(order, 'accepted')}
                  disabled={saving || order.status !== 'new'}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40"
                >
                  <Clock3 className="h-4 w-4" />
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => void changeStatus(order, 'preparing')}
                  disabled={saving || !['new', 'accepted'].includes(order.status)}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40"
                >
                  <PackageCheck className="h-4 w-4" />
                  Preparing
                </button>
                <button
                  type="button"
                  onClick={() => void changeStatus(order, 'ready')}
                  disabled={saving || !['accepted', 'preparing'].includes(order.status)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Ready
                </button>
                <button
                  type="button"
                  onClick={() => void changeStatus(order, 'completed')}
                  disabled={saving || !['ready', 'dispatched'].includes(order.status)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => void changeStatus(order, 'cancelled')}
                  disabled={saving || ['completed', 'cancelled'].includes(order.status)}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          ))}
          {!loading && orders.length === 0 && (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              No delivery orders.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
