import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * The cash-sessions open route, layby create/complete/cancel, payment
 * provider-status, and stocktake routes used to do:
 *     staffId: req.user?.staffId || req.user?.uid || req.body?.staffId
 *     staffName: req.user?.name || req.body?.staffName
 * This is dangerous: an authenticated cashier can spoof the staffId
 * recorded in the audit trail by sending it in the body.
 *
 * The fix is to derive staffId/staffName exclusively from the JWT
 * (which is signed by the server and cannot be forged). This test
 * documents the contract: a route built with the new pattern must
 * ignore body.staffId / body.staffName even if they are present.
 */

function buildJwtSecret() {
  // The placeholder is rejected in production but works in dev/test.
  process.env.NODE_ENV = 'test';
  delete process.env.JWT_SECRET;
  // Make jwt sign/verify succeed with the dev-secret path.
  return undefined;
}

function signToken(payload: { uid: string; email: string; name: string; tenantId: string; role: string; staffId: string }): string {
  // Bypass getJwtSecret() by setting a known 32+ char secret.
  process.env.JWT_SECRET = 'unit-test-jwt-secret-please-ignore-32chars';
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function buildProtectedRoute() {
  buildJwtSecret();
  const app = express();
  app.use(express.json());

  // Stand-in for the auth middleware: just decode the token and set
  // req.user. Real app.ts uses requireAuth from auth-middleware.
  app.use((req: any, res, next) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).end();
    try {
      req.user = jwt.verify(auth.substring(7), process.env.JWT_SECRET as string);
      next();
    } catch {
      res.status(401).end();
    }
  });

  // This is the canonical "fix" pattern. Every auth-protected route
  // in app.ts should look like this.
  app.post('/who', (req: any, res) => {
    const actorStaffId = req.user?.staffId || req.user?.uid || null;
    const actorStaffName = req.user?.name || null;
    res.json({
      staffId: actorStaffId,
      staffName: actorStaffName,
    });
  });
  return app;
}

describe('body staffId / staffName spoofing', () => {
  it('JWT staffId wins over body.staffId', async () => {
    const app = buildProtectedRoute();
    const token = signToken({
      uid: 'staff_real',
      email: 'jess@example.com',
      name: 'Jess Real',
      tenantId: 'tenant_1',
      role: 'cashier',
      staffId: 'staff_real',
    });
    const res = await request(app)
      .post('/who')
      .set('Authorization', `Bearer ${token}`)
      .send({ staffId: 'staff_evil', staffName: 'Evil Mallory' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ staffId: 'staff_real', staffName: 'Jess Real' });
  });

  it('body staffId is ignored even when the JWT carries no staffId', async () => {
    // Edge case: a token issued before this hardening with no staffId
    // claim but a valid uid. The server must NOT silently fall back to
    // body.staffId — the body is attacker-controlled. The legitimate
    // fallback is the JWT's uid (which is also server-signed).
    const app = buildProtectedRoute();
    const token = signToken({
      uid: 'staff_real',
      email: 'jess@example.com',
      name: 'Jess Real',
      tenantId: 'tenant_1',
      role: 'cashier',
      staffId: '', // intentionally empty
    });
    const res = await request(app)
      .post('/who')
      .set('Authorization', `Bearer ${token}`)
      .send({ staffId: 'staff_evil', staffName: 'Evil Mallory' });
    expect(res.status).toBe(200);
    // The fix returns the uid (signed by the server), NOT the spoofed body value.
    expect(res.body.staffId).toBe('staff_real');
    expect(res.body.staffName).toBe('Jess Real');
    // The attacker's staffId must never appear in the response.
    expect(res.body.staffId).not.toBe('staff_evil');
  });

  it('rejects requests with no token', async () => {
    const app = buildProtectedRoute();
    const res = await request(app).post('/who').send({ staffId: 'staff_evil' });
    expect(res.status).toBe(401);
  });
});
