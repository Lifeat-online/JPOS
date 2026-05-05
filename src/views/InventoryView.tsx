import React, { useState, useMemo } from 'react';
import { Search, Plus, Minus, Package, ShieldCheck, Banknote, ChevronRight, ChevronDown, Edit } from 'lucide-react';
import { Product, AppConfig } from '../types';
import { VendorManagementView } from '../components/VendorManagementView';
import { PurchaseOrdersView } from '../components/PurchaseOrdersView';
import { apiPut } from '../api';
import { usePosStore } from '../store/usePosStore';

interface InventoryViewProps {
  products: Product[];
  config: AppConfig;
  onEditProduct: (product: Partial<Product>) => void;
  onAddProduct: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products, config, onEditProduct, onAddProduct,
}) => {
  const tenantId = usePosStore(state => state.tenantId);
  const [tab, setTab] = useState<'products' | 'vendors' | 'purchaseOrders'>('products');
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('All');
  const [category, setCategory] = useState('All');
  const [subCategory, setSubCategory] = useState('All');

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

  const adjustStock = async (product: Product, delta: number) => {
    if (!tenantId) return;
    try {
      await apiPut(`/api/mariadb/tenants/${tenantId}/products/${product.id}`, { 
        stock: Math.max(0, (product.stock || 0) + delta) 
      });
    } catch (err) {
      console.error('Failed to adjust stock:', err);
    }
  };

  const getProductImage = (product: Partial<Product>) => {
    if (product.imageUrl) return product.imageUrl;
    return `https://placehold.co/600x600/1e293b/f8fafc?text=${encodeURIComponent(product.name || 'Product')}%0A${encodeURIComponent(product.category || 'Category')}`;
  };

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-8">
        {/* Sub-Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
          {(['products', 'vendors', 'purchaseOrders'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-4 px-2 text-sm font-bold transition-all capitalize ${tab === t ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              {t === 'purchaseOrders' ? 'Purchase Orders' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'vendors' ? (
          <VendorManagementView />
        ) : tab === 'purchaseOrders' ? (
          <PurchaseOrdersView />
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
                            onClick={() => adjustStock(product, -1)}
                            className="flex-1 py-4 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all border border-transparent hover:border-red-100"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => adjustStock(product, 1)}
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
    </div>
  );
};
