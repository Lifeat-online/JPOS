const fs = require('fs');
let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

appTsx = appTsx.replace("const [tenantId, setTenantId] = useState<string | null>(null);",
"const { tenantId, setTenantId } = usePosStore();");

fs.writeFileSync('src/App.tsx', appTsx);
