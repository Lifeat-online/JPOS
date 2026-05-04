const fs = require('fs');
let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

// Also Add collectionGroup and getDocs to imports if missing
if (!appTsx.includes('collectionGroup')) {
  appTsx = appTsx.replace("collection, ", "collection, collectionGroup, ");
}

const replacementStr = `
        setTenantLoading(true);
        tenantUnsub = onSnapshot(doc(db, "users", u.uid), async (docSnap) => {
          if (docSnap.exists() && docSnap.data().tenantId) {
            setTenantId(docSnap.data().tenantId);
            setTenantLoading(false);
          } else {
            try {
                const staffQuery = query(collectionGroup(db, "staff"), where("email", "==", u.email));
                const snap = await getDocs(staffQuery);
                if (!snap.empty) {
                   const staffDoc = snap.docs[0];
                   const foundTenantId = staffDoc.ref.parent.parent?.id;
                   if (foundTenantId) {
                       await setDoc(doc(db, "users", u.uid), {
                           tenantId: foundTenantId,
                           email: u.email,
                           name: u.displayName || u.email?.split('@')[0] || 'User',
                           createdAt: serverTimestamp()
                       }, { merge: true });
                       return;
                   }
                }
             } catch (err) {
                console.error("Failed to check invited staff:", err);
             }
            setTenantId(null);
            setTenantLoading(false);
          }
        });
`;

appTsx = appTsx.replace(/setTenantLoading\(true\);[\s\S]*?setTenantId\(null\);\s*setTenantLoading\(false\);\s*\}/, replacementStr.trim() + "\n        }");

// Ensure the condition to show SetupWizard relies on tenantId as well
// Right now it's: if (user && (!config?.setupCompleted || staff.length === 0))
// It should be: if (user && (!tenantId || !config?.setupCompleted || staff.length === 0))
appTsx = appTsx.replace("if (user && config?.setupCompleted && currentUserRole === null) {", "if (user && tenantId && config?.setupCompleted && currentUserRole === null) {");
appTsx = appTsx.replace("if (user && (!config?.setupCompleted || staff.length === 0)) {", "if (user && (!tenantId || !config?.setupCompleted || staff.length === 0)) {");

fs.writeFileSync('src/App.tsx', appTsx);
