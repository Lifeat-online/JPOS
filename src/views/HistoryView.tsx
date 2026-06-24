import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    Ban,
    CheckCircle2,
    Clock,
    CreditCard,
    Hash,
    Loader2,
    Package,
    Printer,
    ReceiptText,
    RotateCcw,
    Search,
    User,
    Users,
    X,
} from 'lucide-react';
import { AppConfig, Sale, Customer } from '../types';
import { getDate } from '../utils/date';
import { Receipt } from '../components/Receipt';
import { refundSale, updateSalePaymentProviderStatus, voidSale } from '../api';
import { usePosStore } from '../store/usePosStore';
import { useBrowserOnlineStatus } from '../hooks/useBrowserOnlineStatus';
import { WALLET_ONLINE_REQUIRED_MESSAGE } from '../utils/offlineGuards';

type RefundMethod = 'cash' | 'card' | 'wallet' | 'bnpl';

const providerStatusOptions = ['pending', 'confirmed', 'approved', 'settled', 'failed', 'reversed', 'refunded', 'partial_refund'];
const bnplProviders = [
    { id: 'payjustnow', label: 'PayJustNow' },
    { id: 'mobicred', label: 'Mobicred' },
    { id: 'payflex', label: 'PayFlex' },
];

function providerLabel(value?: string | null) {
    const found = bnplProviders.find((provider) => provider.id === value);
    if (found) return found.label;
    if (!value) return 'Provider';
    return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

interface HistoryViewProps {
    sales: Sale[];
    customers: Customer[];
    config: AppConfig | null;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    filterCustomerId: string | null;
    setFilterCustomerId: (id: string | null) => void;
    onSalesUpdated?: () => Promise<void>;
    onCustomersUpdated?: () => Promise<void>;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
    sales,
    customers,
    config,
    searchQuery,
    setSearchQuery,
    filterCustomerId,
    setFilterCustomerId,
    onSalesUpdated,
    onCustomersUpdated,
}) => {
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [refundOpen, setRefundOpen] = useState(false);
    const [refundReason, setRefundReason] = useState('');
    const [refundMethod, setRefundMethod] = useState<RefundMethod>('cash');
    const [bnplRefundProvider, setBnplRefundProvider] = useState('payjustnow');
    const [bnplRefundReference, setBnplRefundReference] = useState('');
    const [bnplRefundNote, setBnplRefundNote] = useState('');
    const [restockRefund, setRestockRefund] = useState(true);
    const [refundQuantities, setRefundQuantities] = useState<Record<string, number>>({});
    const [isRefunding, setIsRefunding] = useState(false);
    const [refundError, setRefundError] = useState('');
    const [providerDrafts, setProviderDrafts] = useState<
        Record<
            string,
            { provider: string; providerDeviceId: string; providerReference: string; authorizationCode: string; providerStatus: string; providerNote: string }
        >
    >({});
    const [savingProviderPaymentId, setSavingProviderPaymentId] = useState<string | null>(null);
    const [providerReconcileError, setProviderReconcileError] = useState('');
    const [voidOpen, setVoidOpen] = useState(false);
    const [voidReason, setVoidReason] = useState('');
    const [restockVoid, setRestockVoid] = useState(true);
    const [isVoiding, setIsVoiding] = useState(false);
    const [voidError, setVoidError] = useState('');
    const [approvalMessage, setApprovalMessage] = useState('');
    const tenantId = usePosStore((s) => s.tenantId);
    const currentUserStaff = usePosStore((s) => s.currentUserStaff);
    const activeSession = usePosStore((s) => s.activeSession);
    const { isOffline: isBrowserOffline } = useBrowserOnlineStatus();
    const isManagerRole = ['admin', 'manager', 'dev'].includes(String(currentUserStaff?.role || '').toLowerCase());

    const filteredSales = useMemo(() => {
        return sales.filter((s) => {
            const matchesSearch =
                s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.total.toString().includes(searchQuery) ||
                (s.customerId &&
                    customers
                        .find((c) => c.id === s.customerId)
                        ?.name.toLowerCase()
                        .includes(searchQuery.toLowerCase()));
            const matchesCustomer = filterCustomerId ? s.customerId === filterCustomerId : true;
            return matchesSearch && matchesCustomer;
        });
    }, [sales, searchQuery, filterCustomerId, customers]);

    const currency = config?.business?.currency || 'R';
    const selectedCustomer = selectedSale?.customerId ? customers.find((c) => c.id === selectedSale.customerId) : null;
    const selectedBnplPayment = useMemo(() => selectedSale?.payments?.find((payment) => payment.method === 'bnpl') || null, [selectedSale]);
    const selectedDate = selectedSale ? getDate(selectedSale.createdAt) : null;
    const selectedDateText =
        selectedDate && !isNaN(selectedDate.getTime()) ? selectedDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown';
    const selectedSubtotal = selectedSale?.subtotal ?? selectedSale?.total ?? 0;
    const selectedTax = selectedSale?.taxAmount ?? 0;
    const canRefundSelectedSale = Boolean(
        selectedSale && selectedSale.status === 'completed' && selectedSale.transactionType !== 'refund' && selectedSale.refundStatus !== 'full',
    );
    const canVoidSelectedSale = Boolean(
        selectedSale && selectedSale.status !== 'completed' && selectedSale.transactionType !== 'refund' && selectedSale.transactionType !== 'void',
    );
    const refundableItems = useMemo(() => selectedSale?.items || [], [selectedSale]);
    const selectedRefundLines = useMemo(() => {
        return refundableItems
            .map((item) => {
                const id = (item as any).id || (item as any).productId || item.name;
                const quantity = Math.max(0, Number(refundQuantities[id] || 0));
                return { item, id, quantity, amount: Number(item.price || 0) * quantity };
            })
            .filter((line) => line.quantity > 0);
    }, [refundQuantities, refundableItems]);
    const refundTotal = selectedRefundLines.reduce((sum, line) => sum + line.amount, 0);

    useEffect(() => {
        const drafts: Record<
            string,
            { provider: string; providerDeviceId: string; providerReference: string; authorizationCode: string; providerStatus: string; providerNote: string }
        > = {};
        selectedSale?.payments?.forEach((payment) => {
            if (
                payment.provider ||
                payment.providerDeviceId ||
                payment.providerReference ||
                payment.authorizationCode ||
                payment.providerNote ||
                payment.method === 'card' ||
                payment.method === 'qr' ||
                payment.method === 'bnpl'
            ) {
                drafts[payment.id] = {
                    provider: payment.provider || '',
                    providerDeviceId: payment.providerDeviceId || '',
                    providerReference: payment.providerReference || '',
                    authorizationCode: payment.authorizationCode || '',
                    providerStatus: payment.providerStatus || (payment.method === 'bnpl' ? 'approved' : 'confirmed'),
                    providerNote: payment.providerNote || '',
                };
            }
        });
        setProviderDrafts(drafts);
        setProviderReconcileError('');
        setSavingProviderPaymentId(null);
    }, [selectedSale]);

    const printSelectedReceipt = () => {
        if (!selectedSale) return;
        window.print();
    };

    const openRefundFlow = () => {
        if (!selectedSale) return;
        const initial: Record<string, number> = {};
        selectedSale.items.forEach((item) => {
            const id = (item as any).id || (item as any).productId || item.name;
            initial[id] = Math.max(0, Number(item.quantity || 0));
        });
        setRefundQuantities(initial);
        setRefundReason('');
        const bnplPayment = selectedSale.payments?.find((payment) => payment.method === 'bnpl');
        setRefundMethod(bnplPayment ? 'bnpl' : 'cash');
        setBnplRefundProvider(bnplPayment?.provider || 'payjustnow');
        setBnplRefundReference('');
        setBnplRefundNote('');
        setRestockRefund(true);
        setRefundError('');
        setApprovalMessage('');
        setRefundOpen(true);
    };

    const submitRefund = async () => {
        if (!selectedSale || !tenantId) return;
        setRefundError('');
        if (selectedRefundLines.length === 0) {
            setRefundError('Choose at least one item to refund.');
            return;
        }
        if (refundReason.trim().length < 3) {
            setRefundError('Add a short reason so the manager report is clear later.');
            return;
        }
        if (refundMethod === 'cash' && !activeSession?.id) {
            setRefundError('Open the register before processing a cash refund.');
            return;
        }
        if (refundMethod === 'wallet' && isBrowserOffline) {
            setRefundError(WALLET_ONLINE_REQUIRED_MESSAGE);
            return;
        }
        if (refundMethod === 'bnpl' && isBrowserOffline) {
            setRefundError('BNPL refunds need online provider confirmation.');
            return;
        }
        if (refundMethod === 'bnpl' && bnplRefundReference.trim().length === 0) {
            setRefundError('Capture the BNPL refund or reversal reference before continuing.');
            return;
        }

        setIsRefunding(true);
        try {
            const result = await refundSale(tenantId, selectedSale.id, {
                items: selectedRefundLines.map((line) => ({ saleItemId: line.id, quantity: line.quantity })),
                reason: refundReason.trim(),
                method: refundMethod,
                restock: restockRefund,
                staffId: currentUserStaff?.id || null,
                staffName: currentUserStaff?.name || null,
                cashSessionId: refundMethod === 'cash' ? activeSession?.id || null : null,
                provider: refundMethod === 'bnpl' ? bnplRefundProvider : null,
                providerReference: refundMethod === 'bnpl' ? bnplRefundReference.trim() : null,
                providerNote: refundMethod === 'bnpl' ? bnplRefundNote.trim() || refundReason.trim() : null,
            });
            if (result?.approvalRequired) {
                setApprovalMessage(result.message || 'Refund request sent to the manager Action Center.');
                setRefundOpen(false);
                return;
            }
            await onSalesUpdated?.();
            if (refundMethod === 'wallet') {
                await onCustomersUpdated?.();
            }
            setRefundOpen(false);
            setSelectedSale(null);
        } catch (error: any) {
            setRefundError(error?.message || 'Refund could not be completed.');
        } finally {
            setIsRefunding(false);
        }
    };

    const updateProviderDraft = (
        paymentId: string,
        patch: Partial<{
            provider: string;
            providerDeviceId: string;
            providerReference: string;
            authorizationCode: string;
            providerStatus: string;
            providerNote: string;
        }>,
    ) => {
        setProviderDrafts((drafts) => {
            const existing = drafts[paymentId] || {};
            const next = { ...existing, ...patch };
            return { ...drafts, [paymentId]: next };
        });
    };

    const submitProviderReconciliation = async (paymentId: string) => {
        if (!tenantId || !selectedSale) return;
        const draft = providerDrafts[paymentId];
        if (!draft?.providerStatus) {
            setProviderReconcileError('Choose a provider status before saving.');
            return;
        }
        setSavingProviderPaymentId(paymentId);
        setProviderReconcileError('');
        try {
            const updated = await updateSalePaymentProviderStatus(tenantId, selectedSale.id, paymentId, {
                provider: draft.provider || null,
                providerDeviceId: draft.providerDeviceId || null,
                providerReference: draft.providerReference || null,
                authorizationCode: draft.authorizationCode || null,
                providerStatus: draft.providerStatus,
                providerNote: draft.providerNote || null,
            });
            setSelectedSale(updated);
            await onSalesUpdated?.();
        } catch (error: any) {
            setProviderReconcileError(error?.message || 'Provider status could not be saved.');
        } finally {
            setSavingProviderPaymentId(null);
        }
    };

    const openVoidFlow = () => {
        setVoidReason('');
        setRestockVoid(true);
        setVoidError('');
        setApprovalMessage('');
        setVoidOpen(true);
    };

    const submitVoid = async () => {
        if (!selectedSale || !tenantId) return;
        setVoidError('');
        if (voidReason.trim().length < 3) {
            setVoidError('Add a short reason so this cancellation is easy to review later.');
            return;
        }

        setIsVoiding(true);
        try {
            const result = await voidSale(tenantId, selectedSale.id, {
                reason: voidReason.trim(),
                restock: restockVoid,
                staffId: currentUserStaff?.id || null,
                staffName: currentUserStaff?.name || null,
            });
            if (result?.approvalRequired) {
                setApprovalMessage(result.message || 'Void request sent to the manager Action Center.');
                setVoidOpen(false);
                return;
            }
            await onSalesUpdated?.();
            setVoidOpen(false);
            setSelectedSale(null);
        } catch (error: any) {
            setVoidError(error?.message || 'Order could not be voided.');
        } finally {
            setIsVoiding(false);
        }
    };

    useEffect(() => {
        if (!selectedSale) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedSale(null);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedSale]);

    return (
        <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
            <div className="max-w-5xl mx-auto space-y-4 lg:space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                    <div>
                        <h2 className="text-xl lg:text-2xl font-black tracking-tight text-slate-900 dark:text-white">Transaction History</h2>
                        {filterCustomerId && (
                            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-bold border border-primary/20">
                                <Users className="w-3 h-3" />
                                Profile: {customers.find((c) => c.id === filterCustomerId)?.name || 'Unknown'}
                                <button onClick={() => setFilterCustomerId(null)} className="ml-1 hover:text-red-500 font-extrabold">
                                    x
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search transactions..."
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-xs font-medium shadow-sm min-h-11"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                if (filterCustomerId) setFilterCustomerId(null);
                            }}
                        />
                    </div>
                </div>

                {approvalMessage && (
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                        <CheckCircle2 className="h-5 w-5 shrink-0" />
                        {approvalMessage}
                    </div>
                )}

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-150">
                            <thead className="bg-slate-50 dark:bg-[#0B1120] border-b border-slate-200 dark:border-slate-700/60">
                                <tr>
                                    <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Order ID</th>
                                    <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Customer</th>
                                    <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Timestamp</th>
                                    <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Method</th>
                                    <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Amount</th>
                                    <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredSales.map((sale) => (
                                    <tr
                                        key={sale.id}
                                        tabIndex={0}
                                        onClick={() => setSelectedSale(sale)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                setSelectedSale(sale);
                                            }
                                        }}
                                        className="group cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/60 focus:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/30"
                                        aria-label={`View order ${sale.id.slice(-8)} details`}
                                    >
                                        <td className="px-6 py-4 font-mono text-[10px] text-slate-400 dark:text-slate-500">#{sale.id.slice(-8)}</td>
                                        <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-300">
                                            {sale.customerId ? customers.find((c) => c.id === sale.customerId)?.name || 'Deleted' : 'Guest'}
                                        </td>
                                        <td className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">
                                            {(() => {
                                                const raw = sale.createdAt;
                                                const d = getDate(raw || Date.now());
                                                return !isNaN(d.getTime())
                                                    ? d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                                                    : `Invalid: ${String(raw)}`;
                                            })()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">{sale.paymentMethod}</span>
                                                {sale.payments && sale.payments.length > 1 && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[8px] font-black uppercase tracking-tighter w-fit">
                                                        Split ({sale.payments.length})
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-extrabold text-slate-900 dark:text-white">R{Number(sale.total || 0).toFixed(2)}</td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                                    sale.transactionType === 'refund'
                                                        ? 'bg-rose-100 text-rose-700'
                                                        : sale.transactionType === 'void'
                                                          ? 'bg-slate-200 text-slate-700'
                                                          : sale.status === 'completed'
                                                            ? 'bg-green-100 text-green-700'
                                                            : 'bg-amber-100 text-amber-700'
                                                }`}
                                            >
                                                {sale.transactionType === 'refund'
                                                    ? 'refund'
                                                    : sale.transactionType === 'void'
                                                      ? 'voided'
                                                      : sale.refundStatus === 'full'
                                                        ? 'refunded'
                                                        : sale.refundStatus === 'partial'
                                                          ? 'partial refund'
                                                          : sale.status}
                                            </span>
                                            <span className="ml-2 text-[10px] font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                                                View
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredSales.length === 0 && (
                        <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm font-black uppercase tracking-widest opacity-50">
                            No transactions
                        </div>
                    )}
                </div>
            </div>

            {selectedSale && (
                <>
                    <Receipt sale={selectedSale} config={config} />
                    <div
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/55 p-0 sm:p-4"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="history-order-details-title"
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) setSelectedSale(null);
                        }}
                    >
                        <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-2xl">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
                                <div>
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                                        <ReceiptText className="h-4 w-4" />
                                        Order details
                                    </div>
                                    <h3 id="history-order-details-title" className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                                        #{(selectedSale.id || '').slice(-8).toUpperCase()}
                                    </h3>
                                </div>
                                <div className="flex w-full sm:w-auto items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={printSelectedReceipt}
                                        className="inline-flex min-h-10 flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-primary/90"
                                    >
                                        <Printer className="h-4 w-4" />
                                        Reprint receipt
                                    </button>
                                    {canRefundSelectedSale && (
                                        <button
                                            type="button"
                                            onClick={openRefundFlow}
                                            className="inline-flex min-h-10 flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 shadow-sm hover:bg-rose-100"
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                            Refund / return
                                        </button>
                                    )}
                                    {canVoidSelectedSale && (
                                        <button
                                            type="button"
                                            onClick={openVoidFlow}
                                            className="inline-flex min-h-10 flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-100"
                                        >
                                            <Ban className="h-4 w-4" />
                                            Void / cancel
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setSelectedSale(null)}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900"
                                        aria-label="Close order details"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-[calc(92vh-81px)] overflow-y-auto p-5 space-y-5">
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    {[
                                        { label: 'Customer', value: selectedCustomer?.name || 'Guest', icon: User },
                                        { label: 'Timestamp', value: selectedDateText, icon: Clock },
                                        { label: 'Payment', value: (selectedSale.paymentMethod || 'Unknown').toUpperCase(), icon: CreditCard },
                                        { label: 'Status', value: (selectedSale.status || 'Unknown').toUpperCase(), icon: Hash },
                                    ].map(({ label, value, icon: Icon }) => (
                                        <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                <Icon className="h-3.5 w-3.5" />
                                                {label}
                                            </div>
                                            <div className="mt-2 text-sm font-black text-slate-800 dark:text-slate-100">{value}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        <Package className="h-4 w-4" />
                                        Items
                                    </div>
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {(selectedSale.items || []).map((item, index) => (
                                            <div key={`${item.id}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
                                                <div>
                                                    <div className="text-sm font-black text-slate-800 dark:text-slate-100">{item.name}</div>
                                                    {'selectedModifiers' in item && item.selectedModifiers && item.selectedModifiers.length > 0 && (
                                                        <div className="mt-1 text-[11px] font-semibold text-slate-500">
                                                            {item.selectedModifiers.map((mod) => mod.name).join(', ')}
                                                        </div>
                                                    )}
                                                    {'status' in item && item.status && (
                                                        <span className="mt-2 inline-flex rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
                                                            {item.status}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs font-bold text-slate-500">Qty {item.quantity}</div>
                                                    <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                                                        {currency}
                                                        {(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {selectedSale.payments && selectedSale.payments.length > 0 && (
                                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                        <div className="bg-slate-50 dark:bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            Payments
                                        </div>
                                        {providerReconcileError && (
                                            <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                                                {providerReconcileError}
                                            </div>
                                        )}
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {selectedSale.payments.map((payment) => {
                                                const hasProviderData = Boolean(
                                                    payment.provider ||
                                                    payment.providerDeviceId ||
                                                    payment.providerReference ||
                                                    payment.authorizationCode ||
                                                    payment.providerNote ||
                                                    payment.method === 'card' ||
                                                    payment.method === 'qr' ||
                                                    payment.method === 'bnpl',
                                                );
                                                const draft = providerDrafts[payment.id] || {
                                                    provider: payment.provider || '',
                                                    providerDeviceId: payment.providerDeviceId || '',
                                                    providerReference: payment.providerReference || '',
                                                    authorizationCode: payment.authorizationCode || '',
                                                    providerStatus: payment.providerStatus || (payment.method === 'bnpl' ? 'approved' : 'confirmed'),
                                                    providerNote: payment.providerNote || '',
                                                };
                                                return (
                                                    <div key={payment.id} className="px-4 py-3 text-sm">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div>
                                                                <span className="font-black uppercase text-slate-600 dark:text-slate-300">
                                                                    {payment.method}
                                                                </span>
                                                                {hasProviderData && (
                                                                    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                                        {draft.provider || payment.provider
                                                                            ? providerLabel(draft.provider || payment.provider)
                                                                            : 'Split bill'}{' '}
                                                                        / {draft.providerStatus || 'pending'}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <span className="font-black text-slate-900 dark:text-white">
                                                                {currency}
                                                                {Number(payment.amount || 0).toFixed(2)}
                                                            </span>
                                                        </div>

                                                        {hasProviderData && (
                                                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                                                                <div className="grid gap-2 md:grid-cols-3">
                                                                    <input
                                                                        value={draft.provider}
                                                                        onChange={(event) => updateProviderDraft(payment.id, { provider: event.target.value })}
                                                                        placeholder="Provider"
                                                                        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-primary/50 dark:border-slate-700 dark:bg-slate-950"
                                                                    />
                                                                    <input
                                                                        value={draft.providerDeviceId}
                                                                        onChange={(event) =>
                                                                            updateProviderDraft(payment.id, { providerDeviceId: event.target.value })
                                                                        }
                                                                        placeholder="Device / terminal"
                                                                        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-primary/50 dark:border-slate-700 dark:bg-slate-950"
                                                                    />
                                                                    <input
                                                                        value={draft.providerReference}
                                                                        onChange={(event) =>
                                                                            updateProviderDraft(payment.id, { providerReference: event.target.value })
                                                                        }
                                                                        placeholder="Provider reference"
                                                                        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-primary/50 dark:border-slate-700 dark:bg-slate-950"
                                                                    />
                                                                    <input
                                                                        value={draft.authorizationCode}
                                                                        onChange={(event) =>
                                                                            updateProviderDraft(payment.id, { authorizationCode: event.target.value })
                                                                        }
                                                                        placeholder="Auth code"
                                                                        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-primary/50 dark:border-slate-700 dark:bg-slate-950"
                                                                    />
                                                                    <select
                                                                        value={draft.providerStatus}
                                                                        onChange={(event) =>
                                                                            updateProviderDraft(payment.id, { providerStatus: event.target.value })
                                                                        }
                                                                        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-primary/50 dark:border-slate-700 dark:bg-slate-950"
                                                                    >
                                                                        {providerStatusOptions.map((status) => (
                                                                            <option key={status} value={status}>
                                                                                {status.replace(/_/g, ' ')}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                    <button
                                                                        type="button"
                                                                        disabled={!isManagerRole || savingProviderPaymentId === payment.id}
                                                                        onClick={() => submitProviderReconciliation(payment.id)}
                                                                        title={isManagerRole ? 'Save provider status' : 'Manager access required'}
                                                                        className="h-10 rounded-lg bg-primary px-4 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
                                                                    >
                                                                        {savingProviderPaymentId === payment.id ? (
                                                                            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                                                                        ) : (
                                                                            'Save'
                                                                        )}
                                                                    </button>
                                                                </div>
                                                                <textarea
                                                                    value={draft.providerNote}
                                                                    onChange={(event) => updateProviderDraft(payment.id, { providerNote: event.target.value })}
                                                                    placeholder="Optional reconciliation note"
                                                                    rows={2}
                                                                    className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-primary/50 dark:border-slate-700 dark:bg-slate-950"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="ml-auto max-w-sm space-y-2 rounded-xl bg-slate-50 dark:bg-slate-900 p-4">
                                    <div className="flex justify-between text-sm font-bold text-slate-500">
                                        <span>Subtotal</span>
                                        <span>
                                            {currency}
                                            {Number(selectedSubtotal || 0).toFixed(2)}
                                        </span>
                                    </div>
                                    {selectedTax > 0 && (
                                        <div className="flex justify-between text-sm font-bold text-slate-500">
                                            <span>{config?.business?.taxName || 'VAT'}</span>
                                            <span>
                                                {currency}
                                                {Number(selectedTax || 0).toFixed(2)}
                                            </span>
                                        </div>
                                    )}
                                    {selectedSale.pointsDiscount !== undefined && selectedSale.pointsDiscount > 0 && (
                                        <div className="flex justify-between text-sm font-bold text-emerald-600">
                                            <span>Points discount</span>
                                            <span>
                                                -{currency}
                                                {Number(selectedSale.pointsDiscount || 0).toFixed(2)}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-3 text-lg font-black text-slate-900 dark:text-white">
                                        <span>Total</span>
                                        <span>
                                            {currency}
                                            {Number(selectedSale.total || 0).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    {refundOpen && (
                        <div
                            className="fixed inset-0 z-70 flex items-end sm:items-center justify-center bg-slate-950/65 p-0 sm:p-4"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="refund-dialog-title"
                        >
                            <div className="w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-2xl">
                                <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
                                    <div>
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-600">
                                            <RotateCcw className="h-4 w-4" />
                                            Guided refund
                                        </div>
                                        <h3 id="refund-dialog-title" className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                                            What should be returned?
                                        </h3>
                                        <p className="mt-1 text-xs font-semibold text-slate-500">
                                            Pick items, choose the refund method, then{' '}
                                            {isManagerRole ? 'review before confirming.' : 'send it to a manager for approval.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setRefundOpen(false)}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900"
                                        aria-label="Close refund"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>

                                <div className="max-h-[calc(92vh-88px)] overflow-y-auto p-5 space-y-5">
                                    {refundError && (
                                        <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
                                            <AlertCircle className="h-5 w-5 shrink-0" />
                                            {refundError}
                                        </div>
                                    )}

                                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                        <div className="bg-slate-50 dark:bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            Items to refund
                                        </div>
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {refundableItems.map((item) => {
                                                const id = (item as any).id || (item as any).productId || item.name;
                                                const maxQty = Math.max(0, Number(item.quantity || 0));
                                                const qty = Math.max(0, Number(refundQuantities[id] || 0));
                                                return (
                                                    <div key={id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
                                                        <div>
                                                            <div className="text-sm font-black text-slate-800 dark:text-slate-100">{item.name}</div>
                                                            <div className="mt-1 text-xs font-semibold text-slate-500">
                                                                Sold {maxQty} at {currency}
                                                                {Number(item.price || 0).toFixed(2)} each
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setRefundQuantities((q) => ({ ...q, [id]: Math.max(0, qty - 1) }))}
                                                                className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 font-black"
                                                            >
                                                                -
                                                            </button>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={maxQty}
                                                                value={qty}
                                                                onChange={(event) => {
                                                                    const next = Math.max(0, Math.min(maxQty, Number(event.target.value || 0)));
                                                                    setRefundQuantities((q) => ({ ...q, [id]: next }));
                                                                }}
                                                                className="h-9 w-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center text-sm font-black"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setRefundQuantities((q) => ({ ...q, [id]: Math.min(maxQty, qty + 1) }))}
                                                                className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 font-black"
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Refund method</label>
                                            <div className={`mt-2 grid gap-2 ${selectedBnplPayment ? 'grid-cols-4' : 'grid-cols-3'}`}>
                                                {(
                                                    (selectedBnplPayment ? ['cash', 'card', 'wallet', 'bnpl'] : ['cash', 'card', 'wallet']) as RefundMethod[]
                                                ).map((method) => {
                                                    const walletBlocked = method === 'wallet' && isBrowserOffline;
                                                    const bnplBlocked = method === 'bnpl' && isBrowserOffline;
                                                    return (
                                                        <button
                                                            key={method}
                                                            type="button"
                                                            onClick={() => {
                                                                if (walletBlocked) {
                                                                    setRefundError(WALLET_ONLINE_REQUIRED_MESSAGE);
                                                                    return;
                                                                }
                                                                if (bnplBlocked) {
                                                                    setRefundError('BNPL refunds need online provider confirmation.');
                                                                    return;
                                                                }
                                                                setRefundMethod(method);
                                                            }}
                                                            disabled={walletBlocked || bnplBlocked}
                                                            title={
                                                                walletBlocked
                                                                    ? WALLET_ONLINE_REQUIRED_MESSAGE
                                                                    : bnplBlocked
                                                                      ? 'BNPL refunds need online provider confirmation'
                                                                      : method
                                                            }
                                                            className={`h-11 rounded-xl border text-xs font-black uppercase tracking-widest disabled:opacity-40 ${refundMethod === method ? 'border-primary bg-primary text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
                                                        >
                                                            {method}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {isBrowserOffline && (
                                                <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-300">
                                                    Wallet and BNPL refunds are online-only.
                                                </p>
                                            )}
                                            {refundMethod === 'bnpl' && (
                                                <div className="mt-3 space-y-2 rounded-xl border border-fuchsia-100 bg-fuchsia-50 p-3 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20">
                                                    <select
                                                        value={bnplRefundProvider}
                                                        onChange={(event) => setBnplRefundProvider(event.target.value)}
                                                        className="h-10 w-full rounded-lg border border-fuchsia-200 bg-white px-3 text-xs font-bold outline-none focus:border-primary/50 dark:border-fuchsia-900 dark:bg-slate-950"
                                                    >
                                                        {bnplProviders.map((provider) => (
                                                            <option key={provider.id} value={provider.id}>
                                                                {provider.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        value={bnplRefundReference}
                                                        onChange={(event) => setBnplRefundReference(event.target.value)}
                                                        placeholder="BNPL refund or reversal reference"
                                                        className="h-10 w-full rounded-lg border border-fuchsia-200 bg-white px-3 text-xs font-bold outline-none focus:border-primary/50 dark:border-fuchsia-900 dark:bg-slate-950"
                                                    />
                                                    <textarea
                                                        value={bnplRefundNote}
                                                        onChange={(event) => setBnplRefundNote(event.target.value)}
                                                        rows={2}
                                                        placeholder="Optional BNPL refund note"
                                                        className="w-full resize-none rounded-lg border border-fuchsia-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-primary/50 dark:border-fuchsia-900 dark:bg-slate-950"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <label className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                                            <input
                                                type="checkbox"
                                                checked={restockRefund}
                                                onChange={(event) => setRestockRefund(event.target.checked)}
                                                className="h-5 w-5 accent-primary"
                                            />
                                            <span>
                                                <span className="block text-sm font-black text-slate-800 dark:text-slate-100">Return items to stock</span>
                                                <span className="block text-xs font-semibold text-slate-500">Turn off for damaged or wasted items.</span>
                                            </span>
                                        </label>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reason</label>
                                        <textarea
                                            value={refundReason}
                                            onChange={(event) => setRefundReason(event.target.value)}
                                            placeholder="e.g. Wrong item, damaged item, customer changed order"
                                            className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm font-semibold outline-none focus:border-primary/50"
                                        />
                                    </div>

                                    <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-4">
                                        <div className="flex items-center justify-between text-sm font-bold text-slate-500">
                                            <span>Selected lines</span>
                                            <span>{selectedRefundLines.length}</span>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3 text-xl font-black text-slate-900 dark:text-white">
                                            <span>Refund total</span>
                                            <span>
                                                {currency}
                                                {refundTotal.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setRefundOpen(false)}
                                            className="h-12 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-black text-slate-600 dark:text-slate-300"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isRefunding || refundTotal <= 0}
                                            onClick={submitRefund}
                                            className="h-12 flex-1 rounded-xl bg-rose-600 text-sm font-black text-white shadow-lg shadow-rose-600/20 disabled:opacity-50"
                                        >
                                            {isRefunding ? (
                                                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                                            ) : isManagerRole ? (
                                                'Confirm refund'
                                            ) : (
                                                'Request approval'
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {voidOpen && (
                        <div
                            className="fixed inset-0 z-70 flex items-end sm:items-center justify-center bg-slate-950/65 p-0 sm:p-4"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="void-dialog-title"
                        >
                            <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-2xl">
                                <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
                                    <div>
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                                            <Ban className="h-4 w-4" />
                                            Guided void
                                        </div>
                                        <h3 id="void-dialog-title" className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                                            Cancel this order?
                                        </h3>
                                        <p className="mt-1 text-xs font-semibold text-slate-500">
                                            Use this for open orders, kitchen tickets, or mistakes before payment is completed.{' '}
                                            {!isManagerRole && 'A manager will approve it before it is applied.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setVoidOpen(false)}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900"
                                        aria-label="Close void"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>

                                <div className="p-5 space-y-5">
                                    {voidError && (
                                        <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
                                            <AlertCircle className="h-5 w-5 shrink-0" />
                                            {voidError}
                                        </div>
                                    )}

                                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                                        <input
                                            type="checkbox"
                                            checked={restockVoid}
                                            onChange={(event) => setRestockVoid(event.target.checked)}
                                            className="h-5 w-5 accent-primary"
                                        />
                                        <span>
                                            <span className="block text-sm font-black text-slate-800 dark:text-slate-100">Return items to stock</span>
                                            <span className="block text-xs font-semibold text-slate-500">
                                                Turn off if items are already prepared or wasted.
                                            </span>
                                        </span>
                                    </label>

                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reason</label>
                                        <textarea
                                            value={voidReason}
                                            onChange={(event) => setVoidReason(event.target.value)}
                                            placeholder="e.g. Duplicate order, customer cancelled, entered by mistake"
                                            className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm font-semibold outline-none focus:border-primary/50"
                                        />
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setVoidOpen(false)}
                                            className="h-12 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-black text-slate-600 dark:text-slate-300"
                                        >
                                            Keep order
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isVoiding}
                                            onClick={submitVoid}
                                            className="h-12 flex-1 rounded-xl bg-slate-800 text-sm font-black text-white shadow-lg shadow-slate-800/20 disabled:opacity-50"
                                        >
                                            {isVoiding ? (
                                                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                                            ) : isManagerRole ? (
                                                'Void order'
                                            ) : (
                                                'Request approval'
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
