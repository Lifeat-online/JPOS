import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp, setupRoutes } from '../../server/app.js';

let app: any;

beforeAll(async () => {
  // Set test environment to avoid Vite dev server issues
  process.env.NODE_ENV = 'test';
  app = createApp();
  setupRoutes(app, null);
});

describe('api routes', () => {
  it('returns healthy status on /api/health', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns unauthorized for protected endpoint without token', async () => {
    const response = await request(app).get('/api/mariadb/tenants/tenant_1/products');
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
  });
});
