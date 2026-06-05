import {
  Activity,
  Banknote,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  ChefHat,
  ClipboardCheck,
  Code2,
  History as HistoryIcon,
  LayoutGrid,
  MessageSquare,
  Package,
  Tags,
  Settings,
  TabletSmartphone,
  Trophy,
  Truck,
  Users,
  Utensils,
  Wallet,
  ReceiptText,
} from 'lucide-react';
import type React from 'react';
import type { Staff, StaffPermissions } from './types';

export type StaffRole = Staff['role'];
export type AppView =
  | 'pos'
  | 'handheld'
  | 'tables'
  | 'tabs'
  | 'workstation'
  | 'history'
  | 'messages'
  | 'actions'
  | 'delivery'
  | 'stocktake'
  | 'cash'
  | 'live'
  | 'inventory'
  | 'customers'
  | 'accounts'
  | 'bookings'
  | 'staff'
  | 'wallets'
  | 'leaderboard'
  | 'reports'
  | 'ai'
  | 'packages'
  | 'settings'
  | 'profile'
  | 'dev';

export interface NavItem {
  id: AppView;
  icon: React.ElementType;
  label: string;
  group?: string;
}

type AccessOptions = {
  isDev?: boolean;
  isRestaurant?: boolean;
  hasOpenTerminal?: boolean;
  permissions?: StaffPermissions;
};

const ROLE_VIEWS: Record<StaffRole, AppView[]> = {
  admin: [
    'pos', 'handheld', 'tables', 'tabs', 'workstation', 'history', 'messages', 'cash', 'live',
    'actions', 'delivery', 'stocktake',
    'inventory', 'customers', 'accounts', 'bookings', 'staff', 'wallets', 'leaderboard', 'reports', 'settings', 'profile',
    'ai', 'packages',
  ],
  dev: [
    'pos', 'handheld', 'tables', 'tabs', 'workstation', 'history', 'messages', 'cash', 'live',
    'actions', 'delivery', 'stocktake',
    'inventory', 'customers', 'accounts', 'bookings', 'staff', 'wallets', 'leaderboard', 'reports', 'settings', 'profile', 'dev',
    'ai', 'packages',
  ],
  manager: [
    'pos', 'handheld', 'tables', 'tabs', 'workstation', 'history', 'messages', 'cash', 'live',
    'actions', 'delivery', 'stocktake',
    'inventory', 'customers', 'accounts', 'bookings', 'staff', 'leaderboard', 'reports', 'ai', 'profile',
    'packages',
  ],
  cashier: ['pos', 'handheld', 'history', 'messages', 'stocktake', 'cash', 'profile'],
  chef: ['workstation', 'stocktake', 'profile'],
};

const VIEW_META: Record<AppView, NavItem> = {
  pos: { id: 'pos', icon: LayoutGrid, label: 'Terminal' },
  handheld: { id: 'handheld', icon: TabletSmartphone, label: 'Handheld' },
  tables: { id: 'tables', icon: Utensils, label: 'Tables' },
  tabs: { id: 'tabs', icon: TabletSmartphone, label: 'Tabs' },
  workstation: { id: 'workstation', icon: ChefHat, label: 'Kitchen' },
  history: { id: 'history', icon: HistoryIcon, label: 'History' },
  messages: { id: 'messages', icon: MessageSquare, label: 'Messages' },
  actions: { id: 'actions', icon: ClipboardCheck, label: 'Actions', group: 'Operations' },
  delivery: { id: 'delivery', icon: Truck, label: 'Delivery', group: 'Operations' },
  stocktake: { id: 'stocktake', icon: ClipboardCheck, label: 'Stocktake', group: 'Operations' },
  cash: { id: 'cash', icon: Banknote, label: 'Cash Mgmt', group: 'Operations' },
  live: { id: 'live', icon: Activity, label: 'Live', group: 'Operations' },
  inventory: { id: 'inventory', icon: Package, label: 'Inventory', group: 'Operations' },
  customers: { id: 'customers', icon: Users, label: 'Customers', group: 'Operations' },
  accounts: { id: 'accounts', icon: ReceiptText, label: 'Accounts', group: 'Management' },
  bookings: { id: 'bookings', icon: CalendarDays, label: 'Bookings', group: 'Management' },
  staff: { id: 'staff', icon: Users, label: 'Staff', group: 'Management' },
  wallets: { id: 'wallets', icon: Wallet, label: 'Wallets', group: 'Management' },
  leaderboard: { id: 'leaderboard', icon: Trophy, label: 'Leaderboard', group: 'Management' },
  reports: { id: 'reports', icon: BarChart3, label: 'Analytics', group: 'Management' },
  ai: { id: 'ai', icon: BrainCircuit, label: 'AI Copilot', group: 'Management' },
  packages: { id: 'packages', icon: Tags, label: 'Packages', group: 'Management' },
  settings: { id: 'settings', icon: Settings, label: 'Settings', group: 'Management' },
  profile: { id: 'profile', icon: Users, label: 'Profile' },
  dev: { id: 'dev', icon: Code2, label: 'Dev' },
};

