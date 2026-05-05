import React, { useState } from 'react';
import { Staff } from '../types';
import { Mail, Phone, Wallet, Loader2, DollarSign } from 'lucide-react';
import { apiPost, apiPut } from '../api';
import { usePosStore } from '../store/usePosStore';

interface StaffProfileViewProps {
  currentUserStaff: Staff | null;
}

export function StaffProfileView({ currentUserStaff }: StaffProfileViewProps) {
  const tenantId = usePosStore(s => s.tenantId);
  const [isProcessing, setIsProcessing] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState<number | string>('');
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  if (!currentUserStaff) {
    return <div className="p-8 text-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl m-8">No staff profile found.</div>;
  }

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserStaff) return;
    const amount = Number(payoutAmount);
    if (amount <= 0 || amount > (currentUserStaff.walletBalance || 0)) return;

    setIsProcessing(true);
    try {
      // 1. Update staff wallet balance
      await apiPut(`/api/mariadb/tenants/${tenantId}/staff/${currentUserStaff.id}`, {
        walletBalance: (currentUserStaff.walletBalance || 0) - amount,
      });

      // 2. Create payout request
      await apiPost(`/api/mariadb/tenants/${tenantId}/payout-requests`, {
        staffId: currentUserStaff.id,
        staffName: currentUserStaff.name,
        amount,
        status: 'pending',
        note: `Payout request from ${currentUserStaff.name}`,
      });

      setSuccessMsg(`Successfully requested payout of R${amount.toFixed(2)}`);
      setShowPayoutModal(false);
      setPayoutAmount('');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      console.error('Payout request failed:', err);
    }
    setIsProcessing(false);
  };

  return (
    <div className="flex-1 overflow-y-auto w-full pb-20 bg-slate-50/50 dark:bg-slate-950/50">
      <div className="max-w-4xl mx-auto p-4 lg:p-8 space-y-8">
        {successMsg && (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/20 font-bold mb-4 flex items-center justify-center">
            {successMsg}
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-3xl p-8 shadow-sm">
          <h2 className="text-3xl font-black mb-6 text-slate-900 dark:text-white">My Profile</h2>
          <div className="flex gap-4 items-center">
            <div className="w-16 h-16 bg-primary text-white rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg">
              {currentUserStaff.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{currentUserStaff.name}</h3>
              <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-1 rounded-full">{currentUserStaff.role}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <div className="space-y-4">
              <h4 className="text-[12px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Contact Details</h4>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300 font-medium">
                <Mail className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                {currentUserStaff.email}
              </div>
              {currentUserStaff.phone && (
                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300 font-medium">
                  <Phone className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                  {currentUserStaff.phone}
                </div>
              )}
              {currentUserStaff.idNumber && (
                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300 font-medium">
                  <div className="w-5 h-5 text-slate-400 dark:text-slate-500 font-bold flex items-center justify-center text-xs border border-slate-400 dark:border-slate-500 rounded-md">ID</div>
                  {currentUserStaff.idNumber}
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <h4 className="text-[12px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Employment Details</h4>
              <div className="bg-slate-50 dark:bg-[#0B1120] p-4 rounded-2xl space-y-2 border border-slate-100 dark:border-slate-800/60">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-slate-500">Rate</span>
                  <span className="font-bold text-slate-900 dark:text-white">R{currentUserStaff.payRate || 0} / {currentUserStaff.payType === 'salary' ? 'month' : 'hour'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-slate-500">Accumulated Leave</span>
                  <span className="font-bold text-slate-900 dark:text-white">{currentUserStaff.accumulatedLeave || 0} days</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-3xl p-8 shadow-sm text-center">
          <Wallet className="w-12 h-12 text-primary mx-auto mb-4" />
          <h4 className="text-[12px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">My Wallet Balance</h4>
          <h2 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter mb-8">
            R{(currentUserStaff.walletBalance || 0).toFixed(2)}
          </h2>
          
          <button 
            onClick={() => setShowPayoutModal(true)}
            disabled={(currentUserStaff.walletBalance || 0) <= 0}
            className="bg-primary text-white px-8 py-4 rounded-xl font-black tracking-widest text-xs uppercase shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2 mx-auto justify-center w-full max-w-sm"
          >
            <DollarSign className="w-4 h-4" /> Request Payout
          </button>
        </div>

        {showPayoutModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl">
               <h3 className="text-2xl font-black mb-4 text-slate-900 dark:text-white">Request Payout</h3>
               <form onSubmit={handleRequestPayout} className="space-y-4">
                 <div>
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-2 block">Amount</label>
                    <input type="number" max={currentUserStaff.walletBalance} step="0.01" required value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)} className="w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-4 py-3 bg-slate-50 dark:bg-[#0B1120] font-bold focus:outline-none focus:border-primary/50 text-slate-900 dark:text-white" />
                    <p className="text-xs text-slate-400 mt-2">Max allowed: R{(currentUserStaff.walletBalance || 0).toFixed(2)}</p>
                 </div>
                 <div className="flex gap-2 pt-4">
                    <button type="button" onClick={() => setShowPayoutModal(false)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">Cancel</button>
                    <button type="submit" disabled={isProcessing} className="flex-1 py-4 bg-primary text-white font-bold rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary/90 transition-all">
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Request'}
                    </button>
                 </div>
               </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
