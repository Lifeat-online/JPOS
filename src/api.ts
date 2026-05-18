/**
 * REST API client — MariaDB backend.
 * All requests automatically attach the JWT Bearer token.
 * On 401, attempts a token refresh and retries once before throwing.
 */
import { getAccessToken } from './hooks/useAuth';
import type { AiInsight, AiModelOption, AiSettings, AiStaffScore, InventoryAgentApplyResult, InventoryAgentProposal, InventoryAgentStep } from './types';

let refreshPromise: Promise<boolean> | null = null;
let sessionCleared = false;

function clearStoredSession() {
  localStorage.removeItem('jpos_access_token');
  localStorage.removeItem('jpos_refresh_token');
  localStorage.removeItem('jpos_user');
  sessionCleared = true;
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
      sessionCleared = false;
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
  if (sessionCleared && getAccessToken()) {
    sessionCleared = false;
  }
  if (sessionCleared || !getAccessToken()) {
    clearStoredSession();
    throw new Error('Session expired. Please sign in again.');
  }

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
      sessionCleared = false;
      res = await doRequest();
    } else {
      clearStoredSession();
      throw new Error('Session expired. Please sign in again.');
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

export function updateTenantConfig(tenantId: string, config: any) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/settings/app`, config);
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

export type LicenceFeature = 'jpos_branding' | 'own_logo' | 'images' | 'ai' | 'analytics' | 'api_access' | 'multi_location' | 'full_branding' | 'priority_support' | 'updates';
export type LicenceTier = 'free' | 'starter' | 'business' | 'whitelabel';

export interface TenantPackageLimitsResponse {
  source: 'hosted' | 'licence';
  package: {
    id: LicenceTier;
    name: string;
    priceLabel: string;
    maxRegisters: number;
    maxProducts: number;
    maxStaff: number;
    maxCustomers: number;
    features: LicenceFeature[];
    limitsLabel: string;
  };
  usage: {
    products: number;
    staff: number;
    customers: number;
    activeRegisters: number;
  };
  remaining: {
    products: number;
    staff: number;
    customers: number;
    activeRegisters: number;
  };
}

export interface LicenceInfoResponse {
  enabled: boolean;
  valid: boolean;
  lockedOut: boolean;
  reason: string;
  lastOnlineCheck: number | null;
  lastOnlineSuccess: number | null;
  tier?: LicenceTier;
  tenantName?: string;
  maxRegisters?: number;
  features: LicenceFeature[];
  expiresAt: string | null;
}

export interface GenerateLicenceRequest {
  tenantName: string;
  tier: LicenceTier;
  packageId?: LicenceTier;
  maxRegisters?: number;
  features?: LicenceFeature[];
  expiresInDays: number | null;
  supportPlus?: boolean;
}

export interface GenerateLicenceResponse {
  licenceId: string;
  key: string;
  tenantName: string;
  tier: LicenceTier;
  maxRegisters: number;
  features: LicenceFeature[];
  issuedAt: string;
  expiresAt: string | null;
}

export function getLicenceInfo() {
  return apiGet<LicenceInfoResponse>('/api/licence/info');
}

export function getTenantPackageLimits(tenantId: string) {
  return apiGet<TenantPackageLimitsResponse>(`/api/mariadb/tenants/${tenantId}/package-limits`);
}

export function getAiSettings(tenantId: string) {
  return apiGet<AiSettings>(`/api/mariadb/tenants/${tenantId}/ai/settings`);
}

export function updateAiSettings(tenantId: string, settings: Partial<AiSettings>) {
  return apiPut<AiSettings>(`/api/mariadb/tenants/${tenantId}/ai/settings`, settings);
}

export function listAiModels(tenantId: string, settings: Partial<AiSettings>) {
  return apiPost<{ models: AiModelOption[] }>(`/api/mariadb/tenants/${tenantId}/ai/models`, settings);
}

export function getAiInsights(tenantId: string) {
  return apiGet<AiInsight[]>(`/api/mariadb/tenants/${tenantId}/ai/insights`);
}

export function generateAiInsights(tenantId: string) {
  return apiPost<AiInsight[]>(`/api/mariadb/tenants/${tenantId}/ai/insights/generate`, {});
}

export function getAiStaffScores(tenantId: string) {
  return apiGet<AiStaffScore[]>(`/api/mariadb/tenants/${tenantId}/ai/staff-scores`);
}

export function generateAiStaffScores(tenantId: string) {
  return apiPost<AiStaffScore[]>(`/api/mariadb/tenants/${tenantId}/ai/staff-scores/generate`, {});
}

export function generateInventoryAgentProposal(tenantId: string, data: unknown) {
  return apiPost<InventoryAgentProposal>(`/api/mariadb/tenants/${tenantId}/ai/agent/inventory/proposal`, data);
}

export function applyInventoryAgentSteps(tenantId: string, steps: InventoryAgentStep[]) {
  return apiPost<InventoryAgentApplyResult>(`/api/mariadb/tenants/${tenantId}/ai/agent/inventory/apply`, { steps });
}

export async function generateLicence(adminKey: string, data: GenerateLicenceRequest) {
  const res = await fetch('/api/admin/licence/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
    },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Licence generation failed [${res.status}]`);
  }
  return body as GenerateLicenceResponse;
}

export async function revokeLicence(adminKey: string, licenceId: string, reason?: string) {
  const res = await fetch('/api/admin/licence/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
    },
    body: JSON.stringify({ licenceId, reason }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Licence revoke failed [${res.status}]`);
  }
  return body as { success: boolean; licenceId: string };
}
