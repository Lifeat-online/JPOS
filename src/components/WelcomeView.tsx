import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Building2,
  CheckCircle2,
  ChefHat,
  CreditCard,
  Gift,
  LayoutGrid,
  Lock,
  Moon,
  Package,
  ShoppingBag,
  ShoppingCart,
  ShieldCheck,
  Sparkles,
  Store,
  Sun,
  UserCircle,
  Users,
  Utensils,
  Zap,
} from 'lucide-react';

interface WelcomeViewProps {
  onLogin: () => void;
  onClientLogin: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay, ease: 'easeOut' as const },
});

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Industries', href: '#industries' },
  { label: 'Setup', href: '#setup' },
  { label: 'FAQ', href: '#faq' },
];

const proofStats = [ 
  { value: 'Instant', label: 'payment processing across cash, card, and wallets' }, 
  { value: 'Live', label: 'stock tracking that stops costly surprises before they happen' }, 
  { value: 'Built-in', label: 'customer loyalty that turns one-time buyers into regulars' }, 
  { value: 'Clear', label: 'daily reports that show exactly where your business stands' }, 
];

const heroHighlights = [
  {
    icon: ShoppingCart,
    title: 'Faster checkout',
    desc: 'Serve more customers with a polished till experience built for pace.',
  },
  {
    icon: Package,
    title: 'Sharper stock control',
    desc: 'Stay on top of products, counts, and movement before profit leaks away.',
  },
  {
    icon: Gift,
    title: 'Better repeat business',
    desc: 'Turn everyday visits into loyalty with customer-aware selling tools.',
  },
];

const featureCards = [
  {
    icon: Zap,
    title: 'Checkout That Feels Premium',
    desc: 'Speed through transactions with a terminal designed to feel effortless for staff and customers alike.',
  },
  {
    icon: CreditCard,
    title: 'Flexible Payments',
    desc: 'Take cash, card, wallets, and modern payment flows without breaking momentum at the counter.',
  },
  {
    icon: Package,
    title: 'Inventory And Product Control',
    desc: 'Manage product ranges, monitor stock levels, and keep merchandising decisions tied to live movement.',
  },
  {
    icon: Users,
    title: 'Staff And Permission Layers',
    desc: 'Give every team member the right level of access while keeping accountability clear behind the scenes.',
  },
  {
    icon: Gift,
    title: 'Customer Loyalty',
    desc: 'Track customers, reward repeat spend, and create a more valuable relationship beyond a single sale.',
  },
  {
    icon: BarChart3,
    title: 'Reporting That Guides Decisions',
    desc: 'See what is selling, who is performing, and where revenue is coming from while trade is still happening.',
  },
];

const showcaseCards = [
  {
    icon: ShoppingCart,
    title: 'Front Counter',
    desc: 'Clean cart flow, quick item handling, and payment-ready checkout built for busy hours.',
  },
  {
    icon: Package,
    title: 'Back Office',
    desc: 'Products, inventory, pricing, staff, and settings managed from a clearer control layer.',
  },
  {
    icon: BarChart3,
    title: 'Owner Visibility',
    desc: 'Sales trends, product performance, and operational clarity in a format that feels executive-ready.',
  },
];

const industryCards = [
  {
    icon: Store,
    title: 'Retail',
    desc: 'Built for stores that need faster service, stronger inventory control, and reporting that supports daily decisions.',
  },
  {
    icon: Utensils,
    title: 'Restaurants',
    desc: 'Built for teams managing tables, kitchen coordination, and a guest experience that cannot afford friction.',
  },
  {
    icon: ChefHat,
    title: 'Takeaways',
    desc: 'Built for high-volume order flow where speed, accuracy, and repeat customer value matter every shift.',
  },
  {
    icon: Building2,
    title: 'Growing Operators',
    desc: 'Built for ambitious businesses ready to level up the feel, control, and professionalism of the entire operation.',
  },
];

const setupSteps = [
  {
    step: '01',
    title: 'Sign up',
    desc: 'Create your entry point and get into the platform with a cleaner, more premium first-run experience.',
  },
  {
    step: '02',
    title: 'Start setup',
    desc: 'Configure your business, products, and trading preferences so the POS reflects how you actually operate.',
  },
  {
    step: '03',
    title: 'Go live fast',
    desc: 'Put your team onto a polished interface that is built to sell, manage, and scale from day one.',
  },
];

