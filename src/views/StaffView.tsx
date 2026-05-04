import React from 'react';
import { UserPlus, UserCog, Edit, Trash2 } from 'lucide-react';
import { Staff } from '../types';

interface StaffViewProps {
  staff: Staff[];
  onEdit: (staff: Staff) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}

export const StaffView: React.FC<StaffViewProps> = ({ staff, onEdit, onAdd, onDelete }) => {
  return (
    <div className="flex-1 p-4 lg:p-8 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/50">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div>
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Staff Control</h2>
            <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Personnel Management</p>
          </div>
          <button
            onClick={onAdd}
            className="w-full sm:w-auto px-8 py-4 bg-primary text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-2xl shadow-primary/30 active:scale-95 hover:scale-105 transition-all text-sm uppercase tracking-widest"
          >
            <UserPlus className="w-5 h-5" />
            Add Personnel
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {staff.map(s => (
            <div
              key={s.id}
              className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800/60 shadow-sm transition-all hover:shadow-xl group"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="w-16 h-16 bg-slate-900 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg">
                  {s.name.charAt(0)}
                </div>
                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                  s.role === 'admin'
                    ? 'bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400'
                    : s.role === 'manager'
                    ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                    : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                }`}>
                  {s.role}
                </span>
              </div>

              <div className="space-y-1 mb-6">
                <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight">{s.name}</h3>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{s.email}</p>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${s.status === 'active' ? 'bg-green-500' : 'bg-slate-300'}`} />
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{s.status}</span>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => onEdit(s)}
                    className="p-2.5 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-xl hover:bg-primary hover:text-white transition-all"
                    aria-label={`Edit ${s.name}`}
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(s.id)}
                    className="p-2.5 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {staff.length === 0 && (
          <div className="p-20 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700/60">
            <UserCog className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No staff members assigned</p>
          </div>
        )}
      </div>
    </div>
  );
};
