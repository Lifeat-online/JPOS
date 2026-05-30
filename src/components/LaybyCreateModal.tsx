import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarDays, CreditCard, Loader2, PackageCheck, X } from 'lucide-react';
import { AppConfig, CartItem, CashSession, Customer, LaybyOrder, LaybyPaymentMethod, Staff } from '../types';
import { createLaybyOrder } from '../api';

interface LaybyCreateModalProps {
  isOpen: boolean;
  tenantId: string | null;
  cart: CartItem[];
  customer: Customer | null;
  currentUserStaff: Staff | null;
  activeSession: CashSession | null;
  config: AppConfig | null;
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  taxInclusive: boolean;
  totalAmount: number;
  isProcessing: boolean;
  onProcessingChange: (value: boolean) => void;
  onCreated: (order: LaybyOrder) => Promise<void> | void;
  onClose: () => void;
}

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function defaultDeposit(total: number) {
  if (total <= 0) return '0.00';
  const minimum = Math.min(total, 1);
  return Math.min(total, Math.max(minimum, total * 0.2)).toFixed(2);
}

export const LaybyCreateModal: React.FC<LaybyCreateModalProps> = ({
  isOpen,
  tenantId,
  cart,
  customer,
  currentUserStaff,
  activeSession,
  config,
  subtotal,
  taxAmount,
  taxRate,
  taxInclusive,
  totalAmount,
  isProcessing,
  onProcessingChange,
  onCreated,
  onClose,
}) => {
  const currency = config?.business?.currency || 'R';
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [depositAmount, setDepositAmount] = useState(defaultDeposit(totalAmount));
  const [paymentMethod, setPaymentMethod] = useState<LaybyPaymentMethod>('cash');
  const [tenderedAmount, setTenderedAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setDueDate(defaultDueDate());
    setDepositAmount(defaultDeposit(totalAmount));
    setTenderedAmount('');
    setPaymentMethod('cash');
    setError('');
  }, [isOpen, totalAmount]);

  const depositValue = Number(depositAmount || 0);
  const tenderedValue = paymentMethod === 'cash'
    ? Math.max(depositValue, Number(tenderedAmount || depositValue))
    : depositValue;
  const changeValue = paymentMethod === 'cash' ? Math.max(0, tenderedValue - depositValue) : 0;
  const balanceAfterDeposit = Math.max(0, totalAmount - depositValue);
  const canSubmit = Boolean(
    tenantId &&
    customer &&
    cart.length > 0 &&
    dueDate &&
    Number.isFinite(depositValue) &&
    depositValue > 0 &&
    depositValue <= totalAmount &&
    !isProcessing
  );

  const items = useMemo(() => cart.map(item => ({
    productId: (item as any).productId || item.id,
    productName: item.name,
    name: item.name,
    price: Number(item.price || 0),
    quantity: Number(item.quantity || 0),
  })), [cart]);

  const handleCreate = async () => {
    if (!canSubmit || !tenantId || !customer) return;
    onProcessingChange(true);
    setError('');
    try {
      const order = await createLaybyOrder(tenantId, {
        customerId: customer.id,
        customerName: customer.name,
        items,
        subtotal,
        taxAmount,
        taxRate,
        taxInclusive,
        totalAmount,
        dueDate,
        staffId: currentUserStaff?.id || null,
        staffName: currentUserStaff?.name || null,
        payment: {
          method: paymentMethod,
          amount: Number(depositValue.toFixed(2)),
          tenderedAmount: Number(tenderedValue.toFixed(2)),
          changeAmount: Number(changeValue.toFixed(2)),
          cashSessionId: paymentMethod === 'cash' ? activeSession?.id || null : null,
          note: 'Lay-by deposit',
        },
      });
      await onCreated(order);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create lay-by.');
    } finally {
      onProcessingChange(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
              <PackageCheck className="w-4 h-4" />
              Lay-by
            </div>
            <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">{customer?.name || 'Select customer'}</h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {currency}{totalAmount.toFixed(2)} total
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 flex items-center justify-center" aria-label="Close lay-by">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!customer && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-300">
              Select a customer before opening a lay-by.
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-800 dark:text-white truncate">{item.name}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Qty {item.quantity}</p>
                  </div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{currency}{(item.price * item.quantity).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                <CalendarDays className="w-3.5 h-3.5" />
                Due date
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Deposit</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentMethod('cash')}
              className={`h-12 rounded-2xl border text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 ${paymentMethod === 'cash' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
            >
              <Banknote className="w-4 h-4" />
              Cash
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`h-12 rounded-2xl border text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 ${paymentMethod === 'card' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
            >
              <CreditCard className="w-4 h-4" />
              Card
            </button>
          </div>

          {paymentMethod === 'cash' && (
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Tendered</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={tenderedAmount}
                onChange={e => setTenderedAmount(e.target.value)}
                placeholder={depositValue.toFixed(2)}
                className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          )}

          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 dark:bg-slate-950/60 p-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Deposit</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{currency}{depositValue.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Balance</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{currency}{balanceAfterDeposit.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Change</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{currency}{changeValue.toFixed(2)}</p>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/10 dark:text-rose-300">
              {error}
            </div>
          )}

          <button
            disabled={!canSubmit}
            onClick={handleCreate}
            className="w-full h-14 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95 transition-all"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
            Create Lay-by
          </button>
        </div>
      </div>
    </div>
  );
};
