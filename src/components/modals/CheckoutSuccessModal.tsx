import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Printer } from 'lucide-react';
import { Sale, AppConfig } from '../../types';

interface CheckoutSuccessModalProps {
  sale?: Sale;
  config?: AppConfig | null;
  onNewSale: () => void;
}

export const CheckoutSuccessModal: React.FC<CheckoutSuccessModalProps> = ({ sale, config, onNewSale }) => {
  const currency = config?.business?.currency || 'R';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center"
      >
        <div className="w-20 h-20 bg-[#eff6ff] rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-12 h-12 text-primary" />
        </div>
        <h3 className="text-2xl font-black tracking-tight mb-2 text-slate-900 dark:text-white">Checkout Success</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-2">Transaction has been recorded.</p>

        {/* Sale summary */}
        {sale && (
          <div className="w-full bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 mb-6 text-left space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 font-medium">Order</span>
              <span className="font-black text-slate-900 dark:text-white">#{sale.id.slice(-8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 font-medium">Total</span>
              <span className="font-black text-slate-900 dark:text-white">{currency}{sale.total.toFixed(2)}</span>
            </div>
            {sale.taxAmount !== undefined && sale.taxAmount > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">{config?.business?.taxName || 'VAT'} ({sale.taxRate}%)</span>
                <span className="text-slate-500">{currency}{sale.taxAmount.toFixed(2)}</span>
              </div>
            )}
            {sale.changeAmount !== undefined && sale.changeAmount > 0 && (
              <div className="flex justify-between text-sm border-t border-slate-200 dark:border-slate-700 pt-1.5 mt-1.5">
                <span className="text-slate-500 font-medium">Change</span>
                <span className="font-black text-emerald-600">{currency}{sale.changeAmount.toFixed(2)}</span>
              </div>
            )}
            {sale.tipAmount !== undefined && sale.tipAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Tip</span>
                <span className="font-black text-primary">{currency}{sale.tipAmount.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={() => window.print()}
            className="w-full py-4 bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 rounded-2xl font-black shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            PRINT RECEIPT
          </button>
          <button
            onClick={onNewSale}
            className="w-full py-4 bg-primary text-white rounded-2xl font-black shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
          >
            NEW SALE
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
