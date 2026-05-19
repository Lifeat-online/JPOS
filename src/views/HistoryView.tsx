import React, { useEffect, useMemo, useState } from 'react';
import { Clock, CreditCard, Hash, Package, Printer, ReceiptText, Search, User, Users, X } from 'lucide-react';
import { AppConfig, Sale, Customer } from '../types';
import { getDate } from '../utils/date';
import { Receipt } from '../components/Receipt';

interface HistoryViewProps {
  sales: Sale[];
  customers: Customer[];
  config: AppConfig | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterCustomerId: string | null;
  setFilterCustomerId: (id: string | null) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  sales, customers, config, searchQuery, setSearchQuery, filterCustomerId, setFilterCustomerId
}) => {
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const matchesSearch = s.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            s.total.toString().includes(searchQuery) ||
                            (s.customerId && customers.find(c => c.id === s.customerId)?.name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCustomer = filterCustomerId ? s.customerId === filterCustomerId : true;
      return matchesSearch && matchesCustomer;
    });
  }, [sales, searchQuery, filterCustomerId, customers]);

  const currency = config?.business?.currency || 'R';
  const selectedCustomer = selectedSale?.customerId
    ? customers.find(c => c.id === selectedSale.customerId)
    : null;
  const selectedDate = selectedSale ? getDate(selectedSale.createdAt) : null;
  const selectedDateText = selectedDate && !isNaN(selectedDate.getTime())
    ? selectedDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Unknown';
  const selectedSubtotal = selectedSale?.subtotal ?? selectedSale?.total ?? 0;
  const selectedTax = selectedSale?.taxAmount ?? 0;

  const printSelectedReceipt = () => {
    if (!selectedSale) return;
    window.print();
  };

  useEffect(() => {
    if (!selectedSale) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedSale(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSale]);

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
                <button onClick={() => setFilterCustomerId(null)} className="ml-1 hover:text-red-500 font-extrabold">x</button>
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
                  <tr
                    key={sale.id}
                    tabIndex={0}
                    onClick={() => setSelectedSale(sale)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedSale(sale);
                      }
                    }}
                    className="group cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/60 focus:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/30"
                    aria-label={`View order ${sale.id.slice(-8)} details`}
                  >
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
                      <span className="ml-2 text-[10px] font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100">View</span>
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

      {selectedSale && (
        <>
          <Receipt sale={selectedSale} config={config} />
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/55 p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-order-details-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedSale(null);
            }}
          >
            <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                    <ReceiptText className="h-4 w-4" />
                    Order details
                  </div>
                  <h3 id="history-order-details-title" className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                    #{selectedSale.id.slice(-8).toUpperCase()}
                  </h3>
                </div>
                <div className="flex w-full sm:w-auto items-center gap-2">
                  <button
                    type="button"
                    onClick={printSelectedReceipt}
                    className="inline-flex min-h-[40px] flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-primary/90"
                  >
                    <Printer className="h-4 w-4" />
                    Reprint receipt
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSale(null)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900"
                    aria-label="Close order details"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(92vh-81px)] overflow-y-auto p-5 space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Customer', value: selectedCustomer?.name || 'Guest', icon: User },
                    { label: 'Timestamp', value: selectedDateText, icon: Clock },
                    { label: 'Payment', value: selectedSale.paymentMethod.toUpperCase(), icon: CreditCard },
                    { label: 'Status', value: selectedSale.status.toUpperCase(), icon: Hash },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </div>
                      <div className="mt-2 text-sm font-black text-slate-800 dark:text-slate-100">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <Package className="h-4 w-4" />
                    Items
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedSale.items.map((item, index) => (
                      <div key={`${item.id}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
                        <div>
                          <div className="text-sm font-black text-slate-800 dark:text-slate-100">{item.name}</div>
                          {'selectedModifiers' in item && item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <div className="mt-1 text-[11px] font-semibold text-slate-500">
                              {item.selectedModifiers.map(mod => mod.name).join(', ')}
                            </div>
                          )}
                          {'status' in item && item.status && (
                            <span className="mt-2 inline-flex rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
                              {item.status}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-500">Qty {item.quantity}</div>
                          <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                            {currency}{(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedSale.payments && selectedSale.payments.length > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Payments
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedSale.payments.map(payment => (
                        <div key={payment.id} className="flex items-center justify-between px-4 py-3 text-sm">
                          <span className="font-black uppercase text-slate-600 dark:text-slate-300">{payment.method}</span>
                          <span className="font-black text-slate-900 dark:text-white">{currency}{Number(payment.amount || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="ml-auto max-w-sm space-y-2 rounded-xl bg-slate-50 dark:bg-slate-900 p-4">
                  <div className="flex justify-between text-sm font-bold text-slate-500">
                    <span>Subtotal</span>
                    <span>{currency}{Number(selectedSubtotal || 0).toFixed(2)}</span>
                  </div>
                  {selectedTax > 0 && (
                    <div className="flex justify-between text-sm font-bold text-slate-500">
                      <span>{config?.business?.taxName || 'VAT'}</span>
                      <span>{currency}{Number(selectedTax || 0).toFixed(2)}</span>
                    </div>
                  )}
                  {selectedSale.pointsDiscount !== undefined && selectedSale.pointsDiscount > 0 && (
                    <div className="flex justify-between text-sm font-bold text-emerald-600">
                      <span>Points discount</span>
                      <span>-{currency}{Number(selectedSale.pointsDiscount || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-3 text-lg font-black text-slate-900 dark:text-white">
                    <span>Total</span>
                    <span>{currency}{Number(selectedSale.total || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
