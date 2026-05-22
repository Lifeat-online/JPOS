import React, { useMemo } from 'react';
import { AlertTriangle, CreditCard, Edit, ReceiptText, Search } from 'lucide-react';
import { Customer, Sale } from '../types';

interface AccountsViewProps {
  customers: Customer[];
  sales: Sale[];
  onEditCustomer: (customer: Customer) => void;
  onViewOrders: (customerId: string) => void;
}

const currency = (value: number) => `R${Number(value || 0).toFixed(2)}`;

export const AccountsView: React.FC<AccountsViewProps> = ({ customers, sales, onEditCustomer, onViewOrders }) => {
  const accountCustomers = useMemo(
    () => customers
      .filter(c => c.accountEnabled || Number(c.accountBalance || 0) > 0 || Number(c.accountLimit || 0) > 0)
      .sort((a, b) => Number(b.accountBalance || 0) - Number(a.accountBalance || 0)),
    [customers]
  );

  const totals = useMemo(() => {
    const limit = accountCustomers.reduce((sum, c) => sum + Number(c.accountLimit || 0), 0);
    const owing = accountCustomers.reduce((sum, c) => sum + Number(c.accountBalance || 0), 0);
    const remaining = accountCustomers.reduce((sum, c) => sum + Math.max(0, Number(c.accountLimit || 0) - Number(c.accountBalance || 0)), 0);
    const accountSales = sales
      .filter(s => s.status === 'completed' && (s.paymentMethod === 'account' || s.payments?.some(p => p.method === 'account')))
      .reduce((sum, sale) => {
        const payments = sale.payments?.filter(p => p.method === 'account') || [];
        if (payments.length > 0) return sum + payments.reduce((paymentSum, p) => paymentSum + Number(p.amount || 0), 0);
        return sum + Number(sale.total || 0);
      }, 0);
    return {
      limit,
      owing,
      remaining,
      accountSales,
      active: accountCustomers.filter(c => c.accountEnabled).length,
      overLimit: accountCustomers.filter(c => Number(c.accountBalance || 0) > Number(c.accountLimit || 0)).length,
    };
  }, [accountCustomers, sales]);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0B1120] p-4 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Customer Accounts</h2>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Account limits, current debt, and remaining customer credit.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Owing', value: currency(totals.owing), icon: ReceiptText, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-900/20' },
            { label: 'Total Limits', value: currency(totals.limit), icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
            { label: 'Remaining', value: currency(totals.remaining), icon: Search, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
            { label: 'Account Sales', value: currency(totals.accountSales), icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          ].map(card => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${card.bg} ${card.color}`}>
                <card.icon className="h-6 w-6" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{card.label}</p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
            <div>
              <h3 className="font-black text-slate-900 dark:text-white">Accounts Owing</h3>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{totals.active} active accounts, {totals.overLimit} over limit</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Limit</th>
                  <th className="px-5 py-3">Owing</th>
                  <th className="px-5 py-3">Remaining</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accountCustomers.map(customer => {
                  const limit = Number(customer.accountLimit || 0);
                  const owing = Number(customer.accountBalance || 0);
                  const remaining = Math.max(0, limit - owing);
                  const overLimit = owing > limit && limit > 0;
                  return (
                    <tr key={customer.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/70">
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-900 dark:text-white">{customer.name}</p>
                        <p className="text-xs font-semibold text-slate-500">{customer.email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${overLimit ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : customer.accountEnabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {overLimit ? 'Over limit' : customer.accountEnabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-black text-slate-700 dark:text-slate-200">{currency(limit)}</td>
                      <td className="px-5 py-4 font-black text-rose-600 dark:text-rose-400">{currency(owing)}</td>
                      <td className="px-5 py-4 font-black text-emerald-600 dark:text-emerald-400">{currency(remaining)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => onViewOrders(customer.id)} className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-primary dark:border-slate-700 dark:text-slate-300">
                            Orders
                          </button>
                          <button onClick={() => onEditCustomer(customer)} className="rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white">
                            <Edit className="mr-1 inline h-3 w-3" />
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {accountCustomers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-sm font-bold text-slate-400">
                      No customer accounts have been enabled yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
