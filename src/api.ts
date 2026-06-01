/**
 * REST API client — MariaDB backend.
 * All requests automatically attach the JWT Bearer token.
 * On 401, attempts a token refresh and retries once before throwing.
 */
import { getAccessToken } from './hooks/useAuth';
import type { AiInsight, AiModelOption, AiSettings, AiStaffScore, CashCloseCheckpoint, CashClosePreview, CashCustodyTransfer, CashCustodyTransferPartyType, InventoryAgentApplyResult, InventoryAgentProposal, InventoryAgentStep, LaybyOrder, LaybyPaymentMethod, ManagerCashMovement, ManagerCashMovementType, ManagerCashSummary, ReorderRecommendation, StockTakeSuggestion } from './types';

let refreshPromise: Promise<boolean> | null = null;
let sessionCleared = false;

function clearStoredSession() {
  localStorage.removeItem('masepos_access_token');
  localStorage.removeItem('masepos_refresh_token');
  localStorage.removeItem('masepos_user');
  // Migration: also clear old keys
  localStorage.removeItem('jpos_access_token');
  localStorage.removeItem('jpos_refresh_token');
  localStorage.removeItem('jpos_user');
  sessionCleared = true;
  window.dispatchEvent(new Event('masepos:auth-cleared'));
  window.dispatchEvent(new Event('jpos:auth-cleared'));
}

// ── Token refresh (client-side) ──────────────────────────────────────────────

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  // Migration: try new key first, fall back to old key
  const refreshToken = localStorage.getItem('masepos_refresh_token') || localStorage.getItem('jpos_refresh_token');
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
      localStorage.setItem('masepos_access_token',  data.accessToken);
      localStorage.setItem('masepos_refresh_token', data.refreshToken);
      // Migration: clear old keys after successful write to new keys
      localStorage.removeItem('jpos_access_token');
      localStorage.removeItem('jpos_refresh_token');
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
    try {
      const parsed = JSON.parse(body);
      const message = parsed?.error || parsed?.message || parsed?.detail;
      if (message) throw new Error(String(message));
    } catch (err) {
      if (err instanceof Error && err.message && !err.message.startsWith('Unexpected')) throw err;
    }
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

export type PushNotificationStatus = {
  configured: boolean;
  enabled: boolean;
  publicKey: string | null;
  subject: string;
  subscriptionCount: number;
  activeSubscriptionCount: number;
};

export type PushSendResult = {
  attempted: number;
  sent: number;
  failed: number;
  skipped?: string;
};

export function getPushNotificationStatus(tenantId: string) {
  return apiGet<PushNotificationStatus>(`/api/mariadb/tenants/${tenantId}/push/status`);
}

export function generatePushVapidKeys(tenantId: string, subject?: string) {
  return apiPost<PushNotificationStatus>(`/api/mariadb/tenants/${tenantId}/push/vapid/generate`, { subject });
}

export function sendTestPushNotification(tenantId: string) {
  return apiPost<PushSendResult>(`/api/mariadb/tenants/${tenantId}/push/test`, {});
}

export function getReorderRecommendations(tenantId: string, status = 'open,in_review,approved') {
  return apiGet<ReorderRecommendation[]>(`/api/mariadb/tenants/${tenantId}/reorder-recommendations?status=${encodeURIComponent(status)}`);
}

export function refreshReorderRecommendations(tenantId: string, data: { daysOfCover?: number; vendorId?: string | null } = {}) {
  return apiPost<{ created: number; updated: number; skippedApproved: number; recommendations: ReorderRecommendation[] }>(
    `/api/mariadb/tenants/${tenantId}/reorder-recommendations/refresh`,
    data
  );
}

export function approveReorderRecommendation(tenantId: string, id: string, data: { note?: string | null; vendorId?: string | null; quantity?: number; expectedPrice?: number; expectedDeliveryDate?: string | null } = {}) {
  return apiPost<{ recommendation: ReorderRecommendation | null; purchaseOrder: any; alreadyOrdered: boolean }>(
    `/api/mariadb/tenants/${tenantId}/reorder-recommendations/${encodeURIComponent(id)}/approve`,
    data
  );
}

