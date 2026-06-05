import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, MapPin, Play, Power, RefreshCw, ShoppingCart, X } from 'lucide-react';
import {
  approveReorderRecommendation,
  apiGet,
  createReorderNotificationRule,
  dismissReorderRecommendation,
  getInventoryLocations,
  getReorderNotificationRules,
  getReorderRecommendations,
  refreshReorderRecommendations,
  runReorderNotificationRule,
  updateReorderNotificationRule,
} from '../api';
import { InventoryLocation, ReorderNotificationRule, ReorderRecommendation, Vendor } from '../types';
import { usePosStore } from '../store/usePosStore';

type Message = { tone: 'success' | 'error'; text: string } | null;
type RuleTriggerType = ReorderNotificationRule['triggerType'];
type RulePriority = ReorderNotificationRule['priority'];

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return `R${number(value).toFixed(2)}`;
}

function priorityClass(priority: ReorderRecommendation['priority']) {
  if (priority === 'critical') return 'bg-red-50 text-red-700 border-red-100';
  if (priority === 'high') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-slate-50 text-slate-600 border-slate-100';
}

function triggerLabel(triggerType: RuleTriggerType) {
  if (triggerType === 'critical_only') return 'Critical only';
  if (triggerType === 'days_cover') return 'Days cover';
  return 'Below threshold';
}

