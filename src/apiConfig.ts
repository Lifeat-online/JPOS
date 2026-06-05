const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const PREFERRED_TARGET_KEY = 'masepos-api-target';

export type DeploymentMode = 'cloud' | 'on_prem' | 'hybrid';
export type ApiTargetKind = 'same-origin' | 'cloud' | 'on-prem';

export interface ApiTarget {
  kind: ApiTargetKind;
  baseUrl: string;
}

function cleanBaseUrl(value: unknown): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

function envValue(key: string): string {
  return cleanBaseUrl((import.meta.env as Record<string, unknown>)[key]);
}

function normalizeDeploymentMode(value: unknown): DeploymentMode | null {
  const text = String(value || '').trim().toLowerCase().replace(/-/g, '_');
  if (text === 'cloud') return 'cloud';
  if (text === 'on_prem' || text === 'onprem' || text === 'local') return 'on_prem';
  if (text === 'hybrid') return 'hybrid';
  return null;
}

function safeLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getDeploymentMode(): DeploymentMode {
  const explicit = normalizeDeploymentMode(import.meta.env.VITE_DEPLOYMENT_MODE);
  if (explicit) return explicit;
  return getOnPremApiBaseUrl() && getCloudApiBaseUrl() ? 'hybrid' : 'cloud';
}

export function getCloudApiBaseUrl(): string {
  return envValue('VITE_CLOUD_API_BASE_URL') || envValue('VITE_API_BASE_URL');
}

export function getOnPremApiBaseUrl(): string {
  return envValue('VITE_ON_PREM_API_BASE_URL');
}

export function getPreferredApiTarget(): ApiTargetKind | null {
  const stored = safeLocalStorage()?.getItem(PREFERRED_TARGET_KEY);
  return stored === 'cloud' || stored === 'on-prem' || stored === 'same-origin' ? stored : null;
}

export function setPreferredApiTarget(target: ApiTargetKind | null) {
  const storage = safeLocalStorage();
  if (!storage) return;
  if (target) storage.setItem(PREFERRED_TARGET_KEY, target);
  else storage.removeItem(PREFERRED_TARGET_KEY);
}

function dedupeTargets(targets: ApiTarget[]) {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.kind}:${target.baseUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getApiTargets(): ApiTarget[] {
  const cloud = getCloudApiBaseUrl();
  const onPrem = getOnPremApiBaseUrl();
  const sameOrigin: ApiTarget = { kind: 'same-origin', baseUrl: '' };
  const cloudTarget: ApiTarget = cloud ? { kind: 'cloud', baseUrl: cloud } : sameOrigin;
  const onPremTarget: ApiTarget = onPrem ? { kind: 'on-prem', baseUrl: onPrem } : sameOrigin;
  const mode = getDeploymentMode();

  if (mode === 'on_prem') return dedupeTargets([onPremTarget]);
  if (mode === 'cloud') return dedupeTargets([cloudTarget]);

  const preferred = getPreferredApiTarget();
  const primary = preferred === 'cloud' ? cloudTarget : preferred === 'same-origin' ? sameOrigin : onPremTarget;
  const secondary = primary.kind === cloudTarget.kind && primary.baseUrl === cloudTarget.baseUrl ? onPremTarget : cloudTarget;
  return dedupeTargets([primary, secondary, sameOrigin]);
}

export function getApiBaseUrl(): string {
  return getApiTargets()[0]?.baseUrl || '';
}

function joinBaseAndPath(baseUrl: string, input: string) {
  if (!baseUrl) return input;
  const path = input.startsWith('/') ? input : `/${input}`;
  return `${baseUrl}${path}`;
}

export function apiUrl(input: RequestInfo | URL): RequestInfo | URL {
  return apiUrls(input)[0] || input;
}

export function apiUrls(input: RequestInfo | URL): Array<RequestInfo | URL> {
  if (typeof input !== 'string') return [input];
  if (!input || ABSOLUTE_URL_RE.test(input)) return [input];
  return getApiTargets().map((target) => joinBaseAndPath(target.baseUrl, input));
}

export function getSocketBaseUrl(): string {
  const socketUrl = cleanBaseUrl(import.meta.env.VITE_SOCKET_URL);
  if (socketUrl) return socketUrl;

  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl) return apiBaseUrl;

  return typeof window !== 'undefined' ? window.location.origin : '';
}
