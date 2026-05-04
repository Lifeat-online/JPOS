import React from 'react';
import { UserPlus, Edit, TabletSmartphone } from 'lucide-react';
import { Customer, Sale } from '../types';

interface CustomersViewProps {
  customers: Customer[];
  sales: Sale[];
  onEdit: (customer: Customer) => void;
  onAdd: () => void;
  onViewOrders: (customerId: string) => void;
  onResumeTab: (sale: Sale) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers, sales, onEdit, onAdd, onViewOrders, onResumeTab,
}) => {
  const getOpenTab = (customerId: string) =>
    sales.find(s => s.customerId === customerId && s.isTab && s.status === 'open');
  return (
    <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl lg:text-2xl font-black tracking-tight text-slate-900 dark:text-white">Customer Intelligence</h2>
          <button
            onClick={onAdd}
            className="w-full sm:w-auto px-6 py-3.5 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary/20 active:scale-95 transition-all text-sm"
          >
            <UserPlus className="w-5 h-5" />
            New Customer
          </button>
        </div>

        {customers.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800/60 shadow-sm flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <UserPlus className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Add Your First Customer</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium max-w-xs mx-auto">
                Build your database to track purchases and offer personalized service.
              </p>
            </div>
            <button
              onClick={onAdd}
              className="px-8 py-3 bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"
            >
              Launch Creator
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map(c => {
            const openTab = getOpenTab(c.id);
            return (
              <div
                key={c.id}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 lg:p-6 shadow-sm flex flex-col gap-4 transition-all ${
                  openTab
                    ? 'border-indigo-200 dark:border-indigo-800/50 ring-2 ring-indigo-100 dark:ring-indigo-900/30'
                    : 'border-slate-200 dark:border-slate-700/60 hover:border-primary/20'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-12 h-12 bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 rounded-2xl flex items-center justify-center font-black uppercase text-lg shadow-lg">
                        {c.name.charAt(0)}
                      </div>
                      {openTab && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full border-2 border-white dark:border-slate-900" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 dark:text-white truncate">{c.name}</h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest truncate">{c.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onEdit(c)}
                    className="p-2.5 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 hover:text-primary rounded-xl transition-all"
                    aria-label={`Edit ${c.name}`}
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>

                {/* Open tab indicator */}
                {openTab && (
                  <button
                    onClick={() => onResumeTab(openTab)}
                    className="flex items-center justify-between px-3 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/40 active:scale-95 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <TabletSmartphone className="w-4 h-4 text-indigo-500" />
                      <span className="text-xs font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">Open Tab</span>
                    </div>
                    <span className="font-black text-indigo-700 dark:text-indigo-400 text-sm">R{openTab.total.toFixed(2)}</span>
                  </button>
                )}

                <div className="pt-2 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-400 dark:text-slate-500">
                    {(c.loyaltyPoints || c.points || 0)} pts
                  </div>
                  <button
                    onClick={() => onViewOrders(c.id)}
                    className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                  >
                    View Orders
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
