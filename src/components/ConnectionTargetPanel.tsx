import React from 'react';
import { CheckCircle2, Cloud, Globe2, Server, Wifi } from 'lucide-react';
import {
  type ApiTarget,
  type ApiTargetKind,
  getApiTargets,
  getDeploymentMode,
  getPreferredApiTarget,
  setPreferredApiTarget,
} from '../apiConfig';

const targetMeta: Record<ApiTargetKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  'on-prem': { label: 'On-prem', icon: Server },
  cloud: { label: 'Cloud', icon: Cloud },
  'same-origin': { label: 'Same origin', icon: Globe2 },
};

function targetKey(target: ApiTarget) {
  return `${target.kind}:${target.baseUrl || 'same-origin'}`;
}

function targetUrl(target: ApiTarget) {
  return target.baseUrl || window.location.origin;
}

export function ConnectionTargetPanel() {
  const [preferred, setPreferred] = React.useState<ApiTargetKind | null>(() => getPreferredApiTarget());
  const targets = React.useMemo(() => getApiTargets(), [preferred]);
  const mode = getDeploymentMode();
  const primary = targets[0];
  const uniqueChoices = React.useMemo(() => {
    const seen = new Set<ApiTargetKind>();
    return targets.filter((target) => {
      if (seen.has(target.kind)) return false;
      seen.add(target.kind);
      return true;
    });
  }, [targets]);

  const selectTarget = (target: ApiTargetKind | null) => {
    setPreferredApiTarget(target);
    setPreferred(target);
    window.dispatchEvent(new CustomEvent('masepos:api-target-changed', { detail: { target } }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Deployment Mode</p>
          <h3 className="mt-1 text-2xl font-black capitalize text-slate-900 dark:text-white">{mode.replace('_', '-')}</h3>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
          <Wifi className="h-4 w-4" />
          {primary ? targetMeta[primary.kind].label : 'No target'}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Preferred API target">
        <button
          type="button"
          onClick={() => selectTarget(null)}
          aria-pressed={!preferred}
          className={`flex min-h-24 flex-col items-start justify-between rounded-2xl border p-4 text-left transition-all ${!preferred ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'}`}
        >
          <span className="flex items-center gap-2 text-sm font-black">
            <CheckCircle2 className="h-4 w-4" />
            Auto
          </span>
          <span className="text-xs font-bold uppercase tracking-widest opacity-70">Environment order</span>
        </button>

        {uniqueChoices.map((target) => {
          const Icon = targetMeta[target.kind].icon;
          const active = preferred === target.kind;
          return (
            <button
              key={targetKey(target)}
              type="button"
              onClick={() => selectTarget(target.kind)}
              aria-pressed={active}
              className={`flex min-h-24 flex-col items-start justify-between rounded-2xl border p-4 text-left transition-all ${active ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'}`}
            >
              <span className="flex items-center gap-2 text-sm font-black">
                <Icon className="h-4 w-4" />
                {targetMeta[target.kind].label}
              </span>
              <span className="max-w-full truncate text-xs font-bold uppercase tracking-widest opacity-70">{targetUrl(target)}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Failover Order</p>
        <div className="mt-3 space-y-2">
          {targets.map((target, index) => (
            <div key={`${targetKey(target)}:${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <span>{index === 0 ? 'Primary' : `Fallback ${index}`}</span>
              <span className="min-w-0 truncate text-right text-slate-500 dark:text-slate-400">{targetMeta[target.kind].label} - {targetUrl(target)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
