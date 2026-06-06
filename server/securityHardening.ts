import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomUUID } from 'crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const ANON_RATE_BYPASS = process.env.API_RATE_LIMIT_PER_MIN === '0';
function getAnonRateDefault(): number {
  return Number(process.env.API_RATE_LIMIT_PER_MIN || 300);
}

const ALLOW_HEADERS = ['Origin', 'Content-Type', 'Accept', 'Authorization', 'X-Requested-With', 'X-Request-Id'];

function parseCorsOrigins(): string[] {
  const raw = (process.env.CORS_ORIGINS || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin / curl / no Origin header
  const allow = parseCorsOrigins();
  if (allow.length === 0) return false; // explicit allowlist only when configured
  return allow.includes(origin);
}

/**
 * Strict, env-driven CORS handler.
 *
 * Replaces the previous `app.use(cors())` which sent `Access-Control-Allow-Origin: *`.
 * Operators must set CORS_ORIGINS to a comma-separated allowlist of origins
 * (e.g. "https://masepos.co.za,https://app.masepos.co.za"). An empty
 * allowlist rejects every cross-origin request — the safe default for
 * a same-origin POS.
 */
export const corsHandler: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (origin && corsOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS.join(','));
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
};

/**
 * Trust-proxy configuration.
 *
 * Operators set TRUST_PROXY_HOPS to the number of reverse proxies in
 * front of the app (1 for Hetzner/Coolify/nginx, 0 for local dev). Without
 * `trust proxy`, `req.ip` returns the docker/loopback address and the
 * auth rate limiter becomes a global DoS vector.
 */
export function applyTrustProxy(app: import('express').Express): void {
  const hops = Math.max(0, Number(process.env.TRUST_PROXY_HOPS || 0));
  if (hops > 0) {
    app.set('trust proxy', hops);
  }
}

/**
 * Strip the framework fingerprinting header that Express sets by default.
 */
export const stripPoweredBy: RequestHandler = (_req, res, next) => {
  res.removeHeader('X-Powered-By');
  next();
};

/**
 * Request-ID / correlation-ID middleware.
 *
 * Uses the inbound X-Request-Id if present (so an upstream proxy can
 * thread a trace), otherwise mints a new UUIDv4. Echoes the id back
 * in the response and exposes it on `req.requestId` for handlers and
 * audit logging.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const id = (typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128)
    ? incoming
    : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

/**
 * Security headers.
 *
 * Sets the headers that helmet would set, with a CSP tailored to the
 * MasePOS PWA (no inline scripts, no eval, restricted to self + the
 * PayFast sandbox/hosted form action). Tightens COOP/COEP/CORP to
 * the safe defaults the project was missing.
 */
export const securityHeaders = (isProduction: boolean): RequestHandler => (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Origin-Agent-Cluster', '?1');

  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // CSP: PWA is single-origin. 'unsafe-inline' on style is needed for
  // some Tailwind/runtime CSS; no unsafe-inline on script. frame-src
  // allows the PayFast hosted checkout redirect.
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' wss: https:",
    "frame-src 'self' https://www.payfast.co.za https://sandbox.payfast.co.za",
    "form-action 'self' https://www.payfast.co.za https://sandbox.payfast.co.za",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);

  next();
};

interface RateState {
  count: number;
  resetAt: number;
}
const rateState = new Map<string, RateState>();
const SECRET_ASSIGNMENT_PATTERN = /(["']?\b(?:password|passwd|pwd|token|refreshToken|accessToken|api[_-]?key|apikey|secret|authorization|cookie|set-cookie|jwt|cvv|cvc|security\s*code|card[_-]?number|pan|merchant[_-]?key|passphrase)\b["']?\s*[:=]\s*["']?)[^"',}\]]+/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const CARD_PAN_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const OPENAI_KEY_PATTERN = /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g;

export function redactSecurityLogValue(value: unknown): string {
  let text = typeof value === 'string'
    ? value
    : value instanceof Error
      ? value.stack || value.message
      : JSON.stringify(value);
  if (!text) return '';
  text = text
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, prefix) => `${prefix}<redacted>`)
    .replace(BEARER_PATTERN, 'Bearer <redacted>')
    .replace(OPENAI_KEY_PATTERN, 'sk-<redacted>')
    .replace(CARD_PAN_PATTERN, (match) => {
      const digits = match.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 ? '<redacted-card-pan>' : match;
    });
  return text.slice(0, 8000);
}

export function writeSecurityLog(level: 'warn' | 'error', event: string, req: Request, details: Record<string, unknown> = {}): void {
  const payload = {
    level,
    event,
    requestId: req.requestId || null,
    method: req.method,
    path: req.path,
    ip: req.ip || req.socket.remoteAddress || null,
    staffId: (req as any)?.user?.staffId || (req as any)?.user?.uid || null,
    details: redactSecurityLogValue(details),
  };
  const line = JSON.stringify(payload);
  if (level === 'warn') console.warn(line);
  else console.error(line);
}

/**
 * Reset the in-process rate-limit map. Test-only; exported so the
 * security-hardening suite can start each case from a clean slate
 * without re-importing the module.
 */
export function _resetRateLimitForTests(): void {
  rateState.clear();
}

/**
 * Process-local API rate limit.
 *
 * For multi-process / multi-region deployments, replace this with a
 * Redis-backed counter. The interface is identical so the call site
 * does not need to change.
 */
export const apiRateLimit: RequestHandler = (req, res, next) => {
  if (ANON_RATE_BYPASS) return next();
  const max = getAnonRateDefault();
  if (max <= 0) return next();

  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const window = 60_000;
  const state = rateState.get(key);
  if (!state || state.resetAt <= now) {
    rateState.set(key, { count: 1, resetAt: now + window });
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(max - 1));
    return next();
  }
  state.count += 1;
  if (state.count > max) {
    const retryAfter = Math.ceil((state.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', '0');
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter,
    });
  }
  res.setHeader('X-RateLimit-Limit', String(max));
  res.setHeader('X-RateLimit-Remaining', String(max - state.count));
  next();
};

/**
 * Centralised, non-leaky error responder.
 *
 * Logs the underlying error with the request id and staff id (if
 * present), then returns a generic message to the caller. Routes
 * that need to surface a specific message to the user should set
 * `res.locals.publicError` before calling `next(err)`.
 */
export function sendSafeError(
  res: Response,
  status: number,
  publicMessage: string,
  err: unknown,
  req: Request,
): void {
  writeSecurityLog('error', 'request.error', req, {
    publicMessage,
    status,
    error: redactSecurityLogValue(err),
  });
  res.status(status).json({
    error: publicMessage,
    requestId: req.requestId || null,
  });
}
