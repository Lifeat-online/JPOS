const fs = require('fs');

let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

const posRenderMatch = appTsx.match(/view === "pos" \? !activeSession \?([\s\S]+?): view === "history"/);

console.log(posRenderMatch ? posRenderMatch[0].length : 'Not found');
