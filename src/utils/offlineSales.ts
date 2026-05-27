import { apiPost, apiPut, createSale, updateStaff } from '../api';

export type CheckoutMethod = 'cash' | 'payfast' | 'card' | 'wallet' | 'account' | 'split';
export type OfflineSaleQueueStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface OfflineSaleQueueItem {
  id: string;
  tenantId: string;
  operation: 'create_sale' | 'update_sale';
  targetSaleId?: string | null;
  localReceiptNumber: string;
  deviceId: string;
  method: CheckoutMethod;
  saleData: any;
  cashSessionId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  status: OfflineSaleQueueStatus;
  attempts: number;
  cloudSaleId?: string | null;
  saleSyncedAt?: string | null;
  postSaleEffectsSyncedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EnqueueOfflineSaleInput {
  tenantId: string;
  saleData: any;
  method: CheckoutMethod;
  targetSaleId?: string | null;
  cashSessionId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
}

const QUEUE_VERSION = 1;
const QUEUE_EVENT = 'masepos:offline-sales-changed';

function storageAvailable() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function queueKey(tenantId: string) {
  return `masepos-offline-sales:v${QUEUE_VERSION}:${tenantId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function randomToken() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateOfflineDeviceId(tenantId: string, staffId?: string | null) {
  const fallback = `device_${randomToken()}`;
  if (!storageAvailable()) return fallback;
  const key = `masepos-offline-device:${tenantId}:${staffId || 'staff'}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  window.localStorage.setItem(key, fallback);
  return fallback;
}

function nextLocalReceiptNumber(tenantId: string, deviceId: string) {
  if (!storageAvailable()) return `OFF-${deviceId.slice(-6).toUpperCase()}-${Date.now()}`;
  const key = `masepos-offline-receipt-seq:${tenantId}:${deviceId}`;
  const next = Number(window.localStorage.getItem(key) || '0') + 1;
  window.localStorage.setItem(key, String(next));
  return `OFF-${deviceId.slice(-6).toUpperCase()}-${String(next).padStart(6, '0')}`;
}

function notifyQueueChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
  }
}

export function offlineSalesChangedEventName() {
  return QUEUE_EVENT;
}

