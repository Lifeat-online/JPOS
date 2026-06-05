import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expiryFromJwtPayload,
  hashRefreshToken,
  revokeRefreshToken,
  revokeStaffRefreshTokens,
  storeRefreshTokenSession,
  verifyStoredRefreshToken,
} from '../../server/refreshTokenSessions.js';
import * as dbModule from '../../server/db.js';
import { recordAuditEventSafe } from '../../server/audit.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../server/audit.js', () => ({
  recordAuditEventSafe: vi.fn(),
}));

function req(overrides: Record<string, unknown> = {}) {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    get: vi.fn(() => 'Vitest Agent'),
    user: { uid: 'admin_1', staffId: 'admin_1', name: 'Admin' },
    ...overrides,
  } as any;
}

describe('refresh token sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hashes refresh tokens without storing the plaintext value', () => {
    const hash = hashRefreshToken('refresh-token-value');
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashRefreshToken('refresh-token-value'));
    expect(hash).not.toContain('refresh-token-value');
  });

  it('derives an expiry date from a JWT payload exp claim', () => {
    expect(expiryFromJwtPayload({ exp: 1_700_000_000 })?.toISOString()).toBe('2023-11-14T22:13:20.000Z');
    expect(expiryFromJwtPayload({})).toBeNull();
  });

  it('stores a new session and marks the replaced token as rotated', async () => {
    (dbModule.query as any).mockResolvedValue([]);
    const nextToken = 'next-token';
    const previousToken = 'previous-token';
    const expiresAt = new Date('2026-06-05T12:00:00.000Z');

    const tokenHash = await storeRefreshTokenSession(req(), {
      token: nextToken,
      tenantId: 'tenant_1',
      staffId: 'staff_1',
      staffName: 'Test User',
      expiresAt,
      replacedToken: previousToken,
    });

    expect(tokenHash).toBe(hashRefreshToken(nextToken));
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_token_sessions'),
      [hashRefreshToken(nextToken), hashRefreshToken(previousToken)]
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO refresh_token_sessions'),
      expect.arrayContaining(['tenant_1', 'staff_1', hashRefreshToken(nextToken), '127.0.0.1', 'Vitest Agent', expiresAt])
    );
  });

  it('validates active stored tokens and updates last_used_at', async () => {
    const token = 'stored-token';
    const tokenHash = hashRefreshToken(token);
    (dbModule.query as any)
      .mockResolvedValueOnce([{
        id: 'rts_1',
        tenantId: 'tenant_1',
        staffId: 'staff_1',
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      }])
      .mockResolvedValueOnce([]);

    const result = await verifyStoredRefreshToken(token);

    expect(result).toMatchObject({ valid: true, tokenHash });
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_token_sessions SET last_used_at = NOW()'),
      [tokenHash]
    );
  });

  it('rejects missing, revoked, and expired stored tokens', async () => {
    (dbModule.query as any).mockResolvedValueOnce([]);
    await expect(verifyStoredRefreshToken('missing-token')).resolves.toMatchObject({ valid: false, reason: 'not_found' });

    (dbModule.query as any).mockResolvedValueOnce([{ revokedAt: new Date() }]);
    await expect(verifyStoredRefreshToken('revoked-token')).resolves.toMatchObject({ valid: false, reason: 'revoked' });

    (dbModule.query as any).mockResolvedValueOnce([{ expiresAt: new Date(Date.now() - 60_000) }]);
    await expect(verifyStoredRefreshToken('expired-token')).resolves.toMatchObject({ valid: false, reason: 'expired' });
  });

  it('revokes one token by hash', async () => {
    (dbModule.query as any).mockResolvedValue([]);
    const token = 'logout-token';

    await expect(revokeRefreshToken(req(), token, 'logout')).resolves.toBe(1);

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_token_sessions'),
      ['logout', hashRefreshToken(token)]
    );
  });

  it('revokes active sessions for a staff member and records an audit event', async () => {
    (dbModule.query as any).mockResolvedValue([]);

    await revokeStaffRefreshTokens(req(), 'tenant_1', 'staff_1', 'suspected_compromise');

    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_token_sessions'),
      ['suspected_compromise', 'tenant_1', 'staff_1']
    );
    expect(recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant_1',
      action: 'auth.refresh_tokens_revoked',
      entityType: 'security',
      entityId: 'staff_1',
    }));
  });
});