const trustPillars = [ 
  { 
    icon: Lock, 
    title: 'Your data stays yours', 
    desc: 'Role-based access and permission layers mean the right people see the right things — and nothing more.', 
  }, 
  { 
    icon: LayoutGrid, 
    title: 'Everything in one place', 
    desc: 'No switching between systems. Sales, stock, staff, loyalty, and reporting all live in a single platform.', 
  }, 
  { 
    icon: CheckCircle2, 
    title: 'Ready from day one', 
    desc: 'Set up your products, configure your preferences, and start trading with a system built to scale alongside you.', 
  }, 
];

const faqItems = [ 
  { 
    question: 'What makes Jimmy\'s POS different from a basic till app?', 
    answer: 'Jimmy\'s POS combines fast checkout with a full back-office suite — inventory control, customer loyalty, staff permissions, hospitality workflows, cash management, and reporting — all in one system designed to feel premium from the first screen.', 
  }, 
  { 
    question: 'Can I use it for a restaurant or takeaway, not just retail?', 
    answer: 'Yes. The system includes open tab management, kitchen-ready order flow, and table coordination built specifically for food and beverage operators who cannot afford slowdowns during a busy shift.', 
  }, 
  { 
    question: 'How long does it take to get set up and trading?', 
    answer: 'Most businesses are live within a single session. Create your account, add your products and pricing, configure your preferences, and your team can start trading on a polished, professional interface the same day.', 
  }, 
  { 
    question: 'Who is Jimmy\'s POS best suited for?', 
    answer: 'Retailers, restaurants, takeaways, and growth-focused operators who want a faster, more professional operating system — one that handles daily trade while giving the owner clear visibility of every corner of the business.', 
  }, 
];

const centeredCard =
  'group relative overflow-hidden rounded-[32px] border border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl shadow-[0_30px_120px_-40px_rgba(15,23,42,0.35)] transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_40px_140px_-40px_rgba(37,99,235,0.35)]';