export function dismissReorderRecommendation(tenantId: string, id: string, note?: string | null) {
  return apiPost<ReorderRecommendation>(
    `/api/mariadb/tenants/${tenantId}/reorder-recommendations/${encodeURIComponent(id)}/dismiss`,
    { note: note || null }
  );
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

export function getCompanionDeviceAssignments(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/companion-device-assignments`);
}

export function getCompanionDeviceAssignment(tenantId: string, deviceId: string) {
  return apiGet<any | null>(`/api/mariadb/tenants/${tenantId}/companion-device-assignments/${encodeURIComponent(deviceId)}`);
}

export function assignCompanionDevice(tenantId: string, deviceId: string, data: { deviceName: string; workstationId: string; defaultMode: 'wireless_scanner' | 'pole_display' }) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/companion-device-assignments/${encodeURIComponent(deviceId)}`, data);
}

export function revokeCompanionDeviceAssignment(tenantId: string, deviceId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/companion-device-assignments/${encodeURIComponent(deviceId)}`);
}

export function getTenantSales(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/sales`);
}

export function getTenantLiveStats(tenantId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/live`);
}

export function getManagerActionCenter(tenantId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/action-center`);
}

export function getManagerTasks(tenantId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/action-center/tasks`);
}

export function getManagerActivityHistory(tenantId: string, filters: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/action-center/activity${query ? `?${query}` : ''}`);
}

export function exportManagerActivityHistoryCsv(tenantId: string, filters: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<{ filename: string; mimeType: string; count: number; csv: string; generatedAt: string }>(
    `/api/mariadb/tenants/${tenantId}/action-center/activity/export${query ? `?${query}` : ''}`
  );
}

export function exportManagerAuditReport(tenantId: string, filters: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<{ filename: string; mimeType: string; audience: string; count: number; summary: Record<string, number>; csv: string; generatedAt: string }>(
    `/api/mariadb/tenants/${tenantId}/action-center/activity/report${query ? `?${query}` : ''}`
  );
}

export function decideManagerTask(tenantId: string, taskId: string, data: { action: string; note?: string; assignedTo?: string | null }) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/action-center/tasks/${encodeURIComponent(taskId)}`, data);
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

export function requestStockAdjustment(tenantId: string, productId: string, data: {
  delta: number;
  reason: string;
  note?: string | null;
  productName?: string | null;
  staffId?: string | null;
  staffName?: string | null;
}) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/products/${productId}/stock-adjustments`, data);
}

export function getStockTakeSessions(tenantId: string, filters: Record<string, string | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (!value) return;
    params.set(key, value);
  });
  const query = params.toString();
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/stocktakes${query ? `?${query}` : ''}`);
}

export function createStockTakeSession(tenantId: string, data: {
  name?: string | null;
  type: 'full' | 'cycle' | 'spot_check';
  dueAt?: string | null;
  notes?: string | null;
  assignments: Array<{ productId: string; assignedTo?: string | null; assignedToName?: string | null }>;
  staffId?: string | null;
  staffName?: string | null;
}) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/stocktakes`, data);
}

export function getStockTakeRules(tenantId: string) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/stocktakes/rules`);
}

export function getStockTakeSuggestions(tenantId: string, limit = 12) {
  return apiGet<{ suggestions: StockTakeSuggestion[]; generatedAt: string; signalWindowDays: number; expiryWindowDays: number }>(
    `/api/mariadb/tenants/${tenantId}/stocktakes/suggestions?limit=${encodeURIComponent(String(limit))}`
  );
}

export function createStockTakeRule(tenantId: string, data: {
  name?: string | null;
  status?: 'active' | 'paused';
  runTime?: string | null;
  productScope?: 'random' | 'low_stock' | 'category' | 'manual';
  productCount?: number;
  category?: string | null;
  productIds?: string[];
  assignedTo?: string | null;
  assignedToName?: string | null;
  staffId?: string | null;
  staffName?: string | null;
}) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/stocktakes/rules`, data);
}

export function updateStockTakeRule(tenantId: string, ruleId: string, data: Record<string, any>) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/stocktakes/rules/${encodeURIComponent(ruleId)}`, data);
}

export function deleteStockTakeRule(tenantId: string, ruleId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/stocktakes/rules/${encodeURIComponent(ruleId)}`);
}

export function runDueStockTakeRules(tenantId: string, data: {
  ruleId?: string | null;
  force?: boolean;
  staffId?: string | null;
  staffName?: string | null;
} = {}) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/stocktakes/rules/run-due`, data);
}

export function getStockTakeSession(tenantId: string, sessionId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/stocktakes/${encodeURIComponent(sessionId)}`);
}

