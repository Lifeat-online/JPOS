import { describe, it, expect, afterEach } from 'vitest';
import { promptSensitiveCredential } from '../../src/api-sensitive-action.js';

/**
 * The api.ts client used to call window.prompt() to capture a password
 * or PIN for sensitive-action verification. That is unsafe (blocked in
 * some contexts, unmasked input, no cancel UX). It now dispatches a
 * 'masepos:sensitive-action-required' window event and waits for a
 * 'masepos:sensitive-action-resolved' reply event carrying the
 * credential. This contract test asserts that:
 *
 *  1. The required event is dispatched with actionLabel / actionType
 *  2. The resolved event with credential=null is treated as cancel
 *  3. The resolved event with credential=<value> provides that value
 *  4. Whitespace is trimmed from the entered credential
 */

afterEach(() => {
  // Each test uses its own one-shot listener; nothing to clean up.
});

describe('promptSensitiveCredential event contract', () => {
  it('resolves with the credential from the resolved event', async () => {
    window.addEventListener('masepos:sensitive-action-required', () => {});
    const promise = promptSensitiveCredential({
      actionLabel: 'process a refund',
      actionType: 'refund',
    });
    await Promise.resolve();
    await Promise.resolve();
    window.dispatchEvent(new CustomEvent('masepos:sensitive-action-resolved', {
      detail: { credential: 'mypassword' },
    }));
    const result = await promise;
    expect(result).toBe('mypassword');
  });

  it('resolves to null when the user cancels (credential=null)', async () => {
    window.addEventListener('masepos:sensitive-action-required', () => {});
    const promise = promptSensitiveCredential({
      actionLabel: 'void a sale',
      actionType: 'void',
    });
    await Promise.resolve();
    await Promise.resolve();
    window.dispatchEvent(new CustomEvent('masepos:sensitive-action-resolved', {
      detail: { credential: null },
    }));
    const result = await promise;
    expect(result).toBeNull();
  });

  it('trims whitespace from the credential', async () => {
    window.addEventListener('masepos:sensitive-action-required', () => {});
    const promise = promptSensitiveCredential({
      actionLabel: 'adjust stock',
      actionType: 'stock_adjustment',
    });
    await Promise.resolve();
    await Promise.resolve();
    window.dispatchEvent(new CustomEvent('masepos:sensitive-action-resolved', {
      detail: { credential: '  1234  ' },
    }));
    const result = await promise;
    expect(result).toBe('1234');
  });
});
