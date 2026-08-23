import jwt, { type SignOptions, type VerifyOptions } from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const PLACEHOLDER_JWT_SECRET = "REPLACE_WITH_128_CHAR_RANDOM_STRING";

function getJwtSecret() {
  const jwtSecret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === "production";
  const isPlaceholder = !jwtSecret || jwtSecret === PLACEHOLDER_JWT_SECRET;

  if (jwtSecret && jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long");
  }

  if (isPlaceholder) {
    if (isProduction) {
      throw new Error("JWT_SECRET environment variable is required for security");
    }

    console.warn("JWT_SECRET is not configured. Using an ephemeral development secret.");
    return `dev-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  }

  return jwtSecret;
}

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '8h') as SignOptions['expiresIn'];
const REFRESH_TOKEN_EXPIRES_IN = (process.env.REFRESH_TOKEN_EXPIRES_IN || '7d') as SignOptions['expiresIn'];
export const DEV_EMAIL = 'dev@masepos.local';
export const DEV_TENANT_ID = 'tenant1';

// Dev-bootstrap backdoor is OFF by default. Set ENABLE_DEV_BOOTSTRAP=true
// in development env only — never on hosted production. When disabled,
// isDevEmail() always returns false so the hardcoded dev account gets
// no special role/tenant and is treated as a normal staff member.
function isDevBootstrapEnabled(): boolean {
  const raw = String(process.env.ENABLE_DEV_BOOTSTRAP || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email: string;
        name: string;
        tenantId: string;
        role: string;
        staffId: string;
      };
    }
  }
}

export type AuthTokenPayload = {
  uid: string;
  email: string;
  name: string;
  tenantId: string;
  role: string;
  staffId: string;
  // Token-type discriminator: access tokens carry no "type" (or "access");
  // refresh tokens always carry "refresh". verifyToken() rejects refresh
  // tokens so a stolen refresh token cannot be replayed as a Bearer token.
  type?: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}

export function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function isDevEmail(value: unknown): boolean {
  if (!isDevBootstrapEnabled()) return false;
  return normalizeEmail(value) === DEV_EMAIL;
}

export function devBootstrapEnabled(): boolean {
  return isDevBootstrapEnabled();
}

export function normalizeAuthTokenPayload(payload: AuthTokenPayload): AuthTokenPayload {
  if (!isDevEmail(payload.email)) {
    return payload;
  }

  return {
    ...payload,
    email: DEV_EMAIL,
    tenantId: DEV_TENANT_ID,
    role: 'dev',
  };
}

export function generateAccessToken(payload: AuthTokenPayload): string {
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
  return jwt.sign({ ...payload, type: 'access' }, JWT_SECRET, options);
}

export function generateRefreshToken(payload: AuthTokenPayload): string {
  const options: SignOptions = { expiresIn: REFRESH_TOKEN_EXPIRES_IN };
  return jwt.sign({ ...payload, type: 'refresh', jti: crypto.randomUUID() }, JWT_SECRET, options);
}

function decodeVerified(token: string): AuthTokenPayload | null {
  try {
    const options: VerifyOptions = { complete: false };
    return normalizeAuthTokenPayload(jwt.verify(token, JWT_SECRET) as AuthTokenPayload);
  } catch (error) {
    return null;
  }
}

// Verifies access tokens. Explicitly rejects refresh tokens so they can
// never be used as Bearer credentials against protected routes.
export function verifyToken(token: string): AuthTokenPayload | null {
  const payload = decodeVerified(token);
  if (!payload || payload.type === 'refresh') {
    return null;
  }
  return payload;
}

// Verifies refresh tokens (must carry type: "refresh"). Used only by the
// token refresh endpoint.
export function verifyRefreshToken(token: string): AuthTokenPayload | null {
  const payload = decodeVerified(token);
  if (!payload || payload.type !== 'refresh' || !payload.jti) {
    return null;
  }
  return payload;
}

// Middleware to protect routes
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  req.user = payload;
  next();
}

// Optional auth - doesn't fail if no token
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}