export function getStockTakeExportPack(tenantId: string, sessionId: string) {
  return apiGet<{
    filename: string;
    generatedAt: string;
    headers: string[];
    rows: any[][];
    csv: string;
    varianceReasons: Array<{ value: string; label: string; stockReasonCode: string; supervisorSensitive: boolean }>;
    session: any;
  }>(`/api/mariadb/tenants/${tenantId}/stocktakes/${encodeURIComponent(sessionId)}/export-pack`);
}

export function getMyStockTakeAssignments(tenantId: string, staffId?: string | null) {
  const query = staffId ? `?staffId=${encodeURIComponent(staffId)}` : '';
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/stocktakes/my-assignments${query}`);
}

export function submitStockTakeCount(tenantId: string, itemId: string, data: {
  countedQuantity: number;
  note?: string | null;
  varianceReason?: string | null;
  staffId?: string | null;
  staffName?: string | null;
}) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/stocktakes/items/${encodeURIComponent(itemId)}/count`, data);
}

export function requestStockTakeRecount(tenantId: string, itemId: string, data: {
  note?: string | null;
  staffId?: string | null;
  staffName?: string | null;
}) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/stocktakes/items/${encodeURIComponent(itemId)}/recount`, data);
}

export function approveStockTakeSession(tenantId: string, sessionId: string, data: {
  staffId?: string | null;
  staffName?: string | null;
} = {}) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/stocktakes/${encodeURIComponent(sessionId)}/approve`, data);
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

export function reportOfflineSyncIssue(tenantId: string, data: {
  offlineEventId: string;
  localReceiptNumber?: string | null;
  deviceId?: string | null;
  operation?: string | null;
  method?: string | null;
  status?: string | null;
  attempts?: number;
  message: string;
  cloudSaleId?: string | null;
  targetSaleId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  total?: number | null;
  conflictType?: string | null;
  recommendedAction?: string | null;
  syncBatchId?: string | null;
  syncSequence?: number | null;
}) {
  return apiPost<{ eventId: string }>(`/api/mariadb/tenants/${tenantId}/offline-sync/issues`, data);
}

export function getSaleById(tenantId: string, saleId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/sales/${saleId}`);
}

export function updateSaleStatus(tenantId: string, saleId: string, status: string) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/sales/${saleId}`, { status });
}

export function refundSale(tenantId: string, saleId: string, data: {
  items: { saleItemId: string; quantity: number }[];
  reason: string;
  method: 'cash' | 'card' | 'wallet';
  restock?: boolean;
  staffId?: string | null;
  staffName?: string | null;
  cashSessionId?: string | null;
}) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/sales/${saleId}/refund`, data);
}

export function voidSale(tenantId: string, saleId: string, data: {
  reason: string;
  restock?: boolean;
  staffId?: string | null;
  staffName?: string | null;
}) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/sales/${saleId}/void`, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Payout Requests
// ─────────────────────────────────────────────────────────────────────────────

