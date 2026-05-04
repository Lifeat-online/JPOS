const fs = require('fs');
const appTsx = fs.readFileSync('src/App.tsx', 'utf8');
const eCash = appTsx.substring(appTsx.indexOf("view === 'cash' ? (") + 19, appTsx.indexOf(") : view === 'inventory' ? (")).trim();
console.log(eCash);
