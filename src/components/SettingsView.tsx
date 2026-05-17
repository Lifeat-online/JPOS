import { usePosStore } from '../store/usePosStore';
import React, { useState, useEffect, useCallback } from 'react';
import { AppConfig, Workstation, TableSection, RestaurantTable } from '../types';
import { Save, Store, CreditCard, Layers, Plus, Trash2, X, Receipt, Calculator, Award, Settings2, ChefHat, Loader2, PackageCheck } from 'lucide-react';
import { DEFAULT_CATEGORY_TREE } from '../constants';
import { apiGet, apiPut, apiPost, apiDelete, getTenantPackageLimits, type TenantPackageLimitsResponse } from '../api';
import { JPOS_PACKAGES } from '../../shared/packageCatalog';

export function SettingsView({ config, setConfig }: { config: AppConfig, setConfig: (c: AppConfig) => void }) {
  const tenantId = usePosStore(state => state.tenantId);
  const [formData, setFormData] = useState<AppConfig>({
    ...config,
    categories: config.categories || DEFAULT_CATEGORY_TREE
  });
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'business' | 'package' | 'payment' | 'categories' | 'features' | 'printing' | 'tax' | 'loyalty' | 'workstations' | 'tables'>('business');
  const [packageLimits, setPackageLimits] = useState<TenantPackageLimitsResponse | null>(null);

  // Workstations state
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const [wsModal, setWsModal] = useState<{ isOpen: boolean; ws: Partial<Workstation> | null }>({ isOpen: false, ws: null });
  const [wsSaving, setWsSaving] = useState(false);

  // ── Tables & Sections state ──────────────────────────────────────────────────
  const [sections, setSections] = useState<TableSection[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [sectionModal, setSectionModal] = useState<{ isOpen: boolean; section: Partial<TableSection> | null }>({ isOpen: false, section: null });
  const [tableModal, setTableModal] = useState<{ isOpen: boolean; table: Partial<RestaurantTable> | null }>({ isOpen: false, table: null });
  const [tableSaving, setTableSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [ws, sects, tabs, limits] = await Promise.all([
        apiGet<Workstation[]>(`/api/mariadb/tenants/${tenantId}/workstations`),
        apiGet<TableSection[]>(`/api/mariadb/tenants/${tenantId}/table-sections`),
        apiGet<RestaurantTable[]>(`/api/mariadb/tenants/${tenantId}/restaurant-tables`),
        getTenantPackageLimits(tenantId),
      ]);
      setWorkstations(ws || []);
      setSections(sects || []);
      setTables(tabs || []);
      setPackageLimits(limits);
    } catch (err) {
      console.error('Settings data fetch error:', err);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const saveWorkstation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsModal.ws?.name || !tenantId) return;
    setWsSaving(true);
    try {
      const data = { name: wsModal.ws.name, type: wsModal.ws.type || 'kitchen', status: wsModal.ws.status || 'active' };
      if (wsModal.ws.id) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/workstations/${wsModal.ws.id}`, data);
      } else {
        await apiPost(`/api/mariadb/tenants/${tenantId}/workstations`, data);
      }
      await fetchData();
      setWsModal({ isOpen: false, ws: null });
    } catch (err) { console.error(err); }
    setWsSaving(false);
  };

  const deleteWorkstation = async (id: string) => {
    if (!tenantId || !confirm('Delete this workstation?')) return;
    try {
      await apiDelete(`/api/mariadb/tenants/${tenantId}/workstations/${id}`);
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const saveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionModal.section?.name || !tenantId) return;
    setTableSaving(true);
    try {
      const data = { name: sectionModal.section.name, color: sectionModal.section.color || 'blue', order: sectionModal.section.order ?? sections.length };
      if (sectionModal.section.id) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/table-sections/${sectionModal.section.id}`, data);
      } else {
        await apiPost(`/api/mariadb/tenants/${tenantId}/table-sections`, data);
      }
      await fetchData();
      setSectionModal({ isOpen: false, section: null });
    } catch (err) { console.error(err); }
    setTableSaving(false);
  };

  const saveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableModal.table?.label || !tableModal.table?.sectionId || !tenantId) return;
    setTableSaving(true);
    try {
      const data = {
        label: tableModal.table.label,
        sectionId: tableModal.table.sectionId,
        capacity: tableModal.table.capacity || null,
        status: tableModal.table.status || 'active',
      };
      if (tableModal.table.id) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/restaurant-tables/${tableModal.table.id}`, data);
      } else {
        await apiPost(`/api/mariadb/tenants/${tenantId}/restaurant-tables`, data);
      }
      await fetchData();
      setTableModal({ isOpen: false, table: null });
    } catch (err) { console.error(err); }
    setTableSaving(false);
  };

  const deleteSection = async (id: string) => {
    if (!tenantId || !confirm('Delete this section? Tables in it will also be removed.')) return;
    try {
      await apiDelete(`/api/mariadb/tenants/${tenantId}/table-sections/${id}`);
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const deleteTable = async (id: string) => {
    if (!tenantId || !confirm('Delete this table?')) return;
    try {
      await apiDelete(`/api/mariadb/tenants/${tenantId}/restaurant-tables/${id}`);
      await fetchData();
    } catch (err) { console.error(err); }
  };

  const handleSave = async () => {
    if (!tenantId) return;
    setIsSaving(true);
    try {
      await apiPut(`/api/mariadb/tenants/${tenantId}/settings/app`, formData);
      setConfig(formData);
      setPackageLimits(await getTenantPackageLimits(tenantId));
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

  const formatLimit = (value?: number) => value === -1 ? 'Unlimited' : Number(value || 0).toLocaleString();
  const packageTier = formData.business?.packageTier || packageLimits?.package.id || 'free';
  const selectedPackage = JPOS_PACKAGES.find(pkg => pkg.id === packageTier) || JPOS_PACKAGES[0];
  const canEditPackage = packageLimits?.source !== 'licence';

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
            onClick={() => setActiveTab('package')}
            className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'package' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
          >
            <PackageCheck className="w-4 h-4" />
            Package
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
          {config.business?.isRestaurantMode && (
            <button 
              onClick={() => setActiveTab('workstations')}
              className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'workstations' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
            >
              <ChefHat className="w-4 h-4" />
              Workstations
            </button>
          )}
          {config.business?.isRestaurantMode && (
            <button 
              onClick={() => setActiveTab('tables')}
              className={`pb-4 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${activeTab === 'tables' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
            >
              <Layers className="w-4 h-4" />
              Tables
            </button>
          )}
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

          {activeTab === 'package' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Current package</p>
                    <h3 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{selectedPackage.name}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{selectedPackage.limitsLabel}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Billing</p>
                    <p className="mt-1 text-lg font-black text-primary">{selectedPackage.priceLabel}</p>
                    <p className="mt-1 text-xs font-bold text-slate-400">{packageLimits?.source === 'licence' ? 'Signed licence' : 'Hosted workspace'}</p>
                  </div>
                </div>
              </div>

              {canEditPackage ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {JPOS_PACKAGES.filter(pkg => pkg.delivery === 'hosted_saas').map(pkg => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        business: { ...formData.business, packageTier: pkg.id }
                      } as AppConfig)}
                      className={`text-left rounded-2xl border p-4 transition-all ${packageTier === pkg.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-primary/40'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-900 dark:text-white">{pkg.name}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{pkg.description}</p>
                        </div>
                        <span className="text-sm font-black text-primary whitespace-nowrap">{pkg.priceLabel}</span>
                      </div>
                      <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">{pkg.limitsLabel}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                  This install is controlled by its signed licence key. Package changes must be issued from the licence console.
                </div>
              )}

              {packageLimits && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Products', used: packageLimits.usage.products, limit: packageLimits.package.maxProducts },
                    { label: 'Staff', used: packageLimits.usage.staff, limit: packageLimits.package.maxStaff },
                    { label: 'Customers', used: packageLimits.usage.customers, limit: packageLimits.package.maxCustomers },
                    { label: 'Open registers', used: packageLimits.usage.activeRegisters, limit: packageLimits.package.maxRegisters },
                  ].map(item => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">{item.label}</p>
                      <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">{formatLimit(item.used)} / {formatLimit(item.limit)}</p>
                    </div>
                  ))}
                </div>
              )}
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

          {activeTab === 'workstations' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">Workstations</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Kitchen, bar, and other production stations</p>
                </div>
                <button
                  onClick={() => setWsModal({ isOpen: true, ws: { type: 'kitchen', status: 'active' } })}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 text-sm active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" /> Add Workstation
                </button>
              </div>

              {workstations.length === 0 ? (
                <div className="py-12 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <ChefHat className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-400 dark:text-slate-500">No workstations yet</p>
                  <p className="text-xs text-slate-400 mt-1">Add a Kitchen, Bar, or other station</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {workstations.map(ws => (
                    <div key={ws.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          ws.type === 'kitchen' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' :
                          ws.type === 'bar' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                          'bg-slate-100 dark:bg-slate-700 text-slate-500'
                        }`}>
                          <ChefHat className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-sm">{ws.name}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{ws.type} · {ws.status}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setWsModal({ isOpen: true, ws })}
                          className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-primary hover:text-primary transition-all"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteWorkstation(ws.id)}
                          className="px-3 py-1.5 text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 transition-all"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'tables' && (
            <div className="space-y-6">
              {/* Sections */}
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">Floor Sections</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Group tables by area (e.g. Main Floor, Patio, Bar)</p>
                </div>
                <button
                  onClick={() => setSectionModal({ isOpen: true, section: { order: sections.length, color: 'blue' } })}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 text-sm active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" /> Add Section
                </button>
              </div>

              {sections.length === 0 ? (
                <div className="py-10 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <Layers className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-400 dark:text-slate-500">No sections yet — add one to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sections.map(section => {
                    const sectionTables = tables.filter(t => t.sectionId === section.id);
                    const colorMap: Record<string, string> = {
                      blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                      emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
                      orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
                      violet: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
                      red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
                      amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                    };
                    return (
                      <div key={section.id} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                        {/* Section header */}
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50">
                          <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest ${colorMap[section.color || 'blue'] || colorMap.blue}`}>
                              {section.name}
                            </span>
                            <span className="text-xs text-slate-400">{sectionTables.length} table{sectionTables.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setTableModal({ isOpen: true, table: { sectionId: section.id, status: 'active' } })}
                              className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-bold hover:bg-primary/20 transition-all"
                            >
                              <Plus className="w-3 h-3" /> Table
                            </button>
                            <button
                              onClick={() => setSectionModal({ isOpen: true, section })}
                              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400 hover:border-primary hover:text-primary transition-all"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteSection(section.id)}
                              className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-lg text-xs font-bold hover:bg-red-100 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Tables grid */}
                        {sectionTables.length > 0 && (
                          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {sectionTables.map(table => (
                              <div key={table.id} className={`flex items-center justify-between p-3 rounded-xl border ${table.status === 'inactive' ? 'opacity-50 border-slate-100 dark:border-slate-800' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>
                                <div>
                                  <p className="font-bold text-sm text-slate-900 dark:text-white">{table.label}</p>
                                  {table.capacity && <p className="text-[10px] text-slate-400">{table.capacity} seats</p>}
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={() => setTableModal({ isOpen: true, table })} className="p-1 text-slate-400 hover:text-primary transition-colors">
                                    <Plus className="w-3.5 h-3.5 rotate-45" />
                                  </button>
                                  <button onClick={() => deleteTable(table.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {sectionTables.length === 0 && (
                          <div className="p-4 text-center text-xs text-slate-400 font-medium">
                            No tables in this section yet
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Save button — hidden on workstations tab (it has its own save) */}
          {activeTab !== 'workstations' && activeTab !== 'tables' && (
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
          )}
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

      {/* Workstation modal */}
      {wsModal.isOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl w-full max-w-sm">
            <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">
              {wsModal.ws?.id ? 'Edit Workstation' : 'New Workstation'}
            </h3>
            <form onSubmit={saveWorkstation} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Name</label>
                <input
                  required autoFocus type="text"
                  value={wsModal.ws?.name || ''}
                  onChange={e => setWsModal({ ...wsModal, ws: { ...wsModal.ws, name: e.target.value } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                  placeholder="e.g. Main Kitchen, Bar, Sushi Station"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Type</label>
                <select
                  value={wsModal.ws?.type || 'kitchen'}
                  onChange={e => setWsModal({ ...wsModal, ws: { ...wsModal.ws, type: e.target.value as Workstation['type'] } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                >
                  <option value="kitchen">Kitchen</option>
                  <option value="bar">Bar</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Status</label>
                <select
                  value={wsModal.ws?.status || 'active'}
                  onChange={e => setWsModal({ ...wsModal, ws: { ...wsModal.ws, status: e.target.value as Workstation['status'] } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setWsModal({ isOpen: false, ws: null })} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl">Cancel</button>
                <button type="submit" disabled={wsSaving} className="flex-1 py-3 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                  {wsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Section modal */}
      {sectionModal.isOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl w-full max-w-sm">
            <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">
              {sectionModal.section?.id ? 'Edit Section' : 'New Section'}
            </h3>
            <form onSubmit={saveSection} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Section Name</label>
                <input
                  required autoFocus type="text"
                  value={sectionModal.section?.name || ''}
                  onChange={e => setSectionModal({ ...sectionModal, section: { ...sectionModal.section, name: e.target.value } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                  placeholder="e.g. Main Floor, Patio, Bar"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Colour</label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {['blue', 'emerald', 'orange', 'violet', 'red', 'amber'].map(c => (
                    <button
                      key={c} type="button"
                      onClick={() => setSectionModal({ ...sectionModal, section: { ...sectionModal.section, color: c } })}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${sectionModal.section?.color === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'} bg-${c}-400`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setSectionModal({ isOpen: false, section: null })} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl">Cancel</button>
                <button type="submit" disabled={tableSaving} className="flex-1 py-3 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                  {tableSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table modal */}
      {tableModal.isOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl w-full max-w-sm">
            <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">
              {tableModal.table?.id ? 'Edit Table' : 'New Table'}
            </h3>
            <form onSubmit={saveTable} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Table Label</label>
                <input
                  required autoFocus type="text"
                  value={tableModal.table?.label || ''}
                  onChange={e => setTableModal({ ...tableModal, table: { ...tableModal.table, label: e.target.value } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                  placeholder="e.g. Table 1, Bar Seat 3, Booth A"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Section</label>
                <select
                  required
                  value={tableModal.table?.sectionId || ''}
                  onChange={e => setTableModal({ ...tableModal, table: { ...tableModal.table, sectionId: e.target.value } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                >
                  <option value="">Select section...</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Capacity (optional)</label>
                <input
                  type="number" min="1"
                  value={tableModal.table?.capacity || ''}
                  onChange={e => setTableModal({ ...tableModal, table: { ...tableModal.table, capacity: parseInt(e.target.value) || undefined } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                  placeholder="e.g. 4"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Status</label>
                <select
                  value={tableModal.table?.status || 'active'}
                  onChange={e => setTableModal({ ...tableModal, table: { ...tableModal.table, status: e.target.value as 'active' | 'inactive' } })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 ring-primary/20 text-sm font-bold dark:text-white outline-none mt-1"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setTableModal({ isOpen: false, table: null })} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl">Cancel</button>
                <button type="submit" disabled={tableSaving} className="flex-1 py-3 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                  {tableSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
