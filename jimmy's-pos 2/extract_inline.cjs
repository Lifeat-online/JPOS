const fs = require('fs');
const appTsx = fs.readFileSync('src/App.tsx', 'utf8');

const eHistory = appTsx.substring(appTsx.indexOf("view === 'history' ? (") + 22, appTsx.indexOf(") : view === 'cash' ? (")).trim();
const eCash = appTsx.substring(appTsx.indexOf("view === 'cash' ? (") + 19, appTsx.indexOf(") : view === 'inventory' ? (")).trim();
const eInventory = appTsx.substring(appTsx.indexOf("view === 'inventory' ? (") + 24, appTsx.indexOf(") : view === 'customers' ? (")).trim();
const eCustomers = appTsx.substring(appTsx.indexOf("view === 'customers' ? (") + 24, appTsx.indexOf(") : view === 'staff' ? (")).trim();
const eStaff = appTsx.substring(appTsx.indexOf("view === 'staff' ? (") + 20, appTsx.indexOf(") : view === 'profile' ? (")).trim();

console.log('History length:', eHistory.length);

fs.writeFileSync('src/components/TransactionHistoryView.tsx', `import React from 'react';
import { Search, Users } from 'lucide-react';
import { usePosStore } from '../store/usePosStore';

export function TransactionHistoryView({
  customers,
  filteredSales
}: any) {
  const { searchQuery, setSearchQuery, filterCustomerId, setFilterCustomerId, currentUserRole, currentUserStaff } = usePosStore();

  return (
    ${eHistory.replace(/setView\([^)]+\)/g, "() => console.log('navigate')")}
  );
}`);

fs.writeFileSync('src/components/InventoryView.tsx', `import React from 'react';
import { Package, ShieldCheck, Banknote, Search, Plus, ChevronDown, ChevronRight, Edit, Minus } from 'lucide-react';
import { VendorManagementView } from './VendorManagementView';
import { PurchaseOrdersView } from './PurchaseOrdersView';

export function InventoryView({
  inventoryTab, setInventoryTab,
  SECTIONS, CATEGORY_MAP, SUB_CATEGORY_MAP,
  inventorySearch, setInventorySearch,
  inventorySection, setInventorySection,
  inventoryCategory, setInventoryCategory,
  inventorySubCategory, setInventorySubCategory,
  setProductModal,
  inventoryStats,
  filteredInventory,
  getProductImage,
  db, updateDoc, doc
}: any) {
  return (
    ${eInventory}
  );
}`);

fs.writeFileSync('src/components/CustomersView.tsx', `import React from 'react';
import { UserPlus, Edit, Users } from 'lucide-react';

export function CustomersView({
  customers,
  setCustomerModal,
  setFilterCustomerId,
  navigate
}: any) {
  return (
    ${eCustomers.replace("setView('history')", "navigate('/history')")}
  );
}`);

fs.writeFileSync('src/components/StaffControlView.tsx', `import React from 'react';
import { UserPlus, UserCog, Edit, Trash2 } from 'lucide-react';

export function StaffControlView({
  staff,
  setStaffModal,
  setStaffToDelete
}: any) {
  return (
    ${eStaff}
  );
}`);
