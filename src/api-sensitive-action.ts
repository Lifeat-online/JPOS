/**
 * sensitiveActionPrompt — bridges the api.ts client (which cannot
 * import React) to the <SensitiveActionModal /> in the app shell.
 *
 * The api.ts client dispatches 'masepos:sensitive-action-required'
 * on the window whenever a 428 response is received. The modal
 * listens for that event, shows a masked password/PIN input, and
 * dispatches 'masepos:sensitive-action-resolved' with the entered
 * credential (or null on cancel). This module just sets up the
 * listener and resolves a promise.
 *
 * Returning a Promise<string | null> lets the api.ts client await
 * the result without blocking the event loop.
 */
export function promptSensitiveCredential(parsed: {
  actionLabel?: string;
  actionType?: string | null;
}): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    const onResolve = (event: Event) => {
      const detail = (event as CustomEvent<{ credential: string | null }>).detail;
      const trimmed = detail?.credential?.trim();
      resolve(trimmed ? trimmed : null);
    };
    window.addEventListener('masepos:sensitive-action-resolved', onResolve, { once: true });
    window.dispatchEvent(new CustomEvent('masepos:sensitive-action-required', {
      detail: {
        actionLabel: parsed?.actionLabel || 'complete this sensitive action',
        actionType: parsed?.actionType || null,
      },
    }));
  });
}
