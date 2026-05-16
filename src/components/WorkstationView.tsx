import React, { useEffect, useMemo, useState } from 'react';
import { Sale, Workstation, Staff, Customer } from '../types';
import { ChefHat } from 'lucide-react';
import { WorkstationQueuePanel } from './WorkstationQueuePanel';

interface WorkstationViewProps {
  sales: Sale[];
  workstations: Workstation[];
  customers: Customer[];
  currentUserStaff: Staff | null;
  onSalesUpdated?: () => Promise<void>;
}

export function WorkstationView({ sales, workstations, customers, currentUserStaff, onSalesUpdated }: WorkstationViewProps) {
  const visibleWorkstations = useMemo(
    () => currentUserStaff?.role === 'chef'
      ? workstations.filter(w => w.type === 'kitchen')
      : workstations,
    [currentUserStaff?.role, workstations]
  );
  const [activeWorkstationId, setActiveWorkstationId] = useState<string>(visibleWorkstations[0]?.id || '');

  useEffect(() => {
    if (visibleWorkstations.length === 0) {
      if (activeWorkstationId) setActiveWorkstationId('');
      return;
    }

    const workstationStillExists = visibleWorkstations.some(w => w.id === activeWorkstationId);
    if (!workstationStillExists) {
      setActiveWorkstationId(visibleWorkstations[0].id);
    }
  }, [visibleWorkstations, activeWorkstationId]);

  if (visibleWorkstations.length === 0) {
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
          {visibleWorkstations.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      <WorkstationQueuePanel
        sales={sales}
        workstations={workstations}
        customers={customers}
        activeWorkstationId={activeWorkstationId}
        currentUserStaff={currentUserStaff}
        onSalesUpdated={onSalesUpdated}
      />
    </div>
  );
}
