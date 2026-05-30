import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Ban, Banknote, Boxes, CalendarDays, CheckCircle2, ClipboardCheck, ClipboardList, Download, ExternalLink, Filter, History, Monitor, Package, PlayCircle, RefreshCw, Search, ShieldCheck, Smartphone, Sparkles, UserRound, Users, WifiOff, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { decideManagerTask, exportManagerActivityHistoryCsv, exportManagerAuditReport, getManagerActionCenter, getManagerActivityHistory, getManagerTasks } from '../api';
import { getDate } from '../utils/date';

type ActionCenterData = {
  urgentCount: number;
  counts: {
    auditEvents: number;
    stockMovements: number;
    lowStock: number;
    cashExceptions: number;
    saleExceptions: number;
    aiWarnings: number;
    stockTakeExceptions: number;
    offlineSyncIssues: number;
  };
  auditEvents: any[];
  stockMovements: any[];
  lowStock: any[];
  cashExceptions: any[];
  saleExceptions: any[];
  aiInsights: any[];
  stockTakeExceptions: any[];
  offlineSyncIssues: any[];
  generatedAt: string;
};

type ManagerTask = {
  id: string;
  taskType: string;
  title: string;
  summary?: string | null;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'open' | 'in_review' | 'approved' | 'declined' | 'done' | 'dismissed';
  sourceType?: string | null;
  sourceId?: string | null;
  details?: Record<string, any>;
  updatedAt?: string;
};

type ManagerTaskQueue = {
  tasks: ManagerTask[];
  counts: {
    open: number;
    inReview: number;
    critical: number;
    high: number;
    total: number;
  };
};

type ActivityFilters = {
  type: 'all' | 'audit' | 'stock';
  search: string;
  staff: string;
  productId: string;
  saleId: string;
  customerId: string;
  registerId: string;
  deviceId: string;
  source: string;
  action: string;
  from: string;
  to: string;
};

type ActivityHistoryData = {
  counts: {
    auditEvents: number;
    stockMovements: number;
    total: number;
  };
  items: any[];
  generatedAt: string;
};

type AuditReportAudience = 'owner' | 'accountant' | 'compliance';

const countCards = [
  { key: 'cashExceptions', label: 'Cash', icon: Banknote, path: '/cash', tone: 'amber' },
  { key: 'saleExceptions', label: 'Refunds / Voids', icon: History, path: '/history', tone: 'rose' },
  { key: 'lowStock', label: 'Low Stock', icon: Package, path: '/inventory', tone: 'blue' },
  { key: 'aiWarnings', label: 'AI Warnings', icon: Sparkles, path: '/ai', tone: 'indigo' },
  { key: 'stockTakeExceptions', label: 'Stocktakes', icon: ClipboardList, path: '/stocktake', tone: 'emerald' },
  { key: 'offlineSyncIssues', label: 'Sync Issues', icon: WifiOff, path: '/actions', tone: 'slate' },
] as const;

const toneClass: Record<string, string> = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50',
  rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/50',
  blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/50',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900/50',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50',
  slate: 'bg-white text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800',
};

