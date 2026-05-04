const fs = require('fs');

let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

// Insert react-router-dom imports
appTsx = appTsx.replace("import React, { useState, useEffect, useMemo } from 'react';", 
  "import React, { useState, useEffect, useMemo, useRef } from 'react';\nimport { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';\nimport { PointOfSaleView } from './components/PointOfSaleView';\nimport { TransactionHistoryView } from './components/TransactionHistoryView';\nimport { InventoryView } from './components/InventoryView';\nimport { CustomersView } from './components/CustomersView';\nimport { StaffControlView } from './components/StaffControlView';");

fs.writeFileSync('src/App.tsx', appTsx);
console.log('App.tsx imports fixed.');

let posTsx = fs.readFileSync('src/components/PointOfSaleView.tsx', 'utf8');
posTsx = posTsx.replace("selectedCustomerId,", "/* selectedCustomerId, */")
               .replace("setSelectedCustomerId,", "/* setSelectedCustomerId, */")
               .replace("} = usePosStore();", "} = usePosStore();\n  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);")
               .replace(/setView\(/g, "navigate(");
fs.writeFileSync('src/components/PointOfSaleView.tsx', posTsx);
console.log('PointOfSaleView fixed.');

let historyTsx = fs.readFileSync('src/components/TransactionHistoryView.tsx', 'utf8');
historyTsx = historyTsx.replace(/currentUserRole, currentUserStaff/g, "")
                       .replace("export function TransactionHistoryView({", "export function TransactionHistoryView({\n  currentUserRole,\n  currentUserStaff,")
                       .replace(/setView\(/g, "navigate(");
fs.writeFileSync('src/components/TransactionHistoryView.tsx', historyTsx);
console.log('History fixed.');

let cashTsx = fs.readFileSync('src/components/CashManagementView.tsx', 'utf8');
cashTsx = cashTsx.replace(/\["updateItem"\]/g, "updateItem")
                 .replace(/\["deleteItem"\]/g, "deleteItem")
                 .replace(/\["addItem"\]/g, "addItem");
fs.writeFileSync('src/components/CashManagementView.tsx', cashTsx);

console.log('Done');
