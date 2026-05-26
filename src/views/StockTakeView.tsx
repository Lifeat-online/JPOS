import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardCheck, Package, Plus, RefreshCw, Search, ShieldCheck, Smartphone, Users, X } from 'lucide-react';
import { Product, Staff } from '../types';
import {
  approveStockTakeSession,
  createStockTakeRule,
  createStockTakeSession,
  deleteStockTakeRule,
  getMyStockTakeAssignments,
  getStockTakeRules,
  getStockTakeSession,
  getStockTakeSessions,
  getTenantStaff,
  requestStockTakeRecount,
  runDueStockTakeRules,
  submitStockTakeCount,
  updateStockTakeRule,
} from '../api';
import { usePosStore } from '../store/usePosStore';
import { getDate } from '../utils/date';

type StockTakeMode = 'cycle' | 'full' | 'spot_check';
type RuleScope = 'random' | 'low_stock' | 'category' | 'manual';

type StockTakeViewProps = {
  products: Product[];
  onProductsUpdated?: () => void;
};

function formatNumber(value: unknown) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value || 0));
  return Number.isFinite(n) ? n.toFixed(3).replace(/\.?0+$/, '') : '0';
}

function formatWhen(value: unknown) {
  if (!value) return 'No due date';
  const date = getDate(value);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return date.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toneForVariance(value: unknown) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value || 0));
  if (!Number.isFinite(n) || n === 0) return 'text-slate-500';
  return n > 0 ? 'text-emerald-600' : 'text-rose-600';
}