export function listOfflineSales(tenantId: string): OfflineSaleQueueItem[] {
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(queueKey(tenantId)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOfflineSales(tenantId: string, items: OfflineSaleQueueItem[]) {
  if (!storageAvailable()) return;
  window.localStorage.setItem(queueKey(tenantId), JSON.stringify(items));
  notifyQueueChanged();
}

export function countPendingOfflineSales(tenantId: string) {
  return listOfflineSales(tenantId).filter(item => item.status === 'pending' || item.status === 'failed' || item.status === 'syncing').length;
}

export function getCheckoutTenderMethods(method: CheckoutMethod, splitPayments?: any[]) {
  if (method !== 'split') return [method];
  return (splitPayments || []).map(payment => payment?.method).filter(Boolean) as CheckoutMethod[];
}

export function getOfflineCheckoutBlock(method: CheckoutMethod, splitPayments?: any[], offline = false) {
  if (!offline) return { allowed: true, reason: null as string | null };

  const methods = getCheckoutTenderMethods(method, splitPayments);
  if (methods.includes('wallet')) {
    return { allowed: false, reason: 'Wallet payments require an online connection and cannot be queued offline.' };
  }
  if (methods.includes('account')) {
    return { allowed: false, reason: 'Customer account payments require an online connection and cannot be queued offline yet.' };
  }
  if (methods.includes('payfast')) {
    return { allowed: false, reason: 'PayFast needs an online checkout and cannot be queued offline.' };
  }
  if (methods.every(tender => tender === 'cash' || tender === 'card')) {
    return { allowed: true, reason: null as string | null };
  }
  return { allowed: false, reason: 'This tender mix cannot be queued offline.' };
}

export function isOfflineLikeError(error: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = error instanceof Error ? error.message : String(error || '');
  if (/API request failed \[\d+\]/i.test(message)) return false;
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(message);
}

export function enqueueOfflineSale(input: EnqueueOfflineSaleInput) {
  const items = listOfflineSales(input.tenantId);
  const deviceId = getOrCreateOfflineDeviceId(input.tenantId, input.staffId);
  const id = `offline_sale_${Date.now()}_${randomToken()}`;
  const localReceiptNumber = nextLocalReceiptNumber(input.tenantId, deviceId);
  const createdAt = nowIso();
  const item: OfflineSaleQueueItem = {
    id,
    tenantId: input.tenantId,
    operation: input.targetSaleId ? 'update_sale' : 'create_sale',
    targetSaleId: input.targetSaleId || null,
    localReceiptNumber,
    deviceId,
    method: input.method,
    saleData: {
      ...input.saleData,
      offlineEventId: id,
      localReceiptNumber,
    },
    cashSessionId: input.cashSessionId || null,
    staffId: input.staffId || null,
    staffName: input.staffName || null,
    status: 'pending',
    attempts: 0,
    cloudSaleId: null,
    saleSyncedAt: null,
    postSaleEffectsSyncedAt: null,
    lastError: null,
    createdAt,
    updatedAt: createdAt,
  };
  writeOfflineSales(input.tenantId, [item, ...items]);
  return item;
}

export function offlineSaleToReceiptSale(item: OfflineSaleQueueItem) {
  return {
    ...item.saleData,
    id: item.localReceiptNumber,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    offlineEventId: item.id,
    localReceiptNumber: item.localReceiptNumber,
    syncStatus: item.status,
  };
}

function updateOfflineSale(tenantId: string, itemId: string, patch: Partial<OfflineSaleQueueItem>) {
  const items = listOfflineSales(tenantId);
  const updated = items.map(item => (
    item.id === itemId
      ? { ...item, ...patch, updatedAt: nowIso() }
      : item
  ));
  writeOfflineSales(tenantId, updated);
}

function compactSyncedItems(tenantId: string) {
  const items = listOfflineSales(tenantId);
  const synced = items.filter(item => item.status === 'synced').slice(0, 20);
  const active = items.filter(item => item.status !== 'synced');
  writeOfflineSales(tenantId, [...active, ...synced]);
}

async function syncCashSessionEffects(tenantId: string, item: OfflineSaleQueueItem, saleId: string) {
  if (!item.cashSessionId || !Array.isArray(item.saleData?.payments)) return;

  for (const payment of item.saleData.payments) {
    const sessionUpdates: any = {};
    const movements: any[] = [];
    if (payment.method === 'cash') {
      sessionUpdates.expectedCashDelta = Number(payment.amount || 0);
      movements.push({
        type: 'cash_sale',
        direction: 'in',
        amount: Number(payment.amount || 0),
        saleId,
        staffId: item.staffId || null,
        staffName: item.staffName || null,
        note: `Offline sale ${item.localReceiptNumber} synced`,
      });
    } else if (payment.method === 'card') {
      if (Number(payment.cashOutAmount || 0) > 0) {
        sessionUpdates.expectedCashDelta = -Number(payment.cashOutAmount || 0);
        movements.push({
          type: 'cash_out',
          direction: 'out',
          amount: Number(payment.cashOutAmount || 0),
          saleId,
          staffId: item.staffId || null,
          staffName: item.staffName || null,
          note: `Offline card cash-out ${item.localReceiptNumber} synced`,
        });
      } else if (Number(payment.tipAmount || 0) > 0) {
        sessionUpdates.tipsDelta = Number(payment.tipAmount || 0);
        movements.push({
          type: 'tip',
          direction: 'neutral',
          amount: Number(payment.tipAmount || 0),
          saleId,
          staffId: item.staffId || null,
          staffName: item.staffName || null,
          note: `Offline card tip ${item.localReceiptNumber} synced`,
        });
      }
    }

    if (Object.keys(sessionUpdates).length > 0) {
      await apiPut(`/api/mariadb/tenants/${tenantId}/cash-sessions/${item.cashSessionId}`, sessionUpdates);
    }
    for (const movement of movements) {
      await apiPost(`/api/mariadb/tenants/${tenantId}/cash-sessions/${item.cashSessionId}/movements`, movement);
    }
  }
}

async function syncStaffEffects(tenantId: string, item: OfflineSaleQueueItem) {
  if (!item.staffId || !Array.isArray(item.saleData?.payments)) return;
  const totalTips = item.saleData.payments.reduce((sum: number, payment: any) => sum + Number(payment.tipAmount || 0), 0);
  const update: any = { metricsOrdersDelta: 1 };
  if (totalTips > 0) update.metricsTipsDelta = totalTips;
  await updateStaff(tenantId, item.staffId, update);
}

export async function syncQueuedOfflineSales(tenantId: string) {
  const candidates = listOfflineSales(tenantId).filter(item => item.status === 'pending' || item.status === 'failed' || item.status === 'syncing');
  const synced: OfflineSaleQueueItem[] = [];
  const failed: OfflineSaleQueueItem[] = [];

  for (const item of candidates) {
    updateOfflineSale(tenantId, item.id, {
      status: 'syncing',
      attempts: item.attempts + 1,
      lastError: null,
    });

    try {
      let cloudSaleId = item.cloudSaleId || item.targetSaleId || null;
      if (!item.saleSyncedAt || !cloudSaleId) {
        if (item.operation === 'update_sale' && item.targetSaleId) {
          const sale = await apiPut<any>(`/api/mariadb/tenants/${tenantId}/sales/${item.targetSaleId}`, item.saleData);
          cloudSaleId = sale?.id || item.targetSaleId;
        } else {
          const sale = await createSale(tenantId, item.saleData);
          cloudSaleId = sale?.id;
        }
        updateOfflineSale(tenantId, item.id, {
          cloudSaleId,
          saleSyncedAt: nowIso(),
        });
      }

      if (cloudSaleId && !item.postSaleEffectsSyncedAt) {
        await syncCashSessionEffects(tenantId, item, cloudSaleId);
        await syncStaffEffects(tenantId, item);
      }

      updateOfflineSale(tenantId, item.id, {
        status: 'synced',
        cloudSaleId,
        postSaleEffectsSyncedAt: nowIso(),
        lastError: null,
      });
      synced.push({ ...item, status: 'synced', cloudSaleId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Offline sync failed');
      updateOfflineSale(tenantId, item.id, {
        status: 'failed',
        lastError: message,
      });
      failed.push({ ...item, status: 'failed', lastError: message });
      if (isOfflineLikeError(error)) break;
    }
  }

  compactSyncedItems(tenantId);
  return {
    synced,
    failed,
    pending: countPendingOfflineSales(tenantId),
  };
}
