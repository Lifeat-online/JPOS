import React from 'react';
import {
  AlertCircle,
  Banknote,
  BarChart3,
  BrainCircuit,
  ChefHat,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  LayoutGrid,
  MessageSquare,
  Package,
  Settings,
  TabletSmartphone,
  Users,
  Utensils,
} from 'lucide-react';
import type { Product, RestaurantTable, Sale, Staff, Workstation } from '../types';
import type { AppView, StaffRole } from '../permissions';

type ChecklistStatus = 'ready' | 'attention' | 'done';

export type RoleChecklistItem = {
  id: string;
  label: string;
  detail: string;
  path: `/${AppView}`;
  status: ChecklistStatus;
  icon: React.ElementType;
};

type ChecklistContext = {
  role: StaffRole | null;
  isDev?: boolean;
  isRestaurant?: boolean;
  hasOpenRegister?: boolean;
  products: Product[];
  customers: unknown[];
  staff: Staff[];
  sales: Sale[];
  workstations: Workstation[];
  restaurantTables: RestaurantTable[];
  pendingWorkstationCount: number;
  openTabsCount: number;
};

type RoleOnboardingChecklistProps = ChecklistContext & {
  currentView: string;
  onNavigate: (path: string) => void;
};

const statusClass: Record<ChecklistStatus, string> = {
  attention: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200',
  ready: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200',
};

function openSales(sales: Sale[]) {
  return sales.filter(sale => sale.status === 'open' || sale.status === 'kitchen');
}

function activeTableCount(sales: Sale[]) {
  return new Set(openSales(sales).filter(sale => sale.tableNumber).map(sale => String(sale.tableNumber))).size;
}

function hasSellableProducts(products: Product[]) {
  return products.some(product => Number(product.stock || 0) > 0);
}

function item(
  id: string,
  label: string,
  detail: string,
  path: `/${AppView}`,
  status: ChecklistStatus,
  icon: React.ElementType
): RoleChecklistItem {
  return { id, label, detail, path, status, icon };
}

