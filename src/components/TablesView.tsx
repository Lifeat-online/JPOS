import React, { useState, useEffect } from 'react';
import { Sale, OrderItem, RestaurantTable, TableSection } from '../types';
import { Utensils, Users, CheckCircle2, X, Plus } from 'lucide-react';
import { apiPut } from '../api';
import { usePosStore } from '../store/usePosStore';

interface TablesViewProps {
  sales: Sale[];
  tableSections: TableSection[];
  restaurantTables: RestaurantTable[];
  onSelectTable: (tableNumber: string, existingSale?: Sale) => void;
}

export function TablesView({ sales, tableSections, restaurantTables, onSelectTable }: TablesViewProps) {
  const tenantId = usePosStore(s => s.tenantId);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('all');

  // Fall back to 20 hardcoded tables if none configured
  const useFallback = restaurantTables.length === 0;
  const fallbackTables: RestaurantTable[] = Array.from({ length: 20 }, (_, i) => ({
    id: `T${i + 1}`, label: `T${i + 1}`, sectionId: 'default', status: 'active',
  }));

  const allTables = useFallback ? fallbackTables : restaurantTables.filter(t => t.status === 'active');
  const displayTables = activeSection === 'all' ? allTables : allTables.filter(t => t.sectionId === activeSection);

  const activeSales = sales.filter(s => s.tableNumber && (s.status === 'open' || s.status === 'kitchen'));

  // Count ready items across all active sales for a table
  const getReadyCount = (tableId: string) => {
    return activeSales
      .filter(s => s.tableNumber === tableId)
      .reduce((count, s) => {
        return count + s.items.filter(item => (item as OrderItem).status === 'ready').length;
      }, 0);
  };

  const markItemsDelivered = async (sale: Sale) => {
    if (!tenantId) return;
    const readyItems = sale.items.filter(item => (item as OrderItem).status === 'ready');
    
    // In MariaDB REST, we update items individually or via a bulk endpoint if we had one.
    // For now, we'll use the individual item update endpoint in a loop or implement a bulk one.
    // Let's use the individual one since we added it to server.ts.
    for (const item of readyItems) {
      const o = item as OrderItem;
      await apiPut(`/api/mariadb/tenants/${tenantId}/sales/${sale.id}/items/${o.id}`, {
        status: 'delivered',
        deliveredAt: new Date().toISOString()
      });
    }
  };

  const selectedSale = selectedTable
    ? activeSales.find(s => s.tableNumber === selectedTable)
    : null;

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-[1200px] mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Tables</h2>
          <p className="text-slate-500 font-medium">Manage restaurant floor, open tables, and assign orders.</p>
        </div>

        {/* Section filter tabs */}
        {!useFallback && tableSections.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveSection('all')}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeSection === 'all' ? 'bg-primary text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-primary/50'}`}
            >
              All ({allTables.length})
            </button>
            {tableSections.map(s => {
              const count = allTables.filter(t => t.sectionId === s.id).length;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeSection === s.id ? 'bg-primary text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-primary/50'}`}
                >
                  {s.name} ({count})
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-6">
          {displayTables.map(table => {
            const activeSale = activeSales.find(s => s.tableNumber === table.id);
            const isOccupied = !!activeSale;
            const readyCount = getReadyCount(table.id);

            return (
              <button
                key={table.id}
                onClick={() => {
                  if (isOccupied) {
                    setSelectedTable(table.id);
                  } else {
                    onSelectTable(table.id, undefined);
                  }
                }}
                className={`relative p-6 rounded-3xl border text-center transition-all shadow-sm group ${
                  isOccupied
                    ? 'bg-primary border-primary/20 hover:bg-primary/90'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-primary/50'
                }`}
              >
                <div className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${
                  isOccupied ? 'bg-white/20 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                }`}>
                  <Utensils className="w-6 h-6" />
                </div>
                <h3 className={`text-xl font-black tracking-tight mb-1 ${isOccupied ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                  {table.label}
                </h3>
                {table.capacity && (
                  <p className={`text-[10px] font-bold mb-1 ${isOccupied ? 'text-white/60' : 'text-slate-400'}`}>
                    {table.capacity} seats
                  </p>
                )}
                <div className={`flex items-center justify-center gap-1.5 text-xs font-bold ${isOccupied ? 'text-white/80' : 'text-slate-400'}`}>
                  {isOccupied ? (
                    <>
                      <Users className="w-3.5 h-3.5" /> Occupied
                      <div className="absolute top-3 right-3 w-3 h-3 bg-emerald-400 rounded-full border-2 border-primary animate-pulse" />
                    </>
                  ) : (
                    'Available'
                  )}
                </div>

                {/* Ready items badge */}
                {readyCount > 0 && (
                  <div className="absolute -top-2 -left-2 w-7 h-7 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-black shadow-lg shadow-emerald-500/40 animate-bounce">
                    {readyCount}
                  </div>
                )}

                {isOccupied && activeSale && (
                  <div className="mt-4 pt-4 border-t border-white/20 flex justify-between items-center text-white">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">R{Number(activeSale.total || 0).toFixed(2)}</span>
                    <span className="text-[10px] font-bold uppercase py-0.5 px-2 bg-white/20 rounded-md">
                      {activeSale.status}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table detail panel */}
      {selectedTable && selectedSale && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="bg-primary px-6 py-5 flex justify-between items-center text-white shrink-0">
              <div>
                <h3 className="text-2xl font-black">Table {selectedTable}</h3>
                <p className="text-white/70 text-sm font-medium">R{Number(selectedSale.total || 0).toFixed(2)} · {selectedSale.status}</p>
              </div>
              <button onClick={() => setSelectedTable(null)} className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {selectedSale.items.map((item, idx) => {
                const o = item as OrderItem;
                const statusColor = {
                  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                  accepted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                  ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                  delivered: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                }[o.status || 'pending'] || 'bg-slate-100 text-slate-500';

                return (
                  <div key={idx} className={`flex items-center justify-between p-3 rounded-2xl border ${
                    o.status === 'delivered'
                      ? 'border-slate-100 dark:border-slate-800 opacity-50'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 font-black flex items-center justify-center text-sm text-slate-700 dark:text-slate-300">
                        {item.quantity}
                      </div>
                      <span className={`font-bold text-sm ${o.status === 'delivered' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {item.name}
                      </span>
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${statusColor}`}>
                      {o.status || 'pending'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 space-y-3 shrink-0">
              {/* Mark ready items as delivered */}
              {selectedSale.items.some(i => (i as OrderItem).status === 'ready') && (
                <button
                  onClick={async () => {
                    await markItemsDelivered(selectedSale);
                  }}
                  className="w-full py-3.5 bg-emerald-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Mark Ready Items as Delivered
                </button>
              )}

              {/* Go to POS for this table */}
              <button
                onClick={() => {
                  setSelectedTable(null);
                  onSelectTable(selectedTable, selectedSale);
                }}
                className="w-full py-3.5 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <Utensils className="w-5 h-5" />
                Open Order / Checkout
              </button>

              <button
                onClick={() => setSelectedTable(null)}
                className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-bold text-sm active:scale-95 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
