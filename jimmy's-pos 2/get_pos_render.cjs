const fs = require('fs');

let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

const posLogicMatch = appTsx.match(/const getCategoryIcon =[^]+?(?=const getNavItems)/);
const posNavMatch = appTsx.match(/const getNavItems =[^]+?(?=return items;\n  };)/);

const posRenderMatch = appTsx.match(/\(\n\s*<div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">[^]+?(?= \) : view === "history")/);

console.log(posRenderMatch ? posRenderMatch[0].length : 'Not found');
