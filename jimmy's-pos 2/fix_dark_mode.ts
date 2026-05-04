import fs from 'fs';

const text = fs.readFileSync('src/App.tsx', 'utf-8');

let outText = text.replace(/bg-\[\#e2e8f0\]/g, 'bg-slate-200');
outText = outText.replace(/border-\[\#e2e8f0\]/g, 'border-slate-200');
outText = outText.replace(/text-\[\#1e293b\]/g, 'text-slate-800');
outText = outText.replace(/bg-\[\#F8FAFC\]/g, 'bg-slate-50');

const replacements = {
    'bg-white': 'bg-white dark:bg-slate-900',
    'bg-slate-50': 'bg-slate-50 dark:bg-[#0B1120]',
    'bg-slate-100': 'bg-slate-100 dark:bg-slate-800',
    'bg-slate-200': 'bg-slate-200 dark:bg-slate-700',
    'bg-slate-800': 'bg-slate-800 dark:bg-slate-100',
    'bg-slate-900': 'bg-slate-900 dark:bg-white',
    
    'text-slate-900': 'text-slate-900 dark:text-white',
    'text-slate-800': 'text-slate-800 dark:text-slate-100',
    'text-slate-600': 'text-slate-600 dark:text-slate-300',
    'text-slate-500': 'text-slate-500 dark:text-slate-400',
    'text-slate-400': 'text-slate-400 dark:text-slate-500',
    'text-slate-300': 'text-slate-300 dark:text-slate-600',
    
    'border-slate-100': 'border-slate-100 dark:border-slate-800/60',
    'border-slate-200': 'border-slate-200 dark:border-slate-700/60',
    'border-slate-800': 'border-slate-800 dark:border-slate-200',
};

for (const [oldClass, newClass] of Object.entries(replacements)) {
    // Negative lookbehind for dark: and normal word boundary
    // Also skip if followed by slash (e.g. bg-white/50)
    const regex = new RegExp(`(?<!dark:)\\b${oldClass}\\b(?!/)`, 'g');
    outText = outText.replace(regex, newClass);
}

fs.writeFileSync('src/App.tsx', outText);
console.log('Replacements complete');
