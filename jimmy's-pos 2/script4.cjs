const fs = require('fs');
let content = fs.readFileSync('src/components/BarcodeScanner.tsx', 'utf8');

content = content.replace(
  '<div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative">',
  '<div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative">'
);

content = content.replace(
  '<div className="p-6 border-b border-slate-100 flex items-center justify-between">',
  '<div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">'
);

content = content.replace(
  '<h3 className="font-black text-xl tracking-tight">Barcode Scanner</h3>',
  '<h3 className="font-black text-xl tracking-tight text-slate-900 dark:text-white">Barcode Scanner</h3>'
);

content = content.replace(
  'className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"',
  'className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"'
);

content = content.replace(
  '<div className="p-4 bg-slate-50">',
  '<div className="p-4 bg-slate-50 dark:bg-[#0B1120]">'
);

content = content.replace(
  '<div id="barcode-reader" className="overflow-hidden rounded-2xl border-4 border-white shadow-inner bg-black aspect-[16/9]"></div>',
  '<div id="barcode-reader" className="overflow-hidden rounded-2xl border-4 border-white dark:border-slate-800 shadow-inner bg-black aspect-[16/9]"></div>'
);

content = content.replace(
  '<p className="text-sm font-medium text-slate-500 max-w-[280px] mx-auto leading-relaxed">',
  '<p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-[280px] mx-auto leading-relaxed">'
);

content = content.replace(
  '<div className="p-2 bg-slate-50 border-t border-slate-100 flex justify-center">',
  '<div className="p-2 bg-slate-50 dark:bg-[#0B1120] border-t border-slate-100 dark:border-slate-800 flex justify-center">'
);

fs.writeFileSync('src/components/BarcodeScanner.tsx', content);
