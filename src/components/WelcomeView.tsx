import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Building2,
  ChartNoAxesCombined,
  CheckCircle2,
  ChefHat,
  Clock3,
  CreditCard,
  Download,
  Globe2,
  Lock,
  Maximize2,
  Menu,
  MessageSquare,
  Moon,
  Package,
  ReceiptText,
  ScanBarcode,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Store,
  Sun,
  UserCircle,
  Users,
  Utensils,
  WalletCards,
  X,
} from 'lucide-react';
import { PackagesPricing } from './PackagesPricing';

interface WelcomeViewProps {
  onLogin: () => void;
  onTryNow: (mode?: 'retail' | 'restaurant') => void;
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
  { label: 'Why', href: '#why' },
  { label: 'Features', href: '#features' },
  { label: 'Mobile', href: '#mobile' },
  { label: 'Workstations', href: '#workstations' },
  { label: 'Workflows', href: '#workflows' },
  { label: 'Packages', href: '/packages' },
  { label: 'FAQ', href: '#faq' },
];

const soundbiteCards = [
  {
    icon: Clock3,
    label: 'The problem',
    title: 'Busy shifts get messy when every job lives in a different place.',
    desc: 'Sales, tabs, stock, kitchen tickets, wallets, and cash-up should not depend on memory or paper notes.',
  },
  {
    icon: Users,
    label: 'We get it',
    title: 'You need speed without losing control.',
    desc: 'Your staff need a simple selling flow. You need the numbers, permissions, and daily checks to stay honest.',
  },
  {
    icon: Store,
    label: 'The answer',
    title: 'Run the day from one browser-based POS.',
    desc: 'MasePOS connects the counter, mobile devices, workstations, customers, stock, cash sessions, and reports.',
  },
  {
    icon: ArrowRight,
    label: 'What changes',
    title: 'Orders move. Stock updates. Managers can see what happened.',
    desc: 'The team spends less time chasing information and more time serving customers.',
  },
  {
    icon: CheckCircle2,
    label: 'End result',
    title: 'You get a business that is easier to run at the speed of a real trading day.',
    desc: 'Retail, restaurant, takeaway, and growing operators can sell, prepare, track, and close with fewer blind spots.',
  },
];

const featureCards = [
  {
    icon: ShoppingCart,
    title: 'Sell without detours',
    desc: 'Scan or tap products, select customers, apply discounts, open tabs, and complete the sale from the same screen.',
  },
  {
    icon: CreditCard,
    title: 'Take the payment your customer uses',
    desc: 'Handle cash, card, wallet, account activity, payouts, refunds, and tabs without splitting the work across tools.',
  },
  {
    icon: Package,
    title: 'Keep stock honest',
    desc: 'Manage products, categories, barcodes, stock levels, low-stock warnings, cost prices, and selling prices.',
  },
  {
    icon: Users,
    title: 'Give each role the right tools',
    desc: 'Cashiers, managers, chefs, and admins can work with the permissions that match their job.',
  },
  {
    icon: Utensils,
    title: 'Send food orders where they belong',
    desc: 'Run tables, tabs, takeaways, kitchen and bar queues, ticket acceptance, ready status, and order notifications.',
  },
  {
    icon: BarChart3,
    title: 'Know what happened today',
    desc: 'See sales, stock movement, customer activity, staff performance, wallet balances, and daily operating totals.',
  },
  {
    icon: Smartphone,
    title: 'Use phones when the counter is not enough',
    desc: 'A phone or tablet can work as a full browser-based POS terminal for taking orders away from the main till.',
  },
  {
    icon: Download,
    title: 'Install it like an app',
    desc: 'Install MasePOS on desktop, Android, iPhone, or iPad, with fullscreen and kiosk controls for a cleaner shop-floor setup.',
  },
  {
    icon: Globe2,
    title: 'Keep your hardware options open',
    desc: 'Run the POS from a desktop, laptop, tablet, or phone browser without locking the business into one device type.',
  },
];

