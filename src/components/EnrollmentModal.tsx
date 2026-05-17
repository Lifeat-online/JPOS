import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Building2, Loader2, Lock, Mail, Store, User, X } from 'lucide-react';

interface EnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (details: {
    businessName: string;
    ownerName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  error: string | null;
  isLoading: boolean;
}

export function EnrollmentModal({ isOpen, onClose, onSubmit, error, isLoading }: EnrollmentModalProps) {
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const businessRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setBusinessName('');
      setOwnerName('');
      setEmail('');
      setPassword('');
      setTimeout(() => businessRef.current?.focus(), 80);
    }
  }, [isOpen]);

  const canSubmit = businessName.trim() && ownerName.trim() && email.trim() && password.length >= 8;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit({
      businessName: businessName.trim(),
      ownerName: ownerName.trim(),
      email: email.trim().toLowerCase(),
      password,
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="enrollment-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="enrollment-modal"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/60 dark:bg-slate-900">
              <div className="relative bg-gradient-to-br from-slate-950 to-blue-800 px-8 pb-6 pt-8 text-white">
                <button
                  onClick={onClose}
                  className="absolute right-4 top-4 rounded-xl bg-white/10 p-1.5 text-white transition hover:bg-white/20"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <Store className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-black tracking-tight">Admin Enrollment</h2>
                <p className="mt-1 text-sm text-blue-100">Create the owner account, then complete business setup.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5 p-8">
                {error && (
                  <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800/40 dark:bg-red-900/20">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">{error}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="enroll-business" className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Business Name
                  </label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="enroll-business"
                      ref={businessRef}
                      value={businessName}
                      onChange={event => setBusinessName(event.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium text-slate-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      placeholder="Acme Supermarket"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="enroll-owner" className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Admin Name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="enroll-owner"
                      value={ownerName}
                      onChange={event => setOwnerName(event.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium text-slate-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      placeholder="Jane Admin"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="enroll-email" className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Admin Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="enroll-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium text-slate-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      placeholder="admin@example.com"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="enroll-password" className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="enroll-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      disabled={isLoading}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium text-slate-900 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      placeholder="At least 8 characters"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !canSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting enrollment...
                    </>
                  ) : (
                    'Start Setup'
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
