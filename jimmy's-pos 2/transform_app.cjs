const fs = require('fs');
const appTsx = fs.readFileSync('src/App.tsx', 'utf8');

let newAppTsx = appTsx;

// Replace imports safely
if (!newAppTsx.includes('react-router-dom')) {
  newAppTsx = newAppTsx.replace("import React, { useState, useEffect, useMemo, useRef } from 'react';", 
    "import React, { useState, useEffect, useMemo, useRef } from 'react';\nimport { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';\nimport { PointOfSaleView } from './components/PointOfSaleView';\nimport { TransactionHistoryView } from './components/TransactionHistoryView';\nimport { InventoryView } from './components/InventoryView';\nimport { CustomersView } from './components/CustomersView';\nimport { StaffControlView } from './components/StaffControlView';");
}

// Removing view state and adding location + navigate hooks
newAppTsx = newAppTsx.replace("const [view, setView] = useState<'pos' | 'history' | 'inventory' | 'customers' | 'settings' | 'staff' | 'cash' | 'profile' | 'tables' | 'workstation' | 'leaderboard' | 'reports'>('pos');", 
  "const navigate = useNavigate();\n  const location = useLocation();\n  const view = location.pathname.substring(1) || 'pos';");

// Navigation logic mapping
newAppTsx = newAppTsx.replace(/onClick=\{\(\) => setView\(item\.id\)\}/g, "onClick={() => navigate('/' + (item.id === 'pos' ? '' : item.id))}");
newAppTsx = newAppTsx.replace(/setView\('([^']+)'\)/g, "navigate('/$1')");
newAppTsx = newAppTsx.replace(/navigate\('\/pos'\)/g, "navigate('/')");

const blockStart = "        {view === 'pos' ? (";
const blockEnd = "        ) : null}";

const renderStartIdx = newAppTsx.indexOf(blockStart);
const renderEndIdx = newAppTsx.indexOf(blockEnd) + blockEnd.length;

if (renderStartIdx === -1 || renderEndIdx < renderStartIdx) {
  console.log("Could not find the render block! Start:", renderStartIdx, "End:", renderEndIdx, "Index blockEnd:", newAppTsx.indexOf(blockEnd));
} else {
  const replacementRoutes = `
        <Routes>
          <Route path="/" element={<PointOfSaleView
            user={user}
            currentUserStaff={currentUserStaff}
            activeSession={activeSession}
            config={config}
            categoryTree={categoryTree}
            CATEGORY_MAP={CATEGORY_MAP}
            SUB_CATEGORY_MAP={SUB_CATEGORY_MAP}
            CATEGORIES={CATEGORIES}
            allowedCategories={allowedCategories}
            filteredProducts={filteredProducts}
            getCategoryIcon={getCategoryIcon}
            getProductImage={getProductImage}
            handleCheckout={handleCheckout}
            handleSaveOrder={handleSaveOrder}
            checkoutModal={checkoutModal}
            setCheckoutModal={setCheckoutModal}
            customerModal={customerModal}
            setCustomerModal={setCustomerModal}
            tenderModal={tenderModal}
            setTenderModal={setTenderModal}
            tenderedAmount={tenderedAmount}
            setTenderedAmount={setTenderedAmount}
            cardOverageAction={cardOverageAction}
            setCardOverageAction={setCardOverageAction}
            isScanning={isScanning}
            setIsScanning={setIsScanning}
            handleBarcodeScan={handleBarcodeScan}
            isCartOpen={isCartOpen}
            setIsCartOpen={setIsCartOpen}
          />} />
          <Route path="/history" element={<TransactionHistoryView customers={customers} filteredSales={filteredSales} />} />
          <Route path="/cash" element={<CashManagementView currentUserStaff={currentUserStaff} />} />
          <Route path="/inventory" element={<InventoryView 
            inventoryTab={inventoryTab} setInventoryTab={setInventoryTab}
            SECTIONS={SECTIONS} CATEGORY_MAP={CATEGORY_MAP} SUB_CATEGORY_MAP={SUB_CATEGORY_MAP}
            inventorySearch={inventorySearch} setInventorySearch={setInventorySearch}
            inventorySection={inventorySection} setInventorySection={setInventorySection}
            inventoryCategory={inventoryCategory} setInventoryCategory={setInventoryCategory}
            inventorySubCategory={inventorySubCategory} setInventorySubCategory={setInventorySubCategory}
            setProductModal={setProductModal}
            inventoryStats={inventoryStats}
            filteredInventory={filteredInventory}
            getProductImage={getProductImage}
            db={db} updateDoc={updateDoc} doc={doc}
          />} />
          <Route path="/customers" element={<CustomersView customers={customers} setCustomerModal={setCustomerModal} setFilterCustomerId={setFilterCustomerId} navigate={navigate} />} />
          <Route path="/staff" element={<StaffControlView staff={staff} setStaffModal={setStaffModal} setStaffToDelete={setStaffToDelete} />} />
          <Route path="/profile" element={<StaffProfileView currentUserStaff={currentUserStaff} />} />
          <Route path="/settings" element={<SettingsView config={config} setConfig={setConfig} />} />
          <Route path="/tables" element={<TablesView sales={sales} onSelectTable={(table, order) => {
             setActiveTableNumber(table);
             if (order) {
               setActiveOrderId(order.id);
               setCart(order.items);
             } else {
               setActiveOrderId(null);
               clearCart();
             }
             navigate('/');
          }} />} />
          <Route path="/workstation" element={<WorkstationView sales={sales} workstations={[{id: 'ws-1', name: 'Kitchen', type: 'kitchen'}]} currentUserStaff={currentUserStaff} />} />
          <Route path="/leaderboard" element={<LeaderboardView staff={staff} />} />
          <Route path="/reports" element={<ReportsView sales={sales} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
  `;

  newAppTsx = newAppTsx.substring(0, renderStartIdx) + replacementRoutes + newAppTsx.substring(renderEndIdx);

  fs.writeFileSync('src/App.tsx', newAppTsx);
  console.log("App.tsx transformed successfully!");
}
