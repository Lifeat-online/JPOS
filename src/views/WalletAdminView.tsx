import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet, CheckCircle2, XCircle, Clock, DollarSign,
  ChevronDown, ChevronUp, Loader2, Plus, Minus,
} from 'lucide-react';
import {
  query, onSnapshot, updateDoc, addDoc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Staff, PayoutRequest } from '../types';
import { getTenantCollection, getTenantDoc } from '../tenantHelper';
import { usePosStore } from '../store/usePosStore';

interface WalletAdminViewProps {
  staff: Staff[];
  currentUserStaff: Staff | null;
}

export function WalletAdminView({ staff, currentUserStaff }: WalletAdminViewProps) {
  const tenantId = usePosStore(s => s.tenantId);
  const [requests, setRequests] = useState<PayoutRequest[]>([]);
  const [clientRequests, setClientRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'requests' | 'client-requests' | 'balances'>('requests');
  const [adjustModal, setAdjustModal] = useState<{ staffId: string; name: string; current: number } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'deduct'>('add');
  const [adjustProcessing, setAdjustProcessing] = useState(false);

  // Staff payout requests
  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      getTenantCollection(db, tenantId, 'payoutRequests'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayoutRequest)));
      setLoading(false);
    }, err => { console.error('Payout requests error:', err); setLoading(false); });
    return () => unsub();
  }, [tenantId]);

  // Customer payout requests
  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      getTenantCollection(db, tenantId, 'customerPayoutRequests'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setClientRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayoutRequest)));
    }, err => console.error('Customer payout requests error:', err));
    return () => unsub();
  }, [tenantId]);

  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'pending'), [requests]);
  const processedRequests = useMemo(() => requests.filter(r => r.status !== 'pending'), [requests]);
  const pendingClientRequests = useMemo(() => clientRequests.filter(r => r.status === 'pending'), [clientRequests]);

  const getStaffName = (staffId: string) =>
    staff.find(s => s.id === staffId)?.name || staffId.slice(0, 8) + '…';

  const totalWalletBalance = useMemo(
    () => staff.reduce((sum, s) => sum + (s.walletBalance || 0), 0),
    [staff]
  );

  const handleApprove = async (req: PayoutRequest) => {
    if (!tenantId) return;
    setProcessing(req.id);
    try {
      await updateDoc(getTenantDoc(db, tenantId, 'payoutRequests', req.id), {
        status: 'approved',
        processedAt: serverTimestamp(),
        processedBy: currentUserStaff?.id || 'admin',
      });
    } catch (err) { console.error(err); }
    setProcessing(null);
  };

  const handleReject = async (req: PayoutRequest) => {
    if (!tenantId) return;
    setProcessing(req.id);
    try {
      // Refund the amount back to the staff wallet
      const staffMember = staff.find(s => s.id === req.staffId);
      if (staffMember) {
        await updateDoc(getTenantDoc(db, tenantId, 'staff', req.staffId), {
          walletBalance: (staffMember.walletBalance || 0) + req.amount,
        });
      }
      await updateDoc(getTenantDoc(db, tenantId, 'payoutRequests', req.id), {
        status: 'rejected',
        processedAt: serverTimestamp(),
        processedBy: currentUserStaff?.id || 'admin',
      });
    } catch (err) { console.error(err); }
    setProcessing(null);
  };

  const handleMarkPaid = async (req: PayoutRequest) => {
    if (!tenantId) return;
    setProcessing(req.id);
    try {
      await updateDoc(getTenantDoc(db, tenantId, 'payoutRequests', req.id), {
        status: 'paid',
        processedAt: serverTimestamp(),
        processedBy: currentUserStaff?.id || 'admin',
      });
    } catch (err) { console.error(err); }
    setProcessing(null);
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModal || !tenantId) return;
    const amount = parseFloat(adjustAmount);
    if (!amount || amount <= 0) return;
    setAdjustProcessing(true);
    try {
      const delta = adjustType === 'add' ? amount : -amount;
      const newBalance = Math.max(0, adjustModal.current + delta);
      await updateDoc(getTenantDoc(db, tenantId, 'staff', adjustModal.staffId), {
        walletBalance: newBalance,
      });
      // Log the adjustment as a payout request for audit trail
      await addDoc(getTenantCollection(db, tenantId, 'payoutRequests'), {
        staffId: adjustModal.staffId,
        staffName: adjustModal.name,
        amount: Math.abs(delta),
        status: 'paid',
        note: `Manual ${adjustType === 'add' ? 'credit' : 'debit'}: ${adjustNote || 'Admin adjustment'}`,
        createdAt: serverTimestamp(),
        processedAt: serverTimestamp(),
        processedBy: currentUserStaff?.id || 'admin',
      });
      setAdjustModal(null);
      setAdjustAmount('');
      setAdjustNote('');
    } catch (err) { console.error(err); }
    setAdjustProcessing(false);
  };

  const statusConfig = {
    pending:  { label: 'Pending',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    approved: { label: 'Approved', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    paid:     { label: 'Paid',     color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  };

  return (
    <div className="flex-1 p-4 lg:p-8 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <Wallet className="w-7 h-7 text-primary" />
              Wallet Administration
            </h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
              Manage staff wallets and payout requests
            </p>
          </div>
          {pendingRequests.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-black text-amber-700 dark:text-amber-400">
                {pendingRequests.length} pending request{pendingRequests.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Total Wallet Liability</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">R{totalWalletBalance.toFixed(2)}</p>
            <p className="text-xs text-slate-400 mt-1">Across {staff.length} staff members</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Pending Payouts</p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
              R{pendingRequests.reduce((s, r) => s + r.amount, 0).toFixed(2)}
            </p>
            <p className="text-xs text-slate-400 mt-1">{pendingRequests.length} request{pendingRequests.length !== 1 ? 's' : ''} awaiting</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Total Paid Out</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              R{requests.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0).toFixed(2)}
            </p>
            <p className="text-xs text-slate-400 mt-1">All time</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
          {([
            { id: 'requests', label: `Staff Payouts${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}` },
            { id: 'client-requests', label: `Client Payouts${pendingClientRequests.length > 0 ? ` (${pendingClientRequests.length})` : ''}` },
            { id: 'balances', label: 'Staff Balances' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Payout Requests Tab ── */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : requests.length === 0 ? (
              <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <DollarSign className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No payout requests yet</p>
              </div>
            ) : (
              <>
                {/* Pending first */}
                {pendingRequests.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 px-1">
                      Awaiting Action
                    </h3>
                    {pendingRequests.map(req => (
                      <div key={req.id} className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-amber-200 dark:border-amber-800/50 p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-8 h-8 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl flex items-center justify-center font-black text-sm">
                                {getStaffName(req.staffId).charAt(0)}
                              </div>
                              <span className="font-black text-slate-900 dark:text-white">{getStaffName(req.staffId)}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${statusConfig.pending.color}`}>
                                Pending
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 ml-10">
                              Requested {req.createdAt?.toDate?.()?.toLocaleString() || 'recently'}
                            </p>
                            {req.note && <p className="text-xs text-slate-500 ml-10 mt-1 italic">"{req.note}"</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black text-slate-900 dark:text-white">R{req.amount.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                          <button
                            onClick={() => handleReject(req)}
                            disabled={processing === req.id}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {processing === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                            Reject & Refund
                          </button>
                          <button
                            onClick={() => handleApprove(req)}
                            disabled={processing === req.id}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {processing === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Approve
                          </button>
                          <button
                            onClick={() => handleMarkPaid(req)}
                            disabled={processing === req.id}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50 shadow-sm flex items-center justify-center gap-2"
                          >
                            {processing === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                            Mark Paid
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Processed history */}
                {processedRequests.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mt-4">
                      History
                    </h3>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                      {processedRequests.map((req, idx) => (
                        <div key={req.id} className={`flex items-center justify-between px-5 py-3.5 gap-4 ${idx > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center font-black text-xs text-slate-600 dark:text-slate-400 shrink-0">
                              {getStaffName(req.staffId).charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-slate-800 dark:text-white truncate">{getStaffName(req.staffId)}</p>
                              <p className="text-xs text-slate-400 truncate">
                                {req.processedAt?.toDate?.()?.toLocaleDateString() || '—'}
                                {req.note && ` · ${req.note}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-black text-slate-900 dark:text-white">R{req.amount.toFixed(2)}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${statusConfig[req.status]?.color || statusConfig.pending.color}`}>
                              {statusConfig[req.status]?.label || req.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Client Payout Requests Tab ── */}
        {activeTab === 'client-requests' && (
          <div className="space-y-4">
            {clientRequests.length === 0 ? (
              <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <DollarSign className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No client payout requests</p>
              </div>
            ) : (
              <>
                {pendingClientRequests.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 px-1">Awaiting Action</h3>
                    {pendingClientRequests.map(req => (
                      <div key={req.id} className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-amber-200 dark:border-amber-800/50 p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-xl flex items-center justify-center font-black text-sm">
                                {(req.customerName || 'C').charAt(0)}
                              </div>
                              <div>
                                <span className="font-black text-slate-900 dark:text-white">{req.customerName || 'Customer'}</span>
                                <span className="text-xs text-slate-400 ml-2">{req.customerEmail}</span>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${statusConfig.pending.color}`}>Pending</span>
                            </div>
                            <p className="text-xs text-slate-400 ml-10">{req.createdAt?.toDate?.()?.toLocaleString() || 'recently'}</p>
                            {req.note && <p className="text-xs text-slate-500 ml-10 mt-1 italic">"{req.note}"</p>}
                          </div>
                          <p className="text-2xl font-black text-slate-900 dark:text-white">R{req.amount.toFixed(2)}</p>
                        </div>
                        <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                          <button
                            onClick={async () => {
                              if (!tenantId) return;
                              setProcessing(req.id);
                              // Refund to customer wallet
                              try {
                                // Find customer and refund
                                await updateDoc(getTenantDoc(db, tenantId, 'customerPayoutRequests', req.id), {
                                  status: 'rejected', processedAt: serverTimestamp(), processedBy: currentUserStaff?.id || 'admin',
                                });
                                // Note: refunding customer wallet would require knowing their customer doc ID
                                // For now just mark rejected — admin can manually credit via customer edit
                              } catch (err) { console.error(err); }
                              setProcessing(null);
                            }}
                            disabled={processing === req.id}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {processing === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                            Reject
                          </button>
                          <button
                            onClick={async () => {
                              if (!tenantId) return;
                              setProcessing(req.id);
                              try {
                                await updateDoc(getTenantDoc(db, tenantId, 'customerPayoutRequests', req.id), {
                                  status: 'paid', processedAt: serverTimestamp(), processedBy: currentUserStaff?.id || 'admin',
                                });
                              } catch (err) { console.error(err); }
                              setProcessing(null);
                            }}
                            disabled={processing === req.id}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50 shadow-sm flex items-center justify-center gap-2"
                          >
                            {processing === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                            Mark Paid
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {clientRequests.filter(r => r.status !== 'pending').length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mt-4">History</h3>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                      {clientRequests.filter(r => r.status !== 'pending').map((req, idx) => (
                        <div key={req.id} className={`flex items-center justify-between px-5 py-3.5 gap-4 ${idx > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}>
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-slate-800 dark:text-white truncate">{req.customerName || 'Customer'}</p>
                            <p className="text-xs text-slate-400 truncate">{req.processedAt?.toDate?.()?.toLocaleDateString() || '—'}{req.note && ` · ${req.note}`}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-black text-slate-900 dark:text-white">R{req.amount.toFixed(2)}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${statusConfig[req.status]?.color || statusConfig.pending.color}`}>
                              {statusConfig[req.status]?.label || req.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Staff Balances Tab ── */}
        {activeTab === 'balances' && (
          <div className="space-y-3">
            {staff.map(s => (
              <div key={s.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl flex items-center justify-center font-black text-lg">
                    {s.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{s.name}</p>
                    <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">{s.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Balance</p>
                    <p className={`text-xl font-black ${(s.walletBalance || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                      R{(s.walletBalance || 0).toFixed(2)}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setAdjustModal({ staffId: s.id, name: s.name, current: s.walletBalance || 0 });
                      setAdjustAmount('');
                      setAdjustNote('');
                      setAdjustType('add');
                    }}
                    className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                  >
                    Adjust
                  </button>
                </div>
              </div>
            ))}
            {staff.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-sm font-black uppercase tracking-widest">No staff found</div>
            )}
          </div>
        )}
      </div>

      {/* Adjust Balance Modal */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-1">Adjust Wallet</h3>
            <p className="text-sm text-slate-500 mb-6">
              {adjustModal.name} · Current balance: <span className="font-bold text-slate-900 dark:text-white">R{adjustModal.current.toFixed(2)}</span>
            </p>
            <form onSubmit={handleAdjustBalance} className="space-y-4">
              {/* Add / Deduct toggle */}
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setAdjustType('add')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${adjustType === 'add' ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  <Plus className="w-4 h-4" /> Credit
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('deduct')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${adjustType === 'deduct' ? 'bg-white dark:bg-slate-900 text-red-600 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  <Minus className="w-4 h-4" /> Debit
                </button>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Amount (R)</label>
                <input
                  required type="number" step="0.01" min="0.01"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary/50 text-lg font-black text-center dark:text-white"
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Note (optional)</label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold dark:text-white"
                  placeholder="e.g. Tip payout, bonus..."
                />
              </div>

              {adjustAmount && (
                <div className={`p-3 rounded-xl text-sm font-bold text-center ${adjustType === 'add' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                  New balance: R{Math.max(0, adjustModal.current + (adjustType === 'add' ? 1 : -1) * (parseFloat(adjustAmount) || 0)).toFixed(2)}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setAdjustModal(null)} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustProcessing || !adjustAmount}
                  className={`flex-1 py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 ${adjustType === 'add' ? 'bg-emerald-500 hover:bg-emerald-600 shadow-sm' : 'bg-red-500 hover:bg-red-600 shadow-sm'}`}
                >
                  {adjustProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : adjustType === 'add' ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                  {adjustType === 'add' ? 'Credit Wallet' : 'Debit Wallet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
