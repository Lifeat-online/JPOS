import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, CreditCard, Plus, Smartphone, TabletSmartphone, Utensils } from 'lucide-react';
import type { Customer, RestaurantTable, Sale, TableSection } from '../types';
import { getDate } from '../utils/date';

type HandheldIntent = 'order' | 'checkout';

interface HandheldViewProps {
  sales: Sale[];
  customers: Customer[];
  restaurantTables: RestaurantTable[];
  tableSections: TableSection[];
  onOpenTable: (tableId: string, sale: Sale | undefined, intent: HandheldIntent) => void;
  onResumeTab: (sale: Sale, intent: HandheldIntent) => void;
}

function formatElapsed(value: any) {
  if (!value) return '';
  const date = getDate(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function readyItemCount(sale?: Sale) {
  if (!sale) return 0;
  return sale.items.filter(item => (item as any).status === 'ready').length;
}

function itemCount(sale?: Sale) {
  if (!sale) return 0;
  return sale.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

export function HandheldView({ sales, customers, restaurantTables, tableSections, onOpenTable, onResumeTab }: HandheldViewProps) {
  const [activeSection, setActiveSection] = useState('all');
  const sectionsById = useMemo(() => new Map(tableSections.map(section => [section.id, section])), [tableSections]);
  const fallbackTables = useMemo<RestaurantTable[]>(() => Array.from({ length: 20 }, (_, index) => ({
    id: `T${index + 1}`,
    label: `T${index + 1}`,
    sectionId: 'default',
    status: 'active',
  })), []);
  const activeTables = useMemo(
    () => (restaurantTables.length > 0 ? restaurantTables : fallbackTables).filter(table => table.status !== 'inactive'),
    [restaurantTables, fallbackTables]
  );
  const visibleTables = useMemo(
    () => activeSection === 'all' ? activeTables : activeTables.filter(table => table.sectionId === activeSection),
    [activeSection, activeTables]
  );
  const activeTableSales = useMemo(
    () => sales.filter(sale => sale.tableNumber && (sale.status === 'open' || sale.status === 'kitchen')),
    [sales]
  );
  const activeTabs = useMemo(
    () => sales.filter(sale => sale.isTab && (sale.status === 'open' || sale.status === 'kitchen')),
    [sales]
  );
  const readyTables = activeTableSales.reduce((sum, sale) => sum + (readyItemCount(sale) > 0 ? 1 : 0), 0);
  const totalReadyItems = activeTableSales.reduce((sum, sale) => sum + readyItemCount(sale), 0);

  const customerName = (sale: Sale) => {
    const customer = sale.customerId ? customers.find(row => row.id === sale.customerId) : null;
    return customer?.name || sale.tabName || 'Walk-in';
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 dark:bg-[#0B1120] lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
              <Smartphone className="h-3.5 w-3.5" />
              Handheld service
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white">Tableside ordering</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Start a table order, add items, send to kitchen, or jump straight to mobile checkout.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xl font-black text-slate-900 dark:text-white">{activeTableSales.length}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Open tables</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">{totalReadyItems}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600/70 dark:text-emerald-300/70">Ready items</p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-center dark:border-indigo-900/40 dark:bg-indigo-950/20">
              <p className="text-xl font-black text-indigo-700 dark:text-indigo-300">{activeTabs.length}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600/70 dark:text-indigo-300/70">Open tabs</p>
            </div>
          </div>
        </div>

        {tableSections.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveSection('all')}
              className={`h-10 rounded-xl px-4 text-sm font-black ${activeSection === 'all' ? 'bg-primary text-white' : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}`}
            >
              All
            </button>
            {tableSections.map(section => (
              <button
                type="button"
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`h-10 rounded-xl px-4 text-sm font-black ${activeSection === section.id ? 'bg-primary text-white' : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}`}
              >
                {section.name}
              </button>
            ))}
          </div>
        )}

        <section aria-label="Handheld table actions" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleTables.map(table => {
            const sale = activeTableSales.find(row => row.tableNumber === table.id);
            const occupied = Boolean(sale);
            const readyCount = readyItemCount(sale);
            const sectionName = sectionsById.get(table.sectionId || '')?.name;
            return (
              <article
                key={table.id}
                className={`rounded-2xl border p-4 shadow-sm ${occupied ? 'border-primary/30 bg-white dark:border-primary/40 dark:bg-slate-900' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Utensils className={`h-5 w-5 ${occupied ? 'text-primary' : 'text-slate-400'}`} />
                      <h3 className="truncate text-lg font-black text-slate-900 dark:text-white">{table.label}</h3>
                    </div>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      {sectionName || 'Floor'}{table.capacity ? ` - ${table.capacity} seats` : ''}
                    </p>
                  </div>
                  {readyCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" />
                      {readyCount} ready
                    </span>
                  ) : (
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${occupied ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {occupied ? sale?.status : 'Available'}
                    </span>
                  )}
                </div>

                {sale ? (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-950/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-widest text-slate-400">{itemCount(sale)} items</span>
                      <span className="text-lg font-black text-slate-900 dark:text-white">R{Number(sale.total || 0).toFixed(2)}</span>
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500">
                      <Clock className="h-3.5 w-3.5" />
                      Open {formatElapsed(sale.createdAt) || 'now'}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-3 text-xs font-bold text-slate-400 dark:border-slate-800">
                    Ready for a new tableside order.
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-label={`${sale ? 'Add items to' : 'Start order for'} ${table.label}`}
                    onClick={() => onOpenTable(table.id, sale, 'order')}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-xs font-black uppercase tracking-widest text-white active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                    {sale ? 'Add' : 'Start'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Checkout ${table.label}`}
                    disabled={!sale}
                    onClick={() => onOpenTable(table.id, sale, 'checkout')}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 text-xs font-black uppercase tracking-widest text-white active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 dark:bg-white dark:text-slate-950 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                  >
                    <CreditCard className="h-4 w-4" />
                    Pay
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        <section aria-label="Handheld open tab actions" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TabletSmartphone className="h-5 w-5 text-indigo-500" />
              <h3 className="font-black text-slate-900 dark:text-white">Open tabs</h3>
            </div>
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{activeTabs.length} active</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {activeTabs.map(tab => (
              <div key={tab.id} className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900 dark:text-white">{customerName(tab)}</p>
                    <p className="text-xs font-bold text-indigo-600/80 dark:text-indigo-300/80">{itemCount(tab)} items - R{Number(tab.total || 0).toFixed(2)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      aria-label={`Add items to tab ${customerName(tab)}`}
                      onClick={() => onResumeTab(tab, 'order')}
                      className="h-10 rounded-xl bg-white px-3 text-xs font-black uppercase tracking-widest text-indigo-700 dark:bg-slate-900 dark:text-indigo-300"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      aria-label={`Checkout tab ${customerName(tab)}`}
                      onClick={() => onResumeTab(tab, 'checkout')}
                      className="h-10 rounded-xl bg-indigo-600 px-3 text-xs font-black uppercase tracking-widest text-white"
                    >
                      Pay
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {activeTabs.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm font-bold text-slate-400 dark:border-slate-800 md:col-span-2">
                No open tabs right now.
              </div>
            )}
          </div>
        </section>

        {readyTables > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
            {readyTables} table{readyTables === 1 ? '' : 's'} have ready items. Open the table to hand off or close it out.
          </div>
        )}
      </div>
    </div>
  );
}
