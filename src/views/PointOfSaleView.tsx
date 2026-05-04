import React, { useState, useMemo } from 'react';
import { 
  ShoppingBag, Search, Plus, Minus, Trash2, CreditCard, Banknote, 
  ShoppingCart, Loader2, QrCode, Users, ChefHat, Utensils, Maximize, Lock, X, StickyNote, Wallet, TabletSmartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Customer, AppConfig, Staff } from '../types';
import { CustomerSelector } from '../components/CustomerSelector';
import { usePosStore } from '../store/usePosStore';

interface PointOfSaleViewProps {
  products: Product[];
  customers: Customer[];
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
  handleSaveOrder: (sendToKitchen: boolean) => Promise<void>;
  handleCheckout: (method: 'cash' | 'payfast' | 'card') => Promise<void>;
  handleWalletCheckout: () => Promise<void>;
  handleOpenTab: (tabName?: string) => Promise<void>;
  setTenderModal: (modal: { isOpen: boolean, method: 'cash' | 'card' | null }) => void;
  setTenderedAmount: (amount: string) => void;
  categoryTree: any;
  CATEGORIES: string[];
  getCategoryIcon: (cat: string) => string;
  getProductImage: (product: Partial<Product>) => string;
  openCashDrawer: () => void;
  pointsDiscount: number;
  onRedeemPoints: (customerId: string, points: number) => void;
  onClearPointsDiscount: () => void;
}

