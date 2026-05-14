import React, { useState } from 'react';
import { Sale, Customer } from '../types';
import { TabletSmartphone, Users, Clock, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';

interface TabsViewProps {
  sales: Sale[];
  customers: Customer[];
  onResumeTab: (sale: Sale) => void;
}

export function TabsView({ sales, customers, onResumeTab }: TabsViewProps) {
  const [expandedTab, setExpandedTab] = useState<string | null>(null);

  const openTabs = sales
    .filter(s => s.isTab && (s.status === 'open' || s.status === 'kitchen'))
    .sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return ta - tb; // oldest first
    });

  const getCustomer = (customerId?: string) =>
    customerId ? customers.find(c => c.id === customerId) : null;

  const formatTime = (ts: any) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getElapsed = (ts: any) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <TabletSmartphone className="w-8 h-8 text-indigo-500" />
              Bar Tabs
            </h2>
            <p className="text-slate-500 font-medium mt-1">
              {openTabs.length} open tab{openTabs.length !== 1 ? 's' : ''}
            </p>
          </div>
          {openTabs.length > 0 && (
            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Total Outstanding</p>
              <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                R{openTabs.reduce((sum, t) => sum + Number(t.total), 0).toFixed(2)}
              </p>
            </div>
          )}
        </div>

        {openTabs.length === 0 ? (
          <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
            <TabletSmartphone className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-black text-slate-700 dark:text-slate-300 mb-2">No Open Tabs</h3>
            <p className="text-slate-400 font-medium max-w-sm mx-auto">
              Open a tab from the POS terminal by selecting a customer and tapping "Open Tab".
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {openTabs.map(tab => {
              const customer = getCustomer(tab.customerId);
              const isExpanded = expandedTab === tab.id;
              const elapsed = getElapsed(tab.createdAt);

              return (
                <div
                  key={tab.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-indigo-100 dark:border-indigo-900/40 shadow-sm overflow-hidden"
                >
                  {/* Tab header */}
                  <div className="flex items-center justify-between p-5">
                    <div className="flex items-center gap-4">
                      {/* Customer avatar */}
                      <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center font-black text-lg">
                        {(customer?.name || tab.tabName || 'T').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-slate-900 dark:text-white">
                            {tab.tabName || customer?.name || 'Unknown'}
                          </h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                            Tab
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Opened {formatTime(tab.createdAt)} · {elapsed} ago
                          </span>
                          <span className="text-xs text-slate-400">
                            {tab.items.length} item{tab.items.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-2xl font-black text-slate-900 dark:text-white">
                          R{Number(tab.total).toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => setExpandedTab(isExpanded ? null : tab.id)}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded items */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4 bg-slate-50/50 dark:bg-slate-800/30">
                      <div className="space-y-2 mb-4">
                        {tab.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-slate-600 dark:text-slate-400">
                              {item.quantity}× {item.name}
                            </span>
                            <span className="font-bold text-slate-800 dark:text-white">
                              R{(Number(item.price) * Number(item.quantity)).toFixed(2)}
                            </span>
                          </div>
                        ))}
                        <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between font-black text-slate-900 dark:text-white">
                          <span>Total</span>
                          <span>R{Number(tab.total).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="px-5 pb-5 flex gap-3">
                    <button
                      onClick={() => onResumeTab(tab)}
                      className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Add Items / Close Tab
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
