import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Store, UserCircle, ShoppingBag, MapPin, Phone, Mail,
  ArrowRight, Loader2, AlertCircle, Moon, Sun, Download,
} from 'lucide-react';
import { AppConfig } from '../types';

interface BusinessPageProps {
  slug: string;
  config: AppConfig;
  tenantId: string;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onStaffLogin: () => void;
  onClientLogin: () => void;
  canInstall: boolean;
  installApp: () => Promise<void>;
  onShowInstallGuide: () => void;
}

export function BusinessPage({
  slug, config, tenantId,
  isDarkMode, toggleDarkMode,
  onStaffLogin, onClientLogin,
  canInstall, installApp, onShowInstallGuide,
}: BusinessPageProps) {
  const biz = config.business;
  const currency = biz?.currency || 'R';

  // Set the PWA start_url dynamically so when installed from this page,
  // it opens at this business's URL
  useEffect(() => {
    // Update the manifest link to point to a dynamic manifest
    const existingLink = document.querySelector('link[rel="manifest"]');
    if (existingLink) existingLink.remove();

    const manifest = {
      name: biz?.name || "Jimmy's POS",
      short_name: biz?.name?.split(' ')[0] || 'POS',
      description: `${biz?.name || "Jimmy's POS"} — Point of Sale`,
      theme_color: '#2563EB',
      background_color: '#0f172a',
      display: 'standalone',
      orientation: 'any',
      scope: '/',
      start_url: `/b/${slug}`,
      icons: [
        {
          src: biz?.logoUrl || '/favicon.svg',
          sizes: 'any',
          type: biz?.logoUrl ? 'image/png' : 'image/svg+xml',
          purpose: 'any maskable',
        },
      ],
    };

    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = url;
    document.head.appendChild(link);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [slug, biz?.name, biz?.logoUrl]);

  return (
    <div className={`min-h-screen flex flex-col font-sans ${isDarkMode ? 'dark bg-slate-950' : 'bg-slate-50'}`}>
      {/* Header */}
      <header className="sticky top-0 z-50 h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          {biz?.logoUrl ? (
            <img src={biz.logoUrl} alt={biz.name} className="h-8 w-8 rounded-lg object-contain" />
          ) : (
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Store className="w-4 h-4 text-white" />
            </div>
          )}
          <span className="font-black text-slate-900 dark:text-white tracking-tight">{biz?.name || "Jimmy's POS"}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleDarkMode} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={onClientLogin} className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700">
            <ShoppingBag className="w-4 h-4" />
            My Account
          </button>
          <button onClick={onStaffLogin} className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-sm">
            <UserCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Staff Login</span>
            <span className="sm:hidden">Login</span>
          </button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero / Business card */}
        <section className="relative overflow-hidden bg-white dark:bg-slate-900 py-16 lg:py-24">
          {/* Background gradient */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-50 dark:from-blue-950/30 to-transparent" />

          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="mb-6"
            >
              {biz?.logoUrl ? (
                <img
                  src={biz.logoUrl}
                  alt={biz.name}
                  className="w-24 h-24 rounded-3xl object-contain mx-auto shadow-xl border-4 border-white dark:border-slate-800"
                />
              ) : (
                <div className="w-24 h-24 bg-primary rounded-3xl flex items-center justify-center mx-auto shadow-xl">
                  <Store className="w-12 h-12 text-white" />
                </div>
              )}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white mb-3"
            >
              {biz?.name || 'Welcome'}
            </motion.h1>

            {/* Business details */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap justify-center gap-4 text-sm text-slate-500 dark:text-slate-400 mb-8"
            >
              {biz?.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  {biz.address}
                </span>
              )}
              {biz?.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-slate-400" />
                  {biz.phone}
                </span>
              )}
            </motion.div>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row justify-center gap-4 mb-8"
            >
              <button
                onClick={onStaffLogin}
                className="px-8 py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 text-base"
              >
                <UserCircle className="w-5 h-5" />
                Staff Login
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={onClientLogin}
                className="px-8 py-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-bold hover:border-primary hover:text-primary dark:hover:border-primary dark:hover:text-primary active:scale-95 transition-all flex items-center justify-center gap-3 text-base"
              >
                <ShoppingBag className="w-5 h-5" />
                My Account
              </button>
            </motion.div>

            {/* Install button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <button
                onClick={() => canInstall ? installApp() : onShowInstallGuide()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/20 active:scale-95 transition-all border border-primary/20"
              >
                <Download className="w-4 h-4" />
                Install App
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-primary/10 uppercase tracking-widest">PWA</span>
              </button>
            </motion.div>
          </div>
        </section>

        {/* Business info cards */}
        {(biz?.address || biz?.phone || biz?.taxRate || biz?.currency) && (
          <section className="py-12 bg-slate-50 dark:bg-slate-950">
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
              <div className="grid sm:grid-cols-2 gap-4">
                {biz?.address && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm flex items-start gap-3">
                    <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Address</p>
                      <p className="font-semibold text-slate-800 dark:text-white text-sm">{biz.address}</p>
                    </div>
                  </div>
                )}
                {biz?.phone && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm flex items-start gap-3">
                    <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Phone</p>
                      <p className="font-semibold text-slate-800 dark:text-white text-sm">{biz.phone}</p>
                    </div>
                  </div>
                )}
                {biz?.taxRate && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm flex items-start gap-3">
                    <div className="w-9 h-9 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-xl flex items-center justify-center shrink-0">
                      <span className="text-xs font-black">%</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{biz.taxName || 'VAT'}</p>
                      <p className="font-semibold text-slate-800 dark:text-white text-sm">{biz.taxRate}% {biz.taxInclusive ? '(inclusive)' : '(exclusive)'}</p>
                    </div>
                  </div>
                )}
                {biz?.currency && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm flex items-start gap-3">
                    <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center shrink-0">
                      <span className="text-sm font-black">{currency}</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Currency</p>
                      <p className="font-semibold text-slate-800 dark:text-white text-sm">{currency}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Loyalty info if enabled */}
        {biz?.enableLoyalty && (
          <section className="py-12 bg-white dark:bg-slate-900">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 font-semibold text-xs uppercase tracking-widest border border-pink-200 dark:border-pink-800">
                🎁 Loyalty Program
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Earn points on every purchase</h2>
              {biz.pointsEarnedPerCurrency && (
                <p className="text-slate-500 dark:text-slate-400">
                  Earn <strong className="text-slate-900 dark:text-white">1 point</strong> for every <strong className="text-slate-900 dark:text-white">{currency}{biz.pointsEarnedPerCurrency}</strong> spent.
                  {biz.pointsRequiredForDiscount && biz.discountAmountForPoints && (
                    <> Redeem <strong className="text-slate-900 dark:text-white">{biz.pointsRequiredForDiscount} points</strong> for a <strong className="text-slate-900 dark:text-white">{currency}{biz.discountAmountForPoints}</strong> discount.</>
                  )}
                </p>
              )}
              <button
                onClick={onClientLogin}
                className="mt-6 px-6 py-3 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all inline-flex items-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                Sign in to view your points
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 bg-slate-900 dark:bg-slate-950 text-slate-500 text-xs text-center border-t border-slate-800">
        <p>
          <span className="text-slate-300 font-semibold">{biz?.name}</span>
          {' · '}Powered by{' '}
          <a href="/" className="text-primary hover:underline font-semibold">Jimmy's POS</a>
        </p>
        <p className="mt-1 font-mono text-slate-600">jimmypos.com/{slug}</p>
      </footer>
    </div>
  );
}

// Loading state
export function BusinessPageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
        <p className="text-slate-500 font-medium">Loading business profile...</p>
      </div>
    </div>
  );
}

// Not found state
export function BusinessPageNotFound({ slug }: { slug: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Business Not Found</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-6">
          No business found at <code className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-sm">/{slug}</code>
        </p>
        <a href="/" className="px-6 py-3 bg-primary text-white rounded-2xl font-bold hover:opacity-90 transition-all inline-flex items-center gap-2">
          <Store className="w-4 h-4" />
          Go to Jimmy's POS
        </a>
      </div>
    </div>
  );
}
