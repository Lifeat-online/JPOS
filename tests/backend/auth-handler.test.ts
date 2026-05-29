import { beforeEach, describe, it, expect, vi } from 'vitest';
import { handleLogin, handleLogout, handleRefreshToken, handleGetMe, hashPassword } from '../../server/auth-handler.js';
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
    const req: any = { body: { email: 'noone@example.com', password: 'password' } };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res: any = { status };

    await handleLogin(req, res);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
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

  it('refreshes tokens with valid refresh token', async () => {
    const payload = { uid: 'staff_1', email: 'test@example.com', name: 'Test User', tenantId: 'tenant_1', role: 'admin', staffId: 'staff_1' };
    const { generateRefreshToken } = await import('../../server/auth-middleware.ts');
    const refreshToken = generateRefreshToken(payload);

    const req: any = { body: { refreshToken } };
    const json = vi.fn();
    const res: any = { json };

    await handleRefreshToken(req, res);

    expect(json).toHaveBeenCalled();
    expect(json.mock.calls[0][0]).toHaveProperty('accessToken');
    expect(json.mock.calls[0][0]).toHaveProperty('refreshToken');
  });

  it('returns unauthorized on getMe when user missing', async () => {
    const status = vi.fn(() => ({ json: vi.fn() }));
    const res: any = { status };
    const req: any = {};

    await handleGetMe(req, res);

    expect(status).toHaveBeenCalledWith(401);
  });
});
