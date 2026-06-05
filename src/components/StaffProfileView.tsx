import React, { useEffect, useState } from 'react';
import { Staff, StaffAttendanceStatus } from '../types';
import { Mail, Phone, Wallet, Loader2, DollarSign, Clock, Coffee, ShieldCheck, KeyRound } from 'lucide-react';
import { apiPost, clockInStaff, clockOutStaff, confirmTwoFactorSetup, disableTwoFactor, endStaffBreak, getMyAttendanceStatus, getTwoFactorStatus, revokeRefreshTokens, startStaffBreak, startTwoFactorSetup } from '../api';
import { usePosStore } from '../store/usePosStore';
import { useBrowserOnlineStatus } from '../hooks/useBrowserOnlineStatus';
import { WALLET_ONLINE_REQUIRED_MESSAGE } from '../utils/offlineGuards';

interface StaffProfileViewProps {
  currentUserStaff: Staff | null;
  onStaffUpdated?: () => Promise<void>;
}

export function StaffProfileView({ currentUserStaff, onStaffUpdated }: StaffProfileViewProps) {
  const tenantId = usePosStore(s => s.tenantId);
  const { isOffline: isBrowserOffline } = useBrowserOnlineStatus();
  const [isProcessing, setIsProcessing] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState<number | string>('');
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [attendance, setAttendance] = useState<StaffAttendanceStatus | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [twoFactorStatus, setTwoFactorStatus] = useState<{ eligible: boolean; enabled: boolean; confirmedAt?: string | null } | null>(null);
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [sessionRevokeLoading, setSessionRevokeLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadAttendance = async () => {
    if (!tenantId || !currentUserStaff?.id) return;
    try {
      setAttendance(await getMyAttendanceStatus(tenantId, currentUserStaff.id));
    } catch {
      setAttendance(null);
    }
  };

  const isTwoFactorEligible = ['admin', 'manager', 'dev'].includes(String(currentUserStaff?.role || '').toLowerCase());

  const loadTwoFactorStatus = async () => {
    if (!tenantId || !currentUserStaff?.id || !isTwoFactorEligible) return;
    try {
      setTwoFactorStatus(await getTwoFactorStatus());
    } catch {
      setTwoFactorStatus(null);
    }
  };

  useEffect(() => {
    void loadAttendance();
    void loadTwoFactorStatus();
  }, [tenantId, currentUserStaff?.id]);

  if (!currentUserStaff) {
    return <div className="p-8 text-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl m-8">No staff profile found.</div>;
  }

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserStaff) return;
    if (isBrowserOffline) {
      setErrorMsg(WALLET_ONLINE_REQUIRED_MESSAGE);
      return;
    }
    const amount = Number(payoutAmount);
    if (amount <= 0 || amount > (currentUserStaff.walletBalance || 0)) return;

    setIsProcessing(true);
    setErrorMsg('');
    try {
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
      await onStaffUpdated?.();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      console.error('Payout request failed:', err);
      setErrorMsg(err?.message || 'Payout request failed. Please try again.');
    }
    setIsProcessing(false);
  };

  const runAttendanceAction = async (action: 'clock-in' | 'break-start' | 'break-end' | 'clock-out') => {
    if (!tenantId || !currentUserStaff) return;
    if (isBrowserOffline) {
      setErrorMsg('Clock and break actions need an online connection.');
      return;
    }
    setAttendanceLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (action === 'clock-in') await clockInStaff(tenantId, { staffId: currentUserStaff.id });
      if (action === 'break-start') await startStaffBreak(tenantId, { staffId: currentUserStaff.id });
      if (action === 'break-end') await endStaffBreak(tenantId, { staffId: currentUserStaff.id });
      if (action === 'clock-out') await clockOutStaff(tenantId, { staffId: currentUserStaff.id });
      await loadAttendance();
      await onStaffUpdated?.();
      setSuccessMsg(action === 'clock-in' ? 'Clocked in.' : action === 'clock-out' ? 'Clocked out.' : action === 'break-start' ? 'Break started.' : 'Break ended.');
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Attendance action failed.');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const beginTwoFactorSetup = async () => {
    setTwoFactorLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setTwoFactorSetup(await startTwoFactorSetup());
      setTwoFactorCode('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to start 2FA setup.');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const confirmTwoFactor = async () => {
    if (!twoFactorCode.trim()) return;
    setTwoFactorLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await confirmTwoFactorSetup(twoFactorCode.trim());
      setTwoFactorSetup(null);
      setTwoFactorCode('');
      await loadTwoFactorStatus();
      setSuccessMsg('Two-factor authentication enabled.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to confirm 2FA code.');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const disableTwoFactorForProfile = async () => {
    if (!twoFactorPassword || !twoFactorCode.trim()) return;
    setTwoFactorLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await disableTwoFactor(twoFactorPassword, twoFactorCode.trim());
      setTwoFactorPassword('');
      setTwoFactorCode('');
      await loadTwoFactorStatus();
      setSuccessMsg('Two-factor authentication disabled.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to disable 2FA.');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const revokeProfileSessions = async () => {
    if (!currentUserStaff?.id) return;
    setSessionRevokeLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await revokeRefreshTokens(currentUserStaff.id, 'suspected_compromise');
      setSuccessMsg('Refresh sessions revoked.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to revoke refresh sessions.');
    } finally {
      setSessionRevokeLoading(false);
    }
  };

  const openAttendance = attendance?.openAttendance || null;
  const onBreak = Boolean(openAttendance?.breakStartedAt);

  return (
    <div className="flex-1 overflow-y-auto w-full pb-20 bg-slate-50/50 dark:bg-slate-950/50">
      <div className="max-w-4xl mx-auto p-4 lg:p-8 space-y-8">
        {successMsg && (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-4 rounded-xl border border-emerald-200 dark:border-emerald-500/20 font-bold mb-4 flex items-center justify-center">
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 p-4 rounded-xl border border-red-200 dark:border-red-500/20 font-bold mb-4 flex items-center justify-center">
            {errorMsg}
          </div>
        )}
        {isBrowserOffline && (
          <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 font-bold mb-4 flex items-center justify-center">
            {WALLET_ONLINE_REQUIRED_MESSAGE}
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

        {isTwoFactorEligible && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-3xl p-8 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-6 w-6 text-emerald-500" />
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white">Two-Factor Authentication</h3>
                </div>
                <p className="mt-2 text-xs font-black uppercase tracking-widest text-slate-400">
                  {twoFactorStatus?.enabled ? 'Enabled for this privileged account' : 'Recommended for admin, manager, and dev accounts'}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                twoFactorStatus?.enabled
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
              }`}>
                {twoFactorStatus?.enabled ? 'Protected' : 'Not enabled'}
              </span>
            </div>

            {!twoFactorStatus?.enabled && !twoFactorSetup && (
              <button
                type="button"
                onClick={() => void beginTwoFactorSetup()}
                disabled={twoFactorLoading}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                {twoFactorLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Set Up 2FA
              </button>
            )}

            {twoFactorSetup && (
              <div className="mt-5 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-200">Authenticator secret</p>
                  <p className="mt-1 break-all rounded-xl bg-white px-3 py-2 font-mono text-sm font-black text-slate-800 dark:bg-slate-900 dark:text-slate-100">{twoFactorSetup.secret}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-200">Authenticator URI</p>
                  <p className="mt-1 break-all rounded-xl bg-white px-3 py-2 font-mono text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{twoFactorSetup.otpauthUri}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={twoFactorCode}
                    onChange={e => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    className="flex-1 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-emerald-500 dark:border-emerald-900/60 dark:bg-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => void confirmTwoFactor()}
                    disabled={twoFactorLoading || twoFactorCode.length !== 6}
                    className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}

            {twoFactorStatus?.enabled && (
              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <input
                  type="password"
                  value={twoFactorPassword}
                  onChange={e => setTwoFactorPassword(e.target.value)}
                  placeholder="Current password"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-primary/50 dark:border-slate-800 dark:bg-[#0B1120] dark:text-white"
                />
                <input
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-primary/50 dark:border-slate-800 dark:bg-[#0B1120] dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => void disableTwoFactorForProfile()}
                  disabled={twoFactorLoading || !twoFactorPassword || twoFactorCode.length !== 6}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  Disable
                </button>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Signed-In Devices</p>
                <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Current profile</p>
              </div>
              <button
                type="button"
                onClick={() => void revokeProfileSessions()}
                disabled={sessionRevokeLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {sessionRevokeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Revoke
              </button>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-3xl p-8 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Clock className="h-6 w-6 text-primary" />
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">Time Clock</h3>
              </div>
              <p className="mt-2 text-xs font-black uppercase tracking-widest text-slate-400">
                {openAttendance
                  ? `${openAttendance.status} since ${String(openAttendance.clockInAt).slice(0, 16).replace('T', ' ')}`
                  : 'Not clocked in'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {!openAttendance && (
                <button
                  type="button"
                  onClick={() => void runAttendanceAction('clock-in')}
                  disabled={attendanceLoading || isBrowserOffline}
                  className="rounded-xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
                >
                  {attendanceLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Clock In'}
                </button>
              )}
              {openAttendance && !onBreak && (
                <button
                  type="button"
                  onClick={() => void runAttendanceAction('break-start')}
                  disabled={attendanceLoading || isBrowserOffline}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Coffee className="h-4 w-4" />
                  Start Break
                </button>
              )}
              {openAttendance && onBreak && (
                <button
                  type="button"
                  onClick={() => void runAttendanceAction('break-end')}
                  disabled={attendanceLoading || isBrowserOffline}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-100 px-5 py-3 text-xs font-black uppercase tracking-widest text-amber-700 disabled:opacity-50 dark:bg-amber-900/30 dark:text-amber-200"
                >
                  <Coffee className="h-4 w-4" />
                  End Break
                </button>
              )}
              {openAttendance && (
                <button
                  type="button"
                  onClick={() => void runAttendanceAction('clock-out')}
                  disabled={attendanceLoading || isBrowserOffline}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  Clock Out
                </button>
              )}
            </div>
          </div>

          {openAttendance && (
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Scheduled</p>
                <p className="mt-1 font-black text-slate-900 dark:text-white">{openAttendance.scheduledMinutes || 0}m</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Breaks</p>
                <p className="mt-1 font-black text-slate-900 dark:text-white">{openAttendance.breakMinutes || 0}m</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rate</p>
                <p className="mt-1 font-black text-slate-900 dark:text-white">R{Number(openAttendance.payRate || 0).toFixed(2)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mode</p>
                <p className="mt-1 font-black text-slate-900 dark:text-white">{openAttendance.payType}</p>
              </div>
            </div>
          )}

          {(attendance?.recentAttendance || []).length > 0 && (
            <div className="mt-5 space-y-2">
              {(attendance?.recentAttendance || []).slice(0, 4).map(row => (
                <div key={row.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500 dark:bg-slate-800/60 dark:text-slate-300">
                  <span>{String(row.clockInAt).slice(0, 16).replace('T', ' ')}</span>
                  <span>{row.status}</span>
                  <span>{row.workedMinutes || 0}m worked</span>
                  <span>R{Number(row.payrollAmount || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-3xl p-8 shadow-sm text-center">
          <Wallet className="w-12 h-12 text-primary mx-auto mb-4" />
          <h4 className="text-[12px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">My Wallet Balance</h4>
          <h2 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter mb-8">
            R{(currentUserStaff.walletBalance || 0).toFixed(2)}
          </h2>
          
          <button 
            onClick={() => {
              if (isBrowserOffline) {
                setErrorMsg(WALLET_ONLINE_REQUIRED_MESSAGE);
                return;
              }
              setShowPayoutModal(true);
            }}
            disabled={(currentUserStaff.walletBalance || 0) <= 0 || isBrowserOffline}
            title={isBrowserOffline ? WALLET_ONLINE_REQUIRED_MESSAGE : 'Request payout'}
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
                    <button type="submit" disabled={isProcessing || isBrowserOffline} className="flex-1 py-4 bg-primary text-white font-bold rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50">
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
