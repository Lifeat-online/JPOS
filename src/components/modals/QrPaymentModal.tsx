import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, ExternalLink, Loader2, QrCode, Smartphone, X } from 'lucide-react';
import type { QrPaymentDetails } from '../../hooks/useCheckout';

interface QrPaymentModalProps {
  isOpen: boolean;
  cartTotal: number;
  isProcessing: boolean;
  offlineMode?: boolean;
  onConfirm: (details: QrPaymentDetails) => void | Promise<void>;
  onClose: () => void;
}

const providers = [
  {
    id: 'snapscan',
    label: 'SnapScan',
    helper: 'Customer scans the store code, then cashier captures the SnapScan reference.',
    icon: QrCode,
  },
  {
    id: 'yoco_payment_link',
    label: 'Yoco Link',
    helper: 'Send or open the Yoco payment link, then capture the paid reference.',
    icon: ExternalLink,
  },
  {
    id: 'yoco_terminal',
    label: 'Yoco Terminal',
    helper: 'Use the Yoco device confirmation or receipt reference.',
    icon: Smartphone,
  },
  {
    id: 'generic_qr',
    label: 'Generic QR',
    helper: 'Use this for bank app, merchant QR, or other mobile-wallet references.',
    icon: QrCode,
  },
] as const;

export const QrPaymentModal: React.FC<QrPaymentModalProps> = ({
  isOpen,
  cartTotal,
  isProcessing,
  offlineMode = false,
  onConfirm,
  onClose,
}) => {
  const [provider, setProvider] = useState<(typeof providers)[number]['id']>('snapscan');
  const [providerReference, setProviderReference] = useState('');
  const [providerStatus, setProviderStatus] = useState<QrPaymentDetails['providerStatus']>('confirmed');
  const [qrPayload, setQrPayload] = useState('');
  const [providerNote, setProviderNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setProvider('snapscan');
    setProviderReference('');
    setProviderStatus('confirmed');
    setQrPayload('');
    setProviderNote('');
  }, [isOpen]);

  const selectedProvider = useMemo(
    () => providers.find(item => item.id === provider) || providers[0],
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
      qrPayload: qrPayload.trim() || null,
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
            <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">QR / Mobile Wallet</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Provider reference capture</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-all" aria-label="Close QR payment">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-[#0B1120] p-4 flex items-center justify-between mb-5">
          <span className="text-xs font-black uppercase tracking-widest text-slate-500">Total Due</span>
          <span className="text-3xl font-black text-primary">R{Number(cartTotal || 0).toFixed(2)}</span>
        </div>

        {offlineMode && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800 mb-5">
            QR and mobile-wallet payments need online provider confirmation.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          {providers.map(item => {
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
              placeholder="e.g. Yoco receipt, SnapScan payment ID"
              className="w-full text-lg font-black px-4 py-4 bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
                Provider Status
              </label>
              <select
                value={providerStatus}
                onChange={event => setProviderStatus(event.target.value as QrPaymentDetails['providerStatus'])}
                className="w-full px-4 py-3 bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold text-slate-900 dark:text-white"
              >
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending settlement</option>
                <option value="failed">Failed</option>
                <option value="reversed">Reversed</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
                QR / Link Payload
              </label>
              <input
                value={qrPayload}
                onChange={event => setQrPayload(event.target.value)}
                placeholder="Optional link, code, or QR label"
                className="w-full px-4 py-3 bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">
              Note
            </label>
            <textarea
              value={providerNote}
              onChange={event => setProviderNote(event.target.value)}
              rows={2}
              placeholder="Optional settlement or terminal note"
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
