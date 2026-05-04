import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  query, onSnapshot, where, orderBy, limit,
  getDocs, doc, setDoc, serverTimestamp, collectionGroup,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Customer, Sale, PayoutRequest } from '../types';
import { getTenantCollection, getTenantDoc } from '../tenantHelper';

interface ClientPortalData {
  customer: Customer | null;
  tenantId: string | null;
  sales: Sale[];
  payoutRequests: PayoutRequest[];
  loading: boolean;
  notFound: boolean;
}

export function useClientPortal(user: User | null): ClientPortalData {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Step 1: Find the customer record by email across all tenants
  useEffect(() => {
    if (!user?.email) { setLoading(false); return; }

    const findCustomer = async () => {
      try {
        // Search customers collectionGroup by email
        const q = query(
          collectionGroup(db, 'customers'),
          where('email', '==', user.email)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const customerDoc = snap.docs[0];
        const foundTenantId = customerDoc.ref.parent.parent?.id || null;
        const customerData = { id: customerDoc.id, ...customerDoc.data() } as Customer;

        setTenantId(foundTenantId);
        setCustomer(customerData);

        // Link the customer's UID if not already set
        if (!customerData.uid && foundTenantId) {
          await setDoc(
            getTenantDoc(db, foundTenantId, 'customers', customerDoc.id),
            { uid: user.uid },
            { merge: true }
          );
        }
      } catch (err) {
        console.error('Client portal lookup error:', err);
        setNotFound(true);
        setLoading(false);
      }
    };

    findCustomer();
  }, [user?.email]);

  // Step 2: Subscribe to customer doc for live updates
  useEffect(() => {
    if (!customer?.id || !tenantId) return;

    const unsub = onSnapshot(
      getTenantDoc(db, tenantId, 'customers', customer.id),
      (snap) => {
        if (snap.exists()) {
          setCustomer({ id: snap.id, ...snap.data() } as Customer);
        }
      }
    );
    return () => unsub();
  }, [customer?.id, tenantId]);

  // Step 3: Subscribe to this customer's sales
  useEffect(() => {
    if (!customer?.id || !tenantId) return;

    const unsub = onSnapshot(
      query(
        getTenantCollection(db, tenantId, 'sales'),
        where('customerId', '==', customer.id),
        orderBy('createdAt', 'desc'),
        limit(50)
      ),
      (snap) => {
        setSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
        setLoading(false);
      },
      (err) => { console.error('Client sales error:', err); setLoading(false); }
    );
    return () => unsub();
  }, [customer?.id, tenantId]);

  // Step 4: Subscribe to this customer's payout requests
  useEffect(() => {
    if (!customer?.id || !tenantId) return;

    const unsub = onSnapshot(
      query(
        getTenantCollection(db, tenantId, 'customerPayoutRequests'),
        where('customerId', '==', customer.id),
        orderBy('createdAt', 'desc')
      ),
      (snap) => setPayoutRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayoutRequest))),
      (err) => console.error('Client payout requests error:', err)
    );
    return () => unsub();
  }, [customer?.id, tenantId]);

  return { customer, tenantId, sales, payoutRequests, loading, notFound };
}
