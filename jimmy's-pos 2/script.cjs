const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(/w-full px-4 py-3 bg-slate-50 dark:bg-\[#0B1120\] border border-slate-200 dark:border-slate-700\/60 rounded-xl focus:outline-none focus:border-primary\/50 text-sm font-semibold/g, 'w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white');
fs.writeFileSync('src/App.tsx', content);
console.log("Replaced!");
