const fs = require('fs');
let storeTsx = fs.readFileSync('src/store/usePosStore.ts', 'utf8');

storeTsx = storeTsx.replace("activeSession: any | null;", "activeSession: any | null;\n  tenantId: string | null;");
storeTsx = storeTsx.replace("setActiveSession: (session: any | null) => void;", "setActiveSession: (session: any | null) => void;\n  setTenantId: (id: string | null) => void;");
storeTsx = storeTsx.replace("cart: [],", "cart: [],\n  tenantId: null,");
storeTsx = storeTsx.replace("clearCart: () => set({ cart: [] }),", "clearCart: () => set({ cart: [] }),\n  setTenantId: (id) => set({ tenantId: id }),");

fs.writeFileSync('src/store/usePosStore.ts', storeTsx);
