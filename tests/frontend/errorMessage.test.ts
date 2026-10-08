import { describe, expect, it } from 'vitest';
import { errorMessage } from '../../src/utils/errorMessage.ts';

describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });
  it('falls back for an Error with an empty message', () => {
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback');
  });
  it('falls back for non-Error values', () => {
    expect(errorMessage('boom', 'fallback')).toBe('fallback');
    expect(errorMessage({ message: 'x' }, 'fallback')).toBe('fallback');
    expect(errorMessage(null, 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