const workflows = [
  {
    icon: ReceiptText,
    title: 'Daily sales',
    steps: ['Open the register', 'Sell products or services', 'Take payment', 'Print or reprint the receipt'],
  },
  {
    icon: ChefHat,
    title: 'Food service',
    steps: ['Open a table, tab, or takeaway order', 'Send items to the right station', 'Accept and mark items ready', 'Notify the team when orders are ready'],
  },
  {
    icon: WalletCards,
    title: 'Customer accounts',
    steps: ['Create or select a customer', 'Track wallet balances', 'Process payouts or refunds', 'Let clients view account activity'],
  },
  {
    icon: Lock,
    title: 'Management control',
    steps: ['Assign staff roles', 'Review cash sessions', 'Check reports', 'Adjust settings as the business changes'],
  },
  {
    icon: Smartphone,
    title: 'Mobile order-taking',
    steps: ['Log in from a phone', 'Open the normal POS or workstation view', 'Take orders away from the counter', 'Send orders through the same prep and cash-up flow'],
  },
  {
    icon: Download,
    title: 'Install and kiosk mode',
    steps: ['Install on desktop, Android, iPhone, or iPad', 'Enter fullscreen for the shop floor', 'Use kiosk mode where needed', 'Keep device controls in the profile menu'],
  },
];

const industryCards = [
  {
    icon: Store,
    title: 'Retail stores',
    desc: 'For teams that need fast checkout, product control, stock visibility, customer history, and clear daily totals.',
  },
  {
    icon: Utensils,
    title: 'Restaurants',
    desc: 'For operators that need tables, open tabs, kitchen coordination, order labels, and controlled staff access.',
  },
  {
    icon: ChefHat,
    title: 'Takeaways',
    desc: 'For busy counters where orders need to move cleanly from sale to preparation to pickup.',
  },
  {
    icon: Building2,
    title: 'Growing operators',
    desc: 'For owners who want one place to manage sales, staff, stock, loyalty, cash, and reports.',
  },
];

