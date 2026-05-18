import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bot, CalendarDays, CheckCircle2, FileText, Loader2, PackageCheck, ShieldAlert, ShoppingCart, Sparkles, ToggleLeft, ToggleRight, UploadCloud } from 'lucide-react';
import { applyInventoryAgentSteps, generateInventoryAgentProposal } from '../api';
import type { InventoryAgentApplyResult, InventoryAgentMode, InventoryAgentProposal } from '../types';
import { usePosStore } from '../store/usePosStore';
import { useAuth } from '../hooks/useAuth';

type EventDraft = {
  name: string;
  date: string;
  expectedPeople: string;
  serviceStyle: string;
  menuNotes: string;
};

const modes: { id: InventoryAgentMode; label: string; icon: React.ElementType }[] = [
  { id: 'invoice', label: 'Invoice Files', icon: FileText },
  { id: 'low_stock', label: 'Low Stock PO', icon: ShoppingCart },
  { id: 'event', label: 'Event Planning', icon: CalendarDays },
];

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function filePayload(file: File, dataUrl: string) {
  return {
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    dataUrl,
  };
}

export function InventoryAgentView() {
  const { user } = useAuth();
  const tenantId = usePosStore(s => s.tenantId);
  const isDev = String(user?.role || '').toLowerCase() === 'dev';
  const [mode, setMode] = useState<InventoryAgentMode>('invoice');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [proposal, setProposal] = useState<InventoryAgentProposal | null>(null);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [fullAutopilot, setFullAutopilot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<InventoryAgentApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDraft>({
    name: '',
    date: '',
    expectedPeople: '',
    serviceStyle: 'mixed',
    menuNotes: '',
  });

  const approvedCount = useMemo(() => Object.values(approved).filter(Boolean).length, [approved]);

  const generate = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const uploadedFiles = mode === 'invoice'
        ? await Promise.all(files.map(async file => filePayload(file, await readFileAsDataUrl(file))))
        : [];
      const documentDataUrls = mode === 'invoice'
        ? uploadedFiles.filter(file => !file.type.startsWith('image/'))
        : [];
      const result = await generateInventoryAgentProposal(tenantId, {
        mode,
        notes,
        imageDataUrls: mode === 'invoice' ? uploadedFiles.filter(file => file.type.startsWith('image/')).map(file => file.dataUrl) : [],
        documentDataUrls,
        event: mode === 'event' ? {
          ...eventDraft,
          expectedPeople: Number(eventDraft.expectedPeople || 0),
          menuNotes: eventDraft.menuNotes || notes,
        } : undefined,
      });
      setProposal(result);
      const nextApproved = Object.fromEntries(result.steps.map(step => [step.id, fullAutopilot && isDev]));
      setApproved(nextApproved);
      setApplyResult(null);
      if (fullAutopilot && isDev && result.steps.length > 0) {
        setApplying(true);
        try {
          setApplyResult(await applyInventoryAgentSteps(tenantId, result.steps, true));
        } finally {
          setApplying(false);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Copilot could not prepare a proposal.');
    } finally {
      setLoading(false);
    }
  };

  const applyApproved = async () => {
    if (!tenantId || !proposal) return;
    setApplying(true);
    setError(null);
    try {
      const steps = proposal.steps.map(step => ({ ...step, approved: Boolean(approved[step.id]) }));
      setApplyResult(await applyInventoryAgentSteps(tenantId, steps, fullAutopilot && isDev));
    } catch (err: any) {
      setError(err?.message || 'Approved steps could not be applied.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 rounded-[24px] p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Experimental Copilot Agent</h2>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Approval-first inventory planning for invoices, low stock, and events.</p>
              </div>
            </div>
          </div>
          <div className="px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs font-black uppercase tracking-widest flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            No silent stock changes
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          {modes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setMode(id); setProposal(null); setApproved({}); }}
              className={`h-16 rounded-2xl border text-sm font-black flex items-center justify-center gap-3 transition-all ${mode === id ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-lg' : 'bg-slate-50 dark:bg-[#0B1120] text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-800 hover:border-primary/40'}`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </div>

        {isDev && (
          <button
            type="button"
            onClick={() => {
              const next = !fullAutopilot;
              setFullAutopilot(next);
              if (proposal) {
                setApproved(Object.fromEntries(proposal.steps.map(step => [step.id, next])));
              }
            }}
            className={`mt-5 w-full rounded-3xl border p-5 flex items-center justify-between gap-4 text-left transition-all ${fullAutopilot ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/60' : 'bg-slate-50 dark:bg-[#0B1120] border-slate-200 dark:border-slate-800/60'}`}
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${fullAutopilot ? 'bg-red-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-sm font-black uppercase tracking-widest ${fullAutopilot ? 'text-red-700 dark:text-red-300' : 'text-slate-700 dark:text-slate-300'}`}>Dev full autopilot</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">When enabled, Copilot auto-approves and applies draft-safe steps immediately after generating a proposal.</p>
              </div>
            </div>
            {fullAutopilot ? <ToggleRight className="w-9 h-9 text-red-600 shrink-0" /> : <ToggleLeft className="w-9 h-9 text-slate-400 shrink-0" />}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 rounded-[24px] p-6 shadow-sm space-y-5">
          {mode === 'invoice' && (
            <label className="block border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-6 text-center cursor-pointer hover:border-primary/50 transition-all">
              <UploadCloud className="w-9 h-9 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm font-black text-slate-800 dark:text-white">Upload invoice files</p>
              <p className="text-xs font-semibold text-slate-400 mt-1">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'PDF, PNG, JPG, WebP, CSV, or text'}</p>
              <input
                className="hidden"
                type="file"
                accept="image/*,.pdf,.csv,.txt,.doc,.docx,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple
                onChange={e => setFiles(Array.from(e.target.files || []))}
              />
            </label>
          )}

          {mode === 'event' && (
            <div className="grid grid-cols-1 gap-3">
              <input className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 text-sm font-semibold dark:text-white" placeholder="Event name" value={eventDraft.name} onChange={e => setEventDraft({ ...eventDraft, name: e.target.value })} />
              <input className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 text-sm font-semibold dark:text-white" type="date" value={eventDraft.date} onChange={e => setEventDraft({ ...eventDraft, date: e.target.value })} />
              <input className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 text-sm font-semibold dark:text-white" type="number" min="0" placeholder="Expected people" value={eventDraft.expectedPeople} onChange={e => setEventDraft({ ...eventDraft, expectedPeople: e.target.value })} />
              <select className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 text-sm font-semibold dark:text-white" value={eventDraft.serviceStyle} onChange={e => setEventDraft({ ...eventDraft, serviceStyle: e.target.value })}>
                <option value="mixed">Mixed service</option>
                <option value="bar">Bar only</option>
                <option value="food">Food only</option>
                <option value="buffet">Buffet/function</option>
              </select>
            </div>
          )}

          <textarea
            className="w-full min-h-36 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 text-sm font-semibold dark:text-white outline-none focus:border-primary/50"
            placeholder={mode === 'invoice' ? 'Optional: supplier name, invoice number, line notes, pack sizes...' : mode === 'low_stock' ? 'Optional: lead time, preferred vendor, cashflow limits...' : 'Menu, duration, expected drinks/food split, VIP notes...'}
            value={mode === 'event' ? (eventDraft.menuNotes || notes) : notes}
            onChange={e => mode === 'event' ? setEventDraft({ ...eventDraft, menuNotes: e.target.value }) : setNotes(e.target.value)}
          />

          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="w-full h-14 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-primary/20 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            Generate Approval Plan
          </button>

          {error && <p className="text-sm font-bold text-red-600 bg-red-50 dark:bg-red-900/20 rounded-2xl p-4">{error}</p>}
        </div>

        <div className="space-y-4">
          {!proposal ? (
            <div className="min-h-96 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700/60 rounded-[24px] flex flex-col items-center justify-center text-center p-8">
              <PackageCheck className="w-14 h-14 text-slate-300 dark:text-slate-600 mb-4" />
              <h3 className="text-xl font-black text-slate-900 dark:text-white">No proposal yet</h3>
              <p className="text-sm font-semibold text-slate-400 mt-2 max-w-md">Generate a plan and Copilot will show every proposed vendor, item, PO, invoice, stock, or event planning step for approval.</p>
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 rounded-[24px] p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">{proposal.summary}</h3>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2">{fullAutopilot && isDev ? 'Dev full autopilot active' : `${approvedCount} of ${proposal.steps.length} steps approved`}</p>
                </div>
                <div className={`text-xs font-black rounded-2xl px-4 py-3 flex items-center gap-2 uppercase tracking-widest ${fullAutopilot && isDev ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20' : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20'}`}>
                  <CheckCircle2 className="w-4 h-4" />
                  {fullAutopilot && isDev ? 'Autopilot applying' : 'Human approval required'}
                </div>
              </div>

              <button
                type="button"
                onClick={applyApproved}
                disabled={applying || (!fullAutopilot && approvedCount === 0)}
                className="w-full h-14 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl disabled:opacity-50"
              >
                {applying ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                {fullAutopilot && isDev ? 'Run Full Autopilot Draft-Safe Steps' : 'Apply Approved Draft-Safe Steps'}
              </button>

              {applyResult && (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 rounded-[24px] p-5 shadow-sm">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-3">Apply Result</h4>
                  <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{applyResult.applied.length} applied, {applyResult.skipped.length} skipped.</p>
                  {applyResult.skipped.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {applyResult.skipped.map(item => (
                        <p key={`${item.stepId}-${item.reason}`} className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2">{item.reason}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {proposal.warnings.map(warning => (
                <div key={warning} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 rounded-2xl p-4 text-sm font-bold flex gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  {warning}
                </div>
              ))}

              <div className="grid grid-cols-1 gap-4">
                {proposal.steps.map(item => (
                  <label key={item.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 rounded-[24px] p-5 shadow-sm cursor-pointer hover:border-primary/40 transition-all">
                    <div className="flex items-start gap-4">
                      <input
                        type="checkbox"
                        checked={Boolean(approved[item.id])}
                        onChange={e => setApproved({ ...approved, [item.id]: e.target.checked })}
                        className="mt-1 h-5 w-5 accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h4 className="text-base font-black text-slate-900 dark:text-white">{item.label}</h4>
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${item.risk === 'high' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300' : item.risk === 'medium' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300'}`}>{item.risk} risk</span>
                          <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-500">{Math.round(item.confidence * 100)}% confidence</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.evidence.map(evidence => (
                            <span key={evidence} className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#0B1120] text-[11px] font-bold text-slate-500 dark:text-slate-400">{evidence}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