const PRIMARY_VIEWS: AppView[] = ['pos', 'handheld', 'tables', 'tabs', 'workstation', 'history', 'messages'];

const PERMISSION_VIEW_MAP: Array<[keyof StaffPermissions, AppView]> = [
  ['canSell', 'pos'],
  ['canSell', 'handheld'],
  ['canManageCash', 'cash'],
  ['canViewHistory', 'history'],
  ['canMessage', 'messages'],
  ['canUseKitchen', 'workstation'],
  ['canManageTables', 'tables'],
  ['canManageTabs', 'tabs'],
  ['canViewLive', 'live'],
  ['canManageInventory', 'inventory'],
  ['canManageCustomers', 'customers'],
  ['canManageCustomers', 'accounts'],
  ['canManageTables', 'bookings'],
  ['canManageStaff', 'staff'],
  ['canManageWallets', 'wallets'],
  ['canViewLeaderboard', 'leaderboard'],
  ['canViewReports', 'reports'],
  ['canAccessAi', 'ai'],
  ['canManageSettings', 'settings'],
  ['canAccessDevTools', 'dev'],
];

const DATASET_PERMISSION_MAP = {
  workstations: 'canUseKitchen',
  cash: 'canManageCash',
  tables: 'canManageTables',
} as const satisfies Partial<Record<'products' | 'customers' | 'staff' | 'sales' | 'config' | 'workstations' | 'cash' | 'tables', keyof StaffPermissions>>;

export function getAllowedViews(role: StaffRole | null, options: AccessOptions = {}) {
  if (!role) return new Set<AppView>();

  const allowed = new Set<AppView>(ROLE_VIEWS[role] || []);
  if (options.isDev) allowed.add('dev');

  const hasActiveRestaurantTerminal = Boolean(options.isRestaurant && options.hasOpenTerminal);

  if (role === 'cashier' && hasActiveRestaurantTerminal) {
    allowed.add('handheld');
    allowed.add('tables');
    allowed.add('tabs');
  }

  for (const [permission, view] of PERMISSION_VIEW_MAP) {
    if (options.permissions?.[permission] === true) {
      allowed.add(view);
    }
    if (options.permissions?.[permission] === false) {
      allowed.delete(view);
    }
  }

  if (!hasActiveRestaurantTerminal) {
    allowed.delete('tables');
    allowed.delete('handheld');
    allowed.delete('tabs');
    allowed.delete('workstation');
  }

  if (!options.isRestaurant) {
    allowed.delete('tables');
    allowed.delete('handheld');
    allowed.delete('tabs');
    allowed.delete('leaderboard');
    allowed.delete('workstation');
  }

  return allowed;
}

export function canAccessView(
  role: StaffRole | null,
  view: string,
  options: AccessOptions = {}
) {
  if (view === 'profile') return Boolean(role);
  return getAllowedViews(role, options).has(view as AppView);
}

export function getDefaultView(role: StaffRole | null, options: AccessOptions = {}) {
  const allowed = getAllowedViews(role, options);
  return (PRIMARY_VIEWS.find(view => allowed.has(view)) || 'profile') as AppView;
}

export function buildNavigation(role: StaffRole | null, options: AccessOptions = {}) {
  const allowed = getAllowedViews(role, options);
  const visible = [...PRIMARY_VIEWS, 'actions', 'delivery', 'stocktake', 'cash', 'live', 'inventory', 'customers', 'bookings', 'staff', 'wallets', 'leaderboard', 'reports', 'ai', 'packages', 'settings']
    .filter(view => allowed.has(view as AppView)) as AppView[];

  return {
    primaryNav: visible.filter(view => PRIMARY_VIEWS.includes(view)).map(view => VIEW_META[view]),
    secondaryNav: visible.filter(view => !PRIMARY_VIEWS.includes(view)).map(view => VIEW_META[view]),
    navItems: visible.map(view => VIEW_META[view]),
  };
}

export function canLoadDataset(
  role: StaffRole | null,
  dataset: 'products' | 'customers' | 'staff' | 'sales' | 'config' | 'workstations' | 'cash' | 'tables',
  options: AccessOptions = {}
) {
  if (!role) return false;
  const hasActiveRestaurantTerminal = Boolean(options.isRestaurant && options.hasOpenTerminal);
  if ((dataset === 'tables' || dataset === 'workstations') && !hasActiveRestaurantTerminal) return false;
  const permission = DATASET_PERMISSION_MAP[dataset as keyof typeof DATASET_PERMISSION_MAP];
  if (permission && options.permissions?.[permission] === false) return false;
  if (permission && options.permissions?.[permission] === true) return true;
  if (role === 'chef') return dataset === 'staff' || dataset === 'sales' || dataset === 'workstations';
  if (role === 'cashier') {
    if (dataset === 'tables') return hasActiveRestaurantTerminal;
    return ['products', 'customers', 'staff', 'sales', 'config', 'cash'].includes(dataset);
  }
  return true;
}
