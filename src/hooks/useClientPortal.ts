/**
 * useClientPortal — MariaDB REST edition.
 * Replaced all Firestore subscriptions with REST polling.
 * Polls every 30 seconds to stay reasonably fresh without real-time overhead.
 */
import { useState, useEffect, useCallback } from 'react';
import { JwtUser } from './useAuth';
import { Customer, Sale, PayoutRequest } from '../types';
import { apiGet, apiPut } from '../api';

interface ClientPortalData {
  customer: Customer | null;
  tenantId: string | null;
  sales: Sale[];
  payoutRequests: PayoutRequest[];
  loading: boolean;
  notFound: boolean;
}

const POLL_MS = 30_000;

export function useClientPortal(user: JwtUser | null): ClientPortalData {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Step 1: Find the customer record by email
  useEffect(() => {
    if (!user?.email) { setLoading(false); return; }

    const findCustomer = async () => {
      try {
        const result = await apiGet<{ customer: Customer; tenantId: string } | null>(
          `/api/mariadb/customers/by-email?email=${encodeURIComponent(user.email)}`
        );
        if (!result?.customer) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setTenantId(result.tenantId);
        setCustomer(result.customer);

        // Link customer UID if not already set
        if (!result.customer.uid && result.tenantId) {
          await apiPut(`/api/mariadb/tenants/${result.tenantId}/customers/${result.customer.id}`, {
            uid: user.uid,
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Client portal lookup error:', err);
        setNotFound(true);
        setLoading(false);
      }
    };

    findCustomer();
  }, [user?.email]);

  // Step 2 + 3: Poll customer, sales, and payout requests
  const fetchPortalData = useCallback(async () => {
    if (!customer?.id || !tenantId) return;
    try {
      const [customerRes, salesRes, payoutsRes] = await Promise.all([
        apiGet<Customer>(`/api/mariadb/tenants/${tenantId}/customers/${customer.id}`),
        apiGet<Sale[]>(`/api/mariadb/tenants/${tenantId}/sales?customerId=${customer.id}&limit=50`),
        apiGet<PayoutRequest[]>(`/api/mariadb/tenants/${tenantId}/customer-payout-requests?customerId=${customer.id}`),
      ]);
      if (customerRes) {
        setCustomer({
          ...customerRes,
          loyaltyPoints: Number(customerRes.loyaltyPoints || 0),
          walletBalance: Number(customerRes.walletBalance || 0),
        });
      }
      setSales((salesRes || []).map(s => ({
        ...s,
        total: Number(s.total || 0),
        subtotal: s.subtotal ? Number(s.subtotal) : undefined,
        items: (s.items || []).map(item => ({
          ...item,
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 0),
        })),
      })));
      setPayoutRequests((payoutsRes || []).map(p => ({
        ...p,
        amount: Number(p.amount || 0),
      })));
    } catch (err) {
      console.error('Client portal poll error:', err);
    } finally {
      setLoading(false);
    }
  }, [customer?.id, tenantId]);

  useEffect(() => {
    if (!customer?.id || !tenantId) return;
    fetchPortalData();
    const interval = setInterval(fetchPortalData, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchPortalData]);

  return { customer, tenantId, sales, payoutRequests, loading, notFound };
}