const setupSteps = [
  {
    step: '1',
    title: 'Set up the trading basics',
    desc: 'Add the business name, trading setup, users, register limits, and daily settings your team will rely on.',
  },
  {
    step: '2',
    title: 'Load products and people',
    desc: 'Create categories, products, prices, barcodes, staff accounts, and permissions for each role.',
  },
  {
    step: '3',
    title: 'Trade, review, improve',
    desc: 'Use the POS for sales, then review cash sessions, stock movement, wallets, customers, and reports.',
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

const mobileFeatures = [
  {
    icon: Smartphone,
    title: 'Phone as a full POS terminal',
    desc: 'A cashier or barman can log in from a mobile browser and use the normal POS or workstation flow away from the counter.',
  },
  {
    icon: Globe2,
    title: 'Works in any browser',
    desc: 'Use MasePOS from desktop, laptop, tablet, Android, iPhone, or iPad browsers, with optional installation for an app-like feel.',
  },
  {
    icon: Utensils,
    title: 'Same station queue on mobile',
    desc: 'Open the same workstation view from a mobile device when staff need to manage orders away from the main till.',
  },
  {
    icon: ScanBarcode,
    title: 'Wireless scanner option',
    desc: 'When needed, a phone camera can act as a barcode scanner for the active terminal.',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Customer display mode',
    desc: 'Turn a spare screen into a customer-facing display for the active register.',
  },
  {
    icon: Maximize2,
    title: 'Fullscreen and kiosk controls',
    desc: 'Open the POS in fullscreen or kiosk mode so the device feels like dedicated shop-floor hardware.',
  },
  {
    icon: Lock,
    title: 'Optional device pairing',
    desc: 'Admins and devs can bind a physical mobile/browser device to a workstation when a device should remember its role.',
  },
];

const workstationFeatures = [
  {
    icon: ChefHat,
    title: 'Separate queues for each station',
    desc: 'Kitchen, bar, and production teams can each work from their own queue instead of sharing one crowded order screen.',
  },
  {
    icon: Clock3,
    title: 'Tickets move from pending to accepted',
    desc: 'Incoming items show as pending, then staff can accept them so everyone knows the order is being prepared.',
  },
  {
    icon: CheckCircle2,
    title: 'Ready status clears the queue',
    desc: 'When a station marks an item ready, the order item updates and leaves the active prep queue.',
  },
  {
    icon: BellRing,
    title: 'Ready alerts reach the team',
    desc: 'Ready items post a system notification with the table, tab, or takeaway label, item quantity, and station name.',
  },
  {
    icon: MessageSquare,
    title: 'Message badges keep it visible',
    desc: 'Team messages poll for updates, unread counts appear in navigation, and ready alerts show as centered notification pills.',
  },
  {
    icon: BarChart3,
    title: 'Live prep reporting',
    desc: 'The live dashboard tracks pending, accepted, ready, queue counts, oldest tickets, and prep timing by workstation.',
  },
];

const visualPanels = [
  {
    icon: ScanBarcode,
    title: 'Retail counter',
    desc: 'Scan, sell, discount, take payment, and keep stock current.',
    accent: 'from-emerald-500 to-blue-600',
  },
  {
    icon: ChefHat,
    title: 'Restaurant floor',
    desc: 'Tables, tabs, kitchen tickets, and takeaways move in one flow.',
    accent: 'from-amber-400 to-red-600',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Owner dashboard',
    desc: 'Sales, cash sessions, wallets, staff activity, and stock reports stay visible.',
    accent: 'from-blue-500 to-slate-900',
  },
];

const faqItems = [
  {
    question: 'What problem does MasePOS solve?',
    answer: 'It keeps daily trading work in one flow: sales, products, stock, staff permissions, customers, wallets, cash sessions, restaurant workflows, and reports.',
  },
  {
    question: 'Will it slow staff down?',
    answer: 'The sales screen is built for ordinary shop-floor work: select products, choose customers, apply discounts, take payment, and print or reprint receipts without sending staff through unnecessary screens.',
  },
  {
    question: 'Can it work for restaurants and takeaways?',
    answer: 'Yes. It includes table and tab flows, kitchen and bar workstation queues, takeaway handling, ready notifications, and staff roles for food service teams.',
  },
  {
    question: 'What should I check first when deciding if it fits?',
    answer: 'Try the retail or restaurant demo, then check the feature list, workflow section, and package limits against your daily operation.',
  },
  {
    question: 'Can customers see their own account activity?',
    answer: 'Yes. The client portal gives customers a place to review linked account activity, wallet balances, and payout requests.',
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
          <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">One trading day</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            The counter, kitchen, phone, and owner view stay connected.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
            The point is not more software. The point is fewer gaps between selling, preparing, tracking, and closing the day.
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

function SouthAfricanFlag() {
  return (
    <svg
      viewBox="0 0 60 40"
      aria-label="South African flag"
      role="img"
      className="h-8 w-12 shrink-0 rounded-sm shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
    >
      <clipPath id="sa-flag-clip">
        <rect width="60" height="40" rx="2" />
      </clipPath>
      <g clipPath="url(#sa-flag-clip)">
        <path fill="#de3831" d="M0 0h60v20H30L0 0z" />
        <path fill="#002395" d="M0 40h60V20H30L0 40z" />
        <path fill="#fff" d="M0 0l31.5 20L0 40h11.5l31.5-20L11.5 0H0z" />
        <path fill="#fff" d="M28 14h32v12H28z" />
        <path fill="#007a4d" d="M0 3.75 25.75 20 0 36.25h10.25L36 20 10.25 3.75H0z" />
        <path fill="#007a4d" d="M30 16h30v8H30z" />
        <path fill="#ffb612" d="M0 6.5 21.5 20 0 33.5V6.5z" />
        <path fill="#000" d="M0 9.5 17 20 0 30.5v-21z" />
      </g>
    </svg>
  );
}

function SoundbiteSection() {
  return (
    <section id="why" className="border-b border-slate-200 bg-white px-4 py-14 dark:border-slate-800 dark:bg-slate-950 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <motion.div {...fadeUp(0)} className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">The short version</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            You should not need five systems to run one trading day.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
            MasePOS helps you sell, prepare orders, manage stock, control staff access, track customers, and close the day from one place.
          </p>
        </motion.div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {soundbiteCards.map((item, index) => (
            <motion.div key={item.label} {...fadeUp(0.04 * index)} className={cardClass}>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                <item.icon className="h-5 w-5" />
              </div>
              <p className="mt-5 text-xs font-black uppercase tracking-wide text-blue-700 dark:text-blue-300">{item.label}</p>
              <h3 className="mt-2 text-lg font-black tracking-tight text-slate-950 dark:text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MobileFeatureShowcase() {
  return (
    <section id="mobile" className="border-y border-slate-200 bg-white px-4 py-16 dark:border-slate-800 dark:bg-slate-950 sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <motion.div {...fadeUp(0)} className="relative mx-auto w-full max-w-md">
          <div className="absolute inset-8 rounded-[2.5rem] bg-blue-500/20 blur-3xl" />
          <div className="relative mx-auto w-[min(100%,21rem)] rounded-[2.4rem] border border-slate-300 bg-slate-950 p-3 shadow-[0_34px_120px_-35px_rgba(15,23,42,0.9)] dark:border-slate-700">
            <div className="rounded-[1.9rem] bg-white p-4 text-slate-950 dark:bg-slate-900 dark:text-white">
              <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-slate-300 dark:bg-slate-700" />
              <div className="rounded-2xl bg-gradient-to-br from-slate-950 to-blue-950 p-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Mobile mode</p>
                    <h3 className="mt-1 text-2xl font-black">Bar phone</h3>
                  </div>
                  <motion.div
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="rounded-xl bg-emerald-400 px-3 py-2 text-[10px] font-black text-emerald-950"
                  >
                    Active
                  </motion.div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  {[
                    ['Browser', 'Any device'],
                    ['Orders', 'Away from bar'],
                    ['Scanner', 'Camera scan'],
                    ['Display', 'Customer view'],
                  ].map(([label, value], index) => (
                    <motion.div
                      key={label}
                      animate={{ y: [0, index % 2 ? 3 : -3, 0] }}
                      transition={{ duration: 4 + index * 0.2, repeat: Infinity, ease: 'easeInOut' }}
                      className="rounded-xl border border-white/10 bg-white/10 p-3"
                    >
                      <p className="text-xs font-black">{label}</p>
                      <p className="mt-1 text-[10px] font-semibold text-blue-100">{value}</p>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Active target</p>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Live</span>
                </div>
                <p className="mt-2 text-lg font-black">Bar workstation</p>
                <div className="mt-4 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                  <motion.div
                    animate={{ width: ['35%', '82%', '35%'] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    className="h-2 rounded-full bg-blue-600"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {['PWA', 'Full', 'Kiosk'].map((item) => (
                  <div key={item} className="rounded-xl bg-slate-100 p-3 text-center text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <div>
          <motion.div {...fadeUp(0.06)} className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Mobile and browser access</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Take orders where the customer is.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
              Staff can log in from a mobile browser, open the normal POS or workstation view, and keep orders moving away from the main counter.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {mobileFeatures.map((item, index) => (
              <motion.div key={item.title} {...fadeUp(0.04 * index)} className={cardClass}>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-black tracking-tight text-slate-950 dark:text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkstationNotificationShowcase() {
  return (
    <section id="workstations" className="px-4 py-16 sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
        <div>
          <motion.div {...fadeUp(0)} className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Workstations and ready notifications</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Stop asking the kitchen if the order is ready.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
              Products route to the right station. Each station accepts tickets, marks items ready, and posts a ready alert so the team can act without shouting across the room.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {workstationFeatures.map((item, index) => (
              <motion.div key={item.title} {...fadeUp(0.04 * index)} className={cardClass}>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-black tracking-tight text-slate-950 dark:text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          {...fadeUp(0.12)}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white shadow-[0_34px_120px_-42px_rgba(15,23,42,0.85)] dark:border-slate-800"
        >
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-orange-300">Bar workstation</p>
                <h3 className="mt-1 text-2xl font-black">3 active tickets</h3>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 text-white">
                <ChefHat className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {[
                ['Table 4', '2x Burger combo', 'pending', 'Accept'],
                ['Tab Thabo', '1x Coffee', 'accepted', 'Ready'],
                ['Takeaway', '3x Chips', 'accepted', 'Ready'],
              ].map(([label, item, status, action], index) => (
                <motion.div
                  key={`${label}-${item}`}
                  animate={{ x: [0, index === 0 ? 4 : -4, 0] }}
                  transition={{ duration: 5 + index * 0.3, repeat: Infinity, ease: 'easeInOut' }}
                  className={`rounded-xl border p-4 ${
                    status === 'pending'
                      ? 'border-orange-400/30 bg-orange-500/15'
                      : 'border-blue-400/30 bg-blue-500/15'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black">{label}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-300">{item}</p>
                    </div>
                    <span className="rounded-lg bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/80">
                      {status}
                    </span>
                  </div>
                  <div className="mt-4 rounded-lg bg-white px-3 py-2 text-center text-xs font-black uppercase tracking-widest text-slate-950">
                    {action}
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              animate={{ opacity: [0.75, 1, 0.75], y: [0, -4, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/15 p-4 text-center"
            >
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400 text-emerald-950">
                <BellRing className="h-5 w-5" />
              </div>
              <p className="text-sm font-black">Tab Thabo - 1x Coffee is READY (Bar)</p>
              <p className="mt-1 text-xs font-semibold text-emerald-100">System notification posted to team messages</p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function WelcomeView({ onLogin, onTryNow, onStartSetup, onClientLogin, isDarkMode, toggleDarkMode }: WelcomeViewProps) {
  const [openFaq, setOpenFaq] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className={`min-h-screen w-full flex flex-col font-sans ${isDarkMode ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-slate-950 dark:text-white">MasePOS</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sell, prep, track, close</p>
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
              className="hidden h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 lg:flex"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={onClientLogin}
              className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 lg:flex"
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
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-sm lg:hidden"
            onClick={closeMobileMenu}
          >
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className="ml-auto flex h-full w-[min(88vw,24rem)] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex h-20 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
                    <Store className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-base font-black tracking-tight text-slate-950 dark:text-white">MasePOS</p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Menu</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeMobileMenu}
                  aria-label="Close menu"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 dark:border-slate-800 dark:text-slate-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={() => { onClientLogin(); closeMobileMenu(); }}
                    className="flex items-center justify-center gap-3 rounded-lg bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-500"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Client Login
                  </button>
                  <button
                    type="button"
                    onClick={() => { onLogin(); closeMobileMenu(); }}
                    className="flex items-center justify-center gap-3 rounded-lg bg-slate-950 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                  >
                    <UserCircle className="h-4 w-4" />
                    Admin Login
                  </button>
                </div>

                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/70">
                  <button
                    type="button"
                    onClick={toggleDarkMode}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-bold text-slate-700 transition hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      {isDarkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4" />}
                    </span>
                    {isDarkMode ? 'Light Mode' : 'Dark Mode'}
                  </button>
                </div>

                <nav className="mt-5 grid gap-1">
                  {navLinks.map((item) => (
                    <a
                      key={item.label}
                      href={item.href}
                      onClick={closeMobileMenu}
                      className="flex items-center justify-between rounded-lg px-3 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      {item.label}
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </a>
                  ))}
                </nav>
              </div>

              <div className="border-t border-slate-200 p-5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { onStartSetup(); closeMobileMenu(); }}
                  className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-5 py-3.5 text-sm font-bold text-slate-900 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
                >
                  Start Setup
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef6ff_100%)] px-4 py-12 dark:border-slate-800 dark:bg-[linear-gradient(135deg,#020617_0%,#0f172a_58%,#082f49_100%)] sm:px-6 lg:px-10 lg:py-10">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-green-600 via-yellow-400 via-red-600 to-blue-700" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <motion.div {...fadeUp(0)} className="max-w-4xl">
              <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Point of sale for busy operators</p>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                MasePOS keeps sales, stock, staff, and cash-up in one flow.
              </h1>
              <p className="mt-4 text-base font-black tracking-tight text-blue-700 dark:text-blue-300 sm:text-lg">
                Sell faster. Lose fewer details. End the day knowing what happened.
              </p>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
                When the rush hits, you should not chase kitchen tickets, stock counts, wallet balances, staff permissions, and cash sessions across disconnected tools. MasePOS gives your team one browser-based system to sell, prepare, track, and report.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  onClick={() => onTryNow('retail')}
                  className="inline-flex items-center justify-center gap-3 rounded-lg bg-blue-600 px-7 py-3.5 text-base font-bold text-white transition hover:bg-blue-500"
                >
                  <Store className="h-5 w-5" />
                  Try Retail
                </button>
                <button
                  onClick={() => onTryNow('restaurant')}
                  className="inline-flex items-center justify-center gap-3 rounded-lg bg-amber-500 px-7 py-3.5 text-base font-bold text-slate-950 transition hover:bg-amber-400"
                >
                  <Utensils className="h-5 w-5" />
                  Try Restaurant
                  <ArrowRight className="h-5 w-5" />
                </button>
                <button
                  onClick={onStartSetup}
                  className="inline-flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-7 py-3.5 text-base font-bold text-slate-900 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
                >
                  Start setup
                </button>
              </div>

              <div className="mt-5 inline-flex max-w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left dark:border-slate-800 dark:bg-slate-900">
                <SouthAfricanFlag />
                <p className="text-sm font-bold leading-6 text-slate-800 dark:text-slate-200">
                  Built in South Africa for retailers, restaurants, takeaways, and growing operators, with multi-currency support for broader markets.
                </p>
              </div>
            </motion.div>

            <PremiumPosShowcase />
          </div>
        </section>

        <SoundbiteSection />

        <section id="features" className={sectionClass}>
          <div className="mx-auto max-w-7xl">
            <motion.div {...fadeUp(0)} className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">What it does</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                The tools your team reaches for every day.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
                If these are the jobs that create pressure in your business, this is the work MasePOS is built to handle.
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

        <MobileFeatureShowcase />

        <WorkstationNotificationShowcase />

        <VisualWorkflowPanels />

        <section id="workflows" className="border-y border-slate-200 bg-white px-4 py-16 dark:border-slate-800 dark:bg-slate-950 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <motion.div {...fadeUp(0)} className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Workflows</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Picture a normal trading day.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
                These are the flows staff and managers use when the store is open and customers are waiting.
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
                Customers can check account activity without interrupting the store.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700 dark:text-slate-300">
                The client login gives customers access to linked account activity, wallet balances, and payout requests tied to their profile.
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
                Best fit for operators who need control without slowing the floor.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-300">
                MasePOS makes the most sense when sales, stock, staff, customers, cash, and reporting all matter to the same owner or manager.
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
                Set up the system around the way you trade.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
                Start with the essentials, then add the products, people, and controls your business needs.
              </p>
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
                Straight answers before you test it.
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
                Try the flow your team would use on a real shift.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                Test retail or restaurant mode, then start setup when you are ready to shape the system around your own products, people, and controls.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
              <button
                onClick={() => onTryNow('retail')}
                className="inline-flex items-center justify-center gap-3 rounded-lg bg-white px-7 py-3.5 text-base font-bold text-slate-950 transition hover:bg-slate-100"
              >
                <Store className="h-5 w-5" />
                Try Retail
              </button>
              <button
                onClick={() => onTryNow('restaurant')}
                className="inline-flex items-center justify-center gap-3 rounded-lg border border-white/20 bg-white/10 px-7 py-3.5 text-base font-bold text-white transition hover:bg-white/15"
              >
                <Utensils className="h-5 w-5" />
                Try Restaurant
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
                <p className="font-black text-slate-900 dark:text-white">MasePOS</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">South African-built POS for sales, stock, staff, customers, cash, and reports.</p>
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
