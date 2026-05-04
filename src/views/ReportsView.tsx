import React from 'react';
import { Sale } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, Presentation, DollarSign } from 'lucide-react';
import { format, subDays, isSameDay } from 'date-fns';

interface ReportsViewProps {
  sales: Sale[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export const ReportsView: React.FC<ReportsViewProps> = ({ sales }) => {
  // Aggregate data
  const completedSales = sales.filter(s => s.status === 'completed');
  
  const totalRevenue = completedSales.reduce((acc, sale) => acc + sale.total, 0);
  const avgOrderValue = completedSales.length > 0 ? totalRevenue / completedSales.length : 0;
  
  // Daily Revenue (last 7 days)
  const dailyData = Array.from({ length: 7 }).map((_, i) => {
    const d = subDays(new Date(), 6 - i);
    const daySales = completedSales.filter(sale => {
      const saleDate = sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt);
      return isSameDay(saleDate, d);
    });
    return {
      name: format(d, 'EEE'),
      revenue: daySales.reduce((acc, s) => acc + s.total, 0)
    };
  });

  // Top Products
  const productCounts: Record<string, number> = {};
  completedSales.forEach(sale => {
    sale.items.forEach(item => {
      productCounts[item.name] = (productCounts[item.name] || 0) + item.quantity;
    });
  });

  const topProducts = Object.entries(productCounts)
    .map(([name, count]) => ({ name, value: count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Analytics Dashboard</h2>
          <p className="text-slate-500 font-medium">Revenue tracking, average order value, and top products.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 rounded-2xl flex items-center justify-center">
              <DollarSign className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Total Rev</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">R{totalRevenue.toFixed(2)}</div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Avg Order</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">R{avgOrderValue.toFixed(2)}</div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-purple-50 dark:bg-purple-900/20 text-purple-500 rounded-2xl flex items-center justify-center">
              <Presentation className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Total Sales</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">{completedSales.length}</div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 bg-orange-50 dark:bg-orange-900/20 text-orange-500 rounded-2xl flex items-center justify-center">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-1">Items Sold</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">
                {completedSales.reduce((acc, s) => acc + s.items.reduce((iAcc, item) => iAcc + item.quantity, 0), 0)}
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-black mb-6">Revenue (Last 7 Days)</h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, strokeWidth: 4, fill: '#fff' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-black mb-6">Top Products (Units Sold)</h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topProducts}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {topProducts.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {topProducts.map((p, idx) => (
                  <div key={p.name} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                      <span className="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{p.name}</span>
                    </div>
                    <span className="font-black text-slate-900 dark:text-white">{p.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
