const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const viewsReplacement = `        ) : view === 'profile' ? (
          <StaffProfileView currentUserStaff={currentUserStaff} />
        ) : view === 'settings' ? (
          <SettingsView config={config} setConfig={setConfig} />
        ) : view === 'tables' ? (
          <TablesView 
            sales={sales} 
            onSelectTable={(table, order) => {
               setActiveTableNumber(table);
               if (order) {
                 setActiveOrderId(order.id);
                 setCart(order.items);
               } else {
                 setActiveOrderId(null);
                 setCart([]);
               }
               setView('pos');
            }} 
          />
        ) : view === 'kitchen' ? (
          <KitchenView 
            sales={sales} 
            onCompleteOrder={async (orderId) => {
               try {
                  await updateDoc(doc(db, 'sales', orderId), { status: 'open' }); // Ready to serve remains open on table
               } catch (e: any) {
                  console.error(e);
               }
            }} 
          />
        ) : null}`;

content = content.replace(
  ") : view === 'profile' ? (\n          <StaffProfileView currentUserStaff={currentUserStaff} />\n        ) : view === 'settings' ? (\n          <SettingsView config={config} setConfig={setConfig} />\n        ) : null}",
  viewsReplacement
);

fs.writeFileSync('src/App.tsx', content);
