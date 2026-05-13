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
  transition: { duration: 0.55, delay, ease: 'easeOut' },
});

const navLinks = [
  { label: 'Why It Wins', href: '#why-it-wins' },
  { label: 'Industries', href: '#industries' },
  { label: 'Results', href: '#results' },
  { label: 'FAQ', href: '#faq' },
];

const proofStats = [
  { value: 'Faster', label: 'service during peak trade' },
  { value: 'Clearer', label: 'stock visibility for owners' },
  { value: 'Stronger', label: 'repeat-customer retention' },
  { value: 'Tighter', label: 'cash and staff control' },
];

const painPoints = [
  {
    icon: ShoppingCart,
    title: 'Queues move too slowly',
    desc: 'Every delay at the till costs you sales, frustrates customers, and makes busy periods feel chaotic.',
  },
  {
    icon: Package,
    title: 'Stock goes missing',
    desc: 'When inventory is not visible in real time, margin leaks quietly through missed counts and poor timing.',
  },
  {
    icon: Users,
    title: 'Managers run blind',
    desc: 'If performance, cash, and customer behaviour are hard to read, growth decisions become guesswork.',
  },
];

const valueCards = [
  {
    icon: Zap,
    title: 'Sell Faster',
    desc: 'Give teams a checkout flow that feels instant, polished, and easy to learn.',
  },
  {
    icon: CreditCard,
    title: 'Take Every Payment',
    desc: 'Handle the payment mix modern customers expect without slowing the queue.',
  },
  {
    icon: BarChart3,
    title: 'Run On Real Numbers',
    desc: 'Make better decisions with live visibility into sales, performance, and trade patterns.',
  },
  {
    icon: Package,
    title: 'Control Stock',
    desc: 'Track products, spot issues early, and protect margin before problems get expensive.',
  },
  {
    icon: Gift,
    title: 'Bring Customers Back',
    desc: 'Turn one-time visits into repeat spend with loyalty and customer history.',
  },
  {
    icon: Banknote,
    title: 'Protect Cash',
    desc: 'Create a cleaner, more accountable cash workflow from open to close.',
  },
];

const industryCards = [
  {
    icon: Store,
    title: 'Retail',
    desc: 'For fast-moving stores that need speed at the till, clean stock control, and confident reporting.',
  },
  {
    icon: Utensils,
    title: 'Restaurants',
    desc: 'For service teams that need smoother floor operations, cleaner handoffs, and faster table turnover.',
  },
  {
    icon: ChefHat,
    title: 'Takeaways',
    desc: 'For high-volume food businesses where pace, accuracy, and repeat orders matter every day.',
  },
  {
    icon: Building2,
    title: 'Growing Operators',
    desc: 'For owners who need a sharper customer experience today and a stronger operating system tomorrow.',
  },
];

const launchSteps = [
  {
    step: '01',
    title: 'Shape the setup',
    desc: 'Map your business flow, product structure, and team needs so the platform fits the way you trade.',
  },
  {
    step: '02',
    title: 'Launch with clarity',
    desc: 'Bring staff into a clean, intuitive system that feels premium from day one.',
  },
  {
    step: '03',
    title: 'Grow with confidence',
    desc: 'Use better reporting, better customer insight, and better control to scale from a stronger base.',
  },
];

const trustPillars = [
  {
    icon: Lock,
    title: 'Built for trust',
    desc: 'A cleaner front end, clearer workflows, and stronger accountability across the business.',
  },
  {
    icon: LayoutGrid,
    title: 'Built for scale',
    desc: 'A system that feels premium for one location and still makes sense as operations grow.',
  },
  {
    icon: CheckCircle2,
    title: 'Built for adoption',
    desc: 'Simple enough for staff to use fast, polished enough for owners to believe in immediately.',
  },
];

const faqItems = [
  {
    question: 'Who is this built for?',
    answer: 'Jimmy\'s POS is positioned for ambitious operators who want faster service, stronger stock control, and a front-of-house experience that feels more premium.',
  },
  {
    question: 'What makes the landing experience better now?',
    answer: 'The new front end leads with outcomes, trust, and clear conversion points instead of technical features, so prospects understand value before they see the product details.',
  },
  {
    question: 'Can this work for both retail and hospitality?',
    answer: 'Yes. The messaging now speaks to multiple business types while keeping the presentation polished, focused, and high-conviction.',
  },
  {
    question: 'What is the main conversion path?',
    answer: 'The page now guides visitors from attention to trust to value to action, then closes with clear portal access for staff and customer users.',
  },
];

