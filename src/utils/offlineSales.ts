import { apiPut, createSale, reportOfflineSyncIssue } from '../api';
import { WALLET_ONLINE_REQUIRED_MESSAGE } from './offlineGuards';

export type CheckoutMethod = 'cash' | 'payfast' | 'card' | 'wallet' | 'account' | 'split';
export type OfflineSaleQueueStatus = 'pending' | 'syncing' | 'synced' | 'failed';
export type OfflineSyncEventType = 'sale.create' | 'sale.update';
export type OfflineSyncConflictType =
  | 'negative_stock_after_sync'
  | 'duplicate_local_receipt'
  | 'duplicate_table_or_tab'
  | 'duplicate_customer_order'
  | 'sync_failure';

export interface OfflineSyncEventEnvelope {
  id: string;
  type: OfflineSyncEventType;
  version: 1;
  tenantId: string;
  aggregateType: 'sale';
  aggregateId: string;
  idempotencyKey: string;
  localReceiptNumber: string;
  deviceId: string;
  registerId?: string | null;
  createdAt: string;
  payload: {
    operation: 'create_sale' | 'update_sale';
    targetSaleId?: string | null;
    saleData: any;
  };
}

export interface OfflineSaleQueueItem {
  id: string;
  tenantId: string;
  operation: 'create_sale' | 'update_sale';
  targetSaleId?: string | null;
  localReceiptNumber: string;
  deviceId: string;
  syncEvent?: OfflineSyncEventEnvelope | null;
  syncPriority?: number;
  syncBatchId?: string | null;
  syncSequence?: number | null;
  lastAttemptedAt?: string | null;
  nextRetryAt?: string | null;
  lastSyncedBatchId?: string | null;
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
  managerReviewReportedAt?: string | null;
  conflictType?: OfflineSyncConflictType | null;
  recommendedAction?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineSyncBatchSummary {
  batchId: string | null;
  attempted: number;
  synced: number;
  failed: number;
  skipped: number;
  pending: number;
  startedAt: string;
  completedAt: string;
  nextRetryAt?: string | null;
  message: string;
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
const DEFAULT_SYNC_BATCH_SIZE = 10;
const MAX_SYNC_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 15 * 60_000;

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

function receiptScope(value?: string | null) {
  const cleaned = String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  return (cleaned || 'LOCAL').slice(-6).padStart(6, 'X');
}

function nextLocalReceiptNumber(tenantId: string, deviceId: string, registerId?: string | null) {
  const registerPrefix = receiptScope(registerId || deviceId);
  const deviceSuffix = receiptScope(deviceId);
  if (!storageAvailable()) return `OFF-${registerPrefix}-${deviceSuffix}-${Date.now()}`;
  const key = `masepos-offline-receipt-seq:${tenantId}:${registerPrefix}:${deviceId}`;
  const next = Number(window.localStorage.getItem(key) || '0') + 1;
  window.localStorage.setItem(key, String(next));
  return `OFF-${registerPrefix}-${deviceSuffix}-${String(next).padStart(6, '0')}`;
}

function notifyQueueChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
  }
}

export function offlineSalesChangedEventName() {
  return QUEUE_EVENT;
}

function getOfflineSyncPriority(operation: OfflineSaleQueueItem['operation'], status: OfflineSaleQueueStatus) {
  const operationWeight = operation === 'create_sale' ? 0 : 100;
  const statusWeight = status === 'pending' ? 0 : status === 'syncing' ? 10 : status === 'failed' ? 20 : 99;
  return operationWeight + statusWeight;
}

function buildOfflineSyncEvent(input: {
  id: string;
  tenantId: string;
  operation: OfflineSaleQueueItem['operation'];
  targetSaleId?: string | null;
  localReceiptNumber: string;
  deviceId: string;
  cashSessionId?: string | null;
  saleData: any;
  createdAt: string;
}): OfflineSyncEventEnvelope {
  return {
    id: `sync_event_${input.id}`,
    type: input.operation === 'create_sale' ? 'sale.create' : 'sale.update',
    version: 1,
    tenantId: input.tenantId,
    aggregateType: 'sale',
    aggregateId: input.targetSaleId || input.localReceiptNumber,
    idempotencyKey: input.id,
    localReceiptNumber: input.localReceiptNumber,
    deviceId: input.deviceId,
    registerId: input.cashSessionId || null,
    createdAt: input.createdAt,
    payload: {
      operation: input.operation,
      targetSaleId: input.targetSaleId || null,
      saleData: input.saleData,
    },
  };
}