export function StockTakeView({ products, onProductsUpdated }: StockTakeViewProps) {
  const tenantId = usePosStore(state => state.tenantId);
  const currentUserStaff = usePosStore(state => state.currentUserStaff);
  const initialMode = useMemo<StockTakeMode>(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    return mode === 'spot_check' ? 'spot_check' : 'cycle';
  }, []);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [reviewSession, setReviewSession] = useState<any | null>(null);
  const [mode, setMode] = useState<StockTakeMode>(initialMode);
  const [sessionName, setSessionName] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [ruleName, setRuleName] = useState('Daily spot check');
  const [ruleRunTime, setRuleRunTime] = useState('08:00');
  const [ruleScope, setRuleScope] = useState<RuleScope>('low_stock');
  const [ruleProductCount, setRuleProductCount] = useState('5');
  const [ruleCategory, setRuleCategory] = useState('');
  const [ruleAssignee, setRuleAssignee] = useState('');
  const [ruleProductIds, setRuleProductIds] = useState<Record<string, boolean>>({});
  const [productSearch, setProductSearch] = useState('');
  const [selectedAssignees, setSelectedAssignees] = useState<Record<string, string>>({});
  const [countInputs, setCountInputs] = useState<Record<string, string>>({});
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [recountNotes, setRecountNotes] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const isManager = ['admin', 'manager', 'dev'].includes(String(currentUserStaff?.role || '').toLowerCase());
  const activeStaff = useMemo(
    () => staff.filter(member => member.status !== 'inactive'),
    [staff]
  );
  const staffById = useMemo(
    () => new Map(activeStaff.map(member => [member.id, member])),
    [activeStaff]
  );
  const selectedProductIds = Object.keys(selectedAssignees);
  const selectedRuleProductIds = Object.entries(ruleProductIds)
    .filter(([, selected]) => selected)
    .map(([productId]) => productId);
  const selectedProducts = useMemo(
    () => selectedProductIds
      .map(productId => products.find(product => product.id === productId))
      .filter(Boolean) as Product[],
    [products, selectedProductIds]
  );
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    return products
      .filter(product => {
        if (!term) return true;
        return product.name.toLowerCase().includes(term) || String(product.barcode || '').toLowerCase().includes(term);
      })
      .slice(0, 40);
  }, [products, productSearch]);
  const productCategories = useMemo(
    () => Array.from(new Set(products.map(product => product.category).filter(Boolean))).sort(),
    [products]
  );

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const staffId = currentUserStaff?.id || null;
      const requests: Promise<any>[] = [
        getMyStockTakeAssignments(tenantId, staffId),
      ];
      if (isManager) {
        requests.push(getStockTakeSessions(tenantId));
        requests.push(getTenantStaff(tenantId));
        requests.push(getStockTakeRules(tenantId));
      }
      const results = await Promise.all(requests);
      setAssignments(results[0] || []);
      if (isManager) {
        setSessions(results[1] || []);
        setStaff(results[2] || []);
        setRules(results[3] || []);
      }
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load stocktake work.' });
    } finally {
      setLoading(false);
    }
  }, [tenantId, currentUserStaff?.id, isManager]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleProduct = (productId: string) => {
    setSelectedAssignees(current => {
      if (current[productId] !== undefined) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      const defaultAssignee = activeStaff.find(member => member.role === 'cashier')?.id || currentUserStaff?.id || '';
      return { ...current, [productId]: defaultAssignee };
    });
  };

  const toggleRuleProduct = (productId: string) => {
    setRuleProductIds(current => ({ ...current, [productId]: !current[productId] }));
  };

  const createSession = async () => {
    if (!tenantId) return;
    if (selectedProducts.length === 0) {
      setMessage({ tone: 'error', text: 'Choose products before starting a stocktake.' });
      return;
    }
    setBusyKey('create');
    setMessage(null);
    try {
      const session = await createStockTakeSession(tenantId, {
        name: sessionName.trim() || null,
        type: mode,
        dueAt: dueAt || null,
        notes: notes.trim() || null,
        staffId: currentUserStaff?.id || null,
        staffName: currentUserStaff?.name || null,
        assignments: selectedProducts.map(product => {
          const assignedTo = selectedAssignees[product.id] || null;
          const member = assignedTo ? staffById.get(assignedTo) : null;
          return {
            productId: product.id,
            assignedTo,
            assignedToName: member?.name || null,
          };
        }),
      });
      setReviewSession(session);
      setSelectedAssignees({});
      setSessionName('');
      setNotes('');
      setMessage({ tone: 'success', text: mode === 'spot_check' ? 'Spot check assigned.' : 'Stocktake assigned.' });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not start stocktake.' });
    } finally {
      setBusyKey(null);
    }
  };

  const createRule = async () => {
    if (!tenantId) return;
    if (ruleScope === 'category' && !ruleCategory) {
      setMessage({ tone: 'error', text: 'Choose a category for the daily rule.' });
      return;
    }
    if (ruleScope === 'manual' && selectedRuleProductIds.length === 0) {
      setMessage({ tone: 'error', text: 'Choose products for the manual daily rule.' });
      return;
    }
    setBusyKey('create-rule');
    try {
      const assignee = ruleAssignee ? staffById.get(ruleAssignee) : null;
      await createStockTakeRule(tenantId, {
        name: ruleName.trim() || 'Daily spot check',
        runTime: ruleRunTime,
        productScope: ruleScope,
        productCount: Number(ruleProductCount) || 5,
        category: ruleScope === 'category' ? ruleCategory : null,
        productIds: ruleScope === 'manual' ? selectedRuleProductIds : [],
        assignedTo: ruleAssignee || null,
        assignedToName: assignee?.name || null,
        staffId: currentUserStaff?.id || null,
        staffName: currentUserStaff?.name || null,
      });
      setRuleName('Daily spot check');
      setRuleProductIds({});
      setMessage({ tone: 'success', text: 'Daily spot-check rule saved.' });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save rule.' });
    } finally {
      setBusyKey(null);
    }
  };

  const runRules = async (ruleId?: string, force = false) => {
    if (!tenantId) return;
    setBusyKey(ruleId ? `run-rule:${ruleId}` : 'run-rules');
    try {
      const result = await runDueStockTakeRules(tenantId, {
        ruleId: ruleId || null,
        force,
        staffId: currentUserStaff?.id || null,
        staffName: currentUserStaff?.name || null,
      });
      const created = result.generated?.length || 0;
      setMessage({
        tone: 'success',
        text: created
          ? `${created} spot-check assignment${created === 1 ? '' : 's'} generated.`
          : 'No spot-check rules were due.',
      });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not run rules.' });
    } finally {
      setBusyKey(null);
    }
  };

  const toggleRuleStatus = async (rule: any) => {
    if (!tenantId) return;
    setBusyKey(`toggle-rule:${rule.id}`);
    try {
      await updateStockTakeRule(tenantId, rule.id, {
        ...rule,
        status: rule.status === 'active' ? 'paused' : 'active',
        staffId: currentUserStaff?.id || null,
        staffName: currentUserStaff?.name || null,
      });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not update rule.' });
    } finally {
      setBusyKey(null);
    }
  };

  const removeRule = async (rule: any) => {
    if (!tenantId) return;
    setBusyKey(`delete-rule:${rule.id}`);
    try {
      await deleteStockTakeRule(tenantId, rule.id);
      setMessage({ tone: 'success', text: 'Daily spot-check rule removed.' });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not delete rule.' });
    } finally {
      setBusyKey(null);
    }
  };

  const submitCount = async (item: any) => {
    if (!tenantId) return;
    const rawValue = countInputs[item.id];
    const countedQuantity = Number(rawValue);
    if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
      setMessage({ tone: 'error', text: 'Enter a valid count.' });
      return;
    }
    setBusyKey(item.id);
    try {
      const session = await submitStockTakeCount(tenantId, item.id, {
        countedQuantity,
        note: noteInputs[item.id]?.trim() || null,
        staffId: currentUserStaff?.id || null,
        staffName: currentUserStaff?.name || null,
      });
      setReviewSession(session);
      setCountInputs(current => ({ ...current, [item.id]: '' }));
      setNoteInputs(current => ({ ...current, [item.id]: '' }));
      setMessage({ tone: 'success', text: 'Count submitted.' });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not submit count.' });
    } finally {
      setBusyKey(null);
    }
  };

  const openSession = async (sessionId: string) => {
    if (!tenantId) return;
    setBusyKey(sessionId);
    try {
      setReviewSession(await getStockTakeSession(tenantId, sessionId));
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not open session.' });
    } finally {
      setBusyKey(null);
    }
  };

  const approveSession = async (session: any) => {
    if (!tenantId) return;
    setBusyKey(`approve:${session.id}`);
    try {
      const result = await approveStockTakeSession(tenantId, session.id, {
        staffId: currentUserStaff?.id || null,
        staffName: currentUserStaff?.name || null,
      });
      setReviewSession(result);
      setMessage({ tone: 'success', text: `Approved. ${result.applied?.length || 0} stock movement${result.applied?.length === 1 ? '' : 's'} posted.` });
      onProductsUpdated?.();
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not approve stocktake.' });
    } finally {
      setBusyKey(null);
    }
  };

  const requestRecount = async (item: any) => {
    if (!tenantId) return;
    setBusyKey(`recount:${item.id}`);
    try {
      const session = await requestStockTakeRecount(tenantId, item.id, {
        note: recountNotes[item.id]?.trim() || 'Recount requested',
        staffId: currentUserStaff?.id || null,
        staffName: currentUserStaff?.name || null,
      });
      setReviewSession(session);
      setMessage({ tone: 'success', text: 'Recount requested.' });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not request recount.' });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Stocktake</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">Assigned counts</span>
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">Manager approval</span>
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">Stock ledger</span>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-primary disabled:opacity-60 dark:bg-white dark:text-slate-950"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {message && (
        <div className={`flex items-start justify-between gap-4 rounded-2xl border px-5 py-4 text-sm font-bold ${
          message.tone === 'success'
            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
            : 'border-rose-100 bg-rose-50 text-rose-700'
        }`}>
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="rounded-lg p-1 hover:bg-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 dark:text-white">My count assignments</h3>
              <p className="text-xs font-bold text-slate-400">{assignments.length} open</p>
            </div>
          </div>
        </div>

        {assignments.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-bold text-slate-400 dark:border-slate-700">
            No assigned counts.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {assignments.map(item => (
              <div key={item.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-900 dark:text-white">{item.productName}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {item.sessionType === 'spot_check' ? 'Spot check' : item.sessionName} - {formatWhen(item.dueAt)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                    item.status === 'recount'
                      ? 'bg-amber-100 text-amber-700'
                      : item.status === 'counted'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-blue-100 text-blue-700'
                  }`}>
                    {item.status}
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={countInputs[item.id] ?? ''}
                    onChange={event => setCountInputs(current => ({ ...current, [item.id]: event.target.value }))}
                    placeholder="Counted quantity"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-black text-slate-900 outline-none transition focus:border-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  />
                  <input
                    type="text"
                    value={noteInputs[item.id] ?? ''}
                    onChange={event => setNoteInputs(current => ({ ...current, [item.id]: event.target.value }))}
                    placeholder="Note"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-primary dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => submitCount(item)}
                    disabled={busyKey === item.id}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-white transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    Submit Count
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isManager && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white">Assign stocktake</h3>
                  <p className="text-xs font-bold text-slate-400">{selectedProducts.length} selected</p>
                </div>
              </div>
              <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-200 p-1 text-xs font-black dark:border-slate-800">
                {(['cycle', 'full', 'spot_check'] as StockTakeMode[]).map(option => (
                  <button
                    type="button"
                    key={option}
                    onClick={() => setMode(option)}
                    className={`rounded-xl px-3 py-2 uppercase tracking-widest transition ${
                      mode === option ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    {option === 'spot_check' ? 'Spot' : option}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <input
                value={sessionName}
                onChange={event => setSessionName(event.target.value)}
                placeholder={mode === 'spot_check' ? 'Spot check name' : 'Stocktake name'}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              />
              <div className="relative">
                <CalendarDays className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={event => setDueAt(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-bold outline-none focus:border-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <input
                value={notes}
                onChange={event => setNotes(event.target.value)}
                placeholder="Manager note"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white md:col-span-2"
              />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
              <div>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={productSearch}
                    onChange={event => setProductSearch(event.target.value)}
                    placeholder="Search products or barcode"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-bold outline-none focus:border-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div className="mt-3 max-h-[360px] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  {filteredProducts.map(product => {
                    const selected = selectedAssignees[product.id] !== undefined;
                    return (
                      <button
                        type="button"
                        key={product.id}
                        onClick={() => toggleProduct(product.id)}
                        className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 dark:border-slate-800 ${
                          selected ? 'bg-primary/5' : 'hover:bg-slate-50 dark:hover:bg-slate-950'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-slate-900 dark:text-white">{product.name}</span>
                          <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Stock {formatNumber(product.stock)} {product.barcode ? `- ${product.barcode}` : ''}
                          </span>
                        </span>
                        <span className={`grid h-7 w-7 place-items-center rounded-full border ${
                          selected ? 'border-primary bg-primary text-white' : 'border-slate-200 text-slate-300'
                        }`}>
                          {selected ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Selected products</h4>
                <div className="mt-3 max-h-[320px] space-y-3 overflow-y-auto">
                  {selectedProducts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-bold text-slate-400 dark:border-slate-700">
                      No products selected.
                    </div>
                  ) : selectedProducts.map(product => (
                    <div key={product.id} className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-black text-slate-900 dark:text-white">{product.name}</p>
                        <button type="button" onClick={() => toggleProduct(product.id)} className="text-slate-400 hover:text-rose-500">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <select
                        value={selectedAssignees[product.id] || ''}
                        onChange={event => setSelectedAssignees(current => ({ ...current, [product.id]: event.target.value }))}
                        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 outline-none focus:border-primary dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="">Unassigned</option>
                        {activeStaff.map(member => (
                          <option key={member.id} value={member.id}>{member.name} - {member.role}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={createSession}
                  disabled={busyKey === 'create' || selectedProducts.length === 0}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-white transition hover:bg-primary/90 disabled:opacity-60"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  {mode === 'spot_check' ? 'Start Spot Check' : 'Assign Stocktake'}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white">Manager review</h3>
                  <p className="text-xs font-bold text-slate-400">{sessions.length} recent sessions</p>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-bold text-slate-400 dark:border-slate-700">
                  No stocktakes yet.
                </div>
              ) : sessions.map(session => {
                const progress = session.itemCount ? Math.round((session.countedCount / session.itemCount) * 100) : 0;
                return (
                  <div key={session.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-900 dark:text-white">{session.name}</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {session.type === 'spot_check' ? 'Spot check' : session.type} - {session.status} - {formatWhen(session.dueAt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {progress}%
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, progress)}%` }} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                      <span>{session.countedCount || 0}/{session.itemCount || 0} counted</span>
                      <span>{session.varianceCount || 0} variance</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openSession(session.id)}
                        disabled={busyKey === session.id}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <Package className="h-4 w-4" />
                        Review
                      </button>
                      {['active', 'submitted'].includes(session.status) && (
                        <button
                          type="button"
                          onClick={() => approveSession(session)}
                          disabled={busyKey === `approve:${session.id}`}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {isManager && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 dark:text-white">Daily spot-check rules</h3>
                <p className="text-xs font-bold text-slate-400">{rules.length} rule{rules.length === 1 ? '' : 's'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => runRules()}
              disabled={busyKey === 'run-rules'}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${busyKey === 'run-rules' ? 'animate-spin' : ''}`} />
              Run Due Rules
            </button>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={ruleName}
                  onChange={event => setRuleName(event.target.value)}
                  placeholder="Rule name"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white sm:col-span-2"
                />
                <label>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Daily time</span>
                  <input
                    type="time"
                    value={ruleRunTime}
                    onChange={event => setRuleRunTime(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  />
                </label>
                <label>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Assign to</span>
                  <select
                    value={ruleAssignee}
                    onChange={event => setRuleAssignee(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="">Unassigned</option>
                    {activeStaff.map(member => (
                      <option key={member.id} value={member.id}>{member.name} - {member.role}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Scope</span>
                  <select
                    value={ruleScope}
                    onChange={event => setRuleScope(event.target.value as RuleScope)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="low_stock">Low stock</option>
                    <option value="random">Random products</option>
                    <option value="category">Category</option>
                    <option value="manual">Manual list</option>
                  </select>
                </label>
                <label>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Product count</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={ruleProductCount}
                    onChange={event => setRuleProductCount(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  />
                </label>
                {ruleScope === 'category' && (
                  <label className="sm:col-span-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Category</span>
                    <select
                      value={ruleCategory}
                      onChange={event => setRuleCategory(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    >
                      <option value="">Choose category</option>
                      {productCategories.map(categoryName => (
                        <option key={categoryName} value={categoryName}>{categoryName}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {ruleScope === 'manual' && (
                <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <div className="border-b border-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-400 dark:border-slate-800">
                    Manual products - {selectedRuleProductIds.length} selected
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {filteredProducts.map(product => (
                      <button
                        type="button"
                        key={product.id}
                        onClick={() => toggleRuleProduct(product.id)}
                        className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 dark:border-slate-800 ${
                          ruleProductIds[product.id] ? 'bg-indigo-50 dark:bg-indigo-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-950'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-slate-900 dark:text-white">{product.name}</span>
                          <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Stock {formatNumber(product.stock)}</span>
                        </span>
                        <span className={`grid h-7 w-7 place-items-center rounded-full border ${
                          ruleProductIds[product.id] ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-300'
                        }`}>
                          {ruleProductIds[product.id] ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={createRule}
                disabled={busyKey === 'create-rule'}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-primary disabled:opacity-60 dark:bg-white dark:text-slate-950"
              >
                <CalendarDays className="h-4 w-4" />
                Save Daily Rule
              </button>
            </div>

            <div className="space-y-3">
              {rules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-bold text-slate-400 dark:border-slate-700">
                  No daily rules yet.
                </div>
              ) : rules.map(rule => (
                <div key={rule.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-slate-900 dark:text-white">{rule.name}</p>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                          rule.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {rule.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Daily {rule.runTime} - {String(rule.productScope || '').replace('_', ' ')} - {rule.productCount} item{rule.productCount === 1 ? '' : 's'}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        Assigned to {rule.assignedToName || 'manager review'} - Last run {rule.lastRunForDate || 'never'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => runRules(rule.id, true)}
                        disabled={busyKey === `run-rule:${rule.id}`}
                        className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        Run Now
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleRuleStatus(rule)}
                        disabled={busyKey === `toggle-rule:${rule.id}`}
                        className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200"
                      >
                        {rule.status === 'active' ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRule(rule)}
                        disabled={busyKey === `delete-rule:${rule.id}`}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {isManager && reviewSession && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="font-black text-slate-900 dark:text-white">{reviewSession.name}</h3>
              <p className="mt-1 text-xs font-bold text-slate-400">
                {reviewSession.status} - {reviewSession.countedCount || 0}/{reviewSession.itemCount || 0} counted
              </p>
            </div>
            {['active', 'submitted'].includes(reviewSession.status) && (
              <button
                type="button"
                onClick={() => approveSession(reviewSession)}
                disabled={busyKey === `approve:${reviewSession.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" />
                Approve Session
              </button>
            )}
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Assigned</th>
                  <th className="px-4 py-3 text-right">Expected</th>
                  <th className="px-4 py-3 text-right">Counted</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(reviewSession.items || []).map((item: any) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-black text-slate-900 dark:text-white">{item.productName}</td>
                    <td className="px-4 py-3 font-bold text-slate-500">{item.assignedToName || item.assignedTo || 'Unassigned'}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-500">{formatNumber(item.expectedQuantity)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">{item.countedQuantity === null ? '-' : formatNumber(item.countedQuantity)}</td>
                    <td className={`px-4 py-3 text-right font-black ${toneForVariance(item.varianceQuantity)}`}>
                      {item.varianceQuantity === null ? '-' : formatNumber(item.varianceQuantity)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {['counted', 'confirmed'].includes(item.status) ? (
                        <div className="flex min-w-[220px] gap-2">
                          <input
                            value={recountNotes[item.id] ?? ''}
                            onChange={event => setRecountNotes(current => ({ ...current, [item.id]: event.target.value }))}
                            placeholder="Recount note"
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold outline-none focus:border-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => requestRecount(item)}
                            disabled={busyKey === `recount:${item.id}`}
                            className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-200 disabled:opacity-60"
                          >
                            Recount
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
