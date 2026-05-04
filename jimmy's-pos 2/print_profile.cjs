const fs = require('fs');
const appTsx = fs.readFileSync('src/App.tsx', 'utf8');
const eProfile = appTsx.substring(appTsx.indexOf("view === 'profile' ? (") + 22, appTsx.indexOf(") : view === 'settings' ? (")).trim();
console.log(eProfile);
