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
    if (!content.includes("from '../tenantHelper'")) {
      content = "import { getTenantCollection, getTenantDoc } from '../tenantHelper';\n" + content;
      fs.writeFileSync(f, content);
    }
  }
});

let appTsx = fs.readFileSync('src/App.tsx', 'utf8');
// remove duplicate collectionGroup
appTsx = appTsx.replace("  collectionGroup,\n  getDocs\n} from 'firebase/firestore';", "} from 'firebase/firestore';");
// then add them carefully without duplicate
if (!appTsx.includes('getDocs')) {
   appTsx = appTsx.replace("deleteDoc\n} from 'firebase/firestore';", "deleteDoc,\n  collectionGroup,\n  getDocs\n} from 'firebase/firestore';");
}
fs.writeFileSync('src/App.tsx', appTsx);
