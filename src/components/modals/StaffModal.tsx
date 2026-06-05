import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Save, Loader2, ShieldCheck, RotateCcw } from 'lucide-react';
import { Staff, AppConfig, StaffPermissions, InventoryLocation } from '../../types';
import { DEFAULT_CATEGORY_TREE } from '../../constants';
import { getInventoryLocations } from '../../api';
import { usePosStore } from '../../store/usePosStore';

interface StaffModalProps {
  staff: Partial<Staff> | null;
  isProcessing: boolean;
  config: AppConfig;
  onSave: (e: React.FormEvent) => void;
  onClose: () => void;
  onChange: (staff: Partial<Staff>) => void;
}

type PermissionKey = keyof StaffPermissions;

const ROLE_DEFAULTS: Record<Staff['role'], StaffPermissions> = {
  cashier: {
    canSell: true,
    canManageCash: true,
    canViewHistory: true,
    canMessage: true,
  },
  chef: {
    canUseKitchen: true,
  },
  manager: {
    canSell: true,
    canManageCash: true,
    canViewHistory: true,
    canMessage: true,
    canUseKitchen: true,
    canManageTables: true,
    canManageTabs: true,
    canViewLive: true,
    canManageInventory: true,
    canManageCustomers: true,
    canViewLeaderboard: true,
  },
  admin: {
    canSell: true,
    canManageCash: true,
    canViewHistory: true,
    canMessage: true,
    canUseKitchen: true,
    canManageTables: true,
    canManageTabs: true,
    canViewLive: true,
    canManageInventory: true,
    canManageCustomers: true,
    canManageStaff: true,
    canManageWallets: true,
    canViewLeaderboard: true,
    canViewReports: true,
    canManageSettings: true,
  },
  dev: {
    canSell: true,
    canManageCash: true,
    canViewHistory: true,
    canMessage: true,
    canUseKitchen: true,
    canManageTables: true,
    canManageTabs: true,
    canViewLive: true,
    canManageInventory: true,
    canManageCustomers: true,
    canManageStaff: true,
    canManageWallets: true,
    canViewLeaderboard: true,
    canViewReports: true,
    canManageSettings: true,
    canAccessDevTools: true,
  },
};

