import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp, setupRoutes, createTenantLocalSyncSecret } from '../../server/app.js';
import { generateAccessToken } from '../../server/auth-middleware.js';

let app: any;

beforeAll(async () => {
  // Set test environment to avoid Vite dev server issues
  process.env.NODE_ENV = 'test';
  app = await createApp();
  setupRoutes(app, null);
});

describe('api routes', () => {
  it('returns healthy status on /api/health', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('exposes licence info without requiring self-hosted enforcement in tests', async () => {
    const response = await request(app).get('/api/licence/info');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      enabled: false,
      valid: false,
      lockedOut: false,
    });
  });

  it('exposes the public package catalog', async () => {
    const response = await request(app).get('/api/packages');

    expect(response.status).toBe(200);
    expect(response.body.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'free', priceLabel: 'R0', maxRegisters: 2 }),
        expect.objectContaining({ id: 'starter', priceLabel: 'R399/mo', maxRegisters: 5 }),
        expect.objectContaining({ id: 'business', priceLabel: 'R999/mo', maxRegisters: 15 }),
        expect.objectContaining({ id: 'whitelabel', priceLabel: 'R25,000 once-off', maxRegisters: -1 }),
      ])
    );
    expect(response.body.addOns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'whitelabel_support', priceLabel: 'R3,500/mo' }),
      ])
    );
  });

  it('derives a tenant local sync secret only when paid local sync is enabled', () => {
    const businessSecret = createTenantLocalSyncSecret('tenant_sync', true, 'test-local-sync-secret');
    const sameTenantSecret = createTenantLocalSyncSecret('tenant_sync', true, 'test-local-sync-secret');
    const otherTenantSecret = createTenantLocalSyncSecret('tenant_other', true, 'test-local-sync-secret');

    expect(businessSecret).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(sameTenantSecret).toBe(businessSecret);
    expect(otherTenantSecret).not.toBe(businessSecret);
    expect(createTenantLocalSyncSecret('tenant_sync', false, 'test-local-sync-secret')).toBeNull();
    expect(createTenantLocalSyncSecret('tenant_sync', true, '')).toBeNull();
  });

  it('mounts hosted licence admin routes when licence secrets are configured', async () => {
    const previousHosted = process.env.JPOS_HOSTED;
    const previousSecret = process.env.LICENCE_SECRET;
    const previousAdminKey = process.env.ADMIN_API_KEY;

    delete process.env.JPOS_HOSTED;
    process.env.LICENCE_SECRET = 'test-licence-secret';
    process.env.ADMIN_API_KEY = 'test-admin-key';

    try {
      const hostedApp = await createApp();
      const response = await request(hostedApp)
        .post('/api/admin/licence/generate')
        .send({ tenantName: 'Acme Bistro', tier: 'business' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized' });
    } finally {
      if (previousHosted === undefined) {
        delete process.env.JPOS_HOSTED;
      } else {
        process.env.JPOS_HOSTED = previousHosted;
      }
      if (previousSecret === undefined) {
        delete process.env.LICENCE_SECRET;
      } else {
        process.env.LICENCE_SECRET = previousSecret;
      }
      if (previousAdminKey === undefined) {
        delete process.env.ADMIN_API_KEY;
      } else {
        process.env.ADMIN_API_KEY = previousAdminKey;
      }
    }
  });

  it('accepts POST requests on the auth login endpoint', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'Invalid input' });
  });

  it('returns unauthorized for protected endpoint without token', async () => {
    const response = await request(app).get('/api/mariadb/tenants/tenant_1/products');
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
  });

  it('blocks a valid staff token from accessing a different tenant route', async () => {
    const token = generateAccessToken({
      uid: 'staff_a',
      staffId: 'staff_a',
      email: 'cashier@tenant-a.test',
      name: 'Tenant A Cashier',
      role: 'cashier',
      tenantId: 'tenant_a',
    });

    const response = await request(app)
      .get('/api/mariadb/tenants/tenant_b/products')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/cannot access the requested tenant/i);
  });

  it('exposes PayFast form generation as an authenticated API route', async () => {
    const response = await request(app)
      .post('/api/payfast/generate')
      .send({ amount: 100, item_name: 'Test purchase' });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
  });
});
