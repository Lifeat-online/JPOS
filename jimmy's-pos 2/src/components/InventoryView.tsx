import React from 'react';
import { Package, ShieldCheck, Banknote, Search, Plus, ChevronDown, ChevronRight, Edit, Minus } from 'lucide-react';
import { VendorManagementView } from './VendorManagementView';
import { PurchaseOrdersView } from './PurchaseOrdersView';

export function InventoryView({
  inventoryTab, setInventoryTab,
  SECTIONS, CATEGORY_MAP, SUB_CATEGORY_MAP,
  inventorySearch, setInventorySearch,
  inventorySection, setInventorySection,
  inventoryCategory, setInventoryCategory,
  inventorySubCategory, setInventorySubCategory,
  setProductModal,
  inventoryStats,
  filteredInventory,
  getProductImage,
  db, updateDoc, doc
}: any) {
  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
            <div className="max-w-[1600px] mx-auto flex flex-col gap-8">
              {/* Inventory Sub-Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
                <button 
                  onClick={() => setInventoryTab('products')} 
                  className={`pb-4 px-2 text-sm font-bold transition-all ${inventoryTab === 'products' ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >Products</button>
                <button 
                  onClick={() => setInventoryTab('vendors')} 
                  className={`pb-4 px-2 text-sm font-bold transition-all ${inventoryTab === 'vendors' ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >Vendors</button>
                <button 
                  onClick={() => setInventoryTab('purchaseOrders')} 
                  className={`pb-4 px-2 text-sm font-bold transition-all ${inventoryTab === 'purchaseOrders' ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >Purchase Orders</button>
              </div>
              
              {inventoryTab === 'vendors' ? (
                <VendorManagementView />
              ) : inventoryTab === 'purchaseOrders' ? (
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
                    {/* Search */}
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest block px-1">Quick Search</label>
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                        <input 
                          type="text" 
                          placeholder="Name or SKU..."
                          className="w-full pl-11 pr-4 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800/60 rounded-2xl focus:ring-4 ring-primary/10 text-sm font-bold transition-all outline-none"
                          value={inventorySearch}
                          onChange={(e) => setInventorySearch(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Section Filter */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Section</label>
                        {inventorySection !== "All" && (
                          <button onClick={() => { setInventorySection("All"); setInventoryCategory("All"); setInventorySubCategory("All"); }} className="text-[9px] font-black text-primary uppercase tracking-widest hover:underline">Clear</button>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {SECTIONS.map(sec => (
                          <button
                            key={sec}
                            onClick={() => {
                              setInventorySection(sec === inventorySection ? "All" : sec);
                              setInventoryCategory("All");
                              setInventorySubCategory("All");
                            }}
                            className={`flex items-center justify-between px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border-2 group ${
                              inventorySection === sec 
                              ? 'bg-slate-900 dark:bg-white text-white border-slate-900 shadow-lg shadow-slate-900/20' 
                              : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-800/60 hover:border-slate-200 dark:border-slate-700/60'
                            }`}
                          >
                            <span>{sec}</span>
                            {inventorySection === sec ? <ChevronRight className="w-3 h-3" /> : <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Category Filter */}
                    {inventorySection !== "All" && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Category</label>
                          <ChevronDown className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                        </div>
                        <div className="flex flex-col gap-2">
                          {(CATEGORY_MAP[inventorySection] || []).map(cat => (
                            <button
                              key={cat}
                              onClick={() => {
                                setInventoryCategory(cat === inventoryCategory ? "All" : cat);
                                setInventorySubCategory("All");
                              }}
                              className={`flex items-center justify-between px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                inventoryCategory === cat 
                                ? 'bg-primary/10 text-primary ring-2 ring-primary/20' 
                                : 'bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:bg-slate-800'
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sub-Category Filter */}
                    {inventoryCategory !== "All" && SUB_CATEGORY_MAP[inventoryCategory] && (
                       <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest block px-1">Sub-Category</label>
                        <div className="flex flex-wrap gap-2">
                          {SUB_CATEGORY_MAP[inventoryCategory].map(sub => (
                            <button
                              key={sub}
                              onClick={() => setInventorySubCategory(sub === inventorySubCategory ? "All" : sub)}
                              className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                inventorySubCategory === sub 
                                ? 'bg-slate-800 dark:bg-slate-100 text-white shadow-md' 
                                : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 text-slate-400 dark:text-slate-500 hover:border-slate-300'
                              }`}
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
                      onClick={() => setProductModal({ isOpen: true, product: { stock: 0, price: 0, costPrice: 0 } })}
                      className="w-full py-5 bg-primary text-white rounded-3xl font-black flex items-center justify-center gap-3 shadow-2xl shadow-primary/40 active:scale-95 hover:shadow-primary/60 transition-all text-xs uppercase tracking-[0.2em]"
                    >
                      <Plus className="w-5 h-5" />
                      Add Product
                    </button>
                  </div>
                </div>
              </aside>

              {/* Inventory Content area */}
              <div className="flex-1 space-y-10">
                {/* Visual Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800/60 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all">
                    <div className="relative z-10">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Stock Items</p>
                      <h4 className="text-4xl font-black text-slate-900 dark:text-white">{inventoryStats.totalItems}</h4>
                      <p className="text-[9px] font-bold text-slate-300 dark:text-slate-600 mt-2">Active SKUs</p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:rotate-12 transition-transform duration-500">
                      <Package className="w-32 h-32 text-slate-900 dark:text-white" />
                    </div>
                  </div>

                  <div className={`p-8 rounded-[32px] border relative overflow-hidden group hover:shadow-xl transition-all ${inventoryStats.lowStockItems > 0 ? 'bg-orange-50 border-orange-100 shadow-orange-100/50' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/60'}`}>
                    <div className="relative z-10">
                      <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${inventoryStats.lowStockItems > 0 ? 'text-orange-600' : 'text-slate-400 dark:text-slate-500'}`}>Low Stock Alerts</p>
                      <h4 className={`text-4xl font-black ${inventoryStats.lowStockItems > 0 ? 'text-orange-600' : 'text-slate-900 dark:text-white'}`}>{inventoryStats.lowStockItems}</h4>
                      <button 
                        onClick={() => { setInventorySection("All"); setInventoryCategory("All"); setInventorySearch(""); /* logic to filter low stock */ }}
                        className="text-[9px] font-bold text-orange-400 mt-2 uppercase tracking-widest block hover:underline"
                      >
                        Needs Restocking
                      </button>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:rotate-12 transition-transform duration-500">
                      <ShieldCheck className="w-32 h-32 text-slate-900 dark:text-white" />
                    </div>
                  </div>

                  <div className="bg-slate-900 dark:bg-white p-8 rounded-[32px] border border-slate-800 dark:border-slate-200 shadow-2xl shadow-slate-900/20 relative overflow-hidden group animate-in zoom-in-95 duration-500">
                    <div className="relative z-10">
                      <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Inventory Value</p>
                      <h4 className="text-4xl font-black text-white">R{inventoryStats.totalValue.toLocaleString()}</h4>
                      <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-2">Current Asset Value</p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:-rotate-12 transition-transform duration-500">
                      <Banknote className="w-32 h-32 text-white" />
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
                        {/* Image/Icon Header */}
                        <div className="h-60 bg-slate-50 dark:bg-[#0B1120] relative overflow-hidden flex items-center justify-center">
                          <img 
                            src={getProductImage(product)} 
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                            referrerPolicy="no-referrer"
                          />
                          
                          {/* Floating Labels */}
                          <div className="absolute top-6 left-6 flex flex-col gap-2">
                             {isLowStock && (
                              <div className="px-3 py-1.5 bg-orange-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-xl">
                                Low Stock
                              </div>
                            )}
                            <div className="px-3 py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-900 dark:text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm border border-white/20">
                              {product.category}
                            </div>
                          </div>

                          {/* Quick Edit Trigger */}
                          <div className="absolute top-6 right-6 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                             <button 
                              onClick={() => setProductModal({ isOpen: true, product })}
                              className="w-10 h-10 bg-white dark:bg-slate-900 shadow-xl rounded-2xl flex items-center justify-center text-slate-900 dark:text-white hover:bg-slate-900 dark:hover:bg-white hover:text-white dark:hover:text-slate-900 transition-all ring-4 ring-white/50"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-8 space-y-6">
                          <div className="space-y-2">
                            <div className="flex justify-between items-start gap-4">
                              <h3 className="font-black text-xl text-slate-900 dark:text-white leading-tight">{product.name}</h3>
                              <p className="text-xl font-black text-primary">R{product.price.toFixed(2)}</p>
                            </div>
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{product.barcode || 'NO SERIAL'}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-4 pb-6 border-b border-slate-50">
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

                          {/* Quick Stock Controls */}
                          <div className="flex gap-2">
                            <button 
                              onClick={async () => {
                                const ref = doc(db, "products", product.id);
                                await updateDoc(ref, { stock: Math.max(0, (product.stock || 0) - 1) });
                              }}
                              className="flex-1 py-4 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all border border-transparent hover:border-red-100"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={async () => {
                                const ref = doc(db, "products", product.id);
                                await updateDoc(ref, { stock: (product.stock || 0) + 1 });
                              }}
                              className="flex-1 py-4 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-500 transition-all border border-transparent hover:border-emerald-100"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button 
                               onClick={() => setProductModal({ isOpen: true, product })}
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
}