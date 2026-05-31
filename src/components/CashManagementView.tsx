import React, { useState, useEffect, useMemo } from 'react';
import { CashCloseCheckpoint, CashClosePreview, CashCustodyTransfer, CashCustodyTransferPartyType, CashSession, CashTransaction, ManagerCashMovement, ManagerCashMovementType, ManagerCashSummary, Sale, Staff } from '../types';
import { Loader2, DollarSign, Calendar, Lock, Unlock, AlertCircle, HandCoins, ShieldCheck, ClipboardCheck, CheckCircle2, XCircle, Clock, Printer, Landmark, Wallet, PiggyBank, ArrowLeftRight, Download, ArrowRight, ChevronDown } from 'lucide-react';
import { usePosStore } from '../store/usePosStore';
import { apiGet, apiPost, apiPut, cancelCashCustodyTransfer, confirmCashCustodyTransfer, createCashCloseCheckpoint, createCashCustodyTransfer, exportCashCloseCheckpointCsv, exportManagerCashMovementsCsv, getCashCloseCheckpoints, getCashClosePreview, getCashCustodyTransfers, getManagerCashMovements, getManagerCashSummary, recordCashMovement, recordManagerCashMovement } from '../api';
import { PrinterReadinessPanel } from './PrinterReadinessPanel';
import { usePrinterReadiness } from '../hooks/usePrinterReadiness';
import { useBrowserOnlineStatus } from '../hooks/useBrowserOnlineStatus';
import { WALLET_ONLINE_REQUIRED_MESSAGE } from '../utils/offlineGuards';

interface CashManagementViewProps {
  currentUserStaff: Staff | null;
  sales: Sale[];
}

type WorkflowSection = 'register' | 'review' | 'custody' | 'endOfDay';

const DENOMINATIONS = [
  { value: 200, label: 'R200 Notes' },
  { value: 100, label: 'R100 Notes' },
  { value: 50,  label: 'R50 Notes' },
  { value: 20,  label: 'R20 Notes' },
  { value: 10,  label: 'R10 Notes' },
  { value: 5,   label: 'R5 Coins' },
  { value: 2,   label: 'R2 Coins' },
  { value: 1,   label: 'R1 Coins' },
  { value: 0.5, label: '50c Coins' },
  { value: 0.2, label: '20c Coins' },
  { value: 0.1, label: '10c Coins' },
];

const MOVEMENT_TYPES = [
  {
    id: 'cash_drop',
    label: 'Safe drop',
    helper: 'Cash removed from the drawer and placed in the safe.',
    direction: 'out' as const,
  },
  {
    id: 'cash_added',
    label: 'Cash added',
    helper: 'Extra cash put into the drawer.',
    direction: 'in' as const,
  },
  {
    id: 'cash_removed',
    label: 'Petty cash / payout',
    helper: 'Cash paid out for a small expense or supplier.',
    direction: 'out' as const,
  },
];

const MANAGER_MOVEMENT_TYPES: Array<{
  id: ManagerCashMovementType;
  label: string;
  helper: string;
  direction?: 'in' | 'out' | 'neutral';
}> = [
  { id: 'manager_adjustment', label: 'Float correction', helper: 'Correct the counted manager float after a safe count.' },
  { id: 'petty_cash', label: 'Petty cash', helper: 'Pay a small expense directly from the manager float.', direction: 'out' },
  { id: 'payout', label: 'Payout', helper: 'Pay staff, customer, or supplier cash from the manager float.', direction: 'out' },
  { id: 'wallet_cash_in', label: 'Wallet cash in', helper: 'Cash received for a wallet top-up.', direction: 'in' },
  { id: 'wallet_cash_out', label: 'Wallet cash out', helper: 'Cash paid out against wallet balance.', direction: 'out' },
  { id: 'transfer', label: 'Transfer', helper: 'Move cash in or out with a clear handover note.' },
];

const CUSTODY_PARTY_TYPES: Array<{ id: CashCustodyTransferPartyType; label: string }> = [
  { id: 'manager_float', label: 'Manager float' },
  { id: 'safe', label: 'Safe' },
  { id: 'register', label: 'Register' },
  { id: 'staff', label: 'Staff member' },
  { id: 'petty_cash', label: 'Petty cash box' },
];

const MANAGER_CASH_SOURCES = [
  { id: 'manager_float', label: 'Manager float' },
  { id: 'safe', label: 'Safe' },
  { id: 'register', label: 'Register' },
  { id: 'petty_cash', label: 'Petty cash box' },
  { id: 'wallet_cash', label: 'Wallet cash' },
  { id: 'cash_custody', label: 'Cash handover' },
  { id: 'supplier', label: 'Supplier payout' },
  { id: 'external', label: 'External cash' },
];

function isWalletManagerMovementType(type: ManagerCashMovementType) {
  return type === 'wallet_cash_in' || type === 'wallet_cash_out';
}

function defaultManagerCashSource(type: ManagerCashMovementType) {
  if (type === 'safe_drop') return 'register';
  if (type === 'transfer') return 'cash_custody';
  if (type === 'wallet_cash_in' || type === 'wallet_cash_out') return 'wallet_cash';
  return 'manager_float';
}

function needsPettyCashAttachment(type: ManagerCashMovementType) {
  return type === 'petty_cash' || type === 'payout';
}

