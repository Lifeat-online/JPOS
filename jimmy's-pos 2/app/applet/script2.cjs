const fs = require('fs');
let content = fs.readFileSync('src/components/CustomerSelector.tsx', 'utf8');

content = content.replace(
  /\$\{highlightedIndex === -1 \? 'bg-slate-50' : ''\}/g,
  "${highlightedIndex === -1 ? 'bg-slate-50 dark:bg-slate-800' : ''}"
);
content = content.replace(
  /\$\{!selectedId \? 'text-primary bg-primary\/5' : 'text-slate-600'\}/g,
  "${!selectedId ? 'text-primary bg-primary/5' : 'text-slate-600 dark:text-slate-300'}"
);
content = content.replace(
  /hover:bg-slate-50 transition-colors/g,
  "hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
);
content = content.replace(
  /bg-slate-100 flex items-center justify-center/g,
  "bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
);
content = content.replace(
  /border-t border-slate-50/g,
  "border-t border-slate-50 dark:border-slate-800/50"
);
content = content.replace(
  /\$\{highlightedIndex === index \? 'bg-slate-100\/50' : ''\}/g,
  "${highlightedIndex === index ? 'bg-slate-100/50 dark:bg-slate-800/50' : ''}"
);
content = content.replace(
  /\$\{selectedId === customer\.id \? 'text-primary' : 'text-slate-800'\}/g,
  "${selectedId === customer.id ? 'text-primary' : 'text-slate-800 dark:text-slate-100'}"
);
content = content.replace(
  /<div className="p-3 bg-slate-50 border-t border-slate-100">/g,
  "<div className=\"p-3 bg-slate-50 dark:bg-[#0B1120] border-t border-slate-100 dark:border-slate-800\">"
);
content = content.replace(
  /className="w-full py-2.5 bg-white border border-slate-200/g,
  "className=\"w-full py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60"
);

fs.writeFileSync('src/components/CustomerSelector.tsx', content);
console.log("CustomerSelector dark mode applied!");
