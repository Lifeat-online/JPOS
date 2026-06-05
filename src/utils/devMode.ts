/**
 * devMode — single source of truth for the dev-bootstrap backdoor gate.
 *
 * In production builds (Railway/Hetzner deploys), VITE_ENABLE_DEV_BOOTSTRAP
 * is unset / false, and the hardcoded dev email is treated as a normal
 * staff account: no implicit dev role, no implicit tenant assignment.
 *
 * In local dev / staging, set VITE_ENABLE_DEV_BOOTSTRAP=true in .env.local
 * to restore the dev short-circuits (legacy behaviour).
 */
const RAW = (import.meta.env.VITE_ENABLE_DEV_BOOTSTRAP ?? '').toString().trim().toLowerCase();
export const DEV_BOOTSTRAP_ENABLED = RAW === 'true' || RAW === '1' || RAW === 'yes';

export const DEV_EMAIL = 'jameskoen78@gmail.com';
export const DEV_TENANT_ID = 'tenant1';

export function isDevEmail(value: unknown): boolean {
  if (!DEV_BOOTSTRAP_ENABLED) return false;
  return String(value || '').trim().toLowerCase() === DEV_EMAIL;
}