export function ReorderRecommendationsView() {
  const tenantId = usePosStore(state => state.tenantId);
  const [recommendations, setRecommendations] = useState<ReorderRecommendation[]>([]);
  const [rules, setRules] = useState<ReorderNotificationRule[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [daysOfCover, setDaysOfCover] = useState(14);
  const [vendorId, setVendorId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [ruleForm, setRuleForm] = useState({
    name: '',
    locationId: '',
    triggerType: 'below_threshold' as RuleTriggerType,
    priority: 'high' as RulePriority,
    daysOfCover: 14,
    vendorId: '',
    notifyRoles: ['manager', 'owner'],
  });
  const [message, setMessage] = useState<Message>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const locationById = useMemo(() => new Map(locations.map(location => [location.id, location])), [locations]);
  const locationLabel = (locationId?: string | null) => {
    if (!locationId) return 'All locations';
    return locationById.get(locationId)?.name || `${locationId} location`;
  };

  const activeRecommendations = useMemo(
    () => recommendations.filter(item => item.status === 'open' || item.status === 'in_review' || item.status === 'approved'),
    [recommendations]
  );

  const visibleRecommendations = useMemo(
    () => activeRecommendations.filter(item => !selectedLocationId || (item.locationId || 'main') === selectedLocationId),
    [activeRecommendations, selectedLocationId]
  );

  const totals = useMemo(() => ({
    quantity: visibleRecommendations.reduce((sum, item) => sum + number(item.recommendedQuantity), 0),
    cost: visibleRecommendations.reduce((sum, item) => sum + number(item.estimatedTotalCost), 0),
    critical: visibleRecommendations.filter(item => item.priority === 'critical').length,
  }), [visibleRecommendations]);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [rows, vendorRows, locationRows, ruleRows] = await Promise.all([
        getReorderRecommendations(tenantId),
        apiGet<Vendor[]>(`/api/mariadb/tenants/${tenantId}/vendors`),
        getInventoryLocations(tenantId),
        getReorderNotificationRules(tenantId),
      ]);
      setRecommendations(rows);
      setVendors(vendorRows.filter(vendor => vendor.status !== 'inactive'));
      setLocations(locationRows.filter(location => location.status !== 'inactive'));
      setRules(ruleRows);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load reorder recommendations.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tenantId]);

  const refresh = async () => {
    if (!tenantId) return;
    setLoading(true);
    setMessage(null);
    try {
      const result = await refreshReorderRecommendations(tenantId, {
        daysOfCover,
        vendorId: vendorId || null,
        locationId: selectedLocationId || null,
      });
      setRecommendations(result.recommendations);
      setMessage({ tone: 'success', text: `${result.created} created, ${result.updated} updated${selectedLocationId ? ` for ${locationLabel(selectedLocationId)}` : ''}.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not refresh reorder recommendations.' });
    } finally {
      setLoading(false);
    }
  };

  const setNotifyRole = (role: string, checked: boolean) => {
    setRuleForm(prev => ({
      ...prev,
      notifyRoles: checked
        ? Array.from(new Set([...prev.notifyRoles, role]))
        : prev.notifyRoles.filter(item => item !== role),
    }));
  };

  const createRule = async () => {
    if (!tenantId) return;
    setLoading(true);
    setMessage(null);
    try {
      const created = await createReorderNotificationRule(tenantId, {
        name: ruleForm.name || undefined,
        locationId: ruleForm.locationId || null,
        triggerType: ruleForm.triggerType,
        priority: ruleForm.priority,
        daysOfCover: ruleForm.daysOfCover,
        vendorId: ruleForm.vendorId || null,
        notifyRoles: ruleForm.notifyRoles,
      });
      if (created) setRules(prev => [created, ...prev.filter(rule => rule.id !== created.id)]);
      setRuleForm(prev => ({ ...prev, name: '' }));
      setMessage({ tone: 'success', text: 'Reorder rule created.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not create reorder rule.' });
    } finally {
      setLoading(false);
    }
  };

  const runRule = async (rule: ReorderNotificationRule) => {
    if (!tenantId) return;
    setBusyId(`rule:${rule.id}`);
    setMessage(null);
    try {
      const result = await runReorderNotificationRule(tenantId, rule.id);
      if (result.rule) setRules(prev => prev.map(item => item.id === rule.id ? result.rule! : item));
      setRecommendations(result.result.recommendations);
      setMessage({ tone: 'success', text: `${result.result.created} created, ${result.result.updated} updated for ${rule.name}.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not run reorder rule.' });
    } finally {
      setBusyId(null);
    }
  };

  const toggleRule = async (rule: ReorderNotificationRule) => {
    if (!tenantId) return;
    setBusyId(`rule:${rule.id}`);
    setMessage(null);
    try {
      const updated = await updateReorderNotificationRule(tenantId, rule.id, {
        status: rule.status === 'active' ? 'inactive' : 'active',
      });
      if (updated) setRules(prev => prev.map(item => item.id === rule.id ? updated : item));
      setMessage({ tone: 'success', text: `Rule ${updated?.status === 'active' ? 'activated' : 'paused'}.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not update reorder rule.' });
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (item: ReorderRecommendation) => {
    if (!tenantId) return;
    setBusyId(item.id);
    setMessage(null);
    try {
      const result = await approveReorderRecommendation(tenantId, item.id, {
        vendorId: vendorId || item.vendorId || null,
        quantity: item.recommendedQuantity,
        expectedPrice: item.estimatedUnitCost,
        note: 'Approved from reorder recommendations',
      });
      setMessage({ tone: 'success', text: result.alreadyOrdered ? 'Purchase order already exists.' : 'Draft purchase order created.' });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not approve reorder recommendation.' });
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (item: ReorderRecommendation) => {
    if (!tenantId) return;
    setBusyId(item.id);
    setMessage(null);
    try {
      await dismissReorderRecommendation(tenantId, item.id, 'Dismissed from reorder recommendations');
      setMessage({ tone: 'success', text: 'Recommendation dismissed.' });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not dismiss reorder recommendation.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-black">Reorder Queue</h2>
          </div>
          <div className="mt-3 grid gap-2 text-sm font-bold text-slate-500 sm:grid-cols-3">
            <span>{visibleRecommendations.length} active</span>
            <span>{totals.quantity} units</span>
            <span>{money(totals.cost)} estimate</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
            Cover
            <input
              type="number"
              min={1}
              max={120}
              value={daysOfCover}
              onChange={event => setDaysOfCover(Math.max(1, Number(event.target.value) || 14))}
              className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>
          <select
            value={selectedLocationId}
            onChange={event => setSelectedLocationId(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">All locations</option>
            {locations.map(location => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
          <select
            value={vendorId}
            onChange={event => setVendorId(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">No vendor</option>
            {vendors.map(vendor => (
              <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${
          message.tone === 'success'
            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
            : 'border-red-100 bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Bell className="h-5 w-5 text-primary" />
            <h3 className="text-base font-black">Reorder Rules</h3>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-800">
              {rules.filter(rule => rule.status === 'active').length} active
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_0.8fr_0.9fr_auto]">
          <input
            value={ruleForm.name}
            onChange={event => setRuleForm(prev => ({ ...prev, name: event.target.value }))}
            placeholder="Rule name"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <select
            value={ruleForm.locationId}
            onChange={event => setRuleForm(prev => ({ ...prev, locationId: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">All locations</option>
            {locations.map(location => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
          <select
            value={ruleForm.triggerType}
            onChange={event => setRuleForm(prev => ({ ...prev, triggerType: event.target.value as RuleTriggerType }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="below_threshold">Below threshold</option>
            <option value="critical_only">Critical only</option>
            <option value="days_cover">Days cover</option>
          </select>
          <select
            value={ruleForm.priority}
            onChange={event => setRuleForm(prev => ({ ...prev, priority: event.target.value as RulePriority }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <input
            type="number"
            min={1}
            max={120}
            value={ruleForm.daysOfCover}
            onChange={event => setRuleForm(prev => ({ ...prev, daysOfCover: Math.max(1, Number(event.target.value) || 14) }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            title="Days cover"
          />
          <button
            type="button"
            onClick={createRule}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <Bell className="h-4 w-4" />
            Add
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center">
          <select
            value={ruleForm.vendorId}
            onChange={event => setRuleForm(prev => ({ ...prev, vendorId: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">No vendor</option>
            {vendors.map(vendor => (
              <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
            {['manager', 'owner', 'dev'].map(role => (
              <label key={role} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={ruleForm.notifyRoles.includes(role)}
                  onChange={event => setNotifyRole(role, event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                {role}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {rules.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-bold text-slate-500 dark:border-slate-700">
              No reorder rules.
            </div>
          ) : rules.map(rule => {
            const last = (rule.lastResult || {}) as Record<string, any>;
            return (
              <div key={rule.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-black text-slate-900 dark:text-white">{rule.name}</span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${rule.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                      {rule.status}
                    </span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${priorityClass(rule.priority as ReorderRecommendation['priority'])}`}>
                      {rule.priority}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs font-bold text-slate-500">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{locationLabel(rule.locationId)}</span>
                    <span>{triggerLabel(rule.triggerType)}</span>
                    <span>{rule.daysOfCover} days</span>
                    <span>{last.created ?? 0} created / {last.updated ?? 0} updated</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => runRule(rule)}
                    disabled={busyId === `rule:${rule.id}` || rule.status !== 'active'}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Run rule"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleRule(rule)}
                    disabled={busyId === `rule:${rule.id}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    title={rule.status === 'active' ? 'Pause rule' : 'Activate rule'}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr_1fr] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-950">
          <span>Product</span>
          <span>Stock</span>
          <span>Target</span>
          <span>Order</span>
          <span>Estimate</span>
          <span>Priority</span>
          <span className="text-right">Actions</span>
        </div>

        {loading && visibleRecommendations.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm font-bold text-slate-500">Loading...</div>
        ) : visibleRecommendations.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm font-bold text-slate-500">No active reorder recommendations.</div>
        ) : (
          visibleRecommendations.map(item => (
            <div
              key={item.id}
              className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr_1fr] items-center gap-3 border-b border-slate-100 px-4 py-4 text-sm last:border-b-0 dark:border-slate-800"
            >
              <div className="min-w-0">
                <div className="truncate font-black text-slate-900 dark:text-white">{item.productName}</div>
                <div className="mt-1 truncate text-xs font-bold text-slate-500">
                  {item.locationId ? locationLabel(item.locationId) : item.avgDailySales ? `${item.avgDailySales.toFixed(2)} daily avg` : 'No velocity'}
                </div>
              </div>
              <span className="font-bold text-slate-700 dark:text-slate-300">{item.currentStock} / {item.minStock}</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">{item.targetStock}</span>
              <span className="font-black text-slate-900 dark:text-white">{item.recommendedQuantity}</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">{money(item.estimatedTotalCost)}</span>
              <span className={`w-fit rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${priorityClass(item.priority)}`}>
                {item.priority}
              </span>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => approve(item)}
                  disabled={busyId === item.id}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  title="Approve reorder"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(item)}
                  disabled={busyId === item.id}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  title="Dismiss reorder"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
