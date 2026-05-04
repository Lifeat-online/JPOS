const fs = require('fs');

const files = [
  'src/App.tsx',
  'src/components/CashManagementView.tsx',
  'src/components/PurchaseOrdersView.tsx',
  'src/components/VendorManagementView.tsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/\.\.\.doc.data\(\)/g, "...(doc.data() as any)");
    content = content.replace(/\.\.\.d.data\(\)/g, "...(d.data() as any)");
    content = content.replace(/\.\.\.snap\.docs\[0\]\.data\(\)/g, "...(snap.docs[0].data() as any)");
    fs.writeFileSync(file, content);
  }
});

