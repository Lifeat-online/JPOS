import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.ts';

let app: any;

beforeAll(async () => {
  app = await createApp();
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