function normalizeOfflineSaleQueueItem(raw: any): OfflineSaleQueueItem {
  const operation = raw?.operation === 'update_sale' ? 'update_sale' : 'create_sale';
  const status: OfflineSaleQueueStatus = raw?.status === 'syncing' || raw?.status === 'synced' || raw?.status === 'failed' ? raw.status : 'pending';
  const createdAt = raw?.createdAt || nowIso();
  const id = raw?.id || `offline_sale_${Date.now()}_${randomToken()}`;
  const saleData = raw?.saleData || raw?.syncEvent?.payload?.saleData || {};
  const item = {
    ...raw,
    id,
    tenantId: raw?.tenantId || '',
    operation,
    targetSaleId: raw?.targetSaleId || null,
    localReceiptNumber: raw?.localReceiptNumber || saleData.localReceiptNumber || id,
    deviceId: raw?.deviceId || saleData.deviceId || 'device_unknown',
    method: raw?.method || saleData.paymentMethod || 'cash',
    saleData,
    status,
    attempts: Number(raw?.attempts || 0),
    cloudSaleId: raw?.cloudSaleId || null,
    saleSyncedAt: raw?.saleSyncedAt || null,
    postSaleEffectsSyncedAt: raw?.postSaleEffectsSyncedAt || null,
    managerReviewReportedAt: raw?.managerReviewReportedAt || null,
    conflictType: raw?.conflictType || null,
    recommendedAction: raw?.recommendedAction || null,
    syncPriority: Number.isFinite(Number(raw?.syncPriority)) ? Number(raw.syncPriority) : getOfflineSyncPriority(operation, status),
    syncBatchId: raw?.syncBatchId || null,
    syncSequence: raw?.syncSequence ?? null,
    lastAttemptedAt: raw?.lastAttemptedAt || null,
    nextRetryAt: raw?.nextRetryAt || null,
    lastSyncedBatchId: raw?.lastSyncedBatchId || null,
    lastError: raw?.lastError || null,
    createdAt,
    updatedAt: raw?.updatedAt || createdAt,
  } as OfflineSaleQueueItem;
  item.syncEvent = raw?.syncEvent || buildOfflineSyncEvent({
    id: item.id,
    tenantId: item.tenantId,
    operation: item.operation,
    targetSaleId: item.targetSaleId || null,
    localReceiptNumber: item.localReceiptNumber,
    deviceId: item.deviceId,
    cashSessionId: item.cashSessionId || null,
    saleData: item.saleData,
    createdAt: item.createdAt,
  });
  return item;
}

export function listOfflineSales(tenantId: string): OfflineSaleQueueItem[] {
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(queueKey(tenantId)) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeOfflineSaleQueueItem) : [];
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
    return { allowed: false, reason: WALLET_ONLINE_REQUIRED_MESSAGE };
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

const offlineSyncActions: Record<OfflineSyncConflictType, string> = {
  negative_stock_after_sync: 'Review the synced sale against current stock, approve the shortage, adjust stock, or create a receiving/count correction.',
  duplicate_local_receipt: 'Check whether this local receipt already exists in cloud sales before retrying or dismissing the local copy.',
  duplicate_table_or_tab: 'Compare the offline sale with the open table/tab and merge, close, or reassign the order before retrying.',
  duplicate_customer_order: 'Check the customer/order history for a duplicate sale before retrying or dismissing the local copy.',
  sync_failure: 'Review the error, retry once online, then escalate if the same device keeps failing.',
};

function isOfflineSyncConflictType(value: unknown): value is OfflineSyncConflictType {
  return typeof value === 'string' && value in offlineSyncActions;
}

