import React from 'react';
import { motion } from 'motion/react';
import { X, Loader2 } from 'lucide-react';

interface TenderModalProps {
  method: 'cash' | 'card';
  cartTotal: number;
  tenderedAmount: number | string;
  cardOverageAction: 'tip' | 'cashout';
  isProcessing: boolean;
  onTenderedChange: (val: string) => void;
  onCardOverageChange: (action: 'tip' | 'cashout') => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const TenderModal: React.FC<TenderModalProps> = ({
  method, cartTotal, tenderedAmount, cardOverageAction,
  isProcessing, onTenderedChange, onCardOverageChange, onConfirm, onClose,
}) => {
  const tendered = Number(tenderedAmount || 0);
  const overage = Math.max(0, tendered - cartTotal);
  const canConfirm = tendered >= cartTotal;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {method === 'cash' ? 'Cash Payment' : 'Card Payment'}
          </h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl flex justify-between items-center border border-slate-100 dark:border-slate-700">
            <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Total Due</span>
            <span className="text-2xl font-black text-primary">R{cartTotal.toFixed(2)}</span>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
              {method === 'cash' ? 'Amount Tendered' : 'Charge Amount'}
            </label>
            <input
              type="number" step="0.01" min="0" autoFocus required
              value={tenderedAmount}
              onChange={e => onTenderedChange(e.target.value)}
              className="w-full text-3xl font-black px-4 py-4 bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-center"
            />
          </div>

          {method === 'cash' ? (
            <div className={`p-4 rounded-xl flex justify-between items-center border ${canConfirm ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400' : 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'}`}>
              <span className="text-sm font-black uppercase tracking-widest">Change</span>
              <span className="text-2xl font-black">R{overage.toFixed(2)}</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl flex justify-between items-center border ${overage > 0 ? 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-400' : 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'}`}>
                <span className="text-sm font-black uppercase tracking-widest">Overage</span>
                <span className="text-2xl font-black">R{overage.toFixed(2)}</span>
              </div>
              {overage > 0 && (
                <div className="flex bg-slate-100 dark:bg-[#0B1120] p-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <button
                    onClick={() => onCardOverageChange('tip')}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${cardOverageAction === 'tip' ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                  >
                    Register as Tip
                  </button>
                  <button
                    onClick={() => onCardOverageChange('cashout')}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${cardOverageAction === 'cashout' ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                  >
                    Cash Payout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">
            Cancel
          </button>
          <button
            disabled={isProcessing || !canConfirm}
            onClick={onConfirm}
            className="flex-1 py-4 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex justify-center items-center gap-2"
          >
            {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