function DenominationCounter({ breakdown, setBreakdown, total }: { breakdown: Record<string, number>, setBreakdown: (b: Record<string, number>) => void, total: number }) {
  const updateQty = (value: number, qty: number) => {
    setBreakdown({ ...breakdown, [value.toString()]: qty });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2 px-1">
        <span className="text-xs font-black uppercase tracking-widest text-slate-500">Denomination</span>
        <span className="text-xs font-black uppercase tracking-widest text-slate-500">Quantity</span>
      </div>
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        {DENOMINATIONS.map(d => {
          const qty = breakdown[d.value.toString()] || 0;
          return (
            <div key={d.value} className="flex justify-between items-center bg-slate-50 dark:bg-[#0B1120] p-2 xl:p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
              <span className="font-bold text-sm w-24 shrink-0">{d.label}</span>
              <div className="flex items-center justify-end gap-3 flex-1">
                 <span className="text-xs font-bold text-slate-400 hidden sm:block">R{(d.value * qty).toFixed(2)}</span>
                 <input 
                   type="number" 
                   min="0" 
                   placeholder="0"
                   value={qty || ''} 
                   onChange={e => updateQty(d.value, parseInt(e.target.value) || 0)} 
                   className="w-16 px-2 py-1.5 text-center font-black bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary shadow-sm" 
                 />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 p-4 bg-primary/10 border border-primary/20 rounded-2xl flex justify-between items-center">
        <span className="font-black text-sm text-primary uppercase tracking-widest">Total Counted</span>
        <span className="text-2xl font-black text-primary">R{total.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function CashManagementView({ currentUserStaff, sales }: CashManagementViewProps) {
  const tenantId = usePosStore(s => s.tenantId);
  const printerReadiness = usePrinterReadiness(tenantId);
  const { isOffline: isBrowserOffline } = useBrowserOnlineStatus();
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [cashMovements, setCashMovements] = useState<Record<string, CashTransaction[]>>({});
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [openingBreakdown, setOpeningBreakdown] = useState<Record<string, number>>({});
  const [closingBreakdown, setClosingBreakdown] = useState<Record<string, number>>({});
  const [closeNotes, setCloseNotes] = useState("");
  const [managerNotes, setManagerNotes] = useState<Record<string, string>>({});
  const [varianceReasons, setVarianceReasons] = useState<Record<string, string>>({});
  const [movementType, setMovementType] = useState<'cash_drop' | 'cash_added' | 'cash_removed'>('cash_drop');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementNote, setMovementNote] = useState('');
  const [movementError, setMovementError] = useState('');
  const [managerCash, setManagerCash] = useState<ManagerCashSummary | null>(null);
  const [managerMovements, setManagerMovements] = useState<ManagerCashMovement[]>([]);
  const [managerMovementType, setManagerMovementType] = useState<ManagerCashMovementType>('manager_adjustment');
  const [managerMovementDirection, setManagerMovementDirection] = useState<'in' | 'out'>('in');
  const [managerMovementAmount, setManagerMovementAmount] = useState('');
  const [managerMovementNote, setManagerMovementNote] = useState('');
  const [managerMovementCashSource, setManagerMovementCashSource] = useState(defaultManagerCashSource('manager_adjustment'));
  const [managerMovementAttachmentUrl, setManagerMovementAttachmentUrl] = useState('');
  const [managerMovementAttachmentName, setManagerMovementAttachmentName] = useState('');
  const [managerMovementFilterType, setManagerMovementFilterType] = useState<ManagerCashMovementType | ''>('');
  const [managerMovementFilterSource, setManagerMovementFilterSource] = useState('');
  const [managerMovementSearch, setManagerMovementSearch] = useState('');
  const [managerMovementMessage, setManagerMovementMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [custodyTransfers, setCustodyTransfers] = useState<CashCustodyTransfer[]>([]);
  const [transferFromType, setTransferFromType] = useState<CashCustodyTransferPartyType>('manager_float');
  const [transferToType, setTransferToType] = useState<CashCustodyTransferPartyType>('register');
  const [transferCashSessionId, setTransferCashSessionId] = useState('');
  const [transferCounterpartyName, setTransferCounterpartyName] = useState('');
  const [transferExpectedAmount, setTransferExpectedAmount] = useState('');
  const [transferCountedBreakdown, setTransferCountedBreakdown] = useState<Record<string, number>>({});
  const [transferNote, setTransferNote] = useState('');
  const [transferMessage, setTransferMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [cashClosePreview, setCashClosePreview] = useState<CashClosePreview | null>(null);
  const [cashCloseHistory, setCashCloseHistory] = useState<CashCloseCheckpoint[]>([]);
  const [cashCloseBreakdown, setCashCloseBreakdown] = useState<Record<string, number>>({});
  const [cashCloseNote, setCashCloseNote] = useState('');
  const [cashCloseMessage, setCashCloseMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [workflowSection, setWorkflowSection] = useState<WorkflowSection>('register');

  const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const activeSession = sessions.find(s => s.status === 'open' && s.staffId === currentUserStaff?.id);
  const canManageCash = ['admin', 'manager', 'dev'].includes(currentUserStaff?.role || '');
  const selectedManagerMovementType = MANAGER_MOVEMENT_TYPES.find(type => type.id === managerMovementType) || MANAGER_MOVEMENT_TYPES[0];
  const managerWalletMovementBlocked = isBrowserOffline && isWalletManagerMovementType(managerMovementType);
  const pendingReview = sessions.filter(s => s.status === 'closed' && (s.reviewStatus || 'submitted') !== 'reconciled');
  const openRegisterSessions = sessions.filter(s => s.status === 'open');
  const pendingCustodyTransfers = custodyTransfers.filter(t => t.status === 'pending_confirmation');
  const transferCountedAmount = Object.entries(transferCountedBreakdown).reduce((acc, [val, qty]) => acc + (parseFloat(val) * Number(qty)), 0);
  const transferExpectedNumber = toNumber(transferExpectedAmount);
  const transferVariancePreview = Number((transferCountedAmount - transferExpectedNumber).toFixed(2));
  const cashCloseCountedAmount = Object.entries(cashCloseBreakdown).reduce((acc, [val, qty]) => acc + (parseFloat(val) * Number(qty)), 0);
  const cashCloseExpectedAmount = toNumber(cashClosePreview?.expectedPhysicalCash);
  const cashCloseVariancePreview = Number((cashCloseCountedAmount - cashCloseExpectedAmount).toFixed(2));
  const today = new Date().toDateString();
  const isToday = (date: any) => {
    if (!date) return false;
    const parsed = new Date(date);
    return !isNaN(parsed.getTime()) && parsed.toDateString() === today;
  };
  const todaysSessions = sessions.filter(s => isToday(s.openedAt) || isToday(s.closedAt));
  const todaysClosedSessions = sessions.filter(s => s.status === 'closed' && new Date(s.closedAt || s.openedAt).toDateString() === today);
  const eodTotals = todaysClosedSessions.reduce((acc, s) => {
    acc.expected += toNumber((s as any).expectedCash);
    acc.actual += toNumber((s as any).actualCash);
    acc.variance += toNumber((s as any).difference);
    acc.tips += toNumber((s as any).netTips);
    if ((s.reviewStatus || 'submitted') === 'reconciled') acc.reconciled += 1;
    return acc;
  }, { expected: 0, actual: 0, variance: 0, tips: 0, reconciled: 0 });
  const newFloat = Object.entries(openingBreakdown).reduce((acc, [val, qty]) => acc + (parseFloat(val) * Number(qty)), 0);
  const closeAmount = Object.entries(closingBreakdown).reduce((acc, [val, qty]) => acc + (parseFloat(val) * Number(qty)), 0);
  const todaysMovements = todaysSessions.flatMap(session => cashMovements[session.id] || []);
  const zReport = useMemo(() => {
    const todaySales = sales.filter(s => isToday(s.createdAt));
    const completedSales = todaySales.filter(s => s.status === 'completed' && s.transactionType !== 'refund' && s.transactionType !== 'void');
    const refundSales = todaySales.filter(s => s.transactionType === 'refund');
    const voidSales = todaySales.filter(s => s.transactionType === 'void');
    const openOrders = sales.filter(s => (s.status === 'open' || s.status === 'kitchen' || s.status === 'pending') && s.transactionType !== 'refund' && s.transactionType !== 'void');
    const paymentTotals = completedSales.reduce((acc, sale) => {
      const payments = sale.payments && sale.payments.length > 0
        ? sale.payments
        : [{ method: sale.paymentMethod, amount: Number(sale.total || 0) }];
      payments.forEach(payment => {
        const method = String(payment.method || 'pending') as keyof typeof acc;
        if (method in acc) acc[method] += Math.max(0, Number(payment.amount || 0));
      });
      return acc;
    }, { cash: 0, card: 0, wallet: 0, payfast: 0, pending: 0 });
    const movementTotal = (type: CashTransaction['type']) => todaysMovements
      .filter(movement => movement.type === type)
      .reduce((sum, movement) => sum + toNumber(movement.amount), 0);
    const grossSales = completedSales.reduce((sum, sale) => sum + Math.max(0, Number(sale.total || 0)), 0);
    const refunds = refundSales.reduce((sum, sale) => sum + Math.abs(Number(sale.total || 0)), 0);
    return {
      completedSales,
      refundSales,
      voidSales,
      openOrders,
      paymentTotals,
      grossSales,
      refunds,
      netSales: grossSales - refunds,
      safeDrops: movementTotal('cash_drop'),
      cashAdded: movementTotal('cash_added'),
      pettyCash: movementTotal('cash_removed'),
      noSaleOpens: todaysMovements.filter(movement => movement.type === 'no_sale').length,
      openSessions: sessions.filter(session => session.status === 'open'),
      unreconciledSessions: pendingReview,
    };
  }, [sales, todaysMovements, sessions, pendingReview, today]);
  const zChecklist = [
    {
      label: 'Close all registers',
      ok: zReport.openSessions.length === 0,
      detail: zReport.openSessions.length === 0 ? 'No open registers' : `${zReport.openSessions.length} register${zReport.openSessions.length === 1 ? '' : 's'} still open`,
    },
    {
      label: 'Clear open orders and tabs',
      ok: zReport.openOrders.length === 0,
      detail: zReport.openOrders.length === 0 ? 'No open orders or tabs' : `${zReport.openOrders.length} order${zReport.openOrders.length === 1 ? '' : 's'} still active`,
    },
    {
      label: 'Review submitted cash-ups',
      ok: zReport.unreconciledSessions.length === 0,
      detail: zReport.unreconciledSessions.length === 0 ? 'All cash-ups reconciled' : `${zReport.unreconciledSessions.length} cash-up${zReport.unreconciledSessions.length === 1 ? '' : 's'} need review`,
    },
    {
      label: 'Confirm cash handovers',
      ok: pendingCustodyTransfers.length === 0,
      detail: pendingCustodyTransfers.length === 0 ? 'No pending cash handovers' : `${pendingCustodyTransfers.length} handover${pendingCustodyTransfers.length === 1 ? '' : 's'} need confirmation`,
    },
    {
      label: 'Receipt printer checked',
      ok: printerReadiness.isReadyToday,
      detail: printerReadiness.isReadyToday ? 'Printer test passed today' : printerReadiness.needsAttention ? 'Printer needs attention before final reports' : 'Run a test print before closing',
    },
  ];

  const fetchSessions = async () => {
    if (!tenantId) return;
    try {
      let data = await apiGet<CashSession[]>(`/api/mariadb/tenants/${tenantId}/cash-sessions?limit=50`);
      if (currentUserStaff?.role === 'cashier') {
        data = data.filter(s => s.staffId === currentUserStaff.id);
      }
      const normalized = (data || []).map(s => ({
        ...s,
        openingFloat: toNumber((s as any).openingFloat),
        expectedCash: toNumber((s as any).expectedCash),
        actualCash: toNumber((s as any).actualCash),
        difference: toNumber((s as any).difference),
        accumulatedTips: toNumber((s as any).accumulatedTips),
        netTips: toNumber((s as any).netTips),
        reviewStatus: (s as any).reviewStatus || ((s as any).status === 'open' ? 'in_progress' : 'submitted'),
      })) as CashSession[];
      setSessions(normalized);
      const visibleTodaySessions = normalized.filter(s => isToday(s.openedAt) || isToday(s.closedAt));
      const movementPairs = await Promise.all(visibleTodaySessions.map(async session => {
        const movements = await apiGet<CashTransaction[]>(`/api/mariadb/tenants/${tenantId}/cash-sessions/${session.id}/movements`).catch(() => []);
        return [session.id, movements] as const;
      }));
      setCashMovements(Object.fromEntries(movementPairs));
      if (canManageCash) {
        const managerMovementFilters = {
          limit: 40,
          movementType: managerMovementFilterType || undefined,
          cashSource: managerMovementFilterSource || undefined,
          search: managerMovementSearch.trim() || undefined,
        };
        const [cashSummary, transfers, movementRows] = await Promise.all([
          getManagerCashSummary(tenantId).catch(() => null),
          getCashCustodyTransfers(tenantId, { limit: 30 }).catch(() => []),
          getManagerCashMovements(tenantId, managerMovementFilters).catch(() => []),
        ]);
        setManagerCash(cashSummary);
        setCustodyTransfers(transfers);
        setManagerMovements(movementRows);
        const [closePreview, closeHistory] = await Promise.all([
          getCashClosePreview(tenantId).catch(() => null),
          getCashCloseCheckpoints(tenantId, 5).catch(() => []),
        ]);
        setCashClosePreview(closePreview);
        setCashCloseHistory(closeHistory);
      } else {
        setManagerCash(null);
        setManagerMovements([]);
        setCustodyTransfers([]);
        setCashClosePreview(null);
        setCashCloseHistory([]);
      }
      usePosStore.getState().setActiveSession(normalized.find(s => s.status === 'open' && s.staffId === currentUserStaff?.id) || null);
    } catch (err) {
      console.error('CashSessions fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [tenantId, currentUserStaff?.role, currentUserStaff?.id, managerMovementFilterType, managerMovementFilterSource, managerMovementSearch]);

  useEffect(() => {
    if (!canManageCash && (workflowSection === 'review' || workflowSection === 'custody')) {
      setWorkflowSection('register');
    }
  }, [canManageCash, workflowSection]);

  const openRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserStaff || !tenantId) return;
    setIsProcessing(true);
    try {
      await apiPost(`/api/mariadb/tenants/${tenantId}/cash-sessions`, {
        staffId: currentUserStaff.id,
        staffName: currentUserStaff.name,
        openedAt: new Date().toISOString(),
        openingFloat: newFloat,
        openingBreakdown,
        expectedCash: newFloat,
        status: 'open',
      });
      await fetchSessions();
      setOpeningBreakdown({});
    } catch (err) {
      console.error(err);
    }
    setIsProcessing(false);
  };

  const closeRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !tenantId) return;
    setIsProcessing(true);
    try {
      const difference = closeAmount - toNumber((activeSession as any).expectedCash);
      let netTips = toNumber((activeSession as any).accumulatedTips);
      if (difference < 0) {
        netTips = Math.max(0, netTips + difference);
      }
      await apiPut(`/api/mariadb/tenants/${tenantId}/cash-sessions/${activeSession.id}`, {
        status: 'closed',
        reviewStatus: 'submitted',
        closedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        actualCash: closeAmount,
        closingBreakdown,
        difference,
        netTips,
        notes: closeNotes,
      });
      await fetchSessions();
      setClosingBreakdown({});
      setCloseNotes('');
    } catch (err) {
      console.error(err);
    }
    setIsProcessing(false);
  };

  const reviewSession = async (session: CashSession, reviewStatus: 'reviewed' | 'reconciled' | 'disputed') => {
    if (!tenantId) return;
    setIsProcessing(true);
    try {
      await apiPut(`/api/mariadb/tenants/${tenantId}/cash-sessions/${session.id}/review`, {
        reviewStatus,
        managerNotes: managerNotes[session.id] || '',
        varianceReason: varianceReasons[session.id] || '',
      });
      await fetchSessions();
    } catch (err) {
      console.error(err);
    }
    setIsProcessing(false);
  };

  const recordDrawerMovement = async () => {
    if (!tenantId || !activeSession || !currentUserStaff) return;
    const selectedMovement = MOVEMENT_TYPES.find(type => type.id === movementType) || MOVEMENT_TYPES[0];
    const amount = toNumber(movementAmount);
    setMovementError('');

    if (amount <= 0) {
      setMovementError('Enter the cash amount first.');
      return;
    }
    if (!canManageCash) {
      setMovementError('Manager approval is required for safe drops, cash added, and petty cash payouts.');
      return;
    }
    if (movementNote.trim().length < 3) {
      setMovementError('Add a short reason so cash-up review is clear.');
      return;
    }

    setIsProcessing(true);
    try {
      await recordCashMovement(tenantId, activeSession.id, {
        type: selectedMovement.id,
        direction: selectedMovement.direction,
        amount,
        staffId: currentUserStaff.id,
        staffName: currentUserStaff.name,
        note: movementNote.trim(),
      });
      await fetchSessions();
      setMovementAmount('');
      setMovementNote('');
      setMovementType('cash_drop');
    } catch (err: any) {
      setMovementError(err?.message || 'Could not record this drawer movement.');
    } finally {
      setIsProcessing(false);
    }
  };

  const recordManagerMovement = async () => {
    if (!tenantId || !currentUserStaff || !canManageCash) return;
    const selected = selectedManagerMovementType;
    const amount = toNumber(managerMovementAmount);
    const direction = selected.direction && selected.direction !== 'neutral' ? selected.direction : managerMovementDirection;
    const receiptAttachmentUrl = managerMovementAttachmentUrl.trim();
    const receiptAttachmentName = managerMovementAttachmentName.trim() || receiptAttachmentUrl;
    setManagerMovementMessage(null);

    if (isBrowserOffline && isWalletManagerMovementType(selected.id)) {
      setManagerMovementMessage({ tone: 'error', text: WALLET_ONLINE_REQUIRED_MESSAGE });
      return;
    }

    if (amount <= 0) {
      setManagerMovementMessage({ tone: 'error', text: 'Enter the cash amount first.' });
      return;
    }
    if (managerMovementNote.trim().length < 3) {
      setManagerMovementMessage({ tone: 'error', text: 'Add a short note so the manager float audit trail is clear.' });
      return;
    }
    if (needsPettyCashAttachment(selected.id) && !receiptAttachmentUrl && !receiptAttachmentName) {
      setManagerMovementMessage({ tone: 'error', text: 'Add a receipt/photo link or reference for petty cash and payouts.' });
      return;
    }

    setIsProcessing(true);
    try {
      await recordManagerCashMovement(tenantId, {
        movementType: selected.id,
        direction,
        amount,
        sourceType: 'manager_float',
        cashSource: managerMovementCashSource,
        category: selected.id,
        staffId: currentUserStaff.id,
        staffName: currentUserStaff.name,
        note: managerMovementNote.trim(),
        receiptAttachmentUrl: receiptAttachmentUrl || null,
        receiptAttachmentName: receiptAttachmentName || null,
        approvedBy: currentUserStaff.id,
        approvedByName: currentUserStaff.name,
      });
      setManagerMovementAmount('');
      setManagerMovementNote('');
      setManagerMovementAttachmentUrl('');
      setManagerMovementAttachmentName('');
      setManagerMovementType('manager_adjustment');
      setManagerMovementDirection('in');
      setManagerMovementCashSource(defaultManagerCashSource('manager_adjustment'));
      setManagerMovementMessage({ tone: 'success', text: 'Manager float movement recorded.' });
      await fetchSessions();
    } catch (err: any) {
      setManagerMovementMessage({ tone: 'error', text: err?.message || 'Could not record manager float movement.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const requestCustodyTransfer = async () => {
    if (!tenantId || !currentUserStaff || !canManageCash) return;
    const expectedAmount = toNumber(transferExpectedAmount);
    const countedAmount = Number(transferCountedAmount.toFixed(2));
    const registerSide = transferFromType === 'register' || transferToType === 'register';
    const selectedSession = openRegisterSessions.find(session => session.id === transferCashSessionId);
    const counterpartyName = transferCounterpartyName.trim();
    setTransferMessage(null);

    if (transferFromType === transferToType) {
      setTransferMessage({ tone: 'error', text: 'Choose two different cash points.' });
      return;
    }
    if (expectedAmount <= 0) {
      setTransferMessage({ tone: 'error', text: 'Enter the expected amount to hand over.' });
      return;
    }
    if (countedAmount <= 0) {
      setTransferMessage({ tone: 'error', text: 'Count the cash handed over before requesting confirmation.' });
      return;
    }
    if (registerSide && !selectedSession) {
      setTransferMessage({ tone: 'error', text: 'Choose the register involved in this handover.' });
      return;
    }
    if ((transferFromType === 'staff' || transferToType === 'staff') && counterpartyName.length < 2) {
      setTransferMessage({ tone: 'error', text: 'Enter the staff member name for the handover.' });
      return;
    }
    if (transferNote.trim().length < 3) {
      setTransferMessage({ tone: 'error', text: 'Add a short handover note.' });
      return;
    }

    const sideName = (type: CashCustodyTransferPartyType) => {
      if (type === 'register') return selectedSession ? `${selectedSession.staffName} register` : 'Register';
      if (type === 'staff') return counterpartyName;
      return CUSTODY_PARTY_TYPES.find(party => party.id === type)?.label || type.replace(/_/g, ' ');
    };

    setIsProcessing(true);
    try {
      await createCashCustodyTransfer(tenantId, {
        fromType: transferFromType,
        fromId: transferFromType === 'register' ? selectedSession?.id || null : null,
        fromName: sideName(transferFromType),
        toType: transferToType,
        toId: transferToType === 'register' ? selectedSession?.id || null : null,
        toName: sideName(transferToType),
        cashSessionId: selectedSession?.id || null,
        expectedAmount,
        countedAmount,
        countedBreakdown: transferCountedBreakdown,
        note: transferNote.trim(),
      });
      setTransferExpectedAmount('');
      setTransferCounterpartyName('');
      setTransferCashSessionId('');
      setTransferCountedBreakdown({});
      setTransferNote('');
      setTransferMessage({ tone: 'success', text: 'Cash handover requested. A second manager or admin should confirm the count.' });
      await fetchSessions();
    } catch (err: any) {
      setTransferMessage({ tone: 'error', text: err?.message || 'Could not request this cash handover.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const decideCustodyTransfer = async (transfer: CashCustodyTransfer, action: 'confirm' | 'cancel') => {
    if (!tenantId || !canManageCash) return;
    setTransferMessage(null);
    setIsProcessing(true);
    try {
      if (action === 'confirm') {
        await confirmCashCustodyTransfer(tenantId, transfer.id, {
          countedAmount: transfer.countedAmount || transfer.expectedAmount,
          countedBreakdown: transfer.countedBreakdown || {},
          note: transfer.note || null,
        });
        setTransferMessage({ tone: 'success', text: 'Cash handover confirmed and posted to the cash ledger.' });
      } else {
        await cancelCashCustodyTransfer(tenantId, transfer.id, { note: 'Cancelled from Cash Management' });
        setTransferMessage({ tone: 'success', text: 'Cash handover cancelled.' });
      }
      await fetchSessions();
    } catch (err: any) {
      setTransferMessage({ tone: 'error', text: err?.message || 'Could not update this cash handover.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const createEndOfDayCheckpoint = async () => {
    if (!tenantId || !canManageCash || !cashClosePreview) return;
    setCashCloseMessage(null);
    if (cashCloseExpectedAmount > 0 && cashCloseCountedAmount <= 0) {
      setCashCloseMessage({ tone: 'error', text: 'Count the total physical cash before creating the EOD checkpoint.' });
      return;
    }
    if (cashClosePreview.unresolvedItems.length > 0 && cashCloseNote.trim().length < 3) {
      setCashCloseMessage({ tone: 'error', text: 'Add a short note for unresolved registers, cash-ups, or handovers.' });
      return;
    }

    setIsProcessing(true);
    try {
      const checkpoint = await createCashCloseCheckpoint(tenantId, {
        businessDate: cashClosePreview.businessDate,
        countedAmount: Number(cashCloseCountedAmount.toFixed(2)),
        countedBreakdown: cashCloseBreakdown,
        note: cashCloseNote.trim() || null,
      });
      setCashCloseMessage({
        tone: checkpoint.status === 'balanced' ? 'success' : 'error',
        text: checkpoint.status === 'balanced'
          ? 'EOD cash checkpoint saved and balanced.'
          : 'EOD checkpoint saved. Variance or unresolved cash items were sent to Action Center.',
      });
      setCashCloseBreakdown({});
      setCashCloseNote('');
      await fetchSessions();
    } catch (err: any) {
      setCashCloseMessage({ tone: 'error', text: err?.message || 'Could not save the EOD cash checkpoint.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadCashCloseCsv = async (checkpoint: CashCloseCheckpoint) => {
    if (!tenantId) return;
    try {
      const result = await exportCashCloseCheckpointCsv(tenantId, checkpoint.id);
      const blob = new Blob([result.csv], { type: result.mimeType || 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || `cash-close-${checkpoint.businessDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setCashCloseMessage({ tone: 'error', text: err?.message || 'Could not export the cash close checkpoint.' });
    }
  };

  const downloadManagerMovementsCsv = async () => {
    if (!tenantId) return;
    setManagerMovementMessage(null);
    try {
      const result = await exportManagerCashMovementsCsv(tenantId, {
        limit: 500,
        movementType: managerMovementFilterType || undefined,
        cashSource: managerMovementFilterSource || undefined,
        search: managerMovementSearch.trim() || undefined,
      });
      const blob = new Blob([result.csv], { type: result.mimeType || 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || 'manager-cash-movements.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setManagerMovementMessage({ tone: 'success', text: `Exported ${result.count || 0} manager cash movement${result.count === 1 ? '' : 's'}.` });
    } catch (err: any) {
      setManagerMovementMessage({ tone: 'error', text: err?.message || 'Could not export manager cash movements.' });
    }
  };

  const reviewBadge = (session: CashSession) => {
    const status = session.reviewStatus || (session.status === 'open' ? 'in_progress' : 'submitted');
    if (status === 'reconciled') return 'bg-emerald-100 text-emerald-700';
    if (status === 'disputed') return 'bg-red-100 text-red-700';
    if (status === 'reviewed') return 'bg-blue-100 text-blue-700';
    if (status === 'submitted') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  };

  const closedSessions = sessions.filter(s => s.status === 'closed');
  const cashCloseIssues = zChecklist.filter(item => !item.ok);
  const workflowSections: Array<{
    id: WorkflowSection;
    label: string;
    value: string;
    detail: string;
    icon: typeof DollarSign;
    tone: string;
    managerOnly?: boolean;
  }> = [
    {
      id: 'register' as WorkflowSection,
      label: '1. Register',
      value: activeSession ? 'Open' : 'Closed',
      detail: activeSession ? `Expected R${toNumber((activeSession as any).expectedCash).toFixed(2)}` : 'Count float before cash sales',
      icon: DollarSign,
      tone: activeSession ? 'text-emerald-600' : 'text-slate-500',
    },
    {
      id: 'review' as WorkflowSection,
      label: '2. Cash-up review',
      value: `${pendingReview.length}`,
      detail: pendingReview.length === 1 ? 'Cash-up needs review' : 'Cash-ups need review',
      icon: ClipboardCheck,
      tone: pendingReview.length > 0 ? 'text-amber-600' : 'text-emerald-600',
      managerOnly: true,
    },
    {
      id: 'custody' as WorkflowSection,
      label: '3. Float & handovers',
      value: `${pendingCustodyTransfers.length}`,
      detail: pendingCustodyTransfers.length === 1 ? 'Handover waiting' : 'Handovers waiting',
      icon: ArrowLeftRight,
      tone: pendingCustodyTransfers.length > 0 ? 'text-orange-600' : 'text-primary',
      managerOnly: true,
    },
    {
      id: 'endOfDay' as WorkflowSection,
      label: '4. End of day',
      value: cashCloseIssues.length === 0 ? 'Ready' : `${cashCloseIssues.length}`,
      detail: cashCloseIssues.length === 0 ? 'Checks clear' : 'Close checks left',
      icon: Printer,
      tone: cashCloseIssues.length === 0 ? 'text-emerald-600' : 'text-amber-600',
    },
  ].filter(section => !section.managerOnly || canManageCash);
  const selectedWorkflowSection = workflowSections.find(section => section.id === workflowSection) || workflowSections[0]!;
  const SelectedWorkflowIcon = selectedWorkflowSection.icon;

  const nextWorkflowAction = activeSession
    ? {
      section: 'register' as WorkflowSection,
      eyebrow: 'Current action',
      title: 'Finish the open register',
      detail: `Expected cash is R${toNumber((activeSession as any).expectedCash).toFixed(2)} before final count.`,
      action: 'Go to register',
    }
    : canManageCash && pendingReview.length > 0
      ? {
        section: 'review' as WorkflowSection,
        eyebrow: 'Current action',
        title: `${pendingReview.length} cash-up${pendingReview.length === 1 ? '' : 's'} waiting`,
        detail: 'Review the variance, add a note if needed, then reconcile or dispute.',
        action: 'Review cash-ups',
      }
      : canManageCash && pendingCustodyTransfers.length > 0
        ? {
          section: 'custody' as WorkflowSection,
          eyebrow: 'Current action',
          title: `${pendingCustodyTransfers.length} cash handover${pendingCustodyTransfers.length === 1 ? '' : 's'} pending`,
          detail: 'Confirm the counted cash before it lands in the manager ledger.',
          action: 'Open handovers',
        }
        : cashCloseIssues.length > 0
          ? {
            section: 'endOfDay' as WorkflowSection,
            eyebrow: 'Current action',
            title: `${cashCloseIssues.length} end-of-day check${cashCloseIssues.length === 1 ? '' : 's'} left`,
            detail: cashCloseIssues[0]?.detail || 'Clear close checks before saving the day.',
            action: 'View close',
          }
          : {
            section: 'register' as WorkflowSection,
            eyebrow: 'All clear',
            title: 'Cash workflow is balanced',
            detail: 'Open the next register when the shift starts.',
            action: 'Open register',
          };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-[1200px] mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Cash Management</h2>
          <p className="text-slate-500 font-medium">Manage drawer float, record cash ups, and view shift history.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pending Review</p>
                <p className="text-2xl font-black">{pendingReview.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Today Expected</p>
            <p className="text-2xl font-black">R{eodTotals.expected.toFixed(2)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Today Counted</p>
            <p className="text-2xl font-black">R{eodTotals.actual.toFixed(2)}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Today Variance</p>
            <p className={`text-2xl font-black ${eodTotals.variance === 0 ? 'text-emerald-600' : eodTotals.variance > 0 ? 'text-blue-600' : 'text-orange-600'}`}>R{eodTotals.variance.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 lg:p-6 rounded-3xl border border-slate-100 dark:border-slate-800/60 shadow-sm space-y-5">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{nextWorkflowAction.eyebrow}</p>
              <h3 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">{nextWorkflowAction.title}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">{nextWorkflowAction.detail}</p>
            </div>
            <button
              type="button"
              onClick={() => setWorkflowSection(nextWorkflowAction.section)}
              className="h-11 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              {nextWorkflowAction.action}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div>
              <label htmlFor="cash-workflow-section" className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Work section</label>
              <div className="relative">
                <select
                  id="cash-workflow-section"
                  value={workflowSection}
                  onChange={event => setWorkflowSection(event.target.value as WorkflowSection)}
                  className="w-full h-14 appearance-none rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-sm font-black text-slate-900 outline-none transition-all focus:border-primary dark:border-slate-700 dark:bg-slate-950/50 dark:text-white"
                >
                  {workflowSections.map(section => (
                    <option key={section.id} value={section.id}>
                      {section.label} - {section.value} - {section.detail}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <div className="min-h-[88px] rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="flex items-start gap-3">
                <SelectedWorkflowIcon className={`mt-0.5 h-5 w-5 shrink-0 ${selectedWorkflowSection.tone}`} />
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{selectedWorkflowSection.label}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className={`text-2xl font-black ${selectedWorkflowSection.tone}`}>{selectedWorkflowSection.value}</p>
                    <p className="text-sm font-semibold text-slate-500">{selectedWorkflowSection.detail}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {workflowSection === 'custody' && canManageCash && managerCash && (
          <div className="bg-white dark:bg-slate-900 p-6 lg:p-8 rounded-3xl border border-slate-100 dark:border-slate-800/60 shadow-sm space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <Landmark className="w-6 h-6 text-primary" />
                  Manager float
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Live cash position across registers, pending cash-ups, safe cash, petty cash, payouts, and wallet liability.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-950 text-white px-5 py-4 min-w-[220px]">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total physical cash</p>
                <p className="mt-1 text-3xl font-black">R{managerCash.totalPhysicalCash.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              {[
                { label: 'Manager float', value: managerCash.managerFloat, icon: Landmark, tone: 'text-primary' },
                { label: 'Open registers', value: managerCash.openRegisterCash, icon: DollarSign, tone: 'text-emerald-600' },
                { label: 'Pending cash-ups', value: managerCash.pendingCashUpCash, icon: ClipboardCheck, tone: 'text-amber-600' },
                { label: 'Wallet liability', value: managerCash.walletLiability, icon: Wallet, tone: 'text-blue-600' },
                { label: 'Pending payouts', value: managerCash.pendingPayouts, icon: PiggyBank, tone: 'text-rose-600' },
                { label: 'Pending handovers', value: managerCash.pendingCustodyTransfers, icon: ArrowLeftRight, tone: 'text-purple-600', count: true },
                { label: 'Handover variance', value: managerCash.custodyVarianceToday, icon: AlertCircle, tone: managerCash.custodyVarianceToday === 0 ? 'text-emerald-600' : 'text-orange-600' },
              ].map(card => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-4">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${card.tone}`} />
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{card.label}</p>
                    </div>
                    <p className={`mt-2 text-xl font-black ${card.tone}`}>{card.count ? Number(card.value || 0) : `R${Number(card.value || 0).toFixed(2)}`}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 p-4 space-y-4">
                <div>
                  <h4 className="font-black text-slate-900 dark:text-white">Record manager float movement</h4>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Use this for safe count corrections, petty cash from the safe, payouts, and wallet cash handovers.</p>
                </div>

                {managerMovementMessage && (
                  <div className={`rounded-xl border p-3 text-sm font-bold ${
                    managerMovementMessage.tone === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                  }`}>
                    {managerMovementMessage.text}
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  {MANAGER_MOVEMENT_TYPES.map(type => {
                    const walletBlocked = isBrowserOffline && isWalletManagerMovementType(type.id);
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => {
                          setManagerMovementType(type.id);
                          setManagerMovementCashSource(defaultManagerCashSource(type.id));
                        }}
                        disabled={walletBlocked}
                        title={walletBlocked ? WALLET_ONLINE_REQUIRED_MESSAGE : type.label}
                        className={`rounded-xl border p-3 text-left transition-all disabled:opacity-50 ${
                          managerMovementType === type.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <span className="block text-xs font-black uppercase tracking-widest">{type.label}</span>
                        <span className="mt-1 block text-xs font-semibold text-slate-500">{type.helper}</span>
                      </button>
                    );
                  })}
                </div>

                {managerWalletMovementBlocked && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                    {WALLET_ONLINE_REQUIRED_MESSAGE}
                  </div>
                )}

                {!selectedManagerMovementType.direction && (
                  <div className="grid grid-cols-2 gap-2">
                    {(['in', 'out'] as const).map(direction => (
                      <button
                        key={direction}
                        type="button"
                        onClick={() => setManagerMovementDirection(direction)}
                        className={`h-11 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
                          managerMovementDirection === direction
                            ? 'border-primary bg-primary text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 text-slate-500'
                        }`}
                      >
                        Cash {direction}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-[130px_1fr]">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={managerMovementAmount}
                      onChange={e => setManagerMovementAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Reason</label>
                    <input
                      value={managerMovementNote}
                      onChange={e => setManagerMovementNote(e.target.value)}
                      placeholder="e.g. Counted safe, paid supplier, wallet cash received"
                      className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-bold"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Cash source</label>
                    <select
                      value={managerMovementCashSource}
                      onChange={e => setManagerMovementCashSource(e.target.value)}
                      className="w-full h-12 px-3 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-bold"
                    >
                      {MANAGER_CASH_SOURCES.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">
                      Receipt/photo {needsPettyCashAttachment(selectedManagerMovementType.id) ? 'required' : 'optional'}
                    </label>
                    <input
                      value={managerMovementAttachmentUrl}
                      onChange={e => {
                        setManagerMovementAttachmentUrl(e.target.value);
                        setManagerMovementAttachmentName(e.target.value);
                      }}
                      placeholder="Receipt URL, photo link, or reference"
                      className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-bold"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isProcessing || managerWalletMovementBlocked}
                  title={managerWalletMovementBlocked ? WALLET_ONLINE_REQUIRED_MESSAGE : 'Record manager movement'}
                  onClick={recordManagerMovement}
                  className="w-full h-12 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Record manager movement
                </button>
              </div>

              <div className="rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950/50 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Manager cash movements</p>
                    <button
                      type="button"
                      onClick={downloadManagerMovementsCsv}
                      className="h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-200 flex items-center gap-2 active:scale-95 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      value={managerMovementSearch}
                      onChange={e => setManagerMovementSearch(e.target.value)}
                      placeholder="Search notes, staff, receipt"
                      className="h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary text-xs font-bold"
                    />
                    <select
                      value={managerMovementFilterType}
                      onChange={e => setManagerMovementFilterType(e.target.value as ManagerCashMovementType | '')}
                      className="h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary text-xs font-bold"
                    >
                      <option value="">All movement types</option>
                      {MANAGER_MOVEMENT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                    </select>
                    <select
                      value={managerMovementFilterSource}
                      onChange={e => setManagerMovementFilterSource(e.target.value)}
                      className="h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary text-xs font-bold"
                    >
                      <option value="">All cash sources</option>
                      {MANAGER_CASH_SOURCES.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[390px] overflow-y-auto custom-scrollbar">
                  {managerMovements.length === 0 ? (
                    <div className="p-6 text-sm font-bold text-slate-500">No manager cash movements match the current filters.</div>
                  ) : managerMovements.map(movement => (
                    <div key={movement.id} className="p-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900 dark:text-white">{movement.movementType.replace(/_/g, ' ')}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{movement.note || movement.sourceType || 'Manager float'}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {movement.cashSource && (
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                              {movement.cashSource.replace(/_/g, ' ')}
                            </span>
                          )}
                          {movement.staffName && (
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                              {movement.staffName}
                            </span>
                          )}
                          {movement.approvedByName && (
                            <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                              Approved by {movement.approvedByName}
                            </span>
                          )}
                          {(movement.receiptAttachmentName || movement.receiptAttachmentUrl) && (
                            <span className="rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">
                              Receipt attached
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-black ${movement.direction === 'in' ? 'text-emerald-600' : movement.direction === 'out' ? 'text-rose-600' : 'text-slate-500'}`}>
                          {movement.direction === 'in' ? '+' : movement.direction === 'out' ? '-' : ''}R{movement.amount.toFixed(2)}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-slate-400">{movement.createdAt ? new Date(movement.createdAt).toLocaleTimeString() : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 p-4 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                <div>
                  <h4 className="font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <ArrowLeftRight className="w-5 h-5 text-primary" />
                    Cash custody handover
                  </h4>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Request register, staff, safe, or manager-float transfers with counted cash and second-person confirmation.</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pending</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white">{pendingCustodyTransfers.length}</p>
                </div>
              </div>

              {transferMessage && (
                <div className={`rounded-xl border p-3 text-sm font-bold ${
                  transferMessage.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}>{transferMessage.text}</div>
              )}

              <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">From</label>
                      <select
                        value={transferFromType}
                        onChange={e => setTransferFromType(e.target.value as CashCustodyTransferPartyType)}
                        className="w-full h-12 px-3 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-bold"
                      >
                        {CUSTODY_PARTY_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">To</label>
                      <select
                        value={transferToType}
                        onChange={e => setTransferToType(e.target.value as CashCustodyTransferPartyType)}
                        className="w-full h-12 px-3 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-bold"
                      >
                        {CUSTODY_PARTY_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {(transferFromType === 'register' || transferToType === 'register') && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Register</label>
                      <select
                        value={transferCashSessionId}
                        onChange={e => setTransferCashSessionId(e.target.value)}
                        className="w-full h-12 px-3 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-bold"
                      >
                        <option value="">Choose open register</option>
                        {openRegisterSessions.map(session => (
                          <option key={session.id} value={session.id}>{session.staffName} - R{toNumber((session as any).expectedCash).toFixed(2)} expected</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(transferFromType === 'staff' || transferToType === 'staff') && (
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Staff member</label>
                      <input
                        value={transferCounterpartyName}
                        onChange={e => setTransferCounterpartyName(e.target.value)}
                        placeholder="Name on handover"
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-bold"
                      />
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-[130px_1fr]">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Expected</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={transferExpectedAmount}
                        onChange={e => setTransferExpectedAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-black"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Handover note</label>
                      <input
                        value={transferNote}
                        onChange={e => setTransferNote(e.target.value)}
                        placeholder="e.g. Float top-up for register 2"
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-bold"
                      />
                    </div>
                  </div>

                  <DenominationCounter breakdown={transferCountedBreakdown} setBreakdown={setTransferCountedBreakdown} total={transferCountedAmount} />

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ['Expected', transferExpectedNumber],
                      ['Counted', transferCountedAmount],
                      ['Variance', transferVariancePreview],
                    ].map(([label, value]) => (
                      <div key={label as string} className="rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                        <p className={`mt-1 text-sm font-black ${label === 'Variance' && Number(value) !== 0 ? 'text-orange-600' : 'text-slate-900 dark:text-white'}`}>R{Number(value || 0).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={requestCustodyTransfer}
                    className="w-full h-12 rounded-xl bg-primary text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
                    Request handover
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black uppercase tracking-widest text-slate-500">Pending handovers</div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto custom-scrollbar">
                    {pendingCustodyTransfers.length === 0 ? (
                      <div className="p-6 text-sm font-bold text-slate-500">No cash handovers waiting for confirmation.</div>
                    ) : pendingCustodyTransfers.map(transfer => {
                      const needsSecondPerson = transfer.requestedBy && transfer.requestedBy === currentUserStaff?.id && currentUserStaff?.role === 'manager';
                      return (
                        <div key={transfer.id} className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-slate-900 dark:text-white">{transfer.fromName || transfer.fromType} to {transfer.toName || transfer.toType}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">{transfer.note || 'Cash custody handover'}</p>
                              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Requested by {transfer.requestedByName || 'manager'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-slate-900 dark:text-white">R{transfer.expectedAmount.toFixed(2)}</p>
                              <p className={`mt-1 text-[10px] font-black uppercase tracking-widest ${transfer.variance === 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                                Variance R{transfer.variance.toFixed(2)}
                              </p>
                            </div>
                          </div>
                          {needsSecondPerson && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                              A second manager or admin must confirm this handover.
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={isProcessing || Boolean(needsSecondPerson)}
                              onClick={() => decideCustodyTransfer(transfer, 'confirm')}
                              className="h-11 rounded-xl bg-emerald-500 text-white font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Confirm
                            </button>
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => decideCustodyTransfer(transfer, 'cancel')}
                              className="h-11 rounded-xl bg-rose-500 text-white font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              <XCircle className="w-4 h-4" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {workflowSection === 'custody' && canManageCash && !managerCash && (
          <div className="bg-white dark:bg-slate-900 p-6 lg:p-8 rounded-3xl border border-slate-100 dark:border-slate-800/60 shadow-sm">
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-black">Manager cash is unavailable</h3>
                <p className="mt-1 text-sm font-semibold">Refresh once the cash ledger connection is back.</p>
              </div>
            </div>
          </div>
        )}

        {workflowSection === 'endOfDay' && (
        <div className="z-report-screen bg-white dark:bg-slate-900 p-6 lg:p-8 rounded-3xl border border-slate-100 dark:border-slate-800/60 shadow-sm space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">End-of-day close</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">Use this checklist before printing the Z report.</p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="h-12 px-5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Printer className="w-4 h-4" />
              Print Z Report
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {zChecklist.map(item => (
              <div key={item.label} className={`rounded-2xl border p-4 ${item.ok ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/10' : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10'}`}>
                <div className="flex items-start gap-3">
                  {item.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
                  <div>
                    <p className={`text-sm font-black ${item.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>{item.label}</p>
                    <p className={`mt-1 text-xs font-semibold ${item.ok ? 'text-emerald-700/80 dark:text-emerald-300/70' : 'text-amber-700/80 dark:text-amber-300/70'}`}>{item.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <PrinterReadinessPanel tenantId={tenantId} readiness={printerReadiness} />

          {canManageCash && cashClosePreview && (
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 p-4 lg:p-5 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                <div>
                  <h4 className="font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    Cash close checkpoint
                  </h4>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Count total physical cash and save the end-of-day cash position for owner/accountant review.</p>
                </div>
                <div className="rounded-xl bg-slate-950 text-white px-4 py-3 min-w-[210px]">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Expected physical cash</p>
                  <p className="mt-1 text-2xl font-black">R{cashClosePreview.expectedPhysicalCash.toFixed(2)}</p>
                </div>
              </div>

              {cashCloseMessage && (
                <div className={`rounded-xl border p-3 text-sm font-bold ${
                  cashCloseMessage.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}>{cashCloseMessage.text}</div>
              )}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Manager float', cashClosePreview.managerFloat],
                  ['Open registers', cashClosePreview.openRegisterCash],
                  ['Pending cash-ups', cashClosePreview.pendingCashUpCash],
                  ['Wallet liability', cashClosePreview.walletLiability],
                  ['Petty cash today', cashClosePreview.pettyCashToday],
                  ['Wallet cash in', cashClosePreview.walletCashInToday],
                  ['Wallet cash out', cashClosePreview.walletCashOutToday],
                  ['Handover variance', cashClosePreview.custodyVarianceToday],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">R{Number(value || 0).toFixed(2)}</p>
                  </div>
                ))}
              </div>

              {cashClosePreview.unresolvedItems.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/10 p-4">
                  <p className="text-sm font-black text-amber-800 dark:text-amber-300">Unresolved before close</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {cashClosePreview.unresolvedItems.slice(0, 6).map(item => (
                      <div key={`${item.type}-${item.id}`} className="rounded-xl bg-white/70 dark:bg-slate-950/40 border border-amber-100 dark:border-amber-900/30 p-3">
                        <p className="text-xs font-black text-amber-900 dark:text-amber-200">{item.label}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-amber-700/70 dark:text-amber-300/70">
                          {item.amount !== undefined ? `Amount R${Number(item.amount).toFixed(2)}` : item.type.replace(/_/g, ' ')}
                          {item.variance !== undefined ? ` - Variance R${Number(item.variance).toFixed(2)}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-4">
                  <DenominationCounter breakdown={cashCloseBreakdown} setBreakdown={setCashCloseBreakdown} total={cashCloseCountedAmount} />
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ['Expected', cashCloseExpectedAmount],
                      ['Counted', cashCloseCountedAmount],
                      ['Variance', cashCloseVariancePreview],
                    ].map(([label, value]) => (
                      <div key={label as string} className="rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                        <p className={`mt-1 text-sm font-black ${label === 'Variance' && Number(value) !== 0 ? 'text-orange-600' : 'text-slate-900 dark:text-white'}`}>R{Number(value || 0).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                  <textarea
                    value={cashCloseNote}
                    onChange={e => setCashCloseNote(e.target.value)}
                    rows={3}
                    placeholder="Manager note for variance, unresolved handovers, or final close."
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-semibold"
                  />
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={createEndOfDayCheckpoint}
                    className="w-full h-12 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Save EOD checkpoint
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black uppercase tracking-widest text-slate-500">Recent cash close records</div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[520px] overflow-y-auto custom-scrollbar">
                    {cashCloseHistory.length === 0 ? (
                      <div className="p-6 text-sm font-bold text-slate-500">No EOD cash checkpoints saved yet.</div>
                    ) : cashCloseHistory.map(close => (
                      <div key={close.id} className="p-4 flex items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black text-slate-900 dark:text-white">{close.businessDate}</p>
                            <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${close.status === 'balanced' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {close.status === 'balanced' ? 'Balanced' : 'Review needed'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Expected R{close.expectedPhysicalCash.toFixed(2)} - Counted R{close.countedPhysicalCash.toFixed(2)}
                          </p>
                          {close.closedByName && <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Closed by {close.closedByName}</p>}
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-black ${close.variance === 0 ? 'text-emerald-600' : 'text-orange-600'}`}>R{close.variance.toFixed(2)}</p>
                          <button
                            type="button"
                            onClick={() => downloadCashCloseCsv(close)}
                            className="mt-2 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" />
                            CSV
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gross sales</p>
              <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">R{zReport.grossSales.toFixed(2)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{zReport.completedSales.length} completed sale{zReport.completedSales.length === 1 ? '' : 's'}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Refunds</p>
              <p className="mt-2 text-2xl font-black text-rose-700 dark:text-rose-300">R{zReport.refunds.toFixed(2)}</p>
              <p className="mt-1 text-xs font-semibold text-rose-600/80">{zReport.refundSales.length} refund transaction{zReport.refundSales.length === 1 ? '' : 's'}</p>
            </div>
            <div className="rounded-2xl bg-primary/10 border border-primary/20 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Net sales</p>
              <p className="mt-2 text-2xl font-black text-primary">R{zReport.netSales.toFixed(2)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Gross less refunds</p>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Voids</p>
              <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{zReport.voidSales.length}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Cancelled before payment</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black uppercase tracking-widest text-slate-500">Payment totals</div>
              <div className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-slate-800">
                {[
                  ['Cash', zReport.paymentTotals.cash],
                  ['Card', zReport.paymentTotals.card],
                  ['Wallet', zReport.paymentTotals.wallet],
                  ['PayFast', zReport.paymentTotals.payfast],
                ].map(([label, value]) => (
                  <div key={label as string} className="bg-white dark:bg-slate-900 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-1 text-lg font-black">R{Number(value).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black uppercase tracking-widest text-slate-500">Drawer activity</div>
              <div className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-slate-800">
                {[
                  ['Safe drops', zReport.safeDrops],
                  ['Cash added', zReport.cashAdded],
                  ['Petty cash', zReport.pettyCash],
                  ['No-sale opens', zReport.noSaleOpens],
                ].map(([label, value]) => (
                  <div key={label as string} className="bg-white dark:bg-slate-900 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-1 text-lg font-black">{typeof value === 'number' && label !== 'No-sale opens' ? `R${Number(value).toFixed(2)}` : value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        )}

        <div className="z-report-print-only hidden text-black bg-white p-8 font-sans">
          <h1 className="text-2xl font-black">Z Report</h1>
          <p className="mt-1 text-sm">Printed {new Date().toLocaleString()}</p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div>Gross sales: R{zReport.grossSales.toFixed(2)}</div>
            <div>Refunds: R{zReport.refunds.toFixed(2)}</div>
            <div>Net sales: R{zReport.netSales.toFixed(2)}</div>
            <div>Voids: {zReport.voidSales.length}</div>
            <div>Cash: R{zReport.paymentTotals.cash.toFixed(2)}</div>
            <div>Card: R{zReport.paymentTotals.card.toFixed(2)}</div>
            <div>Wallet: R{zReport.paymentTotals.wallet.toFixed(2)}</div>
            <div>PayFast: R{zReport.paymentTotals.payfast.toFixed(2)}</div>
            <div>Safe drops: R{zReport.safeDrops.toFixed(2)}</div>
            <div>Cash added: R{zReport.cashAdded.toFixed(2)}</div>
            <div>Petty cash: R{zReport.pettyCash.toFixed(2)}</div>
            <div>No-sale opens: {zReport.noSaleOpens}</div>
          </div>
          <div className="mt-6 border-t border-black pt-4 text-sm">
            {zChecklist.map(item => (
              <div key={item.label}>{item.ok ? 'OK' : 'ACTION'} - {item.label}: {item.detail}</div>
            ))}
          </div>
        </div>

        {(workflowSection === 'register' || workflowSection === 'review') && (
        <div className={`bg-white dark:bg-slate-900 p-6 lg:p-8 rounded-3xl border border-slate-100 dark:border-slate-800/60 shadow-sm ${
          workflowSection === 'review' ? 'space-y-8' : 'flex flex-col md:flex-row gap-8 lg:gap-12'
        }`}>
          {workflowSection === 'register' && (
          <div className="flex-1 max-w-sm shrink-0">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><DollarSign className="w-6 h-6 text-emerald-500"/> Current shift</h3>
            
            {!activeSession ? (
              <form onSubmit={openRegister} className="space-y-6">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                  <div className="flex gap-3 text-blue-800 dark:text-blue-300">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm font-medium">Count your starting float before processing cash sales.</p>
                  </div>
                </div>

                <DenominationCounter breakdown={openingBreakdown} setBreakdown={setOpeningBreakdown} total={newFloat} />

                <button type="submit" disabled={isProcessing} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-sm rounded-xl shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Unlock className="w-5 h-5"/>} Open Register
                </button>
              </form>
            ) : (
              <form onSubmit={closeRegister} className="space-y-6">
                <div className={`grid ${toNumber((activeSession as any).accumulatedTips) > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Starting Float</p>
                    <p className="text-xl font-black">R{toNumber((activeSession as any).openingFloat).toFixed(2)}</p>
                  </div>
                  <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Expected Cash</p>
                    <p className="text-xl font-black text-primary">R{toNumber((activeSession as any).expectedCash).toFixed(2)}</p>
                  </div>
                  {(toNumber((activeSession as any).accumulatedTips) > 0) && (
                    <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                      <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Tips</p>
                      <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">R{toNumber((activeSession as any).accumulatedTips).toFixed(2)}</p>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-4 space-y-4">
                  <div>
                    <h4 className="font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <HandCoins className="w-5 h-5 text-primary" />
                      Drawer movements
                    </h4>
                    <p className="mt-1 text-xs font-semibold text-slate-500">Record safe drops, cash added, or petty cash before cash-up. Manager approval is required.</p>
                  </div>

                  {movementError && (
                    <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm font-bold text-rose-700">
                      {movementError}
                    </div>
                  )}

                  <div className="grid gap-2">
                    {MOVEMENT_TYPES.map(type => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setMovementType(type.id as typeof movementType)}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          movementType === type.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <span className="block text-xs font-black uppercase tracking-widest">{type.label}</span>
                        <span className="mt-1 block text-xs font-semibold text-slate-500">{type.helper}</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Amount</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={movementAmount}
                        onChange={e => setMovementAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full h-12 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-black"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Reason</label>
                      <input
                        value={movementNote}
                        onChange={e => setMovementNote(e.target.value)}
                        placeholder="e.g. Safe drop bag #12, bought milk"
                        className="w-full h-12 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary text-sm font-bold"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isProcessing || !canManageCash}
                    onClick={recordDrawerMovement}
                    className="w-full h-12 rounded-xl bg-primary text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <HandCoins className="w-4 h-4" />}
                    {canManageCash ? 'Record movement' : 'Manager approval required'}
                  </button>
                </div>

                <div className="pt-2">
                   <div className="flex items-center gap-2 mb-4 text-slate-700 dark:text-slate-300">
                     <HandCoins className="w-5 h-5"/>
                     <h4 className="font-bold">Count Drawer</h4>
                   </div>
                   <DenominationCounter breakdown={closingBreakdown} setBreakdown={setClosingBreakdown} total={closeAmount} />
                </div>

                <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Notes / Explanations (Optional)</label>
                   <textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} rows={2} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none text-sm"/>
                </div>
                
                <button type="submit" disabled={isProcessing} className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase tracking-widest text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Lock className="w-5 h-5"/>} Submit Cash Up
                </button>
              </form>
            )}
          </div>
          )}
          
          {workflowSection === 'register' && <div className="hidden md:block w-px bg-slate-100 dark:bg-slate-800"></div>}
          
          <div className={workflowSection === 'review' ? 'w-full' : 'flex-1'}>
             {workflowSection === 'review' && canManageCash && (
               <div className="mb-8">
                 <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-primary"/> Management Review</h3>
                 <div className="space-y-4">
                   {pendingReview.slice(0, 6).map(s => {
                     const diff = toNumber((s as any).difference);
                     return (
                       <div key={s.id} className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                         <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                           <div>
                             <div className="flex items-center gap-2 mb-1">
                               <p className="font-black">{s.staffName}</p>
                               <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${reviewBadge(s)}`}>{s.reviewStatus || 'submitted'}</span>
                             </div>
                             <p className="text-xs text-slate-500">Expected R{toNumber((s as any).expectedCash).toFixed(2)} - Counted R{toNumber((s as any).actualCash).toFixed(2)} - Variance R{diff.toFixed(2)}</p>
                             {s.notes && <p className="text-sm mt-2 text-slate-600 dark:text-slate-300">{s.notes}</p>}
                           </div>
                           <div className="flex gap-2">
                             <button type="button" disabled={isProcessing} onClick={() => reviewSession(s, 'reconciled')} className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-50"><CheckCircle2 className="w-4 h-4"/> Reconcile</button>
                             <button type="button" disabled={isProcessing} onClick={() => reviewSession(s, 'disputed')} className="px-3 py-2 bg-red-500 text-white rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-50"><XCircle className="w-4 h-4"/> Dispute</button>
                           </div>
                         </div>
                         <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-4">
                           <input value={varianceReasons[s.id] || ''} onChange={e => setVarianceReasons({ ...varianceReasons, [s.id]: e.target.value })} placeholder="Variance reason" className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none" />
                           <input value={managerNotes[s.id] || ''} onChange={e => setManagerNotes({ ...managerNotes, [s.id]: e.target.value })} placeholder="Manager notes" className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none" />
                         </div>
                       </div>
                     );
                   })}
                   {pendingReview.length === 0 && (
                     <div className="p-5 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-3">
                       <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                       <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">No cash ups waiting for review.</p>
                     </div>
                   )}
                 </div>
               </div>
             )}

             <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Calendar className="w-6 h-6 text-slate-400"/> Recent Sessions</h3>
             <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
                {closedSessions.slice(0, 50).map(s => {
                   const opened = new Date(s.openedAt);
                   const closed = s.closedAt ? new Date(s.closedAt) : new Date();
                   const diff = toNumber((s as any).difference);
                   return (
                     <div key={s.id} className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-start mb-4">
                           <div>
                              <p className="font-bold text-base">{s.staffName}</p>
                              <p className="text-xs text-slate-500">{opened.toLocaleDateString()} {opened.toLocaleTimeString()} - {closed.toLocaleTimeString()}</p>
                           </div>
                           <div className="flex flex-col items-end gap-2">
                             <div className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest ${diff === 0 ? 'bg-emerald-100 text-emerald-700' : diff > 0 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                               {diff === 0 ? 'Balanced' : diff > 0 ? `+ R${diff.toFixed(2)} OVER` : `- R${Math.abs(diff).toFixed(2)} SHORT`}
                             </div>
                             <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${reviewBadge(s)}`}>{s.reviewStatus || 'submitted'}</div>
                           </div>
                        </div>
                        <div className="flex gap-4 text-sm font-medium border-t border-slate-200 dark:border-slate-700/60 pt-4">
                           <div className="flex-1">
                             <span className="text-slate-400 mr-2 text-[10px] uppercase tracking-widest block mb-1">Float</span> 
                             <span className="font-bold">R{toNumber((s as any).openingFloat).toFixed(2)}</span>
                           </div>
                           <div className="flex-1">
                             <span className="text-slate-400 mr-2 text-[10px] uppercase tracking-widest block mb-1">Expected</span> 
                             <span className="font-bold">R{toNumber((s as any).expectedCash).toFixed(2)}</span>
                           </div>
                           <div className="flex-1">
                             <span className="text-slate-400 mr-2 text-[10px] uppercase tracking-widest block mb-1">Actual</span> 
                             <span className="font-bold">R{toNumber((s as any).actualCash).toFixed(2)}</span>
                           </div>
                           <div className="flex-1">
                             <span className="text-emerald-500 mr-2 text-[10px] uppercase tracking-widest block mb-1">Tips</span> 
                             <span className="font-bold text-emerald-600 dark:text-emerald-400">R{toNumber((s as any).netTips).toFixed(2)}</span>
                           </div>
                        </div>
                     </div>
                   );
                })}
                {closedSessions.length === 0 && (
                   <div className="text-center py-12 flex flex-col items-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                     <AlertCircle className="w-8 h-8 text-slate-300 mb-3" />
                     <p className="text-sm text-slate-500 font-medium">No recent closed sessions found.</p>
                   </div>
                )}
             </div>
          </div>
        </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          .z-report-print-only, .z-report-print-only * { visibility: visible; }
          .z-report-print-only {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      ` }} />
    </div>
  );
}
