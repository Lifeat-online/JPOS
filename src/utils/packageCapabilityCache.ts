import type { TenantPackageLimitsResponse } from '../api';
import { readPersistentItem, writePersistentItem } from './runtimeStorage';

const PACKAGE_CAPABILITY_CACHE_VERSION = 1;

export function packageCapabilityCacheKey(tenantId: string) {
  return `masepos-package-capability:v${PACKAGE_CAPABILITY_CACHE_VERSION}:${tenantId}`;
}

export function readCachedPackageLimits(tenantId: string): TenantPackageLimitsResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = readPersistentItem(packageCapabilityCacheKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as TenantPackageLimitsResponse : null;
  } catch {
    return null;
  }
}

export function writeCachedPackageLimits(tenantId: string, limits: TenantPackageLimitsResponse) {
  if (typeof window === 'undefined') return;
  try {
    writePersistentItem(packageCapabilityCacheKey(tenantId), JSON.stringify(limits));
  } catch {
    // Capability cache is best-effort only.
  }
}
