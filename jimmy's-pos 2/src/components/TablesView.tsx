import React from 'react';
import { Sale } from '../types';
import { Utensils, Users } from 'lucide-react';

interface TablesViewProps {
  sales: Sale[];
  onSelectTable: (tableNumber: string, existingSale?: Sale) => void;
}

export function TablesView({ sales, onSelectTable }: TablesViewProps) {
  // We assume 20 tables for the restaurant
  const tables = Array.from({ length: 20 }, (_, i) => `T${i + 1}`);

  // Open tables are sales that have a tableNumber and status 'open' or 'kitchen'
  const activeTables = sales.filter(s => s.tableNumber && (s.status === 'open' || s.status === 'kitchen'));

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-[1200px] mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Tables</h2>
          <p className="text-slate-500 font-medium">Manage restaurant floor, open tables, and assign orders.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-6">
          {tables.map(table => {
            const activeSale = activeTables.find(s => s.tableNumber === table);
            const isOccupied = !!activeSale;

            return (
              <button
                key={table}
                onClick={() => onSelectTable(table, activeSale)}
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
                <h3 className={`text-2xl font-black tracking-tight mb-1 ${isOccupied ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                  {table}
                </h3>
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
                {isOccupied && activeSale && (
                  <div className="mt-4 pt-4 border-t border-white/20 flex justify-between items-center text-white">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">R{activeSale.total.toFixed(2)}</span>
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
    </div>
  );
}