export const PointOfSaleView: React.FC<PointOfSaleViewProps> = ({
  products, customers, isProcessing, setIsProcessing, handleSaveOrder, 
  handleCheckout, handleWalletCheckout, handleOpenTab, setTenderModal, setTenderedAmount,
  categoryTree, CATEGORIES, getCategoryIcon, getProductImage, openCashDrawer,
  pointsDiscount, onRedeemPoints, onClearPointsDiscount,
}) => {
  const { 
    cart, addToCart, updateQuantity, clearCart, 
    activeSession, activeCategory, setActiveCategory,
    searchQuery, setSearchQuery, selectedCustomerId, setSelectedCustomerId,
    activeTableNumber, setActiveTableNumber, activeOrderId, setActiveOrderId,
    currentUserStaff, config,
    isCartOpen, setIsCartOpen,
  } = usePosStore();

  const [isScanning, setIsScanning] = useState(false);

  const cartTotal = useMemo(() => cart.reduce((total, item) => total + (item.price * item.quantity), 0), [cart]);

  const allowedCategories = useMemo(() => {
    if (!currentUserStaff || currentUserStaff.role !== 'cashier') return CATEGORIES;
    const hasSectionRestriction = currentUserStaff.assignedSections && currentUserStaff.assignedSections.length > 0;
    const hasCategoryRestriction = currentUserStaff.assignedCategories && currentUserStaff.assignedCategories.length > 0;
    
    if (!hasSectionRestriction && !hasCategoryRestriction) return CATEGORIES;

    const allowedCatSet = new Set<string>();
    
    if (hasSectionRestriction) {
      currentUserStaff.assignedSections!.forEach(sec => {
        Object.keys(categoryTree[sec] || {}).forEach(cat => allowedCatSet.add(cat));
      });
    }
    
    if (hasCategoryRestriction) {
      currentUserStaff.assignedCategories!.forEach(cat => allowedCatSet.add(cat));
    }

    return ["All", ...Array.from(allowedCatSet)];
  }, [currentUserStaff, categoryTree, CATEGORIES]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (currentUserStaff && currentUserStaff.role === 'cashier') {
        const hasSectionRestriction = currentUserStaff.assignedSections && currentUserStaff.assignedSections.length > 0;
        const hasCategoryRestriction = currentUserStaff.assignedCategories && currentUserStaff.assignedCategories.length > 0;
        
        if (hasSectionRestriction || hasCategoryRestriction) {
          const sectionAllowed = hasSectionRestriction && currentUserStaff.assignedSections!.includes(p.section || '');
          const categoryAllowed = hasCategoryRestriction && currentUserStaff.assignedCategories!.includes(p.category);
          
          if (!sectionAllowed && !categoryAllowed) return false;
        }
      }

      const matchesCategory = activeCategory === "All" || p.category === activeCategory;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategory, searchQuery, currentUserStaff]);

  if (!activeSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 max-w-md w-full shadow-2xl text-center border border-slate-100 dark:border-slate-800/60">
          <div className="w-20 h-20 bg-orange-50 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
             <Lock className="w-10 h-10 text-orange-500" />
          </div>
          <h3 className="text-2xl font-black mb-2 tracking-tight text-slate-900 dark:text-white">Register Closed</h3>
          <p className="text-slate-500 font-medium mb-8">You must open the register and declare a starting float before processing transactions.</p>
          <button onClick={openCashDrawer} className="w-full py-4 bg-primary text-white rounded-xl font-bold uppercase tracking-widest text-sm shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
            Open Register
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">
      <nav className="w-full lg:w-24 bg-white dark:bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-700/60 flex lg:flex-col items-center py-2 lg:py-6 px-4 lg:px-0 gap-3 lg:gap-6 overflow-x-auto no-scrollbar shrink-0 shadow-sm lg:shadow-none z-10">
        {allowedCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`min-w-[80px] lg:w-16 h-12 lg:h-16 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border-2 shrink-0 ${
              activeCategory === cat 
              ? 'bg-[#eff6ff] text-primary border-[#bfdbfe] shadow-sm' 
              : 'text-slate-400 dark:text-slate-500 border-transparent bg-slate-50 dark:bg-[#0B1120] lg:bg-transparent lg:dark:bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="text-base lg:text-xl">{cat === 'All' ? '🏠' : getCategoryIcon(cat)}</span>
            <span className="text-[9px] lg:text-[10px] font-bold uppercase tracking-wide">{cat}</span>
          </button>
        ))}
      </nav>

      <section className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-50/30">
        <div className="p-4 lg:p-6 pb-2 flex flex-col sm:flex-row gap-3 lg:gap-4 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search products..."
              className="w-full pl-12 pr-12 py-3 lg:py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-medium transition-all shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button 
              onClick={() => setIsScanning(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-slate-50 dark:bg-[#0B1120] text-primary rounded-lg hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95"
              title="Scan Barcode"
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
          <div className="sm:w-80 relative">
            <CustomerSelector 
              customers={customers}
              selectedId={selectedCustomerId}
              onSelect={setSelectedCustomerId}
              onAddNew={() => {}}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 pt-2 grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:gap-4 auto-rows-max lg:auto-rows-[160px] pb-24 lg:pb-6">
          <AnimatePresence>
            {filteredProducts.map(product => (
              <motion.div
                key={product.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => addToCart(product)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 flex lg:flex-col justify-between items-center lg:items-start cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800 relative group shadow-sm active:border-primary gap-4 lg:gap-0"
              >
                <div className="w-12 h-12 lg:w-10 lg:h-10 bg-slate-50 dark:bg-[#0B1120] rounded-xl flex items-center justify-center text-xl lg:text-lg group-hover:scale-110 transition-transform shrink-0 overflow-hidden">
                  <img src={getProductImage(product)} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm leading-tight mb-0.5 text-slate-900 dark:text-white truncate">{product.name}</div>
                  <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{product.category}</div>
                  <div className="lg:hidden flex items-baseline gap-2 mt-1">
                     <span className="font-extrabold text-primary">R{product.price.toFixed(2)}</span>
                     <span className="text-[8px] font-black text-slate-300 dark:text-slate-600">{product.stock} Units</span>
                  </div>
                </div>
                <div className="hidden lg:flex items-end justify-between w-full mt-2">
                  <div className="font-extrabold text-lg text-primary tracking-tight">R{product.price.toFixed(2)}</div>
                  <div className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${product.stock < 10 ? 'bg-red-50 text-red-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                    {product.stock}
                  </div>
                </div>
                <div className="absolute top-2 right-2 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1.5">
                  <div className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all shadow-sm" onClick={(e) => { e.stopPropagation(); addToCart(product); }}>
                    <Plus className="w-4 h-4" />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>

      <AnimatePresence>
        {(isCartOpen || window.innerWidth >= 1024) && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[45]"
            />
            <motion.aside 
              initial={window.innerWidth < 1024 ? { y: '100%' } : { x: '100%' }}
              animate={window.innerWidth < 1024 ? { y: 0 } : { x: 0 }}
              exit={window.innerWidth < 1024 ? { y: '100%' } : { x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed bottom-0 left-0 right-0 lg:relative lg:inset-auto z-50 lg:z-10 w-full lg:w-[360px] max-h-[90vh] lg:max-h-none bg-white dark:bg-slate-900 lg:border-l border-slate-200 dark:border-slate-700/60 flex flex-col flex-shrink-0 shadow-2xl rounded-t-3xl lg:rounded-none overflow-hidden`}
            >
              <div className="p-5 border-b border-slate-200 dark:border-slate-700/60 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 z-10">
                <div>
                  <h2 className="font-extrabold text-lg flex items-center gap-2 text-slate-900 dark:text-white">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                    Current Order
                  </h2>
                  {activeOrderId && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Order Sent · #{activeOrderId.slice(-6).toUpperCase()}</span>
                    </div>
                  )}
                  {selectedCustomerId && (
                    <div className="flex flex-col gap-1 mt-1">
                      <div className="flex items-center gap-1 text-[10px] font-black text-primary uppercase tracking-widest">
                        <Users className="w-3 h-3" />
                        {customers.find(c => c.id === selectedCustomerId)?.name}
                      </div>
                      <div className="text-[9px] font-bold text-slate-500">
                        {customers.find(c => c.id === selectedCustomerId)?.points || 0} Points Available
                      </div>
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => setIsCartOpen(false)}
                  className="lg:hidden p-2 bg-slate-50 dark:bg-[#0B1120] rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/50 min-h-[200px]">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 opacity-50 space-y-2 text-center p-8 grayscale">
                    <ShoppingBag className="w-12 h-12" />
                    <p className="text-xs font-black uppercase tracking-widest">Cart is empty</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl flex items-center justify-between border border-slate-100 dark:border-slate-800/60 shadow-sm transition-all hover:border-primary/20">
                      <div className="flex-1 pr-4 min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{item.name}</p>
                        <p className="text-xs font-black text-primary mt-0.5">R{(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-4 bg-slate-50 dark:bg-[#0B1120] rounded-xl p-1 shrink-0">
                        <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-lg text-xs font-black shadow-sm active:scale-90">-</button>
                        <span className="font-black text-xs w-4 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 flex items-center justify-center bg-primary text-white rounded-lg text-xs font-black shadow-sm active:scale-90">+</button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-5 lg:p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/60 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] sticky bottom-0">
                {config?.business?.isRestaurantMode && activeTableNumber && (
                  <div className="flex justify-between items-center mb-4 p-3 bg-primary/10 rounded-xl border border-primary/20">
                    <span className="font-bold text-primary flex items-center gap-2"><Utensils className="w-4 h-4"/> Table {activeTableNumber}</span>
                    <button onClick={() => { setActiveTableNumber(null); setActiveOrderId(null); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">Clear</button>
                  </div>
                )}
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <span className="font-bold text-slate-400 dark:text-slate-500 text-xs uppercase tracking-widest block">Grand Total</span>
                    {selectedCustomerId && (() => {
                      const customer = customers.find(c => c.id === selectedCustomerId);
                      const pts = customer?.loyaltyPoints || customer?.points || 0;
                      const canRedeem = config?.business?.enableLoyalty &&
                        config?.business?.pointsRequiredForDiscount &&
                        pts >= config.business.pointsRequiredForDiscount;
                      return pts > 0 ? (
                        <div className="flex items-center gap-2 mt-1">
                          {pointsDiscount > 0 ? (
                            <button
                              onClick={onClearPointsDiscount}
                              className="text-[9px] font-bold text-red-500 hover:underline"
                            >
                              Remove discount (−R{pointsDiscount.toFixed(2)})
                            </button>
                          ) : canRedeem ? (
                            <button
                              onClick={() => onRedeemPoints(selectedCustomerId, pts)}
                              className="text-[9px] font-bold text-primary hover:underline"
                            >
                              Redeem {pts} pts → −R{Math.min(
                                Math.floor(pts / config!.business!.pointsRequiredForDiscount!) * config!.business!.discountAmountForPoints!,
                                cartTotal
                              ).toFixed(2)}
                            </button>
                          ) : (
                            <span className="text-[9px] font-bold text-slate-400">{pts} pts (need {config?.business?.pointsRequiredForDiscount} to redeem)</span>
                          )}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div className="text-right">
                    {pointsDiscount > 0 && (
                      <div className="text-xs font-bold text-slate-400 line-through">R{(cartTotal + pointsDiscount).toFixed(2)}</div>
                    )}
                    <span className="font-black text-4xl text-slate-900 dark:text-white tracking-tighter">R{cartTotal.toFixed(2)}</span>
                    {pointsDiscount > 0 && (
                      <div className="text-[10px] font-bold text-emerald-500">−R{pointsDiscount.toFixed(2)} discount applied</div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <button 
                    disabled={isProcessing || cart.length === 0}
                    onClick={() => { setTenderModal({ isOpen: true, method: 'cash' }); setTenderedAmount(''); }}
                    className="flex flex-col items-center justify-center gap-2 h-20 rounded-2xl bg-emerald-600 text-white font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 shadow-lg shadow-emerald-600/30"
                  >
                    <Banknote className="w-5 h-5" />
                    <span className="text-[9px] uppercase tracking-widest">CASH</span>
                  </button>
                  <button 
                    disabled={isProcessing || cart.length === 0}
                    onClick={() => { setTenderModal({ isOpen: true, method: 'card' }); setTenderedAmount(''); }}
                    className="flex flex-col items-center justify-center gap-2 h-20 rounded-2xl bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 shadow-lg shadow-slate-800/30"
                  >
                    <CreditCard className="w-5 h-5" />
                    <span className="text-[9px] uppercase tracking-widest">CARD</span>
                  </button>
                  <button 
                    disabled={isProcessing || cart.length === 0}
                    onClick={() => handleCheckout('payfast')}
                    className="flex flex-col items-center justify-center gap-2 h-20 rounded-2xl bg-[#E84E1B] text-white font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 shadow-lg shadow-payfast/20"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                    <span className="text-[9px] uppercase tracking-widest">PAYFAST</span>
                  </button>
                </div>

                {/* Wallet payment — only shown if staff has a balance */}
                {currentUserStaff && (currentUserStaff.walletBalance || 0) > 0 && (
                  <button
                    disabled={isProcessing || cart.length === 0 || (currentUserStaff.walletBalance || 0) < cartTotal}
                    onClick={handleWalletCheckout}
                    className="w-full mb-4 h-14 rounded-2xl bg-violet-600 text-white font-black transition-all hover:shadow-lg disabled:opacity-40 active:scale-95 shadow-lg shadow-violet-600/30 flex items-center justify-center gap-3 text-xs uppercase tracking-widest"
                  >
                    <Wallet className="w-4 h-4" />
                    Pay with Wallet
                    <span className="ml-auto bg-white/20 px-2 py-0.5 rounded-lg text-[10px]">
                      R{(currentUserStaff.walletBalance || 0).toFixed(2)} available
                    </span>
                  </button>
                )}

                {config?.business?.isRestaurantMode && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button 
                      disabled={isProcessing || cart.length === 0}
                      onClick={() => handleSaveOrder(false)}
                      className="h-14 rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 text-xs uppercase tracking-widest flex items-center justify-center gap-2 border border-orange-200 dark:border-orange-800/50"
                    >
                      <span className="truncate">Hold</span>
                    </button>
                    <button 
                      disabled={isProcessing || cart.length === 0}
                      onClick={() => handleSaveOrder(true)}
                      className="h-14 rounded-2xl bg-orange-500 text-white font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 shadow-lg shadow-orange-500/30 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <ChefHat className="w-4 h-4 shrink-0" />}
                      <span className="truncate">Send Order</span>
                    </button>
                  </div>
                )}

                {/* Bar Tab — only when a customer is selected */}
                {config?.business?.isRestaurantMode && selectedCustomerId && (
                  <button
                    disabled={isProcessing || cart.length === 0}
                    onClick={() => handleOpenTab(customers.find(c => c.id === selectedCustomerId)?.name)}
                    className="w-full mb-4 h-14 rounded-2xl bg-indigo-600 text-white font-black transition-all hover:shadow-lg disabled:opacity-40 active:scale-95 shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-3 text-xs uppercase tracking-widest"
                  >
                    <TabletSmartphone className="w-4 h-4" />
                    {activeOrderId ? 'Update Tab' : 'Open Tab'}
                    <span className="ml-auto bg-white/20 px-2 py-0.5 rounded-lg text-[10px]">
                      {customers.find(c => c.id === selectedCustomerId)?.name}
                    </span>
                  </button>
                )}
                
                <div className="flex gap-2">
                  <button onClick={() => clearCart()} title="Clear Cart" className="h-14 w-14 bg-slate-50 dark:bg-[#0B1120] text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-50 transition-all border border-slate-100 dark:border-slate-800/60 active:scale-95 shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button title="Add Note" className="flex-1 h-14 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center hover:bg-slate-100 dark:bg-slate-800 transition-all border border-slate-100 dark:border-slate-800/60 active:scale-95 gap-2">
                    <StickyNote className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Note</span>
                  </button>
                  <button onClick={openCashDrawer} title="Cash Drawer" className="flex-1 h-14 bg-slate-50 dark:bg-[#0B1120] text-emerald-500 rounded-2xl flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-100 transition-all border border-slate-100 dark:border-slate-800/60 active:scale-95 gap-2">
                    <Banknote className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Drawer</span>
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
