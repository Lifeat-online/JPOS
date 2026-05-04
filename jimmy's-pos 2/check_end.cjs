const fs = require('fs');

const appTsx = fs.readFileSync('src/App.tsx', 'utf8');
const renderStartIdx = appTsx.indexOf("{view === 'pos' ? (");
const partialEnd = appTsx.substring(renderStartIdx);

console.log(partialEnd.substring(partialEnd.length - 200));
