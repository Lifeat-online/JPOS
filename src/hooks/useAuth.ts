/**
 * useAuth — JWT-based authentication hook (MariaDB backend).
 * Replaces the previous Firebase Google auth.
 *
 * Stored in localStorage:
 *   masepos_access_token   — short-lived access token (8h)
 *   masepos_refresh_token  — long-lived refresh token (7d)
 *   masepos_user           — serialised user object
 */
import { useState, useEffect, useCallback } from 'react';
import { apiUrl } from '../apiConfig';
import { DEV_EMAIL, DEV_TENANT_ID, isDevEmail } from '../utils/devMode';

// ── Types ──────────────────────────────────────────────────────────────────

export interface JwtUser {
  id: string;
  email: string;
  emailVerified?: boolean;
  name: string;
  role: string;
  tenantId: string;
  tenantName?: string;
  twoFactorEnabled?: boolean;
  twoFactorEligible?: boolean;
  twoFactorConfirmedAt?: string | null;
  // Shape expected by App.tsx / UserMenu (Firebase-compat shims)
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}

interface LoginCredentials {
  email: string;
  password: string;
  tenantId?: string;
  twoFactorCode?: string;
}

interface EnrollmentDetails {
  businessName: string;
  ownerName: string;
  email: string;
  password: string;
}

interface AuthState {
  user: JwtUser | null;
  authLoading: boolean;
  error: string | null;
}

export type DemoMode = 'retail' | 'restaurant';

// ── Token storage helpers ──────────────────────────────────────────────────

const KEYS = {
  ACCESS:  'masepos_access_token',
  REFRESH: 'masepos_refresh_token',
  USER:    'masepos_user',
} as const;

let refreshPromise: Promise<boolean> | null = null;

function normalizeAuthUser(user: JwtUser | null): JwtUser | null {
  if (!user) return null;

  const email = String(user.email || '').trim().toLowerCase();
  if (!isDevEmail(email)) return user;

  return {
    ...user,
    id: user.id || user.uid || 'dev',
    uid: user.uid || user.id || 'dev',
    email: DEV_EMAIL,
    role: 'dev',
    tenantId: DEV_TENANT_ID,
    tenantName: user.tenantName || "MasePOS",
    displayName: user.displayName ?? user.name ?? 'Dev',
    photoURL: user.photoURL ?? null,
  };
}

function getStoredUser(): JwtUser | null {
  try {
    const raw = localStorage.getItem(KEYS.USER);
    const user = raw ? normalizeAuthUser(JSON.parse(raw)) : null;
    if (user && raw !== JSON.stringify(user)) {
      localStorage.setItem(KEYS.USER, JSON.stringify(user));
    }
    return user;
  } catch {
    return null;
  }
}

function persistSession(accessToken: string, refreshToken: string, user: JwtUser) {
  const normalizedUser = normalizeAuthUser(user) || user;
  localStorage.setItem(KEYS.ACCESS,  accessToken);
  localStorage.setItem(KEYS.REFRESH, refreshToken);
  localStorage.setItem(KEYS.USER,    JSON.stringify(normalizedUser));
}

function clearSession() {
  localStorage.removeItem(KEYS.ACCESS);
  localStorage.removeItem(KEYS.REFRESH);
  localStorage.removeItem(KEYS.USER);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(KEYS.ACCESS);
}