export function classifyOfflineSyncIssue(message: unknown, fallbackConflictType?: string | null) {
  const text = String(message || '').toLowerCase();
  let conflictType: OfflineSyncConflictType = isOfflineSyncConflictType(fallbackConflictType)
    ? fallbackConflictType
    : 'sync_failure';

  if (!isOfflineSyncConflictType(fallbackConflictType)) {
    if (/negative stock|insufficient stock|out of stock|stock.*conflict|below zero|stock short/.test(text)) {
      conflictType = 'negative_stock_after_sync';
    } else if (/(local receipt|receipt).*(duplicate|already|conflict)|(duplicate|already|conflict).*(local receipt|receipt)/.test(text)) {
      conflictType = 'duplicate_local_receipt';
    } else if (/(table|tab).*(duplicate|already|open|conflict)|(duplicate|already|open|conflict).*(table|tab)/.test(text)) {
      conflictType = 'duplicate_table_or_tab';
    } else if (/(customer|order).*(duplicate|already|open|conflict)|(duplicate|already|open|conflict).*(customer|order)/.test(text)) {
      conflictType = 'duplicate_customer_order';
    } else if (/duplicate|already exists|conflict/.test(text)) {
      conflictType = 'duplicate_local_receipt';
    }
  }

  return {
    conflictType,
    recommendedAction: offlineSyncActions[conflictType],
  };
}

export function enqueueOfflineSale(input: EnqueueOfflineSaleInput) {
  const items = listOfflineSales(input.tenantId);
  const deviceId = getOrCreateOfflineDeviceId(input.tenantId, input.staffId);
  const id = `offline_sale_${Date.now()}_${randomToken()}`;
  const localReceiptNumber = nextLocalReceiptNumber(input.tenantId, deviceId, input.cashSessionId || null);
  const createdAt = nowIso();
  const operation = input.targetSaleId ? 'update_sale' : 'create_sale';
  const saleData = {
    ...input.saleData,
    offlineEventId: id,
    localReceiptNumber,
    deviceId,
    syncSource: 'offline',
  };
  const syncEvent = buildOfflineSyncEvent({
    id,
    tenantId: input.tenantId,
    operation,
    targetSaleId: input.targetSaleId || null,
    localReceiptNumber,
    deviceId,
    cashSessionId: input.cashSessionId || null,
    saleData,
    createdAt,
  });
  const item: OfflineSaleQueueItem = {
    id,
    tenantId: input.tenantId,
    operation,
    targetSaleId: input.targetSaleId || null,
    localReceiptNumber,
    deviceId,
    syncEvent,
    syncPriority: getOfflineSyncPriority(operation, 'pending'),
    syncBatchId: null,
    syncSequence: null,
    lastAttemptedAt: null,
    nextRetryAt: null,
    lastSyncedBatchId: null,
    method: input.method,
    saleData,
    cashSessionId: input.cashSessionId || null,
    staffId: input.staffId || null,
    staffName: input.staffName || null,
    status: 'pending',
    attempts: 0,
    cloudSaleId: null,
    saleSyncedAt: null,
    postSaleEffectsSyncedAt: null,
    managerReviewReportedAt: null,
    conflictType: null,
    recommendedAction: null,
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
    isOfflineSale: true,
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

export function retryOfflineSale(tenantId: string, itemId: string) {
  updateOfflineSale(tenantId, itemId, {
    status: 'pending',
    attempts: 0,
    syncBatchId: null,
    syncSequence: null,
    lastAttemptedAt: null,
    nextRetryAt: null,
    managerReviewReportedAt: null,
    conflictType: null,
    recommendedAction: null,
    lastError: null,
  });
}

export function dismissOfflineSale(tenantId: string, itemId: string) {
  const items = listOfflineSales(tenantId);
  writeOfflineSales(tenantId, items.filter(item => item.id !== itemId));
}

function compactSyncedItems(tenantId: string) {
  const items = listOfflineSales(tenantId);
  const synced = items.filter(item => item.status === 'synced').slice(0, 20);
  const active = items.filter(item => item.status !== 'synced');
  writeOfflineSales(tenantId, [...active, ...synced]);
}

async function reportSyncIssueForReview(tenantId: string, item: OfflineSaleQueueItem, message: string, attempts: number) {
  const classification = classifyOfflineSyncIssue(message, item.conflictType);
  if (item.managerReviewReportedAt) {
    if (!item.conflictType || !item.recommendedAction) {
      updateOfflineSale(tenantId, item.id, classification);
    }
    return;
  }
  try {
    await reportOfflineSyncIssue(tenantId, {
      offlineEventId: item.id,
      localReceiptNumber: item.localReceiptNumber,
      deviceId: item.deviceId,
      operation: item.operation,
      method: item.method,
      status: item.status,
      attempts,
      message,
      cloudSaleId: item.cloudSaleId || null,
      targetSaleId: item.targetSaleId || null,
      staffId: item.staffId || null,
      staffName: item.staffName || null,
      total: Number(item.saleData?.total || 0),
      conflictType: classification.conflictType,
      recommendedAction: classification.recommendedAction,
      syncBatchId: item.syncBatchId || null,
      syncSequence: item.syncSequence ?? null,
    });
    updateOfflineSale(tenantId, item.id, {
      managerReviewReportedAt: nowIso(),
      conflictType: classification.conflictType,
      recommendedAction: classification.recommendedAction,
    });
  } catch (reportError) {
    console.warn('Offline sync issue could not be sent to Action Center:', reportError);
  }
}

function getRetryDelayMs(attempts: number) {
  const exponent = Math.max(0, Math.min(8, attempts - 1));
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** exponent));
}

