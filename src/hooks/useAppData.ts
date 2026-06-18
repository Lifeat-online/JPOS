import { useState, useEffect, useCallback, useMemo } from 'react';
import { getAccessToken, JwtUser as User } from './useAuth';
import { Product, Customer, Staff, Sale, AppConfig, Workstation, RestaurantTable, TableSection } from '../types';
import { usePosStore } from '../store/usePosStore';
import {
  getUserByUid,
  getStaffTenantByEmail,
  getTenantProducts,
  getTenantCustomers,
  getTenantStaff,
  getTenantSales,
  getTenantWorkstations,
  getTenantConfig,
  getOpenCashSession,
  getTenantTableSections,
  getTenantRestaurantTables,
} from '../api';
import { canLoadDataset, type StaffRole } from '../permissions';
import { DEV_TENANT_ID, isDevEmail } from '../utils/devMode';

export const DEFAULT_CONFIG: AppConfig = {
  payfastMerchantId: '10000100',
  payfastMerchantKey: '46f0cd694581a',
  payfastPassphrase: 'jt7v60h69n8a1',
  payfastSandbox: true,
};

function isSessionExpiredError(err: unknown) {
  return err instanceof Error && err.message.includes('Session expired');
}

function isRateLimitError(err: unknown): boolean {
  return Boolean((err as { isRateLimit?: boolean } | null)?.isRateLimit);
}

let rateLimitPausedUntil = 0;
function noteRateLimitPause(seconds: number) {
  const until = Date.now() + seconds * 1000;
  if (until > rateLimitPausedUntil) rateLimitPausedUntil = until;
}
function isPollingPaused(): boolean {
  return Date.now() < rateLimitPausedUntil;
}

function logLoadError(label: string, err: unknown) {
  if (isSessionExpiredError(err)) return;
  if (isRateLimitError(err)) {
    const retry = Number((err as { retryAfter?: number } | null)?.retryAfter) || 30;
    noteRateLimitPause(retry);
    return;
  }
  const message = err instanceof Error ? err.message : (() => {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  })();
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`${label} load error: ${message}`, err);
  if (stack) console.error(`${label} stack:`, stack);
}

