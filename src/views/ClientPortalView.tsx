import React, { useState } from 'react';
import { JwtUser } from '../hooks/useAuth';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wallet, ShoppingBag, Star, Clock, CheckCircle2, XCircle,
  DollarSign, Loader2, LogOut, Moon, Sun, ChevronDown, ChevronUp,
  Receipt, Gift, User as UserIcon,
} from 'lucide-react';
import { createCustomerPayoutRequest } from '../api';
import { Customer, Sale, PayoutRequest } from '../types';
import { getDate } from '../utils/date';
import { useBrowserOnlineStatus } from '../hooks/useBrowserOnlineStatus';
import { WALLET_ONLINE_REQUIRED_MESSAGE } from '../utils/offlineGuards';

interface ClientPortalViewProps {
  user: JwtUser;
  customer: Customer;
  tenantId: string;
  sales: Sale[];
  payoutRequests: PayoutRequest[];
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onLogout: () => void;
  businessName?: string;
  onRefresh?: () => Promise<void>;
}

function formatDate(date: any): string {
  if (!date) return '—';
  const d = getDate(date);
  
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(amount: any, currency = 'R') {
  return `${currency}${Number(amount || 0).toFixed(2)}`;
}

const statusColors: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  paid:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  completed:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  failed:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  open:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  kitchen:  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

export function ClientPortalView({
  user, customer, tenantId, sales, payoutRequests,
  isDarkMode, toggleDarkMode, onLogout, businessName, onRefresh,
}: ClientPortalViewProps) {
  const { isOffline: isBrowserOffline } = useBrowserOnlineStatus();
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'wallet' | 'profile'>('overview');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutNote, setPayoutNote] = useState('');
  const [payoutProcessing, setPayoutProcessing] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState('');
  const [payoutError, setPayoutError] = useState('');
  const [expandedSale, setExpandedSale] = useState<string | null>(null);

  const walletBalance = customer.walletBalance || 0;
  const loyaltyPoints = customer.loyaltyPoints || customer.points || 0;
  const completedSales = sales.filter(s => s.status === 'completed');
  const totalSpent = completedSales.reduce((sum, s) => sum + s.total, 0);
  const pendingPayouts = payoutRequests.filter(r => r.status === 'pending');

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBrowserOffline) {
      setPayoutError(WALLET_ONLINE_REQUIRED_MESSAGE);
      return;
    }
    const amount = parseFloat(payoutAmount);
    if (!amount || amount <= 0 || amount > walletBalance) return;
    setPayoutProcessing(true);
    setPayoutError('');
    try {
      await createCustomerPayoutRequest(tenantId, {
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        amount,
        note: payoutNote || null,
        status: 'pending',
      });

      setPayoutSuccess(`Payout of ${formatCurrency(amount)} requested successfully.`);
      setPayoutAmount('');
      setPayoutNote('');
      await onRefresh?.();
      setTimeout(() => setPayoutSuccess(''), 6000);
    } catch (err: any) {
      console.error('Payout request failed:', err);
      setPayoutError(err?.message || 'Payout request failed. Please try again.');
    }
    setPayoutProcessing(false);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: UserIcon },
    { id: 'history', label: 'Purchases', icon: ShoppingBag },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'profile', label: 'Profile', icon: UserIcon },
  ] as const;

  return (
    <div className={`min-h-screen flex flex-col font-sans ${isDarkMode ? 'dark bg-slate-950' : 'bg-slate-50'}`}>
      {/* Header */}
      <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-8 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
            <ShoppingBag className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-black text-slate-900 dark:text-white text-sm leading-none">{businessName || "MasePOS"}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Customer Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleDarkMode} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-2">
            <img
              src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(customer.name)}&background=2563EB&color=fff`}
              alt="avatar"
              className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-slate-700"
            />
            <button onClick={onLogout} className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors hidden sm:block">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 flex gap-1 overflow-x-auto no-scrollbar">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3.5 text-sm font-bold whitespace-nowrap border-b-2 transition-all ${
              activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {id === 'wallet' && pendingPayouts.length > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                {pendingPayouts.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Welcome */}
              <div className="bg-primary rounded-3xl p-6 text-white">
                <p className="text-white/70 text-sm font-medium mb-1">Welcome back,</p>
                <h2 className="text-3xl font-black tracking-tight">{customer.name.split(' ')[0]}</h2>
                <p className="text-white/60 text-xs mt-1">{customer.email}</p>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Spent', value: formatCurrency(totalSpent), icon: Receipt, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
                  { label: 'Purchases', value: completedSales.length, icon: ShoppingBag, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                  { label: 'Loyalty Points', value: loyaltyPoints, icon: Gift, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20' },
                  { label: 'Wallet', value: formatCurrency(walletBalance), icon: Wallet, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                    <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
                    <p className={`text-xl font-black ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Recent purchases */}
              {completedSales.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <h3 className="font-black text-slate-900 dark:text-white">Recent Purchases</h3>
                    <button onClick={() => setActiveTab('history')} className="text-xs font-bold text-primary hover:underline">View all</button>
                  </div>
                  {completedSales.slice(0, 3).map(sale => (
                    <div key={sale.id} className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                      <div>
                        <p className="font-bold text-sm text-slate-800 dark:text-white">#{sale.id.slice(-8).toUpperCase()}</p>
                        <p className="text-xs text-slate-400">{formatDate(sale.createdAt)} · {sale.items.length} item{sale.items.length !== 1 ? 's' : ''}</p>
                      </div>
                      <p className="font-black text-slate-900 dark:text-white">{formatCurrency(sale.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Purchase History ── */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Purchase History</h2>
              {sales.length === 0 ? (
                <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <ShoppingBag className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No purchases yet</p>
                </div>
              ) : (
                sales.map(sale => (
                  <div key={sale.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <button
                      onClick={() => setExpandedSale(expandedSale === sale.id ? null : sale.id)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="text-left">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-black text-sm text-slate-900 dark:text-white">#{sale.id.slice(-8).toUpperCase()}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${statusColors[sale.status] || statusColors.pending}`}>
                            {sale.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{formatDate(sale.createdAt)} · {sale.paymentMethod.toUpperCase()}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-black text-slate-900 dark:text-white">{formatCurrency(sale.total)}</p>
                        {expandedSale === sale.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </button>

                    <AnimatePresence>
                      {expandedSale === sale.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-4 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
                            {sale.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className="text-slate-600 dark:text-slate-400">{item.quantity}× {item.name}</span>
                                <span className="font-bold text-slate-800 dark:text-white">{formatCurrency(item.price * item.quantity)}</span>
                              </div>
                            ))}
                            <div className="border-t border-slate-100 dark:border-slate-800 pt-2 mt-2 space-y-1">
                              {sale.taxAmount && sale.taxAmount > 0 && (
                                <div className="flex justify-between text-xs text-slate-400">
                                  <span>Tax ({sale.taxRate}%)</span>
                                  <span>{formatCurrency(sale.taxAmount)}</span>
                                </div>
                              )}
                              {sale.pointsDiscount && sale.pointsDiscount > 0 && (
                                <div className="flex justify-between text-xs text-emerald-600 dark:text-emerald-400">
                                  <span>Points discount</span>
                                  <span>−{formatCurrency(sale.pointsDiscount)}</span>
                                </div>
                              )}
                              <div className="flex justify-between font-black text-slate-900 dark:text-white">
                                <span>Total</span>
                                <span>{formatCurrency(sale.total)}</span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Wallet ── */}
          {activeTab === 'wallet' && (
            <div className="space-y-5">
              {/* Balance card */}
              <div className="bg-gradient-to-br from-primary to-blue-700 rounded-3xl p-6 text-white shadow-xl shadow-primary/30">
                <div className="flex items-center gap-2 mb-4 opacity-80">
                  <Wallet className="w-5 h-5" />
                  <span className="text-sm font-bold uppercase tracking-widest">Wallet Balance</span>
                </div>
                <p className="text-5xl font-black tracking-tighter mb-1">{formatCurrency(walletBalance)}</p>
                <p className="text-white/60 text-xs">Available for payout</p>
              </div>

              {/* Success message */}
              {payoutSuccess && (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  {payoutSuccess}
                </div>
              )}
              {payoutError && (
                <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 font-bold text-sm">
                  <XCircle className="w-5 h-5 shrink-0" />
                  {payoutError}
                </div>
              )}
              {isBrowserOffline && (
                <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl text-amber-800 dark:text-amber-200 font-bold text-sm">
                  <XCircle className="w-5 h-5 shrink-0" />
                  {WALLET_ONLINE_REQUIRED_MESSAGE}
                </div>
              )}

              {/* Request payout form */}
              {walletBalance > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <h3 className="font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-primary" />
                    Request Payout
                  </h3>
                  <form onSubmit={handleRequestPayout} className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Amount</label>
                      <input
                        required type="number" step="0.01" min="0.01" max={walletBalance}
                        value={payoutAmount}
                        onChange={e => setPayoutAmount(e.target.value)}
                        disabled={isBrowserOffline}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary/50 text-lg font-black text-center dark:text-white"
                        placeholder="0.00"
                      />
                      <p className="text-xs text-slate-400 mt-1 text-center">Max: {formatCurrency(walletBalance)}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Note (optional)</label>
                      <input
                        type="text"
                        value={payoutNote}
                        onChange={e => setPayoutNote(e.target.value)}
                        disabled={isBrowserOffline}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold dark:text-white"
                        placeholder="e.g. Bank transfer, cash pickup..."
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={payoutProcessing || isBrowserOffline || !payoutAmount || parseFloat(payoutAmount) <= 0}
                      title={isBrowserOffline ? WALLET_ONLINE_REQUIRED_MESSAGE : 'Request payout'}
                      className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {payoutProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <DollarSign className="w-5 h-5" />}
                      Request Payout
                    </button>
                  </form>
                </div>
              )}

              {/* Payout history */}
              {payoutRequests.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-black text-slate-900 dark:text-white">Payout History</h3>
                  </div>
                  {payoutRequests.map((req, idx) => (
                    <div key={req.id} className={`flex items-center justify-between px-5 py-3.5 gap-4 ${idx > 0 ? 'border-t border-slate-50 dark:border-slate-800/50' : ''}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${statusColors[req.status] || statusColors.pending}`}>
                            {req.status}
                          </span>
                          {req.note && <span className="text-xs text-slate-400 italic">"{req.note}"</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{formatDate(req.createdAt)}</p>
                      </div>
                      <p className="font-black text-slate-900 dark:text-white shrink-0">{formatCurrency(req.amount)}</p>
                    </div>
                  ))}
                </div>
              )}

              {walletBalance <= 0 && payoutRequests.length === 0 && (
                <div className="py-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <Wallet className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No wallet activity yet</p>
                </div>
              )}
            </div>
          )}

          {/* ── Profile ── */}
          {activeTab === 'profile' && (
            <div className="space-y-5">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <div className="flex items-center gap-4 mb-6">
                  <img
                    src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(customer.name)}&background=2563EB&color=fff&size=80`}
                    alt="avatar"
                    className="w-16 h-16 rounded-2xl border-2 border-slate-200 dark:border-slate-700"
                  />
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white">{customer.name}</h2>
                    <p className="text-sm text-slate-400">{customer.email}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { label: 'Phone', value: customer.phone || '—' },
                    { label: 'Address', value: customer.address || '—' },
                    { label: 'Member since', value: formatDate(customer.createdAt) },
                    { label: 'Loyalty Points', value: `${loyaltyPoints} pts` },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <span className="text-sm font-medium text-slate-500">{label}</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={onLogout}
                className="w-full py-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/40 active:scale-95 transition-all"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
