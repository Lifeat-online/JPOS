const fs = require('fs');
let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

appTsx = appTsx.replace("deleteDoc,\n} from 'firebase/firestore';", "deleteDoc,\n  collectionGroup,\n  getDocs\n} from 'firebase/firestore';");

fs.writeFileSync('src/App.tsx', appTsx);
