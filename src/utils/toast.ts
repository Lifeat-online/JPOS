/**
 * useToast — minimal global toast notification system.
 *
 * Dispatches 'masepos:toast' window events; a <ToastContainer /> in
 * the app shell renders them. Designed to replace alert() calls.
 *
 * Use:
 *   import { toast } from '../utils/toast';
 *   toast.error('Failed to save order');
 *   toast.success('Order saved');
 *   toast.info('Refreshing stock…');
 */

export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export type ToastInput = string | { message: string; kind?: ToastKind; durationMs?: number };

const DEFAULT_DURATION_MS = 4000;

function dispatch(kind: ToastKind, input: ToastInput) {
  if (typeof window === 'undefined') return;
  if (input == null) return;
  const message = typeof input === 'string' ? input : (input && typeof input === 'object' ? input.message : null);
  if (!message || typeof message !== 'string') return;
  const detail = {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind: typeof input === 'object' && input.kind ? input.kind : kind,
    message,
    durationMs: typeof input === 'object' && input.durationMs ? input.durationMs : DEFAULT_DURATION_MS,
  };
  window.dispatchEvent(new CustomEvent('masepos:toast', { detail }));
}

export const toast = {
  success: (input: ToastInput) => dispatch('success', input),
  error:   (input: ToastInput) => dispatch('error',   input),
  info:    (input: ToastInput) => dispatch('info',    input),
  warning: (input: ToastInput) => dispatch('warning', input),
};
