import React, { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, RefreshCw, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import { generateAiInsights, generateAiStaffScores, getAiInsights, getAiStaffScores } from '../api';
import type { AiInsight, AiStaffScore } from '../types';

const severityStyles: Record<string, string> = {
  critical: 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30',
  warning: 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30',
  success: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30',
  info: 'border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30',
};

export function AiCopilotView({ tenantId }: { tenantId: string | null }) {
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [scores, setScores] = useState<AiStaffScore[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [loadingScores, setLoadingScores] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!tenantId) return;
    setError(null);
    try {
      const [insightRows, scoreRows] = await Promise.all([
        getAiInsights(tenantId).catch(() => []),
        getAiStaffScores(tenantId).catch(() => []),
      ]);
      setInsights(insightRows || []);
      setScores(scoreRows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void load();
  }, [tenantId]);

  const generateInsights = async () => {
    if (!tenantId) return;
    setLoadingInsights(true);
    setError(null);
    try {
      setInsights(await generateAiInsights(tenantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingInsights(false);
    }
  };

  const generateScores = async () => {
    if (!tenantId) return;
    setLoadingScores(true);
    setError(null);
    try {
      setScores(await generateAiStaffScores(tenantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingScores(false);
    }
  };

  const totals = useMemo(() => {
    return {
      critical: insights.filter(i => i.severity === 'critical').length,
      warning: insights.filter(i => i.severity === 'warning').length,
      staffCount: scores.length,
      avgScore: scores.length ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length) : 0,
    };
  }, [insights, scores]);

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <BrainCircuit className="w-8 h-8 text-indigo-500" />
              AI Manager Copilot
            </h2>
            <p className="text-slate-500 font-medium mt-1">Business recommendations, staff coaching, and risk monitoring.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={generateInsights}
              disabled={loadingInsights || !tenantId}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-black uppercase tracking-widest disabled:opacity-60"
            >
              {loadingInsights ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate Insights
            </button>
            <button
              onClick={generateScores}
              disabled={loadingScores || !tenantId}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-60"
            >
              {loadingScores ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
              Grade Staff
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ['Critical', totals.critical],
            ['Warnings', totals.warning],
            ['Staff Graded', totals.staffCount],
            ['Avg Score', totals.avgScore],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
              <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{value}</div>
            </div>
          ))}
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Insight Cards</h3>
            <div className="text-xs font-bold text-slate-400">Suggest-only actions</div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {insights.length === 0 && (
              <div className="lg:col-span-2 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-bold text-slate-400">
                No insight cards yet.
              </div>
            )}
            {insights.map((insight) => (
              <article key={insight.id} className={`rounded-2xl border p-5 ${severityStyles[insight.severity] || severityStyles.info}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{insight.category}</div>
                    <h4 className="mt-1 text-lg font-black text-slate-900 dark:text-white">{insight.title}</h4>
                  </div>
                  <span className="rounded-full bg-white/70 dark:bg-slate-950/40 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                    {insight.confidence}%
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300 leading-6">{insight.summary}</p>
                <p className="mt-3 text-sm font-black text-slate-900 dark:text-white leading-6">{insight.recommendation}</p>
                {insight.evidence.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {insight.evidence.slice(0, 4).map((item) => (
                      <span key={item} className="rounded-lg bg-white/70 dark:bg-slate-950/40 px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Staff Coaching Scores</h3>
            <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              Owner controlled visibility
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {scores.length === 0 && (
              <div className="lg:col-span-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-bold text-slate-400">
                No staff scores generated yet.
              </div>
            )}
            {scores.map((score) => (
              <article key={score.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-base font-black text-slate-900 dark:text-white">{score.staffName}</h4>
                    <p className="text-xs font-bold text-slate-400">AI grade {score.grade}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-indigo-600 dark:text-indigo-300">{score.score}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Score</div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {score.strengths.slice(0, 2).map((item) => (
                    <p key={item} className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{item}</p>
                  ))}
                  {score.coachingNotes.slice(0, 2).map((item) => (
                    <p key={item} className="text-xs font-semibold text-slate-600 dark:text-slate-300">{item}</p>
                  ))}
                </div>
                {score.badges.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {score.badges.map((badge) => (
                      <span key={badge} className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                        {badge}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
