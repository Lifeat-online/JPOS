import React, { useEffect, useState } from 'react';
import { Sale, OrderItem, Workstation, Staff } from '../types';
import { ChefHat, CheckCircle2, Clock, Play } from 'lucide-react';
import { usePosStore } from '../store/usePosStore';
import { apiPost, apiPut } from '../api';
import { getDate } from '../utils/date';

interface WorkstationViewProps {
  sales: Sale[];
  workstations: Workstation[];
  currentUserStaff: Staff | null;
  onSalesUpdated?: () => Promise<void>;
}

export function WorkstationView({ sales, workstations, currentUserStaff, onSalesUpdated }: WorkstationViewProps) {
  const tenantId = usePosStore(s => s.tenantId);
  const [activeWorkstationId, setActiveWorkstationId] = useState<string>(workstations[0]?.id || '');

  useEffect(() => {
    if (workstations.length === 0) {
      if (activeWorkstationId) setActiveWorkstationId('');
      return;
    }

    const workstationStillExists = workstations.some(w => w.id === activeWorkstationId);
    if (!workstationStillExists) {
      setActiveWorkstationId(workstations[0].id);
    }
  }, [workstations, activeWorkstationId]);

  const handleItemStatusUpdate = async (
    saleId: string,
    item: any,
    newStatus: 'accepted' | 'ready',
    order: Sale
  ) => {
    try {
      if (!tenantId) return;

      // Granular update of the specific sale item
      await apiPut(`/api/mariadb/tenants/${tenantId}/sales/${saleId}/items/${item.id}`, {
        status: newStatus,
        actionStaffId: currentUserStaff?.id || null
      });

      // When an item is marked ready, send a notification to the General channel
      if (newStatus === 'ready') {
        const activeWs = workstations.find(w => w.id === activeWorkstationId);
        const tableLabel = order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway';
        const wsLabel = activeWs?.name || 'Workstation';
        const text = `🍽️ ${tableLabel} — ${item.quantity}× ${item.name} is READY (${wsLabel})`;

        await apiPost(`/api/mariadb/tenants/${tenantId}/messages`, {
          channel: 'general',
          senderId: 'system',
          senderName: wsLabel,
          senderRole: 'workstation',
          text,
          readBy: [],
          isDevBroadcast: false,
          isSystemNotification: true,
        });
      }

      if (onSalesUpdated) {
        await onSalesUpdated();
      }
    } catch (e) {
      console.error('Failed to update item status:', e);
    }
  };

  if (workstations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 max-w-md w-full shadow-2xl text-center border border-slate-100 dark:border-slate-800/60">
          <ChefHat className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">No Workstations Configured</h3>
          <p className="text-slate-500 font-medium">Please add workstations in Settings to use this view.</p>
        </div>
      </div>
    );
  }

  const relevantSales = sales
    .filter(s =>
      // Include both item-level workstation routing AND order-level 'kitchen' status
      // for the selected workstation
      s.items.some(item => {
        const o = item as OrderItem;
        return o.workstationId === activeWorkstationId && (o.status === 'pending' || o.status === 'accepted');
      })
    )
    .sort((a, b) => {
      const ta = getDate(a.createdAt).getTime();
      const tb = getDate(b.createdAt).getTime();
      return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
    });

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-[#0B1120]">
      <div className="p-4 lg:p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Workstation</h2>
            <p className="text-slate-500 font-medium text-sm">Manage incoming tickets by station.</p>
          </div>
        </div>
        <select
          value={activeWorkstationId}
          onChange={e => setActiveWorkstationId(e.target.value)}
          className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold focus:ring-2 focus:ring-primary outline-none text-slate-900 dark:text-white"
        >
          {workstations.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
        {relevantSales.length === 0 ? (
          <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-lg mx-auto">
            <div className="w-20 h-20 bg-slate-50 dark:bg-[#0B1120] rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-300 dark:text-slate-600">
              <ChefHat className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-black text-slate-700 dark:text-slate-300 mb-2">No Active Tickets</h3>
            <p className="text-slate-400 font-medium max-w-sm mx-auto">The station is clear. All tickets have been prepared.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
            {relevantSales.map(order => {
              const wsItems = order.items
                .map((item, idx) => ({ item: item as OrderItem, idx }))
                .filter(x => x.item.workstationId === activeWorkstationId && (x.item.status === 'pending' || x.item.status === 'accepted'));

              return (
                <div key={order.id} className="bg-white dark:bg-slate-900 rounded-[28px] border-2 border-slate-200/50 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                  <div className={`px-6 py-4 flex justify-between items-center text-white ${wsItems.some(x => x.item.status === 'pending') ? 'bg-orange-500' : 'bg-blue-600'}`}>
                    <div>
                      <h3 className="font-black text-xl leading-none mb-1">
                        {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'}
                      </h3>
                      <div className="text-[10px] uppercase font-bold tracking-widest text-white/80 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {order.createdAt ? getDate(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                      </div>
                    </div>
                    <div className="text-xl font-black bg-white/20 px-3 py-1 rounded-xl">
                      #{order.id.slice(-4).toUpperCase()}
                    </div>
                  </div>

                  <div className="flex-1 p-4 bg-slate-50 dark:bg-slate-900/50">
                    <ul className="space-y-3">
                      {wsItems.map(({ item, idx }) => (
                        <li key={idx} className={`p-4 rounded-2xl border ${item.status === 'accepted' ? 'bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:border-blue-900/30' : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'} shadow-sm`}>
                          <div className="flex items-start gap-3 mb-3">
                            <div className={`w-8 h-8 rounded-lg ${item.status === 'accepted' ? 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200' : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'} font-black flex items-center justify-center shrink-0`}>
                              {item.quantity}
                            </div>
                            <p className="-mt-0.5 font-black text-lg text-slate-800 dark:text-slate-200 leading-tight">{item.name}</p>
                          </div>

                          <div className="flex border-t border-slate-100 dark:border-slate-800 pt-3">
                            {item.status === 'pending' ? (
                              <button
                                onClick={() => handleItemStatusUpdate(order.id, item, 'accepted', order)}
                                className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md shadow-blue-500/25"
                              >
                                <Play className="w-4 h-4 fill-current" /> Accept & Prep
                              </button>
                            ) : (
                              <button
                                onClick={() => handleItemStatusUpdate(order.id, item, 'ready', order)}
                                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md shadow-emerald-500/25"
                              >
                                <CheckCircle2 className="w-4 h-4" /> Mark Ready
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
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