function getNextRetryAt(attempts: number, from = new Date()) {
  return new Date(from.getTime() + getRetryDelayMs(attempts)).toISOString();
}

function isRetryWindowOpen(item: OfflineSaleQueueItem, now: Date, force: boolean) {
  if (force) return true;
  if (!item.nextRetryAt) return true;
  const retryTime = new Date(item.nextRetryAt).getTime();
  return !Number.isFinite(retryTime) || retryTime <= now.getTime();
}

function compareOfflineSyncItems(a: OfflineSaleQueueItem, b: OfflineSaleQueueItem) {
  const priorityCmp = (a.syncPriority ?? getOfflineSyncPriority(a.operation, a.status)) - (b.syncPriority ?? getOfflineSyncPriority(b.operation, b.status));
  if (priorityCmp !== 0) return priorityCmp;
  const createdCmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  if (createdCmp !== 0) return createdCmp;
  return a.id.localeCompare(b.id);
}

function getSalePayload(item: OfflineSaleQueueItem, batchId: string, sequence: number) {
  const eventPayload = item.syncEvent?.payload?.saleData || item.saleData || {};
  return {
    ...eventPayload,
    offlineEventId: item.syncEvent?.idempotencyKey || item.id,
    localReceiptNumber: item.localReceiptNumber,
    deviceId: item.deviceId,
    syncSource: 'offline',
    syncEventType: item.syncEvent?.type || (item.operation === 'create_sale' ? 'sale.create' : 'sale.update'),
    syncEventVersion: item.syncEvent?.version || 1,
    syncBatchId: batchId,
    syncSequence: sequence,
  };
}

function buildSyncSummary(input: {
  batchId: string | null;
  attempted: number;
  synced: number;
  failed: number;
  skipped: number;
  pending: number;
  startedAt: string;
  completedAt: string;
  nextRetryAt?: string | null;
}): OfflineSyncBatchSummary {
  const parts: string[] = [];
  if (input.synced > 0) parts.push(`${input.synced} sale${input.synced === 1 ? '' : 's'} synced`);
  if (input.failed > 0) parts.push(`${input.failed} need${input.failed === 1 ? 's' : ''} review`);
  if (input.skipped > 0) parts.push(`${input.skipped} waiting for retry`);
  if (parts.length === 0) parts.push(input.pending > 0 ? `${input.pending} queued` : 'Offline queue is clear');
  return {
    ...input,
    message: parts.join(', '),
  };
}

