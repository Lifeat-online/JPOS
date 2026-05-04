const fs = require('fs');

function fixFile(path) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(/\\\`/g, '\`');
  content = content.replace(/\\\$/g, '$');
  fs.writeFileSync(path, content);
}

fixFile('src/components/TablesView.tsx');
fixFile('src/components/KitchenView.tsx');
