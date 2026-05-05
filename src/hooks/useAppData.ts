import { useState, useEffect } from 'react';
import { JwtUser as User } from './useAuth';
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

export const DEFAULT_CONFIG: AppConfig = {
  payfastMerchantId: '10000100',
  payfastMerchantKey: '46f0cd694581a',
  payfastPassphrase: 'jt7v60h69n8a1',
  payfastSandbox: true,
};

export function useAppData(user: User | null) {
  const { tenantId, setTenantId } = usePosStore();

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

  const [currentUserStaff, setCurrentUserStaff] = useState<Staff | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'manager' | 'cashier' | null>(null);

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
      const role = s?.role === 'dev' ? 'admin' : (s?.role ?? null);
      setCurrentUserRole(role);
    } else if (!user) {
      setCurrentUserStaff(null);
      setCurrentUserRole(null);
    }
  }, [user, staff, isStaffLoading]);

  useEffect(() => {
    if (!tenantId) {
      setProducts([]);
      return;
    }
    let active = true;
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
    loadProducts();
    const interval = setInterval(loadProducts, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      setCustomers([]);
      return;
    }
    let active = true;
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
    loadCustomers();
    const interval = setInterval(loadCustomers, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      setStaff([]);
      setIsStaffLoading(false);
      return;
    }
    let active = true;
    async function loadStaff() {
      try {
        const fetched = await getTenantStaff(tenantId!);
        if (!active) return;
        const sanitized = (fetched || []).map((s: any) => ({
          ...s,
          payRate: s.payRate ? Number(s.payRate) : undefined,
          walletBalance: Number(s.walletBalance || 0),
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
    loadStaff();
    const interval = setInterval(loadStaff, 60000); // Staff changes less frequently
    return () => { active = false; clearInterval(interval); };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      setConfigLoading(false);
      return;
    }
    let active = true;
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
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      setSales([]);
      return;
    }
    let active = true;
    async function loadSales() {
      try {
        const fetched = await getTenantSales(tenantId!);
        if (!active) return;
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
    }
    loadSales();
    const interval = setInterval(loadSales, 15000); // Sales change frequently
    return () => { active = false; clearInterval(interval); };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      setWorkstations([]);
      return;
    }
    let active = true;
    async function loadWorkstations() {
      try {
        const fetched = await getTenantWorkstations(tenantId!);
        if (!active) return;
        setWorkstations(fetched || []);
      } catch (err) {
        console.error('Workstations load error:', err);
      }
    }
    loadWorkstations();
    const interval = setInterval(loadWorkstations, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [tenantId]);

  useEffect(() => {
    if (!currentUserStaff || !tenantId) {
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
  }, [currentUserStaff, tenantId]);

  useEffect(() => {
    if (!tenantId) {
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
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      setRestaurantTables([]);
      return;
    }
    let active = true;
    async function loadTables() {
      try {
        const fetched = await getTenantRestaurantTables(tenantId!);
        if (!active) return;
        setRestaurantTables(fetched || []);
      } catch (err) {
        console.error('Restaurant tables load error:', err);
      }
    }
    loadTables();
    const interval = setInterval(loadTables, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [tenantId]);

  return {
    products, customers, staff, sales, config, setConfig,
    workstations, activeSession, currentUserStaff, currentUserRole,
    tableSections, restaurantTables,
    tenantLoading, configLoading, isStaffLoading,
  };
}
