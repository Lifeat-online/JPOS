import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, FlaskConical, Search, AlertCircle, RefreshCcw } from 'lucide-react';
import { Product, RecipeItem, BulkItem } from '../../types';
import { apiGet, apiPut } from '../../api';

interface RecipeModalProps {
  product: Product;
  onClose: () => void;
  onSave: () => void;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({ product, onClose, onSave }) => {
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const number = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const effectiveQuantity = (item: RecipeItem) => {
    const yieldQuantity = Math.max(1, number(item.yieldQuantity, 1));
    const wastePercent = Math.max(0, number(item.wastePercent, 0));
    return (number(item.quantity) / yieldQuantity) * (1 + wastePercent / 100);
  };

  const lineCost = (item: RecipeItem) => {
    const bulk = bulkItems.find(b => b.id === item.bulkItemId);
    return effectiveQuantity(item) * number(item.costPerUnit ?? bulk?.costPerUnit);
  };

  const costedBulkIds = new Set<string>();
  const grouped = recipe.reduce((acc, item) => {
    const group = item.substituteGroup?.trim();
    if (group) acc[group] = [...(acc[group] || []), item];
    return acc;
  }, {} as Record<string, RecipeItem[]>);
  recipe.forEach(item => {
    if (!item.substituteGroup?.trim() && !item.isOptional) costedBulkIds.add(item.bulkItemId);
  });
  Object.values(grouped).forEach(items => {
    const chosen = [...items].sort((a, b) => number(a.substituteRank) - number(b.substituteRank))[0];
    if (chosen && !chosen.isOptional) costedBulkIds.add(chosen.bulkItemId);
  });
  const recipeCost = recipe.reduce((sum, item) => sum + (costedBulkIds.has(item.bulkItemId) ? lineCost(item) : 0), 0);
  const unitCost = recipeCost > 0 ? recipeCost : number(product.costPrice);
  const grossProfit = number(product.price) - unitCost;
  const grossMargin = number(product.price) > 0 ? (grossProfit / number(product.price)) * 100 : 0;

  useEffect(() => {
    fetchData();
  }, [product.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [recipeData, bulkData] = await Promise.all([
        apiGet(`/api/mariadb/products/${product.id}/recipe`),
        apiGet(`/api/mariadb/tenants/${(product as any).tenantId}/bulk-items`)
      ]);
      setRecipe((recipeData as RecipeItem[]) || []);
      setBulkItems((bulkData as BulkItem[]) || []);
    } catch (err) {
      console.error('Failed to fetch recipe data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIngredient = (item: BulkItem) => {
    if (recipe.find(r => r.bulkItemId === item.id)) return;
    setRecipe([...recipe, { 
      bulkItemId: item.id, 
      quantity: 1, 
      yieldQuantity: 1,
      wastePercent: 0,
      substituteGroup: null,
      substituteRank: 0,
      isOptional: false,
      bulkItemName: item.name, 
      unit: item.unit,
      costPerUnit: item.costPerUnit || 0,
      availableStock: item.stock || 0,
    }]);
  };

  const handleRemoveIngredient = (bulkItemId: string) => {
    setRecipe(recipe.filter(r => r.bulkItemId !== bulkItemId));
  };

  const handleUpdateQuantity = (bulkItemId: string, qty: number) => {
    setRecipe(recipe.map(r => r.bulkItemId === bulkItemId ? { ...r, quantity: qty } : r));
  };

  const handleUpdateItem = (bulkItemId: string, updates: Partial<RecipeItem>) => {
    setRecipe(recipe.map(r => r.bulkItemId === bulkItemId ? { ...r, ...updates } : r));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiPut(`/api/mariadb/products/${product.id}/recipe`, recipe);
      onSave();
      onClose();
    } catch (err) {
      console.error('Failed to save recipe:', err);
    } finally {
      setSaving(false);
    }
  };

  const filteredBulk = bulkItems.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) &&
    !recipe.some(r => r.bulkItemId === item.id)
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-[40px] shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-white/5">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-primary/10 text-primary rounded-2xl">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">Product Recipe</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">BOM for {product.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Active Recipe */}
          <div className="flex-1 p-8 overflow-y-auto space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Recipe cost</p>
                <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">R{recipeCost.toFixed(2)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Gross margin</p>
                <p className={`mt-1 text-lg font-black ${grossMargin < 30 ? 'text-amber-600' : 'text-emerald-600'}`}>{grossMargin.toFixed(1)}%</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Sub groups</p>
                <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{Object.keys(grouped).length}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Waste avg</p>
                <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">
                  {recipe.length ? (recipe.reduce((sum, item) => sum + number(item.wastePercent), 0) / recipe.length).toFixed(1) : '0.0'}%
                </p>
              </div>
            </div>

            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] mb-4">Ingredients ({recipe.length})</h3>
            
