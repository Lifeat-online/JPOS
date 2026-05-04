import { getTenantCollection, getTenantDoc } from '../tenantHelper';
import { usePosStore } from '../store/usePosStore';
import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Vendor } from '../types';
import { Plus, Edit, Loader2, Save, X, Building2, Mail, Phone, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function VendorManagementView() {
  const tenantId = usePosStore(state => state.tenantId);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentVendor, setCurrentVendor] = useState<Partial<Vendor>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const q = query(getTenantCollection(db, tenantId, "vendors"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setVendors(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Vendor)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentVendor.name) return;
    setIsProcessing(true);
    try {
      const data = {
        name: currentVendor.name,
        contactPerson: currentVendor.contactPerson || '',
        email: currentVendor.email || '',
        phone: currentVendor.phone || '',
        address: currentVendor.address || '',
        status: currentVendor.status || 'active',
      };
      if (currentVendor.id) {
        await updateDoc(getTenantDoc(db, tenantId, "vendors", currentVendor.id), data);
      } else {
        await addDoc(getTenantCollection(db, tenantId, "vendors"), { ...data, createdAt: serverTimestamp() });
      }
      setModalOpen(false);
    } catch (err) {
      console.error(err);
    }
    setIsProcessing(false);
  };

  const toggleStatus = async (vendor: Vendor) => {
    await updateDoc(getTenantDoc(db, tenantId, "vendors", vendor.id), { status: vendor.status === 'active' ? 'inactive' : 'active' });
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-100 dark:border-slate-800/60 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">Vendors</h2>
          <p className="text-sm font-medium text-slate-500">Manage suppliers and distributors</p>
        </div>
        <button onClick={() => { setCurrentVendor({ status: 'active' }); setModalOpen(true); }} className="px-6 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/30 active:scale-95 transition-all">
          <Plus className="w-5 h-5" /> New Vendor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vendors.map(vendor => (
          <div key={vendor.id} className="bg-white dark:bg-slate-900 rounded-[24px] border border-slate-100 dark:border-slate-800/60 p-6 flex flex-col justify-between hover:shadow-xl transition-all">
            <div>
              <div className="flex justify-between items-start mb-4">
                <div className="flex bg-slate-50 dark:bg-slate-800 p-3 rounded-full text-slate-500 dark:text-slate-400">
                  <Building2 className="w-6 h-6" />
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${vendor.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                  {vendor.status}
                </span>
              </div>
              <h3 className="text-xl font-black text-slate-800 dark:text-white mb-4">{vendor.name}</h3>
              
              <div className="space-y-2 mb-6">
                {vendor.contactPerson && <div className="text-sm text-slate-500 flex items-center gap-2"><UserIcon className="w-4 h-4"/> {vendor.contactPerson}</div>}
                {vendor.email && <div className="text-sm text-slate-500 flex items-center gap-2"><Mail className="w-4 h-4"/> {vendor.email}</div>}
                {vendor.phone && <div className="text-sm text-slate-500 flex items-center gap-2"><Phone className="w-4 h-4"/> {vendor.phone}</div>}
              </div>
            </div>
            
            <div className="flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-800/60">
              <button onClick={() => toggleStatus(vendor)} className="flex-1 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-slate-600 dark:text-slate-400">
                {vendor.status === 'active' ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => { setCurrentVendor(vendor); setModalOpen(true); }} className="flex-1 py-2 text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all">
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl relative">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">{currentVendor.id ? 'Edit Vendor' : 'New Vendor'}</h3>
                <button onClick={() => setModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-all"><X className="w-5 h-5"/></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 px-1">Vendor Name</label>
                  <input required type="text" value={currentVendor.name || ''} onChange={e => setCurrentVendor({...currentVendor, name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold mt-1" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 px-1">Contact Person</label>
                  <input type="text" value={currentVendor.contactPerson || ''} onChange={e => setCurrentVendor({...currentVendor, contactPerson: e.target.value})} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold mt-1" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 px-1">Email</label>
                  <input type="email" value={currentVendor.email || ''} onChange={e => setCurrentVendor({...currentVendor, email: e.target.value})} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold mt-1" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 px-1">Phone</label>
                  <input type="tel" value={currentVendor.phone || ''} onChange={e => setCurrentVendor({...currentVendor, phone: e.target.value})} className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold mt-1" />
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                  <button type="submit" disabled={isProcessing} className="flex-1 py-3.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all">
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} Save
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserIcon(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
}
