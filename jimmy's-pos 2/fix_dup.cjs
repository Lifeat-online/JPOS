const fs = require('fs');
let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

appTsx = appTsx.replace("  collection, collectionGroup, \n", "  collection, \n");

fs.writeFileSync('src/App.tsx', appTsx);
