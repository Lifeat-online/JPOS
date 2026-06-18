import React from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Laptop,
  Moon,
  Play,
  ShieldCheck,
  Smartphone,
  Store,
  Sun,
  UserCircle,
} from 'lucide-react';

interface DownloadsPageProps {
  onLogin: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const windowsDownload = {
  label: 'Windows terminal package',
  href: '/downloads/MasePOS-Windows-Deployment.zip',
  fileName: 'MasePOS-Windows-Deployment.zip',
  size: '13.3 MB',
  hash: 'C068E23E36DC87283EBC1FD2D1FB007B65F89A8CED9ABFE1B57BB7268FEFA1F5',
};

const androidDownload = {
  label: 'Android APK',
  href: '/downloads/MasePOS-Android.apk',
  fileName: 'MasePOS-Android.apk',
  size: '56.3 MB',
  hash: '042F078C2A0BF007E2D5BDEB41D4BCB1A37F3ACB8086595560FCA41C9BCC66EF',
  playStoreUrl: '',
};

function DownloadCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function FileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/60">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-1 break-all font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{value}</p>
    </div>
  );
}

export function DownloadsPage({ onLogin, isDarkMode, toggleDarkMode }: DownloadsPageProps) {
  const androidHref = androidDownload.playStoreUrl || androidDownload.href;
  const androidLabel = androidDownload.playStoreUrl ? 'Get it on Google Play' : 'Download APK';
  const AndroidIcon = androidDownload.playStoreUrl ? Play : Download;

  return (
    <div className={`min-h-screen w-full font-sans ${isDarkMode ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/90">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <a href="/" className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-slate-950 dark:text-white">MasePOS</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">Downloads</p>
            </div>
          </a>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="/"
              className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white sm:flex"
            >
              <ArrowLeft className="h-4 w-4" />
              Home
            </a>
            <button
              onClick={toggleDarkMode}
              aria-label="Toggle dark mode"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={onLogin}
              className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white md:flex"
            >
              <UserCircle className="h-4 w-4" />
              Admin Login
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-slate-200 bg-white px-4 py-12 dark:border-slate-800 dark:bg-slate-950 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-black uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">Production installers</p>
            <div className="mt-4 max-w-3xl">
              <h1 className="text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">Download MasePOS for your terminals.</h1>
              <p className="mt-5 text-base font-medium leading-7 text-slate-600 dark:text-slate-300">
                Use the Windows package for counter terminals and the Android APK for phones or tablets. Both builds target the hosted MasePOS backend at masepos.co.za.
              </p>
            </div>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-2">
            <DownloadCard
              icon={Laptop}
              title={windowsDownload.label}
              subtitle="Includes MasePOS.exe, the required DLL/data files, firewall helper, deployment verifier, and LAN sync signoff tools."
            >
              <div className="mt-6 grid gap-3">
                <a
                  href={windowsDownload.href}
                  download={windowsDownload.fileName}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
                >
                  <Download className="h-4 w-4" />
                  Download Windows package
                </a>
                <FileMeta label="File" value={`${windowsDownload.fileName} (${windowsDownload.size})`} />
                <FileMeta label="SHA256" value={windowsDownload.hash} />
              </div>
            </DownloadCard>

            <DownloadCard
              icon={Smartphone}
              title={androidDownload.label}
              subtitle="Install directly on Android devices while Play Store publishing is pending."
            >
              <div className="mt-6 grid gap-3">
                <a
                  href={androidHref}
                  download={androidDownload.playStoreUrl ? undefined : androidDownload.fileName}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500"
                >
                  <AndroidIcon className="h-4 w-4" />
                  {androidLabel}
                </a>
                <FileMeta label="File" value={`${androidDownload.fileName} (${androidDownload.size})`} />
                <FileMeta label="SHA256" value={androidDownload.hash} />
              </div>
            </DownloadCard>
          </div>
        </section>

        <section className="px-4 pb-14 sm:px-6 lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6 lg:grid-cols-3">
            {[
              'Keep the Windows package extracted as a folder; the EXE depends on the bundled data and DLL files.',
              'Only use local server sync with a paid tenant or licence that includes local_server_sync.',
              'When Play Store publishing is live, this page can switch the Android action from APK download to official store branding.',
            ].map((item) => (
              <div key={item} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <p className="text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-100 px-4 py-8 dark:border-slate-800 dark:bg-slate-900/50 sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm font-semibold text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              Verified release artifacts from the MasePOS production build.
            </div>
            <a href="/packages" className="font-black text-blue-600 transition hover:text-blue-500 dark:text-blue-300">
              View packages
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
