import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import type { ToastKind } from '../utils/toast';

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  durationMs: number;
};

const kindStyle: Record<ToastKind, { icon: React.ComponentType<{ className?: string }>; bg: string; border: string; iconColor: string }> = {
  success: { icon: CheckCircle2,   bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-700', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  error:   { icon: AlertCircle,    bg: 'bg-red-50 dark:bg-red-900/30',         border: 'border-red-200 dark:border-red-700',         iconColor: 'text-red-600 dark:text-red-400' },
  info:    { icon: Info,           bg: 'bg-sky-50 dark:bg-sky-900/30',         border: 'border-sky-200 dark:border-sky-700',         iconColor: 'text-sky-600 dark:text-sky-400' },
  warning: { icon: AlertTriangle,  bg: 'bg-amber-50 dark:bg-amber-900/30',     border: 'border-amber-200 dark:border-amber-700',     iconColor: 'text-amber-600 dark:text-amber-400' },
};

/**
 * ToastContainer — listens for 'masepos:toast' window events and
 * renders them as a stack in the top-right corner. Replaces alert()
 * calls. Mount once in the app shell.
 */
export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastItem>).detail;
      if (!detail) return;
      setItems((current) => [...current, detail]);
      const timer = setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== detail.id));
      }, detail.durationMs > 0 ? detail.durationMs : 4000);
      return () => clearTimeout(timer);
    };
    window.addEventListener('masepos:toast', onToast);
    return () => window.removeEventListener('masepos:toast', onToast);
  }, []);

  return (
    <div
      className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence>
        {items.map((item) => {
          const style = kindStyle[item.kind] || kindStyle.info;
          const Icon = style.icon;
          return (
            <motion.div
              key={item.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-md p-3 pr-2 rounded-xl border shadow-lg ${style.bg} ${style.border}`}
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.95 }}
              transition={{ duration: 0.18 }}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${style.iconColor}`} />
              <p className="flex-1 text-sm text-slate-800 dark:text-slate-100">{item.message}</p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
