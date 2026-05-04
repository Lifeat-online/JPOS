const fs = require('fs');

const files = [
  'src/components/CashManagementView.tsx',
  'src/components/PurchaseOrdersView.tsx',
  'src/components/VendorManagementView.tsx',
  'src/components/StaffProfileView.tsx'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    if (!content.includes('getTenantCollection')) {
      content = "import { getTenantCollection, getTenantDoc } from '../tenantHelper';\n" + content;
      fs.writeFileSync(f, content);
    }
  }
});