const centeredCard =
  'group relative overflow-hidden rounded-[28px] border border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl shadow-[0_20px_80px_-30px_rgba(15,23,42,0.35)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_100px_-30px_rgba(37,99,235,0.35)]';

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
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-lg shadow-blue-600/25">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-black tracking-tight text-slate-950 dark:text-white">Jimmy&apos;s POS</p>
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
              className="flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-slate-950/20 transition hover:scale-[1.01] hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              <UserCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Staff Login</span>
              <span className="sm:hidden">Login</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden px-4 pb-16 pt-10 sm:px-6 lg:px-10 lg:pb-24 lg:pt-16">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="text-center lg:text-left">
              <motion.div
                {...fadeUp(0)}
                className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Built To Win Attention And Convert
              </motion.div>

              <motion.h1
                {...fadeUp(0.08)}
                className="mx-auto mt-6 max-w-4xl text-5xl font-black tracking-[-0.05em] text-slate-950 dark:text-white sm:text-6xl lg:mx-0 lg:text-7xl"
              >
                The POS that makes your business feel
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent"> faster, sharper, and more premium.</span>
              </motion.h1>

              <motion.p
                {...fadeUp(0.16)}
                className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300 lg:mx-0 lg:text-xl"
              >
                Jimmy&apos;s POS is now framed like a high-conviction sales funnel: it speaks to growth, speed, trust, customer retention, and operational control before it ever talks about software.
              </motion.p>

              <motion.div {...fadeUp(0.24)} className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
                <a
                  href="#why-it-wins"
                  className="inline-flex items-center justify-center gap-3 rounded-2xl bg-blue-600 px-7 py-4 text-base font-bold text-white shadow-[0_20px_60px_-20px_rgba(37,99,235,0.65)] transition hover:scale-[1.02] hover:bg-blue-500"
                >
                  See Why Clients Switch
                  <ArrowRight className="h-5 w-5" />
                </a>
                <a
                  href="#launch"
                  className="inline-flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-7 py-4 text-base font-bold text-slate-900 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:hover:border-slate-700 dark:hover:bg-slate-800"
                >
                  See The Launch Journey
                </a>
              </motion.div>

              <motion.div {...fadeUp(0.32)} className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  'Better first impressions',
                  'Stronger conversion flow',
                  'Clearer high-value messaging',
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 text-center text-sm font-semibold text-slate-700 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200"
                  >
                    {item}
                  </div>
                ))}
              </motion.div>
            </div>

            <motion.div {...fadeUp(0.18)} className="relative mx-auto w-full max-w-xl">
              <div className="absolute inset-0 rounded-[36px] bg-gradient-to-br from-blue-500/20 via-violet-500/10 to-cyan-400/20 blur-2xl" />
              <div className="relative rounded-[36px] border border-white/70 bg-white/80 p-5 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/75">
                <div className="rounded-[30px] border border-slate-200/80 bg-slate-950 p-6 text-white dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-300">Today At A Glance</p>
                      <h3 className="mt-2 text-2xl font-black tracking-tight">Front End That Sells</h3>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-3 py-2 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">Focused On</p>
                      <p className="mt-1 text-sm font-black">Conversion</p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {[
                      { label: 'Hero', value: 'Stronger', tone: 'from-blue-500/25 to-cyan-400/20' },
                      { label: 'Messaging', value: 'Sharper', tone: 'from-violet-500/25 to-fuchsia-400/20' },
                      { label: 'Trust', value: 'Clearer', tone: 'from-emerald-500/25 to-green-400/20' },
                      { label: 'CTA', value: 'Tighter', tone: 'from-amber-500/25 to-orange-400/20' },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={`rounded-3xl border border-white/10 bg-gradient-to-br ${item.tone} px-5 py-6 text-center`}
                      >
                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/70">{item.label}</p>
                        <p className="mt-3 text-3xl font-black tracking-tight text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-[28px] border border-white/10 bg-white/5 p-5 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-white/10">
                      <BarChart3 className="h-7 w-7 text-blue-300" />
                    </div>
                    <p className="mt-4 text-sm font-black uppercase tracking-[0.24em] text-slate-400">Premium Positioning</p>
                    <p className="mt-2 text-lg font-bold text-white">Outcome-led copy, centered cards, and a cleaner path from attention to action.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="px-4 py-6 sm:px-6 lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {proofStats.map((stat, index) => (
              <motion.div
                key={stat.label}
                {...fadeUp(0.05 * index)}
                className={`${centeredCard} px-6 py-7 text-center`}
              >
                <p className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">{stat.value}</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="why-it-wins" className="px-4 py-20 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <motion.div {...fadeUp(0)} className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <Zap className="h-3.5 w-3.5" />
                Why The Pitch Lands Better
              </div>
              <h2 className="mt-6 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                Lead with business pressure. Close with operational relief.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">
                The redesigned landing page now follows the logic of a premium funnel: identify the pain, show the upside, build trust, and create a confident next step.
              </p>
            </motion.div>

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {painPoints.map((item, index) => (
                <motion.div
                  key={item.title}
                  {...fadeUp(0.08 * index)}
                  className={`${centeredCard} px-8 py-9 text-center`}
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

        <section className="px-4 py-20 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-[36px] border border-slate-200/80 bg-white/85 px-6 py-12 shadow-[0_30px_90px_-30px_rgba(15,23,42,0.2)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 sm:px-10 lg:px-12">
            <motion.div {...fadeUp(0)} className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                <Sparkles className="h-3.5 w-3.5" />
                Outcome-Led Value
              </div>
              <h2 className="mt-6 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                Everything now points to the result a new client actually wants.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">
                Instead of listing technical architecture, the page now sells speed, margin protection, repeat business, and management confidence.
              </p>
            </motion.div>

            <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {valueCards.map((item, index) => (
                <motion.div
                  key={item.title}
                  {...fadeUp(0.06 * index)}
                  className={`${centeredCard} px-8 py-9 text-center`}
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

        <section id="industries" className="bg-slate-950 px-4 py-24 text-white sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <motion.div {...fadeUp(0)} className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-blue-300">
                <Store className="h-3.5 w-3.5" />
                Designed For Real Trade
              </div>
              <h2 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-5xl">
                A premium story for the businesses most likely to buy.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-300">
                The message now feels more relevant to operators who care about service speed, cleaner systems, and a customer experience that reflects their brand.
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

        <section id="results" className="px-4 py-24 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <motion.div {...fadeUp(0)} className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                <BarChart3 className="h-3.5 w-3.5" />
                What Better Positioning Communicates
              </div>
              <h2 className="mt-6 text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                A cleaner promise. A stronger impression. A sharper path to yes.
              </h2>
            </motion.div>

            <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <motion.div {...fadeUp(0.08)} className={`${centeredCard} px-8 py-10 text-center`}>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/20">
                  <ShieldCheck className="h-7 w-7" />
                </div>
                <h3 className="mt-6 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                  The page now sells confidence before functionality.
                </h3>
                <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300">
                  New prospects first see premium visual polish, clearer hierarchy, stronger copy, and a story about outcomes. Product detail becomes support for the sale, not the headline.
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

        <section id="launch" className="px-4 py-24 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-[40px] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-14 text-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.7)] sm:px-10 lg:px-12">
            <motion.div {...fadeUp(0)} className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-blue-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Launch Journey
              </div>
              <h2 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
                A premium funnel needs a premium finish.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-300">
                The closing sequence now reassures visitors that the product is not just attractive. It is organised, thoughtful, and ready to support growth.
              </p>
            </motion.div>

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {launchSteps.map((item, index) => (
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
                The story is clearer. The objections are smaller.
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
                <Sparkles className="h-3.5 w-3.5" />
                Ready To Close The Loop
              </div>
              <h2 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
                A better front end now makes the product feel more valuable before a word is spoken.
              </h2>
              <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-blue-100">
                The landing page now behaves like a proper high-end acquisition surface: premium aesthetics, clearer persuasion, centered cards, and a tighter path to action.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <button
                  onClick={onLogin}
                  className="inline-flex items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-base font-black text-blue-700 transition hover:scale-[1.02] hover:bg-blue-50"
                >
                  Staff Login
                  <ArrowRight className="h-5 w-5" />
                </button>
                <button
                  onClick={onClientLogin}
                  className="inline-flex items-center justify-center gap-3 rounded-2xl border border-white/25 bg-white/10 px-8 py-4 text-base font-black text-white transition hover:scale-[1.02] hover:bg-white/20"
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
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">Sharper systems. Better trade.</p>
              </div>
            </div>
            <p>Built to help serious operators look sharper, serve faster, and grow with more control.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
