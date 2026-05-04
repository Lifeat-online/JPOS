const fs = require('fs');
let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

// Fix the useEffect conditionals
appTsx = appTsx.replace(/if \(!user\) \{/g, "if (!user || !tenantId) {");

// Also there's one for currentUserStaff:
appTsx = appTsx.replace(/if \(!currentUserStaff\) \{/g, "if (!currentUserStaff || !tenantId) {");

fs.writeFileSync('src/App.tsx', appTsx);
