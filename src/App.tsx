/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LayoutGrid, History as HistoryIcon, Settings, Package, Banknote,
  Users, UserCog, Moon, Sun, ShoppingCart, AlertCircle, ChefHat, Utensils, Trophy,
  ChevronDown, LogOut, Wallet, TabletSmartphone, Maximize2, Minimize2, Monitor, Download,
  Activity, Building2, BarChart3, Code2, MessageSquare, BrainCircuit,
  Smartphone, ScanLine, MonitorUp, Trash2
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiPost, apiPut, apiDelete, seedDemoData, clearSeededDemoData, clearAllSales } from './api';

import { useAuth } from './hooks/useAuth';
import { useAppData } from './hooks/useAppData';
import { useCheckout } from './hooks/useCheckout';
import { useSocket } from './hooks/useSocket';
import { usePosStore } from './store/usePosStore';

import { WelcomeView } from './components/WelcomeView';
import { LoginModal } from './components/LoginModal';
import { EnrollmentModal } from './components/EnrollmentModal';
import { SetupWizard } from './components/SetupWizard';
import { PointOfSaleView } from './views/PointOfSaleView';
import { HistoryView } from './views/HistoryView';
import { InventoryView } from './views/InventoryView';
import { CustomersView } from './views/CustomersView';
import { StaffView } from './views/StaffView';
import { ReportsView } from './views/ReportsView';
import { LiveView } from './views/LiveView';
import { SettingsView } from './components/SettingsView';
import { CashManagementView } from './components/CashManagementView';
import { StaffProfileView } from './components/StaffProfileView';
import { TablesView } from './components/TablesView';
import { WorkstationView } from './components/WorkstationView';
import { LeaderboardView } from './views/LeaderboardView';
import { DevDashboard } from './views/DevDashboard';
import { WalletAdminView } from './views/WalletAdminView';
import { ClientPortalView } from './views/ClientPortalView';
import { PackagesView } from './views/PackagesView';
import { PublicPackagesPage } from './views/PublicPackagesPage';
import { AiCopilotView } from './views/AiCopilotView';
import { useClientPortal } from './hooks/useClientPortal';
import { TabsView } from './views/TabsView';
import { BarcodeScanner } from './components/BarcodeScanner';
import { Receipt } from './components/Receipt';
import { PrinterReadinessPanel } from './components/PrinterReadinessPanel';

import { ProductModal } from './components/modals/ProductModal';
import { CustomerModal } from './components/modals/CustomerModal';
import { StaffModal } from './components/modals/StaffModal';
import { TenderModal } from './components/modals/TenderModal';
import { CheckoutSuccessModal } from './components/modals/CheckoutSuccessModal';
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal';
import { SplitPaymentModal } from './components/modals/SplitPaymentModal';

import { Product, Customer, Staff, Sale } from './types';
import { DEFAULT_CATEGORY_TREE, getCategoryIcon, getProductImage } from './constants';

import { MessagingView } from './views/MessagingView';
import { useMessaging } from './hooks/useMessaging';
import { usePWA } from './hooks/usePWA';
import { buildNavigation, canAccessView, getDefaultView, type StaffRole } from './permissions';

// Hardcoded dev email — only this account gets the dev role
const DEV_EMAIL = 'jameskoen78@gmail.com';

export { DEFAULT_CATEGORY_TREE };

type CompanionMenuMode = 'terminal' | 'remote_control' | 'wireless_scanner' | 'pole_display';

interface CompanionMenuState {
  companionMode: CompanionMenuMode;
  assignedCompanionMode: Exclude<CompanionMenuMode, 'terminal'> | null;
  poleDisplayDeviceId: string | null;
  companionDeviceId: string | null;
  terminalId: string | null;
  staffName: string | null;
  longTermAssignment: any;
  displaySnapshot: any;
}

