import React from 'react';
import { motion } from 'motion/react';
import { X, Save, Loader2 } from 'lucide-react';
import { Customer } from '../../types';

interface CustomerModalProps {
  customer: Partial<Customer> | null;
  isProcessing: boolean;
  onSave: (e: React.FormEvent) => void;
  onClose: () => void;
  onChange: (customer: Partial<Customer>) => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  customer, isProcessing, onSave, onClose, onChange,
}) => {
  if (!customer) return null;

  const inputClass = 'w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white';
  const labelClass = 'text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1';
  const accountLimit = Number(customer.accountLimit || 0);
  const accountBalance = Number(customer.accountBalance || 0);
  const accountRemaining = Math.max(0, accountLimit - accountBalance);

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
            {customer.id ? 'Edit Customer' : 'Add New Customer'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all text-slate-400 dark:text-slate-500">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-4">
          <div className="space-y-1">
            <label className={labelClass}>Full Name</label>
            <input required type="text" className={inputClass}
              value={customer.name || ''}
              onChange={e => onChange({ ...customer, name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Email Address</label>
            <input required type="email" className={inputClass}
              value={customer.email || ''}
              onChange={e => onChange({ ...customer, email: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Phone Number</label>
            <input type="tel" className={inputClass}
              value={customer.phone || ''}
              onChange={e => onChange({ ...customer, phone: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Address</label>
            <textarea className={`${inputClass} h-20 resize-none`}
              value={customer.address || ''}
              onChange={e => onChange({ ...customer, address: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Customer Notes</label>
            <textarea placeholder="Add special requests, preferences, or internal notes..."
              className={`${inputClass} h-24 resize-none`}
              value={customer.notes || ''}
              onChange={e => onChange({ ...customer, notes: e.target.value })}
            />
          </div>

          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-900/10 p-4">
            <label className={labelClass}>Individual Discount %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputClass}
              value={customer.discountPercent ?? ''}
              onChange={e => onChange({ ...customer, discountPercent: Number(e.target.value || 0) })}
              placeholder="0"
            />
            <p className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Applied automatically in the POS when this customer is selected.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-slate-50/70 dark:bg-[#0B1120] p-4 space-y-4">
            <label className="flex items-center justify-between gap-3">
              <div>
                <span className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
                  Customer Account
                </span>
                <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                  Allow this customer to buy on account up to a limit.
                </span>
              </div>
              <input
                type="checkbox"
                checked={Boolean(customer.accountEnabled)}
                onChange={e => onChange({ ...customer, accountEnabled: e.target.checked })}
                className="h-5 w-5 accent-primary"
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className={labelClass}>Limit</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                  value={customer.accountLimit ?? ''}
                  onChange={e => onChange({ ...customer, accountLimit: Number(e.target.value || 0) })}
                />
              </div>
              <div>
                <label className={labelClass}>Owing</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                  value={customer.accountBalance ?? ''}
                  onChange={e => onChange({ ...customer, accountBalance: Number(e.target.value || 0) })}
                />
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2">
                <span className={labelClass}>Remaining</span>
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">R{accountRemaining.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button type="button" onClick={onClose} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={isProcessing} className="flex-1 py-4 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {customer.id ? 'Save Changes' : 'Create Profile'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
