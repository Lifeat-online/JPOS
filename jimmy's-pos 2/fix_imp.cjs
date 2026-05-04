const fs = require('fs');

let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

// Ensure tenantHelper is imported
if (!appTsx.includes('import { getTenantCollection, getTenantDoc } from "./tenantHelper";')) {
  appTsx = appTsx.replace("import { db, auth } from './firebase';", "import { db, auth } from './firebase';\nimport { getTenantCollection, getTenantDoc } from \"./tenantHelper\";");
}

// Add collectionGroup and getDocs
appTsx = appTsx.replace("deleteDoc\n} from 'firebase/firestore';", "deleteDoc,\n  collectionGroup,\n  getDocs\n} from 'firebase/firestore';");

appTsx = appTsx.replace("deleteDoc\r\n} from 'firebase/firestore';", "deleteDoc,\r\n  collectionGroup,\r\n  getDocs\r\n} from 'firebase/firestore';");

// Sometimes it's on a single line? No, we see it on lines 82-83: deleteDoc\n} from 'firebase/firestore';
appTsx = appTsx.replace(/deleteDoc\r?\n\} from 'firebase\/firestore';/, "deleteDoc,\n  collectionGroup,\n  getDocs\n} from 'firebase/firestore';");

fs.writeFileSync('src/App.tsx', appTsx);
