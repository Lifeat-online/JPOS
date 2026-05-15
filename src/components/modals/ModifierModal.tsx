import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Layers, Settings2, CheckCircle2, ChevronRight, RefreshCcw } from 'lucide-react';
import { Product, ModifierGroup, ModifierOption, BulkItem } from '../../types';
import { apiGet, apiPost, apiPut, apiDelete } from '../../api';

interface ModifierModalProps {
  product: Product;
  onClose: () => void;
  onSave: () => void;
}

export const ModifierModal: React.FC<ModifierModalProps> = ({ product, onClose, onSave }) => {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [product.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [modsData, bulkData] = await Promise.all([
        apiGet(`/api/mariadb/products/${product.id}/modifiers`),
        apiGet(`/api/mariadb/tenants/${product.tenantId}/bulk-items`)
      ]);
      setGroups(modsData || []);
      setBulkItems(bulkData || []);
      if (modsData?.length > 0) setActiveGroupId(modsData[0].id);
    } catch (err) {
      console.error('Failed to fetch modifiers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGroup = async () => {
    try {
      const { id } = await apiPost(`/api/mariadb/products/${product.id}/modifiers`, {
        name: 'New Modifier Group',
        type: 'single',
        required: false,
        minSelection: 0,
        maxSelection: 1
      });
      const newGroup: ModifierGroup = {
        id,
        productId: product.id,
        name: 'New Modifier Group',
        type: 'single',
        required: false,
        minSelection: 0,
        maxSelection: 1,
        options: []
      };
      setGroups([...groups, newGroup]);
      setActiveGroupId(id);
    } catch (err) {
      console.error('Failed to add group:', err);
    }
  };

  const handleUpdateGroup = (groupId: string, updates: Partial<ModifierGroup>) => {
    setGroups(groups.map(g => g.id === groupId ? { ...g, ...updates } : g));
  };

  const handleAddOption = (groupId: string) => {
    setGroups(groups.map(g => {
      if (g.id !== groupId) return g;
      const newOption: ModifierOption = {
        id: `temp_${Date.now()}`,
        modifierId: groupId,
        name: 'New Option',
        priceExtra: 0
      };
      return { ...g, options: [...g.options, newOption] };
    }));
  };

  const handleUpdateOption = (groupId: string, optionId: string, updates: Partial<ModifierOption>) => {
    setGroups(groups.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        options: g.options.map(o => o.id === optionId ? { ...o, ...updates } : o)
      };
    }));
  };

  const handleRemoveOption = (groupId: string, optionId: string) => {
    setGroups(groups.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, options: g.options.filter(o => o.id !== optionId) };
    }));
  };

  const handleDeleteGroup = async (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this modifier group?')) return;
    try {
      await apiDelete(`/api/mariadb/modifiers/${groupId}`);
      setGroups(groups.filter(g => g.id !== groupId));
      if (activeGroupId === groupId) setActiveGroupId(groups.length > 1 ? groups[0].id : null);
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // For each group, update options
      for (const g of groups) {
        await apiPut(`/api/mariadb/modifiers/${g.id}/options`, g.options);
      }
      onSave();
      onClose();
    } catch (err) {
      console.error('Failed to save modifiers:', err);
    } finally {
      setSaving(false);
    }
  };

  const activeGroup = groups.find(g => g.id === activeGroupId);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-[40px] shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-white/5">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-primary/10 text-primary rounded-2xl">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">Product Modifiers</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Options for {product.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Group List */}
          <div className="w-full lg:w-72 bg-slate-50 dark:bg-[#0B1120] border-r border-slate-100 dark:border-slate-800 p-6 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Groups</h3>
              <button onClick={handleAddGroup} className="p-1.5 bg-primary text-white rounded-lg hover:shadow-lg transition-all">
                <Plus className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto pr-1">
              {groups.map(g => (
                <div
                  key={g.id}
                  onClick={() => setActiveGroupId(g.id)}
                  className={`w-full group/item flex items-center justify-between p-4 rounded-2xl text-left transition-all border cursor-pointer ${activeGroupId === g.id ? 'bg-white dark:bg-slate-900 border-primary shadow-xl shadow-primary/10 text-primary' : 'bg-transparent border-transparent text-slate-500 hover:bg-white/50 dark:hover:bg-white/5'}`}
                >
                  <span className="text-[11px] font-black uppercase tracking-widest truncate max-w-[120px]">{g.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleDeleteGroup(g.id, e)}
                      className="p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className={`w-3 h-3 transition-transform ${activeGroupId === g.id ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Group Settings & Options */}
          <div className="flex-1 overflow-y-auto p-8 space-y-10">
            {activeGroup ? (
              <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-300">
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <Settings2 className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">Group Configuration</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Display Name</label>
                      <input
                        type="text"
                        className="w-full px-5 py-3.5 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-2xl font-bold"
                        value={activeGroup.name}
                        onChange={e => handleUpdateGroup(activeGroup.id, { name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selection Type</label>
                      <select
                        className="w-full px-5 py-3.5 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-2xl font-bold appearance-none"
                        value={activeGroup.type}
                        onChange={e => handleUpdateGroup(activeGroup.id, { type: e.target.value as any })}
                      >
                        <option value="single">Single Selection (Radio)</option>
                        <option value="multiple">Multiple Selection (Checkbox)</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">Options</h3>
                    </div>
                    <button
                      onClick={() => handleAddOption(activeGroup.id)}
                      className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Option
                    </button>
                  </div>

                  <div className="space-y-3">
                    {activeGroup.options.map((opt, idx) => (
                      <div key={opt.id} className="flex flex-col md:flex-row items-start md:items-center gap-4 p-5 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800 rounded-3xl animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                        <div className="flex-1 space-y-1 w-full">
                          <input
                            placeholder="Option Name"
                            className="w-full bg-transparent border-none p-0 text-sm font-black text-slate-900 dark:text-white focus:ring-0"
                            value={opt.name}
                            onChange={e => handleUpdateOption(activeGroup.id, opt.id, { name: e.target.value })}
                          />
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800 shrink-0">
                            <span className="text-[10px] font-black text-slate-400">+R</span>
                            <input
                              type="number"
                              className="w-16 bg-transparent border-none p-0 text-xs font-black text-primary focus:ring-0"
                              value={opt.priceExtra}
                              onChange={e => handleUpdateOption(activeGroup.id, opt.id, { priceExtra: Number(e.target.value) })}
                            />
                          </div>
                          
                          <select
                            className="flex-1 md:w-40 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl text-[10px] font-black uppercase tracking-widest"
                            value={opt.bulkItemId || ''}
                            onChange={e => handleUpdateOption(activeGroup.id, opt.id, { bulkItemId: e.target.value || undefined })}
                          >
                            <option value="">No Recipe</option>
                            {bulkItems.map(item => (
                              <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                          </select>

                          {opt.bulkItemId && (
                            <input
                              type="number"
                              step="0.001"
                              placeholder="Qty"
                              className="w-20 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-black text-primary text-center"
                              value={opt.bulkQuantity}
                              onChange={e => handleUpdateOption(activeGroup.id, opt.id, { bulkQuantity: Number(e.target.value) })}
                            />
                          )}

                          <button onClick={() => handleRemoveOption(activeGroup.id, opt.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-full">
                  <Layers className="w-12 h-12 text-slate-200" />
                </div>
                <h4 className="font-black text-slate-400 uppercase tracking-widest">Select or create a group</h4>
              </div>
            )}
          </div>
        </div>

        <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-white/5 flex gap-4">
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="flex-1 py-5 bg-primary text-white rounded-3xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-2xl shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 transition-all"
          >
            {saving ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Finalize Modifiers
          </button>
          <button
            onClick={onClose}
            className="px-10 py-5 bg-white dark:bg-slate-800 text-slate-500 rounded-3xl font-black uppercase tracking-[0.2em] text-xs border border-slate-100 dark:border-slate-700 hover:bg-slate-50 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
