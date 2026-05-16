import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Trash2, Package, Save, X, FlaskConical, AlertCircle, RefreshCcw } from 'lucide-react';
import { BulkItem } from '../types';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import { usePosStore } from '../store/usePosStore';

type BulkArea = 'single' | 'bulk';

const emptyForm = (itemType: BulkArea = 'single'): Partial<BulkItem> => ({
  name: '',
  itemType,
  unit: itemType === 'bulk' ? 'cases' : 'items',
  stock: 0,
  minStock: 0,
  costPerUnit: 0,
  barcode: '',
  packName: itemType === 'bulk' ? 'Case' : '',
  packQuantity: itemType === 'bulk' ? 12 : 1,
  singleUnitName: 'bottle'
});

export const BulkInventoryView: React.FC = () => {
  const tenantId = usePosStore(state => state.tenantId);
  const [items, setItems] = useState<BulkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeArea, setActiveArea] = useState<BulkArea>('single');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<BulkItem>>(emptyForm('single'));

  useEffect(() => {
    fetchItems();
  }, [tenantId]);

  const fetchItems = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await apiGet(`/api/mariadb/tenants/${tenantId}/bulk-items`);
      setItems(data as BulkItem[]);
    } catch (err) {
      console.error('Failed to fetch bulk items:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const term = search.toLowerCase();
    return items.filter(item => {
      const type = item.itemType || 'single';
      const matchesArea = type === activeArea;
      const matchesSearch =
        item.name.toLowerCase().includes(term) ||
        (item.barcode && item.barcode.toLowerCase().includes(term)) ||
        (item.packName && item.packName.toLowerCase().includes(term));
      return matchesArea && matchesSearch;
    });
  }, [items, search, activeArea]);

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc[item.itemType || 'single'] += 1;
        return acc;
      },
      { single: 0, bulk: 0 } as Record<BulkArea, number>
    );
  }, [items]);

  const startAdd = (itemType: BulkArea = activeArea) => {
    setActiveArea(itemType);
    setEditingId(null);
    setFormData(emptyForm(itemType));
    setIsAdding(true);
  };

  const setFormType = (itemType: BulkArea) => {
    setFormData({
      ...formData,
      itemType,
      unit: itemType === 'bulk' ? (formData.unit === 'items' ? 'cases' : formData.unit) : 'items',
      packName: itemType === 'bulk' ? (formData.packName || 'Case') : '',
      packQuantity: itemType === 'bulk' ? (formData.packQuantity || 12) : 1,
      singleUnitName: formData.singleUnitName || 'bottle'
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    const itemType = formData.itemType === 'bulk' ? 'bulk' : 'single';
    const payload: Partial<BulkItem> = {
      ...formData,
      itemType,
      packName: itemType === 'bulk' ? formData.packName || 'Case' : '',
      packQuantity: itemType === 'bulk' ? Number(formData.packQuantity || 1) : 1,
      singleUnitName: formData.singleUnitName || 'item'
    };

    try {
      if (editingId) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/bulk-items/${editingId}`, payload);
      } else {
        await apiPost(`/api/mariadb/tenants/${tenantId}/bulk-items`, payload);
      }
      setIsAdding(false);
      setEditingId(null);
      setFormData(emptyForm(activeArea));
      fetchItems();
    } catch (err) {
      console.error('Failed to save bulk item:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!tenantId || !window.confirm('Are you sure? This cannot be undone.')) return;
    try {
      await apiDelete(`/api/mariadb/tenants/${tenantId}/bulk-items/${id}`);
      fetchItems();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const startEdit = (item: BulkItem) => {
    const itemType = item.itemType || 'single';
    setActiveArea(itemType);
    setEditingId(item.id);
    setFormData({
      ...emptyForm(itemType),
      ...item,
      itemType,
      packQuantity: item.packQuantity || (itemType === 'bulk' ? 12 : 1),
      singleUnitName: item.singleUnitName || 'item'
    });
    setIsAdding(true);
  };

  const formType = formData.itemType === 'bulk' ? 'bulk' : 'single';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white leading-none">Bulk Inventory</h2>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-3">Single Products & Bulk Packs</p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full lg:w-auto">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            {(['single', 'bulk'] as BulkArea[]).map(area => (
              <button
                key={area}
                type="button"
                onClick={() => setActiveArea(area)}
                className={`h-11 px-4 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeArea === area ? 'bg-white dark:bg-slate-800 text-primary shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {area === 'single' ? <FlaskConical className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                {area === 'single' ? 'Single' : 'Bulk'}
                <span className="text-[9px] opacity-70">{counts[area]}</span>
              </button>
            ))}
          </div>
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder={activeArea === 'single' ? 'Search single products...' : 'Search cases and packs...'}
              className="w-full h-11 pl-11 pr-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold focus:ring-4 ring-primary/10 transition-all outline-none"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => startAdd(activeArea)}
            className="h-11 px-4 bg-primary text-white rounded-lg shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">Add</span>
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border-2 border-primary/20 shadow-2xl animate-in zoom-in-95 duration-200">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">{editingId ? 'Edit Item' : 'New Inventory Item'}</h3>
              <button type="button" onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-[#0B1120] rounded-lg max-w-md">
              <button
                type="button"
                onClick={() => setFormType('single')}
                className={`h-12 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 ${formType === 'single' ? 'bg-white dark:bg-slate-800 text-primary shadow-sm' : 'text-slate-500'}`}
              >
                <FlaskConical className="w-4 h-4" />
                Single Product
              </button>
              <button
                type="button"
                onClick={() => setFormType('bulk')}
                className={`h-12 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 ${formType === 'bulk' ? 'bg-white dark:bg-slate-800 text-primary shadow-sm' : 'text-slate-500'}`}
              >
                <Package className="w-4 h-4" />
                Bulk Pack
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Item Name</label>
                <input
                  required
                  type="text"
                  placeholder={formType === 'single' ? 'e.g. Brandy 750ml' : 'e.g. Brandy Case'}
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-lg font-bold"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stock Unit</label>
                <input
                  required
                  type="text"
                  placeholder={formType === 'bulk' ? 'cases' : 'items'}
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-lg font-bold"
                  value={formData.unit}
                  onChange={e => setFormData({ ...formData, unit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Barcode / SKU</label>
                <input
                  type="text"
                  placeholder="Optional"
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-lg font-bold"
                  value={formData.barcode}
                  onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                />
              </div>

              {formType === 'bulk' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pack Name</label>
                    <input
                      type="text"
                      placeholder="Case"
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-lg font-bold"
                      value={formData.packName}
                      onChange={e => setFormData({ ...formData, packName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Singles Per Pack</label>
                    <input
                      required
                      type="number"
                      min="1"
                      step="1"
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-lg font-bold text-primary"
                      value={formData.packQuantity}
                      onChange={e => setFormData({ ...formData, packQuantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Single Unit Name</label>
                    <input
                      type="text"
                      placeholder="bottle"
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-lg font-bold"
                      value={formData.singleUnitName}
                      onChange={e => setFormData({ ...formData, singleUnitName: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Stock</label>
                <input
                  required
                  type="number"
                  step="0.001"
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-lg font-bold text-primary"
                  value={formData.stock}
                  onChange={e => setFormData({ ...formData, stock: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Min. Stock Alert</label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-lg font-bold"
                  value={formData.minStock}
                  onChange={e => setFormData({ ...formData, minStock: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cost Per Stock Unit (R)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-lg font-bold text-emerald-600"
                  value={formData.costPerUnit}
                  onChange={e => setFormData({ ...formData, costPerUnit: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                className="flex-1 py-4 bg-primary text-white rounded-lg font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-primary/20"
              >
                <Save className="w-5 h-5" />
                {editingId ? 'Update Item' : 'Create Item'}
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg font-black uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center">
            <RefreshCcw className="w-10 h-10 text-primary mx-auto animate-spin mb-4" />
            <p className="font-black text-slate-400 uppercase tracking-widest">Loading Inventory...</p>
          </div>
        ) : filteredItems.map(item => {
          const itemType = item.itemType || 'single';
          const isLow = Number(item.stock || 0) <= Number(item.minStock || 0);
          const packQuantity = Number(item.packQuantity || 1);
          const singleUnitName = item.singleUnitName || 'item';
          return (
            <div key={item.id} className={`bg-white dark:bg-slate-900 p-6 rounded-lg border ${isLow ? 'border-orange-200 ring-4 ring-orange-50 dark:ring-orange-900/10' : 'border-slate-100 dark:border-slate-800'} shadow-sm hover:shadow-xl transition-all group relative overflow-hidden`}>
              <div className="flex justify-between items-start mb-4">
                <div className={`p-4 rounded-lg ${isLow ? 'bg-orange-100 text-orange-600' : 'bg-slate-50 dark:bg-[#0B1120] text-slate-400'} group-hover:scale-105 transition-transform`}>
                  {itemType === 'bulk' ? <Package className="w-6 h-6" /> : <FlaskConical className="w-6 h-6" />}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(item)} className="p-2 text-slate-300 hover:text-primary transition-colors"><Save className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 min-w-0">
                  <h4 className="font-black text-slate-900 dark:text-white truncate">{item.name}</h4>
                  <span className="shrink-0 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-500">
                    {itemType === 'bulk' ? 'Bulk' : 'Single'}
                  </span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.barcode || 'NO SKU'}</p>
              </div>

              {itemType === 'bulk' && (
                <div className="mt-5 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">{item.packName || 'Pack'} Size</p>
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {packQuantity} {singleUnitName}{packQuantity === 1 ? '' : 's'} per {(item.packName || 'pack').toLowerCase()}
                  </p>
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-slate-50 dark:border-slate-800 flex justify-between items-end">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Available Stock</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-black ${isLow ? 'text-orange-600' : 'text-slate-900 dark:text-white'}`}>{item.stock}</span>
                    <span className="text-[10px] font-bold text-slate-300 uppercase">{item.unit}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cost / {item.unit || 'unit'}</p>
                  <p className="text-sm font-black text-emerald-600">R{Number(item.costPerUnit || 0).toFixed(2)}</p>
                </div>
              </div>

              {isLow && (
                <div className="absolute top-4 right-4 animate-bounce">
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                </div>
              )}
            </div>
          );
        })}

        {!loading && filteredItems.length === 0 && (
          <div className="col-span-full py-20 text-center bg-slate-50 dark:bg-[#0B1120] rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800">
            <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="font-black text-slate-400 uppercase tracking-widest">No {activeArea === 'single' ? 'single products' : 'bulk packs'} found</p>
            <button
              type="button"
              onClick={() => startAdd(activeArea)}
              className="mt-5 px-5 py-3 bg-primary text-white rounded-lg text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add {activeArea === 'single' ? 'Single Product' : 'Bulk Pack'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
