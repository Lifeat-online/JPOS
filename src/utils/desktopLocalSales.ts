import { type OfflineSaleQueueItem } from './offlineSales';
import { readCachedPackageLimits } from './packageCapabilityCache';
import { getDesktopRuntimeInfo, readPersistentItem, writePersistentItem } from './runtimeStorage';

export interface DesktopLocalSaleRecord {
  id: string;
  tenantId: string;
  localReceiptNumber: string;
  method: string;
  total: number;
  status: 'queued' | 'syncing' | 'synced' | 'failed' | 'dismissed';
  attempts: number;
  createdAt: string;
  updatedAt: string;
  cloudSaleId?: string | null;
  lastError?: string | null;
}

const DESKTOP_LOCAL_SALES_VERSION = 1;

function desktopLocalSalesKey(tenantId: string) {
  return `masepos-desktop-local-sales:v${DESKTOP_LOCAL_SALES_VERSION}:${tenantId}`;
}

export function isPremiumDesktopLocalSalesEnabled(tenantId: string) {
  const runtime = getDesktopRuntimeInfo();
  const packageLimits = readCachedPackageLimits(tenantId);
  return Boolean(runtime?.isDesktop && packageLimits?.offline?.fullOffline);
}

export function listDesktopLocalSales(tenantId: string): DesktopLocalSaleRecord[] {
  if (!isPremiumDesktopLocalSalesEnabled(tenantId)) return [];
  try {
    const raw = readPersistentItem(desktopLocalSalesKey(tenantId));
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDesktopLocalSales(tenantId: string, items: DesktopLocalSaleRecord[]) {
  if (!isPremiumDesktopLocalSalesEnabled(tenantId)) return;
  writePersistentItem(desktopLocalSalesKey(tenantId), JSON.stringify(items));
}

export function syncDesktopLocalSale(item: OfflineSaleQueueItem) {
  if (!item.tenantId || !isPremiumDesktopLocalSalesEnabled(item.tenantId)) return;

  const items = listDesktopLocalSales(item.tenantId);
  const nextStatus: DesktopLocalSaleRecord['status'] =
    item.status === 'pending'
      ? 'queued'
      : item.status === 'syncing'
      ? 'syncing'
      : item.status === 'synced'
      ? 'synced'
      : 'failed';

  const record: DesktopLocalSaleRecord = {
    id: item.id,
    tenantId: item.tenantId,
    localReceiptNumber: item.localReceiptNumber,
    method: item.method,
    total: Number(item.saleData?.total || 0),
    status: nextStatus,
    attempts: Number(item.attempts || 0),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    cloudSaleId: item.cloudSaleId || null,
    lastError: item.lastError || null,
  };

  const existingIndex = items.findIndex((entry) => entry.id === item.id);
  if (existingIndex >= 0) {
    items[existingIndex] = { ...items[existingIndex], ...record };
  } else {
    items.unshift(record);
  }
  writeDesktopLocalSales(item.tenantId, items.slice(0, 500));
}

export function dismissDesktopLocalSale(tenantId: string, itemId: string) {
  if (!isPremiumDesktopLocalSalesEnabled(tenantId)) return;
  const items = listDesktopLocalSales(tenantId);
  const next = items.map((item) => (
    item.id === itemId
      ? { ...item, status: 'dismissed' as const, updatedAt: new Date().toISOString() }
      : item
  ));
  writeDesktopLocalSales(tenantId, next);
}
