const fs = require('fs');
let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

// Add getTenantCollection and getTenantDoc to App.tsx
if (!appTsx.includes('getTenantCollection')) {
  appTsx = appTsx.replace("import { db, auth } from './firebase';", "import { db, auth } from './firebase';\nimport { getTenantCollection, getTenantDoc } from './tenantHelper';");
}

// Add collectionGroup and getDocs to firestore imports
appTsx = appTsx.replace("deleteDoc\n} from 'firebase/firestore';", "deleteDoc,\n  collectionGroup,\n  getDocs\n} from 'firebase/firestore';");

fs.writeFileSync('src/App.tsx', appTsx);
