import { useEffect, useMemo, useState } from 'react';

export type PrinterReadinessStatus = 'unknown' | 'ready' | 'attention';

interface PrinterReadinessState {
  status: PrinterReadinessStatus;
  checkedAt?: string;
}

const defaultState: PrinterReadinessState = { status: 'unknown' };

const isSameBusinessDay = (value?: string) => {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toDateString() === new Date().toDateString();
};

export function usePrinterReadiness(tenantId?: string | null) {
  const storageKey = useMemo(() => `printer-readiness:${tenantId || 'local'}`, [tenantId]);
  const [state, setState] = useState<PrinterReadinessState>(defaultState);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      setState(saved ? { ...defaultState, ...JSON.parse(saved) } : defaultState);
    } catch {
      setState(defaultState);
    }
  }, [storageKey]);

  const saveState = (next: PrinterReadinessState) => {
    setState(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // The check still works for the current session if storage is blocked.
    }
  };

  const markReady = () => saveState({ status: 'ready', checkedAt: new Date().toISOString() });
  const markAttention = () => saveState({ status: 'attention', checkedAt: new Date().toISOString() });

  return {
    status: state.status,
    checkedAt: state.checkedAt,
    isReadyToday: state.status === 'ready' && isSameBusinessDay(state.checkedAt),
    needsAttention: state.status === 'attention',
    markReady,
    markAttention,
  };
}
