const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Imports
content = content.replace(
  "import { SettingsView } from './components/SettingsView';",
  "import { SettingsView } from './components/SettingsView';\nimport { TablesView } from './components/TablesView';\nimport { KitchenView } from './components/KitchenView';"
);

// Add missing lucide icons
content = content.replace(
  "} from 'lucide-react';",
  ", ChefHat, Utensils } from 'lucide-react';"
);

const navItemsReplacement = `const getNavItems = () => {
    const items = [
      { id: 'pos', icon: LayoutGrid, label: 'Terminal' }
    ];
    if (config.business?.isRestaurantMode) {
      items.push({ id: 'tables', icon: Utensils, label: 'Tables' });
      items.push({ id: 'kitchen', icon: ChefHat, label: 'Kitchen' });
    }
    items.push(
      { id: 'history', icon: HistoryIcon, label: 'History' },
      { id: 'cash', icon: Banknote, label: 'Cash Mgmt' },
      { id: 'profile', icon: UserCog, label: 'My Wallet' }
    );
    if (currentUserRole === 'admin' || currentUserRole === 'manager') {
       items.push({ id: 'inventory', icon: Package, label: 'Inventory' });
       items.push({ id: 'customers', icon: Users, label: 'Customers' });
    }
    if (currentUserRole === 'admin') {
       items.push({ id: 'staff', icon: Users, label: 'Staff' });
       items.push({ id: 'settings', icon: Settings, label: 'Settings' });
    }
    return items;
  };`;

content = content.replace(/const getNavItems = \(\) => \{[\s\S]*?return items;\n  \};/m, navItemsReplacement);

fs.writeFileSync('src/App.tsx', content);
