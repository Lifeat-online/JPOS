import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { hashPassword, verifyPassword } from '../../server/auth-handler.js';

describe('bcrypt rounds', () => {
  it('hashPassword produces a $2x$12$... hash (12 rounds)', async () => {
    const hash = await hashPassword('CorrectHorseBatteryStaple!');
    // bcryptjs encodes rounds as the second $-delimited field, e.g.
    //   $2a$12$LJ3m4ys3Ped0YEOBqlp25eFnIosdwMaT/sMmjGPJHfSxTbx.Faqi.
    expect(hash).toMatch(/^\$2[abxy]\$\d{2}\$/);
    const rounds = parseInt(hash.split('$')[2], 10);
    expect(rounds).toBe(12);
  });

  it('verifyPassword accepts the freshly-hashed password', async () => {
    const password = 'correct horse battery staple';
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('verifyPassword still accepts a legacy 10-round hash (backward compat)', async () => {
    const password = 'legacyPassword!1';
    // Simulate the hash format produced by the old genSalt(10) code path.
    const legacyHash = await bcrypt.hash(password, 10);
    expect(legacyHash).toMatch(/^\$2[abxy]\$\d{2}\$/);
    expect(parseInt(legacyHash.split('$')[2], 10)).toBe(10);
    expect(await verifyPassword(password, legacyHash)).toBe(true);
    expect(await verifyPassword('wrong', legacyHash)).toBe(false);
  });
});
