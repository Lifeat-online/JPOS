import React from 'react';
import { Sale } from '../types';
import { ChefHat, CheckCircle2, Clock } from 'lucide-react';

interface KitchenViewProps {
  sales: Sale[];
  onCompleteOrder: (saleId: string) => void;
}

export function KitchenView({ sales, onCompleteOrder }: KitchenViewProps) {
  // Kitchen sees 'kitchen' orders. We sort them by oldest first.
  const kitchenOrders = sales
    .filter(s => s.status === 'kitchen')
    .sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeA - timeB;
    });

  return (
    <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
      <div className="mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2 flex items-center gap-3">
            <ChefHat className="w-8 h-8 text-primary" /> Kitchen Display
          </h2>
          <p className="text-slate-500 font-medium">Manage incoming tickets and preparation status.</p>
        </div>

        {kitchenOrders.length === 0 ? (
          <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="w-20 h-20 bg-slate-50 dark:bg-[#0B1120] rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-300 dark:text-slate-600">
              <ChefHat className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-black text-slate-700 dark:text-slate-300 mb-2">No Active Orders</h3>
            <p className="text-slate-400 font-medium max-w-sm mx-auto">The kitchen is clear. All tickets have been prepared and served.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
            {kitchenOrders.map(order => (
              <div key={order.id} className="bg-white dark:bg-slate-900 rounded-[28px] border-2 border-primary/20 shadow-xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-300">
                <div className="bg-primary px-6 py-4 flex justify-between items-center text-white">
                  <div>
                    <h3 className="font-black text-xl leading-none mb-1">
                      {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'}
                    </h3>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-white/80 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> 
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'Now'}
                    </div>
                  </div>
                  <div className="text-2xl font-black bg-white/20 px-3 py-1 rounded-xl">
                    #{order.id.slice(-4).toUpperCase()}
                  </div>
                </div>
                
                <div className="flex-1 p-6 bg-yellow-50 dark:bg-yellow-900/10">
                  <ul className="space-y-4">
                    {order.items.map((item, idx) => (
                      <li key={idx} className="flex gap-4 items-start border-b border-yellow-200/50 dark:border-yellow-900/30 pb-4 last:border-0 last:pb-0">
                        <div className="w-8 h-8 rounded-lg bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 font-black flex items-center justify-center shrink-0">
                          {item.quantity}
                        </div>
                        <div>
                          <p className="font-black text-lg text-slate-800 dark:text-slate-200 leading-tight block">{item.name}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => onCompleteOrder(order.id)}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-emerald-500/25"
                  >
                    <CheckCircle2 className="w-5 h-5" /> Mark Prepared
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
