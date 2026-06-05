import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, Clock, CreditCard, RefreshCw, Save, Trash2, Users, Utensils } from 'lucide-react';
import { createEventBooking, deleteEventBooking, getEventBookings, updateEventBooking } from '../api';
import { Customer, EventBooking, RestaurantTable } from '../types';

type Draft = {
  title: string;
  customerId: string;
  contactPhone: string;
  contactEmail: string;
  eventType: EventBooking['eventType'];
  status: EventBooking['status'];
  startAt: string;
  endAt: string;
  guestCount: number;
  tableIds: string[];
  tableNumbers: string;
  depositAmount: number;
  depositStatus: EventBooking['depositStatus'];
  depositDueAt: string;
  depositPaidAt: string;
  depositReference: string;
  menuNotes: string;
  internalNotes: string;
  reminderAt: string;
  reminderStatus: NonNullable<EventBooking['reminderStatus']>;
  reminderSentAt: string;
  reminderNote: string;
};

const emptyDraft = (): Draft => ({
  title: '',
  customerId: '',
  contactPhone: '',
  contactEmail: '',
  eventType: 'restaurant',
  status: 'inquiry',
  startAt: new Date().toISOString().slice(0, 16),
  endAt: '',
  guestCount: 0,
  tableIds: [],
  tableNumbers: '',
  depositAmount: 0,
  depositStatus: 'none',
  depositDueAt: '',
  depositPaidAt: '',
  depositReference: '',
  menuNotes: '',
  internalNotes: '',
  reminderAt: '',
  reminderStatus: 'none',
  reminderSentAt: '',
  reminderNote: '',
});

function dateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function monthBounds(month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
}

function money(value: unknown) {
  const parsed = Number(value);
  return `R${Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00'}`;
}

function splitLabels(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function toDateInput(value: any) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 16) : date.toISOString().slice(0, 16);
}

function statusClass(status: EventBooking['status']) {
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'cancelled') return 'bg-red-50 text-red-700 border-red-100';
  if (status === 'completed') return 'bg-slate-100 text-slate-600 border-slate-200';
  if (status === 'in_progress') return 'bg-blue-50 text-blue-700 border-blue-100';
  return 'bg-amber-50 text-amber-700 border-amber-100';
}

