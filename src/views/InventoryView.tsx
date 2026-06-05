import React, { useState, useMemo } from 'react';
import { Search, Plus, Minus, Package, ShieldCheck, Banknote, ChevronRight, ChevronDown, Edit, ClipboardCheck, X, Download, RefreshCw, KeyRound, Webhook, Trash2, Copy } from 'lucide-react';
import { Product, AppConfig, EcommerceMarketplaceExport, IntegrationApiKey, IntegrationWebhookEvent } from '../types';
import { VendorManagementView } from '../components/VendorManagementView';
import { PurchaseOrdersView } from '../components/PurchaseOrdersView';
import { createIntegrationApiKey, exportEcommerceMarketplacePack, getIntegrationApiKeys, getIntegrationWebhookEvents, requestStockAdjustment, revokeIntegrationApiKey } from '../api';
import { usePosStore } from '../store/usePosStore';
import { BulkInventoryView } from '../components/BulkInventoryView';
import { InventoryAgentView } from '../components/InventoryAgentView';
import { StockBatchesView } from '../components/StockBatchesView';
import { ReorderRecommendationsView } from '../components/ReorderRecommendationsView';
import { RecipeCostingView } from '../components/RecipeCostingView';
import { InventoryLocationsView } from '../components/InventoryLocationsView';
import { StockTakeView } from './StockTakeView';

interface InventoryViewProps {
  products: Product[];
  config: AppConfig;
  onEditProduct: (product: Partial<Product>) => void;
  onAddProduct: () => void;
  onProductsUpdated?: () => void;
}

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

