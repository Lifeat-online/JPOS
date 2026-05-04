import { usePosStore } from '../store/usePosStore';
import React, { useState } from 'react';
import { AppConfig, CategoryTree, BusinessSettings } from '../types';
import { Save, Store, CreditCard, Layers, Plus, Trash2, X, Receipt, Calculator, Award, Settings2 } from 'lucide-react';
import { getTenantCollection, getTenantDoc } from '../tenantHelper';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_CATEGORY_TREE } from '../App';

export function SettingsView({ config, setConfig }: { config: AppConfig, setConfig: (c: AppConfig) => void }) {
  const tenantId = usePosStore(state => state.tenantId);
  const [formData, setFormData] = useState<AppConfig>({
    ...config,
    categories: config.categories || DEFAULT_CATEGORY_TREE
  });
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'business' | 'payment' | 'categories' | 'features' | 'printing' | 'tax' | 'loyalty'>('business');

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setDoc(getTenantDoc(db, tenantId, "settings", "app"), formData, { merge: true });
      setConfig(formData);
      alert("Settings saved successfully!");
    } catch (e) {
      console.error(e);
      alert("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const [categoryInput, setCategoryInput] = useState<{ isOpen: boolean, type: 'section'|'category'|'subcategory', section?: string, category?: string }>({ isOpen: false, type: 'section' });
  const [inputValue, setInputValue] = useState("");

  const addSection = () => {
    setCategoryInput({ isOpen: true, type: 'section' });
    setInputValue("");
  };

  const addCategory = (section: string) => {
    setCategoryInput({ isOpen: true, type: 'category', section });
    setInputValue("");
  };

  const addSubCategory = (section: string, category: string) => {
    setCategoryInput({ isOpen: true, type: 'subcategory', section, category });
    setInputValue("");
  };

  const handleInputSubmit = () => {
    if (!inputValue.trim()) return;
    const name = inputValue.trim();
    if (categoryInput.type === 'section' && formData.categories) {
      setFormData({
        ...formData,
        categories: { ...formData.categories, [name]: {} }
      });
    } else if (categoryInput.type === 'category' && categoryInput.section && formData.categories) {
      setFormData({
        ...formData,
        categories: {
          ...formData.categories,
          [categoryInput.section]: {
            ...formData.categories[categoryInput.section],
            [name]: []
          }
        }
      });
    } else if (categoryInput.type === 'subcategory' && categoryInput.section && categoryInput.category && formData.categories) {
      setFormData({
        ...formData,
        categories: {
          ...formData.categories,
          [categoryInput.section]: {
            ...formData.categories[categoryInput.section],
            [categoryInput.category]: [...formData.categories[categoryInput.section][categoryInput.category], name]
          }
        }
      });
    }
    setCategoryInput({ isOpen: false, type: 'section' });
  };

  const removeSection = (section: string) => {
    if (formData.categories) {
      const newCats = { ...formData.categories };
      delete newCats[section];
      setFormData({ ...formData, categories: newCats });
    }
  };

  const removeCategory = (section: string, category: string) => {
    if (formData.categories) {
      const newCats = { ...formData.categories };
      delete newCats[section][category];
      setFormData({ ...formData, categories: newCats });
    }
  };

  const removeSubCategory = (section: string, category: string, subCategory: string) => {
    if (formData.categories) {
      const newCats = { ...formData.categories };
      newCats[section][category] = newCats[section][category].filter(s => s !== subCategory);
      setFormData({ ...formData, categories: newCats });
    }
  };

  return (
    <div className="flex-1 p-4 lg:p-8 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Settings</h2>
          <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Application Configuration</p>
        </div>

        <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('business')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'business' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Store className="w-4 h-4" />
            General
          </button>
          <button 
            onClick={() => setActiveTab('features')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'features' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Settings2 className="w-4 h-4" />
            Features
          </button>
          <button 
            onClick={() => setActiveTab('payment')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'payment' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <CreditCard className="w-4 h-4" />
            Payments
          </button>
          <button 
            onClick={() => setActiveTab('tax')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'tax' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Calculator className="w-4 h-4" />
            Tax
          </button>
          <button 
            onClick={() => setActiveTab('printing')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'printing' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Receipt className="w-4 h-4" />
            Receipts
          </button>
          <button 
            onClick={() => setActiveTab('loyalty')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'loyalty' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Award className="w-4 h-4" />
            Loyalty
          </button>
          <button 
            onClick={() => setActiveTab('categories')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'categories' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <Layers className="w-4 h-4" />
            Categories
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-6">
          {activeTab === 'business' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Business Name</label>
                  <input 
                    type="text" 
                    value={formData.business?.name || ''}
                    onChange={e => setFormData({...formData, business: {...formData.business, name: e.target.value}} as AppConfig)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Logo URL</label>
                  <input 
                    type="url" 
                    value={formData.business?.logoUrl || ''}
                    onChange={e => setFormData({...formData, business: {...formData.business, logoUrl: e.target.value}} as AppConfig)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Address</label>
                  <input 
                    type="text" 
                    value={formData.business?.address || ''}
                    onChange={e => setFormData({...formData, business: {...formData.business, address: e.target.value}} as AppConfig)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Phone</label>
                  <input 
                    type="text" 
                    value={formData.business?.phone || ''}
                    onChange={e => setFormData({...formData, business: {...formData.business, phone: e.target.value}} as AppConfig)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Currency Symbol</label>
                  <input 
                    type="text" 
                    value={formData.business?.currency || ''}
                    onChange={e => setFormData({...formData, business: {...formData.business, currency: e.target.value}} as AppConfig)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'features' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <input 
                    type="checkbox" 
                    id="restaurantMode"
                    checked={formData.business?.isRestaurantMode || false}
                    onChange={e => setFormData({...formData, business: {...formData.business, isRestaurantMode: e.target.checked}} as AppConfig)}
                    className="w-5 h-5 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                  />
                  <div>
                    <label htmlFor="restaurantMode" className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer block">Restaurant Mode</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Enable Table Management, Kitchen workstations, and course firing.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <input 
                    type="checkbox" 
                    id="loyaltyMode"
                    checked={formData.business?.enableLoyalty || false}
                    onChange={e => setFormData({...formData, business: {...formData.business, enableLoyalty: e.target.checked}} as AppConfig)}
                    className="w-5 h-5 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                  />
                  <div>
                    <label htmlFor="loyaltyMode" className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer block">Loyalty Program</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Allow customers to earn points on purchases and redeem them as discounts.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'payment' && (
            <div className="space-y-8">
              <div className="space-y-4">
                 <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Accepted Methods</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <input 
                      type="checkbox" 
                      id="enableCash"
                      checked={formData.enableCash !== false}
                      onChange={e => setFormData({...formData, enableCash: e.target.checked})}
                      className="w-5 h-5 rounded text-primary"
                    />
                    <label htmlFor="enableCash" className="text-sm font-bold dark:text-white">Cash</label>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <input 
                      type="checkbox" 
                      id="enableCard"
                      checked={formData.enableCard !== false}
                      onChange={e => setFormData({...formData, enableCard: e.target.checked})}
                      className="w-5 h-5 rounded text-primary"
                    />
                    <label htmlFor="enableCard" className="text-sm font-bold dark:text-white">Card Terminal</label>
                  </div>
                 </div>
              </div>
              
              <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">PayFast Integration</h3>
                  <p className="text-xs text-slate-500 mt-1">Accept online payments or payment links via PayFast.</p>
                </div>
                
                <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50">
                  <input 
                    type="checkbox" 
                    id="sandbox"
                    checked={formData.payfastSandbox}
                    onChange={e => setFormData({...formData, payfastSandbox: e.target.checked})}
                    className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 accent-blue-600"
                  />
                  <label htmlFor="sandbox" className="text-sm font-bold text-blue-900 dark:text-blue-100 cursor-pointer">Enable PayFast Sandbox (Testing) Mode</label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Merchant ID</label>
                    <input 
                      type="text" 
                      value={formData.payfastMerchantId || ''}
                      onChange={e => setFormData({...formData, payfastMerchantId: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Merchant Key</label>
                    <input 
                      type="text" 
                      value={formData.payfastMerchantKey || ''}
                      onChange={e => setFormData({...formData, payfastMerchantKey: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Passphrase</label>
                    <input 
                      type="password" 
                      value={formData.payfastPassphrase || ''}
                      onChange={e => setFormData({...formData, payfastPassphrase: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tax' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Tax/VAT Name</label>
                  <input 
                    type="text" 
                    value={formData.business?.taxName || 'VAT'}
                    onChange={e => setFormData({...formData, business: {...formData.business, taxName: e.target.value}} as AppConfig)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                    placeholder="e.g. VAT, Sales Tax"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Tax Rate (%)</label>
                  <input 
                    type="number" 
                    value={formData.business?.taxRate || ''}
                    onChange={e => setFormData({...formData, business: {...formData.business, taxRate: parseFloat(e.target.value)}} as AppConfig)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none"
                  />
                </div>
                
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <input 
                      type="checkbox" 
                      id="taxInclusive"
                      checked={formData.business?.taxInclusive !== false}
                      onChange={e => setFormData({...formData, business: {...formData.business, taxInclusive: e.target.checked}} as AppConfig)}
                      className="w-5 h-5 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                    />
                    <div>
                      <label htmlFor="taxInclusive" className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer block">Prices Include Tax</label>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">If enabled, tax is calculated backwards from the printed prices. If disabled, tax is added to the subtotal.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'printing' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Receipt Header Format</label>
                  <textarea 
                    value={formData.business?.receiptHeader || ''}
                    onChange={e => setFormData({...formData, business: {...formData.business, receiptHeader: e.target.value}} as AppConfig)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-mono dark:text-white outline-none min-h-[100px]"
                    placeholder="E.g. Welcome to Our Store!&#10;Follow us on Insta @store"
                  />
                  <p className="text-xs text-slate-500">Placed at the very top of print receipts.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500">Receipt Footer Messages</label>
                  <textarea 
                    value={formData.business?.receiptFooter || ''}
                    onChange={e => setFormData({...formData, business: {...formData.business, receiptFooter: e.target.value}} as AppConfig)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-mono dark:text-white outline-none min-h-[100px]"
                    placeholder="E.g. Thank you for your business!&#10;Please keep this receipt for returns."
                  />
                  <p className="text-xs text-slate-500">Placed at the very bottom of print receipts.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'loyalty' && (
            <div className="space-y-6">
              {formData.business?.enableLoyalty ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Points Earned Per [Currency Spent]</label>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-slate-500">Earn 1 point for every</span>
                      <input 
                        type="number"
                        min="1"
                        value={formData.business?.pointsEarnedPerCurrency || ''}
                        onChange={e => setFormData({...formData, business: {...formData.business, pointsEarnedPerCurrency: parseFloat(e.target.value)}} as AppConfig)}
                        className="w-32 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold text-center dark:text-white outline-none"
                        placeholder="10"
                      />
                      <span className="text-sm font-bold text-slate-500">{formData.business?.currency || 'USD'} spent.</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 sm:col-span-2 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Discount Redemption Value</label>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-slate-500">Redeem</span>
                      <input 
                        type="number"
                        min="1"
                        value={formData.business?.pointsRequiredForDiscount || ''}
                        onChange={e => setFormData({...formData, business: {...formData.business, pointsRequiredForDiscount: parseFloat(e.target.value)}} as AppConfig)}
                        className="w-32 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold text-center dark:text-white outline-none"
                        placeholder="100"
                      />
                      <span className="text-sm font-bold text-slate-500">points for a discount of</span>
                      <input 
                        type="number"
                        min="1"
                        value={formData.business?.discountAmountForPoints || ''}
                        onChange={e => setFormData({...formData, business: {...formData.business, discountAmountForPoints: parseFloat(e.target.value)}} as AppConfig)}
                        className="w-32 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold text-center dark:text-white outline-none"
                        placeholder="10"
                      />
                      <span className="text-sm font-bold text-slate-500">{formData.business?.currency || 'USD'}.</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center p-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <Award className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Loyalty is Disabled</h3>
                  <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">Enable the loyalty program in the Features tab to let your customers earn points on their purchases.</p>
                  <button 
                    onClick={() => setActiveTab('features')}
                    className="px-6 py-2 bg-white dark:bg-slate-900 text-primary border border-slate-200 dark:border-slate-700 font-bold rounded-xl shadow-sm text-sm"
                  >
                    Go to Features
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'categories' && formData.categories && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">Product Hierarchy</h3>
                  <p className="text-xs text-slate-500 font-medium">Manage Sections &gt; Categories &gt; Sub Categories</p>
                </div>
                <button onClick={addSection} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 text-sm">
                  <Plus className="w-4 h-4" /> Section
                </button>
              </div>

              <div className="space-y-4">
                {Object.entries(formData.categories).map(([section, categories]) => (
                  <div key={section} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden p-1">
                    <div className="bg-slate-50 dark:bg-slate-800/80 p-3 flex justify-between items-center rounded-xl mb-1">
                      <h4 className="font-black text-slate-800 dark:text-white text-sm uppercase tracking-wider">{section}</h4>
                      <div className="flex gap-2">
                        <button onClick={() => addCategory(section)} className="bg-primary/10 text-primary p-1.5 flex items-center gap-1 text-xs font-bold rounded-lg hover:bg-primary/20"><Plus className="w-3 h-3" /> Category</button>
                        <button onClick={() => removeSection(section)} className="text-red-500 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    
                    <div className="space-y-2 p-2 pt-0">
                      {Object.entries(categories).map(([category, subcategories]) => (
                        <div key={category} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-xl ml-4">
                          <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-50 dark:border-slate-800/50">
                            <h5 className="font-bold text-slate-700 dark:text-slate-300 text-sm">{category}</h5>
                            <div className="flex gap-2">
                              <button onClick={() => addSubCategory(section, category)} className="text-slate-400 hover:text-primary text-xs font-bold flex items-center gap-1"><Plus className="w-3 h-3"/> Subcategory</button>
                              <button onClick={() => removeCategory(section, category)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {subcategories.map(subCategory => (
                              <div key={subCategory} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400">
                                {subCategory}
                                <button onClick={() => removeSubCategory(section, category, subCategory)} className="text-slate-400 hover:text-red-500 ml-1"><X className="w-3 h-3" /></button>
                              </div>
                            ))}
                            {subcategories.length === 0 && <span className="text-xs text-slate-400 font-medium italic">No subcategories</span>}
                          </div>
                        </div>
                      ))}
                      {Object.keys(categories).length === 0 && <div className="text-xs text-slate-400 font-medium italic p-2 ml-4">No categories</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="px-8 py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
            >
              {isSaving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>

      {categoryInput.isOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl w-full max-w-sm">
            <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">
              Add {categoryInput.type.charAt(0).toUpperCase() + categoryInput.type.slice(1)}
            </h3>
            {categoryInput.section && <p className="text-xs text-slate-500 mb-2">in {categoryInput.section} {categoryInput.category ? `> ${categoryInput.category}` : ''}</p>}
            <input 
              autoFocus
              type="text" 
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mb-6"
              placeholder={`Enter ${categoryInput.type} name...`}
              onKeyDown={e => { if (e.key === 'Enter') handleInputSubmit(); }}
            />
            <div className="flex gap-2 justify-end">
              <button 
                onClick={() => setCategoryInput({ isOpen: false, type: 'section' })}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl"
              >
                Cancel
              </button>
              <button 
                onClick={handleInputSubmit}
                disabled={!inputValue.trim()}
                className="px-4 py-2 bg-primary text-white font-bold rounded-xl disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
