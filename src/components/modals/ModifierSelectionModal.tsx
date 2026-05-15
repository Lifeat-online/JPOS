import React, { useState } from 'react';
import { X, Check, Save } from 'lucide-react';
import { Product, ModifierGroup, ModifierOption } from '../../types';

interface ModifierSelectionModalProps {
  product: Product;
  onClose: () => void;
  onConfirm: (selectedOptions: { modifierId: string, optionId: string, name: string, priceExtra: number }[]) => void;
}

export const ModifierSelectionModal: React.FC<ModifierSelectionModalProps> = ({ product, onClose, onConfirm }) => {
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  const groups = product.modifiers || [];

  const handleToggleOption = (groupId: string, option: ModifierOption, type: 'single' | 'multiple') => {
    setSelections(prev => {
      const current = prev[groupId] || [];
      if (type === 'single') {
        return { ...prev, [groupId]: [option.id] };
      } else {
        if (current.includes(option.id)) {
          return { ...prev, [groupId]: current.filter(id => id !== option.id) };
        } else {
          return { ...prev, [groupId]: [...current, option.id] };
        }
      }
    });
  };

  const handleConfirm = () => {
    const finalOptions: { modifierId: string, optionId: string, name: string, priceExtra: number }[] = [];
    
    groups.forEach(g => {
      const selectedIds = selections[g.id] || [];
      selectedIds.forEach(id => {
        const opt = g.options.find(o => o.id === id);
        if (opt) {
          finalOptions.push({
            modifierId: g.id,
            optionId: opt.id,
            name: opt.name,
            priceExtra: opt.priceExtra
          });
        }
      });
    });

    onConfirm(finalOptions);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-[40px] shadow-2xl overflow-hidden border border-white/20 flex flex-col max-h-[85vh]">
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-white/5">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Customize Order</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{product.name}</p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {groups.map(g => (
            <div key={g.id} className="space-y-4">
              <div className="flex justify-between items-baseline">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">{g.name}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  {g.type === 'single' ? 'Select One' : 'Select Multiple'}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {g.options.map(opt => {
                  const isSelected = (selections[g.id] || []).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleToggleOption(g.id, opt, g.type)}
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${isSelected ? 'bg-primary/5 border-primary text-primary' : 'bg-slate-50 dark:bg-[#0B1120] border-transparent text-slate-500 hover:border-slate-200'}`}
                    >
                      <div className="flex flex-col items-start">
                        <span className="text-[11px] font-black uppercase tracking-widest">{opt.name}</span>
                        {opt.priceExtra > 0 && <span className="text-[10px] font-bold text-emerald-600">+R{opt.priceExtra.toFixed(2)}</span>}
                      </div>
                      {isSelected && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-white/5 flex gap-4">
          <button
            onClick={handleConfirm}
            className="flex-1 py-5 bg-primary text-white rounded-3xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-2xl shadow-primary/20 hover:shadow-primary/40 transition-all"
          >
            <Check className="w-5 h-5" />
            Add to Order
          </button>
          <button
            onClick={onClose}
            className="px-8 py-5 bg-white dark:bg-slate-800 text-slate-500 rounded-3xl font-black uppercase tracking-[0.2em] text-xs border border-slate-100 dark:border-slate-700 hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
