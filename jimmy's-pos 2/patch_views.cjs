const fs = require('fs');

const views = [
  'src/components/CashManagementView.tsx',
  'src/components/PurchaseOrdersView.tsx',
  'src/components/VendorManagementView.tsx',
  'src/components/StaffProfileView.tsx',
  'src/components/SettingsView.tsx'
];

views.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Add imports
    if (!content.includes('getTenantCollection')) {
      content = content.replace("import { doc", "import { getTenantCollection, getTenantDoc } from '../tenantHelper';\nimport { doc");
    }
    if (!content.includes('usePosStore')) {
      content = content.replace("import React", "import { usePosStore } from '../store/usePosStore';\nimport React");
    }

    // Replace collection(db, "x")
    content = content.replace(/collection\(db, "/g, 'getTenantCollection(db, tenantId, "');
    content = content.replace(/collection\(db, '/g, "getTenantCollection(db, tenantId, '");
    // Replace doc(db, "x"
    content = content.replace(/doc\(db, "/g, 'getTenantDoc(db, tenantId, "');
    content = content.replace(/doc\(db, '/g, "getTenantDoc(db, tenantId, '");
    
    // Add tenantId to component body
    const functionMatch = content.match(/export function [^\(]+\([^\)]*\) {/);
    if (functionMatch && !content.includes('const tenantId = usePosStore')) {
      content = content.replace(functionMatch[0], functionMatch[0] + "\n  const tenantId = usePosStore(state => state.tenantId);");
    }

    fs.writeFileSync(file, content);
  }
});
