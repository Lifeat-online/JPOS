import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Check, MapPin, Plus, RefreshCw, Save, Warehouse } from 'lucide-react';
import {
  completeStockTransfer,
  createInventoryLocation,
  createStockTransfer,
  getInventoryLocations,
  getProductLocationStocks,
  getStockTransfers,
  updateProductLocationStock,
} from '../api';
import { InventoryLocation, Product, ProductLocationStock, StockTransferOrder } from '../types';
import { usePosStore } from '../store/usePosStore';

type Message = { tone: 'success' | 'error'; text: string } | null;

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function locationLabel(location?: InventoryLocation | null) {
  if (!location) return 'Location';
  return `${location.name} (${location.type})`;
}

export function InventoryLocationsView({ products, onProductsUpdated }: { products: Product[]; onProductsUpdated?: () => void }) {
  const tenantId = usePosStore(state => state.tenantId);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [stocks, setStocks] = useState<ProductLocationStock[]>([]);
  const [transfers, setTransfers] = useState<StockTransferOrder[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('main');
  const [newLocation, setNewLocation] = useState({ name: '', type: 'branch' as InventoryLocation['type'] });
  const [stockDrafts, setStockDrafts] = useState<Record<string, { quantity: number; minStock: number; reorderThreshold: number }>>({});
  const [transferDraft, setTransferDraft] = useState({ fromLocationId: 'main', toLocationId: '', productId: '', quantity: 1, notes: '' });
  const [message, setMessage] = useState<Message>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const selectedLocation = locations.find(location => location.id === selectedLocationId) || locations[0] || null;
  const availableDestinations = locations.filter(location => location.id !== transferDraft.fromLocationId && location.status !== 'inactive');
  const activeTransfers = transfers.filter(transfer => transfer.status !== 'completed' && transfer.status !== 'cancelled');

  const totals = useMemo(() => ({
    quantity: stocks.reduce((sum, stock) => sum + number(stock.quantity), 0),
    low: stocks.filter(stock => stock.isLowStock).length,
    locations: locations.length,
  }), [stocks, locations]);

  const load = async (locationId = selectedLocationId) => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [locationRows, stockRows, transferRows] = await Promise.all([
        getInventoryLocations(tenantId),
        getProductLocationStocks(tenantId, { locationId }),
        getStockTransfers(tenantId),
      ]);
      setLocations(locationRows);
      const nextLocationId = locationRows.some(location => location.id === locationId)
        ? locationId
        : (locationRows.find(location => location.isDefault)?.id || locationRows[0]?.id || 'main');
      setSelectedLocationId(nextLocationId);
      setStocks(nextLocationId === locationId ? stockRows : await getProductLocationStocks(tenantId, { locationId: nextLocationId }));
      setTransfers(transferRows);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load location inventory.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('main');
  }, [tenantId]);

  useEffect(() => {
    const next: Record<string, { quantity: number; minStock: number; reorderThreshold: number }> = {};
    for (const stock of stocks) {
      next[stock.productId] = {
        quantity: number(stock.quantity),
        minStock: number(stock.minStock),
        reorderThreshold: number(stock.reorderThreshold),
      };
    }
    setStockDrafts(next);
  }, [stocks]);

  const selectLocation = async (locationId: string) => {
    setSelectedLocationId(locationId);
    if (!tenantId) return;
    setLoading(true);
    try {
      setStocks(await getProductLocationStocks(tenantId, { locationId }));
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load this location.' });
    } finally {
      setLoading(false);
    }
  };

  const addLocation = async () => {
    if (!tenantId || !newLocation.name.trim()) return;
    setBusyId('new-location');
    setMessage(null);
    try {
      const created = await createInventoryLocation(tenantId, {
        name: newLocation.name.trim(),
        type: newLocation.type,
        status: 'active',
      });
      setNewLocation({ name: '', type: 'branch' });
      setMessage({ tone: 'success', text: 'Inventory location created.' });
      await load(created?.id || selectedLocationId);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not create location.' });
    } finally {
      setBusyId(null);
    }
  };

  const saveStock = async (stock: ProductLocationStock) => {
    if (!tenantId) return;
    const draft = stockDrafts[stock.productId];
    if (!draft) return;
    setBusyId(`stock-${stock.productId}`);
    setMessage(null);
    try {
      await updateProductLocationStock(tenantId, {
        productId: stock.productId,
        locationId: stock.locationId,
        quantity: draft.quantity,
        minStock: draft.minStock,
        reorderThreshold: draft.reorderThreshold,
        note: `Updated from ${locationLabel(selectedLocation)}`,
      });
      setMessage({ tone: 'success', text: 'Location stock updated.' });
      await load(selectedLocationId);
      onProductsUpdated?.();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not update stock.' });
    } finally {
      setBusyId(null);
    }
  };

  const submitTransfer = async () => {
    if (!tenantId || !transferDraft.productId || !transferDraft.toLocationId) return;
    const product = products.find(item => item.id === transferDraft.productId);
    setBusyId('transfer');
    setMessage(null);
    try {
      await createStockTransfer(tenantId, {
        fromLocationId: transferDraft.fromLocationId,
        toLocationId: transferDraft.toLocationId,
        notes: transferDraft.notes.trim() || null,
        items: [{
          productId: transferDraft.productId,
          productName: product?.name,
          quantity: Math.max(1, number(transferDraft.quantity)),
        }],
      });
      setTransferDraft(prev => ({ ...prev, productId: '', quantity: 1, notes: '' }));
      setMessage({ tone: 'success', text: 'Transfer order created.' });
      await load(selectedLocationId);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not create transfer.' });
    } finally {
      setBusyId(null);
    }
  };

  const completeTransfer = async (transfer: StockTransferOrder) => {
    if (!tenantId) return;
    setBusyId(`transfer-${transfer.id}`);
    setMessage(null);
    try {
      await completeStockTransfer(tenantId, transfer.id);
      setMessage({ tone: 'success', text: 'Transfer completed and location stock moved.' });
      await load(selectedLocationId);
      onProductsUpdated?.();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not complete transfer.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Locations</h2>
            </div>
            <button
              type="button"
              onClick={() => load(selectedLocationId)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Locations</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">{totals.locations}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selected Qty</div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">{totals.quantity}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Low Stock</div>
              <div className="text-2xl font-black text-amber-600">{totals.low}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {locations.map(location => (
              <button
                key={location.id}
                type="button"
                onClick={() => selectLocation(location.id)}
                className={`rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-widest transition ${
                  selectedLocationId === location.id
                    ? 'border-primary bg-primary text-white'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                {location.name}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_150px_auto]">
            <input
              value={newLocation.name}
              onChange={event => setNewLocation(prev => ({ ...prev, name: event.target.value }))}
              placeholder="Branch or warehouse name"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <select
              value={newLocation.type}
              onChange={event => setNewLocation(prev => ({ ...prev, type: event.target.value as InventoryLocation['type'] }))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="branch">Branch</option>
              <option value="warehouse">Warehouse</option>
              <option value="register">Register</option>
              <option value="kitchen">Kitchen</option>
              <option value="other">Other</option>
            </select>
            <button
              type="button"
              onClick={addLocation}
              disabled={!newLocation.name.trim() || busyId === 'new-location'}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Transfers</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              value={transferDraft.fromLocationId}
              onChange={event => setTransferDraft(prev => ({ ...prev, fromLocationId: event.target.value, toLocationId: '' }))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            <select
              value={transferDraft.toLocationId}
              onChange={event => setTransferDraft(prev => ({ ...prev, toLocationId: event.target.value }))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="">Destination</option>
              {availableDestinations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            <select
              value={transferDraft.productId}
              onChange={event => setTransferDraft(prev => ({ ...prev, productId: event.target.value }))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="">Product</option>
              {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
            <input
              type="number"
              min={1}
              value={transferDraft.quantity}
              onChange={event => setTransferDraft(prev => ({ ...prev, quantity: Math.max(1, Number(event.target.value) || 1) }))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <input
            value={transferDraft.notes}
            onChange={event => setTransferDraft(prev => ({ ...prev, notes: event.target.value }))}
            placeholder="Transfer note"
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <button
            type="button"
            onClick={submitTransfer}
            disabled={!transferDraft.productId || !transferDraft.toLocationId || busyId === 'transfer'}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            <ArrowRightLeft className="h-4 w-4" />
            Create Transfer
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
        <div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr_auto] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-950">
          <span>{selectedLocation?.name || 'Location'} Stock</span>
          <span>Quantity</span>
          <span>Min</span>
          <span>Reorder</span>
          <span className="text-right">Save</span>
        </div>
        {stocks.map(stock => {
          const draft = stockDrafts[stock.productId] || { quantity: stock.quantity, minStock: stock.minStock, reorderThreshold: stock.reorderThreshold };
          return (
            <div key={`${stock.productId}:${stock.locationId}`} className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 dark:border-slate-800">
              <div className="min-w-0">
                <div className="truncate font-black text-slate-900 dark:text-white">{stock.productName}</div>
                <div className="truncate text-xs font-bold text-slate-500">{stock.category || stock.section || 'Uncategorised'}</div>
              </div>
              {(['quantity', 'minStock', 'reorderThreshold'] as const).map(field => (
                <input
                  key={field}
                  type="number"
                  min={0}
                  value={draft[field]}
                  onChange={event => setStockDrafts(prev => ({
                    ...prev,
                    [stock.productId]: {
                      ...draft,
                      [field]: Math.max(0, Number(event.target.value) || 0),
                    },
                  }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              ))}
              <button
                type="button"
                onClick={() => saveStock(stock)}
                disabled={busyId === `stock-${stock.productId}`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                title="Save location stock"
              >
                <Save className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Open Transfer Orders</h2>
        </div>
        {activeTransfers.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500 dark:bg-slate-950">No open transfers.</div>
        ) : (
          <div className="space-y-3">
            {activeTransfers.map(transfer => (
              <div key={transfer.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="font-black text-slate-900 dark:text-white">
                    {transfer.fromLocationName || transfer.fromLocationId} to {transfer.toLocationName || transfer.toLocationId}
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-500">
                    {transfer.items.map(item => `${item.productName} x ${item.quantity}`).join(', ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => completeTransfer(transfer)}
                  disabled={busyId === `transfer-${transfer.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Complete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