export function EventBookingsView({ tenantId, customers, restaurantTables }: { tenantId: string; customers: Customer[]; restaurantTables: RestaurantTable[] }) {
  const [bookings, setBookings] = useState<EventBooking[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const customerById = useMemo(() => new Map(customers.map(customer => [customer.id, customer])), [customers]);
  const activeTables = useMemo(() => restaurantTables.filter(table => table.status !== 'inactive'), [restaurantTables]);
  const tableById = useMemo(() => new Map(restaurantTables.map(table => [table.id, table])), [restaurantTables]);
  const byDate = useMemo(() => bookings.reduce((acc, booking) => {
    const key = dateKey(booking.startAt);
    acc[key] = [...(acc[key] || []), booking];
    return acc;
  }, {} as Record<string, EventBooking[]>), [bookings]);
  const selectedBookings = byDate[selectedDate] || [];
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);
  const pendingReminders = bookings.filter(item => item.reminderStatus === 'pending' && item.reminderAt).length;
  const unpaidDeposits = bookings.filter(item => item.depositStatus === 'unpaid' && Number(item.depositAmount || 0) > 0).length;

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setMessage(null);
    try {
      const { start, end } = monthBounds(month);
      setBookings(await getEventBookings(tenantId, {
        from: start.toISOString(),
        to: end.toISOString(),
      }));
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load bookings.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tenantId, month]);

  const selectCustomer = (customerId: string) => {
    const customer = customerById.get(customerId);
    setDraft(current => ({
      ...current,
      customerId,
      contactPhone: customer?.phone || current.contactPhone,
      contactEmail: customer?.email || current.contactEmail,
    }));
  };

  const edit = (booking: EventBooking) => {
    setEditingId(booking.id);
    setSelectedDate(dateKey(booking.startAt));
    setDraft({
      title: booking.title,
      customerId: booking.customerId || '',
      contactPhone: booking.contactPhone || '',
      contactEmail: booking.contactEmail || '',
      eventType: booking.eventType,
      status: booking.status,
      startAt: new Date(booking.startAt).toISOString().slice(0, 16),
      endAt: booking.endAt ? new Date(booking.endAt).toISOString().slice(0, 16) : '',
      guestCount: Number(booking.guestCount || 0),
      tableIds: booking.tableIds || [],
      tableNumbers: (booking.tableNumbers || []).join(', '),
      depositAmount: Number(booking.depositAmount || 0),
      depositStatus: booking.depositStatus,
      depositDueAt: toDateInput(booking.depositDueAt),
      depositPaidAt: toDateInput(booking.depositPaidAt),
      depositReference: booking.depositReference || '',
      menuNotes: booking.menuNotes || '',
      internalNotes: booking.internalNotes || '',
      reminderAt: toDateInput(booking.reminderAt),
      reminderStatus: booking.reminderStatus || 'none',
      reminderSentAt: toDateInput(booking.reminderSentAt),
      reminderNote: booking.reminderNote || '',
    });
  };

  const reset = () => {
    setEditingId(null);
    setDraft({ ...emptyDraft(), startAt: `${selectedDate}T12:00` });
  };

  const toggleTable = (tableId: string) => {
    setDraft(current => {
      const exists = current.tableIds.includes(tableId);
      return {
        ...current,
        tableIds: exists ? current.tableIds.filter(id => id !== tableId) : [...current.tableIds, tableId],
      };
    });
  };

  const save = async () => {
    if (!tenantId) return;
    if (!draft.title.trim()) {
      setMessage({ tone: 'error', text: 'Add an event title.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const customer = customerById.get(draft.customerId);
      const selectedTableLabels = draft.tableIds
        .map(tableId => tableById.get(tableId)?.label || tableId)
        .filter(Boolean);
      const payload: Partial<EventBooking> = {
        ...draft,
        customerId: draft.customerId || null,
        customerName: customer?.name || null,
        startAt: draft.startAt,
        endAt: draft.endAt || null,
        tableIds: draft.tableIds,
        tableNumbers: Array.from(new Set([...selectedTableLabels, ...splitLabels(draft.tableNumbers)])),
        depositDueAt: draft.depositDueAt || null,
        depositPaidAt: draft.depositPaidAt || null,
        depositReference: draft.depositReference || null,
        reminderAt: draft.reminderAt || null,
        reminderStatus: draft.reminderAt && draft.reminderStatus === 'none' ? 'pending' : draft.reminderStatus,
        reminderSentAt: draft.reminderSentAt || null,
        reminderNote: draft.reminderNote || null,
      };
      if (editingId) {
        await updateEventBooking(tenantId, editingId, payload);
        setMessage({ tone: 'success', text: 'Booking updated.' });
      } else {
        await createEventBooking(tenantId, payload);
        setMessage({ tone: 'success', text: 'Booking created.' });
      }
      reset();
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save booking.' });
    } finally {
      setLoading(false);
    }
  };

  const remove = async (booking: EventBooking) => {
    if (!tenantId) return;
    setLoading(true);
    setMessage(null);
    try {
      await deleteEventBooking(tenantId, booking.id);
      setMessage({ tone: 'success', text: 'Booking deleted.' });
      if (editingId === booking.id) reset();
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not delete booking.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 dark:bg-[#0B1120] lg:p-10">
      <div className="mx-auto grid max-w-[1600px] gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                <CalendarDays className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-black">Bookings</h1>
              </div>
              <div className="mt-3 grid gap-2 text-sm font-bold text-slate-500 sm:grid-cols-5">
                <span>{bookings.length} this month</span>
                <span>{bookings.filter(item => item.status === 'confirmed').length} confirmed</span>
                <span>{bookings.reduce((sum, item) => sum + Number(item.guestCount || 0), 0)} guests</span>
                <span>{unpaidDeposits} unpaid deposits</span>
                <span>{pendingReminders} reminders</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">Prev</button>
              <button type="button" onClick={() => setMonth(new Date())} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">Today</button>
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">Next</button>
              <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {message && (
            <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${message.tone === 'success' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-red-100 bg-red-50 text-red-700'}`}>
              {message.text}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 text-lg font-black text-slate-900 dark:text-white">
              {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </div>
            <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day}>{day}</div>)}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {days.map(day => {
                const key = dateKey(day);
                const count = (byDate[key] || []).length;
                const isCurrentMonth = day.getMonth() === month.getMonth();
                const selected = key === selectedDate;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedDate(key);
                      if (!editingId) setDraft(current => ({ ...current, startAt: `${key}T12:00` }));
                    }}
                    className={`min-h-24 rounded-xl border p-2 text-left transition ${selected ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-slate-100 bg-slate-50 hover:border-slate-200 dark:border-slate-800 dark:bg-slate-950'} ${isCurrentMonth ? '' : 'opacity-40'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900 dark:text-white">{day.getDate()}</span>
                      {count > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-black text-white">{count}</span>}
                    </div>
                    {(byDate[key] || []).slice(0, 2).map(booking => (
                      <div key={booking.id} className="mt-2 truncate rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                        {booking.title}
                      </div>
                    ))}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-black text-slate-900 dark:border-slate-800 dark:text-white">
              {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            {selectedBookings.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm font-bold text-slate-500">No bookings for this date.</div>
            ) : selectedBookings.map(booking => (
              <div key={booking.id} className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-slate-900 dark:text-white">{booking.title}</span>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${statusClass(booking.status)}`}>{booking.status.replace('_', ' ')}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs font-bold text-slate-500">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{new Date(booking.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{booking.guestCount} guests</span>
                    {(booking.tableNumbers || []).length > 0 && <span className="inline-flex items-center gap-1"><Utensils className="h-3.5 w-3.5" />{booking.tableNumbers.join(', ')}</span>}
                    <span>{booking.customerName || booking.contactPhone || 'No contact'}</span>
                    <span className="inline-flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" />{money(booking.depositAmount)} {booking.depositStatus}</span>
                    {booking.reminderAt && <span className="inline-flex items-center gap-1"><Bell className="h-3.5 w-3.5" />{new Date(booking.reminderAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} {booking.reminderStatus}</span>}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => edit(booking)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">Edit</button>
                  <button type="button" onClick={() => remove(booking)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 text-red-500 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900 dark:text-white">{editingId ? 'Edit Booking' : 'New Booking'}</h2>
            {editingId && <button type="button" onClick={reset} className="text-xs font-black uppercase tracking-widest text-primary">New</button>}
          </div>
          <div className="space-y-3">
            <input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="Event title" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            <select value={draft.customerId} onChange={event => selectCustomer(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
              <option value="">No customer</option>
              {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
            <div className="grid gap-3 md:grid-cols-2">
              <input value={draft.contactPhone} onChange={event => setDraft(current => ({ ...current, contactPhone: event.target.value }))} placeholder="Phone" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <input value={draft.contactEmail} onChange={event => setDraft(current => ({ ...current, contactEmail: event.target.value }))} placeholder="Email" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <select value={draft.eventType} onChange={event => setDraft(current => ({ ...current, eventType: event.target.value as EventBooking['eventType'] }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                <option value="private">Private</option>
                <option value="public">Public</option>
                <option value="restaurant">Restaurant</option>
                <option value="catering">Catering</option>
                <option value="other">Other</option>
              </select>
              <select value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value as EventBooking['status'] }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                <option value="inquiry">Inquiry</option>
                <option value="confirmed">Confirmed</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input type="datetime-local" value={draft.startAt} onChange={event => setDraft(current => ({ ...current, startAt: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <input type="datetime-local" value={draft.endAt} onChange={event => setDraft(current => ({ ...current, endAt: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            </div>
            <input type="number" min={0} value={draft.guestCount} onChange={event => setDraft(current => ({ ...current, guestCount: Math.max(0, Number(event.target.value) || 0) }))} placeholder="Guests" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
                <Utensils className="h-4 w-4" />
                <span>Tables</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {activeTables.map(table => {
                  const selected = draft.tableIds.includes(table.id);
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => toggleTable(table.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs font-black transition ${selected ? 'border-primary bg-primary text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}
                    >
                      <span className="block truncate">{table.label}</span>
                      <span className="block text-[10px] opacity-70">{table.capacity || 0} seats</span>
                    </button>
                  );
                })}
                {activeTables.length === 0 && (
                  <div className="col-span-full rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs font-bold text-slate-400 dark:border-slate-700">
                    No active tables configured.
                  </div>
                )}
              </div>
            </div>
            <input value={draft.tableNumbers} onChange={event => setDraft(current => ({ ...current, tableNumbers: event.target.value }))} placeholder="Additional areas or labels" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.depositAmount}
                onChange={event => setDraft(current => {
                  const depositAmount = Math.max(0, Number(event.target.value) || 0);
                  return {
                    ...current,
                    depositAmount,
                    depositStatus: depositAmount > 0 && current.depositStatus === 'none' ? 'unpaid' : current.depositStatus,
                  };
                })}
                placeholder="Deposit"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <select value={draft.depositStatus} onChange={event => setDraft(current => ({ ...current, depositStatus: event.target.value as EventBooking['depositStatus'] }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                <option value="none">No deposit</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <input type="datetime-local" value={draft.depositDueAt} onChange={event => setDraft(current => ({ ...current, depositDueAt: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <input type="datetime-local" value={draft.depositPaidAt} onChange={event => setDraft(current => ({ ...current, depositPaidAt: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <input value={draft.depositReference} onChange={event => setDraft(current => ({ ...current, depositReference: event.target.value }))} placeholder="Deposit reference" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <input
                type="datetime-local"
                value={draft.reminderAt}
                onChange={event => setDraft(current => ({
                  ...current,
                  reminderAt: event.target.value,
                  reminderStatus: event.target.value && current.reminderStatus === 'none' ? 'pending' : current.reminderStatus,
                }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <select value={draft.reminderStatus} onChange={event => setDraft(current => ({ ...current, reminderStatus: event.target.value as Draft['reminderStatus'] }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                <option value="none">No reminder</option>
                <option value="pending">Pending</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="skipped">Skipped</option>
              </select>
              <input type="datetime-local" value={draft.reminderSentAt} onChange={event => setDraft(current => ({ ...current, reminderSentAt: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            </div>
            <input value={draft.reminderNote} onChange={event => setDraft(current => ({ ...current, reminderNote: event.target.value }))} placeholder="Reminder note" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            <textarea value={draft.menuNotes} onChange={event => setDraft(current => ({ ...current, menuNotes: event.target.value }))} placeholder="Menu notes" rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            <textarea value={draft.internalNotes} onChange={event => setDraft(current => ({ ...current, internalNotes: event.target.value }))} placeholder="Internal notes" rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            <button type="button" onClick={save} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50">
              <Save className="h-4 w-4" />
              {editingId ? 'Save Booking' : 'Create Booking'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