export function useAppData(user: User | null) {
  const { tenantId, setTenantId } = usePosStore();
  const storeActiveSession = usePosStore(s => s.activeSession);
  const isAuthenticated = Boolean(user && getAccessToken());
  const canLoadTenantData = Boolean(tenantId && isAuthenticated);

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [tableSections, setTableSections] = useState<TableSection[]>([]);
  const [restaurantTables, setRestaurantTables] = useState<RestaurantTable[]>([]);

  const [tenantLoading, setTenantLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [isStaffLoading, setIsStaffLoading] = useState(true);
  const [productRefreshTick, setProductRefreshTick] = useState(0);

  const [prevTenantId, setPrevTenantId] = useState<string | null>(tenantId);
  if (tenantId !== prevTenantId) {
    setPrevTenantId(tenantId);
    if (tenantId) {
      setConfigLoading(true);
      setIsStaffLoading(true);
    } else {
      setConfigLoading(false);
      setIsStaffLoading(false);
    }
  }

  const [currentUserStaff, setCurrentUserStaff] = useState<Staff | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<StaffRole | null>(null);
  const refreshProducts = useCallback(() => {
    setProductRefreshTick(tick => tick + 1);
  }, []);
  const tableAccessOptions = useMemo(() => ({
    isRestaurant: Boolean(config.business?.isRestaurantMode),
    hasOpenTerminal: Boolean(activeSession || storeActiveSession),
    permissions: currentUserStaff?.permissions,
  }), [config.business?.isRestaurantMode, activeSession, storeActiveSession, currentUserStaff?.permissions]);

  const loadSales = useCallback(async () => {
    if (isPollingPaused()) return;
    if (!canLoadTenantData || !tenantId || !canLoadDataset(currentUserRole, 'sales', tableAccessOptions)) {
      setSales([]);
      return;
    }
    try {
      const fetched = await getTenantSales(tenantId);
      const sanitized = (fetched || []).map((s: any) => ({
        ...s,
        total: Number(s.total || 0),
        subtotal: s.subtotal ? Number(s.subtotal) : undefined,
        taxAmount: s.taxAmount ? Number(s.taxAmount) : undefined,
        taxRate: s.taxRate ? Number(s.taxRate) : undefined,
        tenderedAmount: s.tenderedAmount ? Number(s.tenderedAmount) : undefined,
        changeAmount: s.changeAmount ? Number(s.changeAmount) : undefined,
        tipAmount: s.tipAmount ? Number(s.tipAmount) : undefined,
        cashOutAmount: s.cashOutAmount ? Number(s.cashOutAmount) : undefined,
        pointsDiscount: s.pointsDiscount ? Number(s.pointsDiscount) : undefined,
        items: (s.items || []).map((item: any) => ({
          ...item,
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 0),
        })),
      }));
      setSales(sanitized);
    } catch (err) {
      logLoadError('Sales', err);
    }
  }, [tenantId, canLoadTenantData, currentUserRole, tableAccessOptions]);

  const refreshCustomers = useCallback(async () => {
    if (!canLoadTenantData || !canLoadDataset(currentUserRole, 'customers', tableAccessOptions)) {
      setCustomers([]);
      return;
    }
    const fetched = await getTenantCustomers(tenantId!);
    const sanitized = (fetched || []).map((c: any) => ({
      ...c,
      loyaltyPoints: Number(c.loyaltyPoints || 0),
      walletBalance: Number(c.walletBalance || 0),
      accountEnabled: Boolean(c.accountEnabled),
      accountLimit: Number(c.accountLimit || 0),
      accountBalance: Number(c.accountBalance || 0),
    }));
    setCustomers(sanitized);
  }, [tenantId, canLoadTenantData, currentUserRole, tableAccessOptions]);

  const refreshStaff = useCallback(async () => {
    if (!canLoadTenantData) {
      setStaff([]);
      setIsStaffLoading(false);
      return;
    }
    const fetched = await getTenantStaff(tenantId!);
    const sanitized = (fetched || []).map((s: any) => ({
      ...s,
      payRate: s.payRate ? Number(s.payRate) : undefined,
      walletBalance: Number(s.walletBalance || 0),
      permissions: typeof s.permissions === 'string' ? JSON.parse(s.permissions || '{}') : (s.permissions || {}),
      assignedSections: typeof s.assignedSections === 'string' ? JSON.parse(s.assignedSections) : (s.assignedSections || []),
      assignedCategories: typeof s.assignedCategories === 'string' ? JSON.parse(s.assignedCategories) : (s.assignedCategories || []),
      metrics: typeof s.metrics === 'string' ? JSON.parse(s.metrics) : s.metrics,
      badges: typeof s.badges === 'string' ? JSON.parse(s.badges) : s.badges,
    }));
    setStaff(sanitized);
    setIsStaffLoading(false);
  }, [tenantId, canLoadTenantData]);

  useEffect(() => {
    let active = true;
    async function resolveTenant() {
      if (!user) {
        setTenantId(null);
        setTenantLoading(false);
        return;
      }

      setTenantLoading(true);
      const userEmail = String(user.email || '').trim().toLowerCase();
      if (isDevEmail(userEmail)) {
        if (!active) return;
        setTenantId(DEV_TENANT_ID);
        setTenantLoading(false);
        return;
      }

      try {
        const userRecord = await getUserByUid(user.uid);
        if (userRecord?.tenant_id) {
          if (!active) return;
          setTenantId(userRecord.tenant_id);
          setTenantLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Tenant resolve by user UID failed:', err);
      }

      if (user.email) {
        try {
          const staffRecord = await getStaffTenantByEmail(user.email);
          if (staffRecord?.tenant_id) {
            if (!active) return;
            setTenantId(staffRecord.tenant_id);
            setTenantLoading(false);
            return;
          }
        } catch (err) {
          console.warn('Tenant resolve by staff email failed:', err);
        }
      }

      if (active) {
        setTenantId(null);
        setTenantLoading(false);
      }
    }

    resolveTenant();
    return () => { active = false; };
  }, [user, setTenantId]);

  useEffect(() => {
    if (user && !isStaffLoading) {
      const userEmail = String(user.email || '').trim().toLowerCase();
      const s = staff.find(s => String(s.email || '').trim().toLowerCase() === userEmail) ?? null;
      if (s) {
        setCurrentUserStaff(s);
        setCurrentUserRole(s.role);
        return;
      }

      if (isDevEmail(userEmail) || user.role === 'dev') {
        setCurrentUserStaff({
          id: user.uid || user.id || 'dev',
          name: user.displayName || user.name || user.email || 'Dev',
          role: 'dev',
          email: user.email,
          status: 'active',
          permissions: { canAccessDevTools: true },
          assignedSections: [],
          assignedCategories: [],
          walletBalance: 0,
          discountPercent: 0,
          createdAt: new Date().toISOString(),
          badges: [],
        });
        setCurrentUserRole('dev');
        return;
      }

      setCurrentUserStaff(null);
      setCurrentUserRole(null);
    } else if (!user) {
      setCurrentUserStaff(null);
      setCurrentUserRole(null);
    }
  }, [user, staff, isStaffLoading]);

    useEffect(() => {
    if (!canLoadTenantData || !canLoadDataset(currentUserRole, 'products', tableAccessOptions)) {
      setProducts([]);
      return;
    }
    let active = true;
    let interval: number | null = null;

    async function loadProducts() {
      if (isPollingPaused()) return;
      try {
        const fetched = await getTenantProducts(tenantId!);
        if (!active) return;
        const sanitized = (fetched || []).map((p: any) => ({
          ...p,
          price: Number(p.price || 0),
          costPrice: p.costPrice ? Number(p.costPrice) : undefined,
          stock: Number(p.stock || 0),
          minStock: p.minStock ? Number(p.minStock) : undefined,
        }));
        setProducts(sanitized);
      } catch (err) {
        logLoadError('Products', err);
      }
    }

    const start = () => { if (!interval) interval = window.setInterval(loadProducts, 30000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    const handleVisibility = () => {
      if (document.hidden) stop();
      else { void loadProducts(); start(); }
    };

    loadProducts();
    start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { 
      active = false; 
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [tenantId, canLoadTenantData, currentUserRole, tableAccessOptions, productRefreshTick]);

    useEffect(() => {
    if (!canLoadTenantData || !canLoadDataset(currentUserRole, 'customers', tableAccessOptions)) {
      setCustomers([]);
      return;
    }
    let active = true;
    let interval: number | null = null;

    async function loadCustomers() {
      try {
    if (isPollingPaused()) return;
    const fetched = await getTenantCustomers(tenantId!);
        if (!active) return;
        const sanitized = (fetched || []).map((c: any) => ({
          ...c,
          loyaltyPoints: Number(c.loyaltyPoints || 0),
          walletBalance: Number(c.walletBalance || 0),
          accountEnabled: Boolean(c.accountEnabled),
          accountLimit: Number(c.accountLimit || 0),
          accountBalance: Number(c.accountBalance || 0),
        }));
        setCustomers(sanitized);
      } catch (err) {
        logLoadError('Customers', err);
      }
    }

    const start = () => { if (!interval) interval = window.setInterval(loadCustomers, 30000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    const handleVisibility = () => {
      if (document.hidden) stop();
      else { void loadCustomers(); start(); }
    };

    loadCustomers();
    start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { 
      active = false; 
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [tenantId, canLoadTenantData, currentUserRole, tableAccessOptions]);

    useEffect(() => {
    if (!canLoadTenantData) {
      setStaff([]);
      setIsStaffLoading(false);
      return;
    }
    let active = true;
    let interval: number | null = null;
    setIsStaffLoading(true);

    async function loadStaff() {
      if (isPollingPaused()) return;
      try {
        const fetched = await getTenantStaff(tenantId!);
        if (!active) return;
        const sanitized = (fetched || []).map((s: any) => ({
          ...s,
          payRate: s.payRate ? Number(s.payRate) : undefined,
          walletBalance: Number(s.walletBalance || 0),
          permissions: typeof s.permissions === 'string' ? JSON.parse(s.permissions || '{}') : (s.permissions || {}),
          assignedSections: typeof s.assignedSections === 'string' ? JSON.parse(s.assignedSections) : (s.assignedSections || []),
          assignedCategories: typeof s.assignedCategories === 'string' ? JSON.parse(s.assignedCategories) : (s.assignedCategories || []),
          metrics: typeof s.metrics === 'string' ? JSON.parse(s.metrics) : s.metrics,
          badges: typeof s.badges === 'string' ? JSON.parse(s.badges) : s.badges,
        }));
        setStaff(sanitized);
      } catch (err) {
        logLoadError('Staff', err);
      } finally {
        if (active) setIsStaffLoading(false);
      }
    }

    const start = () => { if (!interval) interval = window.setInterval(loadStaff, 60000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    const handleVisibility = () => {
      if (document.hidden) stop();
      else { void loadStaff(); start(); }
    };

    loadStaff();
    start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { 
      active = false; 
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [tenantId, canLoadTenantData]);

  useEffect(() => {
    if (!canLoadTenantData) {
      setConfigLoading(false);
      return;
    }
    let active = true;
    setConfigLoading(true);
    async function loadConfig() {
      if (isPollingPaused()) return;
      try {
        const fetched = await getTenantConfig(tenantId!);
        if (!active) return;
        if (fetched) setConfig(fetched);
      } catch (err) {
        logLoadError('Config', err);
      } finally {
        if (active) setConfigLoading(false);
      }
    }
    loadConfig();
    const interval = setInterval(loadConfig, 120000); // Config changes very rarely
    return () => { active = false; clearInterval(interval); };
  }, [tenantId, canLoadTenantData]);

  useEffect(() => {
    let interval: number | null = null;
    
    const startPolling = () => {
      if (!interval) {
        interval = window.setInterval(loadSales, 15000);
      }
    };
    
    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) stopPolling();
      else {
        void loadSales();
        startPolling();
      }
    };

    void loadSales();
    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadSales]);

    useEffect(() => {
    if (!canLoadTenantData || !canLoadDataset(currentUserRole, 'workstations', tableAccessOptions)) {
      setWorkstations([]);
      return;
    }
    let active = true;
    let interval: number | null = null;

    async function loadWorkstations() {
      if (isPollingPaused()) return;
      try {
        const fetched = await getTenantWorkstations(tenantId!);
        if (!active) return;
        setWorkstations(fetched || []);
      } catch (err) {
        logLoadError('Workstations', err);
      }
    }

    const start = () => { if (!interval) interval = window.setInterval(loadWorkstations, 30000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    const handleVisibility = () => {
      if (document.hidden) stop();
      else { void loadWorkstations(); start(); }
    };

    loadWorkstations();
    start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { 
      active = false; 
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [tenantId, canLoadTenantData, currentUserRole, tableAccessOptions]);

  useEffect(() => {
    if (!currentUserStaff || !canLoadTenantData || !canLoadDataset(currentUserRole, 'cash', tableAccessOptions)) {
      setActiveSession(null);
      return;
    }
    let active = true;
    async function loadActiveSession() {
      if (isPollingPaused()) return;
      try {
        const fetched = await getOpenCashSession(tenantId!, currentUserStaff!.id);
        if (!active) return;
        setActiveSession(fetched);
      } catch (err) {
        logLoadError('Active session', err);
      }
    }
    loadActiveSession();
    const interval = setInterval(loadActiveSession, 60000);
    return () => { active = false; clearInterval(interval); };
  }, [currentUserStaff, tenantId, canLoadTenantData, currentUserRole, tableAccessOptions]);

  useEffect(() => {
    if (!canLoadTenantData || !canLoadDataset(currentUserRole, 'tables', tableAccessOptions)) {
      setTableSections([]);
      return;
    }
    let active = true;
    async function loadSections() {
      if (isPollingPaused()) return;
      try {
        const fetched = await getTenantTableSections(tenantId!);
        if (!active) return;
        setTableSections(fetched || []);
      } catch (err) {
        logLoadError('Table sections', err);
      }
    }
    loadSections();
    const interval = setInterval(loadSections, 60000);
    return () => { active = false; clearInterval(interval); };
  }, [tenantId, canLoadTenantData, currentUserRole, tableAccessOptions]);

    useEffect(() => {
    if (!canLoadTenantData || !canLoadDataset(currentUserRole, 'tables', tableAccessOptions)) {
      setRestaurantTables([]);
      return;
    }
    let active = true;
    let interval: number | null = null;

    async function loadTables() {
      if (isPollingPaused()) return;
      try {
        const fetched = await getTenantRestaurantTables(tenantId!);
        if (!active) return;
        setRestaurantTables(fetched || []);
      } catch (err) {
        logLoadError('Restaurant tables', err);
      }
    }

    const start = () => { if (!interval) interval = window.setInterval(loadTables, 30000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    const handleVisibility = () => {
      if (document.hidden) stop();
      else { void loadTables(); start(); }
    };

    loadTables();
    start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { 
      active = false; 
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [tenantId, canLoadTenantData, currentUserRole, tableAccessOptions]);

  return {
    products, customers, staff, sales, config, setConfig,
    workstations, activeSession, currentUserStaff, currentUserRole,
    tableSections, restaurantTables,
    refreshSales: loadSales,
    refreshProducts,
    refreshCustomers,
    refreshStaff,
    tenantLoading, configLoading, isStaffLoading,
  };
}
