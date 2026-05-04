import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Store, ArrowRight, UserCircle, ShoppingBag, ShieldCheck,
  LayoutGrid, CreditCard, Utensils, TabletSmartphone, Package,
  ShoppingCart, Users, Banknote, Gift, BarChart3, MessageSquare,
  User, ChefHat, ClipboardList, Beer, Building2, UserCheck,
  Smartphone, Monitor, Wifi, CheckCircle2, Moon, Sun,
  Zap, Globe, Lock,
} from 'lucide-react';

interface WelcomeViewProps {
  onLogin: () => void;
  onClientLogin: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: 'easeOut' },
});

const features = [
  {
    icon: ShoppingCart,
    color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
    title: 'Point of Sale Terminal',
    desc: 'Barcode scanning, product search, category filtering, cart management with quantity controls.',
  },
  {
    icon: CreditCard,
    color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
    title: 'Multiple Payment Methods',
    desc: 'Cash, card, PayFast online payments, and staff wallet payments with change calculation.',
  },
  {
    icon: Utensils,
    color: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400',
    title: 'Restaurant Mode',
    desc: 'Table management, workstation routing, order lifecycle tracking from kitchen to delivery.',
  },
  {
    icon: Beer,
    color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
    title: 'Bar Tabs',
    desc: 'Open running tabs linked to customer profiles, add items over time, close when ready.',
  },
  {
    icon: Package,
    color: 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400',
    title: 'Inventory Management',
    desc: 'Full product CRUD, stock tracking, low-stock alerts, barcode/SKU support.',
  },
  {
    icon: Building2,
    color: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400',
    title: 'Vendor & Purchase Orders',
    desc: 'Manage suppliers, create once-off or recurring purchase orders with ease.',
  },
  {
    icon: Users,
    color: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400',
    title: 'Staff Management',
    desc: 'Role-based access (admin/manager/cashier), section restrictions, performance metrics.',
  },
  {
    icon: Banknote,
    color: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400',
    title: 'Cash Management',
    desc: 'Denomination-level float counting, session history, tip tracking, over/short reporting.',
  },
  {
    icon: Gift,
    color: 'bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-400',
    title: 'Loyalty Program',
    desc: 'Configurable points earning, redemption at checkout, customer wallet credits.',
  },
  {
    icon: BarChart3,
    color: 'bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400',
    title: 'Real-time Analytics',
    desc: 'Revenue trends, top products, average order value, 7-day charts.',
  },
  {
    icon: MessageSquare,
    color: 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400',
    title: 'Messaging',
    desc: 'Team chat, direct messages, workstation-to-server notifications, dev broadcasts.',
  },
  {
    icon: User,
    color: 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400',
    title: 'Customer Portal',
    desc: 'Public-facing login, purchase history, loyalty points, wallet & payout requests.',
  },
];

const restaurantFeatures = [
  {
    emoji: '🍽️',
    title: 'Table Management',
    desc: 'Visual floor plan with sections, occupied/available status, ready-item badges.',
  },
  {
    emoji: '👨‍🍳',
    title: 'Workstation Display',
    desc: 'Kitchen, bar, and custom stations with Accept → Ready workflow.',
  },
  {
    emoji: '📋',
    title: 'Order Lifecycle',
    desc: 'Pending → Accepted → Ready → Delivered item-level tracking.',
  },
  {
    emoji: '🍺',
    title: 'Bar Tabs',
    desc: 'Customer-linked running tabs with real-time totals.',
  },
];

const paymentMethods = [
  {
    icon: Banknote,
    color: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400',
    title: 'Cash',
    desc: 'Denomination counting, change calculation, float management.',
  },
  {
    icon: CreditCard,
    color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
    title: 'Card Terminal',
    desc: 'Integrated card payments with instant confirmation.',
  },
  {
    icon: Globe,
    color: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
    title: 'PayFast',
    desc: 'QR code and online payments via South Africa\'s leading gateway.',
  },
  {
    icon: UserCheck,
    color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
    title: 'Staff Wallet',
    desc: 'Staff can pay from their wallet balance — tracked and audited.',
  },
];

const pwaFeatures = [
  { icon: Smartphone, title: 'Install as PWA', desc: 'Add to home screen on any device — iOS, Android, or desktop.' },
  { icon: Monitor, title: 'Kiosk Mode', desc: 'Lock the display with Escape key for dedicated POS terminals.' },
  { icon: Wifi, title: 'Offline Capable', desc: 'Firebase persistence keeps you running even without internet.' },
  { icon: TabletSmartphone, title: 'Any Device', desc: 'Optimised for tablets, phones, and desktop workstations.' },
];

