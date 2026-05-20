import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  ChartNoAxesCombined,
  CheckCircle2,
  ChefHat,
  Clock3,
  CreditCard,
  Lock,
  Moon,
  Package,
  ReceiptText,
  ScanBarcode,
  ShoppingBag,
  ShoppingCart,
  Store,
  Sun,
  UserCircle,
  Users,
  Utensils,
  WalletCards,
} from 'lucide-react';
import { PackagesPricing } from './PackagesPricing';

interface WelcomeViewProps {
  onLogin: () => void;
  onTryNow: () => void;
  onStartSetup: () => void;
  onClientLogin: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: 'easeOut' as const },
});

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Workflows', href: '#workflows' },
  { label: 'Industries', href: '#industries' },
  { label: 'Packages', href: '/packages' },
  { label: 'FAQ', href: '#faq' },
];

const featureCards = [
  {
    icon: ShoppingCart,
    title: 'Fast sales screen',
    desc: 'Ring up products, add customers, apply discounts, open tabs, and complete sales without sending staff through extra screens.',
  },
  {
    icon: CreditCard,
    title: 'Cash, card, wallet, and account sales',
    desc: 'Handle ordinary payments, customer wallets, payouts, tabs, and account activity from the same sales flow.',
  },
  {
    icon: Package,
    title: 'Stock and product control',
    desc: 'Manage products, categories, barcodes, stock levels, low-stock warnings, cost prices, and selling prices.',
  },
  {
    icon: Users,
    title: 'Staff access and accountability',
    desc: 'Set roles and permissions so cashiers, managers, chefs, and admins only see the tools they need.',
  },
  {
    icon: Utensils,
    title: 'Restaurant and takeaway tools',
    desc: 'Run tables, tabs, kitchen queues, takeaway orders, and workstation tickets without bolting on a second system.',
  },
  {
    icon: BarChart3,
    title: 'Reports owners can use',
    desc: 'See sales, stock movement, customer activity, staff performance, wallet balances, and daily operating totals.',
  },
];

const workflows = [
  {
    icon: ReceiptText,
    title: 'Daily sales',
    steps: ['Open the till', 'Sell products or services', 'Take payment', 'Print or reprint the receipt'],
  },
  {
    icon: ChefHat,
    title: 'Food service',
    steps: ['Open a table or tab', 'Send items to the kitchen', 'Track order status', 'Close out with the customer'],
  },
  {
    icon: WalletCards,
    title: 'Customer accounts',
    steps: ['Create or select a customer', 'Track wallet balances', 'Process payouts or refunds', 'Let clients view activity'],
  },
  {
    icon: Lock,
    title: 'Management control',
    steps: ['Assign staff roles', 'Review cash sessions', 'Check reports', 'Adjust settings when the business changes'],
  },
];

const industryCards = [
  {
    icon: Store,
    title: 'Retail stores',
    desc: 'Useful when you need fast scanning, clear product control, stock visibility, customer history, and simple checkout.',
  },
  {
    icon: Utensils,
    title: 'Restaurants',
    desc: 'Useful when you need tables, open tabs, kitchen coordination, order labels, and controlled staff access.',
  },
  {
    icon: ChefHat,
    title: 'Takeaways',
    desc: 'Useful when speed matters and orders need to move cleanly from counter to preparation to pickup.',
  },
  {
    icon: Building2,
    title: 'Growing operators',
    desc: 'Useful when the owner wants one place to manage sales, staff, stock, loyalty, cash, and reports.',
  },
];

const setupSteps = [
  {
    step: '1',
    title: 'Add your business details',
    desc: 'Set the name, trading setup, users, register limits, and the basic settings your team will use every day.',
  },
  {
    step: '2',
    title: 'Load products and staff',
    desc: 'Create categories, products, prices, barcodes, staff accounts, and the permissions each person should have.',
  },
  {
    step: '3',
    title: 'Start trading',
    desc: 'Use the POS screen for sales, then review cash sessions, stock movement, wallets, customers, and reports.',
  },
];

const productTiles = [
  ['Coffee', 'R32'],
  ['Burger', 'R89'],
  ['Chips', 'R28'],
  ['Combo', 'R119'],
  ['Muffin', 'R24'],
  ['Water', 'R16'],
];

const liveMetrics = [
  { label: 'Today', value: 'R18,420', trend: '+12%' },
  { label: 'Open tabs', value: '14', trend: 'live' },
  { label: 'Stock alerts', value: '6', trend: 'check' },
];

const visualPanels = [
  {
    icon: ScanBarcode,
    title: 'Retail counter',
    desc: 'Scan, sell, discount, take payment, and keep stock moving.',
    accent: 'from-emerald-500 to-blue-600',
  },
  {
    icon: ChefHat,
    title: 'Restaurant floor',
    desc: 'Tables, tabs, kitchen tickets, and takeaway orders in one flow.',
    accent: 'from-amber-400 to-red-600',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Owner dashboard',
    desc: 'Sales, cash sessions, wallets, staff activity, and stock reports.',
    accent: 'from-blue-500 to-slate-900',
  },
];

