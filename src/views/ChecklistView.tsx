import React, { useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
} from 'lucide-react';
import {
  buildRoleChecklistItems,
  type RoleChecklistItem,
} from '../components/RoleOnboardingChecklist';
import type { Product, Customer, Staff, Sale, Workstation, RestaurantTable } from '../types';
import type { StaffRole } from '../permissions';

interface ChecklistViewProps {
  role: StaffRole | null;
  isDev?: boolean;
  isRestaurant?: boolean;
  hasOpenRegister?: boolean;
  products: Product[];
  customers: Customer[];
  staff: Staff[];
  sales: Sale[];
  workstations: Workstation[];
  restaurantTables: RestaurantTable[];
  pendingWorkstationCount: number;
  openTabsCount: number;
  onNavigate: (path: string) => void;
}

function roleLabel(role: StaffRole | null, isDev?: boolean, isRestaurant?: boolean) {
  if (isDev) return 'Dev checklist';
  if (role === 'admin') return 'Owner checklist';
  if (role === 'manager') return 'Manager checklist';
  if (role === 'chef') return 'Kitchen / bar checklist';
  if (role === 'cashier' && isRestaurant) return 'Cashier / waiter checklist';
  return 'Cashier checklist';
}

const statusClasses: Record<string, string> = {
  attention:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200',
  ready:
    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200',
};

export function ChecklistView({
  role,
  isDev,
  isRestaurant,
  hasOpenRegister,
  products,
  customers,
  staff,
  sales,
  workstations,
  restaurantTables,
  pendingWorkstationCount,
  openTabsCount,
  onNavigate,
}: ChecklistViewProps) {
  const context = {
    role,
    isDev,
    isRestaurant,
    hasOpenRegister,
    products,
    customers,
    staff,
    sales,
    workstations,
    restaurantTables,
    pendingWorkstationCount,
    openTabsCount,
  };

  const items = useMemo(
    () => buildRoleChecklistItems(context),
    [
      isDev,
      isRestaurant,
      hasOpenRegister,
      products.length,
      customers.length,
      staff.length,
      sales.length,
      workstations.length,
      restaurantTables.length,
      pendingWorkstationCount,
      openTabsCount,
    ],
  );

  const label = roleLabel(role, isDev, isRestaurant);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-black text-slate-800 dark:text-white">
              {label}
            </h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Daily start checks and missing setup items for your role.
          </p>

          {items.length === 0 ? (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
              <p className="text-sm font-semibold">All caught up!</p>
              <p className="text-xs mt-1">No outstanding checklist items for your role.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {items.map((check) => {
                const Icon = check.icon;
                const StatusIcon =
                  check.status === 'done'
                    ? CheckCircle2
                    : check.status === 'attention'
                      ? AlertCircle
                      : check.icon;
                return (
                  <button
                    key={check.id}
                    type="button"
                    onClick={() => onNavigate(check.path)}
                    className={`flex items-start gap-3 rounded-xl border p-4 transition-all hover:shadow-md text-left ${
                      statusClasses[check.status] || statusClasses.ready
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {check.status === 'done' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : check.status === 'attention' ? (
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                      ) : (
                        <Icon className="w-5 h-5 text-blue-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{check.label}</p>
                      <p className="text-xs mt-0.5 opacity-80">{check.detail}</p>
                    </div>
                    <div className="shrink-0 self-center">
                      <StatusIcon className="w-4 h-4 opacity-60" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
