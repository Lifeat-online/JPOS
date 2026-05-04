const fs = require('fs');

let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

appTsx = appTsx.replace("import { doc, updateDoc, setDoc, addDoc, collection, query, where, orderBy, onSnapshot, serverTimestamp, getDoc, getDocs, limit, runTransaction, writeBatch } from 'firebase/firestore';",
`import { doc, updateDoc, setDoc, addDoc, collection, query, where, orderBy, onSnapshot, serverTimestamp, getDoc, getDocs, limit, runTransaction, writeBatch } from 'firebase/firestore';
import { getTenantCollection, getTenantDoc } from './tenantHelper';`);

appTsx = appTsx.replace("const [user, setUser] = useState<User | null>(null);",
`const [user, setUser] = useState<User | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantLoading, setTenantLoading] = useState(true);`);

appTsx = appTsx.replace(`  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);`,
`  // Auth and Tenant Listener
  useEffect(() => {
    let tenantUnsub: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        setTenantLoading(true);
        tenantUnsub = onSnapshot(doc(db, "users", u.uid), (docSnap) => {
          if (docSnap.exists() && docSnap.data().tenantId) {
            setTenantId(docSnap.data().tenantId);
          } else {
            setTenantId(null);
          }
          setTenantLoading(false);
        });
      } else {
        if (tenantUnsub) tenantUnsub();
        setTenantId(null);
        setTenantLoading(false);
      }
    });
    return () => {
      unsubscribe();
      if (tenantUnsub) tenantUnsub();
    };
  }, []);`);

appTsx = appTsx.replace(/collection\(db, "/g, 'getTenantCollection(db, tenantId, "');
appTsx = appTsx.replace(/doc\(db, "/g, 'getTenantDoc(db, tenantId, "');

fs.writeFileSync('src/App.tsx', appTsx);