export async function syncQueuedOfflineSales(tenantId: string, options: { batchSize?: number; force?: boolean } = {}) {
  const startedAt = nowIso();
  const now = new Date();
  const force = Boolean(options.force);
  const batchSize = Math.max(1, Math.floor(options.batchSize || DEFAULT_SYNC_BATCH_SIZE));
  const candidates = listOfflineSales(tenantId)
    .filter(item => item.status === 'pending' || item.status === 'failed' || item.status === 'syncing')
    .sort(compareOfflineSyncItems);
  const dueCandidates = candidates.filter(item => isRetryWindowOpen(item, now, force));
  const skippedForBackpressure = candidates.length - dueCandidates.length;
  const batch = dueCandidates.slice(0, batchSize);
  const skippedForBatchLimit = Math.max(0, dueCandidates.length - batch.length);
  const batchId = batch.length > 0 ? `offline_batch_${Date.now()}_${randomToken()}` : null;

  const synced: OfflineSaleQueueItem[] = [];
  const failed: OfflineSaleQueueItem[] = [];
  let sequence = 0;

  for (const item of batch) {
    sequence += 1;
    // Retry backoff: skip items with 5+ attempts (likely conflict, not transient)
    if (item.attempts >= MAX_SYNC_ATTEMPTS) {
      const message = 'Max sync attempts reached. Manual review required.';
      const classification = classifyOfflineSyncIssue(message, item.conflictType);
      updateOfflineSale(tenantId, item.id, {
        status: 'failed',
        lastError: message,
        syncBatchId: batchId,
        syncSequence: sequence,
        lastAttemptedAt: nowIso(),
        nextRetryAt: null,
        conflictType: classification.conflictType,
        recommendedAction: classification.recommendedAction,
      });
      const failedItem = { ...item, status: 'failed' as OfflineSaleQueueStatus, lastError: message, syncBatchId: batchId, syncSequence: sequence, ...classification };
      await reportSyncIssueForReview(tenantId, failedItem, message, item.attempts);
      failed.push(failedItem);
      continue;
    }

    const nextAttempts = item.attempts + 1;
    const attemptAt = nowIso();
    updateOfflineSale(tenantId, item.id, {
      status: 'syncing',
      attempts: nextAttempts,
      syncBatchId: batchId,
      syncSequence: sequence,
      lastAttemptedAt: attemptAt,
      lastError: null,
    });

    try {
      let cloudSaleId = item.cloudSaleId || item.targetSaleId || null;
      if (!item.saleSyncedAt || !cloudSaleId) {
        const salePayload = getSalePayload(item, batchId || `offline_batch_${randomToken()}`, sequence);
        if (item.operation === 'update_sale' && item.targetSaleId) {
          const sale = await apiPut<any>(`/api/mariadb/tenants/${tenantId}/sales/${item.targetSaleId}`, salePayload);
          cloudSaleId = sale?.id || item.targetSaleId;
        } else {
          const sale = await createSale(tenantId, salePayload);
          cloudSaleId = sale?.id;
        }
        updateOfflineSale(tenantId, item.id, {
          cloudSaleId,
          saleSyncedAt: nowIso(),
          postSaleEffectsSyncedAt: nowIso(),
          nextRetryAt: null,
        });
      }

      updateOfflineSale(tenantId, item.id, {
        status: 'synced',
        cloudSaleId,
        postSaleEffectsSyncedAt: nowIso(),
        lastSyncedBatchId: batchId,
        nextRetryAt: null,
        lastError: null,
      });
      synced.push({ ...item, status: 'synced', cloudSaleId, lastSyncedBatchId: batchId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Offline sync failed');
      const classification = classifyOfflineSyncIssue(message, item.conflictType);
      const isConflict = classification.conflictType !== 'sync_failure';
      const nextRetryAt = isConflict ? null : getNextRetryAt(nextAttempts, now);
      updateOfflineSale(tenantId, item.id, {
        status: 'failed',
        lastError: message,
        syncBatchId: batchId,
        syncSequence: sequence,
        lastAttemptedAt: attemptAt,
        nextRetryAt,
        conflictType: classification.conflictType,
        recommendedAction: classification.recommendedAction,
      });
      const failedItem = { ...item, attempts: nextAttempts, status: 'failed' as OfflineSaleQueueStatus, lastError: message, syncBatchId: batchId, syncSequence: sequence, nextRetryAt, ...classification };
      if (!isOfflineLikeError(error) || isConflict) {
        await reportSyncIssueForReview(tenantId, failedItem, message, nextAttempts);
      }
      failed.push(failedItem);
      if (isOfflineLikeError(error)) break;
    }
  }

  compactSyncedItems(tenantId);
  const remaining = listOfflineSales(tenantId).filter(item => item.status === 'pending' || item.status === 'failed' || item.status === 'syncing');
  const nextRetryAt = remaining
    .map(item => item.nextRetryAt)
    .filter(Boolean)
    .sort()[0] || null;
  const pending = countPendingOfflineSales(tenantId);
  const completedAt = nowIso();
  const summary = buildSyncSummary({
    batchId,
    attempted: batch.length,
    synced: synced.length,
    failed: failed.length,
    skipped: skippedForBackpressure + skippedForBatchLimit,
    pending,
    startedAt,
    completedAt,
    nextRetryAt,
  });
  return {
    synced,
    failed,
    skipped: skippedForBackpressure + skippedForBatchLimit,
    pending,
    summary,
  };
}
