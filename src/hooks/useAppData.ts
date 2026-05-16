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

export const DEFAULT_CONFIG: AppConfig = {
  payfastMerchantId: '10000100',
  payfastMerchantKey: '46f0cd694581a',
  payfastPassphrase: 'jt7v60h69n8a1',
  payfastSandbox: true,
};

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
  const tableAccessOptions = useMemo(() => ({
    isRestaurant: Boolean(config.business?.isRestaurantMode),
    hasOpenTerminal: Boolean(activeSession || storeActiveSession),
    permissions: currentUserStaff?.permissions,
  }), [config.business?.isRestaurantMode, activeSession, storeActiveSession, currentUserStaff?.permissions]);

  const loadSales = useCallback(async () => {
    if (!canLoadTenantData || !canLoadDataset(currentUserRole, 'sales', tableAccessOptions)) {
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
      console.error('Sales load error:', err);
    }
  }, [tenantId, canLoadTenantData, currentUserRole, tableAccessOptions]);

  useEffect(() => {
    let active = true;
    async function resolveTenant() {
      if (!user) {
        setTenantId(null);
        setTenantLoading(false);
        return;
      }

      setTenantLoading(true);
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
      const s = staff.find(s => s.email === user.email) ?? null;
      setCurrentUserStaff(s);
      setCurrentUserRole(s?.role ?? null);
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
        console.error('Products load error:', err);
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
  }, [tenantId, canLoadTenantData, currentUserRole, tableAccessOptions]);

    useEffect(() => {
    if (!canLoadTenantData || !canLoadDataset(currentUserRole, 'customers', tableAccessOptions)) {
      setCustomers([]);
      return;
    }
    let active = true;
    let interval: number | null = null;

    async function loadCustomers() {
      try {
        const fetched = await getTenantCustomers(tenantId!);
        if (!active) return;
        const sanitized = (fetched || []).map((c: any) => ({
          ...c,
          loyaltyPoints: Number(c.loyaltyPoints || 0),
          walletBalance: Number(c.walletBalance || 0),
        }));
        setCustomers(sanitized);
      } catch (err) {
        console.error('Customers load error:', err);
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
        console.error('Staff load error:', err);
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
      try {
        const fetched = await getTenantConfig(tenantId!);
        if (!active) return;
        if (fetched) setConfig(fetched);
      } catch (err) {
        console.error('Config load error:', err);
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
      try {
        const fetched = await getTenantWorkstations(tenantId!);
        if (!active) return;
        setWorkstations(fetched || []);
      } catch (err) {
        console.error('Workstations load error:', err);
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
      try {
        const fetched = await getOpenCashSession(tenantId!, currentUserStaff!.id);
        if (!active) return;
        setActiveSession(fetched);
      } catch (err) {
        console.error('Active session load error:', err);
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
      try {
        const fetched = await getTenantTableSections(tenantId!);
        if (!active) return;
        setTableSections(fetched || []);
      } catch (err) {
        console.error('Table sections load error:', err);
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
      try {
        const fetched = await getTenantRestaurantTables(tenantId!);
        if (!active) return;
        setRestaurantTables(fetched || []);
      } catch (err) {
        console.error('Restaurant tables load error:', err);
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
    tenantLoading, configLoading, isStaffLoading,
  };
}