export function getLaybyOrders(tenantId: string, filters: { status?: string; search?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return apiGet<LaybyOrder[]>(`/api/mariadb/tenants/${tenantId}/laybys${query ? `?${query}` : ''}`);
}

export function getLaybyOrderById(tenantId: string, laybyId: string) {
  return apiGet<LaybyOrder>(`/api/mariadb/tenants/${tenantId}/laybys/${encodeURIComponent(laybyId)}`);
}

export function createLaybyOrder(tenantId: string, data: {
  customerId: string;
  customerName?: string;
  items: any[];
  subtotal: number;
  taxAmount?: number;
  taxRate?: number;
  taxInclusive?: boolean;
  totalAmount: number;
  dueDate: string;
  payment: {
    method: LaybyPaymentMethod;
    amount: number;
    tenderedAmount?: number;
    changeAmount?: number;
    cashSessionId?: string | null;
    note?: string | null;
  };
  staffId?: string | null;
  staffName?: string | null;
}) {
  return apiPost<LaybyOrder>(`/api/mariadb/tenants/${tenantId}/laybys`, data);
}

export function addLaybyPayment(tenantId: string, laybyId: string, data: {
  method: LaybyPaymentMethod;
  amount: number;
  tenderedAmount?: number;
  changeAmount?: number;
  cashSessionId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  note?: string | null;
}) {
  return apiPost<LaybyOrder>(`/api/mariadb/tenants/${tenantId}/laybys/${encodeURIComponent(laybyId)}/payments`, data);
}

export function completeLaybyOrder(tenantId: string, laybyId: string, data: {
  payment?: {
    method: LaybyPaymentMethod;
    amount: number;
    tenderedAmount?: number;
    changeAmount?: number;
    cashSessionId?: string | null;
    note?: string | null;
  };
  staffId?: string | null;
  staffName?: string | null;
} = {}) {
  return apiPost<LaybyOrder>(`/api/mariadb/tenants/${tenantId}/laybys/${encodeURIComponent(laybyId)}/complete`, data);
}

export function cancelLaybyOrder(tenantId: string, laybyId: string, data: {
  reason?: string | null;
  refundAmount?: number;
  refundMethod?: LaybyPaymentMethod;
  cashSessionId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
}) {
  return apiPost<LaybyOrder>(`/api/mariadb/tenants/${tenantId}/laybys/${encodeURIComponent(laybyId)}/cancel`, data);
}

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

export function recordCashMovement(tenantId: string, cashSessionId: string, data: {
  type: string;
  direction: 'in' | 'out' | 'neutral';
  amount: number;
  saleId?: string | null;
  paymentId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  note?: string | null;
}) {
  return apiPost<any>(`/api/mariadb/tenants/${tenantId}/cash-sessions/${cashSessionId}/movements`, data);
}

export function getManagerCashSummary(tenantId: string) {
  return apiGet<ManagerCashSummary>(`/api/mariadb/tenants/${tenantId}/manager-cash/summary`);
}

export type ManagerCashMovementFilters = {
  limit?: number;
  movementType?: ManagerCashMovementType | '';
  direction?: 'in' | 'out' | 'neutral' | '';
  cashSource?: string;
  sourceType?: string;
  staffId?: string;
  customerId?: string;
  from?: string;
  to?: string;
  search?: string;
};

function managerCashMovementQuery(filters: ManagerCashMovementFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function getManagerCashMovements(tenantId: string, filters: ManagerCashMovementFilters = {}) {
  return apiGet<ManagerCashMovement[]>(`/api/mariadb/tenants/${tenantId}/manager-cash/movements${managerCashMovementQuery(filters)}`);
}

export function exportManagerCashMovementsCsv(tenantId: string, filters: ManagerCashMovementFilters = {}) {
  return apiGet<{ filename: string; mimeType: string; csv: string; generatedAt: string; count: number }>(
    `/api/mariadb/tenants/${tenantId}/manager-cash/movements/export${managerCashMovementQuery(filters)}`
  );
}

export function recordManagerCashMovement(tenantId: string, data: {
  movementType: ManagerCashMovementType;
  direction?: 'in' | 'out' | 'neutral';
  amount: number;
  cashSessionId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  sourceType?: string | null;
  cashSource?: string | null;
  referenceId?: string | null;
  category?: string | null;
  note?: string | null;
  receiptAttachmentUrl?: string | null;
  receiptAttachmentName?: string | null;
  countedBreakdown?: Record<string, number>;
  approvedBy?: string | null;
  approvedByName?: string | null;
}) {
  return apiPost<ManagerCashMovement>(`/api/mariadb/tenants/${tenantId}/manager-cash/movements`, data);
}

export function getCashCustodyTransfers(tenantId: string, filters: { status?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.limit) params.set('limit', String(filters.limit));
  const query = params.toString();
  return apiGet<CashCustodyTransfer[]>(`/api/mariadb/tenants/${tenantId}/manager-cash/transfers${query ? `?${query}` : ''}`);
}

export function createCashCustodyTransfer(tenantId: string, data: {
  fromType: CashCustodyTransferPartyType;
  fromId?: string | null;
  fromName?: string | null;
  toType: CashCustodyTransferPartyType;
  toId?: string | null;
  toName?: string | null;
  cashSessionId?: string | null;
  expectedAmount: number;
  countedAmount?: number;
  countedBreakdown?: Record<string, number>;
  note?: string | null;
}) {
  return apiPost<CashCustodyTransfer>(`/api/mariadb/tenants/${tenantId}/manager-cash/transfers`, data);
}

export function confirmCashCustodyTransfer(tenantId: string, transferId: string, data: {
  countedAmount?: number;
  countedBreakdown?: Record<string, number>;
  note?: string | null;
} = {}) {
  return apiPut<CashCustodyTransfer>(`/api/mariadb/tenants/${tenantId}/manager-cash/transfers/${encodeURIComponent(transferId)}/confirm`, data);
}

export function cancelCashCustodyTransfer(tenantId: string, transferId: string, data: { note?: string | null } = {}) {
  return apiPut<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/manager-cash/transfers/${encodeURIComponent(transferId)}/cancel`, data);
}

export function getCashClosePreview(tenantId: string, businessDate?: string | null) {
  const query = businessDate ? `?businessDate=${encodeURIComponent(businessDate)}` : '';
  return apiGet<CashClosePreview>(`/api/mariadb/tenants/${tenantId}/manager-cash/close/preview${query}`);
}

export function getCashCloseCheckpoints(tenantId: string, limit = 20) {
  return apiGet<CashCloseCheckpoint[]>(`/api/mariadb/tenants/${tenantId}/manager-cash/close?limit=${encodeURIComponent(String(limit))}`);
}

export function createCashCloseCheckpoint(tenantId: string, data: {
  businessDate?: string | null;
  countedAmount: number;
  countedBreakdown?: Record<string, number>;
  note?: string | null;
}) {
  return apiPost<CashCloseCheckpoint>(`/api/mariadb/tenants/${tenantId}/manager-cash/close`, data);
}

export function exportCashCloseCheckpointCsv(tenantId: string, checkpointId: string) {
  return apiGet<{ filename: string; mimeType: string; csv: string; generatedAt: string }>(
    `/api/mariadb/tenants/${tenantId}/manager-cash/close/${encodeURIComponent(checkpointId)}/export`
  );
}

export function recordWalletCashMovement(tenantId: string, data: {
  ownerType: 'staff' | 'customer';
  ownerId: string;
  direction: 'in' | 'out';
  amount: number;
  note?: string | null;
  referenceId?: string | null;
  applyWalletDelta?: boolean;
  cashSource?: string | null;
  receiptAttachmentUrl?: string | null;
  receiptAttachmentName?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
}) {
  return apiPost<{
    movement: ManagerCashMovement;
    ownerType: 'staff' | 'customer';
    ownerId: string;
    previousBalance: number;
    nextBalance: number;
    appliedWalletDelta: boolean;
  }>(`/api/mariadb/tenants/${tenantId}/manager-cash/wallet-cash`, data);
}

export function recordRegisterWalletCashMovement(tenantId: string, cashSessionId: string, data: {
  customerId: string;
  direction: 'in' | 'out';
  amount: number;
  note?: string | null;
}) {
  return apiPost<{
    cashMovementId: string;
    movement: ManagerCashMovement;
    customerId: string;
    customerName: string;
    previousBalance: number;
    nextBalance: number;
    cashSessionId: string;
    cashSessionDelta: number;
  }>(`/api/mariadb/tenants/${tenantId}/cash-sessions/${encodeURIComponent(cashSessionId)}/wallet-cash`, data);
}

export function setupTenant(data: any) {
  return apiPost<{ tenantId: string }>(`/api/mariadb/setup`, data);
}

export function updateTenantConfig(tenantId: string, config: any) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/settings/app`, config);
}

export function uploadTenantLogo(tenantId: string, data: { dataUrl: string; filename: string; mimeType: string }) {
  return apiPost<{ logoUrl: string; config?: any }>(`/api/mariadb/tenants/${tenantId}/settings/logo`, data);
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

export function testAiProvider(tenantId: string, settings: Partial<AiSettings> & { message?: string; images?: string[]; documents?: Array<{ name?: string; type?: string; dataUrl: string }> }) {
  return apiPost<{ provider: string; model: string; reply: string; latencyMs: number }>(`/api/mariadb/tenants/${tenantId}/ai/test`, settings);
}

export function getAiInsights(tenantId: string) {
  return apiGet<AiInsight[]>(`/api/mariadb/tenants/${tenantId}/ai/insights`);
}

export function generateAiInsights(tenantId: string) {
  return apiPost<AiInsight[]>(`/api/mariadb/tenants/${tenantId}/ai/insights/generate`, {});
}

export function deleteAiInsight(tenantId: string, insightId: string) {
  return apiDelete<{ deleted: number }>(`/api/mariadb/tenants/${tenantId}/ai/insights/${insightId}`);
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

export function applyInventoryAgentSteps(tenantId: string, steps: InventoryAgentStep[], fullAutopilot = false, runId?: string) {
  return apiPost<InventoryAgentApplyResult>(`/api/mariadb/tenants/${tenantId}/ai/agent/inventory/apply`, { steps, fullAutopilot, runId });
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
