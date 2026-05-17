/**
 * LoginModal — Email + Password login for admins and staff.
 * Shown by App.tsx / WelcomeView when the user clicks "Admin Login".
 * Submits credentials to POST /api/auth/login via the useAuth hook.
 */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Lock, Mail, Eye, EyeOff, AlertCircle, Store, Loader2 } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string, password: string) => Promise<void>;
  error: string | null;
  isLoading: boolean;
}

export function LoginModal({ isOpen, onClose, onSubmit, error, isLoading }: LoginModalProps) {
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Focus email input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => emailRef.current?.focus(), 80);
      setEmail('');
      setPassword('');
      setShowPass(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    await onSubmit(email.trim().toLowerCase(), password);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden"
              onKeyDown={handleKeyDown}
            >
              {/* Header */}
              <div className="relative bg-gradient-to-br from-blue-600 to-indigo-700 px-8 pt-8 pb-6 text-white">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition text-white"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center mb-4">
                  <Store className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-black tracking-tight">Admin Login</h2>
                <p className="text-blue-100 text-sm mt-1">Sign in to your Jimmy's POS account</p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-8 space-y-5">

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40"
                    >
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700 dark:text-red-400 font-medium">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email */}
                <div className="space-y-1.5">
                  <label htmlFor="login-email" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      id="login-email"
                      ref={emailRef}
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      disabled={isLoading}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:opacity-50 transition"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label htmlFor="login-password" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      id="login-password"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      disabled={isLoading}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-12 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:opacity-50 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading || !email.trim() || !password}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/25 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>

                <p className="text-center text-xs text-slate-400 dark:text-slate-500 pt-1">
                  Contact your administrator if you've forgotten your password.
                </p>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
