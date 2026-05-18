import React, { useEffect, useState } from 'react';
import { BrainCircuit, RefreshCw, Sparkles } from 'lucide-react';
import { generateAiInsights, getAiInsights } from '../api';
import type { AiInsight } from '../types';

const severityClass: Record<string, string> = {
  critical: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
  info: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300',
};

export function AiInsightStrip({ tenantId, compact = false }: { tenantId: string | null; compact?: boolean }) {
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!tenantId) return;
    setError(null);
    try {
      const data = await getAiInsights(tenantId);
      setInsights(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const generate = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await generateAiInsights(tenantId);
      setInsights(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tenantId]);

  if (!tenantId) return null;
  if (error && error.includes('403')) return null;

  const visible = insights.slice(0, compact ? 3 : 6);

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">AI Manager Copilot</h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Suggest-only recommendations from current business data</p>
          </div>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-black uppercase tracking-widest disabled:opacity-60"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate
        </button>
      </div>

      {error && !error.includes('403') && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {visible.length === 0 && !error && (
        <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
          No AI insights generated yet.
        </div>
      )}

      {visible.length > 0 && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
          {visible.map((insight) => (
            <article key={insight.id} className={`rounded-xl border p-4 ${severityClass[insight.severity] || severityClass.info}`}>
              <div className="text-[10px] font-black uppercase tracking-widest opacity-80">{insight.category}</div>
              <h4 className="mt-1 text-sm font-black">{insight.title}</h4>
              <p className="mt-2 text-xs font-semibold leading-5 opacity-90">{insight.summary}</p>
              {!compact && <p className="mt-2 text-xs font-bold leading-5">{insight.recommendation}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
