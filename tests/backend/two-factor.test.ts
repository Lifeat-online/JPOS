import { describe, expect, it } from 'vitest';
import { buildTotpUri, generateTotpSecret, isPrivilegedTwoFactorRole, totpForTest, verifyTotpCode } from '../../server/twoFactor.js';

describe('two-factor TOTP helpers', () => {
  it('generates a secret, URI, and valid TOTP code', () => {
    const secret = generateTotpSecret();
    const code = totpForTest(secret, 1_800_000_000_000);

    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(buildTotpUri({ accountName: 'owner@example.com', secret })).toContain('otpauth://totp/');
    expect(verifyTotpCode(secret, code, 1_800_000_000_000)).toBe(true);
    expect(verifyTotpCode(secret, '000000', 1_800_000_000_000)).toBe(false);
  });

  it('scopes two-factor eligibility to privileged staff roles', () => {
    expect(isPrivilegedTwoFactorRole('admin')).toBe(true);
    expect(isPrivilegedTwoFactorRole('manager')).toBe(true);
    expect(isPrivilegedTwoFactorRole('dev')).toBe(true);
    expect(isPrivilegedTwoFactorRole('cashier')).toBe(false);
  });
});
