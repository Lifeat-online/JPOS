import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, CreditCard, Loader2, ReceiptText, X } from 'lucide-react';
import type { BnplPaymentDetails } from '../../hooks/useCheckout';

interface BnplPaymentModalProps {
  isOpen: boolean;
  cartTotal: number;
  isProcessing: boolean;
  offlineMode?: boolean;
  onConfirm: (details: BnplPaymentDetails) => void | Promise<void>;
  onClose: () => void;
}

const bnplProviders = [
  {
    id: 'payjustnow',
    label: 'PayJustNow',
    helper: 'Capture the PayJustNow approval or order reference after provider approval.',
    icon: ReceiptText,
  },
  {
    id: 'mobicred',
    label: 'Mobicred',
    helper: 'Use the Mobicred transaction, account, or settlement reference.',
    icon: CreditCard,
  },
  {
    id: 'payflex',
    label: 'PayFlex',
    helper: 'Capture the PayFlex order reference shown after approval.',
    icon: ReceiptText,
  },
] as const;

export const BnplPaymentModal: React.FC<BnplPaymentModalProps> = ({
  isOpen,
  cartTotal,
  isProcessing,
  offlineMode = false,
  onConfirm,
  onClose,
}) => {
  const [provider, setProvider] = useState<(typeof bnplProviders)[number]['id']>('payjustnow');
  const [providerReference, setProviderReference] = useState('');
  const [providerStatus, setProviderStatus] = useState<BnplPaymentDetails['providerStatus']>('approved');
  const [providerNote, setProviderNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setProvider('payjustnow');
    setProviderReference('');
    setProviderStatus('approved');
    setProviderNote('');
  }, [isOpen]);

  const selectedProvider = useMemo(
    () => bnplProviders.find(item => item.id === provider) || bnplProviders[0],
    [provider]
  );
  const canConfirm = !offlineMode && providerReference.trim().length > 0;

  const submit = async () => {
    if (!canConfirm) return;
    await onConfirm({
      provider,
      providerReference: providerReference.trim(),
      providerStatus,
      providerNote: providerNote.trim() || null,
    });
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.94, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 20 }}
        className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-xl w-full shadow-2xl border border-white/20"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">BNPL Payment</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Approval and settlement capture</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-all" aria-label="Close BNPL payment">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-[#0B1120] p-4 flex items-center justify-between mb-5">
          <span className="text-xs font-black uppercase tracking-widest text-slate-500">Total Due</span>
          <span className="text-3xl font-black text-primary">R{Number(cartTotal || 0).toFixed(2)}</span>
        </div>

        {offlineMode && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800 mb-5">
            BNPL payments need online provider approval before the sale can be completed.
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-5">
          {bnplProviders.map(item => {
            const Icon = item.icon;
            const active = item.id === provider;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setProvider(item.id)}
                className={`min-h-20 rounded-xl border p-3 flex flex-col items-center justify-center gap-2 transition-all ${active ? 'border-primary bg-primary text-white shadow-lg shadow-primary/20' : 'border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-300 hover:border-primary/40'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">{selectedProvider.helper}</p>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
              Provider Reference
            </label>
            <input
              autoFocus
              value={providerReference}
              onChange={event => setProviderReference(event.target.value)}
              placeholder="e.g. approval, order, or settlement reference"
              className="w-full text-lg font-black px-4 py-4 bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
              Settlement Status
            </label>
            <select
              value={providerStatus}
              onChange={event => setProviderStatus(event.target.value as BnplPaymentDetails['providerStatus'])}
              className="w-full px-4 py-3 bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold text-slate-900 dark:text-white"
            >
              <option value="approved">Approved</option>
              <option value="pending">Pending settlement</option>
              <option value="settled">Settled</option>
              <option value="failed">Failed</option>
              <option value="reversed">Reversed</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
              Note
            </label>
            <textarea
              value={providerNote}
              onChange={event => setProviderNote(event.target.value)}
              rows={2}
              placeholder="Optional approval, customer, or settlement note"
              className="w-full px-4 py-3 bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold text-slate-900 dark:text-white resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">
            Cancel
          </button>
          <button
            disabled={isProcessing || !canConfirm}
            onClick={submit}
            className="flex-1 py-4 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex justify-center items-center gap-2"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Capture
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
