import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Building2, Save } from 'lucide-react';
import { setupTenant } from '../api';
import { AppConfig } from '../types';

interface SetupWizardProps {
  user: { uid: string; email: string; displayName: string | null };
  config: AppConfig;
}

export function SetupWizard({ user, config }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    businessName: config.business?.name || '',
    logoUrl: config.business?.logoUrl || '',
    address: config.business?.address || '',
    currency: config.business?.currency || 'R',
    taxRate: config.business?.taxRate?.toString() || '15',
  });

  const handleSave = async (isSkipping: boolean = false) => {
    setIsSaving(true);
    try {
      const businessName = isSkipping ? 'My Business' : formData.businessName;
      
      const setupConfig: AppConfig = {
        ...config,
        setupCompleted: true,
        business: {
          name: businessName,
          logoUrl: formData.logoUrl || '',
          address: formData.address || '',
          currency: formData.currency || 'R',
          taxRate: formData.taxRate ? parseFloat(formData.taxRate) : undefined,
        }
      };

      await setupTenant({
        businessName,
        user: {
          uid: user.uid,
          email: user.email!,
          displayName: user.displayName || user.email?.split('@')[0] || 'User'
        },
        config: setupConfig
      });

      // After setup, the App component will re-render and useAppData will find the new tenant.
      // We might need a hard reload or a state update to trigger the transition.
      window.location.reload();

    } catch (error) {
      console.error("Failed to complete setup:", error);
      alert("Failed to save setup. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="bg-primary p-8 text-center text-white space-y-4 shrink-0 relative">
          <button
            onClick={() => handleSave(true)}
            disabled={isSaving}
            className="absolute top-4 right-4 text-xs font-bold text-white/70 hover:text-white uppercase tracking-widest transition-all px-3 py-1.5 rounded-lg hover:bg-white/10"
          >
            Skip Config
          </button>
          <div className="w-16 h-16 bg-white/20 rounded-2xl mx-auto flex items-center justify-center backdrop-blur-md">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Business Setup</h1>
            <p className="text-primary-foreground/80 font-medium mt-2">Let's set up your POS terminal</p>
          </div>
        </div>
        
        <div className="p-8 space-y-6 overflow-y-auto">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500">Business Name</label>
              <input 
                type="text" 
                value={formData.businessName}
                onChange={e => setFormData({...formData, businessName: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold dark:text-white transition-all"
                placeholder="e.g. Acme Supermarket"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500">Logo URL (Optional)</label>
              <input 
                type="url" 
                value={formData.logoUrl}
                onChange={e => setFormData({...formData, logoUrl: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold dark:text-white transition-all"
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500">Physical Address (Optional)</label>
              <input 
                type="text" 
                value={formData.address}
                onChange={e => setFormData({...formData, address: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold dark:text-white transition-all"
                placeholder="123 Main Street, City"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Currency Symbol</label>
                <input 
                  type="text" 
                  value={formData.currency}
                  onChange={e => setFormData({...formData, currency: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold dark:text-white transition-all"
                  placeholder="e.g. R, $, £"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Tax Rate % (Optional)</label>
                <input 
                  type="number" 
                  value={formData.taxRate}
                  onChange={e => setFormData({...formData, taxRate: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-bold dark:text-white transition-all"
                  placeholder="e.g. 15"
                />
              </div>
            </div>
          </div>

          <button 
            onClick={() => handleSave(false)}
            disabled={!formData.businessName || isSaving}
            className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-primary/20"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                Complete Setup
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