export function WelcomeView({ onLogin, onClientLogin, isDarkMode, toggleDarkMode }: WelcomeViewProps) {
  return (
    <div className={`min-h-screen w-full flex flex-col font-sans ${isDarkMode ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-50 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 sm:px-6 lg:px-12 flex items-center justify-between shadow-sm">
        <div className="font-extrabold text-xl tracking-tight text-primary flex items-center gap-2">
          <Store className="w-6 h-6" />
          <span>Jimmy's POS</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition text-slate-600 dark:text-slate-300"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={onClientLogin}
            className="hidden sm:flex px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition text-sm items-center gap-2 border border-slate-200 dark:border-slate-700"
          >
            <ShoppingBag className="w-4 h-4" />
            My Account
          </button>
          <button
            onClick={onLogin}
            className="px-4 sm:px-5 py-2 bg-primary text-white rounded-xl font-semibold shadow-md shadow-primary/20 hover:opacity-90 transition text-sm flex items-center gap-2"
          >
            <UserCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Staff Login</span>
            <span className="sm:hidden">Login</span>
          </button>
        </div>
      </header>

      <main className="flex-1">

        {/* ── 1. Hero ── */}
        <section className="relative overflow-hidden bg-white dark:bg-slate-900 py-20 lg:py-32">
          {/* Subtle gradient orbs */}
          <div className="pointer-events-none absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-blue-100 dark:bg-blue-900/20 blur-3xl opacity-50" />
          <div className="pointer-events-none absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-indigo-100 dark:bg-indigo-900/20 blur-3xl opacity-40" />

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-12 text-center">
            <motion.div {...fadeUp(0)} className="inline-flex items-center gap-2 mb-5 px-4 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold text-xs uppercase tracking-widest border border-blue-200 dark:border-blue-800">
              <Zap className="w-3 h-3" />
              South African Cloud POS
            </motion.div>

            <motion.h1 {...fadeUp(0.08)} className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight mb-6 leading-[1.1] text-slate-900 dark:text-white">
              The Complete Point of Sale{' '}
              <span className="text-primary">for Modern Business</span>
            </motion.h1>

            <motion.p {...fadeUp(0.16)} className="text-lg lg:text-xl text-slate-500 dark:text-slate-400 mb-10 leading-relaxed max-w-3xl mx-auto">
              From retail to restaurant — manage sales, staff, inventory, and customers from one powerful platform. Built on Firebase, works offline, installs as an app.
            </motion.p>

            <motion.div {...fadeUp(0.24)} className="flex flex-col sm:flex-row justify-center gap-4 mb-10">
              <button
                onClick={onLogin}
                className="px-8 py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 text-base"
              >
                Staff Portal
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={onClientLogin}
                className="px-8 py-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-bold hover:border-primary hover:text-primary dark:hover:border-primary dark:hover:text-primary active:scale-95 transition-all flex items-center justify-center gap-3 text-base"
              >
                <ShoppingBag className="w-5 h-5" />
                Customer Portal
              </button>
            </motion.div>

            <motion.div {...fadeUp(0.32)} className="flex flex-wrap justify-center gap-4 text-sm text-slate-500 dark:text-slate-400">
              {[
                { label: 'Firebase Secured', emoji: '🔒' },
                { label: 'PWA Ready', emoji: '📱' },
                { label: 'PayFast Integrated', emoji: '🇿🇦' },
              ].map((badge) => (
                <span key={badge.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium">
                  <span>{badge.emoji}</span>
                  {badge.label}
                </span>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── 2. Feature Grid ── */}
        <section className="py-20 lg:py-28 bg-slate-50 dark:bg-slate-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
            <motion.div {...fadeUp(0)} className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-3">
                Everything you need, nothing you don't
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-lg max-w-2xl mx-auto">
                A complete operating system for your business — from the first sale to end-of-day reports.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.05 * i, ease: 'easeOut' }}
                  className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>
                    <f.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white mb-1.5 text-sm">{f.title}</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3. Restaurant Highlight ── */}
        <section className="py-20 lg:py-28 bg-slate-900 dark:bg-slate-950 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
            <motion.div {...fadeUp(0)} className="text-center mb-14">
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-orange-500/10 text-orange-400 font-semibold text-xs uppercase tracking-widest border border-orange-500/20">
                <Utensils className="w-3 h-3" />
                Restaurant & Bar
              </div>
              <h2 className="text-3xl sm:text-4xl font-black mb-3">Built for the floor</h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                Purpose-built tools for hospitality — from the front of house to the kitchen pass.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {restaurantFeatures.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 * i, ease: 'easeOut' }}
                  className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors"
                >
                  <div className="text-3xl mb-4">{f.emoji}</div>
                  <h3 className="font-bold text-white mb-2">{f.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 4. Multi-tenant Architecture ── */}
        <section className="py-20 lg:py-28 bg-white dark:bg-slate-900">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12">
            <motion.div {...fadeUp(0)} className="text-center mb-14">
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold text-xs uppercase tracking-widest border border-blue-200 dark:border-blue-800">
                <LayoutGrid className="w-3 h-3" />
                Multi-tenant
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-3">
                One platform, many businesses
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-lg max-w-2xl mx-auto">
                Each business runs in its own isolated namespace — secure, scalable, and independent.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Lock,
                  color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
                  title: 'Isolated Data',
                  desc: 'Each business gets its own Firestore tenant namespace — data never crosses boundaries.',
                },
                {
                  icon: UserCheck,
                  color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
                  title: 'Staff Invitations',
                  desc: 'Staff find their tenant automatically on first login — no manual configuration needed.',
                },
                {
                  icon: ShoppingBag,
                  color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
                  title: 'Customer Accounts',
                  desc: 'Customers log in to view their history and wallet across every visit.',
                },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 * i, ease: 'easeOut' }}
                  className="flex flex-col items-start p-8 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:shadow-md transition-shadow"
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${item.color}`}>
                    <item.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg mb-2">{item.title}</h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 5. Payment Methods ── */}
        <section className="py-20 lg:py-28 bg-slate-50 dark:bg-slate-950">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12">
            <motion.div {...fadeUp(0)} className="text-center mb-14">
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-semibold text-xs uppercase tracking-widest border border-emerald-200 dark:border-emerald-800">
                <CreditCard className="w-3 h-3" />
                Payments
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-3">
                Accept payments your way
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-lg max-w-2xl mx-auto">
                Every payment method your customers expect — all in one checkout flow.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {paymentMethods.map((p, i) => (
                <motion.div
                  key={p.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 * i, ease: 'easeOut' }}
                  className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm text-center hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ${p.color}`}>
                    <p.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white mb-2">{p.title}</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{p.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 6. PWA & Kiosk ── */}
        <section className="py-20 lg:py-28 bg-white dark:bg-slate-900">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <motion.div {...fadeUp(0)}>
                <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold text-xs uppercase tracking-widest border border-indigo-200 dark:border-indigo-800">
                  <Smartphone className="w-3 h-3" />
                  PWA & Kiosk
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-4">
                  Works everywhere
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed mb-8">
                  Install Jimmy's POS as a native-feeling app on any device. No app store required — just open the browser and add to home screen.
                </p>
                <div className="flex flex-col gap-3">
                  {[
                    'Install as a PWA on iOS, Android, or desktop',
                    'Kiosk mode with Escape key lock for dedicated terminals',
                    'Offline-capable with Firebase local persistence',
                    'Responsive layout for tablets, phones, and desktops',
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                      <span className="text-slate-600 dark:text-slate-300 text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
                className="grid grid-cols-2 gap-4"
              >
                {pwaFeatures.map((f) => (
                  <div
                    key={f.title}
                    className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                      <f.icon className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1">{f.title}</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── 7. CTA ── */}
        <section className="py-20 lg:py-28 bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 text-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-12 text-center">
            <motion.div {...fadeUp(0)}>
              <div className="inline-flex items-center gap-2 mb-5 px-4 py-1.5 rounded-full bg-white/10 text-white font-semibold text-xs uppercase tracking-widest border border-white/20">
                <Zap className="w-3 h-3" />
                Get Started Today
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-5 leading-tight">
                Ready to modernise your business?
              </h2>
              <p className="text-blue-100 text-lg mb-10 leading-relaxed">
                Join businesses across South Africa running smarter with Jimmy's POS. Set up in minutes, scale without limits.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button
                  onClick={onLogin}
                  className="px-8 py-4 bg-white text-blue-700 rounded-2xl font-bold shadow-xl hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 text-base"
                >
                  Staff Portal
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={onClientLogin}
                  className="px-8 py-4 bg-white/10 text-white border-2 border-white/30 rounded-2xl font-bold hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center gap-3 text-base"
                >
                  <ShoppingBag className="w-5 h-5" />
                  Customer Portal
                </button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="py-8 bg-slate-900 dark:bg-slate-950 text-slate-500 text-sm text-center border-t border-slate-800">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Store className="w-4 h-4 text-primary" />
            <span className="font-bold text-slate-300">Jimmy's POS</span>
          </div>
          <p>Cloud-native point of sale. Built on Firebase. Made in South Africa 🇿🇦</p>
        </footer>

      </main>
    </div>
  );
}
