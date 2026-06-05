import { describe, it, expect, afterEach } from 'vitest';
import { devBootstrapEnabled, isDevEmail } from '../../server/auth-middleware.js';

describe('devBootstrap gate', () => {
  const originalEnv = process.env.ENABLE_DEV_BOOTSTRAP;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_DEV_BOOTSTRAP;
    } else {
      process.env.ENABLE_DEV_BOOTSTRAP = originalEnv;
    }
  });

  it('is off by default (ENABLE_DEV_BOOTSTRAP unset)', () => {
    delete process.env.ENABLE_DEV_BOOTSTRAP;
    expect(devBootstrapEnabled()).toBe(false);
    expect(isDevEmail('jameskoen78@gmail.com')).toBe(false);
  });

  it('is off when set to false/0/empty', () => {
    for (const v of ['false', '0', 'no', '', 'FALSE', 'No']) {
      process.env.ENABLE_DEV_BOOTSTRAP = v;
      expect(devBootstrapEnabled()).toBe(false);
      expect(isDevEmail('jameskoen78@gmail.com')).toBe(false);
    }
  });

  it('is on only when explicitly true', () => {
    for (const v of ['true', 'TRUE', '1', 'yes', 'YES']) {
      process.env.ENABLE_DEV_BOOTSTRAP = v;
      expect(devBootstrapEnabled()).toBe(true);
      expect(isDevEmail('jameskoen78@gmail.com')).toBe(true);
    }
  });

  it('is case-insensitive on the email side', () => {
    process.env.ENABLE_DEV_BOOTSTRAP = 'true';
    expect(isDevEmail('JamesKoen78@GMAIL.com')).toBe(true);
    expect(isDevEmail('  jameskoen78@gmail.com  ')).toBe(true);
    expect(isDevEmail('other@example.com')).toBe(false);
  });
});
