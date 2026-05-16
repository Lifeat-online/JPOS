import React, { useState, useEffect } from 'react';
import { CashSession, Staff } from '../types';
import { Loader2, DollarSign, Calendar, Lock, Unlock, AlertCircle, HandCoins, ShieldCheck, ClipboardCheck, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { usePosStore } from '../store/usePosStore';
import { apiGet, apiPost, apiPut } from '../api';

interface CashManagementViewProps {
  currentUserStaff: Staff | null;
}

const DENOMINATIONS = [
  { value: 200, label: 'R200 Notes' },
  { value: 100, label: 'R100 Notes' },
  { value: 50,  label: 'R50 Notes' },
  { value: 20,  label: 'R20 Notes' },
  { value: 10,  label: 'R10 Notes' },
  { value: 5,   label: 'R5 Coins' },
  { value: 2,   label: 'R2 Coins' },
  { value: 1,   label: 'R1 Coins' },
  { value: 0.5, label: '50c Coins' },
  { value: 0.2, label: '20c Coins' },
  { value: 0.1, label: '10c Coins' },
];

function DenominationCounter({ breakdown, setBreakdown, total }: { breakdown: Record<string, number>, setBreakdown: (b: Record<string, number>) => void, total: number }) {
  const updateQty = (value: number, qty: number) => {
    setBreakdown({ ...breakdown, [value.toString()]: qty });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2 px-1">
        <span className="text-xs font-black uppercase tracking-widest text-slate-500">Denomination</span>
        <span className="text-xs font-black uppercase tracking-widest text-slate-500">Quantity</span>
      </div>
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        {DENOMINATIONS.map(d => {
          const qty = breakdown[d.value.toString()] || 0;
          return (
            <div key={d.value} className="flex justify-between items-center bg-slate-50 dark:bg-[#0B1120] p-2 xl:p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
              <span className="font-bold text-sm w-24 shrink-0">{d.label}</span>
              <div className="flex items-center justify-end gap-3 flex-1">
                 <span className="text-xs font-bold text-slate-400 hidden sm:block">R{(d.value * qty).toFixed(2)}</span>
                 <input 
                   type="number" 
                   min="0" 
                   placeholder="0"
                   value={qty || ''} 
                   onChange={e => updateQty(d.value, parseInt(e.target.value) || 0)} 
                   className="w-16 px-2 py-1.5 text-center font-black bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary shadow-sm" 
                 />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 p-4 bg-primary/10 border border-primary/20 rounded-2xl flex justify-between items-center">
        <span className="font-black text-sm text-primary uppercase tracking-widest">Total Counted</span>
        <span className="text-2xl font-black text-primary">R{total.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function CashManagementView({ currentUserStaff }: CashManagementViewProps) {
  const tenantId = usePosStore(s => s.tenantId);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [openingBreakdown, setOpeningBreakdown] = useState<Record<string, number>>({});
  const [closingBreakdown, setClosingBreakdown] = useState<Record<string, number>>({});
  const [closeNotes, setCloseNotes] = useState("");
  const [managerNotes, setManagerNotes] = useState<Record<string, string>>({});
  const [varianceReasons, setVarianceReasons] = useState<Record<string, string>>({});

  const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const activeSession = sessions.find(s => s.status === 'open' && s.staffId === currentUserStaff?.id);
  const canManageCash = ['admin', 'manager', 'dev'].includes(currentUserStaff?.role || '');
  const pendingReview = sessions.filter(s => s.status === 'closed' && (s.reviewStatus || 'submitted') !== 'reconciled');
  const today = new Date().toDateString();
  const todaysClosedSessions = sessions.filter(s => s.status === 'closed' && new Date(s.closedAt || s.openedAt).toDateString() === today);
  const eodTotals = todaysClosedSessions.reduce((acc, s) => {
    acc.expected += toNumber((s as any).expectedCash);
    acc.actual += toNumber((s as any).actualCash);
    acc.variance += toNumber((s as any).difference);
    acc.tips += toNumber((s as any).netTips);
    if ((s.reviewStatus || 'submitted') === 'reconciled') acc.reconciled += 1;
    return acc;
  }, { expected: 0, actual: 0, variance: 0, tips: 0, reconciled: 0 });
  const newFloat = Object.entries(openingBreakdown).reduce((acc, [val, qty]) => acc + (parseFloat(val) * Number(qty)), 0);
  const closeAmount = Object.entries(closingBreakdown).reduce((acc, [val, qty]) => acc + (parseFloat(val) * Number(qty)), 0);

  const fetchSessions = async () => {
    if (!tenantId) return;
    try {
      let data = await apiGet<CashSession[]>(`/api/mariadb/tenants/${tenantId}/cash-sessions?limit=50`);
      if (currentUserStaff?.role === 'cashier') {
        data = data.filter(s => s.staffId === currentUserStaff.id);
      }
      const normalized = (data || []).map(s => ({
        ...s,
        openingFloat: toNumber((s as any).openingFloat),
        expectedCash: toNumber((s as any).expectedCash),
        actualCash: toNumber((s as any).actualCash),
        difference: toNumber((s as any).difference),
        accumulatedTips: toNumber((s as any).accumulatedTips),
        netTips: toNumber((s as any).netTips),
        reviewStatus: (s as any).reviewStatus || ((s as any).status === 'open' ? 'in_progress' : 'submitted'),
      })) as CashSession[];
      setSessions(normalized);
      usePosStore.getState().setActiveSession(normalized.find(s => s.status === 'open' && s.staffId === currentUserStaff?.id) || null);
    } catch (err) {
      console.error('CashSessions fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [tenantId, currentUserStaff?.role, currentUserStaff?.id]);

  const openRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserStaff || !tenantId) return;
    setIsProcessing(true);
    try {
      await apiPost(`/api/mariadb/tenants/${tenantId}/cash-sessions`, {
        staffId: currentUserStaff.id,
        staffName: currentUserStaff.name,
        openedAt: new Date().toISOString(),
        openingFloat: newFloat,
        openingBreakdown,
        expectedCash: newFloat,
        status: 'open',
      });
      await fetchSessions();
      setOpeningBreakdown({});
    } catch (err) {
      console.error(err);
    }
    setIsProcessing(false);
  };

  const closeRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !tenantId) return;
    setIsProcessing(true);
    try {
      const difference = closeAmount - toNumber((activeSession as any).expectedCash);
      let netTips = toNumber((activeSession as any).accumulatedTips);
      if (difference < 0) {
        netTips = Math.max(0, netTips + difference);
      }
      await apiPut(`/api/mariadb/tenants/${tenantId}/cash-sessions/${activeSession.id}`, {
        status: 'closed',
        reviewStatus: 'submitted',
        closedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        actualCash: closeAmount,
        closingBreakdown,
        difference,
        netTips,
        notes: closeNotes,
      });
      await fetchSessions();
      setClosingBreakdown({});
      setCloseNotes('');
    } catch (err) {
      console.error(err);
    }
    setIsProcessing(false);
  };

  const reviewSession = async (session: CashSession, reviewStatus: 'reviewed' | 'reconciled' | 'disputed') => {
    if (!tenantId) return;
    setIsProcessing(true);
    try {
      await apiPut(`/api/mariadb/tenants/${tenantId}/cash-sessions/${session.id}/review`, {
        reviewStatus,
        managerNotes: managerNotes[session.id] || '',
        varianceReason: varianceReasons[session.id] || '',
      });
      await fetchSessions();
    } catch (err) {
      console.error(err);
    }
    setIsProcessing(false);
  };

  const reviewBadge = (session: CashSession) => {
    const status = session.reviewStatus || (session.status === 'open' ? 'in_progress' : 'submitted');
    if (status === 'reconciled') return 'bg-emerald-100 text-emerald-700';
    if (status === 'disputed') return 'bg-red-100 text-red-700';
    if (status === 'reviewed') return 'bg-blue-100 text-blue-700';
    if (status === 'submitted') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-[1200px] mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Cash Management</h2>
          <p className="text-slate-500 font-medium">Manage drawer float, record cash ups, and view shift history.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pending Review</p>
                <p className="text-2xl font-black">{pendingReview.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Today Expected</p>
            <p className="text-2xl font-black">R{eodTotals.expected.toFixed(2)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Today Counted</p>
            <p className="text-2xl font-black">R{eodTotals.actual.toFixed(2)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Today Variance</p>
            <p className={`text-2xl font-black ${eodTotals.variance === 0 ? 'text-emerald-600' : eodTotals.variance > 0 ? 'text-blue-600' : 'text-orange-600'}`}>R{eodTotals.variance.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 lg:p-8 rounded-3xl border border-slate-100 dark:border-slate-800/60 shadow-sm flex flex-col md:flex-row gap-8 lg:gap-12">
          <div className="flex-1 max-w-sm shrink-0">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><DollarSign className="w-6 h-6 text-emerald-500"/> Current shift</h3>
            
            {!activeSession ? (
              <form onSubmit={openRegister} className="space-y-6">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                  <div className="flex gap-3 text-blue-800 dark:text-blue-300">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm font-medium">Count your starting float before processing cash sales.</p>
                  </div>
                </div>

                <DenominationCounter breakdown={openingBreakdown} setBreakdown={setOpeningBreakdown} total={newFloat} />

                <button type="submit" disabled={isProcessing} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-sm rounded-xl shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Unlock className="w-5 h-5"/>} Open Register
                </button>
              </form>
            ) : (
              <form onSubmit={closeRegister} className="space-y-6">
                <div className={`grid ${toNumber((activeSession as any).accumulatedTips) > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Starting Float</p>
                    <p className="text-xl font-black">R{toNumber((activeSession as any).openingFloat).toFixed(2)}</p>
                  </div>
                  <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Expected Cash</p>
                    <p className="text-xl font-black text-primary">R{toNumber((activeSession as any).expectedCash).toFixed(2)}</p>
                  </div>
                  {(toNumber((activeSession as any).accumulatedTips) > 0) && (
                    <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                      <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Tips</p>
                      <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">R{toNumber((activeSession as any).accumulatedTips).toFixed(2)}</p>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                   <div className="flex items-center gap-2 mb-4 text-slate-700 dark:text-slate-300">
                     <HandCoins className="w-5 h-5"/>
                     <h4 className="font-bold">Count Drawer</h4>
                   </div>
                   <DenominationCounter breakdown={closingBreakdown} setBreakdown={setClosingBreakdown} total={closeAmount} />
                </div>

                <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Notes / Explanations (Optional)</label>
                   <textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} rows={2} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none text-sm"/>
                </div>
                
                <button type="submit" disabled={isProcessing} className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase tracking-widest text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Lock className="w-5 h-5"/>} Submit Cash Up
                </button>
              </form>
            )}
          </div>
          
          <div className="hidden md:block w-px bg-slate-100 dark:bg-slate-800"></div>
          
          <div className="flex-1">
             {canManageCash && (
               <div className="mb-8">
                 <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-primary"/> Management Review</h3>
                 <div className="space-y-4">
                   {pendingReview.slice(0, 6).map(s => {
                     const diff = toNumber((s as any).difference);
                     return (
                       <div key={s.id} className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                         <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                           <div>
                             <div className="flex items-center gap-2 mb-1">
                               <p className="font-black">{s.staffName}</p>
                               <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${reviewBadge(s)}`}>{s.reviewStatus || 'submitted'}</span>
                             </div>
                             <p className="text-xs text-slate-500">Expected R{toNumber((s as any).expectedCash).toFixed(2)} - Counted R{toNumber((s as any).actualCash).toFixed(2)} - Variance R{diff.toFixed(2)}</p>
                             {s.notes && <p className="text-sm mt-2 text-slate-600 dark:text-slate-300">{s.notes}</p>}
                           </div>
                           <div className="flex gap-2">
                             <button type="button" disabled={isProcessing} onClick={() => reviewSession(s, 'reconciled')} className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-50"><CheckCircle2 className="w-4 h-4"/> Reconcile</button>
                             <button type="button" disabled={isProcessing} onClick={() => reviewSession(s, 'disputed')} className="px-3 py-2 bg-red-500 text-white rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-50"><XCircle className="w-4 h-4"/> Dispute</button>
                           </div>
                         </div>
                         <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-4">
                           <input value={varianceReasons[s.id] || ''} onChange={e => setVarianceReasons({ ...varianceReasons, [s.id]: e.target.value })} placeholder="Variance reason" className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none" />
                           <input value={managerNotes[s.id] || ''} onChange={e => setManagerNotes({ ...managerNotes, [s.id]: e.target.value })} placeholder="Manager notes" className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none" />
                         </div>
                       </div>
                     );
                   })}
                   {pendingReview.length === 0 && (
                     <div className="p-5 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-3">
                       <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                       <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">No cash ups waiting for review.</p>
                     </div>
                   )}
                 </div>
               </div>
             )}

             <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Calendar className="w-6 h-6 text-slate-400"/> Recent Sessions</h3>
             <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                {sessions.filter(s => s.status === 'closed').slice(0, 50).map(s => {
                   const opened = new Date(s.openedAt);
                   const closed = s.closedAt ? new Date(s.closedAt) : new Date();
                   const diff = toNumber((s as any).difference);
                   return (
                     <div key={s.id} className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-start mb-4">
                           <div>
                              <p className="font-bold text-base">{s.staffName}</p>
                              <p className="text-xs text-slate-500">{opened.toLocaleDateString()} {opened.toLocaleTimeString()} - {closed.toLocaleTimeString()}</p>
                           </div>
                           <div className="flex flex-col items-end gap-2">
                             <div className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest ${diff === 0 ? 'bg-emerald-100 text-emerald-700' : diff > 0 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                               {diff === 0 ? 'Balanced' : diff > 0 ? `+ R${diff.toFixed(2)} OVER` : `- R${Math.abs(diff).toFixed(2)} SHORT`}
                             </div>
                             <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${reviewBadge(s)}`}>{s.reviewStatus || 'submitted'}</div>
                           </div>
                        </div>
                        <div className="flex gap-4 text-sm font-medium border-t border-slate-200 dark:border-slate-700/60 pt-4">
                           <div className="flex-1">
                             <span className="text-slate-400 mr-2 text-[10px] uppercase tracking-widest block mb-1">Float</span> 
                             <span className="font-bold">R{toNumber((s as any).openingFloat).toFixed(2)}</span>
                           </div>
                           <div className="flex-1">
                             <span className="text-slate-400 mr-2 text-[10px] uppercase tracking-widest block mb-1">Expected</span> 
                             <span className="font-bold">R{toNumber((s as any).expectedCash).toFixed(2)}</span>
                           </div>
                           <div className="flex-1">
                             <span className="text-slate-400 mr-2 text-[10px] uppercase tracking-widest block mb-1">Actual</span> 
                             <span className="font-bold">R{toNumber((s as any).actualCash).toFixed(2)}</span>
                           </div>
                           <div className="flex-1">
                             <span className="text-emerald-500 mr-2 text-[10px] uppercase tracking-widest block mb-1">Tips</span> 
                             <span className="font-bold text-emerald-600 dark:text-emerald-400">R{toNumber((s as any).netTips).toFixed(2)}</span>
                           </div>
                        </div>
                     </div>
                   );
                })}
                {sessions.filter(s => s.status === 'closed').length === 0 && (
                   <div className="text-center py-12 flex flex-col items-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                     <AlertCircle className="w-8 h-8 text-slate-300 mb-3" />
                     <p className="text-sm text-slate-500 font-medium">No recent closed sessions found.</p>
                   </div>
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