function formatChannelDate(value: any) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products, config, onEditProduct, onAddProduct, onProductsUpdated,
}) => {
  const tenantId = usePosStore(state => state.tenantId);
  const currentUserStaff = usePosStore(state => state.currentUserStaff);
  const [tab, setTab] = useState<'products' | 'channels' | 'vendors' | 'purchaseOrders' | 'bulk' | 'copilot' | 'stocktake' | 'batches' | 'reorder' | 'recipeCosting' | 'locations'>(() => {
    const queryTab = new URLSearchParams(window.location.search).get('tab');
    return queryTab === 'stocktake' ? 'stocktake' : queryTab === 'locations' ? 'locations' : queryTab === 'recipeCosting' ? 'recipeCosting' : queryTab === 'channels' ? 'channels' : 'products';
  });
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('All');
  const [category, setCategory] = useState('All');
  const [subCategory, setSubCategory] = useState('All');
  const [adjustModal, setAdjustModal] = useState<{ product: Product; delta: number } | null>(null);
  const [adjustReason, setAdjustReason] = useState('Stock count correction');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustMessage, setAdjustMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [marketplacePack, setMarketplacePack] = useState<EcommerceMarketplaceExport | null>(null);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [marketplaceIncludeInactive, setMarketplaceIncludeInactive] = useState(false);
  const [integrationKeys, setIntegrationKeys] = useState<IntegrationApiKey[]>([]);
  const [integrationEvents, setIntegrationEvents] = useState<IntegrationWebhookEvent[]>([]);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [integrationKeyName, setIntegrationKeyName] = useState('ERP stock sync');
  const [generatedIntegrationSecret, setGeneratedIntegrationSecret] = useState<string | null>(null);
  const [creatingIntegrationKey, setCreatingIntegrationKey] = useState(false);

  const categoryTree = config?.categories || {};
  const SECTIONS = Object.keys(categoryTree);
  const CATEGORY_MAP = SECTIONS.reduce((acc, sec) => {
    acc[sec] = Object.keys(categoryTree[sec]);
    return acc;
  }, {} as Record<string, string[]>);
  const SUB_CATEGORY_MAP = SECTIONS.reduce((acc, sec) => {
    Object.keys(categoryTree[sec]).forEach(cat => {
      acc[cat] = categoryTree[sec][cat] || [];
    });
    return acc;
  }, {} as Record<string, string[]>);

  const filteredInventory = useMemo(() => {
    return products.filter(p => {
      const matchesSection = section === 'All' || p.section === section;
      const matchesCategory = category === 'All' || p.category === category;
      const matchesSubCategory = subCategory === 'All' || p.subCategory === subCategory;
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode && p.barcode.includes(search));
      return matchesSection && matchesCategory && matchesSubCategory && matchesSearch;
    });
  }, [products, section, category, subCategory, search]);

  const stats = useMemo(() => ({
    totalItems: products.reduce((sum, p) => sum + p.stock, 0),
    totalValue: products.reduce((sum, p) => sum + p.price * p.stock, 0),
    lowStockItems: products.filter(p => p.stock <= (p.minStock || 10)).length,
  }), [products]);

  const canApplyStockDirectly = ['admin', 'manager', 'dev'].includes(currentUserStaff?.role || '');
  const stockAdjustmentReasons = [
    'Stock count correction',
    'Damaged or expired stock',
    'Supplier delivery correction',
    'Theft or shrinkage',
    'Returned to shelf',
    'Other',
  ];

  const openStockAdjustment = (product: Product, delta: number) => {
    if (delta < 0 && Number(product.stock || 0) <= 0) {
      setAdjustMessage({ tone: 'error', text: `${product.name} is already at zero stock.` });
      return;
    }
    setAdjustModal({ product, delta });
    setAdjustReason(delta > 0 ? 'Stock count correction' : 'Damaged or expired stock');
    setAdjustNote('');
    setAdjustMessage(null);
  };

  const submitStockAdjustment = async () => {
    if (!tenantId || !adjustModal) return;
    const reason = adjustReason.trim();
    if (reason.length < 3) {
      setAdjustMessage({ tone: 'error', text: 'Choose or enter a reason before sending this stock change.' });
      return;
    }

    setIsAdjusting(true);
    try {
      const response = await requestStockAdjustment(tenantId, adjustModal.product.id, {
        delta: adjustModal.delta,
        reason,
        note: adjustNote.trim() || null,
        productName: adjustModal.product.name,
        staffId: currentUserStaff?.id || null,
        staffName: currentUserStaff?.name || null,
      });
      setAdjustModal(null);
      setAdjustMessage({
        tone: 'success',
        text: response?.approvalRequired
          ? 'Stock adjustment request sent to the manager Action Center.'
          : 'Stock adjusted and logged.',
      });
      onProductsUpdated?.();
    } catch (err) {
      console.error('Failed to adjust stock:', err);
      setAdjustMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Stock adjustment failed.',
      });
    } finally {
      setIsAdjusting(false);
    }
  };

  const getProductImage = (product: Partial<Product>) => {
    if (product.imageUrl) return product.imageUrl;
    return `https://placehold.co/600x600/1e293b/f8fafc?text=${encodeURIComponent(product.name || 'Product')}%0A${encodeURIComponent(product.category || 'Category')}`;
  };

  const adjustmentPreview = adjustModal
    ? {
        current: Number(adjustModal.product.stock || 0),
        next: Math.max(0, Number(adjustModal.product.stock || 0) + adjustModal.delta),
        absoluteDelta: Math.abs(adjustModal.delta),
        direction: adjustModal.delta > 0 ? 'increase' : 'decrease',
      }
    : null;

  const loadMarketplacePack = React.useCallback(async () => {
    if (!tenantId) {
      setMarketplacePack(null);
      return;
    }
    setMarketplaceLoading(true);
    setMarketplaceError(null);
    try {
      setMarketplacePack(await exportEcommerceMarketplacePack(tenantId, { includeInactive: marketplaceIncludeInactive }));
    } catch (err: any) {
      setMarketplaceError(err?.message || 'Unable to load marketplace exports.');
    } finally {
      setMarketplaceLoading(false);
    }
  }, [marketplaceIncludeInactive, tenantId]);

  const loadIntegrationAccess = React.useCallback(async () => {
    if (!tenantId) {
      setIntegrationKeys([]);
      setIntegrationEvents([]);
      return;
    }
    setIntegrationLoading(true);
    setIntegrationError(null);
    try {
      const [keys, events] = await Promise.all([
        getIntegrationApiKeys(tenantId),
        getIntegrationWebhookEvents(tenantId, { limit: 8 }),
      ]);
      setIntegrationKeys(keys);
      setIntegrationEvents(events);
    } catch (err: any) {
      setIntegrationError(err?.message || 'Unable to load integration access.');
    } finally {
      setIntegrationLoading(false);
    }
  }, [tenantId]);

  React.useEffect(() => {
    if (tab === 'channels') {
      void loadMarketplacePack();
      void loadIntegrationAccess();
    }
  }, [loadIntegrationAccess, loadMarketplacePack, tab]);

  const downloadMarketplaceTarget = (targetId: string) => {
    const targetExport = (marketplacePack?.targetExports || []).find(target => target.targetId === targetId);
    if (!targetExport) return;
    saveCsvFile(targetExport.csv, targetExport.filename, targetExport.mimeType || 'text/csv;charset=utf-8');
  };

  const createChannelApiKey = async () => {
    if (!tenantId) return;
    setCreatingIntegrationKey(true);
    setIntegrationError(null);
    try {
      const created = await createIntegrationApiKey(tenantId, {
        name: integrationKeyName.trim() || 'ERP stock sync',
        scopes: ['stock:write', 'products:read'],
      });
      setGeneratedIntegrationSecret(created.secret);
      setIntegrationKeys(keys => [created.key, ...keys.filter(key => key.id !== created.key.id)]);
      setIntegrationKeyName('ERP stock sync');
    } catch (err: any) {
      setIntegrationError(err?.message || 'Unable to create integration API key.');
    } finally {
      setCreatingIntegrationKey(false);
    }
  };

  const revokeChannelApiKey = async (keyId: string) => {
    if (!tenantId) return;
    setIntegrationError(null);
    try {
      const revoked = await revokeIntegrationApiKey(tenantId, keyId);
      setIntegrationKeys(keys => keys.map(key => (key.id === keyId ? revoked : key)));
    } catch (err: any) {
      setIntegrationError(err?.message || 'Unable to revoke integration API key.');
    }
  };

  const copyGeneratedSecret = async () => {
    if (!generatedIntegrationSecret || !navigator.clipboard) return;
    await navigator.clipboard.writeText(generatedIntegrationSecret);
  };

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-8">
        {/* Sub-Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
          {(['products', 'channels', 'stocktake', 'locations', 'batches', 'reorder', 'recipeCosting', 'bulk', 'vendors', 'purchaseOrders', 'copilot'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-4 px-2 text-sm font-bold transition-all capitalize ${tab === t ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              {t === 'purchaseOrders' ? 'Purchase Orders' : t === 'bulk' ? 'Bulk Inventory' : t === 'copilot' ? 'Copilot Agent' : t === 'stocktake' ? 'Stocktake' : t === 'batches' ? 'Batches' : t === 'reorder' ? 'Reorder' : t === 'recipeCosting' ? 'Recipe Costing' : t === 'locations' ? 'Locations' : t === 'channels' ? 'Channels' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {adjustMessage && (
          <div
            className={`flex items-start justify-between gap-4 rounded-2xl border px-5 py-4 text-sm font-bold shadow-sm ${
              adjustMessage.tone === 'success'
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border-red-100 bg-red-50 text-red-700'
            }`}
          >
            <span>{adjustMessage.text}</span>
            <button
              type="button"
              onClick={() => setAdjustMessage(null)}
              className="rounded-lg p-1 transition hover:bg-white/70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {tab === 'channels' ? (
          <div className="space-y-6">
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                    <Package className="h-4 w-4" />
                    Marketplace Channels
                  </div>
                  <h2 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Product Listing Exports</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {marketplacePack ? `${marketplacePack.summary.productCount} products ready` : 'Shopify, WooCommerce, and Takealot'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={marketplaceIncludeInactive}
                      onChange={event => setMarketplaceIncludeInactive(event.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    Out of stock
                  </label>
                  <button
                    type="button"
                    onClick={() => void loadMarketplacePack()}
                    disabled={marketplaceLoading || !tenantId}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                  >
                    <RefreshCw className={`h-4 w-4 ${marketplaceLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {marketplaceError && (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                  {marketplaceError}
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">Products</div>
                  <div className="mt-1 text-3xl font-black text-slate-900 dark:text-white">{marketplacePack?.summary.productCount || 0}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">Targets</div>
                  <div className="mt-1 text-3xl font-black text-slate-900 dark:text-white">{marketplacePack?.summary.targetCount || 0}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">Low Stock</div>
                  <div className="mt-1 text-3xl font-black text-orange-500">{marketplacePack?.summary.lowStockCount || 0}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">Listing Value</div>
                  <div className="mt-1 text-3xl font-black text-slate-900 dark:text-white">R{(marketplacePack?.summary.inventoryValue || 0).toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                      <KeyRound className="h-4 w-4" />
                      ERP API Access
                    </div>
                    <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Stock Sync Keys</h3>
                    <p className="mt-1 text-xs font-bold text-slate-500">POST /api/integrations/{tenantId || ':tenantId'}/stock-sync</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadIntegrationAccess()}
                    disabled={integrationLoading || !tenantId}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <RefreshCw className={`h-4 w-4 ${integrationLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {integrationError && (
                  <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                    {integrationError}
                  </div>
                )}

                {generatedIntegrationSecret && (
                  <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                    <div className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">New key secret</div>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-800 dark:bg-slate-950 dark:text-slate-100">
                        {generatedIntegrationSecret}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyGeneratedSecret()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black uppercase tracking-widest text-white"
                      >
                        <Copy className="h-4 w-4" />
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={integrationKeyName}
                    onChange={event => setIntegrationKeyName(event.target.value)}
                    className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    placeholder="Key name"
                  />
                  <button
                    type="button"
                    onClick={() => void createChannelApiKey()}
                    disabled={creatingIntegrationKey || !tenantId}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary/20 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Create
                  </button>
                </div>

                <div className="mt-6 space-y-3">
                  {integrationKeys.map(key => (
                    <div key={key.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate text-sm font-black text-slate-900 dark:text-white">{key.name}</h4>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                              key.status === 'active'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {key.status}
                            </span>
                          </div>
                          <div className="mt-2 text-xs font-bold text-slate-500">
                            {key.keyPrefix}... · {key.scopes.join(', ')}
                          </div>
                          <div className="mt-1 text-[11px] font-bold text-slate-400">
                            Last used {formatChannelDate(key.lastUsedAt)}
                          </div>
                        </div>
                        {key.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => void revokeChannelApiKey(key.id)}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300"
                            aria-label={`Revoke ${key.name}`}
                            title={`Revoke ${key.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {integrationKeys.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-950">
                      No API keys yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                  <Webhook className="h-4 w-4" />
                  Recent Webhooks
                </div>
                <div className="mt-5 space-y-3">
                  {integrationEvents.map(event => (
                    <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-slate-900 dark:text-white">{event.source}</div>
                          <div className="mt-1 text-xs font-bold text-slate-500">{event.eventType} · {event.idempotencyKey}</div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                          event.status === 'applied'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : event.status === 'failed'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              : event.status === 'duplicate'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {event.status}
                        </span>
                      </div>
                      <div className="mt-3 text-[11px] font-bold text-slate-400">{formatChannelDate(event.createdAt)}</div>
                      {event.result?.appliedCount !== undefined && (
                        <div className="mt-2 text-xs font-bold text-slate-500">
                          Applied {event.result.appliedCount} item{Number(event.result.appliedCount) === 1 ? '' : 's'}
                        </div>
                      )}
                      {event.errorMessage && (
                        <div className="mt-2 text-xs font-bold text-rose-500">{event.errorMessage}</div>
                      )}
                    </div>
                  ))}
                  {integrationEvents.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-950">
                      No webhook events yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {(marketplacePack?.targets || []).map(target => (
                <div key={target.id} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-xl font-black text-slate-900 dark:text-white">{target.name}</h3>
                      <p className="mt-1 text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">{target.status.replace(/_/g, ' ')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadMarketplaceTarget(target.id)}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20 disabled:opacity-50"
                      aria-label={`${target.name} CSV`}
                      title={`${target.name} CSV`}
                    >
                      <Download className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="mt-5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950">
                    <div className="text-xs font-black uppercase tracking-widest text-slate-400">Rows</div>
                    <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{target.productCount}</div>
                    <div className="mt-3 text-xs font-bold text-slate-500">{target.requiredFields.slice(0, 5).join(', ')}</div>
                  </div>
                </div>
              ))}
              {(!marketplacePack || marketplacePack.targets.length === 0) && (
                <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-900">
                  No marketplace export rows.
                </div>
              )}
            </div>
          </div>
        ) : tab === 'vendors' ? (
          <VendorManagementView />
        ) : tab === 'locations' ? (
          <InventoryLocationsView products={products} onProductsUpdated={onProductsUpdated} />
        ) : tab === 'batches' ? (
          <StockBatchesView />
        ) : tab === 'reorder' ? (
          <ReorderRecommendationsView />
        ) : tab === 'recipeCosting' ? (
          <RecipeCostingView />
        ) : tab === 'purchaseOrders' ? (
          <PurchaseOrdersView />
        ) : tab === 'bulk' ? (
          <BulkInventoryView />
        ) : tab === 'copilot' ? (
          <InventoryAgentView />
        ) : tab === 'stocktake' ? (
          <StockTakeView products={products} onProductsUpdated={onProductsUpdated} />
        ) : (
          <div className="flex flex-col lg:flex-row gap-10">
            {/* Filter Sidebar */}
            <aside className="lg:w-80 shrink-0 space-y-8">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-100 dark:border-slate-800/60 shadow-xl shadow-slate-200/50 space-y-10 lg:sticky lg:top-10">
                <div>
                  <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white leading-none">Stock</h2>
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-3">Master Inventory</p>
                </div>

                <div className="space-y-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest block px-1">Quick Search</label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Name or SKU..."
                        className="w-full pl-11 pr-4 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800/60 rounded-2xl focus:ring-4 ring-primary/10 text-sm font-bold transition-all outline-none"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Section</label>
                      {section !== 'All' && (
                        <button onClick={() => { setSection('All'); setCategory('All'); setSubCategory('All'); }} className="text-[9px] font-black text-primary uppercase tracking-widest hover:underline">Clear</button>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {SECTIONS.map(sec => (
                        <button
                          key={sec}
                          onClick={() => { setSection(sec === section ? 'All' : sec); setCategory('All'); setSubCategory('All'); }}
                          className={`flex items-center justify-between px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border-2 group ${section === sec ? 'bg-slate-900 dark:bg-white text-white border-slate-900 shadow-lg shadow-slate-900/20' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-800/60 hover:border-slate-200'}`}
                        >
                          <span>{sec}</span>
                          {section === sec ? <ChevronRight className="w-3 h-3" /> : <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {section !== 'All' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Category</label>
                        <ChevronDown className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                      </div>
                      <div className="flex flex-col gap-2">
                        {(CATEGORY_MAP[section] || []).map(cat => (
                          <button
                            key={cat}
                            onClick={() => { setCategory(cat === category ? 'All' : cat); setSubCategory('All'); }}
                            className={`flex items-center justify-between px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${category === cat ? 'bg-primary/10 text-primary ring-2 ring-primary/20' : 'bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 hover:bg-slate-100'}`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {category !== 'All' && SUB_CATEGORY_MAP[category]?.length > 0 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest block px-1">Sub-Category</label>
                      <div className="flex flex-wrap gap-2">
                        {SUB_CATEGORY_MAP[category].map(sub => (
                          <button
                            key={sub}
                            onClick={() => setSubCategory(sub === subCategory ? 'All' : sub)}
                            className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${subCategory === sub ? 'bg-slate-800 dark:bg-slate-100 text-white shadow-md' : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 text-slate-400 dark:text-slate-500 hover:border-slate-300'}`}
                          >
                            {sub}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-6">
                  <button
                    onClick={onAddProduct}
                    className="w-full py-5 bg-primary text-white rounded-3xl font-black flex items-center justify-center gap-3 shadow-2xl shadow-primary/40 active:scale-95 hover:shadow-primary/60 transition-all text-xs uppercase tracking-[0.2em]"
                  >
                    <Plus className="w-5 h-5" />
                    Add Product
                  </button>
                </div>
              </div>
            </aside>

            {/* Product Grid */}
            <div className="flex-1 space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800/60 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all">
                  <div className="relative z-10">
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Stock Items</p>
                    <h4 className="text-4xl font-black text-slate-900 dark:text-white">{stats.totalItems}</h4>
                    <p className="text-[9px] font-bold text-slate-300 dark:text-slate-600 mt-2">Active SKUs</p>
                  </div>
                  <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:rotate-12 transition-transform duration-500">
                    <Package className="w-32 h-32 text-slate-900 dark:text-white" />
                  </div>
                </div>

                <div className={`p-8 rounded-[32px] border relative overflow-hidden group hover:shadow-xl transition-all ${stats.lowStockItems > 0 ? 'bg-orange-50 border-orange-100 shadow-orange-100/50' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/60'}`}>
                  <div className="relative z-10">
                    <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${stats.lowStockItems > 0 ? 'text-orange-600' : 'text-slate-400 dark:text-slate-500'}`}>Low Stock Alerts</p>
                    <h4 className={`text-4xl font-black ${stats.lowStockItems > 0 ? 'text-orange-600' : 'text-slate-900 dark:text-white'}`}>{stats.lowStockItems}</h4>
                    <p className="text-[9px] font-bold text-orange-400 mt-2 uppercase tracking-widest">Needs Restocking</p>
                  </div>
                  <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:rotate-12 transition-transform duration-500">
                    <ShieldCheck className="w-32 h-32 text-slate-900 dark:text-white" />
                  </div>
                </div>

                <div className="bg-slate-900 dark:bg-white p-8 rounded-[32px] border border-slate-800 dark:border-slate-200 shadow-2xl shadow-slate-900/20 relative overflow-hidden group">
                  <div className="relative z-10">
                    <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Inventory Value</p>
                    <h4 className="text-4xl font-black text-white dark:text-slate-900">R{stats.totalValue.toLocaleString()}</h4>
                    <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-2">Current Asset Value</p>
                  </div>
                  <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:-rotate-12 transition-transform duration-500">
                    <Banknote className="w-32 h-32 text-white dark:text-slate-900" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8 mb-20">
                {filteredInventory.map(product => {
                  const isLowStock = product.stock <= (product.minStock || 10);
                  return (
                    <div
                      key={product.id}
                      className={`bg-white dark:bg-slate-900 rounded-[40px] border transition-all hover:shadow-2xl hover:shadow-slate-200/50 group relative overflow-hidden ${isLowStock ? 'border-orange-200 ring-8 ring-orange-50/50' : 'border-slate-100 dark:border-slate-800/60'}`}
                    >
                      <div className="h-60 bg-slate-50 dark:bg-[#0B1120] relative overflow-hidden flex items-center justify-center">
                        <img
                          src={getProductImage(product)}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute top-6 left-6 flex flex-col gap-2">
                          {isLowStock && (
                            <div className="px-3 py-1.5 bg-orange-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-xl">Low Stock</div>
                          )}
                          <div className="px-3 py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-900 dark:text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm border border-white/20">
                            {product.category}
                          </div>
                        </div>
                        <div className="absolute top-6 right-6 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                          <button
                            onClick={() => onEditProduct(product)}
                            className="w-10 h-10 bg-white dark:bg-slate-900 shadow-xl rounded-2xl flex items-center justify-center text-slate-900 dark:text-white hover:bg-slate-900 dark:hover:bg-white hover:text-white dark:hover:text-slate-900 transition-all ring-4 ring-white/50"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="p-8 space-y-6">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start gap-4">
                            <h3 className="font-black text-xl text-slate-900 dark:text-white leading-tight">{product.name}</h3>
                            <p className="text-xl font-black text-primary">R{Number(product.price || 0).toFixed(2)}</p>
                          </div>
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{product.barcode || 'NO SERIAL'}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pb-6 border-b border-slate-50 dark:border-slate-800">
                          <div>
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 opacity-50">Quantity</p>
                            <div className="flex items-center gap-3">
                              <span className={`text-2xl font-black ${isLowStock ? 'text-orange-500 animate-pulse' : 'text-slate-900 dark:text-white'}`}>{product.stock}</span>
                              <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600">PCS</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 opacity-50">Asset Value</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-white">R{(product.stock * (product.costPrice || product.price)).toLocaleString()}</p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => openStockAdjustment(product, -1)}
                            className="flex-1 py-4 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all border border-transparent hover:border-red-100"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openStockAdjustment(product, 1)}
                            className="flex-1 py-4 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-500 transition-all border border-transparent hover:border-emerald-100"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onEditProduct(product)}
                            className="px-6 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center shadow-lg active:scale-95 transition-all"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredInventory.length === 0 && (
                  <div className="col-span-full py-32 text-center bg-white dark:bg-slate-900 rounded-[40px] border border-dashed border-slate-200 dark:border-slate-700/60">
                    <Package className="w-16 h-16 text-slate-200 mx-auto mb-6" />
                    <h4 className="text-xl font-black text-slate-900 dark:text-white">No matching inventory found</h4>
                    <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">Try adjusting your filters or search terms</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {adjustModal && adjustmentPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`mt-1 flex h-11 w-11 items-center justify-center rounded-2xl ${adjustModal.delta > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {canApplyStockDirectly ? 'Logged immediately' : 'Manager approval required'}
                  </p>
                  <h3 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                    {adjustmentPreview.direction === 'increase' ? 'Increase' : 'Decrease'} stock
                  </h3>
                  <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
                    {adjustModal.product.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdjustModal(null)}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Current</p>
                <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{adjustmentPreview.current}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Change</p>
                <p className={`mt-1 text-2xl font-black ${adjustModal.delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {adjustModal.delta > 0 ? '+' : '-'}{adjustmentPreview.absoluteDelta}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4 dark:bg-white">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Result</p>
                <p className="mt-1 text-2xl font-black text-white dark:text-slate-900">{adjustmentPreview.next}</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Reason</span>
                <select
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none ring-primary/10 transition focus:ring-4 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                >
                  {stockAdjustmentReasons.map(reason => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Note</span>
                <textarea
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  rows={3}
                  placeholder="Add invoice number, count note, or damage detail..."
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none ring-primary/10 transition focus:ring-4 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setAdjustModal(null)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitStockAdjustment}
                disabled={isAdjusting}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900"
              >
                {isAdjusting ? 'Working...' : canApplyStockDirectly ? 'Apply Adjustment' : 'Request Approval'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