// ── User Menu Component ────────────────────────────────────────────────────────
function UserMenu({ user, currentUserStaff, currentUserRole, isDarkMode, setIsDarkMode, logout, navigate,
  isFullscreen, toggleFullscreen, isKioskMode, enterKioskMode, exitKioskMode,
  canInstall, isInstalled, installApp, onShowInstallGuide, tenantId,
  showCompanionTools,
}: {
  user: any;
  currentUserStaff: any;
  currentUserRole: string | null;
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  logout: () => void;
  navigate: (path: string) => void;
  isFullscreen: boolean;
  toggleFullscreen: () => Promise<void>;
  isKioskMode: boolean;
  enterKioskMode: () => void;
  exitKioskMode: () => void;
  canInstall: boolean;
  isInstalled: boolean;
  installApp: () => Promise<void>;
  onShowInstallGuide: () => void;
  tenantId?: string | null;
  showCompanionTools: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [companionState, setCompanionState] = useState<CompanionMenuState>({
    companionMode: 'terminal',
    assignedCompanionMode: null,
    poleDisplayDeviceId: null,
    companionDeviceId: null,
    terminalId: null,
    staffName: currentUserStaff?.name || null,
    longTermAssignment: null,
    displaySnapshot: null,
  });
  const ref = useRef<HTMLDivElement>(null);
  const walletBalance = currentUserStaff?.walletBalance || 0;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setCompanionState(prev => ({ ...prev, staffName: currentUserStaff?.name || null }));
  }, [currentUserStaff?.name]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<Partial<CompanionMenuState>>).detail || {};
      setCompanionState(prev => ({ ...prev, ...detail }));
    };
    window.addEventListener('jpos:companion-state', handler);
    return () => window.removeEventListener('jpos:companion-state', handler);
  }, []);

  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent('jpos:companion-state-request'));
  }, [open]);

  const changeCompanionMode = (mode: CompanionMenuMode) => {
    setCompanionState(prev => ({
      ...prev,
      companionMode: mode,
      assignedCompanionMode: mode === 'terminal' ? null : prev.assignedCompanionMode,
    }));
    window.dispatchEvent(new CustomEvent('jpos:companion-mode-change', { detail: { mode } }));
  };

  const companionStatus = companionState.companionMode === 'terminal'
    ? companionState.longTermAssignment
      ? `Assigned to ${companionState.longTermAssignment.workstationName || 'a workstation'} long term.${companionState.poleDisplayDeviceId ? ' Display paired.' : ''}`
      : `Devices logged in as ${companionState.staffName || 'this staff member'} pair to this account automatically.${companionState.poleDisplayDeviceId ? ' Display paired.' : ''}`
    : companionState.assignedCompanionMode === 'pole_display'
      ? 'This device is acting as the customer display.'
      : companionState.assignedCompanionMode
        ? 'This device can control the terminal and scan barcodes.'
        : 'Choose how this device should help this account.';

  const companionModeOptions: Array<{ id: CompanionMenuMode; label: string; icon: React.ElementType; disabled?: boolean }> = [
    { id: 'terminal', label: 'Terminal', icon: MonitorUp },
    { id: 'remote_control', label: 'Remote', icon: Smartphone },
    { id: 'wireless_scanner', label: 'Scanner', icon: ScanLine },
    {
      id: 'pole_display',
      label: 'Display',
      icon: MonitorUp,
      disabled: Boolean(
        companionState.poleDisplayDeviceId &&
        companionState.poleDisplayDeviceId !== companionState.companionDeviceId &&
        companionState.assignedCompanionMode !== 'pole_display'
      ),
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        aria-label="User menu"
      >
        <img
          src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'Admin')}&background=2563EB&color=fff`}
          alt="Avatar"
          className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-slate-700"
        />
        <div className="hidden sm:flex flex-col items-start">
          <span className="text-xs font-bold text-slate-900 dark:text-white leading-none">{user.displayName?.split(' ')[0] || 'User'}</span>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {currentUserRole || 'staff'}
          </span>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden z-50">
          {/* Profile header */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <img
                src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'Admin')}&background=2563EB&color=fff`}
                alt="Avatar"
                className="w-10 h-10 rounded-full"
              />
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{user.displayName || 'Admin'}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
          </div>

          {/* Wallet balance */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Wallet Balance</p>
                <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">R{walletBalance.toFixed(2)}</p>
              </div>
              <button
                onClick={() => { navigate('/profile'); setOpen(false); }}
                className="px-3 py-1.5 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition-all"
              >
                My Profile
              </button>
            </div>
          </div>

          {/* Daily operation tools */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
            <PrinterReadinessPanel tenantId={tenantId} compact />
          </div>

          {showCompanionTools && (
          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-start gap-3">
              <Smartphone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">Companion device</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-snug">{companionStatus}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {companionModeOptions.map(option => (
                <button
                  key={option.id}
                  type="button"
                  disabled={Boolean(option.disabled)}
                  onClick={() => changeCompanionMode(option.id)}
                  title={option.disabled ? 'A display is already paired to this terminal' : option.label}
                  className={`h-10 rounded-xl text-[9px] font-black uppercase tracking-widest flex flex-col items-center justify-center gap-0.5 border transition-all disabled:opacity-40 ${
                    companionState.companionMode === option.id
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-300 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <option.icon className="w-3.5 h-3.5" />
                  {option.label}
                </button>
              ))}
            </div>
            {companionState.assignedCompanionMode === 'wireless_scanner' && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('jpos:companion-open-scanner'))}
                className="mt-3 w-full h-11 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95"
              >
                <ScanLine className="w-4 h-4" />
                Scan to terminal
              </button>
            )}
            {companionState.assignedCompanionMode === 'remote_control' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Terminal total</p>
                  <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">R{Number(companionState.displaySnapshot?.total || 0).toFixed(2)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('jpos:companion-clear-terminal'))}
                  className="min-h-14 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/40 text-rose-600 dark:text-rose-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear terminal
                </button>
              </div>
            )}
          </div>
          )}

          {/* Actions */}
          <div className="p-2">
            {/* Fullscreen toggle */}
            <button
              onClick={() => { toggleFullscreen(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              {isFullscreen
                ? <><Minimize2 className="w-4 h-4 text-slate-500" /> Exit Fullscreen</>
                : <><Maximize2 className="w-4 h-4 text-slate-500" /> Fullscreen</>
              }
            </button>

            {/* Kiosk mode — fullscreen + Escape blocked */}
            <button
              onClick={() => { isKioskMode ? exitKioskMode() : enterKioskMode(); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isKioskMode
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Monitor className={`w-4 h-4 ${isKioskMode ? 'text-amber-500' : 'text-slate-500'}`} />
              {isKioskMode ? 'Exit Kiosk Mode' : 'Kiosk Mode'}
              {isKioskMode && (
                <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 uppercase tracking-widest">
                  Active
                </span>
              )}
            </button>

            {/* Dark mode */}
            <button
              onClick={() => { setIsDarkMode(!isDarkMode); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              {isDarkMode
                ? <><Sun className="w-4 h-4 text-amber-500" /> Light Mode</>
                : <><Moon className="w-4 h-4 text-slate-500" /> Dark Mode</>
              }
            </button>

            {/* Install PWA */}
            {!isInstalled && (
              <button
                onClick={() => {
                  if (canInstall) { installApp(); setOpen(false); }
                  else { onShowInstallGuide(); setOpen(false); }
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 transition-all"
              >
                <Download className="w-4 h-4" />
                Install App
                <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-black bg-primary/10 text-primary uppercase tracking-widest">
                  PWA
                </span>
              </button>
            )}
            {isInstalled && (
              <div className="flex items-center gap-3 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <Download className="w-4 h-4" />
                App Installed ✓
              </div>
            )}

            {/* Sign out */}
            <button
              onClick={() => { logout(); navigate('/'); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
interface NavItem { id: string; icon: React.ElementType; label: string; group?: string }

function DesktopNav({ primaryNav, secondaryNav, isDev, view, unreadCount, workstationCount, tabsCount, navigate }: {
  primaryNav: NavItem[];
  secondaryNav: NavItem[];
  isDev: boolean;
  view: string;
  unreadCount: number;
  workstationCount: number;
  tabsCount: number;
  navigate: (path: string) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const secondaryActive = secondaryNav.some(i => i.id === view);

  // Group secondary items
  const groups = secondaryNav.reduce((acc, item) => {
    const g = item.group || 'Other';
    if (!acc[g]) acc[g] = [];
    acc[g].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  return (
    <nav className="hidden lg:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
      {/* Primary items */}
      {primaryNav.map(item => {
        const badge =
          item.id === 'messages' && unreadCount > 0 ? unreadCount :
          item.id === 'workstation' && workstationCount > 0 ? workstationCount :
          item.id === 'tabs' && tabsCount > 0 ? tabsCount :
          0;
        return (
          <button
            key={item.id}
            onClick={() => navigate(`/${item.id}`)}
            className={`relative px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
              view === item.id
                ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <item.icon className="w-3.5 h-3.5 shrink-0" />
            {item.label}
            {badge > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        );
      })}

      {/* Divider */}
      {secondaryNav.length > 0 && (
        <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />
      )}

      {/* More dropdown */}
      {secondaryNav.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={`relative px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
              secondaryActive || moreOpen
                ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {secondaryActive
              ? (() => {
                  const active = secondaryNav.find(i => i.id === view);
                  return active ? (
                    <>
                      <active.icon className="w-3.5 h-3.5 shrink-0" />
                      {active.label}
                    </>
                  ) : 'More'
                })()
              : 'More'
            }
            <ChevronDown className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
          </button>

          {moreOpen && (
            <div className="absolute top-full left-0 mt-2 w-52 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden z-50 py-1">
              {Object.entries(groups).map(([groupName, items], gIdx) => (
                <div key={groupName}>
                  {gIdx > 0 && <div className="h-px bg-slate-100 dark:bg-slate-800 mx-3 my-1" />}
                  <div className="px-3 py-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{groupName}</span>
                  </div>
                  {items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { navigate(`/${item.id}`); setMoreOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold transition-all ${
                        view === item.id
                          ? 'bg-primary/10 text-primary'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dev button — icon only */}
      {isDev && (
        <>
          <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />
          <button
            onClick={() => navigate('/dev')}
            className={`px-2 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
              view === 'dev'
                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 shadow-sm'
                : 'text-slate-400 dark:text-slate-500 hover:text-violet-600 dark:hover:text-violet-400'
            }`}
            title="Dev Dashboard"
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </nav>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const view = location.pathname.substring(1) || 'pos';

  const { user, authLoading, login, startDemo, enroll, logout, error: authError, clearError } = useAuth();
  const clientPortal = useClientPortal(user);

  // Track which login mode was chosen so we can route correctly
  const [loginMode, setLoginMode] = useState<'staff' | 'client' | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [enrollmentModalOpen, setEnrollmentModalOpen] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);

  const handleAdminLogin = () => { setLoginMode('staff'); clearError(); setLoginModalOpen(true); };
  const handleTryNow = async () => { setLoginMode('staff'); clearError(); await startDemo(); };
  const handleStartSetup = () => { setLoginMode('staff'); clearError(); setEnrollmentModalOpen(true); };
  const handleClientLogin = async () => { setLoginMode('client'); await login(); };
  const handleLogout = async () => { setLoginMode(null); await logout(); navigate('/'); };
  // Called by LoginModal on form submit
  const handleLoginSubmit = async (email: string, password: string) => {
    setLoginLoading(true);
    const ok = await login({ email, password });
    setLoginLoading(false);
    // Modal stays open on error; useAuth sets authError.
    // On success user becomes non-null, App re-renders past the WelcomeView.
    if (ok) setLoginModalOpen(false);
  };
  const handleEnrollmentSubmit = async (details: { businessName: string; ownerName: string; email: string; password: string; packageTier: 'free' | 'starter' | 'business' | 'whitelabel' }) => {
    setEnrollmentLoading(true);
    const ok = await enroll(details);
    setEnrollmentLoading(false);
    if (ok) setEnrollmentModalOpen(false);
  };
  const {
    products, customers, staff, sales, config, setConfig,
    workstations, activeSession, currentUserStaff, currentUserRole,
    tableSections, restaurantTables,
    refreshSales,
    tenantLoading, configLoading, isStaffLoading,
  } = useAppData(authLoading ? null : user);

  const { cart, setCart, setActiveCategory, setSelectedCustomerId, setActiveTableNumber, setActiveOrderId, selectedCustomerId } = usePosStore();
  const storeActiveSession = usePosStore(s => s.activeSession);
  const addToCart = usePosStore(s => s.addToCart);
  const tenantId = usePosStore(s => s.tenantId);
  const effectiveActiveSession = storeActiveSession || activeSession;
  const [activeAccountDeviceCount, setActiveAccountDeviceCount] = useState(1);
  const accountDeviceId = useMemo(() => {
    const staffId = currentUserStaff?.id || user?.id || 'staff';
    const key = `companion-device-id:${tenantId || 'local'}:${staffId}`;
    try {
      const existing = window.localStorage.getItem(key);
      if (existing) return existing;
      const created = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      window.localStorage.setItem(key, created);
      return created;
    } catch {
      return `device_${Date.now()}`;
    }
  }, [tenantId, currentUserStaff?.id, user?.id]);
  const accountPresenceSocket = useSocket({
    user,
    tenantId,
    enabled: Boolean(user && tenantId && currentUserStaff?.id),
  });
  const showCompanionTools = activeAccountDeviceCount > 1;

  useEffect(() => {
    const socket = accountPresenceSocket.socket;
    if (!socket || !tenantId || !currentUserStaff?.id) return;

    const onPresence = (payload: any) => {
      setActiveAccountDeviceCount(Number(payload?.activeDeviceCount || 1));
    };

    socket.on('account_device_presence', onPresence);
    accountPresenceSocket.emit('account_device_active', {
      tenantId,
      staffId: currentUserStaff.id,
      deviceId: accountDeviceId,
    });

    return () => {
      socket.off('account_device_presence', onPresence);
    };
  }, [accountPresenceSocket.socket, accountPresenceSocket.emit, tenantId, currentUserStaff?.id, accountDeviceId]);

  // Sync server-side data into the Zustand store so components can read it without prop drilling
  useEffect(() => {
    usePosStore.getState().setCurrentUserStaff(currentUserStaff);
  }, [currentUserStaff]);

  useEffect(() => {
    usePosStore.getState().setConfig(config);
  }, [config]);

  useEffect(() => {
    usePosStore.getState().setActiveSession(activeSession);
  }, [activeSession]);

  useEffect(() => {
    usePosStore.getState().setWorkstations(workstations);
  }, [workstations]);

  const checkout = useCheckout({ user, tenantId, currentUserStaff, customers, activeSession: effectiveActiveSession, config, refreshSales });

  // Messaging
  const messaging = useMessaging({ user, tenantId, currentUserStaff, staff });

  // PWA + Kiosk
  const { isKioskMode, enterKioskMode, exitKioskMode, isFullscreen, toggleFullscreen, canInstall, isInstalled, installApp } = usePWA();

  // Dark mode
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('darkMode') === 'true' : false
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode]);

  // Barcode scanner
  const [isScanning, setIsScanning] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [receiptToPrint, setReceiptToPrint] = useState<Sale | null>(null);
  const [receiptPrintPending, setReceiptPrintPending] = useState(false);

  // History filter
  const [filterCustomerId, setFilterCustomerId] = useState<string | null>(null);
  const { searchQuery, setSearchQuery } = usePosStore();

  // Modals
  const [productModal, setProductModal] = useState<{ isOpen: boolean; product: Partial<Product> | null }>({ isOpen: false, product: null });
  const [customerModal, setCustomerModal] = useState<{ isOpen: boolean; customer: Partial<Customer> | null }>({ isOpen: false, customer: null });
  const [staffModal, setStaffModal] = useState<{ isOpen: boolean; staff: Partial<Staff> | null }>({ isOpen: false, staff: null });
  const [staffToDelete, setStaffToDelete] = useState<string | null>(null);
  const [isProcessingCrud, setIsProcessingCrud] = useState(false);

  // Category tree helpers
  const categoryTree = config?.categories || DEFAULT_CATEGORY_TREE;
  const SECTIONS = Object.keys(categoryTree);
  const CATEGORIES = useMemo(() => {
    const cats = SECTIONS.flatMap(sec => Object.keys(categoryTree[sec]));
    return ['All', ...cats];
  }, [categoryTree]);

  // Count pending/accepted workstation items across all active orders
  const pendingWorkstationCount = useMemo(() => {
    return sales.reduce((count, sale) => {
      if (sale.status !== 'kitchen' && sale.status !== 'open') return count;
      return count + sale.items.filter(item => {
        const o = item as any;
        return o.workstationId && (o.status === 'pending' || o.status === 'accepted');
      }).length;
    }, 0);
  }, [sales]);

  // Count open bar tabs
  const openTabsCount = useMemo(
    () => sales.filter(s => s.isTab && s.status === 'open').length,
    [sales]
  );

  const receiptEligibleSales = useMemo(() => {
    return sales.filter(sale => {
      if (sale.status !== 'completed') return false;
      if (currentUserRole === 'cashier' && (sale as any).staffId !== currentUserStaff?.id) return false;
      return true;
    });
  }, [sales, currentUserRole, currentUserStaff?.id]);

  const lastReceiptSale = useMemo(() => {
    return [...receiptEligibleSales].sort((a, b) => {
      const bTime = new Date(b.createdAt || 0).getTime();
      const aTime = new Date(a.createdAt || 0).getTime();
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    })[0] || null;
  }, [receiptEligibleSales]);

  const printReceipt = (sale: Sale | null) => {
    if (!sale) return;
    setReceiptToPrint(sale);
    setReceiptPrintPending(true);
  };

  useEffect(() => {
    if (!receiptPrintPending || !receiptToPrint) return;

    const cleanup = () => {
      setReceiptPrintPending(false);
      setReceiptToPrint(null);
    };
    const printTimer = window.setTimeout(() => window.print(), 75);
    const fallbackTimer = window.setTimeout(cleanup, 5000);

    window.addEventListener('afterprint', cleanup, { once: true });

    return () => {
      window.clearTimeout(printTimer);
      window.clearTimeout(fallbackTimer);
      window.removeEventListener('afterprint', cleanup);
    };
  }, [receiptPrintPending, receiptToPrint]);

  // Dev role — hardcoded to the dev email, bypasses tenant role system
  const isDev = user?.email === DEV_EMAIL;

  // Nav items based on role — split into primary (always visible) and secondary (dropdown)
  const roleForPermissions = currentUserRole as StaffRole | null;
  const permissionOptions = useMemo(
    () => ({
      isDev,
      isRestaurant: Boolean(config.business?.isRestaurantMode),
      hasOpenTerminal: Boolean(effectiveActiveSession),
      permissions: currentUserStaff?.permissions,
    }),
    [isDev, config.business?.isRestaurantMode, effectiveActiveSession, currentUserStaff?.permissions]
  );

  const { primaryNav, secondaryNav, navItems } = useMemo(() => {
    const built = buildNavigation(roleForPermissions, permissionOptions);
    return {
      ...built,
      navItems: [
        ...built.navItems,
        ...(isDev ? [{ id: 'dev' as const, icon: Code2, label: 'Dev' }] : []),
      ],
    };
  }, [roleForPermissions, permissionOptions, isDev]);

  // All nav items combined (for redirect logic and mobile nav)
  
  // Redirect if current view is not allowed — but never redirect a dev user away from /dev or anyone from /profile
  useEffect(() => {
    if (!currentUserRole) return;
    if (!canAccessView(roleForPermissions, view, permissionOptions)) {
      navigate(`/${getDefaultView(roleForPermissions, permissionOptions)}`);
    }
  }, [currentUserRole, roleForPermissions, view, permissionOptions, navigate]);

  // CRUD handlers
  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productModal.product || !tenantId) return;
    setIsProcessingCrud(true);
    try {
      const { id, ...data } = productModal.product;
      const cleanData = {
        ...data,
        price: Number(data.price) || 0,
        costPrice: Number(data.costPrice) || 0,
        stock: Number(data.stock) || 0,
        minStock: Number(data.minStock) || 10,
        updatedAt: new Date().toISOString(),
      };
      if (id) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/products/${id}`, cleanData);
      } else {
        await apiPost(`/api/mariadb/tenants/${tenantId}/products`, { ...cleanData, createdAt: new Date().toISOString() });
      }
      setProductModal({ isOpen: false, product: null });
    } catch (err) {
      console.error('Failed to save product:', err);
    }
    setIsProcessingCrud(false);
  };

  const saveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerModal.customer || !tenantId) return;
    setIsProcessingCrud(true);
    try {
      const { id, ...data } = customerModal.customer;
      if (id) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/customers/${id}`, data);
      } else {
        await apiPost(`/api/mariadb/tenants/${tenantId}/customers`, { ...data, createdAt: new Date().toISOString() });
      }
      setCustomerModal({ isOpen: false, customer: null });
    } catch (err) {
      console.error('Failed to save customer:', err);
    }
    setIsProcessingCrud(false);
  };

  const saveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffModal.staff || !tenantId) return;
    setIsProcessingCrud(true);
    try {
      const { id, newPassword, ...data } = staffModal.staff;
      let targetId = id;
      if (id) {
        await apiPut(`/api/mariadb/tenants/${tenantId}/staff/${id}`, { ...data, updatedAt: new Date().toISOString() });
      } else {
        const existing = staff.find(s => s.email.toLowerCase() === data.email?.toLowerCase());
        if (existing) {
          alert('A staff member with this email already exists!');
          setIsProcessingCrud(false);
          return;
        }
        const created = await apiPost(`/api/mariadb/tenants/${tenantId}/staff`, { ...data, status: 'active', createdAt: new Date().toISOString() });
        targetId = (created as any).id;
      }

      if (newPassword && newPassword.length >= 6) {
        try {
          await apiPost('/api/auth/setup-password', { staffId: targetId, password: newPassword });
        } catch (err: any) {
          console.error('Failed to set password:', err);
          alert('Staff saved, but failed to set password: ' + (err.message || 'Unknown error'));
        }
      }

      setStaffModal({ isOpen: false, staff: null });
    } catch (err) {
      console.error('Failed to save staff:', err);
    }
    setIsProcessingCrud(false);
  };

  const deleteStaff = async (id: string) => {
    if (!tenantId) return;
    setIsProcessingCrud(true);
    try {
      await apiDelete(`/api/mariadb/tenants/${tenantId}/staff/${id}`);
      setStaffToDelete(null);
    } catch (err) {
      console.error('Failed to delete staff:', err);
    }
    setIsProcessingCrud(false);
  };

  // Loading state — only block on tenantLoading if we actually have a user
  if (authLoading || (user && (tenantLoading || configLoading || isStaffLoading))) {
    return (
      <div className="h-screen w-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    if (view === 'packages') {
      return (
        <>
          <PublicPackagesPage
            onLogin={handleAdminLogin}
            onTryNow={handleTryNow}
            onStartSetup={handleStartSetup}
            onClientLogin={handleClientLogin}
            isDarkMode={isDarkMode}
            toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          />
          <LoginModal
            isOpen={loginModalOpen}
            onClose={() => { setLoginModalOpen(false); clearError(); }}
            onSubmit={handleLoginSubmit}
            error={authError}
            isLoading={loginLoading}
          />
          <EnrollmentModal
            isOpen={enrollmentModalOpen}
            onClose={() => { setEnrollmentModalOpen(false); clearError(); }}
            onSubmit={handleEnrollmentSubmit}
            error={authError}
            isLoading={enrollmentLoading}
          />
        </>
      );
    }

    return (
      <>
        <WelcomeView
          onLogin={handleAdminLogin}
          onTryNow={handleTryNow}
          onStartSetup={handleStartSetup}
          onClientLogin={handleClientLogin}
          isDarkMode={isDarkMode}
          toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        />
        <LoginModal
          isOpen={loginModalOpen}
          onClose={() => { setLoginModalOpen(false); clearError(); }}
          onSubmit={handleLoginSubmit}
          error={authError}
          isLoading={loginLoading}
        />
        <EnrollmentModal
          isOpen={enrollmentModalOpen}
          onClose={() => { setEnrollmentModalOpen(false); clearError(); }}
          onSubmit={handleEnrollmentSubmit}
          error={authError}
          isLoading={enrollmentLoading}
        />
      </>
    );
  }

  // If user logged in via client portal and we found their customer record, show portal
  if (user && loginMode === 'client' && !clientPortal.loading) {
    if (clientPortal.customer && clientPortal.tenantId) {
      return (
        <ClientPortalView
          user={user}
          customer={clientPortal.customer}
          tenantId={clientPortal.tenantId}
          sales={clientPortal.sales}
          payoutRequests={clientPortal.payoutRequests}
          isDarkMode={isDarkMode}
          toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          onLogout={handleLogout}
          businessName={config?.business?.name}
        />
      );
    }
    if (clientPortal.notFound) {
      return (
        <div className="h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mb-2">No Account Found</h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8 max-w-sm">
            No customer account was found for <strong>{user.email}</strong>. Please ask the business to add you as a customer first.
          </p>
          <button onClick={handleLogout} className="px-8 py-3 bg-primary text-white font-bold rounded-xl transition-all hover:bg-primary/90">
            Sign Out
          </button>
        </div>
      );
    }
    // Still loading
    return (
      <div className="h-screen w-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!config?.setupCompleted) {
    if (currentUserRole === 'admin') {
      return <SetupWizard user={user} config={config} />;
    } else {
      return (
        <div className="h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-6">
            <Building2 className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Setup Required</h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8 max-w-sm">
            The business setup has not been completed yet. Please ask an administrator to complete the setup.
          </p>
          <button onClick={handleLogout} className="px-8 py-3 bg-primary text-white font-bold rounded-xl transition-all hover:bg-primary/90">
            Sign Out
          </button>
        </div>
      );
    }
  }

  if (currentUserRole === null) {
    return (
      <div className="h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Access Denied</h1>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8 max-w-sm">
          You are not registered as staff for this business. Please contact your administrator.
        </p>
        <button
          onClick={() => { handleLogout(); }}
          className="px-8 py-3 bg-slate-100 dark:bg-[#0B1120] text-slate-600 dark:text-slate-300 font-bold rounded-xl transition-all hover:bg-slate-200 dark:hover:bg-slate-900"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="h-14 lg:h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700/60 px-4 lg:px-6 flex items-center justify-between flex-shrink-0 z-40 sticky top-0">
        <div className="flex items-center gap-4 lg:gap-8">
          <div className="font-extrabold text-lg lg:text-xl tracking-tighter text-primary shrink-0">Jimmy's POS</div>
          <DesktopNav
            primaryNav={primaryNav}
            secondaryNav={secondaryNav}
            isDev={isDev}
            view={view}
            unreadCount={messaging.unreadCount}
            workstationCount={pendingWorkstationCount}
            tabsCount={openTabsCount}
            navigate={navigate}
          />
        </div>

        <div className="flex items-center gap-3">
          <UserMenu
            user={user}
            currentUserStaff={currentUserStaff}
            currentUserRole={currentUserRole}
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            logout={handleLogout}
            navigate={navigate}
            isFullscreen={isFullscreen}
            toggleFullscreen={toggleFullscreen}
            isKioskMode={isKioskMode}
            enterKioskMode={enterKioskMode}
            exitKioskMode={exitKioskMode}
            canInstall={canInstall}
            isInstalled={isInstalled}
            installApp={installApp}
            onShowInstallGuide={() => setShowInstallGuide(true)}
            tenantId={tenantId}
            showCompanionTools={showCompanionTools}
          />

          {view === 'pos' && (
            <button
              onClick={() => usePosStore.getState().setIsCartOpen(!usePosStore.getState().isCartOpen)}
              className="lg:hidden relative p-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/20"
              aria-label="Open cart"
            >
              <ShoppingCart className="w-5 h-5" />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Mobile Nav */}
      <nav className="lg:hidden flex overflow-x-auto bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/60 px-4 py-2 gap-2 no-scrollbar shrink-0 sticky top-14 z-30 shadow-sm">
        {navItems.map(item => {
          const badge =
            item.id === 'messages' && messaging.unreadCount > 0 ? messaging.unreadCount :
            item.id === 'workstation' && pendingWorkstationCount > 0 ? pendingWorkstationCount :
            item.id === 'tabs' && openTabsCount > 0 ? openTabsCount :
            0;
          return (
            <button
              key={item.id}
              onClick={() => navigate(`/${item.id}`)}
              className={`relative px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap border ${view === item.id ? 'bg-primary/5 text-primary border-primary/20' : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0B1120] border-transparent'}`}
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
              {badge > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {view === 'pos' && (
          <PointOfSaleView
            products={products}
            user={user}
            customers={customers}
            sales={sales}
            workstations={workstations}
            isProcessing={checkout.isProcessing}
            setIsProcessing={checkout.setIsProcessing}
            handleSaveOrder={(sendToKitchen) => checkout.handleSaveOrder(sendToKitchen, navigate)}
            handleParkSale={checkout.handleParkSale}
            handleCheckout={checkout.handleCheckout}
            handleWalletCheckout={checkout.handleWalletCheckout}
            handleOpenTab={checkout.handleOpenTab}
            handleOpenTable={checkout.handleOpenTable}
            setTenderModal={checkout.setTenderModal}
            setTenderedAmount={(v) => checkout.setTenderedAmount(v)}
            setSplitPaymentModal={checkout.setSplitPaymentModal}
            categoryTree={categoryTree}
            CATEGORIES={CATEGORIES}
            getCategoryIcon={getCategoryIcon}
            getProductImage={getProductImage}
            openCashDrawer={() => navigate('/cash')}
            pointsDiscount={checkout.pointsDiscount}
            onRedeemPoints={checkout.redeemPoints}
            onClearPointsDiscount={checkout.clearPointsDiscount}
            restaurantTables={restaurantTables}
            onSalesUpdated={refreshSales}
            lastReceiptSale={lastReceiptSale}
            onPrintLastReceipt={() => printReceipt(lastReceiptSale)}
            suppressBillPrint={Boolean(receiptToPrint)}
          />
        )}
        {view === 'history' && (
          <HistoryView
            sales={sales.filter(s => {
              if (currentUserRole === 'cashier' && (s as any).staffId !== currentUserStaff?.id) return false;
              return true;
            })}
            customers={customers}
            config={config}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filterCustomerId={filterCustomerId}
            setFilterCustomerId={setFilterCustomerId}
            onSalesUpdated={refreshSales}
          />
        )}
        {view === 'cash' && <CashManagementView currentUserStaff={currentUserStaff} sales={sales} />}
        {view === 'inventory' && (
          <InventoryView
            products={products}
            config={config}
            onEditProduct={(p) => setProductModal({ isOpen: true, product: p })}
            onAddProduct={() => setProductModal({ isOpen: true, product: { stock: 0, price: 0, costPrice: 0 } })}
          />
        )}
        {view === 'customers' && (
          <CustomersView
            customers={customers}
            sales={sales}
            onEdit={(c) => setCustomerModal({ isOpen: true, customer: c })}
            onAdd={() => setCustomerModal({ isOpen: true, customer: {} })}
            onViewOrders={(id) => { setFilterCustomerId(id); navigate('/history'); }}
            onResumeTab={(sale) => {
              setCart(sale.items);
              usePosStore.getState().setSelectedCustomerId(sale.customerId || null);
              usePosStore.getState().setActiveOrderId(sale.id);
              navigate('/pos');
            }}
          />
        )}
        {view === 'live' && <LiveView tenantId={tenantId} />}
        {view === 'reports' && <ReportsView sales={sales} tenantId={tenantId} />}
        {view === 'ai' && <AiCopilotView tenantId={tenantId} />}
        {view === 'staff' && (
          <StaffView
            staff={staff}
            tenantId={tenantId}
            onEdit={(s) => setStaffModal({ isOpen: true, staff: s })}
            onAdd={() => setStaffModal({ isOpen: true, staff: { role: 'cashier' } })}
            onDelete={(id) => setStaffToDelete(id)}
          />
        )}
        {view === 'wallets' && (
          <WalletAdminView staff={staff} customers={customers} currentUserStaff={currentUserStaff} />
        )}
        {view === 'profile' && <StaffProfileView currentUserStaff={currentUserStaff} />}
        {view === 'settings' && <SettingsView config={config} setConfig={setConfig} />}
        {view === 'packages' && <PackagesView />}
        {view === 'tables' && (
          <TablesView
            sales={sales}
            tableSections={tableSections}
            restaurantTables={restaurantTables}
            onSalesUpdated={refreshSales}
            onSelectTable={(table, order) => {
              setActiveTableNumber(table);
              if (order) {
                setActiveOrderId(order.id);
                setCart(order.items);
              } else {
                setActiveOrderId(null);
                setCart([]);
              }
              navigate('/');
            }}
          />
        )}
        {view === 'leaderboard' && <LeaderboardView staff={staff} />}
        {view === 'tabs' && (
          <TabsView
            sales={sales}
            customers={customers}
            onResumeTab={(sale) => {
              setCart(sale.items);
              usePosStore.getState().setSelectedCustomerId(sale.customerId || null);
              usePosStore.getState().setActiveOrderId(sale.id);
              navigate('/pos');
            }}
          />
        )}
        {view === 'messages' && (
          <MessagingView
            currentUserStaff={currentUserStaff}
            staff={staff}
            messages={messaging.messages}
            devBroadcasts={messaging.devBroadcasts}
            activeChannel={messaging.activeChannel}
            setActiveChannel={messaging.setActiveChannel}
            sendMessage={messaging.sendMessage}
            markChannelRead={messaging.markChannelRead}
            getChannelMessages={messaging.getChannelMessages}
            getChannelUnread={messaging.getChannelUnread}
            isDev={messaging.isDev}
            myId={messaging.myId}
          />
        )}
        {view === 'workstation' && (
          <WorkstationView
            sales={sales}
            workstations={workstations}
            customers={customers}
            currentUserStaff={currentUserStaff}
            onSalesUpdated={refreshSales}
          />
        )}
        {view === 'dev' && isDev && user && (
          <DevDashboard
            user={user}
            tenantId={tenantId}
            products={products}
            customers={customers}
            staff={staff}
            sales={sales}
            config={config}
            workstations={workstations}
            onSeedDemo={async (mode) => {
              if (!tenantId) return;
              await seedDemoData(tenantId, mode);
            }}
            onClearSeeded={async () => {
              if (!tenantId) return;
              await clearSeededDemoData(tenantId);
            }}
            onClearSales={async () => {
              if (!tenantId) return;
              await clearAllSales(tenantId);
            }}
          />
        )}
      </div>

      {/* Global Modals & Overlays */}
      <AnimatePresence>
        {/* Kiosk mode exit button — always visible when kiosk is active */}
        {isKioskMode && (
          <div className="fixed bottom-6 right-6 z-[200]">
            <button
              onClick={exitKioskMode}
              className="flex items-center gap-2 px-4 py-3 bg-amber-500 text-white rounded-2xl font-black text-sm shadow-2xl shadow-amber-500/40 hover:bg-amber-600 active:scale-95 transition-all border-2 border-amber-400"
            >
              <Monitor className="w-4 h-4" />
              Exit Kiosk
            </button>
          </div>
        )}

        {/* Install guide modal — for browsers without beforeinstallprompt (Safari, Firefox) */}
        {showInstallGuide && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <Download className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">Install App</h3>
                  <p className="text-xs text-slate-400">Add to your home screen</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
                  <p className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-1">Chrome / Edge (Desktop)</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Click the install icon (⊕) in the address bar, or go to Menu → Install Jimmy's POS</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">Safari (iPhone / iPad)</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Tap the Share button (□↑) → "Add to Home Screen"</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">Chrome (Android)</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Tap Menu (⋮) → "Add to Home Screen" or "Install App"</p>
                </div>
              </div>

              <button
                onClick={() => setShowInstallGuide(false)}
                className="w-full py-3.5 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-primary/90 active:scale-95 transition-all"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
        {checkout.tenderModal.isOpen && checkout.tenderModal.method && (
          <TenderModal
            method={checkout.tenderModal.method}
            cartTotal={checkout.cartTotal}
            tenderedAmount={checkout.tenderedAmount}
            cardOverageAction={checkout.cardOverageAction}
            isProcessing={checkout.isProcessing}
            onTenderedChange={checkout.setTenderedAmount}
            onCardOverageChange={checkout.setCardOverageAction}
            onConfirm={() => checkout.handleCheckout(checkout.tenderModal.method!)}
            onClose={() => checkout.setTenderModal({ isOpen: false, method: null })}
          />
        )}

        {checkout.splitPaymentModal && (
          <SplitPaymentModal
            isOpen={checkout.splitPaymentModal}
            cartTotal={checkout.cartTotal}
            isProcessing={checkout.isProcessing}
            customerWalletBalance={customers.find(c => c.id === selectedCustomerId)?.walletBalance || 0}
            onConfirm={(payments) => checkout.handleCheckout('split', payments)}
            onClose={() => checkout.setSplitPaymentModal(false)}
          />
        )}

        {checkout.checkoutModal.isOpen && checkout.checkoutModal.saleData && (
          <Receipt sale={checkout.checkoutModal.saleData} config={config} />
        )}

        {receiptToPrint && !checkout.checkoutModal.isOpen && (
          <Receipt sale={receiptToPrint} config={config} />
        )}

        {checkout.checkoutModal.isOpen && (
          <CheckoutSuccessModal
            sale={checkout.checkoutModal.saleData}
            config={config}
            onNewSale={() => checkout.setCheckoutModal({ isOpen: false, paymentMethod: null })}
          />
        )}

        {isScanning && (
          <BarcodeScanner
            onScan={(barcode) => {
              const product = products.find(p => p.barcode === barcode);
              if (product) {
                addToCart(product);
                setIsScanning(false);
              } else {
                console.warn('Product not found for barcode:', barcode);
              }
            }}
            onClose={() => setIsScanning(false)}
          />
        )}

        {productModal.isOpen && (
          <ProductModal
            product={productModal.product}
            isProcessing={isProcessingCrud}
            config={config}
            onSave={saveProduct}
            onClose={() => setProductModal({ isOpen: false, product: null })}
            onChange={(p) => setProductModal({ isOpen: true, product: p })}
          />
        )}

        {customerModal.isOpen && (
          <CustomerModal
            customer={customerModal.customer}
            isProcessing={isProcessingCrud}
            onSave={saveCustomer}
            onClose={() => setCustomerModal({ isOpen: false, customer: null })}
            onChange={(c) => setCustomerModal({ isOpen: true, customer: c })}
          />
        )}

        {staffModal.isOpen && (
          <StaffModal
            staff={staffModal.staff}
            isProcessing={isProcessingCrud}
            config={config}
            onSave={saveStaff}
            onClose={() => setStaffModal({ isOpen: false, staff: null })}
            onChange={(s) => setStaffModal({ isOpen: true, staff: s })}
          />
        )}

        {staffToDelete && (
          <DeleteConfirmModal
            title="Delete Personnel"
            message="Are you sure you want to delete this staff member? This action cannot be undone."
            isProcessing={isProcessingCrud}
            onConfirm={() => deleteStaff(staffToDelete)}
            onCancel={() => setStaffToDelete(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