const faqItems = [
  {
    question: 'Is this only a till, or does it manage the business too?',
    answer: 'It is more than a till. The POS handles sales, but the same system also manages products, stock, staff permissions, customers, wallets, cash sessions, restaurant workflows, and reports.',
  },
  {
    question: 'Can it work for restaurants and takeaways?',
    answer: 'Yes. It includes table and tab flows, kitchen/workstation queues, takeaway handling, and staff roles for food service teams.',
  },
  {
    question: 'Can customers see their own account activity?',
    answer: 'Yes. The client portal gives customers a place to review linked account activity, wallet balances, and payout requests.',
  },
  {
    question: 'What should I check first when deciding if it fits?',
    answer: 'Check the feature list, the workflow section, and the package limits. Those show what the system actually does and whether it matches your daily operation.',
  },
];

const sectionClass = 'px-4 py-16 sm:px-6 lg:px-10';
const cardClass = 'rounded-lg border border-slate-200 bg-white p-6 shadow-[0_18px_70px_-45px_rgba(15,23,42,0.45)] transition hover:-translate-y-1 hover:shadow-[0_24px_90px_-48px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-900';

function PremiumPosShowcase() {
  return (
    <motion.div
      {...fadeUp(0.1)}
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-3 shadow-[0_34px_110px_-35px_rgba(15,23,42,0.8)] dark:border-slate-800"
    >
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-emerald-500/25 via-blue-500/20 to-amber-400/20" />
      <div className="relative rounded-xl border border-white/10 bg-slate-900 p-4 text-white">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-300">Live POS terminal</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">Counter ready</h2>
          </div>
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-emerald-950"
          >
            Online
          </motion.div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.82fr]">
          <div className="rounded-xl bg-white p-4 text-slate-950">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Products</p>
                <p className="text-lg font-black">Quick sale</p>
              </div>
              <ScanBarcode className="h-5 w-5 text-blue-600" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {productTiles.map(([name, price], index) => (
                <motion.div
                  key={name}
                  animate={{ y: [0, index % 2 === 0 ? -3 : 3, 0] }}
                  transition={{ duration: 4 + index * 0.25, repeat: Infinity, ease: 'easeInOut' }}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="h-16 rounded-md bg-gradient-to-br from-slate-200 via-white to-blue-100" />
                  <p className="mt-3 text-sm font-black">{name}</p>
                  <p className="text-xs font-bold text-slate-500">{price}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black">Current sale</p>
                <Clock3 className="h-4 w-4 text-blue-300" />
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ['Burger combo', 'R119'],
                  ['Coffee', 'R32'],
                  ['Loyalty discount', '-R10'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                    <span className="text-slate-300">{label}</span>
                    <span className="font-black">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-blue-500 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-100">Total due</p>
                <p className="mt-1 text-3xl font-black">R141</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {liveMetrics.map((metric, index) => (
                <motion.div
                  key={metric.label}
                  animate={{ opacity: [0.82, 1, 0.82] }}
                  transition={{ duration: 3 + index * 0.35, repeat: Infinity, ease: 'easeInOut' }}
                  className="rounded-lg border border-white/10 bg-white/5 p-3"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{metric.label}</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-xl font-black">{metric.value}</p>
                    <span className="rounded-md bg-emerald-400/15 px-2 py-1 text-xs font-black text-emerald-300">{metric.trend}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function VisualWorkflowPanels() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp(0)} className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Built like a flagship system</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Visual workflows that make the platform feel alive.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
            The home page now shows the product as a working operating system: counter, kitchen, customer, and owner views all moving together.
          </p>
        </motion.div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {visualPanels.map((panel, index) => (
            <motion.div
              key={panel.title}
              {...fadeUp(0.05 * index)}
              whileHover={{ y: -6 }}
              className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_100px_-45px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-slate-900"
            >
              <div className={`relative h-56 overflow-hidden bg-gradient-to-br ${panel.accent}`}>
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.18)_0,rgba(255,255,255,0)_42%),radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.25),transparent_28%)]" />
                <motion.div
                  animate={{ x: ['-8%', '8%', '-8%'] }}
                  transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute left-6 top-8 h-28 w-44 rounded-xl border border-white/25 bg-white/20 p-3 backdrop-blur"
                >
                  <div className="h-3 w-20 rounded-full bg-white/75" />
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[0, 1, 2, 3, 4, 5].map((item) => (
                      <div key={item} className="h-8 rounded-md bg-white/30" />
                    ))}
                  </div>
                </motion.div>
                <motion.div
                  animate={{ y: [0, -12, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute bottom-6 right-6 w-44 rounded-xl border border-white/25 bg-slate-950/75 p-4 text-white shadow-2xl"
                >
                  <panel.icon className="h-6 w-6 text-white" />
                  <div className="mt-4 h-2 w-24 rounded-full bg-white/70" />
                  <div className="mt-3 h-2 w-16 rounded-full bg-white/35" />
                </motion.div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">{panel.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{panel.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function WelcomeView({ onLogin, onTryNow, onStartSetup, onClientLogin, isDarkMode, toggleDarkMode }: WelcomeViewProps) {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className={`min-h-screen w-full flex flex-col font-sans ${isDarkMode ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-slate-950 dark:text-white">Jimmy&apos;s POS</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Point of sale and operations system</p>
            </div>
          </div>

          <nav className="hidden items-center gap-7 lg:flex">
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm font-semibold text-slate-600 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleDarkMode}
              aria-label="Toggle dark mode"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={onClientLogin}
              className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:flex"
            >
              <ShoppingBag className="h-4 w-4" />
              Client Login
            </button>
            <button
              onClick={onLogin}
              className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 lg:flex"
            >
              <UserCircle className="h-4 w-4" />
              Admin Login
            </button>
            <button
              onClick={onTryNow}
              className="flex items-center gap-2 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              Try Now
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef6ff_100%)] px-4 py-16 dark:border-slate-800 dark:bg-[linear-gradient(135deg,#020617_0%,#0f172a_58%,#082f49_100%)] sm:px-6 lg:px-10 lg:py-24">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-green-600 via-yellow-400 via-red-600 to-blue-700" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <motion.div {...fadeUp(0)} className="max-w-4xl">
              <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Simple POS information, no fluff</p>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
                See what Jimmy&apos;s POS actually does before you book a demo.
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600 dark:text-slate-300">
                Jimmy&apos;s POS is for businesses that need a sales screen, stock control, staff permissions, customer accounts, restaurant workflows, cash control, and useful reports in one place.
              </p>
              <div className="mt-5 inline-flex max-w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left dark:border-slate-800 dark:bg-slate-900">
                <div className="flex shrink-0 overflow-hidden rounded-sm border border-slate-300 dark:border-slate-700">
                  <span className="h-7 w-2.5 bg-green-600" />
                  <span className="h-7 w-2.5 bg-yellow-400" />
                  <span className="h-7 w-2.5 bg-slate-950 dark:bg-slate-100" />
                  <span className="h-7 w-2.5 bg-red-600" />
                  <span className="h-7 w-2.5 bg-blue-700" />
                </div>
                <p className="text-sm font-bold leading-6 text-slate-800 dark:text-slate-200">
                  Proudly South African platform, built for local retailers, restaurants, takeaways, and growing operators.
                </p>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  onClick={onTryNow}
                  className="inline-flex items-center justify-center gap-3 rounded-lg bg-blue-600 px-7 py-3.5 text-base font-bold text-white transition hover:bg-blue-500"
                >
                  Try the POS
                  <ArrowRight className="h-5 w-5" />
                </button>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-7 py-3.5 text-base font-bold text-slate-900 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
                >
                  View features
                </a>
                <button
                  onClick={onStartSetup}
                  className="inline-flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-7 py-3.5 text-base font-bold text-slate-900 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
                >
                  Start setup
                </button>
              </div>
            </motion.div>

            <PremiumPosShowcase />
          </div>
        </section>

        <section id="features" className={sectionClass}>
          <div className="mx-auto max-w-7xl">
            <motion.div {...fadeUp(0)} className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Core features</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                The practical tools a POS buyer usually checks first.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
                These are the everyday parts of the system, not vague promises. If your operation needs these workflows, Jimmy&apos;s POS is built for that.
              </p>
            </motion.div>

            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {featureCards.map((item, index) => (
                <motion.div key={item.title} {...fadeUp(0.05 * index)} className={cardClass}>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-xl font-black tracking-tight text-slate-950 dark:text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <VisualWorkflowPanels />

        <section id="workflows" className="border-y border-slate-200 bg-white px-4 py-16 dark:border-slate-800 dark:bg-slate-950 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <motion.div {...fadeUp(0)} className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Workflows</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                How work moves through the POS.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
                A buyer should be able to picture a normal trading day. These are the main flows staff and managers use.
              </p>
            </motion.div>

            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {workflows.map((workflow, index) => (
                <motion.div key={workflow.title} {...fadeUp(0.05 * index)} className={cardClass}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                      <workflow.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">{workflow.title}</h3>
                  </div>
                  <ol className="mt-5 space-y-3">
                    {workflow.steps.map((step, stepIndex) => (
                      <li key={step} className="flex gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {stepIndex + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="client-login" className={sectionClass}>
          <div className="mx-auto grid max-w-7xl items-center gap-6 rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-500/20 dark:bg-emerald-500/10 md:grid-cols-[1fr_auto] md:p-8">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Customer portal</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                Customers can check account activity without calling the store.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700 dark:text-slate-300">
                The client login gives customers access to linked account activity, wallet balances, and payout requests connected to their customer profile.
              </p>
            </div>
            <button
              onClick={onClientLogin}
              className="inline-flex items-center justify-center gap-3 rounded-lg bg-emerald-600 px-7 py-3.5 text-base font-bold text-white transition hover:bg-emerald-500"
            >
              <ShoppingBag className="h-5 w-5" />
              Client Login
            </button>
          </div>
        </section>

        <PackagesPricing onStartSetup={onStartSetup} />

        <section id="industries" className="border-y border-slate-200 bg-slate-950 px-4 py-16 text-white dark:border-slate-800 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <motion.div {...fadeUp(0)} className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-wide text-blue-300">Best fit</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Built for businesses that need daily operating control.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-300">
                The system makes the most sense when sales, stock, staff, customers, and reporting all matter to the same business owner.
              </p>
            </motion.div>

            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {industryCards.map((item, index) => (
                <motion.div
                  key={item.title}
                  {...fadeUp(0.05 * index)}
                  className="rounded-lg border border-white/10 bg-white/5 p-6"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-xl font-black tracking-tight">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="setup" className={sectionClass}>
          <div className="mx-auto max-w-7xl">
            <motion.div {...fadeUp(0)} className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Setup</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                What getting started actually involves.
              </h2>
            </motion.div>

            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {setupSteps.map((item, index) => (
                <motion.div key={item.step} {...fadeUp(0.05 * index)} className={cardClass}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-base font-black text-white dark:bg-white dark:text-slate-950">
                    {item.step}
                  </div>
                  <h3 className="mt-5 text-xl font-black tracking-tight text-slate-950 dark:text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.desc}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={onStartSetup}
                className="inline-flex items-center justify-center gap-3 rounded-lg bg-blue-600 px-7 py-3.5 text-base font-bold text-white transition hover:bg-blue-500"
              >
                Start Setup
                <ArrowRight className="h-5 w-5" />
              </button>
              <button
                onClick={onLogin}
                className="inline-flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-7 py-3.5 text-base font-bold text-slate-900 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
              >
                Admin Login
              </button>
            </div>
          </div>
        </section>

        <section id="faq" className="border-t border-slate-200 bg-white px-4 py-16 dark:border-slate-800 dark:bg-slate-950 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-5xl">
            <motion.div {...fadeUp(0)} className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">FAQ</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Straight answers for POS buyers.
              </h2>
            </motion.div>

            <div className="mt-8 space-y-3">
              {faqItems.map((item, index) => {
                const isOpen = openFaq === index;
                return (
                  <motion.button
                    key={item.question}
                    type="button"
                    aria-label={isOpen ? 'Collapse FAQ' : 'Expand FAQ'}
                    {...fadeUp(0.04 * index)}
                    onClick={() => setOpenFaq(isOpen ? -1 : index)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 p-5 text-left transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-4">
                      <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
                      <div>
                        <h3 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">{item.question}</h3>
                        {isOpen && (
                          <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.answer}</p>
                        )}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="mx-auto grid max-w-7xl items-center gap-6 rounded-lg border border-slate-200 bg-slate-950 p-6 text-white dark:border-slate-800 md:grid-cols-[1fr_auto] md:p-8">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-blue-300">Ready to check it properly?</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Try the POS or start setting up a real business profile.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                The fastest way to judge the system is to test the sales flow, product setup, staff controls, customer tools, and reports against your own operation.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
              <button
                onClick={onTryNow}
                className="inline-flex items-center justify-center gap-3 rounded-lg bg-white px-7 py-3.5 text-base font-bold text-slate-950 transition hover:bg-slate-100"
              >
                Try Now
                <ArrowRight className="h-5 w-5" />
              </button>
              <button
                onClick={onStartSetup}
                className="inline-flex items-center justify-center gap-3 rounded-lg border border-white/20 bg-white/10 px-7 py-3.5 text-base font-bold text-white transition hover:bg-white/15"
              >
                Start Setup
              </button>
            </div>
          </div>
        </section>

        <footer className="border-t border-slate-200 px-4 py-8 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <Store className="h-4 w-4" />
              </div>
              <div className="text-center sm:text-left">
                <p className="font-black text-slate-900 dark:text-white">Jimmy&apos;s POS</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Proudly South African. Sales, stock, staff, customers, cash, and reports.</p>
              </div>
            </div>
            <button
              onClick={onLogin}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              <UserCircle className="h-4 w-4" />
              Admin Login
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
