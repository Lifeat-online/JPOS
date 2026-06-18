import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('security and PCI documentation', () => {
  const pciDoc = fs.readFileSync(path.join(process.cwd(), 'docs', 'security-pci-boundary.md'), 'utf8');
  const hardeningDoc = fs.readFileSync(path.join(process.cwd(), 'docs', 'production-hardening-checklist.md'), 'utf8');
  const appSource = fs.readFileSync(path.join(process.cwd(), 'server', 'app.ts'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

  it('documents that Jimmy POS does not store raw cardholder data', () => {
    expect(pciDoc).toContain('does not store, log, export, or intentionally accept raw cardholder data');
    expect(pciDoc).toContain('No PAN/card number');
    expect(pciDoc).toContain('No CVV/CVC/security code');
    expect(pciDoc).toContain('No magnetic stripe track data');
    expect(pciDoc).toContain('Self-Hosted Deployment Boundary');
    expect(pciDoc).toContain('Current Jimmy POS API authentication uses bearer tokens');
    expect(pciDoc).toContain('SameSite=Lax');
    expect(pciDoc).toContain('CSRF token check on state-changing routes');
  });

  it('documents the production launch checklist for secrets, TLS, firewall, backups, monitoring, and scans', () => {
    expect(hardeningDoc).toContain('JWT_SECRET');
    expect(hardeningDoc).toContain('Serve the public app only over HTTPS');
    expect(hardeningDoc).toContain('Do not expose the database publicly');
    expect(hardeningDoc).toContain('Schedule encrypted backups');
    expect(hardeningDoc).toContain('Alert on repeated auth failures');
    expect(hardeningDoc).toContain('npm audit --omit=dev');
  });

  it('exposes a dependency security scan script', () => {
    expect(packageJson.scripts['security:scan']).toBe('npm audit --omit=dev');
  });

  it('applies a dedicated sensitive-route rate limiter to payment, refund, stock, setup, and AI-test routes', () => {
    expect(appSource).toContain('SENSITIVE_ROUTE_RATE_LIMIT_MAX');
    expect(appSource).toContain('app.post("/api/auth/setup-password", sensitiveRouteRateLimit');
    expect(appSource).toContain('app.post("/api/mariadb/tenants/:tenantId/sales", sensitiveRouteRateLimit');
    expect(appSource).toContain('app.post("/api/mariadb/tenants/:tenantId/sales/:saleId/refund", sensitiveRouteRateLimit');
    expect(appSource).toContain('app.post("/api/mariadb/tenants/:tenantId/products/:id/stock-adjustments", sensitiveRouteRateLimit');
    expect(appSource).toContain('"/api/mariadb/tenants/:tenantId/ai/test",');
    expect(appSource).toMatch(/ai\/test",\s*\n\s*sensitiveRouteRateLimit/);
    expect(appSource).toContain('app.post("/api/payfast/notify", sensitiveRouteRateLimit');
  });
});
