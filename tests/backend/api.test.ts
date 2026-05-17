import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp, setupRoutes } from '../../server/app.js';

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

  it('returns unauthorized for protected endpoint without token', async () => {
    const response = await request(app).get('/api/mariadb/tenants/tenant_1/products');
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
  });
});
