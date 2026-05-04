const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const tableHeader = `
                      {config?.business?.isRestaurantMode && activeTableNumber && (
                        <div className="flex justify-between items-center mb-4 p-3 bg-primary/10 rounded-xl border border-primary/20">
                          <span className="font-bold text-primary flex items-center gap-2"><Utensils className="w-4 h-4"/> Table {activeTableNumber}</span>
                          <button onClick={() => { setActiveTableNumber(null); setActiveOrderId(null); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">Clear</button>
                        </div>
                      )}
                      <div className="flex justify-between items-center mb-6">
                        <span className="font-bold text-slate-400`;

content = content.replace(
  `<div className="flex justify-between items-center mb-6">\n                        <span className="font-bold text-slate-400`,
  tableHeader
);

const restaurantButtons = `
                      {config?.business?.isRestaurantMode && (
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <button 
                            disabled={isProcessing || cart.length === 0}
                            onClick={() => handleSaveOrder(false)}
                            className="h-14 rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 text-xs uppercase tracking-widest flex items-center justify-center gap-2 border border-orange-200 dark:border-orange-800/50"
                          >
                            <span className="truncate">Hold</span>
                          </button>
                          <button 
                            disabled={isProcessing || cart.length === 0}
                            onClick={() => handleSaveOrder(true)}
                            className="h-14 rounded-2xl bg-orange-500 text-white font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 shadow-lg shadow-orange-500/30 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                          >
                            <ChefHat className="w-4 h-4 shrink-0" /> <span className="truncate">Kitchen</span>
                          </button>
                        </div>
                      )}
                      
                      <div className="flex gap-2">`;

content = content.replace(
  `                      <div className="flex gap-2">`,
  restaurantButtons
);

fs.writeFileSync('src/App.tsx', content);
