import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Printer, XCircle } from 'lucide-react';
import { usePrinterReadiness } from '../hooks/usePrinterReadiness';

interface PrinterReadinessPanelProps {
  tenantId?: string | null;
  compact?: boolean;
  readiness?: ReturnType<typeof usePrinterReadiness>;
}

export function PrinterReadinessPanel({ tenantId, compact = false, readiness: providedReadiness }: PrinterReadinessPanelProps) {
  const localReadiness = usePrinterReadiness(tenantId);
  const readiness = providedReadiness || localReadiness;
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [printingTest, setPrintingTest] = useState(false);

  const statusTone = readiness.isReadyToday
    ? 'emerald'
    : readiness.needsAttention
      ? 'rose'
      : 'amber';
  const StatusIcon = readiness.isReadyToday ? CheckCircle2 : readiness.needsAttention ? XCircle : AlertCircle;
  const statusLabel = readiness.isReadyToday ? 'Ready today' : readiness.needsAttention ? 'Needs attention' : 'Check printer';
  const checkedLabel = readiness.checkedAt
    ? `Last checked ${new Date(readiness.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'No test print recorded today';

  const runTestPrint = () => {
    setAwaitingConfirmation(true);
    setPrintingTest(true);
    window.setTimeout(() => window.print(), 75);
  };

  useEffect(() => {
    if (!printingTest) return;
    const clearPrintMode = () => setPrintingTest(false);
    window.addEventListener('afterprint', clearPrintMode);
    const timer = window.setTimeout(clearPrintMode, 3000);
    return () => {
      window.removeEventListener('afterprint', clearPrintMode);
      window.clearTimeout(timer);
    };
  }, [printingTest]);

  return (
    <div className={`printer-readiness rounded-2xl border p-4 shadow-sm ${
      statusTone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/10'
        : statusTone === 'rose'
          ? 'border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-900/10'
          : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10'
    }`}>
      <div className={`flex ${compact ? 'items-center' : 'items-start'} justify-between gap-3`}>
        <div className="flex items-start gap-3 min-w-0">
          <StatusIcon className={`w-5 h-5 shrink-0 mt-0.5 ${
            statusTone === 'emerald' ? 'text-emerald-600' : statusTone === 'rose' ? 'text-rose-600' : 'text-amber-600'
          }`} />
          <div className="min-w-0">
            <p className={`text-sm font-black ${statusTone === 'emerald' ? 'text-emerald-800 dark:text-emerald-300' : statusTone === 'rose' ? 'text-rose-800 dark:text-rose-300' : 'text-amber-800 dark:text-amber-300'}`}>
              Receipt printer: {statusLabel}
            </p>
            {!compact && (
              <p className={`mt-1 text-xs font-semibold ${statusTone === 'emerald' ? 'text-emerald-700/80 dark:text-emerald-300/70' : statusTone === 'rose' ? 'text-rose-700/80 dark:text-rose-300/70' : 'text-amber-700/80 dark:text-amber-300/70'}`}>
                {checkedLabel}. Print a small test slip and confirm it is clear before trading or closing.
              </p>
            )}
            {compact && (
              <p className="mt-0.5 text-[10px] font-bold text-slate-500 truncate">{checkedLabel}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={runTestPrint}
          className="h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-white/70 dark:border-slate-700 text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all shrink-0"
        >
          <Printer className="w-4 h-4" />
          Test
        </button>
      </div>

      {awaitingConfirmation && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              readiness.markReady();
              setAwaitingConfirmation(false);
            }}
            className="h-11 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" />
            Printed clearly
          </button>
          <button
            type="button"
            onClick={() => {
              readiness.markAttention();
              setAwaitingConfirmation(false);
            }}
            className="h-11 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95"
          >
            <AlertCircle className="w-4 h-4" />
            Needs attention
          </button>
        </div>
      )}

      {printingTest && (
        <>
          <div className="printer-test-print-only hidden text-black bg-white p-4 font-mono text-[12px] leading-tight max-w-[80mm]">
            <div className="text-center font-black text-[14px]">PRINTER TEST</div>
            <div className="mt-2 text-center">Receipt printer readiness check</div>
            <div className="mt-3 border-t border-b border-black py-2">
              <div>Date: {new Date().toLocaleDateString()}</div>
              <div>Time: {new Date().toLocaleTimeString()}</div>
              <div>Status: confirm print is clear</div>
            </div>
            <div className="mt-3 text-center">If this slip is readable, tap Printed clearly.</div>
          </div>

          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body * { visibility: hidden; }
              .printer-test-print-only, .printer-test-print-only * { visibility: visible; }
              .printer-test-print-only {
                display: block !important;
                position: absolute;
                left: 0;
                top: 0;
                width: 80mm;
              }
            }
          ` }} />
        </>
      )}
    </div>
  );
}
