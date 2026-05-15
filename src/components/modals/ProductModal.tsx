import React from 'react';
import { motion } from 'motion/react';
import { X, Save, Loader2 } from 'lucide-react';
import { Product, AppConfig } from '../../types';
import { DEFAULT_CATEGORY_TREE } from '../../constants';
import { usePosStore } from '../../store/usePosStore';
import { RecipeModal } from './RecipeModal';
import { ModifierModal } from './ModifierModal';

interface ProductModalProps {
  product: Partial<Product> | null;
  isProcessing: boolean;
  config: AppConfig;
  onSave: (e: React.FormEvent) => void;
  onClose: () => void;
  onChange: (product: Partial<Product>) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product, isProcessing, config, onSave, onClose, onChange,
}) => {
  const [showRecipe, setShowRecipe] = React.useState(false);
  const [showModifiers, setShowModifiers] = React.useState(false);
  if (!product) return null;

  const workstations = usePosStore(s => s.workstations);
  const isRestaurantMode = config?.business?.isRestaurantMode;

  const categoryTree = config?.categories || DEFAULT_CATEGORY_TREE;
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

  const inputClass = 'w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white';
  const labelClass = 'text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {product.id ? 'Edit Product' : 'Add New Product'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all text-slate-400 dark:text-slate-500">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1 md:col-span-2">
              <label className={labelClass}>Product Name</label>
              <input required type="text" className={inputClass}
                value={product.name || ''}
                onChange={e => onChange({ ...product, name: e.target.value })}
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className={labelClass}>Product Image URL</label>
              <input type="url" className={inputClass} placeholder="Paste image URL here..."
                value={product.imageUrl || ''}
                onChange={e => onChange({ ...product, imageUrl: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Selling Price (R)</label>
              <input required type="number" step="0.01" className={inputClass}
                value={product.price ?? ''}
                onChange={e => onChange({ ...product, price: parseFloat(e.target.value) })}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Cost Price (R)</label>
              <input required type="number" step="0.01" className={inputClass}
                value={product.costPrice ?? ''}
                onChange={e => onChange({ ...product, costPrice: parseFloat(e.target.value) })}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Section</label>
              <select required className={inputClass}
                value={product.section || ''}
                onChange={e => onChange({ ...product, section: e.target.value, category: CATEGORY_MAP[e.target.value]?.[0] || '', subCategory: '' })}
              >
                <option value="">Select Section</option>
                {SECTIONS.map(sec => <option key={sec} value={sec}>{sec}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Category</label>
              <select required className={inputClass}
                value={product.category || ''}
                onChange={e => onChange({ ...product, category: e.target.value, subCategory: (SUB_CATEGORY_MAP[e.target.value] || [])[0] || '' })}
              >
                <option value="">Select Category</option>
                {(product.section ? CATEGORY_MAP[product.section] || [] : []).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Sub-Category</label>
              <select className={inputClass}
                value={product.subCategory || ''}
                onChange={e => onChange({ ...product, subCategory: e.target.value })}
              >
                <option value="">None</option>
                {(product.category ? SUB_CATEGORY_MAP[product.category] || [] : []).map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Barcode / SKU</label>
              <input type="text" className={inputClass}
                value={product.barcode || ''}
                onChange={e => onChange({ ...product, barcode: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Current Stock</label>
              <input required type="number" className={inputClass}
                value={product.stock ?? ''}
                onChange={e => onChange({ ...product, stock: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Low Stock Threshold</label>
              <input required type="number" className={inputClass}
                value={product.minStock ?? 10}
                onChange={e => onChange({ ...product, minStock: parseInt(e.target.value) })}
              />
            </div>

            {isRestaurantMode && (
              <div className="space-y-1 md:col-span-2">
                <label className={labelClass}>Workstation</label>
                <select
                  className={inputClass}
                  value={product.workstationId || ''}
                  onChange={e => onChange({ ...product, workstationId: e.target.value || undefined })}
                >
                  <option value="">None (not routed to a workstation)</option>
                  {workstations.filter(w => w.status === 'active').map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.type})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 px-1 mt-1">
                  When this product is ordered, it will be routed to the selected workstation.
                </p>
              </div>
            )}

            {/* Inventory & Modifiers (Only for existing products) */}
            {product.id && (
              <div className="grid grid-cols-2 gap-4 md:col-span-2 pt-4 border-t border-slate-50 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRecipe(true)}
                  className="py-4 bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-white rounded-2xl font-black text-[10px] uppercase tracking-widest border border-slate-100 dark:border-slate-800 hover:border-primary transition-all flex items-center justify-center gap-2"
                >
                  <div className="w-2 h-2 bg-primary rounded-full" />
                  Recipe (BOM)
                </button>
                <button
                  type="button"
                  onClick={() => setShowModifiers(true)}
                  className="py-4 bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-white rounded-2xl font-black text-[10px] uppercase tracking-widest border border-slate-100 dark:border-slate-800 hover:border-primary transition-all flex items-center justify-center gap-2"
                >
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  Modifiers
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-8">
            <button type="button" onClick={onClose} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={isProcessing} className="flex-1 py-4 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {product.id ? 'Save Changes' : 'Add to Catalog'}
            </button>
          </div>
        </form>
      </motion.div>

      {showRecipe && product.id && (
        <RecipeModal
          product={product as Product}
          onClose={() => setShowRecipe(false)}
          onSave={() => {}}
        />
      )}

      {showModifiers && product.id && (
        <ModifierModal
          product={product as Product}
          onClose={() => setShowModifiers(false)}
          onSave={() => {}}
        />
      )}
    </motion.div>
  );
};
