import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Trash2, Package, Save, X, FlaskConical, AlertCircle, RefreshCcw } from 'lucide-react';
import { BulkItem } from '../types';
import { apiGet, apiPost, apiPut, apiDelete } from '../api';
import { usePosStore } from '../store/usePosStore';

export const BulkInventoryView: React.FC = () => {
  const tenantId = usePosStore(state => state.tenantId);
  const [items, setItems] = useState<BulkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<BulkItem>>({
    name: '',
    unit: 'items',
    stock: 0,
    minStock: 0,
    costPerUnit: 0,
    barcode: ''
  });

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
    return items.filter(item => 
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.barcode && item.barcode.includes(search))
    );
  }, [items, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    try {
      if (editingId) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/bulk-items/${editingId}`, formData);
      } else {
        await apiPost(`/api/mariadb/tenants/${tenantId}/bulk-items`, formData);
      }
      setIsAdding(false);
      setEditingId(null);
      setFormData({ name: '', unit: 'items', stock: 0, minStock: 0, costPerUnit: 0, barcode: '' });
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
    setEditingId(item.id);
    setFormData(item);
    setIsAdding(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white leading-none">Bulk Inventory</h2>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-3">Raw Materials & Ingredients</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search ingredients..."
              className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-bold focus:ring-4 ring-primary/10 transition-all outline-none"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => { setIsAdding(true); setEditingId(null); setFormData({ name: '', unit: 'items', stock: 0, minStock: 0, costPerUnit: 0, barcode: '' }); }}
            className="p-3 bg-primary text-white rounded-2xl shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border-2 border-primary/20 shadow-2xl animate-in zoom-in-95 duration-200">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">{editingId ? 'Edit Item' : 'New Bulk Item'}</h3>
              <button type="button" onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Item Name</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Brandy 750ml"
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-2xl font-bold"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Unit of Measure</label>
                <select
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-2xl font-bold appearance-none"
                  value={formData.unit}
                  onChange={e => setFormData({ ...formData, unit: e.target.value })}
                >
                  <option value="items">Items (pcs)</option>
                  <option value="ml">Milliliters (ml)</option>
                  <option value="l">Liters (l)</option>
                  <option value="g">Grams (g)</option>
                  <option value="kg">Kilograms (kg)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Barcode / SKU</label>
                <input
                  type="text"
                  placeholder="Optional"
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-2xl font-bold"
                  value={formData.barcode}
                  onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Stock</label>
                <input
                  required
                  type="number"
                  step="0.001"
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-2xl font-bold text-primary"
                  value={formData.stock}
                  onChange={e => setFormData({ ...formData, stock: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Min. Stock Alert</label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-2xl font-bold"
                  value={formData.minStock}
                  onChange={e => setFormData({ ...formData, minStock: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cost Per Unit (R)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-2xl font-bold text-emerald-600"
                  value={formData.costPerUnit}
                  onChange={e => setFormData({ ...formData, costPerUnit: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                className="flex-1 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-primary/20"
              >
                <Save className="w-5 h-5" />
                {editingId ? 'Update Item' : 'Create Item'}
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black uppercase tracking-widest"
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
            <p className="font-black text-slate-400 uppercase tracking-widest">Loading Ingredients...</p>
          </div>
        ) : filteredItems.map(item => {
          const isLow = item.stock <= (item.minStock || 0);
          return (
            <div key={item.id} className={`bg-white dark:bg-slate-900 p-6 rounded-[32px] border ${isLow ? 'border-orange-200 ring-4 ring-orange-50 dark:ring-orange-900/10' : 'border-slate-100 dark:border-slate-800'} shadow-sm hover:shadow-xl transition-all group relative overflow-hidden`}>
              <div className="flex justify-between items-start mb-4">
                <div className={`p-4 rounded-2xl ${isLow ? 'bg-orange-100 text-orange-600' : 'bg-slate-50 dark:bg-[#0B1120] text-slate-400'} group-hover:scale-110 transition-transform`}>
                  <FlaskConical className="w-6 h-6" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(item)} className="p-2 text-slate-300 hover:text-primary transition-colors"><Save className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="space-y-1">
                <h4 className="font-black text-slate-900 dark:text-white truncate">{item.name}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.barcode || 'NO SKU'}</p>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-50 dark:border-slate-800 flex justify-between items-end">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Available Stock</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-black ${isLow ? 'text-orange-600' : 'text-slate-900 dark:text-white'}`}>{item.stock}</span>
                    <span className="text-[10px] font-bold text-slate-300 uppercase">{item.unit}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cost / {item.unit.slice(0, -1) || item.unit}</p>
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
          <div className="col-span-full py-20 text-center bg-slate-50 dark:bg-[#0B1120] rounded-[40px] border-2 border-dashed border-slate-200 dark:border-slate-800">
            <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="font-black text-slate-400 uppercase tracking-widest">No bulk items found</p>
          </div>
        )}
      </div>
    </div>
  );
};
