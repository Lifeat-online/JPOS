import React from 'react';
import { Box, CheckCircle2, Cloud, Headphones, KeyRound, Sparkles } from 'lucide-react';
import { JPOS_PACKAGE_ADDONS, JPOS_PACKAGES } from '../../shared/packageCatalog';

interface PackagesPricingProps {
  onStartSetup?: () => void;
  onContact?: () => void;
  compact?: boolean;
}

function deliveryLabel(delivery: string) {
  return delivery === 'hosted_saas' ? 'Hosted SaaS' : 'Docker image + licence key';
}

export function PackagesPricing({ onStartSetup, onContact, compact = false }: PackagesPricingProps) {
  const support = JPOS_PACKAGE_ADDONS[0];

  return (
    <section id="pricing" className={compact ? 'h-full overflow-auto bg-slate-50 p-4 dark:bg-slate-950 lg:p-6' : 'px-4 py-24 sm:px-6 lg:px-10'}>
      <div className="mx-auto max-w-7xl">
        <div className={compact ? 'mb-6 flex flex-col gap-2' : 'mx-auto mb-14 max-w-3xl text-center'}>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <Sparkles className="h-3.5 w-3.5" />
            Packages And Pricing
          </div>
          <h2 className={`${compact ? 'text-3xl' : 'mt-6 text-4xl sm:text-5xl'} font-black tracking-tight text-slate-950 dark:text-white`}>
            Pick the package that matches how you want to run JPOS.
          </h2>
          <p className={`${compact ? 'text-sm' : 'mt-5 text-lg'} max-w-3xl leading-8 text-slate-600 dark:text-slate-300 ${compact ? '' : 'mx-auto'}`}>
            Hosted plans are managed SaaS with register limits. White-label is delivered as a Docker image with a signed licence key, unlimited registers, and optional monthly Support+.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          {JPOS_PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className={`flex min-h-[29rem] flex-col rounded-lg border bg-white p-6 shadow-sm dark:bg-slate-900 ${
                pkg.highlighted
                  ? 'border-blue-400 ring-2 ring-blue-500/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase text-slate-500 dark:text-slate-400">{pkg.name}</p>
                  <p className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white">{pkg.priceLabel}</p>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${pkg.delivery === 'hosted_saas' ? 'bg-blue-50 text-blue-600' : 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'}`}>
                  {pkg.delivery === 'hosted_saas' ? <Cloud className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
                </div>
              </div>

              <p className="mt-5 text-sm font-semibold text-slate-700 dark:text-slate-300">{deliveryLabel(pkg.delivery)}</p>
              <p className="mt-3 min-h-[4rem] text-sm leading-6 text-slate-500 dark:text-slate-400">{pkg.description}</p>

              <div className="mt-5 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/70">
                <p className="text-[11px] font-black uppercase text-slate-400">Key limits</p>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-900 dark:text-white">{pkg.limitsLabel}</p>
              </div>

              <ul className="mt-5 flex-1 space-y-3">
                {pkg.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="capitalize">{feature.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={pkg.id === 'whitelabel' ? onContact : onStartSetup}
                className={`mt-6 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-black transition ${
                  pkg.highlighted
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100'
                }`}
              >
                {pkg.id === 'whitelabel' ? <Box className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {pkg.ctaLabel}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
                <Headphones className="h-5 w-5" />
              </div>
              <div>
                <p className="font-black text-slate-950 dark:text-white">{support.name}</p>
                <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-300">{support.description}</p>
              </div>
            </div>
            <p className="text-2xl font-black text-slate-950 dark:text-white">{support.priceLabel}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
