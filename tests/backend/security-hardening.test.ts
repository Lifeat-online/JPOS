import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  applyTrustProxy,
  apiRateLimit,
  corsHandler,
  requestId,
  redactSecurityLogValue,
  securityHeaders,
  sendSafeError,
  stripPoweredBy,
  _resetRateLimitForTests,
} from '../../server/securityHardening.js';

function buildApp(extra: express.RequestHandler[] = [], isProduction = false) {
  const app = express();
  applyTrustProxy(app);
  app.disable('x-powered-by');
  app.use(stripPoweredBy);
  app.use(requestId);
  app.use(apiRateLimit);
  app.use(corsHandler);
  app.use(securityHeaders(isProduction));
  app.get('/ping', (req, res) => res.json({ ok: true, rid: req.requestId }));
  app.get('/boom', (_req, _res, next) => next(new Error('internal leakage: password=1234 card=4111-1111-1111-1111')));
  app.get('/safe-boom', (req, res, next) => {
    try {
      throw new Error('under-the-hood secret: jwt=abc');
    } catch (err) {
      sendSafeError(res, 500, 'User-facing message', err, req);
    }
  });
  for (const m of extra) app.use(m);
  // error handler last
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    sendSafeError(res, 500, 'Unhandled error', err, req);
  });
  return app;
}

describe('securityHardening', () => {
  describe('requestId', () => {
    it('mints a UUID when no X-Request-Id is supplied', async () => {
      const res = await request(buildApp()).get('/ping');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.rid).toBe(res.headers['x-request-id']);
    });

    it('echoes the inbound X-Request-Id when present and short enough', async () => {
      const res = await request(buildApp()).get('/ping').set('X-Request-Id', 'trace-abc-123');
      expect(res.headers['x-request-id']).toBe('trace-abc-123');
    });

    it('mints a new id when inbound X-Request-Id is too long', async () => {
      const res = await request(buildApp()).get('/ping').set('X-Request-Id', 'x'.repeat(500));
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('securityHeaders', () => {
    it('sets the standard browser-hardening headers', async () => {
      const res = await request(buildApp()).get('/ping');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
      expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['content-security-policy']).toContain('frame-src');
      expect(res.headers['content-security-policy']).toContain('payfast');
    });

    it('sets HSTS only in production', async () => {
      const dev = await request(buildApp([], false)).get('/ping');
      const prod = await request(buildApp([], true)).get('/ping');
      expect(dev.headers['strict-transport-security']).toBeUndefined();
      expect(prod.headers['strict-transport-security']).toContain('max-age=');
    });
  });

  describe('stripPoweredBy', () => {
    it('removes the X-Powered-By header Express adds by default', async () => {
      const res = await request(buildApp()).get('/ping');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('corsHandler', () => {
    it('rejects cross-origin requests when CORS_ORIGINS is empty', async () => {
      const res = await request(buildApp()).get('/ping').set('Origin', 'https://evil.example');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejects an unlisted origin when allowlist is configured', async () => {
      const prev = process.env.CORS_ORIGINS;
      process.env.CORS_ORIGINS = 'https://masepos.co.za,https://app.masepos.co.za';
      try {
        const res = await request(buildApp()).get('/ping').set('Origin', 'https://evil.example');
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      } finally {
        if (prev === undefined) delete process.env.CORS_ORIGINS;
        else process.env.CORS_ORIGINS = prev;
      }
    });

    it('allows a listed origin and echoes it back', async () => {
      const prev = process.env.CORS_ORIGINS;
      process.env.CORS_ORIGINS = 'https://masepos.co.za';
      try {
        const res = await request(buildApp()).get('/ping').set('Origin', 'https://masepos.co.za');
        expect(res.headers['access-control-allow-origin']).toBe('https://masepos.co.za');
        expect(res.headers['vary']).toContain('Origin');
      } finally {
        if (prev === undefined) delete process.env.CORS_ORIGINS;
        else process.env.CORS_ORIGINS = prev;
      }
    });

    it('responds to OPTIONS preflight with 204', async () => {
      const res = await request(buildApp()).options('/ping').set('Origin', 'https://x');
      expect(res.status).toBe(204);
    });
  });

  describe('apiRateLimit', () => {
    beforeEach(() => {
      // 3-cap for the cap test. Other tests in this file reset state
      // explicitly to avoid bleed.
      process.env.API_RATE_LIMIT_PER_MIN = '3';
      _resetRateLimitForTests();
    });
    afterEach(() => {
      delete process.env.API_RATE_LIMIT_PER_MIN;
    });

    it('returns 429 with Retry-After after the cap', async () => {
      const app = buildApp();
      const r1 = await request(app).get('/ping');
      const r2 = await request(app).get('/ping');
      const r3 = await request(app).get('/ping');
      const r4 = await request(app).get('/ping');
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(200);
      expect(r4.status).toBe(429);
      expect(r4.headers['retry-after']).toBeDefined();
      expect(r4.headers['x-ratelimit-remaining']).toBe('0');
      expect(r4.body.error).toBe('Too many requests');
    });

    it('is a no-op when API_RATE_LIMIT_PER_MIN=0', async () => {
      process.env.API_RATE_LIMIT_PER_MIN = '0';
      _resetRateLimitForTests();
      const app = buildApp();
      for (let i = 0; i < 20; i += 1) {
        const r = await request(app).get('/ping');
        expect(r.status).toBe(200);
      }
    });
  });

  describe('sendSafeError', () => {
    it('never returns the underlying error message or stack to the client', async () => {
      const res = await request(buildApp()).get('/boom');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Unhandled error');
      expect(JSON.stringify(res.body)).not.toContain('password=1234');
      expect(JSON.stringify(res.body)).not.toContain('4111-1111-1111-1111');
      expect(res.body.requestId).toBeDefined();
    });

    it('preserves a caller-supplied public message', async () => {
      const res = await request(buildApp()).get('/safe-boom');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('User-facing message');
      expect(JSON.stringify(res.body)).not.toContain('jwt=abc');
    });
  });

  describe('applyTrustProxy', () => {
    it('sets trust proxy from env', () => {
      const prev = process.env.TRUST_PROXY_HOPS;
      process.env.TRUST_PROXY_HOPS = '1';
      try {
        const app = express();
        applyTrustProxy(app);
        // express' get() returns the setting; an array form means "trust
        // the n-th hop". A number means "trust that many hops".
        expect(app.get('trust proxy')).toBe(1);
      } finally {
        if (prev === undefined) delete process.env.TRUST_PROXY_HOPS;
        else process.env.TRUST_PROXY_HOPS = prev;
      }
    });
  });

  describe('redactSecurityLogValue', () => {
    it('redacts secrets, bearer tokens, OpenAI keys, and card-like PAN values', () => {
      const redacted = redactSecurityLogValue({
        password: 'secret-password',
        authorization: 'Bearer abc.def.ghi',
        apiKey: 'sk-proj_abcdefghijklmnopqrstuvwxyz',
        note: 'card 4111 1111 1111 1111 cvv=123',
      });

      expect(redacted).not.toContain('secret-password');
      expect(redacted).not.toContain('abc.def.ghi');
      expect(redacted).not.toContain('sk-proj_abcdefghijklmnopqrstuvwxyz');
      expect(redacted).not.toContain('4111 1111 1111 1111');
      expect(redacted).not.toContain('cvv=123');
      expect(redacted).toContain('<redacted');
    });
  });
});
