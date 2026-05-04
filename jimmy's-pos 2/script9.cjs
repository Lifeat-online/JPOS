const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const originalHandleCheckout = `  const handleCheckout = async (method: 'cash' | 'payfast' | 'card') => {
    if (cart.length === 0) return;
    setIsProcessing(true);

    try {
      let saleData: any = {
        items: cart,
        total: cartTotal,
        paymentMethod: method,
        status: method === 'payfast' ? 'pending' : 'completed',
        createdAt: serverTimestamp(),
        customerId: selectedCustomerId || null,
        userId: user?.uid || null,
        staffId: currentUserStaff?.id || null,
      };`;

const newHandleCheckout = `  const handleCheckout = async (method: 'cash' | 'payfast' | 'card') => {
    if (cart.length === 0) return;
    setIsProcessing(true);

    try {
      let saleData: any = {
        items: cart,
        total: cartTotal,
        paymentMethod: method,
        status: method === 'payfast' ? 'pending' : 'completed',
        customerId: selectedCustomerId || null,
        userId: user?.uid || null,
        staffId: currentUserStaff?.id || null,
      };
      
      if (!activeOrderId) {
         saleData.createdAt = serverTimestamp();
      }
      
      if (activeTableNumber) {
         saleData.tableNumber = activeTableNumber;
      }`;

content = content.replace(originalHandleCheckout, newHandleCheckout);

const addDocStr = `      const saleRef = await addDoc(collection(db, "sales"), saleData);
      const saleId = saleRef.id;`;

const updatedAddDocStr = `      let saleId = "";
      if (activeOrderId) {
        await updateDoc(doc(db, "sales", activeOrderId), saleData);
        saleId = activeOrderId;
      } else {
        const saleRef = await addDoc(collection(db, "sales"), saleData);
        saleId = saleRef.id;
      }`;

content = content.replace(addDocStr, updatedAddDocStr);

content = content.replace(
  "setCart([]);\n        setSelectedCustomerId(null);",
  "setCart([]);\n        setSelectedCustomerId(null);\n        setActiveOrderId(null);\n        setActiveTableNumber(null);"
);

const saveOrderStr = `  const handleSaveOrder = async (sendToKitchen: boolean) => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      let saleData: any = {
        items: cart,
        total: cartTotal,
        paymentMethod: 'pending',
        status: sendToKitchen ? 'kitchen' : 'open',
        customerId: selectedCustomerId || null,
        userId: user?.uid || null,
        staffId: currentUserStaff?.id || null,
      };
      if (activeTableNumber) saleData.tableNumber = activeTableNumber;
      
      if (activeOrderId) {
        await updateDoc(doc(db, "sales", activeOrderId), saleData);
      } else {
        saleData.createdAt = serverTimestamp();
        await addDoc(collection(db, "sales"), saleData);
      }
      setCart([]);
      setSelectedCustomerId(null);
      setActiveOrderId(null);
      setActiveTableNumber(null);
      setView('tables'); // send them back to tables view
    } catch (error) {
      console.error(error);
      alert('Error saving order');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateQuantity`;

content = content.replace("const updateQuantity", saveOrderStr);

fs.writeFileSync('src/App.tsx', content);
