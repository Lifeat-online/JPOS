import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';
import { motion } from 'motion/react';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  instructions?: string;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan,
  onClose,
  title = 'Barcode Scanner',
  subtitle = 'Ready to scan',
  instructions = 'Position the barcode within the scanning area.',
}) => {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Initialize scanner
    const scanner = new Html5QrcodeScanner(
      "barcode-reader",
      { 
        fps: 10, 
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.777778, // 16:9
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
        ]
      },
      false
    );

    scanner.render(
      (decodedText) => {
        onScan(decodedText);
      },
      (error) => {
        // Silently ignore errors
      }
    );

    scannerRef.current = scanner;

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
      }
    };
  }, [onScan]);

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }} 
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Camera className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-black text-xl tracking-tight text-slate-900 dark:text-white">{title}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">{subtitle}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-4 bg-slate-50 dark:bg-[#0B1120]">
          <div id="barcode-reader" className="overflow-hidden rounded-2xl border-4 border-white dark:border-slate-800 shadow-inner bg-black aspect-[16/9]"></div>
        </div>

        <div className="p-6 text-center">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-[280px] mx-auto leading-relaxed">
            {instructions}
          </p>
        </div>

        <div className="p-2 bg-slate-50 dark:bg-[#0B1120] border-t border-slate-100 dark:border-slate-800 flex justify-center">
            <div className="flex gap-1">
                {[1, 2, 3].map(i => (
                    <motion.div 
                        key={i}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                        className="w-1.5 h-1.5 bg-primary rounded-full"
                    />
                ))}
            </div>
        </div>
      </div>
    </motion.div>
  );
};
