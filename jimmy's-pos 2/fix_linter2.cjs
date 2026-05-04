const fs = require('fs');

let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

// Replace standard setView instances with navigate
appTsx = appTsx.replace(/setView\(/g, "navigate(");

// Destructure clearCart
appTsx = appTsx.replace("const { sales, workstations, setWorkstations, setCart } = usePosStore();", 
  "const { sales, workstations, setWorkstations, setCart, clearCart } = usePosStore();");

if (!appTsx.includes('clearCart } = usePosStore()')) {
  // alternative location if previous replace didn't work
  appTsx = appTsx.replace("const navigate = useNavigate();", "const navigate = useNavigate();\n  const clearCart = usePosStore(state => state.clearCart);");
}

fs.writeFileSync('src/App.tsx', appTsx);

let posTsx = fs.readFileSync('src/components/PointOfSaleView.tsx', 'utf8');
if (!posTsx.includes('useState')) {
  posTsx = posTsx.replace("import React, { useMemo } from 'react';", "import React, { useMemo, useState } from 'react';");
  fs.writeFileSync('src/components/PointOfSaleView.tsx', posTsx);
}

// Check CashManagementView arithmetic errors
let cashTsx = fs.readFileSync('src/components/CashManagementView.tsx', 'utf8');
// The error is likely computing sum: `record.amount` vs Number(record.amount) ?
// let's just cast to Number where necessary
cashTsx = cashTsx.replace(/cashIns\.reduce\(\(sum, record\) => sum \+ record\.amount, 0\)/g, "cashIns.reduce((sum, record) => sum + (Number(record.amount) || 0), 0)")
                 .replace(/cashOuts\.reduce\(\(sum, record\) => sum \+ record\.amount, 0\)/g, "cashOuts.reduce((sum, record) => sum + (Number(record.amount) || 0), 0)");
fs.writeFileSync('src/components/CashManagementView.tsx', cashTsx);

