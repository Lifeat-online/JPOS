import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Banknote, ChefHat, Power, RefreshCw, Timer, Users, Utensils } from 'lucide-react';
import { getTenantLiveStats } from '../api';
import { LiveTenantStats } from '../types';
import { getDate } from '../utils/date';
import { usePosStore } from '../store/usePosStore';

export function LiveView({ tenantId }: { tenantId: string | null }) {
  const { isLivePollingEnabled, setIsLivePollingEnabled } = usePosStore();
  const [data, setData] = useState<LiveTenantStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const canLoad = Boolean(tenantId);

  const refresh = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getTenantLiveStats(tenantId);
      setData(res as LiveTenantStats);
      setLastUpdatedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canLoad) return;
    
    // Initial load
    refresh();

    let id: number | null = null;

    const startPolling = () => {
      if (!id && isLivePollingEnabled) {
        id = window.setInterval(refresh, 5000);
      }
    };

    const stopPolling = () => {
      if (id) {
        window.clearInterval(id);
        id = null;
      }
    };

    // Only poll if enabled AND tab is visible (extra cost saving)
    const handleVisibilityChange = () => {
      if (document.hidden) stopPolling();
      else startPolling();
    };

    if (isLivePollingEnabled) {
      startPolling();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [tenantId, isLivePollingEnabled]);

  const fmtMoney = (value: number) => `R${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
  const fmtTime = (value: any) => {
    if (!value) return '—';
    const d = getDate(value);
    
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const fmtDateTime = (value: any) => {
    if (!value) return '—';
    const d = getDate(value);

    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  const fmtAge = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m <= 0) return `${r}s`;
    return `${m}m ${String(r).padStart(2, '0')}s`;
  };

  const summary = useMemo(() => {
    const openRegisters = data?.retail.openRegisterCount ?? 0;
    const activeOrders = data?.totals.activeOrdersCount ?? 0;
    const openTabs = data?.totals.openTabsCount ?? 0;
    const lastHourRevenue = data?.totals.lastHour.completedRevenue ?? 0;
    const lastHourCount = data?.totals.lastHour.completedCount ?? 0;
    const workstationQueue =
      data?.restaurant?.workstationQueues?.reduce((acc, w) => acc + (w.queueCount || 0), 0) ?? 0;
    const openTables = data?.restaurant?.tables.openTableCount ?? 0;
    return {
      openRegisters,
      activeOrders,
      openTabs,
      lastHourRevenue,
      lastHourCount,
      workstationQueue,
      openTables,
    };
  }, [data]);

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Live</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-500 font-medium">
              <span>{data?.isRestaurantMode ? 'Restaurant mode' : 'Retail mode'}</span>
              {lastUpdatedAt && <span>• Updated {fmtTime(lastUpdatedAt)}</span>}
              {!isLivePollingEnabled && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-full text-[10px] font-black uppercase tracking-wider border border-amber-100 dark:border-amber-800/50 ml-2">
                  <Power className="w-2.5 h-2.5" />
                  Polling Paused
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Polling Switch */}
            <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-700">
              <span className={`text-[10px] font-black uppercase tracking-widest ${isLivePollingEnabled ? 'text-primary' : 'text-slate-400'}`}>
                Auto-Refresh
              </span>
              <button
                onClick={() => setIsLivePollingEnabled(!isLivePollingEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isLivePollingEnabled ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-800'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isLivePollingEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            <button
              onClick={refresh}
              disabled={!canLoad || loading}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl font-bold text-sm border transition-all ${
                !canLoad || loading
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-transparent'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {!tenantId && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-slate-600 dark:text-slate-300 font-semibold">No tenant selected.</div>
          </div>
        )}

        {error && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-red-200 dark:border-red-900/40 shadow-sm">
            <div className="text-red-700 dark:text-red-300 font-bold">Failed to load live stats</div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300 break-words">{error}</div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-2xl flex items-center justify-center">
              <Activity className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Active Orders</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">{summary.activeOrders}</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 rounded-2xl flex items-center justify-center">
              <Banknote className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Open Registers</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">{summary.openRegisters}</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-purple-50 dark:bg-purple-900/20 text-purple-500 rounded-2xl flex items-center justify-center">
              <Timer className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Last Hour</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">{fmtMoney(summary.lastHourRevenue)}</div>
              <div className="text-xs font-bold text-slate-400 mt-1">{summary.lastHourCount} sales</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-amber-50 dark:bg-amber-900/20 text-amber-500 rounded-2xl flex items-center justify-center">
              <ChefHat className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Work Queue</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">{summary.workstationQueue}</div>
              {data?.isRestaurantMode && (
                <div className="text-xs font-bold text-slate-400 mt-1">{summary.openTables} tables • {summary.openTabs} tabs</div>
              )}
              {!data?.isRestaurantMode && (
                <div className="text-xs font-bold text-slate-400 mt-1">{summary.openTabs} tabs</div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Open Registers</h3>
              <p className="text-sm text-slate-500 font-medium">Per-register performance for currently open cash sessions.</p>
            </div>
            <div className="text-xs font-bold text-slate-400">
              Today: {fmtMoney(data?.totals.today.completedRevenue ?? 0)} • {data?.totals.today.completedCount ?? 0} sales
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(data?.retail.registers ?? []).length === 0 && (
              <div className="text-slate-500 font-semibold">No open registers.</div>
            )}
            {(data?.retail.registers ?? []).map((r) => (
              <div
                key={r.cashSessionId}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1120] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-slate-900 dark:text-white truncate">{r.staffName || 'Register'}</div>
                    <div className="text-xs font-bold text-slate-400 mt-1">
                      Opened {fmtDateTime(r.openedAt)} • Last sale {fmtTime(r.lastSaleAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black uppercase tracking-widest text-slate-400">Completed</div>
                    <div className="text-lg font-black text-slate-900 dark:text-white">{fmtMoney(r.completedRevenue)}</div>
                    <div className="text-[11px] font-bold text-slate-400">{r.completedCount} sales • {r.activeOrders} active</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cash</div>
                    <div className="text-sm font-black text-slate-900 dark:text-white mt-1">{fmtMoney(r.cashRevenue)}</div>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Card</div>
                    <div className="text-sm font-black text-slate-900 dark:text-white mt-1">{fmtMoney(r.cardRevenue)}</div>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Wallet</div>
                    <div className="text-sm font-black text-slate-900 dark:text-white mt-1">{fmtMoney(r.walletRevenue)}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Expected Cash</div>
                    <div className="text-sm font-black text-slate-900 dark:text-white mt-1">{fmtMoney(r.expectedCash)}</div>
                    <div className="text-[11px] font-bold text-slate-400 mt-0.5">Float {fmtMoney(r.openingFloat)}</div>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tips</div>
                    <div className="text-sm font-black text-slate-900 dark:text-white mt-1">{fmtMoney(r.netTips)}</div>
                    <div className="text-[11px] font-bold text-slate-400 mt-0.5">Accum {fmtMoney(r.accumulatedTips)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {data?.isRestaurantMode && data.restaurant && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 rounded-2xl flex items-center justify-center">
                  <Utensils className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Tables</h3>
                  <p className="text-sm text-slate-500 font-medium">
                    {data.restaurant.tables.openTableCount} open • {data.restaurant.tables.activeTableCount} active
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {data.restaurant.tables.openTables.length === 0 && (
                  <div className="text-slate-500 font-semibold">No open tables.</div>
                )}
                {data.restaurant.tables.openTables.slice(0, 12).map((t) => (
                  <div
                    key={t.tableNumber}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1120] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-black text-slate-900 dark:text-white truncate">Table {t.tableNumber}</div>
                      <div className="text-xs font-bold text-slate-400 mt-0.5">Oldest {fmtTime(t.oldestOrderAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-slate-900 dark:text-white">{t.activeOrders} orders</div>
                      <div className="text-xs font-bold text-slate-400">{fmtMoney(t.activeOrderValue)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-2xl flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Staff (Last 60m)</h3>
                  <p className="text-sm text-slate-500 font-medium">Sales throughput and active load.</p>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {data.restaurant.staffPerformance.length === 0 && (
                  <div className="text-slate-500 font-semibold">No staff activity.</div>
                )}
                {data.restaurant.staffPerformance.slice(0, 10).map((s) => (
                  <div
                    key={s.staffId}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1120] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-black text-slate-900 dark:text-white truncate">{s.staffName}</div>
                      <div className="text-xs font-bold text-slate-400 mt-0.5">Last sale {fmtTime(s.lastSaleAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-slate-900 dark:text-white">{fmtMoney(s.completedRevenue)}</div>
                      <div className="text-[11px] font-bold text-slate-400">{s.completedCount} sales • {s.activeOrders} active</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm lg:col-span-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 text-amber-500 rounded-2xl flex items-center justify-center">
                  <ChefHat className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Workstation Queues</h3>
                  <p className="text-sm text-slate-500 font-medium">Queue pressure, phase timing, and stale handoff flags.</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.restaurant.workstationQueues.length === 0 && (
                  <div className="text-slate-500 font-semibold">No workstations.</div>
                )}
                {data.restaurant.workstationQueues.map((w) => (
                  <div
                    key={w.workstationId}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1120] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-black text-slate-900 dark:text-white truncate">{w.workstationName}</div>
                        <div className="text-xs font-bold text-slate-400 mt-1">
                          Oldest {w.oldestActiveAt || w.oldestOrderedAt ? fmtAge(w.oldestActiveAgeSeconds || w.oldestAgeSeconds) : '—'} • P90 {w.activeP90AgeSeconds ? fmtAge(w.activeP90AgeSeconds) : '—'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black uppercase tracking-widest text-slate-400">Queue</div>
                        <div className="text-xl font-black text-slate-900 dark:text-white">{w.queueCount}</div>
                      </div>
                    </div>

                    {(w.staleTimerCount > 0 || w.unclosedHandoffCount > 0) && (
                      <div className="mt-3 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-[11px] font-bold text-red-700 dark:text-red-300">
                        {w.staleTimerCount} stale timer{w.staleTimerCount === 1 ? '' : 's'}
                        {w.unclosedHandoffCount > 0 && ` - ${w.unclosedHandoffCount} unclosed handoff${w.unclosedHandoffCount === 1 ? '' : 's'}`}
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Accept Avg</div>
                        <div className="text-sm font-black text-slate-900 dark:text-white mt-1">{w.avgAcceptSecondsLast2h ? fmtAge(w.avgAcceptSecondsLast2h) : '—'}</div>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prep Avg</div>
                        <div className="text-sm font-black text-slate-900 dark:text-white mt-1">{w.avgPrepSecondsLast2h ? fmtAge(w.avgPrepSecondsLast2h) : '—'}</div>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Handoff</div>
                        <div className="text-sm font-black text-slate-900 dark:text-white mt-1">{w.avgHandoffSecondsLast2h ? fmtAge(w.avgHandoffSecondsLast2h) : '—'}</div>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Avg</div>
                        <div className="text-sm font-black text-slate-900 dark:text-white mt-1">{w.avgTotalSecondsLast2h ? fmtAge(w.avgTotalSecondsLast2h) : '—'}</div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pending</div>
                        <div className="text-sm font-black text-slate-900 dark:text-white mt-1">{w.pendingCount}</div>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Accepted</div>
                        <div className="text-sm font-black text-slate-900 dark:text-white mt-1">{w.acceptedCount}</div>
                      </div>
                      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ready</div>
                        <div className="text-sm font-black text-slate-900 dark:text-white mt-1">{w.readyCount}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
