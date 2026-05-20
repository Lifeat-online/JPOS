import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChefHat,
  CreditCard,
  LayoutGrid,
  Lock,
  Moon,
  Package,
  ReceiptText,
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

const comparisonRows = [
  ['Front counter', 'Sales screen, discounts, customers, receipts, cash/card/wallet payments'],
  ['Restaurant floor', 'Tables, tabs, takeaway orders, kitchen queue, workstation tickets'],
  ['Back office', 'Products, stock, staff, permissions, business settings, package limits'],
  ['Money control', 'Cash sessions, movements, wallet balances, refunds, payouts, daily totals'],
  ['Customer retention', 'Customer profiles, loyalty activity, wallets, client portal access'],
  ['Owner visibility', 'Sales reports, product movement, staff activity, stock alerts, operating summaries'],
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
const cardClass = 'rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900';

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
        <section className="border-b border-slate-200 bg-white px-4 py-16 dark:border-slate-800 dark:bg-slate-950 sm:px-6 lg:px-10 lg:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <motion.div {...fadeUp(0)} className="max-w-4xl">
              <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Simple POS information, no fluff</p>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
                See what Jimmy&apos;s POS actually does before you book a demo.
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600 dark:text-slate-300">
                Jimmy&apos;s POS is for businesses that need a sales screen, stock control, staff permissions, customer accounts, restaurant workflows, cash control, and useful reports in one place.
              </p>

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

            <motion.div {...fadeUp(0.1)} className="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="rounded-lg bg-slate-950 p-5 text-white">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                  <div>
                    <p className="text-sm font-bold text-blue-300">At a glance</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight">What the system covers</h2>
                  </div>
                  <LayoutGrid className="h-6 w-6 text-blue-300" />
                </div>
                <div className="mt-5 grid gap-3">
                  {comparisonRows.slice(0, 6).map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-black text-white">{label}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-300">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
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
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sales, stock, staff, customers, cash, and reports.</p>
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
