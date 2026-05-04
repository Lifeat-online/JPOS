import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  collection, query, orderBy, limit, onSnapshot,
  where, doc, setDoc, serverTimestamp, getDocs, collectionGroup,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Product, Customer, Staff, Sale, AppConfig, Workstation } from '../types';
import { getTenantCollection, getTenantDoc } from '../tenantHelper';
import { usePosStore } from '../store/usePosStore';

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

  // Resolve tenantId from the users collection, or by searching staff collectionGroup
  useEffect(() => {
    if (!user) {
      setTenantId(null);
      setTenantLoading(false);
      return;
    }
    setTenantLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      async (snap) => {
        if (snap.exists() && snap.data().tenantId) {
          setTenantId(snap.data().tenantId);
          setTenantLoading(false);
        } else {
          // No users doc yet — could be a brand new user (will go through SetupWizard)
          // or an invited staff member. Try the collectionGroup lookup but don't block on failure.
          try {
            const staffQuery = query(collectionGroup(db, 'staff'), where('email', '==', user.email));
            const staffSnap = await getDocs(staffQuery);
            if (!staffSnap.empty) {
              const foundTenantId = staffSnap.docs[0].ref.parent.parent?.id;
              if (foundTenantId) {
                await setDoc(doc(db, 'users', user.uid), {
                  tenantId: foundTenantId,
                  email: user.email,
                  name: user.displayName || user.email?.split('@')[0] || 'User',
                  createdAt: serverTimestamp(),
                }, { merge: true });
                // onSnapshot will fire again with tenantId set
                return;
              }
            }
          } catch (err: any) {
            // Permission denied or missing index — treat as new user, let SetupWizard run
            console.warn('Staff collectionGroup lookup skipped:', err.code);
          }
          setTenantId(null);
          setTenantLoading(false);
        }
      },
      (err) => {
        // Permission denied means the users doc doesn't exist yet — treat as new user
        console.warn('Users doc read error (expected for new users):', err.code);
        setTenantId(null);
        setTenantLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // Derive current user's staff record and role
  useEffect(() => {
    if (user && !isStaffLoading) {
      const s = staff.find(s => s.email === user.email) ?? null;
      setCurrentUserStaff(s);
      // dev role gets treated as admin for nav/access purposes
      const role = s?.role === 'dev' ? 'admin' : (s?.role ?? null);
      setCurrentUserRole(role);
    } else if (!user) {
      setCurrentUserStaff(null);
      setCurrentUserRole(null);
    }
  }, [user, staff, isStaffLoading]);

  // Products
  useEffect(() => {
    if (!user || !tenantId) { setProducts([]); return; }
    const unsubscribe = onSnapshot(
      query(getTenantCollection(db, tenantId, 'products')),
      (snap) => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))),
      (err) => console.error('Products subscription error:', err)
    );
    return () => unsubscribe();
  }, [user, tenantId]);

  // Customers
  useEffect(() => {
    if (!user || !tenantId) { setCustomers([]); return; }
    const unsubscribe = onSnapshot(
      query(getTenantCollection(db, tenantId, 'customers'), orderBy('name', 'asc')),
      (snap) => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer))),
      (err) => console.error('Customers subscription error:', err)
    );
    return () => unsubscribe();
  }, [user, tenantId]);

  // Staff
  useEffect(() => {
    if (!user || !tenantId) { setStaff([]); setIsStaffLoading(false); return; }
    setIsStaffLoading(true);
    const unsubscribe = onSnapshot(
      query(getTenantCollection(db, tenantId, 'staff'), orderBy('name', 'asc')),
      (snap) => {
        setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff)));
        setIsStaffLoading(false);
      },
      (err) => { console.error('Staff subscription error:', err); setIsStaffLoading(false); }
    );
    return () => unsubscribe();
  }, [user, tenantId]);

  // Config
  useEffect(() => {
    if (!user || !tenantId) { setConfigLoading(false); return; }
    setConfigLoading(true);
    const unsubscribe = onSnapshot(
      getTenantDoc(db, tenantId, 'settings', 'app'),
      (snap) => {
        if (snap.exists()) setConfig(snap.data() as AppConfig);
        setConfigLoading(false);
      },
      (err) => { console.error('Config subscription error:', err); setConfigLoading(false); }
    );
    return () => unsubscribe();
  }, [user, tenantId]);

  // Sales
  useEffect(() => {
    if (!user || !tenantId) { setSales([]); return; }
    const unsubscribe = onSnapshot(
      query(
        getTenantCollection(db, tenantId, 'sales'),
        where('status', 'in', ['completed', 'pending', 'open', 'kitchen']),
        orderBy('createdAt', 'desc'),
        limit(100)
      ),
      (snap) => setSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale))),
      (err) => console.error('Sales subscription error:', err)
    );
    return () => unsubscribe();
  }, [user, tenantId]);

  // Workstations
  useEffect(() => {
    if (!user || !tenantId) { setWorkstations([]); return; }
    const unsubscribe = onSnapshot(
      query(getTenantCollection(db, tenantId, 'workstations')),
      (snap) => setWorkstations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Workstation))),
      (err) => console.error('Workstations subscription error:', err)
    );
    return () => unsubscribe();
  }, [user, tenantId]);

  // Active cash session for current staff member
  useEffect(() => {
    if (!currentUserStaff || !tenantId) { setActiveSession(null); return; }
    const unsubscribe = onSnapshot(
      query(
        getTenantCollection(db, tenantId, 'cashSessions'),
        where('staffId', '==', currentUserStaff.id),
        where('status', '==', 'open')
      ),
      (snap) => {
        setActiveSession(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
      }
    );
    return () => unsubscribe();
  }, [currentUserStaff, tenantId]);

  return {
    products, customers, staff, sales, config, setConfig,
    workstations, activeSession, currentUserStaff, currentUserRole,
    tenantLoading, configLoading, isStaffLoading,
  };
}