const priorityClass: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  high: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function money(value: unknown) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value || 0));
  return `R${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

function number(value: unknown) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value || 0));
  return Number.isFinite(n) ? n : 0;
}

function when(value: unknown) {
  if (!value) return 'No time';
  const d = getDate(value);
  if (Number.isNaN(d.getTime())) return 'No time';
  return d.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function offlineConflictLabel(type?: string | null) {
  const labels: Record<string, string> = {
    negative_stock_after_sync: 'Stock shortage',
    duplicate_local_receipt: 'Duplicate receipt',
    duplicate_table_or_tab: 'Table / tab conflict',
    duplicate_customer_order: 'Customer order conflict',
    sync_failure: 'Sync failure',
  };
  return type ? labels[type] || type.replace(/_/g, ' ') : null;
}

function stockReasonLabel(code?: string | null) {
  const labels: Record<string, string> = {
    receiving: 'Receiving',
    sale: 'Sale',
    refund: 'Refund',
    void: 'Void',
    adjustment: 'Adjustment',
    count_correction: 'Count correction',
    transfer: 'Transfer',
    wastage: 'Wastage',
    shrinkage: 'Shrinkage',
  };
  return code ? labels[code] || code.replace(/_/g, ' ') : null;
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{title}</h3>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyLine({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-5 text-center text-sm font-bold text-slate-400">
      {label}
    </div>
  );
}

function taskDestination(task: ManagerTask) {
  if (task.sourceType === 'approval_request' && (task.taskType === 'refund_request' || task.taskType === 'void_request')) return '/history';
  if (task.sourceType === 'approval_request' && task.taskType === 'stock_adjustment_request') return '/inventory';
  if (task.sourceType === 'cash_session') return '/cash';
  if (task.sourceType === 'sale') return '/history';
  if (task.sourceType === 'product') return '/inventory';
  if (task.sourceType === 'ai_insight') return '/ai';
  if (task.sourceType === 'stock_take_session') return '/stocktake';
  if (task.taskType === 'offline_sync' || task.sourceType === 'audit_event') return '/actions';
  return '/actions';
}

function activityDestination(item: any) {
  if (item.saleId) return '/history';
  if (item.productId) return '/inventory';
  return '/actions';
}

const defaultActivityFilters: ActivityFilters = {
  type: 'all',
  search: '',
  staff: '',
  productId: '',
  saleId: '',
  customerId: '',
  registerId: '',
  deviceId: '',
  source: '',
  action: '',
  from: '',
  to: '',
};

export function ManagerActionCenterView({ tenantId }: { tenantId: string | null }) {
  const navigate = useNavigate();
  const [data, setData] = useState<ActionCenterData | null>(null);
  const [taskQueue, setTaskQueue] = useState<ManagerTaskQueue | null>(null);
  const [activity, setActivity] = useState<ActivityHistoryData | null>(null);
  const [activityFilters, setActivityFilters] = useState<ActivityFilters>(defaultActivityFilters);
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
  const [actingTaskId, setActingTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityExporting, setActivityExporting] = useState(false);
  const [activityReportAudience, setActivityReportAudience] = useState<AuditReportAudience>('owner');
  const [activityReportExporting, setActivityReportExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [center, queue, history] = await Promise.all([
        getManagerActionCenter(tenantId),
        getManagerTasks(tenantId),
        getManagerActivityHistory(tenantId, { ...activityFilters, limit: 50 }),
      ]);
      setData(center);
      setTaskQueue(queue);
      setActivity(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async (filters = activityFilters) => {
    if (!tenantId) return;
    setActivityLoading(true);
    setError(null);
    try {
      setActivity(await getManagerActivityHistory(tenantId, { ...filters, limit: 50 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActivityLoading(false);
    }
  };

  const updateActivityFilter = (key: keyof ActivityFilters, value: string) => {
    setActivityFilters(current => ({ ...current, [key]: value }));
  };

  const exportActivity = async () => {
    if (!tenantId) return;
    setActivityExporting(true);
    setError(null);
    try {
      const result = await exportManagerActivityHistoryCsv(tenantId, { ...activityFilters, limit: 200 });
      const blob = new Blob([result.csv], { type: result.mimeType || 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || 'masepos-activity.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActivityExporting(false);
    }
  };

  const exportAuditReport = async () => {
    if (!tenantId) return;
    setActivityReportExporting(true);
    setError(null);
    try {
      const result = await exportManagerAuditReport(tenantId, {
        ...activityFilters,
        audience: activityReportAudience,
        limit: 500,
      });
      const blob = new Blob([result.csv], { type: result.mimeType || 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || `masepos-${activityReportAudience}-audit-report.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActivityReportExporting(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tenantId]);

  const recentAudit = useMemo(() => data?.auditEvents.slice(0, 6) || [], [data]);
  const recentStock = useMemo(() => data?.stockMovements.slice(0, 6) || [], [data]);
  const managerTasks = taskQueue?.tasks || [];
  const activityItems = activity?.items || [];
  const activeTaskCount = taskQueue?.counts?.total ?? data?.urgentCount ?? 0;

  const runTaskAction = async (task: ManagerTask, action: 'start' | 'approve' | 'decline' | 'dismiss') => {
    if (!tenantId) return;
    const note = (taskNotes[task.id] || '').trim();
    if ((action === 'approve' || action === 'decline') && !note) {
      setError('Add a manager note before approving or declining a task.');
      return;
    }
    setActingTaskId(task.id);
    setError(null);
    try {
      await decideManagerTask(tenantId, task.id, { action, note });
      setTaskNotes(current => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActingTaskId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0B1120] p-4 lg:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              <ClipboardCheck className="h-8 w-8 text-indigo-500" />
              Action Center
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
              <span>{activeTaskCount} active manager tasks</span>
              {data?.generatedAt && <span>Updated {when(data.generatedAt)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/stocktake?mode=spot_check')}
              disabled={!tenantId}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
            >
              <Package className="h-4 w-4" />
              Start Spot Check
            </button>
            <button
              type="button"
              onClick={load}
              disabled={!tenantId || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {!tenantId && <EmptyLine label="No tenant selected." />}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          {countCards.map((card) => {
            const value = data?.counts?.[card.key] || 0;
            const Icon = card.icon;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => navigate(card.path)}
                className={`rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md ${toneClass[card.tone]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Icon className="h-6 w-6" />
                  <ArrowRight className="h-4 w-4 opacity-60" />
                </div>
                <div className="mt-5 text-3xl font-black">{value}</div>
                <div className="mt-1 text-xs font-black uppercase tracking-widest opacity-75">{card.label}</div>
              </button>
            );
          })}
        </div>

        <Panel
          title="Audit And Stock Search"
          action={
            <div className="flex items-center gap-2 text-xs font-black text-slate-400">
              <Filter className="h-4 w-4" />
              {activity?.counts?.total || 0} results
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <label className="lg:col-span-3">
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <Search className="h-3.5 w-3.5" />
                Search
              </span>
              <input
                value={activityFilters.search}
                onChange={(event) => updateActivityFilter('search', event.target.value)}
                placeholder="Product, sale, reason, staff..."
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-200"
              />
            </label>
            <label className="lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Type</span>
              <select
                value={activityFilters.type}
                onChange={(event) => updateActivityFilter('type', event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-200"
              >
                <option value="all">All activity</option>
                <option value="audit">Audit only</option>
                <option value="stock">Stock only</option>
              </select>
            </label>
            <label className="lg:col-span-2">
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <UserRound className="h-3.5 w-3.5" />
                Staff
              </span>
              <input
                value={activityFilters.staff}
                onChange={(event) => updateActivityFilter('staff', event.target.value)}
                placeholder="Name or ID"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-200"
              />
            </label>
            <label className="lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Product</span>
              <input
                value={activityFilters.productId}
                onChange={(event) => updateActivityFilter('productId', event.target.value)}
                placeholder="Product ID"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-200"
              />
            </label>
            <label className="lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sale</span>
              <input
                value={activityFilters.saleId}
                onChange={(event) => updateActivityFilter('saleId', event.target.value)}
                placeholder="Sale ID"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-200"
              />
            </label>
            <label className="lg:col-span-2">
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <Users className="h-3.5 w-3.5" />
                Customer
              </span>
              <input
                value={activityFilters.customerId}
                onChange={(event) => updateActivityFilter('customerId', event.target.value)}
                placeholder="Customer ID"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-200"
              />
            </label>
            <label className="lg:col-span-2">
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <Monitor className="h-3.5 w-3.5" />
                Register
              </span>
              <input
                value={activityFilters.registerId}
                onChange={(event) => updateActivityFilter('registerId', event.target.value)}
                placeholder="Cash session ID"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-200"
              />
            </label>
            <label className="lg:col-span-2">
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <Smartphone className="h-3.5 w-3.5" />
                Device
              </span>
              <input
                value={activityFilters.deviceId}
                onChange={(event) => updateActivityFilter('deviceId', event.target.value)}
                placeholder="Device ID"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-200"
              />
            </label>
            <label className="lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Source</span>
              <input
                value={activityFilters.source}
                onChange={(event) => updateActivityFilter('source', event.target.value)}
                placeholder="inventory, sale, manager..."
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-200"
              />
            </label>
            <label className="lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Action</span>
              <input
                value={activityFilters.action}
                onChange={(event) => updateActivityFilter('action', event.target.value)}
                placeholder="Reason"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-200"
              />
            </label>
            <label className="lg:col-span-2">
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <CalendarDays className="h-3.5 w-3.5" />
                From
              </span>
              <input
                type="date"
                value={activityFilters.from}
                onChange={(event) => updateActivityFilter('from', event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-200"
              />
            </label>
            <label className="lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">To</span>
              <input
                type="date"
                value={activityFilters.to}
                onChange={(event) => updateActivityFilter('to', event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-[#0B1120] dark:text-slate-200"
              />
            </label>
            <div className="flex items-end gap-2 lg:col-span-8">
              <button
                type="button"
                onClick={() => loadActivity()}
                disabled={!tenantId || activityLoading}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900"
              >
                <Search className="h-4 w-4" />
                {activityLoading ? 'Searching...' : 'Search'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivityFilters(defaultActivityFilters);
                  void loadActivity(defaultActivityFilters);
                }}
                className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={exportActivity}
                disabled={!tenantId || activityExporting}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
              >
                <Download className="h-4 w-4" />
                {activityExporting ? 'Exporting...' : 'CSV'}
              </button>
              <select
                value={activityReportAudience}
                onChange={(event) => setActivityReportAudience(event.target.value as AuditReportAudience)}
                className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black uppercase tracking-widest text-slate-600 shadow-sm outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                <option value="owner">Owner Report</option>
                <option value="accountant">Accounting Report</option>
                <option value="compliance">Compliance Report</option>
              </select>
              <button
                type="button"
                onClick={exportAuditReport}
                disabled={!tenantId || activityReportExporting}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300"
              >
                <Download className="h-4 w-4" />
                {activityReportExporting ? 'Exporting...' : 'Report'}
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {activityItems.length === 0 && <EmptyLine label="No matching audit or stock activity." />}
            {activityItems.slice(0, 12).map((item) => {
              const isStock = item.kind === 'stock';
              return (
                <article key={`${item.kind}-${item.id}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-[#0B1120]">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isStock ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'}`}>
                        {isStock ? <Boxes className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-sm font-black text-slate-900 dark:text-white">{item.title}</h4>
                          <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:bg-slate-900">
                            {item.kind}
                          </span>
                          {isStock && item.reasonCode && (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              {stockReasonLabel(item.reasonCode)}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          {item.subtitle || 'Activity'} - {item.staffName || item.staffId || 'System'} - {when(item.createdAt)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {item.productId && <span>Product {item.productId}</span>}
                          {item.saleId && <span>Sale {item.saleId}</span>}
                          {item.customerId && <span>Customer {item.customerId}</span>}
                          {item.registerId && <span>Register {item.registerId}</span>}
                          {item.deviceId && <span>Device {item.deviceId}</span>}
                          {item.localReceiptNumber && <span>Receipt {item.localReceiptNumber}</span>}
                          {item.source && <span>Source {item.source}</span>}
                          {item.referenceId && <span>Ref {item.referenceId}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {isStock && (
                        <div className={`rounded-lg px-3 py-2 text-xs font-black ${number(item.quantityDelta) < 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>
                          {number(item.quantityDelta) > 0 ? '+' : ''}{number(item.quantityDelta)} stock
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(activityDestination(item))}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Manager Task Queue"
          action={
            <div className="flex items-center gap-2 text-xs font-black text-slate-400">
              <ClipboardList className="h-4 w-4" />
              {taskQueue?.counts?.inReview || 0} in review
            </div>
          }
        >
          <div className="space-y-3">
            {managerTasks.length === 0 && <EmptyLine label="No manager tasks need action." />}
            {managerTasks.slice(0, 8).map((task) => {
              const offlineDetails = task.taskType === 'offline_sync' ? task.details?.details || {} : {};
              const conflictLabel = offlineConflictLabel(offlineDetails.conflictType);
              return (
              <article key={task.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-[#0B1120]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${priorityClass[task.priority] || priorityClass.normal}`}>
                        {task.priority}
                      </span>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                        {task.status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {task.taskType.replace('_', ' ')}
                      </span>
                    </div>
                    <h4 className="mt-3 text-base font-black text-slate-900 dark:text-white">{task.title}</h4>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">{task.summary}</p>
                    {(conflictLabel || offlineDetails.recommendedAction) && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-900/20">
                        {conflictLabel && (
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-200">
                            {conflictLabel}
                          </p>
                        )}
                        {offlineDetails.recommendedAction && (
                          <p className="mt-1 text-xs font-semibold leading-5 text-amber-800 dark:text-amber-100">
                            {offlineDetails.recommendedAction}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(taskDestination(task))}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Source
                      </button>
                      {task.sourceId && (
                        <span className="rounded-lg bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:bg-slate-900">
                          {task.sourceId}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full xl:w-96">
                    <textarea
                      value={taskNotes[task.id] || ''}
                      onChange={(event) => setTaskNotes(current => ({ ...current, [task.id]: event.target.value }))}
                      placeholder="Manager note for approval or decline"
                      rows={2}
                      className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    />
                    <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                      <button
                        type="button"
                        onClick={() => runTaskAction(task, 'start')}
                        disabled={actingTaskId === task.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        Take
                      </button>
                      <button
                        type="button"
                        onClick={() => runTaskAction(task, 'approve')}
                        disabled={actingTaskId === task.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => runTaskAction(task, 'decline')}
                        disabled={actingTaskId === task.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => runTaskAction(task, 'dismiss')}
                        disabled={actingTaskId === task.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        </Panel>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Panel
            title="Stocktake Exceptions"
            action={<button onClick={() => navigate('/stocktake')} className="text-xs font-black text-indigo-600 dark:text-indigo-300">Open Stocktake</button>}
          >
            <div className="space-y-3">
              {(data?.stockTakeExceptions || []).length === 0 && <EmptyLine label="No stocktake exceptions." />}
              {(data?.stockTakeExceptions || []).slice(0, 5).map((session) => (
                <div key={session.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-[#0B1120]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900 dark:text-white">{session.name}</div>
                      <div className="mt-1 text-xs font-bold text-slate-400">
                        {session.status === 'active' ? 'Overdue count' : 'Manager approval'} - {when(session.updatedAt)}
                      </div>
                    </div>
                    <div className={`rounded-full px-2 py-1 text-xs font-black ${number(session.varianceCount) > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {number(session.varianceCount)} variance
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span>{session.type}</span>
                    <span>{number(session.countedCount)} / {number(session.itemCount)} counted</span>
                    <span>Net {number(session.netVariance) > 0 ? '+' : ''}{number(session.netVariance)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Offline Sync Issues"
            action={<button onClick={load} className="text-xs font-black text-indigo-600 dark:text-indigo-300">Refresh</button>}
          >
            <div className="space-y-3">
              {(data?.offlineSyncIssues || []).length === 0 && <EmptyLine label="No offline sync issues." />}
              {(data?.offlineSyncIssues || []).slice(0, 5).map((event) => {
                const conflictLabel = offlineConflictLabel(event.details?.conflictType);
                return (
                <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-[#0B1120]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900 dark:text-white">{event.action}</div>
                      <div className="mt-1 text-xs font-bold text-slate-400">
                        {event.staffName || event.staffId || 'System'} - {when(event.createdAt)}
                      </div>
                    </div>
                    <WifiOff className="h-4 w-4 shrink-0 text-amber-500" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {event.entityType && <span>{event.entityType}</span>}
                    {event.entityId && <span>{event.entityId}</span>}
                    {event.source && <span>{event.source}</span>}
                  </div>
                  {(conflictLabel || event.details?.recommendedAction) && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-900/20">
                      {conflictLabel && (
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-200">
                          {conflictLabel}
                        </p>
                      )}
                      {event.details?.recommendedAction && (
                        <p className="mt-1 text-xs font-semibold leading-5 text-amber-800 dark:text-amber-100">
                          {event.details.recommendedAction}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Panel
            title="Cash Exceptions"
            action={<button onClick={() => navigate('/cash')} className="text-xs font-black text-indigo-600 dark:text-indigo-300">Open Cash</button>}
          >
            <div className="space-y-3">
              {(data?.cashExceptions || []).length === 0 && <EmptyLine label="No cash exceptions." />}
              {(data?.cashExceptions || []).slice(0, 5).map((session) => (
                <div key={session.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-[#0B1120]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-900 dark:text-white">{session.staffName || 'Register'}</div>
                      <div className="mt-1 text-xs font-bold text-slate-400">{session.reviewStatus || session.status} - {when(session.updatedAt)}</div>
                    </div>
                    <div className={`rounded-full px-2 py-1 text-xs font-black ${Math.abs(number(session.difference)) > 0.009 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                      {money(session.difference)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Refunds And Voids"
            action={<button onClick={() => navigate('/history')} className="text-xs font-black text-indigo-600 dark:text-indigo-300">Open History</button>}
          >
            <div className="space-y-3">
              {(data?.saleExceptions || []).length === 0 && <EmptyLine label="No refund or void activity." />}
              {(data?.saleExceptions || []).slice(0, 5).map((sale) => (
                <div key={sale.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-[#0B1120]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-900 dark:text-white">{sale.transactionType || sale.refundStatus}</div>
                      <div className="mt-1 text-xs font-bold text-slate-400">{sale.refundReason || sale.voidReason || 'No reason captured'} - {when(sale.updatedAt || sale.createdAt)}</div>
                    </div>
                    <div className="text-right text-sm font-black text-slate-900 dark:text-white">{money(Math.abs(number(sale.total || sale.refundedAmount)))}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Low Stock"
            action={<button onClick={() => navigate('/inventory')} className="text-xs font-black text-indigo-600 dark:text-indigo-300">Open Inventory</button>}
          >
            <div className="space-y-3">
              {(data?.lowStock || []).length === 0 && <EmptyLine label="No low stock items." />}
              {(data?.lowStock || []).slice(0, 6).map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-[#0B1120]">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-900 dark:text-white">{product.name}</div>
                    <div className="mt-0.5 text-xs font-bold text-slate-400">{product.section || 'No section'} - {product.category || 'No category'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-slate-900 dark:text-white">{number(product.stock)}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Min {number(product.minStock)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="AI Warnings"
            action={<button onClick={() => navigate('/ai')} className="text-xs font-black text-indigo-600 dark:text-indigo-300">Open AI</button>}
          >
            <div className="space-y-3">
              {(data?.aiInsights || []).length === 0 && <EmptyLine label="No AI warnings." />}
              {(data?.aiInsights || []).slice(0, 5).map((insight) => (
                <div key={insight.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-[#0B1120]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`h-4 w-4 ${insight.severity === 'critical' ? 'text-rose-500' : 'text-amber-500'}`} />
                        <div className="text-sm font-black text-slate-900 dark:text-white">{insight.title}</div>
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{insight.summary}</div>
                    </div>
                    <div className="text-xs font-black text-slate-400">{number(insight.confidence)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Panel title="Recent Stock Movement">
            <div className="space-y-3">
              {recentStock.length === 0 && <EmptyLine label="No stock movements yet." />}
              {recentStock.map((movement) => (
                <div key={movement.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-[#0B1120]">
                  <div className="flex min-w-0 items-center gap-3">
                    <Boxes className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900 dark:text-white">{movement.itemName || movement.productId || 'Stock item'}</div>
                      <div className="mt-0.5 text-xs font-bold text-slate-400">
                        {movement.reasonCode
                          ? `${stockReasonLabel(movement.reasonCode)} - ${movement.reason} - ${when(movement.createdAt)}`
                          : `${movement.reason} - ${when(movement.createdAt)}`}
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-black ${number(movement.quantityDelta) < 0 ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                    {number(movement.quantityDelta) > 0 ? '+' : ''}{number(movement.quantityDelta)}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Recent Audit Activity">
            <div className="space-y-3">
              {recentAudit.length === 0 && <EmptyLine label="No audit activity yet." />}
              {recentAudit.map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-[#0B1120]">
                  <div className="flex min-w-0 items-center gap-3">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900 dark:text-white">{event.action}</div>
                      <div className="mt-0.5 text-xs font-bold text-slate-400">{event.staffName || event.staffId || 'System'} - {when(event.createdAt)}</div>
                    </div>
                  </div>
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">{event.entityType}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
