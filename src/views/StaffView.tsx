import React, { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, UserPlus, UserCog, Edit, Trash2, CalendarDays, FileDown, Send, Loader2, XCircle, Banknote } from 'lucide-react';
import { AiStaffScore, Staff, StaffCoachingNote, StaffPerformanceReport, StaffShift, StaffTimesheetReport, TipPoolReport, TipPoolRule } from '../types';
import { addStaffCoachingNote, cancelStaffShift, createStaffShift, createTipPoolRule, generateTipPoolPayouts, getAiStaffScores, getStaffPerformanceReport, getStaffShifts, getTimesheetPayrollReport, getTipPoolRules, previewTipPoolPayouts, publishStaffRoster, updateTipPoolRule } from '../api';

interface StaffViewProps {
  staff: Staff[];
  onEdit: (staff: Staff) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  tenantId?: string | null;
  currentUserStaff?: Staff | null;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysInput(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function minutesLabel(value: number) {
  const minutes = Number(value || 0);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function timeText(value: any) {
  if (!value) return '-';
  const text = String(value);
  if (text.includes('T')) return text.slice(11, 16);
  if (text.includes(' ')) return text.slice(11, 16);
  return text;
}

function secondsLabel(value: number) {
  const seconds = Number(value || 0);
  if (!seconds) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const StaffView: React.FC<StaffViewProps> = ({ staff, onEdit, onAdd, onDelete, tenantId, currentUserStaff }) => {
  const [activeTab, setActiveTab] = useState<'directory' | 'roster' | 'payroll' | 'performance' | 'tips'>('directory');
  const [scores, setScores] = useState<AiStaffScore[]>([]);
  const [rosterStart, setRosterStart] = useState(todayInput());
  const [rosterEnd, setRosterEnd] = useState(() => addDaysInput(todayInput(), 6));
  const [payrollStart, setPayrollStart] = useState(todayInput());
  const [payrollEnd, setPayrollEnd] = useState(todayInput());
  const [performanceStart, setPerformanceStart] = useState(todayInput());
  const [performanceEnd, setPerformanceEnd] = useState(todayInput());
  const [tipStart, setTipStart] = useState(todayInput());
  const [tipEnd, setTipEnd] = useState(todayInput());
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [timesheet, setTimesheet] = useState<StaffTimesheetReport | null>(null);
  const [performanceReport, setPerformanceReport] = useState<StaffPerformanceReport | null>(null);
  const [tipRules, setTipRules] = useState<TipPoolRule[]>([]);
  const [selectedTipRuleId, setSelectedTipRuleId] = useState('');
  const [tipReport, setTipReport] = useState<TipPoolReport | null>(null);
  const [workforceLoading, setWorkforceLoading] = useState(false);
  const [workforceSaving, setWorkforceSaving] = useState(false);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [tipSaving, setTipSaving] = useState(false);
  const [tipLoading, setTipLoading] = useState(false);
  const [workforceMessage, setWorkforceMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [shiftDraft, setShiftDraft] = useState({
    staffId: staff[0]?.id || '',
    shiftDate: todayInput(),
    startTime: '09:00',
    endTime: '17:00',
    breakMinutesPlanned: 30,
    notes: '',
  });
  const [tipRuleDraft, setTipRuleDraft] = useState<Partial<TipPoolRule>>({
    name: 'Worked-hours pool',
    status: 'active',
    distributionMethod: 'worked_hours',
    includedRoles: [],
    roleWeights: { cashier: 1, manager: 1, chef: 1, admin: 1, dev: 1 },
  });
  const [coachingDraft, setCoachingDraft] = useState({
    staffId: staff[0]?.id || '',
    noteType: 'coaching' as StaffCoachingNote['noteType'],
    title: 'Shift coaching note',
    note: '',
  });

  const currentRole = currentUserStaff?.role || '';
  const canManagePersonnel = ['admin', 'dev'].includes(currentRole) || currentUserStaff?.permissions?.canManageStaff === true;
  const canManageWorkforce = ['admin', 'manager', 'dev'].includes(currentRole);

  useEffect(() => {
    if (!shiftDraft.staffId && staff[0]?.id) {
      setShiftDraft(current => ({ ...current, staffId: staff[0].id }));
    }
    if (!coachingDraft.staffId && staff[0]?.id) {
      setCoachingDraft(current => ({ ...current, staffId: staff[0].id }));
    }
  }, [staff, shiftDraft.staffId, coachingDraft.staffId]);

  useEffect(() => {
    let active = true;
    async function loadScores() {
      if (!tenantId) return;
      try {
        const rows = await getAiStaffScores(tenantId);
        if (active) setScores(rows || []);
      } catch {
        if (active) setScores([]);
      }
    }
    void loadScores();
    return () => { active = false; };
  }, [tenantId]);

  const refreshWorkforce = async () => {
    if (!tenantId || !canManageWorkforce) return;
    setWorkforceLoading(true);
    setWorkforceMessage(null);
    try {
      const [shiftRows, report] = await Promise.all([
        getStaffShifts(tenantId, { startDate: rosterStart, endDate: rosterEnd }),
        getTimesheetPayrollReport(tenantId, { startDate: payrollStart, endDate: payrollEnd }),
      ]);
      setShifts(shiftRows || []);
      setTimesheet(report);
    } catch (err: any) {
      setWorkforceMessage({ tone: 'error', text: err?.message || 'Unable to load workforce data.' });
    } finally {
      setWorkforceLoading(false);
    }
  };

  useEffect(() => {
    void refreshWorkforce();
  }, [tenantId, canManageWorkforce, rosterStart, rosterEnd, payrollStart, payrollEnd]);

  const refreshPerformance = async () => {
    if (!tenantId || !canManageWorkforce) return;
    setPerformanceLoading(true);
    setWorkforceMessage(null);
    try {
      const report = await getStaffPerformanceReport(tenantId, { startDate: performanceStart, endDate: performanceEnd });
      setPerformanceReport(report);
    } catch (err: any) {
      setWorkforceMessage({ tone: 'error', text: err?.message || 'Unable to load staff performance.' });
    } finally {
      setPerformanceLoading(false);
    }
  };

  useEffect(() => {
    void refreshPerformance();
  }, [tenantId, canManageWorkforce, performanceStart, performanceEnd]);

  const loadTipRules = async () => {
    if (!tenantId || !canManageWorkforce) return;
    try {
      const rules = await getTipPoolRules(tenantId);
      setTipRules(rules || []);
      if (!selectedTipRuleId && rules?.[0]?.id) {
        setSelectedTipRuleId((rules.find(rule => rule.status === 'active') || rules[0]).id);
      }
    } catch (err: any) {
      setWorkforceMessage({ tone: 'error', text: err?.message || 'Unable to load tip pool rules.' });
    }
  };

  useEffect(() => {
    void loadTipRules();
  }, [tenantId, canManageWorkforce]);

  useEffect(() => {
    const rule = tipRules.find(row => row.id === selectedTipRuleId);
    if (!rule) return;
    setTipRuleDraft({
      name: rule.name,
      status: rule.status,
      distributionMethod: rule.distributionMethod,
      includedRoles: rule.includedRoles || [],
      roleWeights: {
        cashier: 1,
        manager: 1,
        chef: 1,
        admin: 1,
        dev: 1,
        ...(rule.roleWeights || {}),
      },
    });
  }, [selectedTipRuleId, tipRules]);

  const scoreByStaffId = useMemo(() => new Map(scores.map(score => [score.staffId, score])), [scores]);
  const shiftsByDate = useMemo(() => {
    const grouped = new Map<string, StaffShift[]>();
    shifts.forEach(shift => {
      const key = String(shift.shiftDate || '').slice(0, 10);
      grouped.set(key, [...(grouped.get(key) || []), shift]);
    });
    return grouped;
  }, [shifts]);

  const saveShift = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId || !shiftDraft.staffId) return;
    setWorkforceSaving(true);
    setWorkforceMessage(null);
    try {
      await createStaffShift(tenantId, {
        staffId: shiftDraft.staffId,
        shiftDate: shiftDraft.shiftDate,
        startAt: `${shiftDraft.shiftDate}T${shiftDraft.startTime}:00`,
        endAt: `${shiftDraft.shiftDate}T${shiftDraft.endTime}:00`,
        breakMinutesPlanned: Number(shiftDraft.breakMinutesPlanned || 0),
        notes: shiftDraft.notes || null,
        status: 'draft',
      });
      setWorkforceMessage({ tone: 'success', text: 'Shift added to draft roster.' });
      await refreshWorkforce();
    } catch (err: any) {
      setWorkforceMessage({ tone: 'error', text: err?.message || 'Could not save shift.' });
    } finally {
      setWorkforceSaving(false);
    }
  };

  const publishRosterRange = async () => {
    if (!tenantId) return;
    setWorkforceSaving(true);
    setWorkforceMessage(null);
    try {
      const result = await publishStaffRoster(tenantId, { startDate: rosterStart, endDate: rosterEnd });
      setShifts(result.shifts || []);
      setWorkforceMessage({ tone: 'success', text: 'Roster published.' });
    } catch (err: any) {
      setWorkforceMessage({ tone: 'error', text: err?.message || 'Could not publish roster.' });
    } finally {
      setWorkforceSaving(false);
    }
  };

  const cancelShift = async (shiftId: string) => {
    if (!tenantId || !confirm('Cancel this shift?')) return;
    setWorkforceSaving(true);
    setWorkforceMessage(null);
    try {
      await cancelStaffShift(tenantId, shiftId);
      await refreshWorkforce();
    } catch (err: any) {
      setWorkforceMessage({ tone: 'error', text: err?.message || 'Could not cancel shift.' });
    } finally {
      setWorkforceSaving(false);
    }
  };

  const saveCoachingNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId || !coachingDraft.staffId) return;
    setPerformanceLoading(true);
    setWorkforceMessage(null);
    try {
      await addStaffCoachingNote(tenantId, coachingDraft);
      setCoachingDraft(current => ({ ...current, title: 'Shift coaching note', note: '' }));
      setWorkforceMessage({ tone: 'success', text: 'Coaching note saved.' });
      await refreshPerformance();
    } catch (err: any) {
      setWorkforceMessage({ tone: 'error', text: err?.message || 'Could not save coaching note.' });
    } finally {
      setPerformanceLoading(false);
    }
  };

  const saveTipRule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId) return;
    setTipSaving(true);
    setWorkforceMessage(null);
    try {
      const payload: Partial<TipPoolRule> = {
        name: String(tipRuleDraft.name || '').trim(),
        status: tipRuleDraft.status === 'inactive' ? 'inactive' : 'active',
        distributionMethod: tipRuleDraft.distributionMethod || 'worked_hours',
        includedRoles: tipRuleDraft.includedRoles || [],
        roleWeights: tipRuleDraft.roleWeights || {},
      };
      if (!payload.name) throw new Error('Rule name is required.');
      const saved = selectedTipRuleId
        ? await updateTipPoolRule(tenantId, selectedTipRuleId, payload)
        : await createTipPoolRule(tenantId, payload);
      setSelectedTipRuleId(saved.id);
      await loadTipRules();
      setWorkforceMessage({ tone: 'success', text: 'Tip pool rule saved.' });
    } catch (err: any) {
      setWorkforceMessage({ tone: 'error', text: err?.message || 'Could not save tip pool rule.' });
    } finally {
      setTipSaving(false);
    }
  };

  const newTipRule = () => {
    setSelectedTipRuleId('');
    setTipRuleDraft({
      name: 'Worked-hours pool',
      status: 'active',
      distributionMethod: 'worked_hours',
      includedRoles: [],
      roleWeights: { cashier: 1, manager: 1, chef: 1, admin: 1, dev: 1 },
    });
    setTipReport(null);
  };

  const updateTipRoleWeight = (role: Staff['role'], value: number) => {
    setTipRuleDraft(current => ({
      ...current,
      roleWeights: {
        ...(current.roleWeights || {}),
        [role]: Math.max(0, Number(value || 0)),
      },
    }));
  };

  const previewTips = async () => {
    if (!tenantId || !selectedTipRuleId) {
      setWorkforceMessage({ tone: 'error', text: 'Select or save a tip pool rule first.' });
      return;
    }
    setTipLoading(true);
    setWorkforceMessage(null);
    try {
      const report = await previewTipPoolPayouts(tenantId, { ruleId: selectedTipRuleId, startDate: tipStart, endDate: tipEnd });
      setTipReport(report);
    } catch (err: any) {
      setWorkforceMessage({ tone: 'error', text: err?.message || 'Tip pool preview failed.' });
    } finally {
      setTipLoading(false);
    }
  };

  const generateTips = async () => {
    if (!tenantId || !selectedTipRuleId) {
      setWorkforceMessage({ tone: 'error', text: 'Select or save a tip pool rule first.' });
      return;
    }
    setTipLoading(true);
    setWorkforceMessage(null);
    try {
      const report = await generateTipPoolPayouts(tenantId, { ruleId: selectedTipRuleId, startDate: tipStart, endDate: tipEnd });
      setTipReport(report);
      setWorkforceMessage({ tone: 'success', text: 'Draft tip payouts generated.' });
    } catch (err: any) {
      setWorkforceMessage({ tone: 'error', text: err?.message || 'Could not generate tip payouts.' });
    } finally {
      setTipLoading(false);
    }
  };

  return (
    <div className="flex-1 p-4 lg:p-8 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/50">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div>
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Staff Control</h2>
            <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Personnel, Rosters, Attendance</p>
          </div>
          {canManagePersonnel && (
            <button
              onClick={onAdd}
              className="w-full sm:w-auto px-8 py-4 bg-primary text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-2xl shadow-primary/30 active:scale-95 hover:scale-105 transition-all text-sm uppercase tracking-widest"
            >
              <UserPlus className="w-5 h-5" />
              Add Personnel
            </button>
          )}
        </div>

        <div className="flex gap-3 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
          {[
            { id: 'directory', label: 'Directory', icon: UserCog },
            { id: 'roster', label: 'Roster', icon: CalendarDays },
            { id: 'payroll', label: 'Timesheets', icon: FileDown },
            { id: 'performance', label: 'Performance', icon: BrainCircuit },
            { id: 'tips', label: 'Tip Pools', icon: Banknote },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 pb-4 text-sm font-black transition-all ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {workforceMessage && (
          <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            workforceMessage.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-900/20 dark:text-rose-200'
          }`}>
            {workforceMessage.text}
          </div>
        )}

        {activeTab === 'directory' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {staff.map(s => (
              <div
                key={s.id}
                className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800/60 shadow-sm transition-all hover:shadow-xl group"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="w-16 h-16 bg-slate-900 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg">
                    {s.name.charAt(0)}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                    s.role === 'admin'
                      ? 'bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400'
                      : s.role === 'manager'
                      ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                      : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  }`}>
                    {s.role}
                  </span>
                </div>

                <div className="space-y-1 mb-6">
                  <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight">{s.name}</h3>
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{s.email}</p>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-2 text-xs font-bold">
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Rate</p>
                    <p className="mt-1 text-slate-900 dark:text-white">R{Number(s.payRate || 0).toFixed(2)} / {s.payType === 'salary' ? 'month' : 'hour'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Leave</p>
                    <p className="mt-1 text-slate-900 dark:text-white">{s.accumulatedLeave || 0} days</p>
                  </div>
                </div>

                {scoreByStaffId.has(s.id) && (
                  <div className="mb-5 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-950/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                        <BrainCircuit className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">AI Grade</span>
                      </div>
                      <span className="text-lg font-black text-indigo-700 dark:text-indigo-300">
                        {scoreByStaffId.get(s.id)?.grade} / {scoreByStaffId.get(s.id)?.score}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {scoreByStaffId.get(s.id)?.coachingNotes?.[0] || 'Coaching score generated.'}
                    </p>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${s.status === 'active' ? 'bg-green-500' : 'bg-slate-300'}`} />
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{s.status}</span>
                  </div>
                  {canManagePersonnel && (
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => onEdit(s)}
                        className="p-2.5 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-xl hover:bg-primary hover:text-white transition-all"
                        aria-label={`Edit ${s.name}`}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(s.id)}
                        className="p-2.5 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                        aria-label={`Delete ${s.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'roster' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <form onSubmit={saveShift} className="lg:col-span-1 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Draft Shift</h3>
                  <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Schedule before publishing</p>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Staff</label>
                  <select
                    value={shiftDraft.staffId}
                    onChange={event => setShiftDraft({ ...shiftDraft, staffId: event.target.value })}
                    className="mt-2 w-full rounded-xl border-none bg-slate-50 px-4 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white"
                  >
                    {staff.filter(s => s.status !== 'inactive').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Date</label>
                    <input type="date" value={shiftDraft.shiftDate} onChange={event => setShiftDraft({ ...shiftDraft, shiftDate: event.target.value })} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Break</label>
                    <input type="number" min="0" value={shiftDraft.breakMinutesPlanned} onChange={event => setShiftDraft({ ...shiftDraft, breakMinutesPlanned: Number(event.target.value || 0) })} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Start</label>
                    <input type="time" value={shiftDraft.startTime} onChange={event => setShiftDraft({ ...shiftDraft, startTime: event.target.value })} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">End</label>
                    <input type="time" value={shiftDraft.endTime} onChange={event => setShiftDraft({ ...shiftDraft, endTime: event.target.value })} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes</label>
                  <input value={shiftDraft.notes} onChange={event => setShiftDraft({ ...shiftDraft, notes: event.target.value })} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-4 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" placeholder="Opening, close, floor, kitchen..." />
                </div>
                <button type="submit" disabled={workforceSaving || !shiftDraft.staffId} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">
                  {workforceSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                  Add Shift
                </button>
              </form>

              <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Roster start</label>
                      <input type="date" value={rosterStart} onChange={event => setRosterStart(event.target.value)} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Roster end</label>
                      <input type="date" value={rosterEnd} onChange={event => setRosterEnd(event.target.value)} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void refreshWorkforce()} disabled={workforceLoading} className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300">
                      {workforceLoading ? 'Loading' : 'Refresh'}
                    </button>
                    <button type="button" onClick={() => void publishRosterRange()} disabled={workforceSaving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
                      <Send className="h-4 w-4" />
                      Publish
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {shifts.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-400 dark:border-slate-700">
                      No shifts in this roster range.
                    </div>
                  )}
                  {[...shiftsByDate.entries()].map(([date, dayShifts]) => (
                    <div key={date} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                      <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">{date}</p>
                      <div className="space-y-2">
                        {dayShifts.map(shift => (
                          <div key={shift.id} className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-black text-slate-900 dark:text-white">{shift.staffName}</p>
                                <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                                  shift.status === 'published' ? 'bg-emerald-100 text-emerald-700' :
                                  shift.status === 'cancelled' ? 'bg-rose-100 text-rose-700' :
                                  shift.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                                  'bg-slate-200 text-slate-600'
                                }`}>{shift.status}</span>
                              </div>
                              <p className="mt-1 text-xs font-bold text-slate-500">{timeText(shift.startAt)} - {timeText(shift.endAt)} / break {shift.breakMinutesPlanned}m {shift.notes ? `/ ${shift.notes}` : ''}</p>
                            </div>
                            {shift.status !== 'cancelled' && shift.status !== 'completed' && (
                              <button type="button" onClick={() => void cancelShift(shift.id)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-600 dark:bg-slate-900">
                                <XCircle className="h-4 w-4" />
                                Cancel
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Period start</label>
                    <input type="date" value={payrollStart} onChange={event => setPayrollStart(event.target.value)} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Period end</label>
                    <input type="date" value={payrollEnd} onChange={event => setPayrollEnd(event.target.value)} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => timesheet && downloadCsv(timesheet.filename, timesheet.csv)}
                  disabled={!timesheet}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
                >
                  <FileDown className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>

            {timesheet && (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    ['Worked', minutesLabel(timesheet.summary.workedMinutes)],
                    ['Overtime', minutesLabel(timesheet.summary.overtimeMinutes)],
                    ['Breaks', minutesLabel(timesheet.summary.breakMinutes)],
                    ['Payroll', `R${timesheet.summary.payrollAmount.toFixed(2)}`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                      <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="mb-4 text-lg font-black text-slate-900 dark:text-white">Staff Totals</h3>
                  <div className="space-y-2">
                    {timesheet.staffTotals.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-400 dark:border-slate-700">No attendance records in this period.</div>
                    )}
                    {timesheet.staffTotals.map(total => (
                      <div key={total.staffId} className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold dark:bg-slate-800/60 md:grid-cols-6">
                        <span className="font-black text-slate-900 dark:text-white">{total.staffName}</span>
                        <span>{total.shiftCount} shifts</span>
                        <span>{minutesLabel(total.workedMinutes)} worked</span>
                        <span>{minutesLabel(total.overtimeMinutes)} overtime</span>
                        <span>{minutesLabel(total.breakMinutes)} breaks</span>
                        <span className="text-right text-slate-900 dark:text-white">R{total.payrollAmount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="mb-4 text-lg font-black text-slate-900 dark:text-white">Attendance Entries</h3>
                  <div className="space-y-2">
                    {timesheet.entries.slice(0, 40).map(entry => (
                      <div key={entry.id} className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold dark:bg-slate-800/60 md:grid-cols-7">
                        <span className="font-black text-slate-900 dark:text-white">{entry.staffName}</span>
                        <span>{String(entry.clockInAt).slice(0, 16).replace('T', ' ')}</span>
                        <span>{entry.clockOutAt ? String(entry.clockOutAt).slice(0, 16).replace('T', ' ') : 'Open'}</span>
                        <span>{minutesLabel(entry.workedMinutes)}</span>
                        <span>{minutesLabel(entry.breakMinutes)}</span>
                        <span>{minutesLabel(entry.overtimeMinutes)}</span>
                        <span className="text-right">R{entry.payrollAmount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Period start</label>
                    <input type="date" value={performanceStart} onChange={event => setPerformanceStart(event.target.value)} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Period end</label>
                    <input type="date" value={performanceEnd} onChange={event => setPerformanceEnd(event.target.value)} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void refreshPerformance()} disabled={performanceLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
                    {performanceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                    Refresh
                  </button>
                  <button type="button" onClick={() => performanceReport && downloadCsv(performanceReport.filename, performanceReport.csv)} disabled={!performanceReport} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">
                    <FileDown className="h-4 w-4" />
                    CSV
                  </button>
                </div>
              </div>
            </div>

            {performanceReport && (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    ['Sales', `${performanceReport.summary.completedSales} / R${performanceReport.summary.salesRevenue.toFixed(2)}`],
                    ['Exceptions', `${performanceReport.summary.refundCount} refunds / ${performanceReport.summary.voidCount} voids`],
                    ['Tables', `${performanceReport.summary.tableTurns} turns`],
                    ['Prep Items', String(performanceReport.summary.workstationItems)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                      <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">{value}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={saveCoachingNote} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Staff</label>
                      <select value={coachingDraft.staffId} onChange={event => setCoachingDraft({ ...coachingDraft, staffId: event.target.value })} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white">
                        {staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Type</label>
                      <select value={coachingDraft.noteType} onChange={event => setCoachingDraft({ ...coachingDraft, noteType: event.target.value as StaffCoachingNote['noteType'] })} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white">
                        <option value="coaching">Coaching</option>
                        <option value="recognition">Recognition</option>
                        <option value="warning">Warning</option>
                        <option value="follow_up">Follow-up</option>
                      </select>
                    </div>
                    <div className="lg:col-span-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Title</label>
                      <input value={coachingDraft.title} onChange={event => setCoachingDraft({ ...coachingDraft, title: event.target.value })} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Note</label>
                      <div className="mt-2 flex gap-2">
                        <input value={coachingDraft.note} onChange={event => setCoachingDraft({ ...coachingDraft, note: event.target.value })} className="min-w-0 flex-1 rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                        <button type="submit" disabled={performanceLoading || !coachingDraft.note.trim()} className="rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                </form>

                <div className="space-y-3">
                  {performanceReport.staffPerformance.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm font-bold text-slate-400 dark:border-slate-700">No staff performance rows in this period.</div>
                  )}
                  {performanceReport.staffPerformance.map(row => (
                    <div key={row.staffId} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white">{row.staffName}</h3>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-800">{row.role || 'staff'}</span>
                            {row.aiScore && <span className="rounded-full bg-indigo-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">AI {row.aiScore.grade} / {row.aiScore.score}</span>}
                          </div>
                          <p className="mt-1 text-xs font-bold text-slate-400">{row.exceptionInsights[0]?.detail || 'Performance evidence is ready for manager review.'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs font-black md:grid-cols-4">
                          <span className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">R{row.sales.revenue.toFixed(2)} sales</span>
                          <span className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">{row.exceptions.refundVoidRate.toFixed(1)}% exceptions</span>
                          <span className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">{row.tableTurnover.tableSaleCount} table turns</span>
                          <span className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">{secondsLabel(row.prepTime.averagePrepSeconds)} prep</span>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sales per staff</p>
                          <div className="mt-3 space-y-1 text-sm font-bold">
                            <p>{row.sales.completedCount} completed / avg R{row.sales.averageBasket.toFixed(2)}</p>
                            <p>Tips R{row.sales.tipAmount.toFixed(2)}</p>
                            <p>Open tabs {row.tableTurnover.openTabCount}</p>
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Exceptions</p>
                          <div className="mt-3 space-y-1 text-sm font-bold">
                            <p>{row.exceptions.refundCount} refunds / R{row.exceptions.refundAmount.toFixed(2)}</p>
                            <p>{row.exceptions.voidCount} voids / R{row.exceptions.voidAmount.toFixed(2)}</p>
                            <p>{row.exceptions.topReasons[0]?.reason || 'No reasons captured'}</p>
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tables and prep</p>
                          <div className="mt-3 space-y-1 text-sm font-bold">
                            <p>{row.tableTurnover.tableSaleCount} turns / {row.tableTurnover.averageDurationMinutes}m avg</p>
                            <p>{row.prepTime.itemCount} items / {secondsLabel(row.prepTime.averageTotalSeconds)} total</p>
                            <p>{row.prepTime.stalePrepCount} stale prep flags</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <div>
                          <h4 className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Staff exception insights</h4>
                          <div className="space-y-2">
                            {row.exceptionInsights.slice(0, 4).map((insight, index) => (
                              <div key={`${row.staffId}-insight-${index}`} className={`rounded-2xl px-3 py-2 text-xs font-bold ${
                                insight.severity === 'warning'
                                  ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                                  : insight.severity === 'success'
                                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                                  : 'bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200'
                              }`}>
                                <span className="font-black">{insight.title}</span> / {insight.detail}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Coaching history</h4>
                          <div className="space-y-2">
                            {row.coachingHistory.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-xs font-bold text-slate-400 dark:border-slate-700">No coaching notes yet.</div>}
                            {row.coachingHistory.slice(0, 4).map(note => (
                              <div key={note.id} className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold dark:bg-slate-800/60">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-black text-slate-900 dark:text-white">{note.title}</span>
                                  <span className="text-[10px] uppercase tracking-widest text-slate-400">{note.noteType}</span>
                                </div>
                                <p className="mt-1 text-slate-500 dark:text-slate-300">{note.note}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'tips' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <form onSubmit={saveTipRule} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Distribution Rule</h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">Sale-tip pool</p>
                  </div>
                  <button type="button" onClick={newTipRule} className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    New
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Saved rules</label>
                  <select
                    value={selectedTipRuleId}
                    onChange={event => setSelectedTipRuleId(event.target.value)}
                    className="mt-2 w-full rounded-xl border-none bg-slate-50 px-4 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">New rule</option>
                    {tipRules.map(rule => <option key={rule.id} value={rule.id}>{rule.name} / {rule.distributionMethod}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rule name</label>
                  <input
                    value={tipRuleDraft.name || ''}
                    onChange={event => setTipRuleDraft({ ...tipRuleDraft, name: event.target.value })}
                    className="mt-2 w-full rounded-xl border-none bg-slate-50 px-4 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Method</label>
                    <select
                      value={tipRuleDraft.distributionMethod || 'worked_hours'}
                      onChange={event => setTipRuleDraft({ ...tipRuleDraft, distributionMethod: event.target.value as TipPoolRule['distributionMethod'] })}
                      className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white"
                    >
                      <option value="worked_hours">Worked hours</option>
                      <option value="equal_shift">Equal per shift</option>
                      <option value="role_weighted">Role weighted</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Status</label>
                    <select
                      value={tipRuleDraft.status || 'active'}
                      onChange={event => setTipRuleDraft({ ...tipRuleDraft, status: event.target.value as TipPoolRule['status'] })}
                      className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Role weights</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['cashier', 'manager', 'chef', 'admin', 'dev'] as Staff['role'][]).map(role => (
                      <div key={role} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{role}</span>
                          <input
                            type="checkbox"
                            checked={(tipRuleDraft.includedRoles || []).length === 0 || (tipRuleDraft.includedRoles || []).includes(role)}
                            onChange={event => {
                              const current = tipRuleDraft.includedRoles || [];
                              const next = event.target.checked
                                ? [...new Set([...current, role])]
                                : current.length === 0
                                  ? (['cashier', 'manager', 'chef', 'admin', 'dev'] as Staff['role'][]).filter(item => item !== role)
                                  : current.filter(item => item !== role);
                              setTipRuleDraft({ ...tipRuleDraft, includedRoles: next.length === 5 ? [] : next });
                            }}
                            className="h-4 w-4 accent-primary"
                          />
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={tipRuleDraft.roleWeights?.[role] ?? 1}
                          onChange={event => updateTipRoleWeight(role, Number(event.target.value || 0))}
                          className="w-full rounded-lg border-none bg-white px-3 py-2 text-sm font-bold outline-none dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button type="submit" disabled={tipSaving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">
                  {tipSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  Save Rule
                </button>
              </form>

              <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tip period start</label>
                      <input type="date" value={tipStart} onChange={event => setTipStart(event.target.value)} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tip period end</label>
                      <input type="date" value={tipEnd} onChange={event => setTipEnd(event.target.value)} className="mt-2 w-full rounded-xl border-none bg-slate-50 px-3 py-3 text-sm font-bold outline-none dark:bg-slate-800 dark:text-white" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void previewTips()} disabled={tipLoading || !selectedTipRuleId} className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300">
                      {tipLoading ? 'Loading' : 'Preview'}
                    </button>
                    <button type="button" onClick={() => void generateTips()} disabled={tipLoading || !selectedTipRuleId} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
                      <Send className="h-4 w-4" />
                      Generate
                    </button>
                    <button type="button" onClick={() => tipReport && downloadCsv(tipReport.filename, tipReport.csv)} disabled={!tipReport} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">
                      <FileDown className="h-4 w-4" />
                      CSV
                    </button>
                  </div>
                </div>

                {tipReport ? (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      {[
                        ['Tips', `R${tipReport.summary.poolAmount.toFixed(2)}`],
                        ['Staff', String(tipReport.summary.participantCount)],
                        ['Shifts', String(tipReport.summary.shiftCount)],
                        ['Payouts', `R${tipReport.summary.payoutAmount.toFixed(2)}`],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                          <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div>
                      <h4 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-500">Staff payout totals</h4>
                      <div className="space-y-2">
                        {tipReport.staffTotals.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-400 dark:border-slate-700">
                            No closed shifts with tips in this period.
                          </div>
                        )}
                        {tipReport.staffTotals.map(total => (
                          <div key={total.staffId} className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold dark:bg-slate-800/60 md:grid-cols-5">
                            <span className="font-black text-slate-900 dark:text-white">{total.staffName}</span>
                            <span>{total.role}</span>
                            <span>{total.shiftCount} shifts</span>
                            <span>{minutesLabel(total.workedMinutes)}</span>
                            <span className="text-right text-slate-900 dark:text-white">R{total.payoutAmount.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-500">Per-shift payout summary</h4>
                      <div className="space-y-2">
                        {tipReport.entries.slice(0, 60).map(entry => (
                          <div key={`${entry.attendanceId}-${entry.staffId}`} className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold dark:bg-slate-800/60 md:grid-cols-7">
                            <span className="font-black text-slate-900 dark:text-white">{entry.staffName}</span>
                            <span>{entry.role}</span>
                            <span>{String(entry.shiftDate).slice(0, 10)}</span>
                            <span>{minutesLabel(entry.workedMinutes)}</span>
                            <span>{entry.weight.toFixed(2)} weight</span>
                            <span>{entry.status || 'preview'}</span>
                            <span className="text-right">R{entry.payoutAmount.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm font-bold text-slate-400 dark:border-slate-700">
                    Select a rule and preview the tip pool for a date range.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {staff.length === 0 && (
          <div className="p-20 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700/60">
            <UserCog className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No staff members assigned</p>
          </div>
        )}
      </div>
    </div>
  );
};
