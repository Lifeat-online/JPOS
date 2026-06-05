import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../server/db.js';
import { stripSensitiveVerification, verifySensitiveActionForRequest } from '../../server/sensitiveActions.js';

vi.mock('../../server/db.js', () => ({
  query: vi.fn(),
}));

function request(body: any = {}) {
  return {
    method: 'POST',
    originalUrl: '/api/mariadb/tenants/tenant_1/sales/sale_1/refund',
    params: { tenantId: 'tenant_1' },
    body,
    user: {
      uid: 'staff_1',
      staffId: 'staff_1',
      name: 'Jess Manager',
      role: 'manager',
      tenantId: 'tenant_1',
    },
    get: vi.fn(() => null),
  } as any;
}

describe('sensitive action verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for verification before querying staff credentials', async () => {
    const result = await verifySensitiveActionForRequest(request(), 'refund', { saleId: 'sale_1' });

    expect(result).toMatchObject({
      ok: false,
      status: 428,
    });
    expect(dbModule.query).not.toHaveBeenCalled();
  });

  it('accepts the current staff password and records an audit event', async () => {
    const passwordHash = await bcrypt.hash('secret123', 10);
    (dbModule.query as any).mockResolvedValue([{ id: 'staff_1', name: 'Jess Manager', passwordHash, securityPinHash: null }]);

    const result = await verifySensitiveActionForRequest(
      request({ sensitiveVerification: { password: 'secret123' } }),
      'void',
      { saleId: 'sale_1' }
    );

    expect(result).toMatchObject({ ok: true, actionType: 'void', staffId: 'staff_1' });
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM staff'),
      ['tenant_1', 'staff_1']
    );
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'sensitive_action.verified', 'security'])
    );
  });

  it('accepts a stored sensitive-action PIN', async () => {
    const securityPinHash = await bcrypt.hash('2468', 10);
    (dbModule.query as any).mockResolvedValue([{ id: 'staff_1', name: 'Jess Manager', passwordHash: null, securityPinHash }]);

    const result = await verifySensitiveActionForRequest(
      request({ sensitiveVerification: { pin: '2468' } }),
      'no_sale',
      { cashSessionId: 'cs_1' }
    );

    expect(result).toMatchObject({ ok: true, actionType: 'no_sale' });
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'sensitive_action.verified', 'security'])
    );
  });

  it('rejects an invalid credential and never returns the submitted secret', async () => {
    const passwordHash = await bcrypt.hash('secret123', 10);
    (dbModule.query as any).mockResolvedValue([{ id: 'staff_1', name: 'Jess Manager', passwordHash, securityPinHash: null }]);

    const result = await verifySensitiveActionForRequest(
      request({ sensitiveVerification: { password: 'wrong-password' } }),
      'stock_adjustment',
      { productId: 'prod_1' }
    );

    expect(result).toMatchObject({
      ok: false,
      status: 403,
      message: 'Sensitive action verification failed.',
    });
    expect(JSON.stringify(result)).not.toContain('wrong-password');
    expect(dbModule.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['tenant_1', 'sensitive_action.failed', 'security'])
    );
  });

  it('strips verification secrets before business handlers receive payloads', () => {
    expect(stripSensitiveVerification({
      amount: 25,
      sensitiveVerification: { password: 'secret123', pin: '2468' },
      sensitiveActionPassword: 'secret123',
      sensitiveActionPin: '2468',
    })).toEqual({ amount: 25 });
  });
});