export function buildRoleChecklistItems(context: ChecklistContext): RoleChecklistItem[] {
  const role = context.isDev ? 'dev' : context.role;
  const restaurantMode = Boolean(context.isRestaurant);
  const openRegister = Boolean(context.hasOpenRegister);
  const sellableProducts = hasSellableProducts(context.products);
  const hasProducts = context.products.length > 0;
  const hasCustomers = context.customers.length > 0;
  const hasStaff = context.staff.length > 1;
  const hasWorkstations = context.workstations.some(workstation => workstation.status === 'active');
  const hasTables = context.restaurantTables.some(table => table.status === 'active');
  const tableCount = activeTableCount(context.sales);

  if (role === 'dev') {
    return [
      item('dev-dashboard', 'Run Dev checks', 'Inspect seeded data, package gates, and diagnostics.', '/dev', 'ready', Code2),
      item('settings', 'Provider setup', 'Review AI, payment, printing, tables, and workstation configuration.', '/settings', 'ready', Settings),
      item('data-fixtures', 'Demo data', `${hasProducts ? context.products.length : 0} products, ${context.customers.length} customers, ${context.staff.length} staff records loaded.`, '/dev', hasProducts && hasCustomers ? 'done' : 'attention', Package),
      item('ai-health', 'AI diagnostics', 'Test provider keys, media extraction, and Manager Copilot readiness.', '/ai', 'ready', BrainCircuit),
    ];
  }

  if (role === 'chef') {
    return [
      item('workstation', 'Open queue', context.pendingWorkstationCount ? `${context.pendingWorkstationCount} ticket items need prep or handoff.` : 'No active ticket items waiting.', '/workstation', context.pendingWorkstationCount ? 'attention' : 'ready', ChefHat),
      item('station-setup', 'Station setup', hasWorkstations ? 'Workstations are configured for routing.' : 'Ask a manager to add kitchen or bar workstations.', '/settings', hasWorkstations ? 'done' : 'attention', Settings),
      item('stocktake', 'Count assignment', 'Open assigned stocktakes and spot checks from your device.', '/stocktake', 'ready', ClipboardCheck),
      item('messages', 'Team updates', 'Watch ready-order notes and manager messages.', '/messages', 'ready', MessageSquare),
    ];
  }

  if (role === 'manager') {
    return [
      item('actions', 'Approve exceptions', 'Review refunds, voids, stock variance, cash, AI, and sync tasks.', '/actions', 'ready', ClipboardCheck),
      item('cash', 'Cash position', openRegister ? 'Registers are open; review drawer and manager-float status.' : 'Open or review registers before trading starts.', '/cash', openRegister ? 'ready' : 'attention', Banknote),
      item('stocktake', 'Spot checks', sellableProducts ? 'Launch spot checks and review stocktake variance.' : 'No sellable stock is loaded yet.', '/stocktake', sellableProducts ? 'ready' : 'attention', Package),
      item('live', 'Live floor', restaurantMode ? `${tableCount} tables and ${context.openTabsCount} tabs active.` : 'Watch sales, staff, register, and stock activity.', '/live', 'ready', BarChart3),
    ];
  }

  if (role === 'admin') {
    return [
      item('settings', 'Business setup', context.isRestaurant ? 'Restaurant mode, tables, printing, payment, and tax settings.' : 'Business, printing, payment, tax, and package settings.', '/settings', 'ready', Settings),
      item('staff', 'Staff access', hasStaff ? `${context.staff.length} staff records are configured.` : 'Add staff accounts and permissions before launch.', '/staff', hasStaff ? 'done' : 'attention', Users),
      item('inventory', 'Stock setup', sellableProducts ? `${context.products.length} products loaded.` : 'Add products and starting stock before selling.', '/inventory', sellableProducts ? 'done' : 'attention', Package),
      item('reports', 'Owner view', 'Check sales, account exposure, cash, and operational reports.', '/reports', 'ready', BarChart3),
    ];
  }

  const cashierItems = [
    item('register', 'Open register', openRegister ? 'Register is open for this shift.' : 'Open a register and declare the starting float.', '/cash', openRegister ? 'done' : 'attention', Banknote),
    item('sell', restaurantMode ? 'Start table sale' : 'Start sale', sellableProducts ? 'Search, scan, sell, park, and reprint from the POS.' : 'No sellable stock is available yet.', '/pos', sellableProducts ? 'ready' : 'attention', LayoutGrid),
    item('customers', 'Customer profile', hasCustomers ? 'Select a customer for wallet, account, loyalty, or receipts.' : 'Create the first customer profile when needed.', '/customers', hasCustomers ? 'ready' : 'attention', Users),
    item('history', 'Receipts and fixes', 'Reprint receipts and request refund or void approval.', '/history', 'ready', ClipboardCheck),
  ];

  if (restaurantMode) {
    cashierItems.splice(2, 0,
      item('tables', 'Tables', hasTables ? `${tableCount} open table${tableCount === 1 ? '' : 's'} now.` : 'Add active tables in Settings before floor service.', '/tables', hasTables ? 'ready' : 'attention', Utensils),
      item('tabs', 'Tabs', `${context.openTabsCount} open tab${context.openTabsCount === 1 ? '' : 's'}.`, '/tabs', context.openTabsCount ? 'attention' : 'ready', TabletSmartphone)
    );
  }

  return cashierItems.slice(0, restaurantMode ? 6 : 4);
}

function roleLabel(role: StaffRole | null, isDev?: boolean, isRestaurant?: boolean) {
  if (isDev) return 'Dev checklist';
  if (role === 'admin') return 'Owner checklist';
  if (role === 'manager') return 'Manager checklist';
  if (role === 'chef') return 'Kitchen / bar checklist';
  if (role === 'cashier' && isRestaurant) return 'Cashier / waiter checklist';
  return 'Cashier checklist';
}

export function RoleOnboardingChecklist(props: RoleOnboardingChecklistProps) {
  const items = buildRoleChecklistItems(props);
  if (!items.length) return null;

  return (
    <section aria-label="Role daily checklist" className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:px-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="min-w-0 xl:w-52">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">{roleLabel(props.role, props.isDev, props.isRestaurant)}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Daily start and missing setup</p>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {items.slice(0, 4).map(check => {
            const Icon = check.icon;
            const StatusIcon = check.status === 'done' ? CheckCircle2 : check.status === 'attention' ? AlertCircle : check.icon;
            return (
              <button
                key={check.id}
                type="button"
                onClick={() => props.onNavigate(check.path)}
                aria-current={props.currentView === check.path.slice(1) ? 'page' : undefined}
                className={`min-h-[82px] rounded-xl border p-3 text-left transition-all hover:shadow-sm active:scale-[0.99] ${statusClass[check.status]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900 dark:text-white">{check.label}</p>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold leading-4 text-slate-600 dark:text-slate-300">{check.detail}</p>
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-current shadow-sm dark:bg-slate-950/70">
                    {check.status === 'ready' ? <Icon className="h-4 w-4" /> : <StatusIcon className="h-4 w-4" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
