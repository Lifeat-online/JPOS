import { useMemo } from 'react';
import { CheckCircle2, ChefHat, Clock, Play } from 'lucide-react';
import { Sale, OrderItem, Workstation, Staff, Customer } from '../types';
import { apiPost, apiPut } from '../api';
import { usePosStore } from '../store/usePosStore';
import { getDate } from '../utils/date';

interface WorkstationQueuePanelProps {
  sales: Sale[];
  workstations: Workstation[];
  customers?: Customer[];
  activeWorkstationId: string;
  currentUserStaff: Staff | null;
  onSalesUpdated?: () => Promise<void>;
  compact?: boolean;
}

export function getWorkstationOrderLabel(order: Pick<Sale, 'tableNumber' | 'isTab' | 'tabName' | 'customerId'>, customers: Customer[] = []) {
  if (order.isTab) {
    const customer = order.customerId ? customers.find(c => c.id === order.customerId) : null;
    const tabOwner = customer?.name || order.tabName || 'Client';
    return `Tab ${tabOwner}`;
  }

  if (order.tableNumber) return `Table ${order.tableNumber}`;

  return 'Takeaway';
}

export function WorkstationQueuePanel({
  sales,
  workstations,
  customers = [],
  activeWorkstationId,
  currentUserStaff,
  onSalesUpdated,
  compact = false,
}: WorkstationQueuePanelProps) {
  const tenantId = usePosStore(s => s.tenantId);
  const activeWorkstation = workstations.find(w => w.id === activeWorkstationId);

  const relevantSales = useMemo(() => {
    return sales
      .filter(s =>
        s.items.some(item => {
          const orderItem = item as OrderItem;
          return orderItem.workstationId === activeWorkstationId &&
            (orderItem.status === 'pending' || orderItem.status === 'accepted');
        })
      )
      .sort((a, b) => {
        const ta = getDate(a.createdAt).getTime();
        const tb = getDate(b.createdAt).getTime();
        return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
      });
  }, [activeWorkstationId, sales]);

  const queueCount = relevantSales.reduce((count, order) => {
    return count + order.items.filter(item => {
      const orderItem = item as OrderItem;
      return orderItem.workstationId === activeWorkstationId &&
        (orderItem.status === 'pending' || orderItem.status === 'accepted');
    }).length;
  }, 0);

  const handleItemStatusUpdate = async (
    saleId: string,
    item: OrderItem,
    newStatus: 'accepted' | 'ready',
    order: Sale
  ) => {
    try {
      if (!tenantId) return;

      await apiPut(`/api/mariadb/tenants/${tenantId}/sales/${saleId}/items/${item.id}`, {
        status: newStatus,
        actionStaffId: currentUserStaff?.id || null
      });

      if (newStatus === 'ready') {
        const orderLabel = getWorkstationOrderLabel(order, customers);
        const wsLabel = activeWorkstation?.name || 'Workstation';
        const text = `${orderLabel} - ${item.quantity}x ${item.name} is READY (${wsLabel})`;

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

  if (!activeWorkstationId || !activeWorkstation) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center bg-slate-50 dark:bg-[#0B1120]">
        <div>
          <ChefHat className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="font-black text-slate-800 dark:text-slate-200">No Station Selected</h3>
          <p className="text-sm text-slate-500 mt-1">Choose a workstation to see incoming tickets.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-[#0B1120]">
      <div className={`${compact ? 'px-4 py-3' : 'p-4 lg:p-6'} border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className={`${compact ? 'text-sm' : 'text-lg'} font-black text-slate-900 dark:text-white truncate`}>
              {activeWorkstation.name}
            </h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {queueCount} active item{queueCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className={`${queueCount > 0 ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'} min-w-8 h-8 px-2 rounded-lg flex items-center justify-center text-xs font-black`}>
            {queueCount}
          </div>
        </div>
      </div>

      <div className={`${compact ? 'p-3' : 'p-4 lg:p-8'} flex-1 overflow-y-auto`}>
        {relevantSales.length === 0 ? (
          <div className={`${compact ? 'py-12 px-5' : 'py-20'} text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm`}>
            <ChefHat className={`${compact ? 'w-9 h-9' : 'w-10 h-10'} text-slate-300 dark:text-slate-600 mx-auto mb-4`} />
            <h3 className={`${compact ? 'text-sm' : 'text-xl'} font-black text-slate-700 dark:text-slate-300`}>No Active Tickets</h3>
            <p className="text-xs text-slate-400 font-medium mt-1">The station is clear.</p>
          </div>
        ) : (
          <div className={compact ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start'}>
            {relevantSales.map(order => {
              const wsItems = order.items
                .map((item, idx) => ({ item: item as OrderItem, idx }))
                .filter(x => x.item.workstationId === activeWorkstationId && (x.item.status === 'pending' || x.item.status === 'accepted'));

              return (
                <div key={order.id} className={`${compact ? 'rounded-2xl border' : 'rounded-[28px] border-2 shadow-xl'} bg-white dark:bg-slate-900 border-slate-200/70 dark:border-slate-800 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300`}>
                  <div className={`${compact ? 'px-4 py-3' : 'px-6 py-4'} flex justify-between items-center text-white ${wsItems.some(x => x.item.status === 'pending') ? 'bg-orange-500' : 'bg-blue-600'}`}>
                    <div className="min-w-0">
                      <h3 className={`${compact ? 'text-base' : 'text-xl'} font-black leading-none mb-1 truncate`}>
                        {getWorkstationOrderLabel(order, customers)}
                      </h3>
                      <div className="text-[10px] uppercase font-bold tracking-widest text-white/80 flex items-center gap-1.5">
                        <Clock className="w-3 h-3 shrink-0" />
                        {order.createdAt ? getDate(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                      </div>
                    </div>
                    <div className={`${compact ? 'text-xs' : 'text-xl'} font-black bg-white/20 px-2.5 py-1 rounded-lg shrink-0`}>
                      #{order.id.slice(-4).toUpperCase()}
                    </div>
                  </div>

                  <div className={`${compact ? 'p-3' : 'p-4'} flex-1 bg-slate-50 dark:bg-slate-900/50`}>
                    <ul className={compact ? 'space-y-2' : 'space-y-3'}>
                      {wsItems.map(({ item, idx }) => (
                        <li key={`${item.id}-${idx}`} className={`${compact ? 'p-3 rounded-xl' : 'p-4 rounded-2xl'} border ${item.status === 'accepted' ? 'bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:border-blue-900/30' : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'} shadow-sm`}>
                          <div className={`flex items-start gap-3 ${compact ? 'mb-2' : 'mb-3'}`}>
                            <div className={`${compact ? 'w-7 h-7' : 'w-8 h-8'} rounded-lg ${item.status === 'accepted' ? 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200' : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'} font-black flex items-center justify-center shrink-0`}>
                              {item.quantity}
                            </div>
                            <p className={`${compact ? 'text-sm' : 'text-lg'} -mt-0.5 font-black text-slate-800 dark:text-slate-200 leading-tight min-w-0`}>
                              {item.name}
                            </p>
                          </div>

                          <div className="flex border-t border-slate-100 dark:border-slate-800 pt-3">
                            {item.status === 'pending' ? (
                              <button
                                onClick={() => handleItemStatusUpdate(order.id, item, 'accepted', order)}
                                className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md shadow-blue-500/25"
                              >
                                <Play className="w-4 h-4 fill-current shrink-0" /> Accept
                              </button>
                            ) : (
                              <button
                                onClick={() => handleItemStatusUpdate(order.id, item, 'ready', order)}
                                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md shadow-emerald-500/25"
                              >
                                <CheckCircle2 className="w-4 h-4 shrink-0" /> Ready
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
