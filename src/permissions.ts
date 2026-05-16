import {
  Activity,
  Banknote,
  BarChart3,
  ChefHat,
  Code2,
  History as HistoryIcon,
  LayoutGrid,
  MessageSquare,
  Package,
  Settings,
  TabletSmartphone,
  Trophy,
  Users,
  Utensils,
  Wallet,
} from 'lucide-react';
import type React from 'react';
import type { Staff } from './types';

export type StaffRole = Staff['role'];
export type AppView =
  | 'pos'
  | 'tables'
  | 'tabs'
  | 'workstation'
  | 'history'
  | 'messages'
  | 'cash'
  | 'live'
  | 'inventory'
  | 'customers'
  | 'staff'
  | 'wallets'
  | 'leaderboard'
  | 'reports'
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
};

const ROLE_VIEWS: Record<StaffRole, AppView[]> = {
  admin: [
    'pos', 'tables', 'tabs', 'workstation', 'history', 'messages', 'cash', 'live',
    'inventory', 'customers', 'staff', 'wallets', 'leaderboard', 'reports', 'settings', 'profile',
  ],
  dev: [
    'pos', 'tables', 'tabs', 'workstation', 'history', 'messages', 'cash', 'live',
    'inventory', 'customers', 'staff', 'wallets', 'leaderboard', 'reports', 'settings', 'profile', 'dev',
  ],
  manager: [
    'pos', 'tables', 'tabs', 'workstation', 'history', 'messages', 'cash', 'live',
    'inventory', 'customers', 'leaderboard', 'profile',
  ],
  cashier: ['pos', 'history', 'messages', 'cash', 'profile'],
  chef: ['workstation', 'profile'],
};

const VIEW_META: Record<AppView, NavItem> = {
  pos: { id: 'pos', icon: LayoutGrid, label: 'Terminal' },
  tables: { id: 'tables', icon: Utensils, label: 'Tables' },
  tabs: { id: 'tabs', icon: TabletSmartphone, label: 'Tabs' },
  workstation: { id: 'workstation', icon: ChefHat, label: 'Kitchen' },
  history: { id: 'history', icon: HistoryIcon, label: 'History' },
  messages: { id: 'messages', icon: MessageSquare, label: 'Messages' },
  cash: { id: 'cash', icon: Banknote, label: 'Cash Mgmt', group: 'Operations' },
  live: { id: 'live', icon: Activity, label: 'Live', group: 'Operations' },
  inventory: { id: 'inventory', icon: Package, label: 'Inventory', group: 'Operations' },
  customers: { id: 'customers', icon: Users, label: 'Customers', group: 'Operations' },
  staff: { id: 'staff', icon: Users, label: 'Staff', group: 'Management' },
  wallets: { id: 'wallets', icon: Wallet, label: 'Wallets', group: 'Management' },
  leaderboard: { id: 'leaderboard', icon: Trophy, label: 'Leaderboard', group: 'Management' },
  reports: { id: 'reports', icon: BarChart3, label: 'Analytics', group: 'Management' },
  settings: { id: 'settings', icon: Settings, label: 'Settings', group: 'Management' },
  profile: { id: 'profile', icon: Users, label: 'Profile' },
  dev: { id: 'dev', icon: Code2, label: 'Dev' },
};

const PRIMARY_VIEWS: AppView[] = ['pos', 'tables', 'tabs', 'workstation', 'history', 'messages'];

export function getAllowedViews(role: StaffRole | null, options: AccessOptions = {}) {
  if (!role) return new Set<AppView>();

  const allowed = new Set<AppView>(ROLE_VIEWS[role] || []);
  if (options.isDev) allowed.add('dev');

  const hasActiveRestaurantTerminal = Boolean(options.isRestaurant && options.hasOpenTerminal);

  if (role === 'cashier' && hasActiveRestaurantTerminal) {
    allowed.add('tables');
    allowed.add('tabs');
  }

  if (!hasActiveRestaurantTerminal) {
    allowed.delete('tables');
    allowed.delete('tabs');
    allowed.delete('workstation');
  }

  if (!options.isRestaurant) {
    allowed.delete('tables');
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
  const visible = [...PRIMARY_VIEWS, 'cash', 'live', 'inventory', 'customers', 'staff', 'wallets', 'leaderboard', 'reports', 'settings']
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
  if (role === 'chef') return dataset === 'staff' || dataset === 'sales' || dataset === 'workstations';
  if (role === 'cashier') {
    if (dataset === 'tables') return hasActiveRestaurantTerminal;
    return ['products', 'customers', 'staff', 'sales', 'config', 'cash'].includes(dataset);
  }
  return true;
}
