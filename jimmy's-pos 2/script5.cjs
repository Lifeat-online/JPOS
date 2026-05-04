const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /'text-slate-400 dark:text-slate-500 border-transparent bg-slate-50 dark:bg-\[#0B1120\] lg:bg-transparent hover:bg-slate-50 dark:bg-\[#0B1120\]'/g,
  "'text-slate-400 dark:text-slate-500 border-transparent bg-slate-50 dark:bg-[#0B1120] lg:bg-transparent lg:dark:bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800'"
);

content = content.replace(
  /hover:bg-slate-50 dark:bg-\[#0B1120\]/g,
  "hover:bg-slate-50 dark:hover:bg-slate-800"
);

fs.writeFileSync('src/App.tsx', content);
