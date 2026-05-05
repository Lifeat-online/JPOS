import { describe, it, expect, vi } from 'vitest';
import { generateAccessToken, generateRefreshToken, verifyToken, requireAuth, optionalAuth } from '../../server/auth-middleware.ts';

describe('auth-middleware', () => {
  it('generates and verifies access tokens', () => {
    const payload = { uid: 'staff_1', email: 'test@example.com', name: 'Test User', tenantId: 'tenant_1', role: 'admin', staffId: 'staff_1' };
    const token = generateAccessToken(payload);
    const decoded = verifyToken(token);

    expect(decoded).toMatchObject(payload);
  });

  it('rejects invalid tokens', () => {
    const decoded = verifyToken('not-a-token');
    expect(decoded).toBeNull();
  });

  it('attaches user to request with optional auth when token is valid', async () => {
    const payload = { uid: 'staff_1', email: 'test@example.com', name: 'Test User', tenantId: 'tenant_1', role: 'admin', staffId: 'staff_1' };
    const token = generateAccessToken(payload);

    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res: any = {};
    const next = () => {
      expect(req.user).toMatchObject(payload);
    };

    await optionalAuth(req, res, next);
  });

  it('blocks missing authorization header in requireAuth', () => {
    const req: any = { headers: {} };
    const json = vi.fn();
    const res: any = { status: vi.fn(() => ({ json })) };
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized: No token provided' });
    expect(next).not.toHaveBeenCalled();
  });
});
