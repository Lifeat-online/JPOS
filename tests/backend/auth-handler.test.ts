import { beforeEach, describe, it, expect, vi } from 'vitest';
import { handleLogin, handleLogout, handleRefreshToken, handleGetMe, handleRevokeRefreshTokens, hashPassword } from '../../server/auth-handler.js';
import { generateTotpSecret, totpForTest } from '../../server/twoFactor.js';
import { hashRefreshToken } from '../../server/refreshTokenSessions.js';
import * as dbModule from '../../server/db.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

describe('auth-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns invalid credentials when no user is found', async () => {
    (dbModule.query as any).mockResolvedValue([]);
    const req: any = { body: { email: 'noone@example.com', password: 'password', tenantId: 'tenant_1' } };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res: any = { status };

    await handleLogin(req, res);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'auth.login_failed', 'security'])
    );
  });

  it('returns tokens for valid credentials', async () => {
    const passwordHash = await hashPassword('secret123');
    (dbModule.query as any).mockResolvedValue([{ id: 'staff_1', tenant_id: 'tenant_1', name: 'Test User', role: 'admin', email: 'test@example.com', password_hash: passwordHash, status: 'active', tenant_name: 'Demo Tenant' }]);

    const req: any = { body: { email: 'test@example.com', password: 'secret123' } };
    const json = vi.fn();
    const res: any = { json };

    await handleLogin(req, res);

    expect(json).toHaveBeenCalled();
    const response = json.mock.calls[0][0];
    expect(response).toHaveProperty('accessToken');
    expect(response).toHaveProperty('refreshToken');
    expect(response.user).toMatchObject({ email: 'test@example.com', name: 'Test User', role: 'admin', tenantId: 'tenant_1' });
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'auth.login_succeeded', 'security', 'staff_1'])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO refresh_token_sessions'),
      expect.arrayContaining(['tenant_1', 'staff_1'])
    );
  });

  it('requires a TOTP code for enabled privileged accounts', async () => {
    const passwordHash = await hashPassword('secret123');
    const secret = generateTotpSecret();
    (dbModule.query as any).mockResolvedValue([{
      id: 'staff_1',
      tenant_id: 'tenant_1',
      name: 'Test Manager',
      role: 'manager',
      email: 'manager@example.com',
      password_hash: passwordHash,
      two_factor_enabled: 1,
      two_factor_secret: secret,
      status: 'active',
      tenant_name: 'Demo Tenant',
    }]);

    const req: any = { body: { email: 'manager@example.com', password: 'secret123' } };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res: any = { status, json };

    await handleLogin(req, res);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      twoFactorRequired: true,
      error: 'Two-factor code required',
    }));
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'auth.two_factor_required', 'security'])
    );
  });

  it('returns tokens for enabled privileged accounts with a valid TOTP code', async () => {
    const passwordHash = await hashPassword('secret123');
    const secret = generateTotpSecret();
    const twoFactorCode = totpForTest(secret);
    (dbModule.query as any).mockResolvedValue([{
      id: 'staff_1',
      tenant_id: 'tenant_1',
      name: 'Test Manager',
      role: 'manager',
      email: 'manager@example.com',
      password_hash: passwordHash,
      two_factor_enabled: 1,
      two_factor_secret: secret,
      status: 'active',
      tenant_name: 'Demo Tenant',
    }]);

    const req: any = { body: { email: 'manager@example.com', password: 'secret123', twoFactorCode } };
    const json = vi.fn();
    const res: any = { json };

    await handleLogin(req, res);

    expect(json).toHaveBeenCalled();
    const response = json.mock.calls[0][0];
    expect(response).toHaveProperty('accessToken');
    expect(response.user).toMatchObject({
      email: 'manager@example.com',
      twoFactorEnabled: true,
      twoFactorEligible: true,
    });
  });

  it('accepts the matching DEV password when a stale tenant1 duplicate exists', async () => {
    const staleHash = await hashPassword('old-password');
    const matchingHash = await hashPassword('correct-password');
    (dbModule.query as any)
      .mockResolvedValueOnce([
        {
          id: 'dev_stale',
          tenant_id: 'tenant1',
          name: 'Stale Dev',
          role: 'dev',
          email: 'jameskoen78@gmail.com',
          password_hash: staleHash,
          status: 'active',
          tenant_name: 'MasePOS',
        },
        {
          id: 'dev_legacy',
          tenant_id: 'default',
          name: 'James Koen',
          role: 'admin',
          email: 'jameskoen78@gmail.com',
          password_hash: matchingHash,
          status: 'active',
          tenant_name: 'Default Tenant',
        },
      ])
      .mockResolvedValueOnce([{ name: 'MasePOS' }])
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ affectedRows: 1 });

    const req: any = { body: { email: 'jameskoen78@gmail.com', password: 'correct-password' } };
    const json = vi.fn();
    const res: any = { json };

    await handleLogin(req, res);

    expect(json).toHaveBeenCalled();
    const response = json.mock.calls[0][0];
    expect(response.user).toMatchObject({
      id: 'dev_legacy',
      email: 'jameskoen78@gmail.com',
      role: 'dev',
      tenantId: 'tenant1',
    });
  });

  it('allows logout without error', async () => {
    const json = vi.fn();
    const res: any = { json };

    await handleLogout({} as any, res);
    expect(json).toHaveBeenCalledWith({ message: 'Logged out successfully' });
  });

  it('revokes the submitted refresh token on logout', async () => {
    const payload = { uid: 'staff_1', email: 'test@example.com', name: 'Test User', tenantId: 'tenant_1', role: 'admin', staffId: 'staff_1' };
    const { generateAccessToken, generateRefreshToken } = await import('../../server/auth-middleware.ts');
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    (dbModule.query as any).mockResolvedValue([]);

    const req: any = {
      body: { refreshToken },
      headers: { authorization: `Bearer ${accessToken}` },
      get: vi.fn(() => 'Vitest Agent'),
      socket: { remoteAddress: '127.0.0.1' },
    };
    const json = vi.fn();
    const res: any = { json };

    await handleLogout(req, res);

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_token_sessions'),
      expect.arrayContaining(['logout', hashRefreshToken(refreshToken)])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'auth.logout', 'security', 'staff_1'])
    );
    expect(json).toHaveBeenCalledWith({ message: 'Logged out successfully' });
  });

  it('refreshes tokens with valid refresh token', async () => {
    const payload = { uid: 'staff_1', email: 'test@example.com', name: 'Test User', tenantId: 'tenant_1', role: 'admin', staffId: 'staff_1' };
    const { generateRefreshToken } = await import('../../server/auth-middleware.ts');
    const refreshToken = generateRefreshToken(payload);
    const refreshTokenHash = hashRefreshToken(refreshToken);
    (dbModule.query as any).mockImplementation((sql: string) => {
      if (String(sql).includes('FROM refresh_token_sessions')) {
        return Promise.resolve([{
          id: 'rts_1',
          tenantId: 'tenant_1',
          staffId: 'staff_1',
          tokenHash: refreshTokenHash,
          expiresAt: new Date(Date.now() + 60_000),
        }]);
      }
      return Promise.resolve([]);
    });

    const req: any = { body: { refreshToken }, get: vi.fn(() => 'Vitest Agent'), socket: { remoteAddress: '127.0.0.1' } };
    const json = vi.fn();
    const res: any = { json };

    await handleRefreshToken(req, res);

    expect(json).toHaveBeenCalled();
    const response = json.mock.calls[0][0];
    expect(response).toHaveProperty('accessToken');
    expect(response).toHaveProperty('refreshToken');
    expect(response.refreshToken).not.toBe(refreshToken);
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_token_sessions'),
      [refreshTokenHash]
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_token_sessions'),
      expect.arrayContaining([hashRefreshToken(response.refreshToken), refreshTokenHash])
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO refresh_token_sessions'),
      expect.arrayContaining(['tenant_1', 'staff_1', hashRefreshToken(response.refreshToken)])
    );
  });

  it('rejects refresh tokens that are not stored as active sessions', async () => {
    const payload = { uid: 'staff_1', email: 'test@example.com', name: 'Test User', tenantId: 'tenant_1', role: 'admin', staffId: 'staff_1' };
    const { generateRefreshToken } = await import('../../server/auth-middleware.ts');
    const refreshToken = generateRefreshToken(payload);
    (dbModule.query as any).mockResolvedValue([]);

    const req: any = { body: { refreshToken }, get: vi.fn(() => 'Vitest Agent'), socket: { remoteAddress: '127.0.0.1' } };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res: any = { status, json };

    await handleRefreshToken(req, res);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Invalid or expired refresh token' });
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'auth.refresh_token_rejected', 'security'])
    );
  });

  it('lets a privileged actor revoke refresh sessions for a staff member', async () => {
    (dbModule.query as any).mockResolvedValue([]);
    const req: any = {
      body: { staffId: 'staff_2', reason: 'suspected_compromise' },
      user: { uid: 'admin_1', staffId: 'admin_1', email: 'admin@example.com', name: 'Admin', tenantId: 'tenant_1', role: 'admin' },
      get: vi.fn(() => 'Vitest Agent'),
      socket: { remoteAddress: '127.0.0.1' },
    };
    const json = vi.fn();
    const res: any = { json };

    await handleRevokeRefreshTokens(req, res);

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_token_sessions'),
      ['suspected_compromise', 'tenant_1', 'staff_2']
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'auth.refresh_tokens_revoked', 'security', 'staff_2'])
    );
    expect(json).toHaveBeenCalledWith({ revoked: true, staffId: 'staff_2' });
  });

  it('blocks non-privileged staff from revoking another staff member sessions', async () => {
    (dbModule.query as any).mockResolvedValue([]);
    const req: any = {
      body: { staffId: 'staff_2' },
      user: { uid: 'staff_1', staffId: 'staff_1', email: 'staff@example.com', name: 'Cashier', tenantId: 'tenant_1', role: 'cashier' },
      get: vi.fn(() => 'Vitest Agent'),
      socket: { remoteAddress: '127.0.0.1' },
    };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res: any = { status, json };

    await handleRevokeRefreshTokens(req, res);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'Admin access required to revoke another staff member sessions' });
  });

  it('returns unauthorized on getMe when user missing', async () => {
    const status = vi.fn(() => ({ json: vi.fn() }));
    const res: any = { status };
    const req: any = {};

    await handleGetMe(req, res);

    expect(status).toHaveBeenCalledWith(401);
  });
});