// ── Token refresh ──────────────────────────────────────────────────────────

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  const refreshToken = localStorage.getItem(KEYS.REFRESH);
  if (!refreshToken) return false;

  refreshPromise = (async () => {
    try {
      const res = await fetch(apiUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        clearSession();
        window.dispatchEvent(new Event('masepos:auth-cleared'));
        window.dispatchEvent(new Event('jpos:auth-cleared'));
        return false;
      }

      const data = await res.json();
      localStorage.setItem(KEYS.ACCESS,  data.accessToken);
      localStorage.setItem(KEYS.REFRESH, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ── Decode JWT (no library needed for reading claims) ──────────────────────

function decodeTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = decodeTokenExpiry(token);
  if (!exp) return true;
  // Consider expired 60s before actual expiry (clock drift buffer)
  return Date.now() / 1000 > exp - 60;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user:        getStoredUser(),
    authLoading: true,
    error:       null,
  });

  // On mount: verify stored token is still valid, refresh if needed
  useEffect(() => {
    const onAuthCleared = () => {
      setState({ user: null, authLoading: false, error: null });
    };

    window.addEventListener('masepos:auth-cleared', onAuthCleared);
    window.addEventListener('jpos:auth-cleared', onAuthCleared);

    const init = async () => {
      const accessToken = localStorage.getItem(KEYS.ACCESS);
      const storedUser  = getStoredUser();

      if (!accessToken || !storedUser) {
        setState({ user: null, authLoading: false, error: null });
        return;
      }

      // Token still valid — keep session
      if (!isTokenExpired(accessToken)) {
        setState({ user: storedUser, authLoading: false, error: null });
        return;
      }

      // Try to refresh
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        setState({ user: storedUser, authLoading: false, error: null });
      } else {
        clearSession();
        setState({ user: null, authLoading: false, error: null });
      }
    };

    init();
    return () => {
      window.removeEventListener('masepos:auth-cleared', onAuthCleared);
      window.removeEventListener('jpos:auth-cleared', onAuthCleared);
    };
  }, []);

  // ── Login ────────────────────────────────────────────────────────────────

  /**
   * login() can be called two ways:
   *  1. login()                   — triggers the LoginView modal (no-op here; App handles UI)
   *  2. login(email, password)    — performs the actual API call
   */
  const persistAuthResponse = useCallback((data: any) => {
    const user: JwtUser = {
      ...data.user,
      // Firebase-compat shims so App.tsx doesn't need changes
      uid:         data.user.id,
      displayName: data.user.name,
      photoURL:    null,
    };
    const normalizedUser = normalizeAuthUser(user) || user;

    persistSession(data.accessToken, data.refreshToken, normalizedUser);
    setState({ user: normalizedUser, authLoading: false, error: null });
  }, []);

  const login = useCallback(async (credentials?: LoginCredentials): Promise<boolean> => {
    // If called without credentials, App.tsx sets loginMode which shows the LoginView.
    // The actual auth is performed by loginWithCredentials below.
    if (!credentials) return false;

    setState(s => ({ ...s, authLoading: true, error: null }));

    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      const data = await res.json();

      if (!res.ok) {
        setState(s => ({ ...s, authLoading: false, error: data.error || 'Login failed' }));
        return false;
      }

      persistAuthResponse(data);
      return true;

    } catch {
      setState(s => ({ ...s, authLoading: false, error: 'Network error. Check server.' }));
      return false;
    }
  }, [persistAuthResponse]);

  const startDemo = useCallback(async (mode: DemoMode = 'restaurant'): Promise<boolean> => {
    setState(s => ({ ...s, authLoading: true, error: null }));
    try {
      const res = await fetch(apiUrl('/api/demo/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState(s => ({ ...s, authLoading: false, error: data.error || 'Unable to start demo' }));
        return false;
      }
      persistAuthResponse(data);
      return true;
    } catch {
      setState(s => ({ ...s, authLoading: false, error: 'Network error. Check server.' }));
      return false;
    }
  }, [persistAuthResponse]);

  const enroll = useCallback(async (details: EnrollmentDetails): Promise<boolean> => {
    setState(s => ({ ...s, authLoading: true, error: null }));
    try {
      const res = await fetch(apiUrl('/api/enroll'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      });
      const data = await res.json();
      if (!res.ok) {
        setState(s => ({ ...s, authLoading: false, error: data.error || 'Unable to start enrollment' }));
        return false;
      }
      persistAuthResponse(data);
      return true;
    } catch {
      setState(s => ({ ...s, authLoading: false, error: 'Network error. Check server.' }));
      return false;
    }
  }, [persistAuthResponse]);

  // ── Logout ───────────────────────────────────────────────────────────────

  const logout = useCallback(async (): Promise<void> => {
    const accessToken = localStorage.getItem(KEYS.ACCESS);
    const refreshToken = localStorage.getItem(KEYS.REFRESH);
    if (accessToken) {
      // Await the server logout so the refresh-token session is
      // actually revoked before we drop the local tokens. If the
      // server is unreachable, fall back to local clear after 3s.
      // Without this, a stolen refresh token stays valid for the full
      // refresh-token window (7d) even after the user clicks "log out".
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 3000);
        const res = await fetch(apiUrl('/api/auth/logout'), {
          method:  'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ refreshToken }),
          signal:  ac.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          // Non-fatal: log + continue. Local session is cleared below.
          // eslint-disable-next-line no-console
          console.warn('Server logout returned', res.status, '- clearing local session anyway');
        }
      } catch {
        // Network error or timeout — clear local session anyway so
        // the user is not stuck logged-in.
      }
    }
    clearSession();
    setState({ user: null, authLoading: false, error: null });
  }, []);

  // ── Expose a clearError helper ────────────────────────────────────────────

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  return {
    user:        state.user,
    authLoading: state.authLoading,
    error:       state.error,
    login,
    startDemo,
    enroll,
    logout,
    clearError,
  };
}
