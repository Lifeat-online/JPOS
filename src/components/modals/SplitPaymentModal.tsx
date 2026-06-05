import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Loader2, Wallet, CreditCard, Banknote, ReceiptText, Users } from 'lucide-react';
import { WALLET_ONLINE_REQUIRED_MESSAGE } from '../../utils/offlineGuards';
import {
  BillSplitAssignments,
  BillSplitMode,
  billSplitModeLabel,
  equalBillShares,
  labeledBillShares,
  normalizeBillSplitItems,
} from '../../utils/billSplits';

interface SplitPaymentModalProps {
  isOpen: boolean;
  cartTotal: number;
  isProcessing: boolean;
  onConfirm: (payments: any[]) => void;
  onClose: () => void;
  customerWalletBalance?: number;
  customerAccountRemaining?: number;
  customerAccountEnabled?: boolean;
  offlineMode?: boolean;
  billSplitEnabled?: boolean;
  billSplitItems?: any[];
  billSplitTableLabel?: string | null;
  billSplitTableOptions?: string[];
}

export const SplitPaymentModal: React.FC<SplitPaymentModalProps> = ({
  isOpen, cartTotal, isProcessing, onConfirm, onClose, customerWalletBalance = 0, customerAccountRemaining = 0, customerAccountEnabled = false, offlineMode = false,
  billSplitEnabled = false, billSplitItems = [], billSplitTableLabel = null, billSplitTableOptions = []
}) => {
  const [payments, setPayments] = useState<any[]>([]);
  const [currentMethod, setCurrentMethod] = useState<'cash' | 'card' | 'wallet' | 'account'>('cash');
  const [currentAmount, setCurrentAmount] = useState<string>('');
  const [tenderedAmount, setTenderedAmount] = useState<string>('');
  const [overageAction, setOverageAction] = useState<'tip' | 'cashout'>('tip');
  const [cardProvider, setCardProvider] = useState('yoco');
  const [cardProviderDeviceId, setCardProviderDeviceId] = useState('');
  const [cardProviderReference, setCardProviderReference] = useState('');
  const [cardAuthorizationCode, setCardAuthorizationCode] = useState('');
  const [cardProviderStatus, setCardProviderStatus] = useState<'approved' | 'settled' | 'pending'>('approved');
  const [cardProviderNote, setCardProviderNote] = useState('');
  const [billSplitMode, setBillSplitMode] = useState<BillSplitMode>('person');
  const [billPersonCount, setBillPersonCount] = useState(2);
  const [billSeatCount, setBillSeatCount] = useState(2);
  const [billTableLabels, setBillTableLabels] = useState('');
  const [billAssignments, setBillAssignments] = useState<BillSplitAssignments>({});
  const [selectedBillShareId, setSelectedBillShareId] = useState<string | null>(null);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, cartTotal - totalPaid);
  const accountPaid = payments.reduce((sum, p) => sum + (p.method === 'account' ? Number(p.amount || 0) : 0), 0);
  const accountRemainingAfterPayments = Math.max(0, Number(customerAccountRemaining || 0) - accountPaid);
  const cardTerminalReady = currentMethod !== 'card' || (cardProvider.trim().length > 0 && cardProviderDeviceId.trim().length > 0);
  const billItems = useMemo(() => normalizeBillSplitItems(billSplitItems), [billSplitItems]);
  const billTableList = useMemo(() => {
    const typed = billTableLabels.split(',').map(label => label.trim()).filter(Boolean);
    if (typed.length > 0) return typed.slice(0, 12);
    const options = billSplitTableOptions.map(label => String(label || '').trim()).filter(Boolean);
    if (options.length > 0) return options.slice(0, 4);
    return [billSplitTableLabel || 'Current table', 'Table 2'];
  }, [billSplitTableLabel, billTableLabels, billSplitTableOptions]);
  const billSplitLabels = useMemo(() => (
    billSplitMode === 'seat'
      ? Array.from({ length: Math.max(1, Math.min(12, billSeatCount)) }, (_, index) => `Seat ${index + 1}`)
      : billTableList
  ), [billSeatCount, billSplitMode, billTableList]);
  const billSplitPlan = useMemo(() => {
    if (!billSplitEnabled) return { shares: [], unassignedTotal: 0 };
    if (billSplitMode === 'person') {
      return { shares: equalBillShares(cartTotal, billPersonCount, 'Person'), unassignedTotal: 0 };
    }
    return labeledBillShares(billItems, billSplitLabels, billAssignments);
  }, [billAssignments, billItems, billPersonCount, billSplitEnabled, billSplitLabels, billSplitMode, cartTotal]);
  const selectedBillShare = billSplitPlan.shares.find(share => share.id === selectedBillShareId) || null;

  useEffect(() => {
    if (!isOpen || !billSplitEnabled || billTableLabels.trim()) return;
    const initialLabels = [
      billSplitTableLabel || billSplitTableOptions[0] || 'Current table',
      billSplitTableOptions.find(label => label !== billSplitTableLabel) || 'Table 2',
    ].map(label => String(label || '').trim()).filter(Boolean);
    setBillTableLabels(Array.from(new Set(initialLabels)).slice(0, 4).join(', '));
  }, [billSplitEnabled, billSplitTableLabel, billSplitTableOptions, billTableLabels, isOpen]);

  useEffect(() => {
    if (offlineMode && (currentMethod === 'wallet' || currentMethod === 'account')) {
      setCurrentMethod('cash');
    }
  }, [currentMethod, offlineMode]);

  const addPayment = () => {
    if (offlineMode && (currentMethod === 'wallet' || currentMethod === 'account')) return;
    if (!cardTerminalReady) return;
    const amount = Number(currentAmount);
    if (isNaN(amount) || amount <= 0) return;

    const tendered = Number(tenderedAmount || currentAmount);
    const overage = Math.max(0, tendered - amount);

    const newPayment: any = {
      method: currentMethod,
      amount: amount,
      tenderedAmount: tendered,
      changeAmount: currentMethod === 'cash' ? overage : 0,
      tipAmount: (currentMethod === 'card' && overageAction === 'tip') ? overage : 0,
      cashOutAmount: (currentMethod === 'card' && overageAction === 'cashout') ? overage : 0,
    };

    if (currentMethod === 'card') {
      Object.assign(newPayment, {
        provider: cardProvider.trim(),
        providerDeviceId: cardProviderDeviceId.trim(),
        providerReference: cardProviderReference.trim() || null,
        authorizationCode: cardAuthorizationCode.trim() || cardProviderReference.trim() || null,
        providerStatus: cardProviderStatus,
        providerNote: cardProviderNote.trim() || null,
      });
    }

    if (selectedBillShare) {
      const splitNote = `${billSplitModeLabel(billSplitMode)} split: ${selectedBillShare.label}`;
      Object.assign(newPayment, {
        billSplitMode,
        billSplitShareId: selectedBillShare.id,
        billSplitLabel: selectedBillShare.label,
        providerNote: [newPayment.providerNote, splitNote].filter(Boolean).join(' | '),
      });
    }

    setPayments([...payments, newPayment]);
    setCurrentAmount('');
    setTenderedAmount('');
    setSelectedBillShareId(null);
    setCardProviderReference('');
    setCardAuthorizationCode('');
    setCardProviderNote('');
  };

  const removePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    if (totalPaid < cartTotal) return;
    onConfirm(payments);
  };

  const applyBillShare = (share: { id: string; total: number }) => {
    setSelectedBillShareId(share.id);
    const amount = share.total.toFixed(2);
    setCurrentAmount(amount);
    setTenderedAmount(amount);
  };

  const updateBillAssignment = (itemId: string, shareId: string) => {
    setBillAssignments(assignments => ({
      ...assignments,
      [itemId]: shareId,
    }));
    setSelectedBillShareId(null);
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/20"
      >
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Split Payment
            </h3>
            <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">
              Add multiple tenders to complete checkout
            </p>
          </div>
          <button onClick={onClose} className="p-3 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto pr-2">
          {/* Left Side: Add Payment */}
          <div className="space-y-6">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-700/50">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Remaining</span>
                <span className="text-2xl font-black text-primary">R{remaining.toFixed(2)}</span>
              </div>
              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(totalPaid / cartTotal) * 100}%` }}
                  className="h-full bg-primary"
                />
              </div>
            </div>

            <div className="space-y-4">
              {billSplitEnabled && billItems.length > 0 && (
                <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-900">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <Users className="h-4 w-4" />
                      Bill Split
                    </div>
                    {selectedBillShare && (
                      <span className="rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                        {selectedBillShare.label}
                      </span>
                    )}
                  </div>

                  <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-[#0B1120]">
                    {(['person', 'seat', 'table'] as BillSplitMode[]).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setBillSplitMode(mode);
                          setSelectedBillShareId(null);
                        }}
                        className={`rounded-xl px-2 py-2 text-[10px] font-black uppercase tracking-widest ${billSplitMode === mode ? 'bg-white text-primary shadow-sm dark:bg-slate-800' : 'text-slate-400'}`}
                      >
                        {mode === 'person' ? 'Person' : mode === 'seat' ? 'Seat' : 'Table'}
                      </button>
                    ))}
                  </div>

                  {billSplitMode === 'person' ? (
                    <div className="mb-3 grid grid-cols-[1fr_auto] items-end gap-3">
                      <label className="block">
                        <span className="mb-1 block px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">People</span>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={billPersonCount}
                          onChange={event => setBillPersonCount(Math.max(1, Math.min(20, Number(event.target.value || 1))))}
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black dark:border-slate-700 dark:bg-slate-950"
                        />
                      </label>
                      <span className="pb-3 text-xs font-black text-slate-400">R{cartTotal.toFixed(2)}</span>
                    </div>
                  ) : (
                    <div className="mb-3 space-y-3">
                      {billSplitMode === 'seat' ? (
                        <label className="block">
                          <span className="mb-1 block px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Seats</span>
                          <input
                            type="number"
                            min="1"
                            max="12"
                            value={billSeatCount}
                            onChange={event => setBillSeatCount(Math.max(1, Math.min(12, Number(event.target.value || 1))))}
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black dark:border-slate-700 dark:bg-slate-950"
                          />
                        </label>
                      ) : (
                        <label className="block">
                          <span className="mb-1 block px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Tables</span>
                          <input
                            value={billTableLabels}
                            onChange={event => {
                              setBillTableLabels(event.target.value);
                              setSelectedBillShareId(null);
                            }}
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black dark:border-slate-700 dark:bg-slate-950"
                          />
                        </label>
                      )}

                      <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
                        {billItems.map(item => (
                          <div key={item.id} className="grid grid-cols-[1fr_130px] items-center gap-2 rounded-xl bg-slate-50 p-2 dark:bg-[#0B1120]">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black text-slate-700 dark:text-slate-200">{item.quantity}x {item.name}</p>
                              <p className="text-[10px] font-bold text-slate-400">R{(item.price * item.quantity).toFixed(2)}</p>
                            </div>
                            <select
                              value={billAssignments[item.id] || ''}
                              onChange={event => updateBillAssignment(item.id, event.target.value)}
                              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-black dark:border-slate-700 dark:bg-slate-950"
                            >
                              <option value="">Unassigned</option>
                              {billSplitPlan.shares.map(share => (
                                <option key={share.id} value={share.id}>{share.label}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    {billSplitPlan.shares.map(share => {
                      const paid = payments.some(payment => payment.billSplitShareId === share.id);
                      return (
                        <button
                          key={share.id}
                          type="button"
                          disabled={share.total <= 0}
                          onClick={() => applyBillShare(share)}
                          className={`rounded-xl border px-3 py-2 text-left transition-all disabled:opacity-35 ${
                            selectedBillShareId === share.id
                              ? 'border-primary bg-primary text-white'
                              : paid
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300'
                                : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-[#0B1120] dark:text-slate-300'
                          }`}
                        >
                          <span className="block truncate text-[10px] font-black uppercase tracking-widest">{share.label}</span>
                          <span className="mt-1 block text-base font-black">R{share.total.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>

                  {billSplitPlan.unassignedTotal > 0 && (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                      Unassigned R{billSplitPlan.unassignedTotal.toFixed(2)}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 p-1 bg-slate-100 dark:bg-[#0B1120] rounded-2xl border border-slate-200 dark:border-slate-700/60">
                <button
                  onClick={() => setCurrentMethod('cash')}
                  className={`flex-1 py-3 flex flex-col items-center gap-1 rounded-xl transition-all ${currentMethod === 'cash' ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-400'}`}
                >
                  <Banknote className="w-5 h-5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Cash</span>
                </button>
                <button
                  onClick={() => setCurrentMethod('card')}
                  className={`flex-1 py-3 flex flex-col items-center gap-1 rounded-xl transition-all ${currentMethod === 'card' ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-400'}`}
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Card</span>
                </button>
                <button
                  onClick={() => setCurrentMethod('wallet')}
                  disabled={offlineMode || customerWalletBalance <= 0}
                  title={offlineMode ? WALLET_ONLINE_REQUIRED_MESSAGE : 'Wallet'}
                  className={`flex-1 py-3 flex flex-col items-center gap-1 rounded-xl transition-all ${currentMethod === 'wallet' ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-400'} disabled:opacity-30`}
                >
                  <Wallet className="w-5 h-5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Wallet</span>
                </button>
                <button
                  onClick={() => setCurrentMethod('account')}
                  disabled={offlineMode || !customerAccountEnabled || accountRemainingAfterPayments <= 0}
                  title={offlineMode ? 'Account payments require online mode' : 'Account'}
                  className={`flex-1 py-3 flex flex-col items-center gap-1 rounded-xl transition-all ${currentMethod === 'account' ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-400'} disabled:opacity-30`}
                >
                  <ReceiptText className="w-5 h-5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Account</span>
                </button>
              </div>

              <div className="space-y-4">
                {offlineMode && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-black uppercase tracking-widest text-amber-700">
                    Offline split payments can use cash and external card only.
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
                    Amount to Pay
                  </label>
                  <input
                    type="number" step="0.01"
                    aria-label="Amount to pay"
                    placeholder={remaining.toFixed(2)}
                    value={currentAmount}
                    onChange={e => {
                      setCurrentAmount(e.target.value);
                      setSelectedBillShareId(null);
                    }}
                    className="w-full text-2xl font-black px-4 py-4 bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-slate-700/60 rounded-2xl focus:outline-none focus:border-primary/50"
                  />
                </div>

                {currentMethod === 'wallet' && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-violet-500 px-1">
                    Client wallet: R{Number(customerWalletBalance || 0).toFixed(2)}
                  </p>
                )}

                {currentMethod === 'account' && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 px-1">
                    Account remaining: R{accountRemainingAfterPayments.toFixed(2)}
                  </p>
                )}

                {currentMethod === 'cash' && (
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
                      Tendered (Optional)
                    </label>
                    <input
                      type="number" step="0.01"
                      aria-label="Cash tendered"
                      placeholder={currentAmount || remaining.toFixed(2)}
                      value={tenderedAmount}
                      onChange={e => setTenderedAmount(e.target.value)}
                      className="w-full text-2xl font-black px-4 py-4 bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-slate-700/60 rounded-2xl focus:outline-none focus:border-primary/50"
                    />
                  </div>
                )}

                {currentMethod === 'card' && Number(tenderedAmount || currentAmount) > Number(currentAmount) && (
                  <div className="flex bg-slate-100 dark:bg-[#0B1120] p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700/60">
                    <button
                      onClick={() => setOverageAction('tip')}
                      className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${overageAction === 'tip' ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-400'}`}
                    >
                      Tip
                    </button>
                    <button
                      onClick={() => setOverageAction('cashout')}
                      className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${overageAction === 'cashout' ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-400'}`}
                    >
                      Cashout
                    </button>
                  </div>
                )}

                {currentMethod === 'card' && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700/60 dark:bg-[#0B1120] space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Terminal confirmation</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <select
                        value={cardProvider}
                        onChange={event => setCardProvider(event.target.value)}
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="yoco">Yoco</option>
                        <option value="ikhokha">iKhokha</option>
                        <option value="adumo">Adumo</option>
                        <option value="speedpoint">Speedpoint</option>
                        <option value="other_terminal">Other terminal</option>
                      </select>
                      <input
                        value={cardProviderDeviceId}
                        onChange={event => setCardProviderDeviceId(event.target.value)}
                        placeholder="Device / terminal"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
                      />
                      <input
                        value={cardProviderReference}
                        onChange={event => setCardProviderReference(event.target.value)}
                        placeholder="Receipt / reference"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
                      />
                      <input
                        value={cardAuthorizationCode}
                        onChange={event => setCardAuthorizationCode(event.target.value)}
                        placeholder="Auth code"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr]">
                      <select
                        value={cardProviderStatus}
                        onChange={event => setCardProviderStatus(event.target.value as typeof cardProviderStatus)}
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="approved">Approved</option>
                        <option value="settled">Settled</option>
                        <option value="pending">Pending</option>
                      </select>
                      <input
                        value={cardProviderNote}
                        onChange={event => setCardProviderNote(event.target.value)}
                        placeholder="Optional terminal note"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={addPayment}
                  disabled={!currentAmount || Number(currentAmount) <= 0 || !cardTerminalReady || (offlineMode && (currentMethod === 'wallet' || currentMethod === 'account')) || (currentMethod === 'wallet' && (customerWalletBalance <= 0 || Number(currentAmount) > customerWalletBalance)) || (currentMethod === 'account' && (!customerAccountEnabled || Number(currentAmount) > accountRemainingAfterPayments))}
                  className="w-full py-5 bg-slate-900 dark:bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 flex justify-center items-center gap-2 mt-4"
                >
                  <Plus className="w-4 h-4" />
                  Add Payment
                </button>
              </div>
            </div>
          </div>

          {/* Right Side: List of Payments */}
          <div className="flex flex-col h-full min-h-[300px]">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Payment Summary</span>
            <div className="flex-1 space-y-3 overflow-y-auto pr-2">
              <AnimatePresence initial={false}>
                {payments.map((p, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl flex items-center justify-between group border border-transparent hover:border-primary/20 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white dark:bg-[#0B1120] rounded-xl text-primary">
                        {p.method === 'cash' ? <Banknote className="w-5 h-5" /> : p.method === 'card' ? <CreditCard className="w-5 h-5" /> : p.method === 'account' ? <ReceiptText className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                      </div>
                      <div>
                        <span className="text-sm font-black text-slate-900 dark:text-white block uppercase tracking-tight">{p.method}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          {p.billSplitLabel ? p.billSplitLabel : p.providerReference ? `${p.provider} / ${p.providerReference}` : p.tipAmount > 0 ? `+ R${p.tipAmount} Tip` : p.changeAmount > 0 ? `R${p.tenderedAmount} Tendered` : 'Exact Amount'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-black text-slate-900 dark:text-white">R{p.amount.toFixed(2)}</span>
                      <button onClick={() => removePayment(i)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {payments.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 py-12 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
                  <Plus className="w-12 h-12 mb-2 opacity-20" />
                  <span className="text-xs font-black uppercase tracking-widest opacity-50">No payments added</span>
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
              <div className="flex justify-between items-center mb-6">
                <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Total Paid</span>
                <span className="text-3xl font-black text-slate-900 dark:text-white">R{totalPaid.toFixed(2)}</span>
              </div>
              <button
                disabled={isProcessing || totalPaid < cartTotal}
                onClick={handleConfirm}
                className="w-full py-5 bg-primary text-white rounded-3xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex justify-center items-center gap-2"
              >
                {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                Complete Sale
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
