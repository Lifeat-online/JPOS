/**
 * useAuth — JWT-based authentication hook (MariaDB backend).
 * Replaces the previous Firebase Google auth.
 *
 * Stored in localStorage:
 *   jpos_access_token   — short-lived access token (8h)
 *   jpos_refresh_token  — long-lived refresh token (7d)
 *   jpos_user           — serialised user object
 */
import { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

export interface JwtUser {
  id: string;
  email: string;
  emailVerified?: boolean;
  name: string;
  role: string;
  tenantId: string;
  tenantName?: string;
  // Shape expected by App.tsx / UserMenu (Firebase-compat shims)
  uid: string;
  displayName: string | null;
  photoURL: string | null;
}

interface LoginCredentials {
  email: string;
  password: string;
  tenantId?: string;
}

interface AuthState {
  user: JwtUser | null;
  authLoading: boolean;
  error: string | null;
}

// ── Token storage helpers ──────────────────────────────────────────────────

const KEYS = {
  ACCESS:  'jpos_access_token',
  REFRESH: 'jpos_refresh_token',
  USER:    'jpos_user',
} as const;

let refreshPromise: Promise<boolean> | null = null;

function getStoredUser(): JwtUser | null {
  try {
    const raw = localStorage.getItem(KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistSession(accessToken: string, refreshToken: string, user: JwtUser) {
  localStorage.setItem(KEYS.ACCESS,  accessToken);
  localStorage.setItem(KEYS.REFRESH, refreshToken);
  localStorage.setItem(KEYS.USER,    JSON.stringify(user));
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
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        clearSession();
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
    return () => window.removeEventListener('jpos:auth-cleared', onAuthCleared);
  }, []);

  // ── Login ────────────────────────────────────────────────────────────────

  /**
   * login() can be called two ways:
   *  1. login()                   — triggers the LoginView modal (no-op here; App handles UI)
   *  2. login(email, password)    — performs the actual API call
   */
  const login = useCallback(async (credentials?: LoginCredentials): Promise<void> => {
    // If called without credentials, App.tsx sets loginMode which shows the LoginView.
    // The actual auth is performed by loginWithCredentials below.
    if (!credentials) return;

    setState(s => ({ ...s, authLoading: true, error: null }));

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      const data = await res.json();

      if (!res.ok) {
        setState(s => ({ ...s, authLoading: false, error: data.error || 'Login failed' }));
        return;
      }

      const user: JwtUser = {
        ...data.user,
        // Firebase-compat shims so App.tsx doesn't need changes
        uid:         data.user.id,
        displayName: data.user.name,
        photoURL:    null,
      };

      persistSession(data.accessToken, data.refreshToken, user);
      setState({ user, authLoading: false, error: null });

    } catch {
      setState(s => ({ ...s, authLoading: false, error: 'Network error. Check server.' }));
    }
  }, []);

  // ── Logout ───────────────────────────────────────────────────────────────

  const logout = useCallback(async (): Promise<void> => {
    const accessToken = localStorage.getItem(KEYS.ACCESS);
    if (accessToken) {
      // Best-effort server logout (fire-and-forget)
      fetch('/api/auth/logout', {
        method:  'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
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
    logout,
    clearError,
  };
}
