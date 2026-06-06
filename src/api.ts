/**
 * REST API client — MariaDB backend.
 * All requests automatically attach the JWT Bearer token.
 * On 401, attempts a token refresh and retries once before throwing.
 */
import { getAccessToken } from './hooks/useAuth';
import { promptSensitiveCredential } from './api-sensitive-action';
import { apiUrl, apiUrls } from './apiConfig';
import type { AccountingJournalReport, AiInsight, AiModelOption, AiSettings, AiStaffScore, BatchExportResult, BatchMutationResult, CashCloseCheckpoint, CashClosePreview, CashCustodyTransfer, CashCustodyTransferPartyType, CustomerCampaignExport, CustomerConsentMap, CustomerDataExport, DeliveryOrder, DeliveryOrderStatus, EcommerceMarketplaceExport, EventBooking, HardwareDevice, HardwareDeviceEvent, IntegrationApiKey, IntegrationWebhookEvent, InventoryAgentApplyResult, InventoryAgentProposal, InventoryAgentStep, InventoryLocation, LaybyOrder, LaybyPaymentMethod, LoyaltyAwardResult, LoyaltyRewardRule, LoyaltyTier, ManagerCashMovement, ManagerCashMovementType, ManagerCashSummary, MarginReport, OperationalReport, ProductLocationStock, Promotion, PromotionValidationResult, RecipeCostingReport, ReorderNotificationRule, ReorderRecommendation, RetentionApplyResult, RetentionPolicy, RetentionPreview, StaffAttendance, StaffAttendanceStatus, StaffCoachingNote, StaffPerformanceReport, StaffShift, StaffTimesheetReport, StockTakeSuggestion, StockTransferOrder, StockValuationReport, TaxPeriod, TipPoolReport, TipPoolRule, VatTaxReport } from './types';

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
      const res = await fetch(apiUrl('/api/auth/refresh'), {
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

async function readJsonishBody(res: Response): Promise<{ raw: string; parsed: any | null }> {
  const raw = await res.text();
  if (!raw) return { raw, parsed: null };
  try {
    return { raw, parsed: JSON.parse(raw) };
  } catch {
    return { raw, parsed: null };
  }
}

function isJsonMutation(init: RequestInit) {
  const method = String(init.method || 'GET').toUpperCase();
  const headers = init.headers as Record<string, string> | undefined;
  const contentType = headers?.['Content-Type'] || headers?.['content-type'] || '';
  return method !== 'GET'
    && typeof init.body === 'string'
    && contentType.toLowerCase().includes('application/json');
}

function isSafeRequest(init: RequestInit) {
  const method = String(init.method || 'GET').toUpperCase();
  return method === 'GET' || method === 'HEAD';
}

function isTransientTargetFailure(status: number) {
  return status === 408
    || status === 502
    || status === 503
    || status === 504
    || status === 521
    || status === 522
    || status === 523
    || status === 524;
}

function withSensitiveVerification(init: RequestInit, credential: string, actionType?: string | null): RequestInit | null {
  if (!isJsonMutation(init)) return null;
  try {
    const parsed = init.body ? JSON.parse(String(init.body)) : {};
    const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    return {
      ...init,
      body: JSON.stringify({
        ...body,
        sensitiveVerification: {
          actionType: actionType || body.sensitiveVerification?.actionType || undefined,
          password: credential,
          pin: credential,
        },
      }),
    };
  } catch {
    return null;
  }
}

async function apiFetch<T>(input: RequestInfo, init: RequestInit = {}): Promise<T> {
  if (sessionCleared && getAccessToken()) {
    sessionCleared = false;
  }
  if (sessionCleared || !getAccessToken()) {
    clearStoredSession();
    throw new Error('Session expired. Please sign in again.');
  }

  const doRequest = async (requestInit: RequestInit) => {
    const safeRequest = isSafeRequest(requestInit);
    const candidates = safeRequest ? apiUrls(input) : [apiUrl(input)];
    let lastError: unknown = null;
    for (const [index, candidate] of candidates.entries()) {
      try {
        const response = await fetch(candidate, {
          ...requestInit,
          headers: {
            ...authHeaders(requestInit.headers as Record<string, string>),
          },
        });
        if (safeRequest && index < candidates.length - 1 && isTransientTargetFailure(response.status)) {
          lastError = new Error(`API target unavailable [${response.status}]`);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (!safeRequest) throw error;
      }
    }
    throw lastError || new Error('API request failed');
  };

  let currentInit = init;
  let res = await doRequest(currentInit);

  // If unauthorized, try to refresh once and retry
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      sessionCleared = false;
      res = await doRequest(currentInit);
    } else {
      clearStoredSession();
      throw new Error('Session expired. Please sign in again.');
    }
  }

  if (res.status === 428 && isJsonMutation(currentInit)) {
    const { parsed } = await readJsonishBody(res);
    if (parsed?.sensitiveActionRequired) {
      const credential = await promptSensitiveCredential(parsed);
      const retryInit = credential ? withSensitiveVerification(currentInit, credential, parsed?.actionType) : null;
      if (retryInit) {
        currentInit = retryInit;
        res = await doRequest(currentInit);
      } else {
        throw new Error(parsed?.error || 'Sensitive action verification required.');
      }
    }
  }

  if (!res.ok) {
    const { raw: body, parsed } = await readJsonishBody(res);
    const message = parsed?.error || parsed?.message || parsed?.detail;
    if (message) throw new Error(String(message));
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

export function apiDelete<T>(path: string, data?: unknown): Promise<T> {
  return apiFetch<T>(path, data === undefined
    ? { method: 'DELETE' }
    : {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth endpoints
// ─────────────────────────────────────────────────────────────────────────────

export function apiLogin(email: string, password: string, tenantId?: string) {
  return fetch(apiUrl('/api/auth/login'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password, tenantId }),
  }).then(r => r.json());
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenant Data Queries
// ─────────────────────────────────────────────────────────────────────────────

export function getTwoFactorStatus() {
  return apiGet<{ eligible: boolean; enabled: boolean; confirmedAt?: string | null }>('/api/auth/2fa');
}

export function startTwoFactorSetup() {
  return apiPost<{ secret: string; otpauthUri: string }>('/api/auth/2fa/setup', {});
}

export function confirmTwoFactorSetup(code: string) {
  return apiPost<{ enabled: boolean }>('/api/auth/2fa/confirm', { code });
}

export function disableTwoFactor(password: string, code: string) {
  return apiPost<{ enabled: boolean }>('/api/auth/2fa/disable', { password, code });
}

export function revokeRefreshTokens(staffId?: string, reason = 'suspected_compromise') {
  return apiPost<{ revoked: boolean; staffId: string }>('/api/auth/refresh-tokens/revoke', { staffId, reason });
}

export function getTenantProducts(tenantId: string, locationId?: string | null) {
  const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/products${query}`);
}

export function batchCreateProducts(tenantId: string, data: { csv?: string; rows?: Record<string, unknown>[]; dryRun?: boolean }) {
  return apiPost<BatchMutationResult>(`/api/mariadb/tenants/${tenantId}/batch/products/create`, data);
}

export function batchUpdateProductPrices(tenantId: string, data: { csv?: string; rows?: Record<string, unknown>[]; dryRun?: boolean }) {
  return apiPost<BatchMutationResult>(`/api/mariadb/tenants/${tenantId}/batch/products/prices`, data);
}

export function exportInventoryBatchCsv(tenantId: string, filters: { locationId?: string | null } = {}) {
  const query = filters.locationId ? `?locationId=${encodeURIComponent(filters.locationId)}` : '';
  return apiGet<BatchExportResult>(`/api/mariadb/tenants/${tenantId}/batch/inventory/export${query}`);
}

export function importInventoryBatch(tenantId: string, data: { csv?: string; rows?: Record<string, unknown>[]; dryRun?: boolean; locationId?: string | null }) {
  return apiPost<BatchMutationResult>(`/api/mariadb/tenants/${tenantId}/batch/inventory/import`, data);
}

export function getInventoryLocations(tenantId: string) {
  return apiGet<InventoryLocation[]>(`/api/mariadb/tenants/${tenantId}/inventory-locations`);
}

export function createInventoryLocation(tenantId: string, data: Partial<InventoryLocation>) {
  return apiPost<InventoryLocation>(`/api/mariadb/tenants/${tenantId}/inventory-locations`, data);
}

export function updateInventoryLocation(tenantId: string, locationId: string, data: Partial<InventoryLocation>) {
  return apiPut<InventoryLocation>(`/api/mariadb/tenants/${tenantId}/inventory-locations/${encodeURIComponent(locationId)}`, data);
}

export function getProductLocationStocks(tenantId: string, filters: { productId?: string | null; locationId?: string | null } = {}) {
  const query = new URLSearchParams();
  if (filters.productId) query.set('productId', filters.productId);
  if (filters.locationId) query.set('locationId', filters.locationId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiGet<ProductLocationStock[]>(`/api/mariadb/tenants/${tenantId}/inventory-location-stock${suffix}`);
}

export function updateProductLocationStock(tenantId: string, data: {
  productId: string;
  locationId: string;
  quantity: number;
  minStock?: number;
  reorderThreshold?: number;
  note?: string | null;
}) {
  return apiPut<ProductLocationStock>(`/api/mariadb/tenants/${tenantId}/inventory-location-stock`, data);
}

export function getStockTransfers(tenantId: string, status?: string | null) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiGet<StockTransferOrder[]>(`/api/mariadb/tenants/${tenantId}/stock-transfers${query}`);
}

export function createStockTransfer(tenantId: string, data: {
  fromLocationId: string;
  toLocationId: string;
  notes?: string | null;
  items: Array<{ productId: string; productName?: string; quantity: number }>;
}) {
  return apiPost<StockTransferOrder>(`/api/mariadb/tenants/${tenantId}/stock-transfers`, data);
}

export function completeStockTransfer(tenantId: string, transferId: string) {
  return apiPost<StockTransferOrder>(`/api/mariadb/tenants/${tenantId}/stock-transfers/${encodeURIComponent(transferId)}/complete`, {});
}

export function getTenantConfig(tenantId: string) {
  return apiGet<any>(`/api/mariadb/tenants/${tenantId}/config`);
}

export function getPromotions(tenantId: string) {
  return apiGet<Promotion[]>(`/api/mariadb/tenants/${tenantId}/promotions`);
}

export function createPromotion(tenantId: string, data: Partial<Promotion>) {
  return apiPost<Promotion>(`/api/mariadb/tenants/${tenantId}/promotions`, data);
}

export function updatePromotion(tenantId: string, promotionId: string, data: Partial<Promotion>) {
  return apiPut<Promotion>(`/api/mariadb/tenants/${tenantId}/promotions/${encodeURIComponent(promotionId)}`, data);
}

export function validatePromotionCode(tenantId: string, data: {
  code?: string | null;
  promotionId?: string | null;
  customerId?: string | null;
  subtotal?: number;
  totalBeforeDiscount?: number;
  promotionDiscount?: number;
  items: Array<{
    id?: string | null;
    productId?: string | null;
    name?: string | null;
    category?: string | null;
    section?: string | null;
    subCategory?: string | null;
    price: number;
    quantity: number;
  }>;
}) {
  return apiPost<PromotionValidationResult>(`/api/mariadb/tenants/${tenantId}/promotions/validate`, data);
}

export function getLoyaltyTiers(tenantId: string) {
  return apiGet<LoyaltyTier[]>(`/api/mariadb/tenants/${tenantId}/loyalty/tiers`);
}

export function createLoyaltyTier(tenantId: string, data: Partial<LoyaltyTier>) {
  return apiPost<LoyaltyTier>(`/api/mariadb/tenants/${tenantId}/loyalty/tiers`, data);
}

export function updateLoyaltyTier(tenantId: string, tierId: string, data: Partial<LoyaltyTier>) {
  return apiPut<LoyaltyTier>(`/api/mariadb/tenants/${tenantId}/loyalty/tiers/${encodeURIComponent(tierId)}`, data);
}

export function getLoyaltyRewardRules(tenantId: string) {
  return apiGet<LoyaltyRewardRule[]>(`/api/mariadb/tenants/${tenantId}/loyalty/reward-rules`);
}

export function createLoyaltyRewardRule(tenantId: string, data: Partial<LoyaltyRewardRule>) {
  return apiPost<LoyaltyRewardRule>(`/api/mariadb/tenants/${tenantId}/loyalty/reward-rules`, data);
}

export function updateLoyaltyRewardRule(tenantId: string, ruleId: string, data: Partial<LoyaltyRewardRule>) {
  return apiPut<LoyaltyRewardRule>(`/api/mariadb/tenants/${tenantId}/loyalty/reward-rules/${encodeURIComponent(ruleId)}`, data);
}

export function previewLoyaltyAward(tenantId: string, data: {
  customerId?: string | null;
  subtotal?: number;
  total?: number;
  pointsRedeemed?: number;
  items: Array<{
    id?: string | null;
    productId?: string | null;
    name?: string | null;
    category?: string | null;
    section?: string | null;
    subCategory?: string | null;
    price: number;
    quantity: number;
  }>;
}) {
  return apiPost<LoyaltyAwardResult>(`/api/mariadb/tenants/${tenantId}/loyalty/preview`, data);
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

export function refreshReorderRecommendations(tenantId: string, data: { daysOfCover?: number; vendorId?: string | null; locationId?: string | null } = {}) {
  return apiPost<{ created: number; updated: number; skippedApproved: number; recommendations: ReorderRecommendation[] }>(
    `/api/mariadb/tenants/${tenantId}/reorder-recommendations/refresh`,
    data
  );
}

export function getReorderNotificationRules(tenantId: string) {
  return apiGet<ReorderNotificationRule[]>(`/api/mariadb/tenants/${tenantId}/reorder-notification-rules`);
}

export function getRecipeCostingReport(tenantId: string) {
  return apiGet<RecipeCostingReport>(`/api/mariadb/tenants/${tenantId}/recipe-costing-report`);
}

export function getEventBookings(tenantId: string, filters: { from?: string; to?: string; status?: string; eventType?: string; reminderStatus?: string } = {}) {
  const query = new URLSearchParams();
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  if (filters.status) query.set('status', filters.status);
  if (filters.eventType) query.set('eventType', filters.eventType);
  if (filters.reminderStatus) query.set('reminderStatus', filters.reminderStatus);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiGet<EventBooking[]>(`/api/mariadb/tenants/${tenantId}/event-bookings${suffix}`);
}

export function createEventBooking(tenantId: string, data: Partial<EventBooking>) {
  return apiPost<EventBooking>(`/api/mariadb/tenants/${tenantId}/event-bookings`, data);
}

export function updateEventBooking(tenantId: string, id: string, data: Partial<EventBooking>) {
  return apiPut<EventBooking>(`/api/mariadb/tenants/${tenantId}/event-bookings/${encodeURIComponent(id)}`, data);
}

export function deleteEventBooking(tenantId: string, id: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/event-bookings/${encodeURIComponent(id)}`);
}

export function createReorderNotificationRule(tenantId: string, data: Partial<ReorderNotificationRule>) {
  return apiPost<ReorderNotificationRule>(`/api/mariadb/tenants/${tenantId}/reorder-notification-rules`, data);
}

export function updateReorderNotificationRule(tenantId: string, id: string, data: Partial<ReorderNotificationRule>) {
  return apiPut<ReorderNotificationRule>(`/api/mariadb/tenants/${tenantId}/reorder-notification-rules/${encodeURIComponent(id)}`, data);
}

export function runReorderNotificationRule(tenantId: string, id: string) {
  return apiPost<{
    rule: ReorderNotificationRule | null;
    result: { created: number; updated: number; skippedApproved: number; recommendations: ReorderRecommendation[]; ruleRun?: Record<string, any> };
  }>(`/api/mariadb/tenants/${tenantId}/reorder-notification-rules/${encodeURIComponent(id)}/run`, {});
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

export function exportCustomersBatchCsv(tenantId: string) {
  return apiGet<BatchExportResult>(`/api/mariadb/tenants/${tenantId}/batch/customers/export`);
}

export function importCustomersBatch(tenantId: string, data: { csv?: string; rows?: Record<string, unknown>[]; dryRun?: boolean }) {
  return apiPost<BatchMutationResult>(`/api/mariadb/tenants/${tenantId}/batch/customers/import`, data);
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

export function getManagerOverrides(tenantId: string, limit = 20) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/manager-overrides?limit=${encodeURIComponent(String(limit))}`);
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
  return apiGet<{
    filename: string;
    pdfFilename: string;
    mimeType: string;
    pdfMimeType: string;
    audience: string;
    count: number;
    summary: Record<string, number>;
    csv: string;
    pdfBase64: string;
    generatedAt: string;
  }>(
    `/api/mariadb/tenants/${tenantId}/action-center/activity/report${query ? `?${query}` : ''}`
  );
}

export function exportPaymentProviderReconciliationReport(tenantId: string, filters: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<{
    filename: string;
    pdfFilename: string;
    mimeType: string;
    pdfMimeType: string;
    count: number;
    summary: Record<string, number>;
    providerBreakdown: Array<{ label: string; count: number; amount: number }>;
    statusBreakdown: Array<{ label: string; count: number; amount: number }>;
    methodBreakdown: Array<{ label: string; count: number; amount: number }>;
    payments: any[];
    csv: string;
    pdfBase64: string;
    generatedAt: string;
    pciBoundary: {
      storedSensitiveCardData: false;
      excludedFields: string[];
      note: string;
    };
  }>(
    `/api/mariadb/tenants/${tenantId}/payment-provider-reconciliation/report${query ? `?${query}` : ''}`
  );
}

export function getTaxPeriods(tenantId: string, limit = 24) {
  return apiGet<TaxPeriod[]>(`/api/mariadb/tenants/${tenantId}/tax/periods?limit=${encodeURIComponent(String(limit))}`);
}

export function exportVatTaxReport(tenantId: string, filters: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<VatTaxReport>(`/api/mariadb/tenants/${tenantId}/tax/vat-report${query ? `?${query}` : ''}`);
}

export function lockTaxPeriod(tenantId: string, data: { periodStart: string; periodEnd: string; note?: string | null }) {
  return apiPost<{ period: TaxPeriod; report: VatTaxReport }>(`/api/mariadb/tenants/${tenantId}/tax/periods/lock`, data);
}

export function exportMarginReport(tenantId: string, filters: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<MarginReport>(`/api/mariadb/tenants/${tenantId}/reports/margins${query ? `?${query}` : ''}`);
}

export function exportOperationalReport(tenantId: string, filters: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<OperationalReport>(`/api/mariadb/tenants/${tenantId}/reports/operational${query ? `?${query}` : ''}`);
}

export function exportAccountingJournalReport(tenantId: string, filters: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<AccountingJournalReport>(`/api/mariadb/tenants/${tenantId}/reports/accounting-journal${query ? `?${query}` : ''}`);
}

export function exportEcommerceMarketplacePack(tenantId: string, filters: Record<string, string | number | boolean | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<EcommerceMarketplaceExport>(`/api/mariadb/tenants/${tenantId}/integrations/ecommerce/products-export${query ? `?${query}` : ''}`);
}

export function getIntegrationApiKeys(tenantId: string) {
  return apiGet<IntegrationApiKey[]>(`/api/mariadb/tenants/${tenantId}/integrations/api-keys`);
}

export function createIntegrationApiKey(tenantId: string, data: { name?: string; scopes?: string[] }) {
  return apiPost<{ key: IntegrationApiKey; secret: string }>(`/api/mariadb/tenants/${tenantId}/integrations/api-keys`, data);
}

export function revokeIntegrationApiKey(tenantId: string, keyId: string) {
  return apiPost<IntegrationApiKey>(`/api/mariadb/tenants/${tenantId}/integrations/api-keys/${encodeURIComponent(keyId)}/revoke`, {});
}

export function getIntegrationWebhookEvents(tenantId: string, filters: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<IntegrationWebhookEvent[]>(`/api/mariadb/tenants/${tenantId}/integrations/webhook-events${query ? `?${query}` : ''}`);
}

export function getDeliveryOrders(tenantId: string, filters: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<DeliveryOrder[]>(`/api/mariadb/tenants/${tenantId}/integrations/delivery/orders${query ? `?${query}` : ''}`);
}

export function ingestDeliveryOrder(tenantId: string, payload: unknown) {
  return apiPost<DeliveryOrder>(`/api/mariadb/tenants/${tenantId}/integrations/delivery/orders`, payload);
}

export function updateDeliveryOrderStatus(tenantId: string, orderId: string, status: DeliveryOrderStatus) {
  return apiPut<DeliveryOrder>(`/api/mariadb/tenants/${tenantId}/integrations/delivery/orders/${encodeURIComponent(orderId)}/status`, { status });
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

export function getStockValuationReport(tenantId: string, filters: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<StockValuationReport>(
    `/api/mariadb/tenants/${tenantId}/stock-reports/valuation${query ? `?${query}` : ''}`
  );
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

export function deleteCustomer(tenantId: string, customerId: string, data: { reason?: string | null } = {}) {
  return apiDelete<{
    success: boolean;
    mode: 'anonymized' | 'already_anonymized';
    customerId: string;
    anonymizedName: string;
    retainedSaleCount?: number;
    revokedConsentTypes?: string[];
    blockers?: any[];
  }>(`/api/mariadb/tenants/${tenantId}/customers/${customerId}`, data);
}

export function getCustomerCampaignExport(tenantId: string, filters: { segment?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (filters.segment) query.set('segment', filters.segment);
  if (filters.limit) query.set('limit', String(filters.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiGet<CustomerCampaignExport>(`/api/mariadb/tenants/${tenantId}/customers/campaign-export${suffix}`);
}

export function getCustomerConsents(tenantId: string, customerId: string) {
  return apiGet<CustomerConsentMap>(`/api/mariadb/tenants/${tenantId}/customers/${customerId}/consents`);
}

export function updateCustomerConsents(tenantId: string, customerId: string, consents: Partial<CustomerConsentMap>) {
  return apiPut<CustomerConsentMap>(`/api/mariadb/tenants/${tenantId}/customers/${customerId}/consents`, { consents });
}

export function getCustomerDataExport(tenantId: string, customerId: string) {
  return apiGet<CustomerDataExport>(`/api/mariadb/tenants/${tenantId}/customers/${customerId}/data-export`);
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

export function getHardwareDevices(tenantId: string, filters: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return apiGet<HardwareDevice[]>(`/api/mariadb/tenants/${tenantId}/hardware-devices${query ? `?${query}` : ''}`);
}

export function createHardwareDevice(tenantId: string, device: Partial<HardwareDevice>) {
  return apiPost<HardwareDevice>(`/api/mariadb/tenants/${tenantId}/hardware-devices`, device);
}

export function updateHardwareDevice(tenantId: string, deviceId: string, device: Partial<HardwareDevice>) {
  return apiPut<HardwareDevice>(`/api/mariadb/tenants/${tenantId}/hardware-devices/${encodeURIComponent(deviceId)}`, device);
}

export function deleteHardwareDevice(tenantId: string, deviceId: string) {
  return apiDelete<{ success: boolean }>(`/api/mariadb/tenants/${tenantId}/hardware-devices/${encodeURIComponent(deviceId)}`);
}

export function testHardwareDevice(tenantId: string, deviceId: string, context: Record<string, any> = {}) {
  return apiPost<{ eventId: string; ready: boolean; message: string; dispatchMode: string; command: any; device: HardwareDevice }>(
    `/api/mariadb/tenants/${tenantId}/hardware-devices/${encodeURIComponent(deviceId)}/test`,
    context
  );
}

export function getHardwareEvents(tenantId: string, limit = 25) {
  return apiGet<HardwareDeviceEvent[]>(`/api/mariadb/tenants/${tenantId}/hardware-events?limit=${encodeURIComponent(String(limit))}`);
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

export function updateSalePaymentProviderStatus(tenantId: string, saleId: string, paymentId: string, data: {
  provider?: string | null;
  providerDeviceId?: string | null;
  providerReference?: string | null;
  authorizationCode?: string | null;
  providerStatus: string;
  providerNote?: string | null;
}) {
  return apiPut<any>(`/api/mariadb/tenants/${tenantId}/sales/${saleId}/payments/${paymentId}/provider-status`, data);
}

export function refundSale(tenantId: string, saleId: string, data: {
  items: { saleItemId: string; quantity: number }[];
  reason: string;
  method: 'cash' | 'card' | 'wallet' | 'bnpl';
  restock?: boolean;
  staffId?: string | null;
  staffName?: string | null;
  cashSessionId?: string | null;
  provider?: string | null;
  providerReference?: string | null;
  providerStatus?: string | null;
  providerNote?: string | null;
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

function queryString(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function getStaffShifts(tenantId: string, params: { startDate?: string; endDate?: string; staffId?: string } = {}) {
  return apiGet<StaffShift[]>(`/api/mariadb/tenants/${tenantId}/workforce/shifts${queryString(params)}`);
}

export function createStaffShift(tenantId: string, data: Partial<StaffShift>) {
  return apiPost<StaffShift>(`/api/mariadb/tenants/${tenantId}/workforce/shifts`, data);
}

export function updateStaffShift(tenantId: string, shiftId: string, data: Partial<StaffShift>) {
  return apiPut<StaffShift>(`/api/mariadb/tenants/${tenantId}/workforce/shifts/${encodeURIComponent(shiftId)}`, data);
}

export function cancelStaffShift(tenantId: string, shiftId: string) {
  return apiDelete<StaffShift>(`/api/mariadb/tenants/${tenantId}/workforce/shifts/${encodeURIComponent(shiftId)}`);
}

export function publishStaffRoster(tenantId: string, data: { startDate: string; endDate: string }) {
  return apiPost<{ startDate: string; endDate: string; shifts: StaffShift[] }>(`/api/mariadb/tenants/${tenantId}/workforce/roster/publish`, data);
}

export function getTimesheetPayrollReport(tenantId: string, params: { startDate?: string; endDate?: string; staffId?: string } = {}) {
  return apiGet<StaffTimesheetReport>(`/api/mariadb/tenants/${tenantId}/workforce/timesheet-payroll${queryString(params)}`);
}

export function getStaffPerformanceReport(tenantId: string, params: { startDate?: string; endDate?: string; staffId?: string } = {}) {
  return apiGet<StaffPerformanceReport>(`/api/mariadb/tenants/${tenantId}/workforce/staff-performance${queryString(params)}`);
}

export function addStaffCoachingNote(tenantId: string, data: {
  staffId: string;
  title: string;
  note: string;
  noteType?: StaffCoachingNote['noteType'];
  source?: StaffCoachingNote['source'];
}) {
  return apiPost<StaffCoachingNote>(`/api/mariadb/tenants/${tenantId}/workforce/staff-performance/coaching-notes`, data);
}

export function getTipPoolRules(tenantId: string) {
  return apiGet<TipPoolRule[]>(`/api/mariadb/tenants/${tenantId}/workforce/tip-pool-rules`);
}

export function createTipPoolRule(tenantId: string, data: Partial<TipPoolRule>) {
  return apiPost<TipPoolRule>(`/api/mariadb/tenants/${tenantId}/workforce/tip-pool-rules`, data);
}

export function updateTipPoolRule(tenantId: string, ruleId: string, data: Partial<TipPoolRule>) {
  return apiPut<TipPoolRule>(`/api/mariadb/tenants/${tenantId}/workforce/tip-pool-rules/${encodeURIComponent(ruleId)}`, data);
}

export function previewTipPoolPayouts(tenantId: string, data: { ruleId?: string; startDate?: string; endDate?: string }) {
  return apiPost<TipPoolReport>(`/api/mariadb/tenants/${tenantId}/workforce/tip-pools/preview`, data);
}

export function generateTipPoolPayouts(tenantId: string, data: { ruleId?: string; startDate?: string; endDate?: string }) {
  return apiPost<TipPoolReport>(`/api/mariadb/tenants/${tenantId}/workforce/tip-pools/generate`, data);
}

export function getTipPoolPayouts(tenantId: string, params: { ruleId?: string; startDate?: string; endDate?: string; staffId?: string } = {}) {
  return apiGet<any[]>(`/api/mariadb/tenants/${tenantId}/workforce/tip-pool-payouts${queryString(params)}`);
}

export function getMyAttendanceStatus(tenantId: string, staffId?: string) {
  return apiGet<StaffAttendanceStatus>(`/api/mariadb/tenants/${tenantId}/workforce/attendance/me${queryString({ staffId })}`);
}

export function clockInStaff(tenantId: string, data: { staffId?: string; shiftId?: string | null; at?: string; note?: string }) {
  return apiPost<StaffAttendance>(`/api/mariadb/tenants/${tenantId}/workforce/clock-in`, data);
}

export function startStaffBreak(tenantId: string, data: { staffId?: string; at?: string } = {}) {
  return apiPost<StaffAttendance>(`/api/mariadb/tenants/${tenantId}/workforce/break/start`, data);
}

export function endStaffBreak(tenantId: string, data: { staffId?: string; at?: string } = {}) {
  return apiPost<StaffAttendance>(`/api/mariadb/tenants/${tenantId}/workforce/break/end`, data);
}

export function clockOutStaff(tenantId: string, data: { staffId?: string; at?: string; note?: string } = {}) {
  return apiPost<StaffAttendance>(`/api/mariadb/tenants/${tenantId}/workforce/clock-out`, data);
}

export function getRetentionPolicy(tenantId: string) {
  return apiGet<RetentionPolicy>(`/api/mariadb/tenants/${tenantId}/settings/retention-policy`);
}

export function updateRetentionPolicy(tenantId: string, policy: Partial<RetentionPolicy>) {
  return apiPut<RetentionPolicy>(`/api/mariadb/tenants/${tenantId}/settings/retention-policy`, policy);
}

export function previewRetentionPolicy(tenantId: string, policy?: Partial<RetentionPolicy>) {
  return apiPost<RetentionPreview>(`/api/mariadb/tenants/${tenantId}/settings/retention-policy/preview`, policy || {});
}

export function applyRetentionPolicy(tenantId: string, policy?: Partial<RetentionPolicy>) {
  return apiPost<RetentionApplyResult>(`/api/mariadb/tenants/${tenantId}/settings/retention-policy/apply`, policy || {});
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

export type LicenceFeature = 'jpos_branding' | 'own_logo' | 'images' | 'ai' | 'analytics' | 'local_server_sync' | 'api_access' | 'multi_location' | 'full_branding' | 'priority_support' | 'updates';
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
  localServerSync?: boolean;
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

export function syncAiInsightTasks(tenantId: string) {
  return apiPost<{ synced: number }>(`/api/mariadb/tenants/${tenantId}/ai/insights/sync-tasks`, {});
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
  const res = await fetch(apiUrl('/api/admin/licence/generate'), {
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
  const res = await fetch(apiUrl('/api/admin/licence/revoke'), {
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
