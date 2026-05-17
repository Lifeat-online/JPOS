import React from 'react';
import { ArrowLeft, Moon, ShoppingBag, Sparkles, Store, Sun, UserCircle } from 'lucide-react';
import { PackagesPricing } from '../components/PackagesPricing';

interface PublicPackagesPageProps {
  onLogin: () => void;
  onTryNow: () => void;
  onStartSetup: () => void;
  onClientLogin: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

export function PublicPackagesPage({
  onLogin,
  onTryNow,
  onStartSetup,
  onClientLogin,
  isDarkMode,
  toggleDarkMode,
}: PublicPackagesPageProps) {
  const handleContact = () => {
    window.location.href = 'mailto:sales@jimmyspos.com?subject=JPOS%20White-label%20package';
  };

  return (
    <div className={`min-h-screen w-full font-sans ${isDarkMode ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/85">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <a href="/" className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-lg shadow-blue-600/25">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-slate-950 dark:text-white">Jimmy&apos;s POS</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">Packages</p>
            </div>
          </a>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="/"
              className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white sm:flex"
            >
              <ArrowLeft className="h-4 w-4" />
              Home
            </a>
            <button
              onClick={toggleDarkMode}
              aria-label="Toggle dark mode"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={onClientLogin}
              className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white md:flex"
            >
              <ShoppingBag className="h-4 w-4" />
              Client Login
            </button>
            <button
              onClick={onLogin}
              className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white lg:flex"
            >
              <UserCircle className="h-4 w-4" />
              Admin Login
            </button>
            <button
              onClick={onTryNow}
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:scale-[1.01] hover:bg-blue-500"
            >
              <Sparkles className="h-4 w-4" />
              Try Now
            </button>
          </div>
        </div>
      </header>

      <main>
        <PackagesPricing onStartSetup={onStartSetup} onContact={handleContact} />
      </main>
    </div>
  );
}
