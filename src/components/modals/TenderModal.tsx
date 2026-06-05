import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CreditCard, Loader2, X } from 'lucide-react';
import type { CardTerminalDetails } from '../../hooks/useCheckout';

interface TenderModalProps {
  method: 'cash' | 'card';
  cartTotal: number;
  tenderedAmount: number | string;
  cardOverageAction: 'tip' | 'cashout';
  isProcessing: boolean;
  onTenderedChange: (val: string) => void;
  onCardOverageChange: (action: 'tip' | 'cashout') => void;
  onConfirm: (details?: CardTerminalDetails) => void;
  onClose: () => void;
}

export const TenderModal: React.FC<TenderModalProps> = ({
  method, cartTotal, tenderedAmount, cardOverageAction,
  isProcessing, onTenderedChange, onCardOverageChange, onConfirm, onClose,
}) => {
  const [cardProvider, setCardProvider] = useState('yoco');
  const [providerDeviceId, setProviderDeviceId] = useState('');
  const [providerReference, setProviderReference] = useState('');
  const [authorizationCode, setAuthorizationCode] = useState('');
  const [providerStatus, setProviderStatus] = useState<CardTerminalDetails['providerStatus']>('approved');
  const [providerNote, setProviderNote] = useState('');

  useEffect(() => {
    if (method !== 'card') return;
    setCardProvider('yoco');
    setProviderDeviceId('');
    setProviderReference('');
    setAuthorizationCode('');
    setProviderStatus('approved');
    setProviderNote('');
  }, [method]);

  const tendered = Number(tenderedAmount || 0);
  const overage = Math.max(0, tendered - cartTotal);
  const cardTerminalReady = method !== 'card' || (cardProvider.trim().length > 0 && providerDeviceId.trim().length > 0);
  const canConfirm = tendered >= cartTotal && cardTerminalReady;
  const tenderedAmountInputId = `${method}-tendered-amount`;

  const confirm = () => {
    if (method !== 'card') {
      onConfirm();
      return;
    }
    onConfirm({
      provider: cardProvider.trim(),
      providerDeviceId: providerDeviceId.trim(),
      providerReference: providerReference.trim() || null,
      authorizationCode: authorizationCode.trim() || providerReference.trim() || null,
      providerStatus: providerStatus || 'approved',
      providerNote: providerNote.trim() || null,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col"
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
            <span className="text-2xl font-black text-primary">R{Number(cartTotal || 0).toFixed(2)}</span>
          </div>

          <div>
            <label htmlFor={tenderedAmountInputId} className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
              {method === 'cash' ? 'Amount Tendered' : 'Charge Amount'}
            </label>
            <input
              id={tenderedAmountInputId}
              type="number" step="0.01" min="0" autoFocus required
              value={tenderedAmount}
              onChange={e => onTenderedChange(e.target.value)}
              className="w-full text-3xl font-black px-4 py-4 bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-center"
            />
          </div>

          {method === 'cash' ? (
            <div className={`p-4 rounded-xl flex justify-between items-center border ${canConfirm ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400' : 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'}`}>
              <span className="text-sm font-black uppercase tracking-widest">Change</span>
              <span className="text-2xl font-black">R{Number(overage || 0).toFixed(2)}</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl flex justify-between items-center border ${overage > 0 ? 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-400' : 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'}`}>
                <span className="text-sm font-black uppercase tracking-widest">Overage</span>
                <span className="text-2xl font-black">R{Number(overage || 0).toFixed(2)}</span>
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
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1120] p-3 space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <CreditCard className="w-4 h-4" />
                  Terminal confirmation
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
                      Provider
                    </label>
                    <select
                      value={cardProvider}
                      onChange={event => setCardProvider(event.target.value)}
                      className="w-full px-3 py-3 bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold text-slate-900 dark:text-white"
                    >
                      <option value="yoco">Yoco</option>
                      <option value="ikhokha">iKhokha</option>
                      <option value="adumo">Adumo</option>
                      <option value="speedpoint">Speedpoint</option>
                      <option value="other_terminal">Other terminal</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
                      Device / Terminal
                    </label>
                    <input
                      value={providerDeviceId}
                      onChange={event => setProviderDeviceId(event.target.value)}
                      placeholder="e.g. Yoco-Front-01"
                      className="w-full px-3 py-3 bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
                      Receipt / Reference
                    </label>
                    <input
                      value={providerReference}
                      onChange={event => setProviderReference(event.target.value)}
                      placeholder="Optional terminal reference"
                      className="w-full px-3 py-3 bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
                      Auth Code
                    </label>
                    <input
                      value={authorizationCode}
                      onChange={event => setAuthorizationCode(event.target.value)}
                      placeholder="Optional auth code"
                      className="w-full px-3 py-3 bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
                  <select
                    value={providerStatus}
                    onChange={event => setProviderStatus(event.target.value as CardTerminalDetails['providerStatus'])}
                    className="w-full px-3 py-3 bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold text-slate-900 dark:text-white"
                  >
                    <option value="approved">Approved</option>
                    <option value="settled">Settled</option>
                    <option value="pending">Pending settlement</option>
                  </select>
                  <input
                    value={providerNote}
                    onChange={event => setProviderNote(event.target.value)}
                    placeholder="Optional terminal note"
                    className="w-full px-3 py-3 bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">
            Cancel
          </button>
          <button
            disabled={isProcessing || !canConfirm}
            onClick={confirm}
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
