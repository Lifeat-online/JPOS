/**
 * REST API client — MariaDB backend.
 * All requests automatically attach the JWT Bearer token.
 * On 401, attempts a token refresh and retries once before throwing.
 */
import { getAccessToken } from './hooks/useAuth';

let refreshPromise: Promise<boolean> | null = null;

function clearStoredSession() {
  localStorage.removeItem('jpos_access_token');
  localStorage.removeItem('jpos_refresh_token');
  localStorage.removeItem('jpos_user');
  window.dispatchEvent(new Event('jpos:auth-cleared'));
}

// ── Token refresh (client-side) ──────────────────────────────────────────────

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  const refreshToken = localStorage.getItem('jpos_refresh_token');
  if (!refreshToken) return false;

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearStoredSession();
        return false;
      }
      const data = await res.json();
      localStorage.setItem('jpos_access_token',  data.accessToken);
      localStorage.setItem('jpos_refresh_token', data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ── Auth header helper ────────────────────────────────────────────────────────

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

// ── Core fetch with auto-refresh ──────────────────────────────────────────────

async function apiFetch<T>(input: RequestInfo, init: RequestInit = {}): Promise<T> {
  const doRequest = () => fetch(input, {
    ...init,
    headers: {
      ...authHeaders(init.headers as Record<string, string>),
    },
  });

  let res = await doRequest();

  // If unauthorized, try to refresh once and retry
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doRequest();
    }
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API request failed [${res.status}]: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ── Public helpers ────────────────────────────────────────────────────────────

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, data: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
}

export function apiPut<T>(path: string, data: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth endpoints
// ─────────────────────────────────────────────────────────────────────────────

export function apiLogin(email: string, password: string, tenantId?: string) {
  return fetch('/api/auth/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password, tenantId }),
  }).then(r => r.json());
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenant Data Queries
// ─────────────────────────────────────────────────────────────────────────────

export function getTenantProducts(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/products`);
}

export function getTenantConfig(tenantId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/config`);
}

export function getTenantCustomers(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/customers`);
}

export function getTenantStaff(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/staff`);
}

export function getTenantWorkstations(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/workstations`);
}

export function getTenantSales(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/sales`);
}

export function getTenantLiveStats(tenantId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/live`);
}

export function getTenantTableSections(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/table-sections`);
}

export function getTenantRestaurantTables(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/restaurant-tables`);
}

export function getOpenCashSession(tenantId: string, staffId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/cash-sessions?staffId=${encodeURIComponent(staffId)}`);
}

export function getTenantCashSessions(tenantId: string, limit = 100) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/cash-sessions?limit=${encodeURIComponent(String(limit))}`);
}

export function getTenantIdBySlug(slug: string) {
  return apiGet<{ tenantId: string }>(`/api/mariadb/slugs/${encodeURIComponent(slug)}/tenant`);
}

export function getUserByUid(uid: string) {
  return apiGet<any>(`/api/mariadb/users/${encodeURIComponent(uid)}`);
}

export function getStaffTenantByEmail(email: string) {
  return apiGet<any>(`/api/mariadb/staff?email=${encodeURIComponent(email)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD: Products
// ─────────────────────────────────────────────────────────────────────────────

export function createProduct(tenantId: string, product: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/products`, product);
}

export function updateProduct(tenantId: string, productId: string, updates: any) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/products/${productId}`, updates);
}

export function deleteProduct(tenantId: string, productId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/products/${productId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD: Customers
// ─────────────────────────────────────────────────────────────────────────────

export function createCustomer(tenantId: string, customer: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/customers`, customer);
}

export function updateCustomer(tenantId: string, customerId: string, updates: any) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/customers/${customerId}`, updates);
}

export function deleteCustomer(tenantId: string, customerId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/customers/${customerId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD: Staff
// ─────────────────────────────────────────────────────────────────────────────

export function createStaff(tenantId: string, staff: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/staff`, staff);
}

export function updateStaff(tenantId: string, staffId: string, updates: any) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/staff/${staffId}`, updates);
}

export function deleteStaff(tenantId: string, staffId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/staff/${staffId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD: Workstations
// ─────────────────────────────────────────────────────────────────────────────

export function createWorkstation(tenantId: string, workstation: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/workstations`, workstation);
}

export function deleteWorkstation(tenantId: string, workstationId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/workstations/${workstationId}`);
}

export function createTableSection(tenantId: string, section: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/table-sections`, section);
}

export function updateTableSection(tenantId: string, sectionId: string, updates: any) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/table-sections/${sectionId}`, updates);
}

export function deleteTableSection(tenantId: string, sectionId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/table-sections/${sectionId}`);
}

export function createRestaurantTable(tenantId: string, table: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/restaurant-tables`, table);
}

export function updateRestaurantTable(tenantId: string, tableId: string, updates: any) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/restaurant-tables/${tableId}`, updates);
}

export function deleteRestaurantTable(tenantId: string, tableId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/restaurant-tables/${tableId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD: Sales
// ─────────────────────────────────────────────────────────────────────────────

export function createSale(tenantId: string, sale: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/sales`, sale);
}

export function getSaleById(tenantId: string, saleId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/sales/${saleId}`);
}

export function updateSaleStatus(tenantId: string, saleId: string, status: string) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/sales/${saleId}`, { status });
}

// ─────────────────────────────────────────────────────────────────────────────
// Payout Requests
// ─────────────────────────────────────────────────────────────────────────────

export function getPayoutRequests(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/payout-requests`);
}

export function getCustomerPayoutRequests(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/customer-payout-requests`);
}

export function updatePayoutRequest(tenantId: string, id: string, updates: any) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/payout-requests/${id}`, updates);
}

export function updateCustomerPayoutRequest(tenantId: string, id: string, updates: any) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/customer-payout-requests/${id}`, updates);
}

export function createPayoutRequest(tenantId: string, data: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/payout-requests`, data);
}

export function setupTenant(data: any) {
  return apiPost<{ tenantId: string }>(`/api/mariadb/setup`, data);
}

export function seedProducts(tenantId: string, products: any[]) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/seed-products`, { products });
}

export function seedDemoData(tenantId: string, mode: 'retail' | 'restaurant') {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/demo-seed/${mode}`, {});
}

export function clearSeededDemoData(tenantId: string) {
  return apiDelete<any>(`/api/mariadb/tenants/${tenantId}/demo-seed`);
}

export function clearAllSales(tenantId: string) {
  return apiDelete<any>(`/api/mariadb/tenants/${tenantId}/sales`);
}

export function createCustomerPayoutRequest(tenantId: string, data: any) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/customer-payout-requests`, data);
}
