const fs = require('fs');

let appTsx = fs.readFileSync('src/App.tsx', 'utf8');
if (!appTsx.includes("import { usePosStore } from")) {
  appTsx = appTsx.replace("import { PointOfSaleView }", "import { usePosStore } from './store/usePosStore';\nimport { PointOfSaleView }");
  fs.writeFileSync('src/App.tsx', appTsx);
}

let posTsx = fs.readFileSync('src/components/PointOfSaleView.tsx', 'utf8');
// add useState to import
if (!posTsx.includes('useState')) {
  posTsx = posTsx.replace("useMemo } from 'react'", "useMemo, useState } from 'react'");
  fs.writeFileSync('src/components/PointOfSaleView.tsx', posTsx);
}

let cashTsx = fs.readFileSync('src/components/CashManagementView.tsx', 'utf8');
cashTsx = cashTsx.replace(/parseFloat\(val\) \* qty/g, "parseFloat(val) * Number(qty)");
fs.writeFileSync('src/components/CashManagementView.tsx', cashTsx);

