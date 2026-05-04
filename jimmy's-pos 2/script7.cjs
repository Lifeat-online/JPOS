const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  "const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);",
  "const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);\n  const [activeTableNumber, setActiveTableNumber] = useState<string | null>(null);\n  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);"
);

content = content.replace(
  "useState<'pos' | 'history' | 'inventory' | 'customers' | 'settings' | 'staff' | 'cash' | 'profile'>('pos')",
  "useState<'pos' | 'history' | 'inventory' | 'customers' | 'settings' | 'staff' | 'cash' | 'profile' | 'tables' | 'kitchen'>('pos')"
);

fs.writeFileSync('src/App.tsx', content);
