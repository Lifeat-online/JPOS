import { getTenantCollection, getTenantDoc } from '../tenantHelper';
import { usePosStore } from '../store/usePosStore';
import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, where, orderBy, getDocs, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { CashSession, Staff } from '../types';
import { Loader2, DollarSign, Calendar, Lock, Unlock, AlertCircle, HandCoins } from 'lucide-react';

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
  const tenantId = usePosStore(state => state.tenantId);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [openingBreakdown, setOpeningBreakdown] = useState<Record<string, number>>({});
  const [closingBreakdown, setClosingBreakdown] = useState<Record<string, number>>({});
  const [closeNotes, setCloseNotes] = useState("");

  const activeSession = sessions.find(s => s.status === 'open' && s.staffId === currentUserStaff?.id);
  const newFloat = Object.entries(openingBreakdown).reduce((acc, [val, qty]) => acc + (parseFloat(val) * Number(qty)), 0);
  const closeAmount = Object.entries(closingBreakdown).reduce((acc, [val, qty]) => acc + (parseFloat(val) * Number(qty)), 0);

  useEffect(() => {
    // If admin/manager, perhaps they can see all sessions. Here we listen to all open sessions or recent ones.
    const q = query(
      getTenantCollection(db, tenantId, "cashSessions"), 
      orderBy("openedAt", "desc")
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      let docs = snap.docs.map(d => ({id: d.id, ...(d.data() as any)} as CashSession));
      if (currentUserStaff?.role === 'cashier') {
        docs = docs.filter(s => s.staffId === currentUserStaff.id);
      }
      setSessions(docs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUserStaff?.role, currentUserStaff?.id]);

  const openRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserStaff) return;
    setIsProcessing(true);
    try {
      await addDoc(getTenantCollection(db, tenantId, "cashSessions"), {
        staffId: currentUserStaff.id,
        staffName: currentUserStaff.name,
        openedAt: serverTimestamp(),
        openingFloat: newFloat,
        openingBreakdown,
        expectedCash: newFloat,
        status: 'open'
      });
      setOpeningBreakdown({});
    } catch (err) {
      console.error(err);
    }
    setIsProcessing(false);
  };

  const closeRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    setIsProcessing(true);
    try {
      const difference = closeAmount - activeSession.expectedCash;
      let netTips = activeSession.accumulatedTips || 0;
      if (difference < 0) {
         netTips = Math.max(0, netTips + difference);
      }
      
      await updateDoc(getTenantDoc(db, tenantId, "cashSessions", activeSession.id), {
        status: 'closed',
        closedAt: serverTimestamp(),
        actualCash: closeAmount,
        closingBreakdown,
        difference: difference,
        netTips: netTips,
        notes: closeNotes
      });
      
      if (netTips > 0 && currentUserStaff) {
         await updateDoc(getTenantDoc(db, tenantId, "staff", currentUserStaff.id), {
            walletBalance: increment(netTips)
         });
      }
      setClosingBreakdown({});
      setCloseNotes("");
    } catch (err) {
      console.error(err);
    }
    setIsProcessing(false);
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-[1200px] mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Cash Management</h2>
          <p className="text-slate-500 font-medium">Manage drawer float, record cash ups, and view shift history.</p>
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
                <div className={`grid ${activeSession.accumulatedTips > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Starting Float</p>
                    <p className="text-xl font-black">R{activeSession.openingFloat.toFixed(2)}</p>
                  </div>
                  <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Expected Cash</p>
                    <p className="text-xl font-black text-primary">R{activeSession.expectedCash.toFixed(2)}</p>
                  </div>
                  {(activeSession.accumulatedTips > 0) && (
                    <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                      <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Tips</p>
                      <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">R{activeSession.accumulatedTips.toFixed(2)}</p>
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
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Lock className="w-5 h-5"/>} Close Register
                </button>
              </form>
            )}
          </div>
          
          <div className="hidden md:block w-px bg-slate-100 dark:bg-slate-800"></div>
          
          <div className="flex-1">
             <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Calendar className="w-6 h-6 text-slate-400"/> Recent Sessions</h3>
             <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                {sessions.filter(s => s.status === 'closed').slice(0, 50).map(s => {
                   const opened = s.openedAt?.toDate ? s.openedAt.toDate() : new Date();
                   const closed = s.closedAt?.toDate ? s.closedAt.toDate() : new Date();
                   const diff = s.difference || 0;
                   return (
                     <div key={s.id} className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-start mb-4">
                           <div>
                              <p className="font-bold text-base">{s.staffName}</p>
                              <p className="text-xs text-slate-500">{opened.toLocaleDateString()} {opened.toLocaleTimeString()} - {closed.toLocaleTimeString()}</p>
                           </div>
                           <div className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest ${diff === 0 ? 'bg-emerald-100 text-emerald-700' : diff > 0 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                             {diff === 0 ? 'Balanced' : diff > 0 ? `+ R${diff.toFixed(2)} OVER` : `- R${Math.abs(diff).toFixed(2)} SHORT`}
                           </div>
                        </div>
                        <div className="flex gap-4 text-sm font-medium border-t border-slate-200 dark:border-slate-700/60 pt-4">
                           <div className="flex-1">
                             <span className="text-slate-400 mr-2 text-[10px] uppercase tracking-widest block mb-1">Float</span> 
                             <span className="font-bold">R{s.openingFloat.toFixed(2)}</span>
                           </div>
                           <div className="flex-1">
                             <span className="text-slate-400 mr-2 text-[10px] uppercase tracking-widest block mb-1">Expected</span> 
                             <span className="font-bold">R{s.expectedCash.toFixed(2)}</span>
                           </div>
                           <div className="flex-1">
                             <span className="text-slate-400 mr-2 text-[10px] uppercase tracking-widest block mb-1">Actual</span> 
                             <span className="font-bold">R{(s.actualCash || 0).toFixed(2)}</span>
                           </div>
                           <div className="flex-1">
                             <span className="text-emerald-500 mr-2 text-[10px] uppercase tracking-widest block mb-1">Tips</span> 
                             <span className="font-bold text-emerald-600 dark:text-emerald-400">R{(s.netTips || 0).toFixed(2)}</span>
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
