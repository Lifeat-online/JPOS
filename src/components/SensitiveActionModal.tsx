import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, X, Lock, Eye, EyeOff } from 'lucide-react';

type SensitiveActionRequest = {
  actionLabel: string;
  actionType: string | null;
};

/**
 * SensitiveActionModal — listens for the
 * 'masepos:sensitive-action-required' window event and shows a proper
 * modal with a masked password/PIN input. Replaces the (unsafe)
 * window.prompt() that the apiFetch helper used to call.
 *
 * Usage (from anywhere in the app): the api.ts client dispatches the
 * event automatically when a 428 sensitive-action-required response
 * comes back. Callers don't need to wire this up manually.
 */
export function SensitiveActionModal() {
  const [request, setRequest] = useState<SensitiveActionRequest | null>(null);
  const [credential, setCredential] = useState('');
  const [showCredential, setShowCredential] = useState(false);
  const [busy, setBusy] = useState(false);

  const cancel = useCallback(() => {
    if (busy) return;
    window.dispatchEvent(new CustomEvent('masepos:sensitive-action-resolved', { detail: { credential: null } }));
    setRequest(null);
    setCredential('');
    setShowCredential(false);
  }, [busy]);

  const confirm = useCallback(() => {
    if (busy) return;
    const trimmed = credential.trim();
    if (!trimmed) return;
    setBusy(true);
    window.dispatchEvent(new CustomEvent('masepos:sensitive-action-resolved', { detail: { credential: trimmed } }));
    setRequest(null);
    setCredential('');
    setShowCredential(false);
    setBusy(false);
  }, [busy, credential]);

  useEffect(() => {
    const onRequired = (event: Event) => {
      const detail = (event as CustomEvent<SensitiveActionRequest>).detail;
      setRequest(detail);
      setCredential('');
      setShowCredential(false);
    };
    window.addEventListener('masepos:sensitive-action-required', onRequired);
    return () => window.removeEventListener('masepos:sensitive-action-required', onRequired);
  }, []);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
      if (e.key === 'Enter' && credential.trim()) confirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, credential, cancel, confirm]);

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={cancel}
          data-testid="sensitive-action-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sensitive-action-title"
        >
          <motion.div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <h2 id="sensitive-action-title" className="text-lg font-semibold">
                  Confirm sensitive action
                </h2>
              </div>
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                aria-label="Cancel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                To {request.actionLabel}, re-enter your password or PIN.
                This protects high-risk actions like refunds, voids, stocktake
                approval, and wallet adjustments.
              </p>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Password or PIN
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showCredential ? 'text' : 'password'}
                    autoFocus
                    autoComplete="current-password"
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    disabled={busy}
                    className="w-full pl-10 pr-10 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Enter your password or PIN"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredential((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                    aria-label={showCredential ? 'Hide credential' : 'Show credential'}
                  >
                    {showCredential ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
              {request.actionType && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Action type: <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700">{request.actionType}</code>
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy || !credential.trim()}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