const PERMISSION_GROUPS: Array<{ title: string; items: Array<{ key: PermissionKey; label: string; description: string }> }> = [
  {
    title: 'Daily Operations',
    items: [
      { key: 'canSell', label: 'Terminal', description: 'Process sales and open the register.' },
      { key: 'canManageCash', label: 'Cash management', description: 'Open, close, and cash up registers.' },
      { key: 'canViewHistory', label: 'History', description: 'View sales history.' },
      { key: 'canMessage', label: 'Messages', description: 'Use staff messaging.' },
    ],
  },
  {
    title: 'Restaurant',
    items: [
      { key: 'canManageTables', label: 'Tables', description: 'Work with restaurant tables.' },
      { key: 'canManageTabs', label: 'Tabs', description: 'Open and manage customer tabs.' },
      { key: 'canUseKitchen', label: 'Kitchen', description: 'Use the kitchen workstation.' },
      { key: 'canViewLeaderboard', label: 'Leaderboard', description: 'View staff performance leaderboard.' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { key: 'canViewLive', label: 'Live dashboard', description: 'View live operational reporting.' },
      { key: 'canManageInventory', label: 'Inventory', description: 'Manage products and stock.' },
      { key: 'canManageCustomers', label: 'Customers', description: 'Manage client records.' },
      { key: 'canManageStaff', label: 'Personnel', description: 'Add and edit staff.' },
      { key: 'canManageWallets', label: 'Wallets', description: 'Approve payouts and adjust balances.' },
      { key: 'canViewReports', label: 'Reports', description: 'View analytics and reports.' },
      { key: 'canManageSettings', label: 'Settings', description: 'Manage business configuration.' },
      { key: 'canAccessDevTools', label: 'Dev tools', description: 'Access developer diagnostics.' },
    ],
  },
];

function getRoleDefaults(role: Staff['role'] | undefined): StaffPermissions {
  return { ...(ROLE_DEFAULTS[role || 'cashier'] || ROLE_DEFAULTS.cashier) };
}

export const StaffModal: React.FC<StaffModalProps> = ({
  staff, isProcessing, config, onSave, onClose, onChange,
}) => {
  const tenantId = usePosStore(state => state.tenantId);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    getInventoryLocations(tenantId)
      .then(rows => setLocations(rows.filter(location => location.status !== 'inactive')))
      .catch(() => setLocations([]));
  }, [tenantId]);

  if (!staff) return null;

  const categoryTree = config?.categories || DEFAULT_CATEGORY_TREE;
  const SECTIONS = Object.keys(categoryTree);
  const CATEGORY_MAP = SECTIONS.reduce((acc, sec) => {
    acc[sec] = Object.keys(categoryTree[sec]);
    return acc;
  }, {} as Record<string, string[]>);

  const inputClass = 'w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white';
  const labelClass = 'text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1';
  const activePermissions = { ...getRoleDefaults(staff.role), ...(staff.permissions || {}) };
  const setPermission = (key: PermissionKey, value: boolean) => {
    onChange({ ...staff, permissions: { ...activePermissions, [key]: value } });
  };
  const applyRoleDefaults = () => {
    onChange({ ...staff, permissions: getRoleDefaults(staff.role) });
  };
  const assignedLocationIds = staff.assignedLocationIds || [];
  const setAssignedLocation = (locationId: string, enabled: boolean) => {
    const next = enabled
      ? Array.from(new Set([...assignedLocationIds, locationId]))
      : assignedLocationIds.filter(id => id !== locationId);
    onChange({
      ...staff,
      assignedLocationIds: next,
      defaultLocationId: staff.defaultLocationId && next.length > 0 && !next.includes(staff.defaultLocationId)
        ? next[0]
        : staff.defaultLocationId,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-3xl w-full shadow-2xl max-h-[90vh] flex flex-col"
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
              onChange={e => {
                const role = e.target.value as Staff['role'];
                onChange({ ...staff, role, permissions: getRoleDefaults(role) });
              }}
            >
              <option value="cashier">Cashier</option>
              <option value="chef">Chef / Kitchen</option>
              <option value="manager">Manager</option>
              <option value="admin">Administrator</option>
              <option value="dev">Developer</option>
            </select>
          </div>

          {locations.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700/60 dark:bg-[#0B1120]">
              <label className={labelClass}>Inventory Location Access</label>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
                <select
                  className={`${inputClass} appearance-none bg-white dark:bg-slate-950`}
                  value={staff.defaultLocationId || locations.find(location => location.isDefault)?.id || 'main'}
                  onChange={event => {
                    const nextDefault = event.target.value;
                    onChange({
                      ...staff,
                      defaultLocationId: nextDefault,
                      assignedLocationIds: assignedLocationIds.length > 0 && !assignedLocationIds.includes(nextDefault)
                        ? [...assignedLocationIds, nextDefault]
                        : assignedLocationIds,
                    });
                  }}
                >
                  {locations.map(location => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  {locations.map(location => (
                    <label
                      key={location.id}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={assignedLocationIds.includes(location.id)}
                        onChange={event => setAssignedLocation(location.id, event.target.checked)}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      {location.name}
                    </label>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Empty assignments allow all locations; assigned cashiers see stock from their default location first.
              </p>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <label className={labelClass}>Permissions & Admin Capabilities</label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium px-1 mt-1">
                  Role defaults are applied automatically, then you can tune exactly what this person can access.
                </p>
              </div>
              <button
                type="button"
                onClick={applyRoleDefaults}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Role Defaults
              </button>
            </div>
            <div className="bg-slate-50 dark:bg-[#0B1120] p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-5">
              {PERMISSION_GROUPS.map(group => (
                <div key={group.title} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{group.title}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.items.map(item => (
                      <label
                        key={item.key}
                        className="flex items-start gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-primary/30 transition-all"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(activePermissions[item.key])}
                          onChange={e => setPermission(item.key, e.target.checked)}
                          className="mt-1 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-slate-800 dark:text-white">{item.label}</span>
                          <span className="block text-[11px] leading-4 text-slate-500 dark:text-slate-400">{item.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
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

          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-900/10 p-4 space-y-2">
            <label className={labelClass}>Individual Staff Discount %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputClass}
              value={staff.discountPercent ?? ''}
              onChange={e => onChange({ ...staff, discountPercent: Number(e.target.value || 0) })}
              placeholder="0"
            />
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Applied automatically when this staff member is selected as the buyer in POS.
            </p>
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
