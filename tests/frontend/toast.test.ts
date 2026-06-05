import { describe, it, expect, afterEach } from 'vitest';
import { toast } from '../../src/utils/toast';

/**
 * The toast module is a thin event-dispatcher; it has no DOM of its
 * own. The <ToastContainer /> component (in the app shell) is what
 * actually renders the toast. These tests assert the contract:
 *  1. toast.success/error/info/warning each dispatch a 'masepos:toast'
 *     window event with a unique id, the correct kind, and the message.
 *  2. Empty / null / non-string messages are ignored (no event).
 *  3. Custom durationMs / kind override works.
 */

afterEach(() => {
  // Each test installs its own listener; we don't leak between tests
  // because we explicitly remove them.
});

describe('toast event contract', () => {
  it('toast.success dispatches a success event with the message', () => {
    const seen: any[] = [];
    const handler = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('masepos:toast', handler);
    toast.success('Order saved');
    window.removeEventListener('masepos:toast', handler);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: 'success', message: 'Order saved' });
    expect(seen[0].id).toMatch(/^t_\d+_[a-z0-9]+$/);
  });

  it('toast.error dispatches an error event', () => {
    const seen: any[] = [];
    const handler = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('masepos:toast', handler);
    toast.error('Failed to save');
    window.removeEventListener('masepos:toast', handler);
    expect(seen).toHaveLength(1);
    expect(seen[0].kind).toBe('error');
    expect(seen[0].message).toBe('Failed to save');
  });

  it('ignores empty / null messages', () => {
    const seen: any[] = [];
    const handler = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('masepos:toast', handler);
    toast.success('');
    toast.error(null as any);
    toast.info(undefined as any);
    window.removeEventListener('masepos:toast', handler);
    expect(seen).toHaveLength(0);
  });

  it('object form allows kind + duration override', () => {
    const seen: any[] = [];
    const handler = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('masepos:toast', handler);
    toast.error({ message: 'Save failed', kind: 'warning', durationMs: 10_000 });
    window.removeEventListener('masepos:toast', handler);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: 'warning', message: 'Save failed', durationMs: 10_000 });
  });

  it('multiple toasts get unique ids', () => {
    const seen: any[] = [];
    const handler = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('masepos:toast', handler);
    toast.success('a');
    toast.success('b');
    toast.success('c');
    window.removeEventListener('masepos:toast', handler);
    const ids = new Set(seen.map((s) => s.id));
    expect(ids.size).toBe(3);
  });
});
