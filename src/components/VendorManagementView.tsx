import React, { useState, useEffect } from 'react';
import { query, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Vendor } from '../types';
import { Plus, Edit, Loader2, Save, X, Building2, Mail, Phone, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePosStore } from '../store/usePosStore';
import { getTenantCollection, getTenantDoc } from '../tenantHelper';

export function VendorManagementView() {
  const tenantId = usePosStore(s => s.tenantId);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentVendor, setCurrentVendor] = useState<Partial<Vendor>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const q = query(getTenantCollection(db, tenantId, 'vendors'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setVendors(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Vendor)));
      setLoading(false);
    }, (err) => {
      console.error('Vendors subscription error:', err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [tenantId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentVendor.name || !tenantId) return;
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
        await updateDoc(getTenantDoc(db, tenantId, 'vendors', currentVendor.id), data);
      } else {
        await addDoc(getTenantCollection(db, tenantId, 'vendors'), { ...data, createdAt: serverTimestamp() });
      }
      setModalOpen(false);
    } catch (err) {
      console.error(err);
    }
    setIsProcessing(false);
  };

  const toggleStatus = async (vendor: Vendor) => {
    if (!tenantId) return;
    await updateDoc(getTenantDoc(db, tenantId, 'vendors', vendor.id), {
      status: vendor.status === 'active' ? 'inactive' : 'active',
    });
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-100 dark:border-slate-800/60 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">Vendors</h2>
          <p className="text-sm font-medium text-slate-500">Manage suppliers and distributors</p>
        </div>
        <button
          onClick={() => { setCurrentVendor({ status: 'active' }); setModalOpen(true); }}
          className="px-6 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/30 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" /> New Vendor
        </button>
      </div>

      {vendors.length === 0 && (
        <div className="py-20 text-center bg-white dark:bg-slate-900 rounded-[24px] border border-dashed border-slate-200 dark:border-slate-700/60">
          <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No vendors yet</p>
        </div>
      )}

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
                {vendor.contactPerson && <div className="text-sm text-slate-500 flex items-center gap-2"><User className="w-4 h-4" /> {vendor.contactPerson}</div>}
                {vendor.email && <div className="text-sm text-slate-500 flex items-center gap-2"><Mail className="w-4 h-4" /> {vendor.email}</div>}
                {vendor.phone && <div className="text-sm text-slate-500 flex items-center gap-2"><Phone className="w-4 h-4" /> {vendor.phone}</div>}
              </div>
            </div>
            <div className="flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-800/60">
              <button
                onClick={() => toggleStatus(vendor)}
                className="flex-1 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-slate-600 dark:text-slate-400"
              >
                {vendor.status === 'active' ? 'Disable' : 'Enable'}
              </button>
              <button
                onClick={() => { setCurrentVendor(vendor); setModalOpen(true); }}
                className="flex-1 py-2 text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg shadow-md hover:scale-105 active:scale-95 transition-all"
              >
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
                <button onClick={() => setModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-all"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                {[
                  { label: 'Vendor Name', key: 'name', type: 'text', required: true },
                  { label: 'Contact Person', key: 'contactPerson', type: 'text' },
                  { label: 'Email', key: 'email', type: 'email' },
                  { label: 'Phone', key: 'phone', type: 'tel' },
                  { label: 'Address', key: 'address', type: 'text' },
                ].map(({ label, key, type, required }) => (
                  <div key={key}>
                    <label className="text-[10px] font-black uppercase text-slate-400 px-1">{label}</label>
                    <input
                      required={required}
                      type={type}
                      value={(currentVendor as any)[key] || ''}
                      onChange={e => setCurrentVendor({ ...currentVendor, [key]: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold mt-1 dark:text-white"
                    />
                  </div>
                ))}
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                  <button type="submit" disabled={isProcessing} className="flex-1 py-3.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all">
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
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
