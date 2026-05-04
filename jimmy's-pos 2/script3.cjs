const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  'className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50/50 min-h-[200px]"',
  'className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/50 min-h-[200px]"'
);

fs.writeFileSync('src/App.tsx', content);
