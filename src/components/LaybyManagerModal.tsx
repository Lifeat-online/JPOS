import React, { useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, Banknote, CheckCircle2, CreditCard, Loader2, PackageCheck, RefreshCw, Search, X } from 'lucide-react';
import { addLaybyPayment, cancelLaybyOrder, completeLaybyOrder, getLaybyOrders } from '../api';
import { AppConfig, CashSession, LaybyOrder, LaybyPaymentMethod, Staff } from '../types';
import { LaybyReceipt } from './LaybyReceipt';

interface LaybyManagerModalProps {
  isOpen: boolean;
  tenantId: string | null;
  activeSession: CashSession | null;
  currentUserStaff: Staff | null;
  config: AppConfig | null;
  onChanged?: () => Promise<void> | void;
  onClose: () => void;
}

function formatDate(value: any) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(order: LaybyOrder) {
  if (order.status !== 'active' || !order.dueDate) return false;
  const due = new Date(order.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  due.setHours(23, 59, 59, 999);
  return due.getTime() < Date.now();
}

export const LaybyManagerModal: React.FC<LaybyManagerModalProps> = ({
  isOpen,
  tenantId,
  activeSession,
  currentUserStaff,
  config,
  onChanged,
  onClose,
}) => {
  const currency = config?.business?.currency || 'R';
  const [orders, setOrders] = useState<LaybyOrder[]>([]);
  const [status, setStatus] = useState<'active' | 'completed' | 'cancelled' | 'all'>('active');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<LaybyPaymentMethod>('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [tenderedAmount, setTenderedAmount] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('0.00');
  const [receiptOrder, setReceiptOrder] = useState<LaybyOrder | null>(null);

  const selectedOrder = useMemo(
    () => orders.find(order => order.id === selectedId) || orders[0] || null,
    [orders, selectedId]
  );

  const loadOrders = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getLaybyOrders(tenantId, { status, search, limit: 120 });
      setOrders(data);
      setSelectedId(current => data.some(order => order.id === current) ? current : data[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load lay-bys.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, status, tenantId]);

  useEffect(() => {
    if (!selectedOrder) return;
    setPaymentAmount(selectedOrder.balanceDue > 0 ? selectedOrder.balanceDue.toFixed(2) : '');
    setTenderedAmount('');
    setCancelReason('');
    setRefundAmount('0.00');
  }, [selectedOrder?.id]);

  const printOrder = (order: LaybyOrder) => {
    setReceiptOrder(order);
    window.setTimeout(() => window.print(), 80);
  };

  const paymentPayload = (amount: number, note: string) => {
    const tendered = paymentMethod === 'cash'
      ? Math.max(amount, Number(tenderedAmount || amount))
      : amount;
    return {
      method: paymentMethod,
      amount: Number(amount.toFixed(2)),
      tenderedAmount: Number(tendered.toFixed(2)),
      changeAmount: paymentMethod === 'cash' ? Number(Math.max(0, tendered - amount).toFixed(2)) : 0,
      cashSessionId: paymentMethod === 'cash' ? activeSession?.id || null : null,
      staffId: currentUserStaff?.id || null,
      staffName: currentUserStaff?.name || null,
      note,
    };
  };

  const handleAddPayment = async () => {
    if (!tenantId || !selectedOrder) return;
    const amount = Number(paymentAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a payment amount greater than zero.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await addLaybyPayment(tenantId, selectedOrder.id, paymentPayload(amount, 'Lay-by instalment'));
      printOrder(updated);
      await onChanged?.();
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record lay-by payment.');
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    if (!tenantId || !selectedOrder) return;
    setBusy(true);
    setError('');
    try {
      const balance = Number(selectedOrder.balanceDue || 0);
      const updated = await completeLaybyOrder(tenantId, selectedOrder.id, {
        staffId: currentUserStaff?.id || null,
        staffName: currentUserStaff?.name || null,
        payment: balance > 0 ? paymentPayload(balance, 'Lay-by final payment') : undefined,
      });
      printOrder(updated);
      await onChanged?.();
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete lay-by.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!tenantId || !selectedOrder) return;
    const refund = Number(refundAmount || 0);
    setBusy(true);
    setError('');
    try {
      const updated = await cancelLaybyOrder(tenantId, selectedOrder.id, {
        reason: cancelReason || null,
        refundAmount: Number.isFinite(refund) ? Number(refund.toFixed(2)) : 0,
        refundMethod: paymentMethod,
        cashSessionId: paymentMethod === 'cash' ? activeSession?.id || null : null,
        staffId: currentUserStaff?.id || null,
        staffName: currentUserStaff?.name || null,
      });
      printOrder(updated);
      await onChanged?.();
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel lay-by.');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-end lg:items-center justify-center p-4">
        <div className="w-full max-w-6xl max-h-[92vh] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                <PackageCheck className="w-4 h-4" />
                Lay-bys
              </div>
              <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">Reservations and collections</h3>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 flex items-center justify-center" aria-label="Close lay-bys">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row gap-3">
            <div className="flex gap-2 overflow-x-auto">
              {(['active', 'completed', 'cancelled', 'all'] as const).map(option => (
                <button
                  key={option}
                  onClick={() => setStatus(option)}
                  className={`h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border shrink-0 ${status === option ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white' : 'bg-white dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800'}`}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="flex-1 flex gap-2">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') loadOrders(); }}
                  placeholder="Search customer or lay-by"
                  className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 pl-10 pr-3 text-sm font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <button
                onClick={loadOrders}
                disabled={loading}
                className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-500 flex items-center justify-center disabled:opacity-40"
                aria-label="Refresh lay-bys"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 grid grid-cols-1 lg:grid-cols-[360px,1fr]">
            <div className="border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-slate-800 min-h-0 overflow-y-auto">
              {orders.length === 0 ? (
                <div className="p-6 text-sm font-bold text-slate-400">No lay-bys found.</div>
              ) : orders.map(order => (
                <button
                  key={order.id}
                  onClick={() => setSelectedId(order.id)}
                  className={`w-full text-left p-4 border-b border-slate-100 dark:border-slate-800 transition-colors ${selectedOrder?.id === order.id ? 'bg-primary/10' : 'hover:bg-slate-50 dark:hover:bg-slate-950'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-sm text-slate-900 dark:text-white truncate">{order.customerName}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">#{order.id.slice(-8).toUpperCase()}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${isOverdue(order) ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {isOverdue(order) ? 'overdue' : order.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span>Total {currency}{order.totalAmount.toFixed(2)}</span>
                    <span>Paid {currency}{order.amountPaid.toFixed(2)}</span>
                    <span>Due {currency}{order.balanceDue.toFixed(2)}</span>
                  </div>
                  {order.dueDate && <p className="mt-2 text-[10px] font-bold text-slate-400">Due {formatDate(order.dueDate)}</p>}
                </button>
              ))}
            </div>

            <div className="min-h-0 overflow-y-auto p-5">
              {selectedOrder ? (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <h4 className="text-xl font-black text-slate-900 dark:text-white">{selectedOrder.customerName}</h4>
                      <p className="text-xs font-bold text-slate-400">Lay-by #{selectedOrder.id.slice(-8).toUpperCase()}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 min-w-[280px]">
                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total</p>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{currency}{selectedOrder.totalAmount.toFixed(2)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Paid</p>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{currency}{selectedOrder.amountPaid.toFixed(2)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Balance</p>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{currency}{selectedOrder.balanceDue.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">Items</div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedOrder.items.map(item => (
                          <div key={item.id} className="p-4 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-900 dark:text-white truncate">{item.productName || item.name}</p>
                              <p className="text-[10px] font-bold text-slate-400">Reserved {item.reservedQuantity}</p>
                            </div>
                            <p className="text-sm font-black text-slate-900 dark:text-white">{currency}{(item.price * item.quantity).toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">Payments</div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedOrder.payments.map(payment => (
                          <div key={payment.id} className="p-4 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-slate-900 dark:text-white uppercase">{payment.method}</p>
                              <p className="text-[10px] font-bold text-slate-400">{formatDate(payment.createdAt)}</p>
                            </div>
                            <p className="text-sm font-black text-slate-900 dark:text-white">{currency}{payment.amount.toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {selectedOrder.status === 'active' && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => setPaymentMethod('cash')}
                            className={`h-11 rounded-xl border text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 ${paymentMethod === 'cash' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                          >
                            <Banknote className="w-4 h-4" />
                            Cash
                          </button>
                          <button
                            onClick={() => setPaymentMethod('card')}
                            className={`h-11 rounded-xl border text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 ${paymentMethod === 'card' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                          >
                            <CreditCard className="w-4 h-4" />
                            Card
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={paymentAmount}
                            onChange={e => setPaymentAmount(e.target.value)}
                            className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          {paymentMethod === 'cash' && (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={tenderedAmount}
                              onChange={e => setTenderedAmount(e.target.value)}
                              placeholder="Tendered"
                              className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/40"
                            />
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            disabled={busy || selectedOrder.balanceDue <= 0}
                            onClick={handleAddPayment}
                            className="h-12 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40"
                          >
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                            Add Instalment
                          </button>
                          <button
                            disabled={busy}
                            onClick={handleComplete}
                            className="h-12 rounded-xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40"
                          >
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Final Collection
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-rose-200 dark:border-rose-900/40 p-4 space-y-3">
                        <textarea
                          value={cancelReason}
                          onChange={e => setCancelReason(e.target.value)}
                          placeholder="Cancellation reason"
                          className="w-full min-h-[82px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-300 resize-none"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={refundAmount}
                          onChange={e => setRefundAmount(e.target.value)}
                          className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-300"
                        />
                        <button
                          disabled={busy}
                          onClick={handleCancel}
                          className="h-12 w-full rounded-xl bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40"
                        >
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4" />}
                          Cancel and Release Stock
                        </button>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/10 dark:text-rose-300">
                      {error}
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full min-h-[320px] flex items-center justify-center text-sm font-bold text-slate-400">
                  Select a lay-by.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {receiptOrder && <LaybyReceipt order={receiptOrder} config={config} />}
    </>
  );
};
