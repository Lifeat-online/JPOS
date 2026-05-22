import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Loader2, Wallet, CreditCard, Banknote, ReceiptText } from 'lucide-react';

interface SplitPaymentModalProps {
  isOpen: boolean;
  cartTotal: number;
  isProcessing: boolean;
  onConfirm: (payments: any[]) => void;
  onClose: () => void;
  customerWalletBalance?: number;
  customerAccountRemaining?: number;
  customerAccountEnabled?: boolean;
}

export const SplitPaymentModal: React.FC<SplitPaymentModalProps> = ({
  isOpen, cartTotal, isProcessing, onConfirm, onClose, customerWalletBalance = 0, customerAccountRemaining = 0, customerAccountEnabled = false
}) => {
  const [payments, setPayments] = useState<any[]>([]);
  const [currentMethod, setCurrentMethod] = useState<'cash' | 'card' | 'wallet' | 'account'>('cash');
  const [currentAmount, setCurrentAmount] = useState<string>('');
  const [tenderedAmount, setTenderedAmount] = useState<string>('');
  const [overageAction, setOverageAction] = useState<'tip' | 'cashout'>('tip');

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, cartTotal - totalPaid);
  const accountPaid = payments.reduce((sum, p) => sum + (p.method === 'account' ? Number(p.amount || 0) : 0), 0);
  const accountRemainingAfterPayments = Math.max(0, Number(customerAccountRemaining || 0) - accountPaid);

  const addPayment = () => {
    const amount = Number(currentAmount);
    if (isNaN(amount) || amount <= 0) return;

    const tendered = Number(tenderedAmount || currentAmount);
    const overage = Math.max(0, tendered - amount);

    const newPayment = {
      method: currentMethod,
      amount: amount,
      tenderedAmount: tendered,
      changeAmount: currentMethod === 'cash' ? overage : 0,
      tipAmount: (currentMethod === 'card' && overageAction === 'tip') ? overage : 0,
      cashOutAmount: (currentMethod === 'card' && overageAction === 'cashout') ? overage : 0,
    };

    setPayments([...payments, newPayment]);
    setCurrentAmount('');
    setTenderedAmount('');
  };

  const removePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    if (totalPaid < cartTotal) return;
    onConfirm(payments);
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
                  disabled={customerWalletBalance <= 0}
                  className={`flex-1 py-3 flex flex-col items-center gap-1 rounded-xl transition-all ${currentMethod === 'wallet' ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-400'}`}
                >
                  <Wallet className="w-5 h-5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Wallet</span>
                </button>
                <button
                  onClick={() => setCurrentMethod('account')}
                  disabled={!customerAccountEnabled || accountRemainingAfterPayments <= 0}
                  className={`flex-1 py-3 flex flex-col items-center gap-1 rounded-xl transition-all ${currentMethod === 'account' ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-400'} disabled:opacity-30`}
                >
                  <ReceiptText className="w-5 h-5" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Account</span>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
                    Amount to Pay
                  </label>
                  <input
                    type="number" step="0.01"
                    placeholder={remaining.toFixed(2)}
                    value={currentAmount}
                    onChange={e => setCurrentAmount(e.target.value)}
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

                <button
                  onClick={addPayment}
                  disabled={!currentAmount || Number(currentAmount) <= 0 || (currentMethod === 'wallet' && (customerWalletBalance <= 0 || Number(currentAmount) > customerWalletBalance)) || (currentMethod === 'account' && (!customerAccountEnabled || Number(currentAmount) > accountRemainingAfterPayments))}
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
                          {p.tipAmount > 0 ? `+ R${p.tipAmount} Tip` : p.changeAmount > 0 ? `R${p.tenderedAmount} Tendered` : 'Exact Amount'}
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
