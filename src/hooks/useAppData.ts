import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Product, Customer, Staff, Sale, AppConfig, Workstation } from '../types';
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
    let active = true;
    async function loadProducts() {
      if (!tenantId) {
        setProducts([]);
        return;
      }
      try {
        const fetched = await getTenantProducts(tenantId);
        if (!active) return;
        setProducts(fetched);
      } catch (err) {
        console.error('Products load error:', err);
        if (active) setProducts([]);
      }
    }
    loadProducts();
    return () => { active = false; };
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    async function loadCustomers() {
      if (!tenantId) {
        setCustomers([]);
        return;
      }
      try {
        const fetched = await getTenantCustomers(tenantId);
        if (!active) return;
        setCustomers(fetched);
      } catch (err) {
        console.error('Customers load error:', err);
        if (active) setCustomers([]);
      }
    }
    loadCustomers();
    return () => { active = false; };
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    async function loadStaff() {
      if (!tenantId) {
        setStaff([]);
        setIsStaffLoading(false);
        return;
      }
      setIsStaffLoading(true);
      try {
        const fetched = await getTenantStaff(tenantId);
        if (!active) return;
        setStaff(fetched);
      } catch (err) {
        console.error('Staff load error:', err);
        if (active) setStaff([]);
      } finally {
        if (active) setIsStaffLoading(false);
      }
    }
    loadStaff();
    return () => { active = false; };
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    async function loadConfig() {
      if (!tenantId) {
        setConfigLoading(false);
        return;
      }
      setConfigLoading(true);
      try {
        const fetched = await getTenantConfig(tenantId);
        if (!active) return;
        if (fetched) {
          setConfig(fetched);
        }
      } catch (err) {
        console.error('Config load error:', err);
      } finally {
        if (active) setConfigLoading(false);
      }
    }
    loadConfig();
    return () => { active = false; };
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    async function loadSales() {
      if (!tenantId) {
        setSales([]);
        return;
      }
      try {
        const fetched = await getTenantSales(tenantId);
        if (!active) return;
        setSales(fetched);
      } catch (err) {
        console.error('Sales load error:', err);
        if (active) setSales([]);
      }
    }
    loadSales();
    return () => { active = false; };
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    async function loadWorkstations() {
      if (!tenantId) {
        setWorkstations([]);
        return;
      }
      try {
        const fetched = await getTenantWorkstations(tenantId);
        if (!active) return;
        setWorkstations(fetched);
      } catch (err) {
        console.error('Workstations load error:', err);
        if (active) setWorkstations([]);
      }
    }
    loadWorkstations();
    return () => { active = false; };
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    async function loadActiveSession() {
      if (!currentUserStaff || !tenantId) {
        setActiveSession(null);
        return;
      }
      try {
        const fetched = await getOpenCashSession(tenantId, currentUserStaff.id);
        if (!active) return;
        setActiveSession(fetched);
      } catch (err) {
        console.error('Active session load error:', err);
        if (active) setActiveSession(null);
      }
    }
    loadActiveSession();
    return () => { active = false; };
  }, [currentUserStaff, tenantId]);

  return {
    products, customers, staff, sales, config, setConfig,
    workstations, activeSession, currentUserStaff, currentUserRole,
    tenantLoading, configLoading, isStaffLoading,
  };
}
