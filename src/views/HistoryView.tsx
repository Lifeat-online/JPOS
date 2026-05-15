import React, { useMemo } from 'react';
import { Search, Users } from 'lucide-react';
import { Sale, Customer } from '../types';
import { getDate } from '../utils/date';

interface HistoryViewProps {
  sales: Sale[];
  customers: Customer[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterCustomerId: string | null;
  setFilterCustomerId: (id: string | null) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  sales, customers, searchQuery, setSearchQuery, filterCustomerId, setFilterCustomerId
}) => {
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const matchesSearch = s.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            s.total.toString().includes(searchQuery) ||
                            (s.customerId && customers.find(c => c.id === s.customerId)?.name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCustomer = filterCustomerId ? s.customerId === filterCustomerId : true;
      return matchesSearch && matchesCustomer;
    });
  }, [sales, searchQuery, filterCustomerId, customers]);

  return (
    <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-4 lg:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h2 className="text-xl lg:text-2xl font-black tracking-tight text-slate-900 dark:text-white">Transaction History</h2>
            {filterCustomerId && (
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-bold border border-primary/20">
                <Users className="w-3 h-3" />
                Profile: {customers.find(c => c.id === filterCustomerId)?.name || 'Unknown'}
                <button onClick={() => setFilterCustomerId(null)} className="ml-1 hover:text-red-500 font-extrabold">×</button>
              </div>
            )}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search transactions..."
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-xs font-medium shadow-sm min-h-[44px]"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (filterCustomerId) setFilterCustomerId(null);
              }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-slate-50 dark:bg-[#0B1120] border-b border-slate-200 dark:border-slate-700/60">
                <tr>
                  <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Order ID</th>
                  <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Customer</th>
                  <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Timestamp</th>
                  <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Method</th>
                  <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Amount</th>
                  <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSales.map(sale => (
                  <tr key={sale.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4 font-mono text-[10px] text-slate-400 dark:text-slate-500">#{sale.id.slice(-8)}</td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-300">
                      {sale.customerId ? customers.find(c => c.id === sale.customerId)?.name || 'Deleted' : 'Guest'}
                    </td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">
                        {(() => {
                          const raw = sale.createdAt;
                          const d = getDate(raw || Date.now());
                          return !isNaN(d.getTime()) 
                            ? d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                            : `Invalid: ${String(raw)}`;
                        })()}
                      </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">{sale.paymentMethod}</span>
                        {sale.payments && sale.payments.length > 1 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[8px] font-black uppercase tracking-tighter w-fit">
                            Split ({sale.payments.length})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-extrabold text-slate-900 dark:text-white">R{Number(sale.total || 0).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        sale.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {sale.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredSales.length === 0 && (
            <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm font-black uppercase tracking-widest opacity-50">No transactions</div>
          )}
        </div>
      </div>
    </div>
  );
};
