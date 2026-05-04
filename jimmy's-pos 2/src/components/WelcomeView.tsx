import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, CloudLightning, LineChart, Store, ArrowRight, UserCircle } from 'lucide-react';

interface WelcomeViewProps {
  onLogin: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

export function WelcomeView({ onLogin, isDarkMode, toggleDarkMode }: WelcomeViewProps) {
  return (
    <div className={`min-h-screen w-full flex flex-col font-sans ${isDarkMode ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <header className="h-16 border-b border-slate-200 dark:border-slate-800 px-6 lg:px-12 flex items-center justify-between bg-white dark:bg-slate-900 z-50 sticky top-0">
        <div className="font-extrabold text-xl tracking-tighter text-primary flex items-center gap-2">
          <Store className="w-6 h-6" />
          Jimmy's POS
        </div>
        <div className="flex gap-4">
          <button 
            onClick={toggleDarkMode}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            {isDarkMode ? '🌞' : '🌙'}
          </button>
          <button 
            onClick={onLogin}
            className="px-5 py-2 bg-primary text-white rounded-xl font-bold shadow-md shadow-primary/20 hover:scale-105 transition-all text-sm flex items-center gap-2"
          >
            <UserCircle className="w-4 h-4" />
            Staff Login
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] dark:opacity-[0.05] pointer-events-none mix-blend-overlay"></div>
        <div className="max-w-6xl mx-auto px-6 lg:px-12 py-20 lg:py-32 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="inline-block mb-4 px-4 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-widest border border-blue-200 dark:border-blue-800">
              The Future of Retail
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-5xl lg:text-7xl font-black tracking-tight mb-6 leading-[1.1]">
              Cloud-Native Point of Sale for Modern Business.
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-lg lg:text-xl text-slate-500 dark:text-slate-400 mb-10 leading-relaxed font-medium">
              Seamlessly manage your inventory, process transactions with PayFast, and track your business growth from anywhere. Built for speed and reliability.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex justify-center gap-4">
              <button onClick={onLogin} className="px-8 py-4 bg-primary text-white rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-105 transition-all flex items-center gap-3 active:scale-95 text-lg">
                Get Started
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-2xl flex items-center justify-center mb-6">
                <CloudLightning className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-3 dark:text-white">Lightning Fast</h3>
              <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">Process sales instantly with our optimized cart management system. Built for high-volume retail environments.</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
              <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 rounded-2xl flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-3 dark:text-white">Secure Payments</h3>
              <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">Integrated directly with PayFast for seamless, secure credit card transactions and instant payment confirmation.</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800">
              <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/20 text-purple-500 rounded-2xl flex items-center justify-center mb-6">
                <LineChart className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-3 dark:text-white">Real-time Analytics</h3>
              <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">Track inventory, managing staff roles, and view your sales history in real-time from our comprehensive dashboard.</p>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