export function WelcomeView({ onLogin, onClientLogin, isDarkMode, toggleDarkMode }: WelcomeViewProps) {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className={`min-h-screen w-full flex flex-col font-sans ${isDarkMode ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-10%] top-[-8%] h-[32rem] w-[32rem] rounded-full bg-blue-400/20 blur-3xl dark:bg-blue-500/15" />
        <div className="absolute right-[-10%] top-[10%] h-[28rem] w-[28rem] rounded-full bg-violet-400/20 blur-3xl dark:bg-violet-500/15" />
        <div className="absolute bottom-[-10%] left-[20%] h-[26rem] w-[26rem] rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/10" />
      </div>

      <header className="sticky top-0 z-50 border-b border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-lg shadow-blue-600/25">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-slate-950 dark:text-white">Jimmy&apos;s POS</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">Premium Commerce</p>
            </div>
          </div>

          <nav className="hidden items-center gap-8 lg:flex">
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm font-semibold text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleDarkMode}
              aria-label="Toggle dark mode"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={onClientLogin}
              className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white sm:flex"
            >
              <ShoppingBag className="h-4 w-4" />
              My Account
            </button>
            <button
              onClick={onLogin}
              className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white lg:flex"
            >
              <UserCircle className="h-4 w-4" />
              Staff Login
            </button>
            <button
              onClick={onLogin}
              className="flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-slate-950/20 transition hover:scale-[1.01] hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              <Sparkles className="h-4 w-4" />
              Try Now
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden px-4 pb-24 pt-14 sm:px-6 lg:px-10 lg:pb-32 lg:pt-20">
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="text-center lg:text-left">
              <motion.div
                {...fadeUp(0)}
                className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.26em] text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Luxury-Grade POS Experience
              </motion.div>

              <motion.h1
                {...fadeUp(0.08)}
                className="mx-auto mt-8 max-w-5xl text-5xl font-black tracking-[-0.06em] text-slate-950 dark:text-white sm:text-6xl lg:mx-0 lg:text-[5.5rem] lg:leading-[0.95]"
              >
                A point of sale system built to make
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent"> checkout, stock, loyalty, and operations feel world-class.</span>
              </motion.h1>

              <motion.p
                {...fadeUp(0.16)}
                className="mx-auto mt-8 max-w-3xl text-lg leading-8 text-slate-600 dark:text-slate-300 lg:mx-0 lg:text-[1.35rem] lg:leading-9"
              >
                Jimmy&apos;s POS gives ambitious businesses the features they actually need in one polished system: fast checkout, flexible payments, inventory control, customer loyalty, staff permissions, hospitality workflows, cash management, and reporting that helps you run smarter.
              </motion.p>

              <motion.div {...fadeUp(0.24)} className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
                <button
                  onClick={onLogin}
                  className="inline-flex items-center justify-center gap-3 rounded-2xl bg-blue-600 px-8 py-4 text-base font-bold text-white shadow-[0_24px_80px_-24px_rgba(37,99,235,0.75)] transition hover:scale-[1.02] hover:bg-blue-500"
                >
                  Try Now
                  <ArrowRight className="h-5 w-5" />
                </button>
                <button
                  onClick={onLogin}
                  className="inline-flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-8 py-4 text-base font-bold text-slate-900 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:hover:border-slate-700 dark:hover:bg-slate-800"
                >
                  Start Setup
                </button>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-3 rounded-2xl bg-slate-950 px-8 py-4 text-base font-bold text-white transition hover:scale-[1.02] hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                >
                  Explore Features
                </a>
              </motion.div>

              <motion.div {...fadeUp(0.32)} className="mt-12 grid gap-4 sm:grid-cols-3">
                {heroHighlights.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-[26px] border border-slate-200/80 bg-white/85 px-5 py-5 text-center shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70"
                  >
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-sm font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.desc}</p>
                  </div>
                ))}
              </motion.div>
            </div>

            <motion.div {...fadeUp(0.18)} className="relative mx-auto w-full max-w-xl">
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -right-6 top-10 hidden w-44 rounded-[26px] border border-white/60 bg-white/90 p-4 text-center shadow-[0_30px_80px_-35px_rgba(15,23,42,0.4)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/85 lg:block"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
                  <CreditCard className="h-5 w-5" />
                </div>
                <p className="mt-3 text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">Payments</p>
                <p className="mt-2 text-lg font-black tracking-tight text-slate-950 dark:text-white">Smooth, modern, fast</p>
              </motion.div>

              <motion.div
                animate={{ y: [0, 12, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -left-6 bottom-12 hidden w-48 rounded-[26px] border border-white/60 bg-white/90 p-4 text-center shadow-[0_30px_80px_-35px_rgba(15,23,42,0.4)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/85 lg:block"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white">
                  <Package className="h-5 w-5" />
                </div>
                <p className="mt-3 text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">Inventory</p>
                <p className="mt-2 text-lg font-black tracking-tight text-slate-950 dark:text-white">Clear stock visibility</p>
              </motion.div>

              <div className="absolute inset-0 rounded-[42px] bg-gradient-to-br from-blue-500/20 via-violet-500/10 to-cyan-400/20 blur-2xl" />
              <div className="relative rounded-[42px] border border-white/70 bg-white/80 p-6 shadow-[0_50px_140px_-50px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/75">
                <div className="rounded-[34px] border border-slate-200/80 bg-slate-950 p-7 text-white dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-300">Luxury POS Suite</p>
                      <h3 className="mt-2 text-3xl font-black tracking-tight">One system. Every essential feature.</h3>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-3 py-2 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">Ready To</p>
                      <p className="mt-1 text-sm font-black">Try Now</p>
                    </div>
                  </div>

                  <div className="mt-8 rounded-[30px] border border-white/10 bg-white/5 p-5">
                    <div className="grid gap-4 sm:grid-cols-3">
                      {showcaseCards.map((item) => (
                        <div key={item.title} className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-5 text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                            <item.icon className="h-5 w-5 text-blue-300" />
                          </div>
                          <p className="mt-4 text-sm font-black uppercase tracking-[0.18em] text-white">{item.title}</p>
                          <p className="mt-2 text-xs leading-6 text-slate-300">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {[
                      { label: 'Open Tabs', value: 'Hospitality-ready' },
                      { label: 'Cashups', value: 'Manager clarity' },
                      { label: 'Loyalty', value: 'Repeat spend' },
                      { label: 'Reports', value: 'Decision-ready' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-[26px] border border-white/10 bg-gradient-to-br from-white/10 to-white/5 px-5 py-6 text-center">
                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/65">{item.label}</p>
                        <p className="mt-3 text-2xl font-black tracking-tight text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="px-4 py-8 sm:px-6 lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {proofStats.map((stat, index) => (
              <motion.div
                key={stat.label}
                {...fadeUp(0.05 * index)}
                className={`${centeredCard} px-6 py-8 text-center`}
              >
                <p className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">{stat.value}</p>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="features" className="px-4 py-24 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <motion.div {...fadeUp(0)} className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <Zap className="h-3.5 w-3.5" />
                Core POS Features
              </div>
              <h2 className="mt-7 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                Everything a serious POS should do, presented like a premium product.
              </h2>
              <p className="mt-6 text-lg leading-8 text-slate-600 dark:text-slate-300">
                From the first tap at the counter to the last report of the day, every feature in Jimmy's POS is built around one goal: helping your business run faster, tighter, and more profitably.
              </p>
            </motion.div>

            <div className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {featureCards.map((item, index) => (
                <motion.div
                  key={item.title}
                  {...fadeUp(0.08 * index)}
                  className={`${centeredCard} px-8 py-10 text-center`}
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-600/20">
                    <item.icon className="h-7 w-7" />
                  </div>
                  <h3 className="mt-6 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{item.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-[36px] border border-slate-200/80 bg-white/85 px-6 py-12 shadow-[0_30px_90px_-30px_rgba(15,23,42,0.2)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 sm:px-10 lg:px-12">
            <motion.div {...fadeUp(0)} className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                <Sparkles className="h-3.5 w-3.5" />
                Built For The Counter And The Back Office
              </div>
              <h2 className="mt-6 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                One system that handles every part of the trading day.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">
                From the first sale of the day to the end-of-day cashup, Jimmy&apos;s POS gives your team the speed they need at the counter and gives you the clarity you need in the back office.
              </p>
            </motion.div>

            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {showcaseCards.map((item, index) => (
                <motion.div
                  key={item.title}
                  {...fadeUp(0.06 * index)}
                  className={`${centeredCard} px-8 py-10 text-center`}
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-slate-950 text-white shadow-lg shadow-slate-950/15 dark:bg-white dark:text-slate-950">
                    <item.icon className="h-7 w-7" />
                  </div>
                  <h3 className="mt-6 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{item.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="industries" className="bg-slate-950 px-4 py-28 text-white sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <motion.div {...fadeUp(0)} className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-blue-300">
                <Store className="h-3.5 w-3.5" />
                Built For Real Operators
              </div>
              <h2 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-5xl">
                Purpose-built for the businesses that need more than a basic till.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-300">
                Whether the pressure is queue speed, table flow, stock visibility, or repeat spend, Jimmy's POS gives you the tools to stay ahead of it — every shift, every day.
              </p>
            </motion.div>

            <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {industryCards.map((item, index) => (
                <motion.div
                  key={item.title}
                  {...fadeUp(0.07 * index)}
                  className="rounded-[30px] border border-white/10 bg-white/5 px-8 py-9 text-center backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:bg-white/10"
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-white/10 text-white">
                    <item.icon className="h-7 w-7" />
                  </div>
                  <h3 className="mt-6 text-2xl font-black tracking-tight">{item.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-slate-300">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="results" className="px-4 py-28 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <motion.div {...fadeUp(0)} className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                <BarChart3 className="h-3.5 w-3.5" />
                Why Operators Choose Jimmy's POS
              </div>
              <h2 className="mt-6 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                A system serious enough to run your business on, polished enough to impress your customers.
              </h2>
            </motion.div>

            <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <motion.div {...fadeUp(0.08)} className={`${centeredCard} px-8 py-10 text-center`}>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/20">
                  <ShieldCheck className="h-7 w-7" />
                </div>
                <h3 className="mt-6 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                  Stop stitching together separate tools. Run everything from one place.
                </h3>
                <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300">
                  Jimmy's POS brings checkout speed, payment flexibility, stock control, customer loyalty, staff management, hospitality workflows, and business reporting into a single system — so nothing falls through the cracks during a busy trading day.
                </p>
              </motion.div>

              <div className="grid gap-6">
                {trustPillars.map((item, index) => (
                  <motion.div
                    key={item.title}
                    {...fadeUp(0.12 + index * 0.06)}
                    className={`${centeredCard} px-8 py-8 text-center`}
                  >
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
                      <item.icon className="h-6 w-6" />
                    </div>
                    <h3 className="mt-5 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="setup" className="px-4 py-28 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-[40px] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-14 text-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.7)] sm:px-10 lg:px-12">
            <motion.div {...fadeUp(0)} className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-blue-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Start Fast
              </div>
              <h2 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
                Sign up, try the system, and move straight into setup.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-300">
                No lengthy onboarding. No complicated setup. Just sign up, configure your business, and put your team on a system built to trade from day one.
              </p>
            </motion.div>

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {setupSteps.map((item, index) => (
                <motion.div
                  key={item.step}
                  {...fadeUp(0.08 * index)}
                  className="rounded-[30px] border border-white/10 bg-white/5 px-8 py-9 text-center backdrop-blur-sm"
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-lg font-black tracking-[0.12em] text-blue-300">
                    {item.step}
                  </div>
                  <h3 className="mt-6 text-2xl font-black tracking-tight">{item.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-slate-300">{item.desc}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button
                onClick={onLogin}
                className="inline-flex items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-base font-black text-slate-950 transition hover:scale-[1.02] hover:bg-slate-100"
              >
                Sign Up
                <ArrowRight className="h-5 w-5" />
              </button>
              <button
                onClick={onLogin}
                className="inline-flex items-center justify-center gap-3 rounded-2xl border border-white/20 bg-blue-600/30 px-8 py-4 text-base font-black text-white transition hover:scale-[1.02] hover:bg-blue-500/40"
              >
                Start Setup
              </button>
            </div>
          </div>
        </section>

        <section id="faq" className="px-4 py-24 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-5xl">
            <motion.div {...fadeUp(0)} className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <Sparkles className="h-3.5 w-3.5" />
                FAQ
              </div>
              <h2 className="mt-6 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                Answers to the questions we hear most.
              </h2>
            </motion.div>

            <div className="mt-12 space-y-4">
              {faqItems.map((item, index) => {
                const isOpen = openFaq === index;
                return (
                  <motion.button
                    key={item.question}
                    type="button"
                    aria-label={isOpen ? 'Collapse FAQ' : 'Expand FAQ'}
                    {...fadeUp(0.05 * index)}
                    onClick={() => setOpenFaq(isOpen ? -1 : index)}
                    className="w-full rounded-[28px] border border-slate-200 bg-white px-6 py-6 text-center shadow-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="mx-auto flex max-w-3xl flex-col items-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <h3 className="mt-4 text-xl font-black tracking-tight text-slate-950 dark:text-white">{item.question}</h3>
                      {isOpen && (
                        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">{item.answer}</p>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-4 pb-24 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-5xl rounded-[40px] border border-blue-200 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 px-6 py-14 text-center text-white shadow-[0_40px_120px_-40px_rgba(37,99,235,0.7)] sm:px-10">
            <motion.div {...fadeUp(0)}>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-white">
                <Zap className="h-3.5 w-3.5" />
                Start Trading Smarter Today
              </div>
              <h2 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
                Set up once. Sell faster. Run a tighter operation every single day.
              </h2>
              <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-blue-100">
                Jimmy's POS gives your business the checkout speed, stock control, customer loyalty, and reporting clarity that serious operators rely on. Get started in minutes — no IT skills required.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <button
                  onClick={onLogin}
                  className="inline-flex items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-base font-black text-blue-700 transition hover:scale-[1.02] hover:bg-blue-50"
                >
                  Try Now
                  <ArrowRight className="h-5 w-5" />
                </button>
                <button
                  onClick={onLogin}
                  className="inline-flex items-center justify-center gap-3 rounded-2xl border border-white/25 bg-white/10 px-8 py-4 text-base font-black text-white transition hover:scale-[1.02] hover:bg-white/20"
                >
                  Start Setup
                </button>
                <button
                  onClick={onClientLogin}
                  className="inline-flex items-center justify-center gap-3 rounded-2xl border border-white/25 bg-transparent px-8 py-4 text-base font-black text-white transition hover:scale-[1.02] hover:bg-white/10"
                >
                  <ShoppingBag className="h-5 w-5" />
                  Customer Portal
                </button>
              </div>
            </motion.div>
          </div>
        </section>

        <footer className="border-t border-slate-200/80 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <Store className="h-4 w-4" />
              </div>
              <div className="text-center sm:text-left">
                <p className="font-black text-slate-900 dark:text-white">Jimmy&apos;s POS</p>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">Built for pace. Designed for growth.</p>
              </div>
            </div>
            <button
              onClick={onLogin}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              <UserCircle className="h-4 w-4" />
              Staff Login
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
