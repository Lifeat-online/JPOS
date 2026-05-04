const fs = require('fs');

let setupTsx = fs.readFileSync('src/components/SetupWizard.tsx', 'utf8');

setupTsx = setupTsx.replace("await setDoc(doc(db, 'staff', user.uid), {",
`const tenantRef = await addDoc(collection(db, 'tenants'), {
        name: isSkipping ? 'My Business' : formData.businessName,
        createdAt: serverTimestamp()
      });
      // Link user to tenant
      await setDoc(doc(db, 'users', user.uid), {
        tenantId: tenantRef.id,
        email: user.email,
        name: user.displayName || user.email?.split('@')[0] || 'User',
        createdAt: serverTimestamp()
      });
      // Create first admin staff user in the tenant
      await setDoc(doc(db, 'tenants', tenantRef.id, 'staff', user.uid), {`);

setupTsx = setupTsx.replace("const configRef = doc(db, 'settings', 'app');",
`const configRef = doc(db, 'tenants', tenantRef.id, 'settings', 'app');`);

fs.writeFileSync('src/components/SetupWizard.tsx', setupTsx);
