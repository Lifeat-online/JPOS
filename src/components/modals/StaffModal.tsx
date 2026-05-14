import React from 'react';
import { motion } from 'motion/react';
import { X, Save, Loader2 } from 'lucide-react';
import { Staff, AppConfig } from '../../types';
import { DEFAULT_CATEGORY_TREE } from '../../constants';

interface StaffModalProps {
  staff: Partial<Staff> | null;
  isProcessing: boolean;
  config: AppConfig;
  onSave: (e: React.FormEvent) => void;
  onClose: () => void;
  onChange: (staff: Partial<Staff>) => void;
}

export const StaffModal: React.FC<StaffModalProps> = ({
  staff, isProcessing, config, onSave, onClose, onChange,
}) => {
  if (!staff) return null;

  const categoryTree = config?.categories || DEFAULT_CATEGORY_TREE;
  const SECTIONS = Object.keys(categoryTree);
  const CATEGORY_MAP = SECTIONS.reduce((acc, sec) => {
    acc[sec] = Object.keys(categoryTree[sec]);
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
        className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex justify-between items-center mb-6 shrink-0">
          <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {staff.id ? 'Edit Personnel' : 'New Personnel'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-5 overflow-y-auto no-scrollbar pb-6 flex-1 min-h-0 pr-2">
          <div className="space-y-1">
            <label className={labelClass}>Full Name</label>
            <input required type="text" className={inputClass}
              value={staff.name || ''}
              onChange={e => onChange({ ...staff, name: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Email Address</label>
            <input required type="email" className={inputClass}
              value={staff.email || ''}
              onChange={e => onChange({ ...staff, email: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Role Designation</label>
            <select className={`${inputClass} appearance-none`}
              value={staff.role || 'cashier'}
              onChange={e => onChange({ ...staff, role: e.target.value as Staff['role'] })}
            >
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className={labelClass}>Phone</label>
              <input type="text" className={inputClass}
                value={staff.phone || ''}
                onChange={e => onChange({ ...staff, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>ID Number</label>
              <input type="text" className={inputClass}
                value={staff.idNumber || ''}
                onChange={e => onChange({ ...staff, idNumber: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className={labelClass}>Pay Rate</label>
              <input type="number" min="0" className={inputClass}
                value={staff.payRate || ''}
                onChange={e => onChange({ ...staff, payRate: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Pay Type</label>
              <select className={`${inputClass} appearance-none`}
                value={staff.payType || 'hourly'}
                onChange={e => onChange({ ...staff, payType: e.target.value as 'hourly' | 'salary' })}
              >
                <option value="hourly">Hourly</option>
                <option value="salary">Salary (Monthly)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Password (Optional)</label>
            <input type="password" minLength={6} className={inputClass}
              placeholder="Leave blank to keep unchanged"
              onChange={e => onChange({ ...staff, newPassword: e.target.value })}
            />
            <p className="text-[10px] text-slate-500 font-medium italic">
              Min 6 characters. If set, this staff member can log in using their email and this password.
            </p>
          </div>

          {staff.role === 'cashier' && (
            <div className="space-y-3 pt-2">
              <label className={labelClass}>Restricted Access (Optional)</label>
              <div className="bg-slate-50 dark:bg-[#0B1120] p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-4 max-h-48 overflow-y-auto">
                {SECTIONS.map(section => (
                  <div key={section} className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={staff.assignedSections?.includes(section) || false}
                        onChange={e => {
                          const current = staff.assignedSections || [];
                          const newSections = e.target.checked
                            ? [...current, section]
                            : current.filter(s => s !== section);
                          onChange({ ...staff, assignedSections: newSections });
                        }}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{section}</span>
                    </label>
                    <div className="pl-6 space-y-1">
                      {CATEGORY_MAP[section].map(category => (
                        <label key={category} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={staff.assignedCategories?.includes(category) || false}
                            onChange={e => {
                              const current = staff.assignedCategories || [];
                              const newCategories = e.target.checked
                                ? [...current, category]
                                : current.filter(c => c !== category);
                              onChange({ ...staff, assignedCategories: newCategories });
                            }}
                            className="rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{category}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-slate-500 font-medium italic mt-2">
                  If no sections or categories are selected, the cashier will have access to all products.
                </p>
              </div>
            </div>
          )}

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={isProcessing} className="flex-1 py-3.5 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all">
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Personnel
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