            {recipe.length === 0 ? (
              <div className="py-20 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-[32px]">
                <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No ingredients added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recipe.map((item, idx) => (
                  <div key={item.bulkItemId} className="p-4 bg-slate-50 dark:bg-[#0B1120] rounded-2xl border border-slate-100 dark:border-slate-800 group animate-in slide-in-from-left-4 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                    <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 dark:text-white">{item.bulkItemName}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        {item.unit} - {effectiveQuantity(item).toFixed(3)} effective - R{lineCost(item).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        step="0.001"
                        className="w-24 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-center font-black text-primary"
                        value={item.quantity}
                        onChange={(e) => handleUpdateQuantity(item.bulkItemId, Number(e.target.value))}
                        title="Recipe quantity"
                      />
                      <button onClick={() => handleRemoveIngredient(item.bulkItemId)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-2">
                      <input
                        type="number"
                        min={1}
                        step="0.001"
                        value={item.yieldQuantity ?? 1}
                        onChange={e => handleUpdateItem(item.bulkItemId, { yieldQuantity: Math.max(1, Number(e.target.value) || 1) })}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        title="Yield quantity"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        value={item.wastePercent ?? 0}
                        onChange={e => handleUpdateItem(item.bulkItemId, { wastePercent: Math.max(0, Number(e.target.value) || 0) })}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        title="Waste percent"
                      />
                      <input
                        type="text"
                        value={item.substituteGroup || ''}
                        onChange={e => handleUpdateItem(item.bulkItemId, { substituteGroup: e.target.value || null })}
                        placeholder="Sub group"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                      />
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={item.substituteRank ?? 0}
                        onChange={e => handleUpdateItem(item.bulkItemId, { substituteRank: Math.max(0, Number(e.target.value) || 0) })}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-900 outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        title="Substitute rank"
                      />
                      <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                        <input
                          type="checkbox"
                          checked={Boolean(item.isOptional)}
                          onChange={e => handleUpdateItem(item.bulkItemId, { isOptional: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        Optional
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bulk Item Picker */}
          <div className="w-full lg:w-80 bg-slate-50 dark:bg-[#0B1120] border-l border-slate-100 dark:border-slate-800 flex flex-col p-6">
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] mb-4">Add Ingredient</h3>
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold outline-none focus:ring-2 ring-primary/20"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredBulk.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleAddIngredient(item)}
                  className="w-full flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                >
                  <div>
                    <p className="text-[11px] font-black text-slate-900 dark:text-white truncate max-w-[140px]">{item.name}</p>
                    <p className="text-[9px] font-bold text-slate-400">{item.unit}</p>
                  </div>
                  <Plus className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors" />
                </button>
              ))}
              {filteredBulk.length === 0 && (
                <p className="text-center py-10 text-[10px] font-bold text-slate-400 uppercase tracking-widest">No items found</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-white/5 flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-5 bg-primary text-white rounded-3xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-2xl shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 transition-all"
          >
            {saving ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save Recipe
          </button>
          <button
            onClick={onClose}
            className="px-10 py-5 bg-white dark:bg-slate-800 text-slate-500 rounded-3xl font-black uppercase tracking-[0.2em] text-xs border border-slate-100 dark:border-slate-700 hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
