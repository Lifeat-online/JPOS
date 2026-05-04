import React from 'react';
import { UserPlus, Edit, Users } from 'lucide-react';

export function CustomersView({
  customers,
  setCustomerModal,
  setFilterCustomerId,
  navigate
}: any) {
  return (
    <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl lg:text-2xl font-black tracking-tight text-slate-900 dark:text-white">Customer Intelligence</h2>
                <button 
                  onClick={() => setCustomerModal({ isOpen: true, customer: {} })}
                  className="w-full sm:w-auto px-6 py-3.5 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary/20 active:scale-95 transition-all text-sm"
                >
                  <UserPlus className="w-5 h-5" />
                  New Customer
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800/60 shadow-sm flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <UserPlus className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Add Your First Customer</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium max-w-xs mx-auto">Build your database to track purchases and offer personalized service.</p>
                </div>
                <button 
                   onClick={() => setCustomerModal({ isOpen: true, customer: {} })}
                   className="px-8 py-3 bg-slate-800 dark:bg-slate-100 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"
                >
                  Launch Creator
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {customers.map(c => (
                  <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 lg:p-6 shadow-sm flex flex-col gap-4 transition-all hover:border-primary/20">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-slate-800 dark:bg-slate-100 text-white rounded-2xl flex items-center justify-center font-black uppercase text-lg shadow-lg shadow-slate-200">{c.name.charAt(0)}</div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 dark:text-white truncate">{c.name}</h3>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest truncate">{c.email}</p>
                        </div>
                      </div>
                      <button onClick={() => setCustomerModal({ isOpen: true, customer: c })} className="p-2.5 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 hover:text-primary rounded-xl transition-all"><Edit className="w-4 h-4" /></button>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                      <div className="flex -space-x-2">
                        {[1,2,3].map(i => (
                          <div key={i} className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-white" />
                        ))}
                      </div>
                      <button 
                        onClick={() => {
                          setFilterCustomerId(c.id);
                          navigate('/history');
                        }}
                        className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                      >
                        View Orders
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
  );
}