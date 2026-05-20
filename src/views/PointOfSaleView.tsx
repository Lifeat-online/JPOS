import React, { useEffect, useState, useMemo } from 'react';
import { 
  ShoppingBag, Search, Plus, Minus, Trash2, CreditCard, Banknote, 
  ShoppingCart, Loader2, QrCode, Users, ChefHat, Utensils, Lock, X, StickyNote, Wallet, TabletSmartphone, Rows, Printer,
  AlertTriangle, PauseCircle, PlayCircle, ScanLine
} from 'lucide-react';
import { ModifierSelectionModal } from '../components/modals/ModifierSelectionModal';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Customer, Sale, Workstation, RestaurantTable } from '../types';
import { CustomerSelector } from '../components/CustomerSelector';
import { usePosStore } from '../store/usePosStore';
import { WorkstationQueuePanel } from '../components/WorkstationQueuePanel';
import { BillPrint } from '../components/BillPrint';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { getCompanionDeviceAssignment, recordCashMovement } from '../api';
import { useSocket } from '../hooks/useSocket';
import { JwtUser } from '../hooks/useAuth';

interface PointOfSaleViewProps {
  products: Product[];
  user: JwtUser | null;
  customers: Customer[];
  sales: Sale[];
  workstations: Workstation[];
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
  handleSaveOrder: (sendToKitchen: boolean) => Promise<void>;
  handleParkSale: (label?: string) => Promise<string | null>;
  handleCheckout: (method: 'cash' | 'payfast' | 'card') => Promise<void>;
  handleWalletCheckout: () => Promise<void>;
  handleOpenTab: (tabName?: string) => Promise<void>;
  handleOpenTable: (tableNumber: string) => Promise<void>;
  setTenderModal: (modal: { isOpen: boolean, method: 'cash' | 'card' | null }) => void;
  setTenderedAmount: (amount: string) => void;
  setSplitPaymentModal: (val: boolean) => void;
  categoryTree: any;
  CATEGORIES: string[];
  getCategoryIcon: (cat: string) => string;
  getProductImage: (product: Partial<Product>) => string;
  openCashDrawer: () => void;
  pointsDiscount: number;
  onRedeemPoints: (customerId: string, points: number) => void;
  onClearPointsDiscount: () => void;
  restaurantTables: RestaurantTable[];
  onSalesUpdated?: () => Promise<void>;
  lastReceiptSale?: Sale | null;
  onPrintLastReceipt?: () => void;
  suppressBillPrint?: boolean;
}

export const PointOfSaleView: React.FC<PointOfSaleViewProps> = ({
  products, user, customers, sales, workstations, isProcessing, setIsProcessing, handleSaveOrder,
  handleParkSale, handleCheckout, handleWalletCheckout, handleOpenTab, handleOpenTable, setTenderModal, setTenderedAmount, setSplitPaymentModal,
  categoryTree, CATEGORIES, getCategoryIcon, getProductImage, openCashDrawer,
  pointsDiscount, onRedeemPoints, onClearPointsDiscount, restaurantTables, onSalesUpdated,
  lastReceiptSale, onPrintLastReceipt, suppressBillPrint = false,
}) => {
  const { 
    cart, addToCart, updateQuantity, clearCart, 
    activeSession, activeCategory, setActiveCategory,
    searchQuery, setSearchQuery, selectedCustomerId, setSelectedCustomerId,
    activeTableNumber, setActiveTableNumber, activeOrderId, setActiveOrderId,
    setCart,
    currentUserStaff, config,
    isCartOpen, setIsCartOpen,
    tenantId,
  } = usePosStore();

  const [isScanning, setIsScanning] = useState(false);
  const [modifyingProduct, setModifyingProduct] = useState<Product | null>(null);
  const [attachedWorkstationId, setAttachedWorkstationId] = useState('');
  const [hasWorkstationPreference, setHasWorkstationPreference] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState<'cart' | 'queue'>('cart');
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [selectedTableForOrder, setSelectedTableForOrder] = useState('');
  const [drawerModalOpen, setDrawerModalOpen] = useState(false);
  const [drawerReason, setDrawerReason] = useState('');
  const [drawerCustomReason, setDrawerCustomReason] = useState('');
  const [drawerError, setDrawerError] = useState('');
  const [isRecordingDrawerOpen, setIsRecordingDrawerOpen] = useState(false);
  const [stockNotice, setStockNotice] = useState<{ type: 'warning' | 'error'; message: string } | null>(null);
  const [parkModalOpen, setParkModalOpen] = useState(false);
  const [parkLabel, setParkLabel] = useState('');
  const [parkError, setParkError] = useState('');
  const [priceCheckProduct, setPriceCheckProduct] = useState<Product | null>(null);
  const [priceCheckError, setPriceCheckError] = useState('');
  const [companionMode, setCompanionMode] = useState<'terminal' | 'wireless_scanner' | 'pole_display'>(() => {
    try {
      const saved = window.localStorage.getItem('companion-mode');
      return saved === 'wireless_scanner' || saved === 'pole_display' ? saved : 'terminal';
    } catch {
      return 'terminal';
    }
  });
  const [assignedCompanionMode, setAssignedCompanionMode] = useState<'wireless_scanner' | 'pole_display' | null>(null);
  const [poleDisplayDeviceId, setPoleDisplayDeviceId] = useState<string | null>(null);
  const [displaySnapshot, setDisplaySnapshot] = useState<any>(null);
  const [longTermAssignment, setLongTermAssignment] = useState<any>(null);

  const drawerReasons = [
    'Make change',
    'Check drawer',
    'Cash drop',
    'Manager count',
    'Other',
  ];

  const getCartQuantityForProduct = (productId: string) => cart.reduce((sum, item) => (
    item.id === productId || (item as any).productId === productId ? sum + Number(item.quantity || 0) : sum
  ), 0);

  const getStockInfo = (product: Product) => {
    const stock = Number(product.stock || 0);
    const minStock = Number(product.minStock ?? 10);
    const inCart = getCartQuantityForProduct(product.id);
    const remainingAfterCart = stock - inCart;
    return { stock, minStock, inCart, remainingAfterCart };
  };

  const canAddProductToCart = (product: Product, showNotice = true) => {
    const { stock, minStock, inCart, remainingAfterCart } = getStockInfo(product);

    if (stock <= 0) {
      if (showNotice) setStockNotice({ type: 'error', message: `${product.name} is out of stock. Ask a manager to adjust stock before selling it.` });
      return false;
    }

    if (remainingAfterCart <= 0) {
      if (showNotice) setStockNotice({ type: 'error', message: `Only ${stock} ${stock === 1 ? 'unit is' : 'units are'} available for ${product.name}. The cart already has ${inCart}.` });
      return false;
    }

    if (stock <= minStock || remainingAfterCart - 1 <= minStock) {
      if (showNotice) setStockNotice({ type: 'warning', message: `${product.name} is running low. ${Math.max(0, remainingAfterCart - 1)} will remain after this add.` });
    } else if (showNotice) {
      setStockNotice(null);
    }

    return true;
  };

  const handleAddToCart = (product: Product) => {
    if (!canAddProductToCart(product)) return;
    if (product.modifiers && product.modifiers.length > 0) {
      setModifyingProduct(product);
    } else {
      addToCart(product);
      setIsCartOpen(true);
    }
  };

  const cartTotal = useMemo(() => cart.reduce((total, item) => total + (item.price * item.quantity), 0), [cart]);
  const amountDue = Math.max(0, cartTotal - pointsDiscount);
  const selectedCustomer = useMemo(
    () => selectedCustomerId ? customers.find(c => c.id === selectedCustomerId) || null : null,
    [customers, selectedCustomerId]
  );
  const selectedCustomerWalletBalance = Number(selectedCustomer?.walletBalance || 0);
  const canPayWithCustomerWallet = Boolean(selectedCustomer && selectedCustomerWalletBalance > 0);
  const activeWorkstations = useMemo(() => workstations.filter(w => w.status === 'active'), [workstations]);
  const attachedWorkstation = activeWorkstations.find(w => w.id === attachedWorkstationId);
  const workstationPreferenceKey = `pos-attached-workstation:${tenantId || 'local'}`;
  const isWideRegister = typeof window !== 'undefined' && window.innerWidth >= 1536;
  const activeRestaurantTables = useMemo(() => {
    if (restaurantTables.length > 0) return restaurantTables.filter(t => t.status === 'active');
    return Array.from({ length: 20 }, (_, i) => ({
      id: `T${i + 1}`,
      label: `T${i + 1}`,
      sectionId: 'default',
      status: 'active' as const,
    }));
  }, [restaurantTables]);
  const selectedTableLabel = activeRestaurantTables.find(t => t.id === (activeTableNumber || selectedTableForOrder))?.label || activeTableNumber || selectedTableForOrder;
  const companionDeviceIdKey = `companion-device-id:${tenantId || 'local'}:${currentUserStaff?.id || 'staff'}`;
  const companionDeviceId = useMemo(() => {
    try {
      const existing = window.localStorage.getItem(companionDeviceIdKey);
      if (existing) return existing;
      const created = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      window.localStorage.setItem(companionDeviceIdKey, created);
      return created;
    } catch {
      return `device_${Date.now()}`;
    }
  }, [companionDeviceIdKey]);
  const effectiveWorkstationId = longTermAssignment?.workstationId || attachedWorkstationId || '';
  const terminalId = tenantId && currentUserStaff?.id
    ? effectiveWorkstationId
      ? `workstation-terminal:${tenantId}:${effectiveWorkstationId}`
      : `account-terminal:${tenantId}:${currentUserStaff.id}`
    : '';
  const companionSocket = useSocket({
    user,
    tenantId,
    enabled: Boolean(tenantId && currentUserStaff?.id),
  });
  const isWirelessScannerMode = companionMode !== 'terminal' && assignedCompanionMode === 'wireless_scanner';
  const parkedSales = useMemo(() => sales
    .filter(s => (
      s.status === 'open' &&
      s.id !== activeOrderId &&
      s.paymentMethod === 'pending' &&
      !s.isTab &&
      !s.tableNumber &&
      s.transactionType !== 'refund' &&
      s.transactionType !== 'void'
    ))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()), [sales, activeOrderId]);
  const blockingStockIssues = useMemo(() => cart
    .map(item => {
      const productId = (item as any).productId || item.id;
      const product = products.find(p => p.id === productId);
      if (!product) return null;
      const stock = Number(product.stock || 0);
      const quantity = Number(item.quantity || 0);
      if (stock <= 0) return `${item.name} is out of stock`;
      if (quantity > stock) return `${item.name} has ${stock} available, cart has ${quantity}`;
      return null;
    })
    .filter(Boolean) as string[], [cart, products]);
  const hasBlockingStockIssues = blockingStockIssues.length > 0;
  const cartSnapshot = useMemo(() => ({
    items: cart.map(item => ({
      id: (item as any).cartItemId || item.id,
      name: item.name,
      quantity: Number(item.quantity || 0),
      price: Number(item.price || 0),
      lineTotal: Number(item.price || 0) * Number(item.quantity || 0),
    })),
    total: amountDue,
    subtotal: cartTotal,
    itemCount: cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    customerName: selectedCustomer?.name || '',
    updatedAt: new Date().toISOString(),
  }), [cart, amountDue, cartTotal, selectedCustomer?.name]);

  const saveToTable = async (tableNumber: string) => {
    if (!tableNumber) return;
    await handleOpenTable(tableNumber);
    setSelectedTableForOrder(tableNumber);
    setTablePickerOpen(false);
  };

  const defaultParkLabel = () => {
    const customerName = selectedCustomerId ? customers.find(c => c.id === selectedCustomerId)?.name : '';
    if (customerName) return customerName;
    return `Parked ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const openParkModal = () => {
    setParkLabel(defaultParkLabel());
    setParkError('');
    setParkModalOpen(true);
  };

  const confirmParkSale = async () => {
    if (hasBlockingStockIssues) {
      setParkError('Fix the stock issue before parking this sale.');
      return;
    }
    if (cart.length === 0) {
      setParkError('Add at least one item before parking a sale.');
      return;
    }

    const savedId = await handleParkSale(parkLabel);
    if (savedId) {
      setParkModalOpen(false);
      setParkLabel('');
      setParkError('');
      setIsCartOpen(false);
      await onSalesUpdated?.();
    }
  };

  const resumeParkedSale = (sale: Sale) => {
    setCart(sale.items.map((item: any) => ({
      ...item,
      id: item.productId || item.id,
      cartItemId: item.id || item.cartItemId,
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 0),
    })));
    setSelectedCustomerId(sale.customerId || null);
    setActiveOrderId(sale.id);
    setActiveTableNumber(null);
    setStockNotice(null);
    setIsCartOpen(true);
  };

  const handleBarcodeLookup = (barcode: string) => {
    const cleaned = barcode.trim();
    const product = products.find(p => String(p.barcode || '').trim() === cleaned);
    setIsScanning(false);
    if (isWirelessScannerMode && terminalId) {
      companionSocket.emit('companion_command', {
        terminalId,
        command: 'barcode_lookup',
        data: { barcode: cleaned },
      });
      setStockNotice({ type: 'warning', message: `Sent barcode ${cleaned} to the active terminal.` });
      return;
    }
    if (!product) {
      setPriceCheckProduct(null);
      setPriceCheckError(`No product found for barcode ${cleaned}.`);
      return;
    }
    setPriceCheckError('');
    setPriceCheckProduct(product);
  };

  const updateCompanionMode = (mode: typeof companionMode) => {
    setCompanionMode(mode);
    setAssignedCompanionMode(null);
    try {
      window.localStorage.setItem('companion-mode', mode);
    } catch {
      // Mode still works for this session if storage is blocked.
    }
  };

  useEffect(() => {
    const changeMode = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: typeof companionMode }>).detail?.mode;
      if (mode === 'terminal' || mode === 'wireless_scanner' || mode === 'pole_display') {
        updateCompanionMode(mode);
      }
    };
    const openScanner = () => setIsScanning(true);
    const markTerminal = () => {
      updateCompanionMode('terminal');
      if (!tenantId || !currentUserStaff?.id) return;
      companionSocket.emit('account_terminal_select', {
        tenantId,
        staffId: currentUserStaff.id,
        deviceId: companionDeviceId,
      });
    };

    window.addEventListener('jpos:companion-mode-change', changeMode);
    window.addEventListener('jpos:companion-open-scanner', openScanner);
    window.addEventListener('jpos:companion-mark-terminal', markTerminal);
    return () => {
      window.removeEventListener('jpos:companion-mode-change', changeMode);
      window.removeEventListener('jpos:companion-open-scanner', openScanner);
      window.removeEventListener('jpos:companion-mark-terminal', markTerminal);
    };
  }, [terminalId, tenantId, currentUserStaff?.id, companionDeviceId, companionSocket.emit]);

  useEffect(() => {
    const detail = {
      companionMode,
      assignedCompanionMode,
      poleDisplayDeviceId,
      companionDeviceId,
      terminalId,
      staffName: currentUserStaff?.name || null,
      longTermAssignment,
      displaySnapshot,
    };
    window.dispatchEvent(new CustomEvent('jpos:companion-state', { detail }));
    window.dispatchEvent(new CustomEvent('jpos:account-terminal-presence-request'));

    const resendState = () => {
      window.dispatchEvent(new CustomEvent('jpos:companion-state', { detail }));
      window.dispatchEvent(new CustomEvent('jpos:account-terminal-presence-request'));
    };
    window.addEventListener('jpos:companion-state-request', resendState);
    return () => window.removeEventListener('jpos:companion-state-request', resendState);
  }, [
    companionMode,
    assignedCompanionMode,
    poleDisplayDeviceId,
    companionDeviceId,
    terminalId,
    currentUserStaff?.name,
    longTermAssignment,
    displaySnapshot,
  ]);

  useEffect(() => {
    if (!tenantId || !companionDeviceId) return;
    getCompanionDeviceAssignment(tenantId, companionDeviceId)
      .then(assignment => {
        setLongTermAssignment(assignment);
        if (assignment?.defaultMode === 'wireless_scanner' || assignment?.defaultMode === 'pole_display') {
          setCompanionMode(assignment.defaultMode);
          try {
            window.localStorage.setItem('companion-mode', assignment.defaultMode);
          } catch {
            // Assignment still applies for this session.
          }
        }
      })
      .catch(() => setLongTermAssignment(null));
  }, [tenantId, companionDeviceId]);

  useEffect(() => {
    if (!companionSocket.socket || !terminalId || !currentUserStaff?.id) return;

    const socket = companionSocket.socket;
    const onActiveTerminalSelected = (payload: any) => {
      const activeDeviceId = String(payload?.activeTerminalDeviceId || '');
      if (!activeDeviceId) return;
      if (activeDeviceId === companionDeviceId) {
        updateCompanionMode('terminal');
      }
      window.dispatchEvent(new CustomEvent('jpos:companion-state', {
        detail: { activeTerminalDeviceId: activeDeviceId },
      }));
    };
    const onAssigned = (payload: any) => {
      if (payload?.terminalId !== terminalId) return;
      setAssignedCompanionMode(payload.assignedMode || null);
      setPoleDisplayDeviceId(payload.poleDisplayDeviceId || null);
      if (payload.requestedMode === 'pole_display' && payload.assignedMode !== 'pole_display') {
        setStockNotice({ type: 'warning', message: 'Pole display is already paired. This device can still use wireless scanner mode.' });
      }
    };
    const onState = (payload: any) => {
      if (payload?.terminalId === terminalId) setPoleDisplayDeviceId(payload.poleDisplayDeviceId || null);
    };
    const onCommand = (payload: any) => {
      if (companionMode !== 'terminal') return;
      if (payload?.command === 'barcode_lookup') {
        const barcode = String(payload.data?.barcode || '').trim();
        const product = products.find(p => String(p.barcode || '').trim() === barcode);
        if (product) {
          handleAddToCart(product);
        } else {
          setStockNotice({ type: 'error', message: `Wireless scanner sent ${barcode}, but no matching product was found.` });
        }
      }
    };
    const onDisplayUpdate = (payload: any) => {
      if (payload?.terminalId === terminalId) setDisplaySnapshot(payload.data || null);
    };

    socket.on('companion_mode_assigned', onAssigned);
    socket.on('companion_state', onState);
    socket.on('companion_command', onCommand);
    socket.on('account_active_terminal_selected', onActiveTerminalSelected);
    socket.on('terminal_display_update', onDisplayUpdate);

    if (companionMode === 'terminal') {
      companionSocket.emit('terminal_register', {
        tenantId,
        staffId: currentUserStaff.id,
        terminalId,
        deviceId: companionDeviceId,
      });
    } else {
      companionSocket.emit('companion_join', {
        tenantId,
        staffId: currentUserStaff.id,
        terminalId,
        deviceId: companionDeviceId,
        mode: companionMode,
      });
    }

    return () => {
      socket.off('companion_mode_assigned', onAssigned);
      socket.off('companion_state', onState);
      socket.off('companion_command', onCommand);
      socket.off('account_active_terminal_selected', onActiveTerminalSelected);
      socket.off('terminal_display_update', onDisplayUpdate);
    };
  }, [companionSocket.socket, terminalId, companionMode, tenantId, currentUserStaff?.id, companionDeviceId, products, companionSocket.emit]);

  useEffect(() => {
    if (companionMode === 'terminal' && terminalId && companionSocket.isConnected) {
      companionSocket.emit('terminal_display_update', { terminalId, data: cartSnapshot });
    }
  }, [companionMode, terminalId, companionSocket.isConnected, companionSocket.emit, cartSnapshot]);

  const attachedQueueCount = useMemo(() => {
    if (!attachedWorkstationId) return 0;
    return sales.reduce((count, sale) => {
      if (sale.status !== 'kitchen' && sale.status !== 'open') return count;
      return count + sale.items.filter(item => {
        const orderItem = item as any;
        return orderItem.workstationId === attachedWorkstationId &&
          (orderItem.status === 'pending' || orderItem.status === 'accepted');
      }).length;
    }, 0);
  }, [attachedWorkstationId, sales]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(workstationPreferenceKey);
      setHasWorkstationPreference(saved !== null);
      setAttachedWorkstationId(saved && saved !== 'none' ? saved : '');
    } catch {
      setHasWorkstationPreference(false);
      setAttachedWorkstationId('');
    }
  }, [workstationPreferenceKey]);

  useEffect(() => {
    if (attachedWorkstationId && !activeWorkstations.some(w => w.id === attachedWorkstationId)) {
      setAttachedWorkstationId('');
      setSidePanelMode('cart');
      try {
        window.localStorage.setItem(workstationPreferenceKey, 'none');
      } catch {
        // Ignore storage failures; the selector still works for this session.
      }
    }
  }, [activeWorkstations, attachedWorkstationId, workstationPreferenceKey]);

  const updateAttachedWorkstation = (workstationId: string) => {
    setAttachedWorkstationId(workstationId);
    setHasWorkstationPreference(true);
    if (!workstationId) setSidePanelMode('cart');
    try {
      window.localStorage.setItem(workstationPreferenceKey, workstationId || 'none');
    } catch {
      // Ignore storage failures; the selector still works for this session.
    }
  };

  const printBill = () => {
    if (cart.length === 0) return;
    window.print();
  };

  const openDrawerModal = () => {
    setDrawerReason('');
    setDrawerCustomReason('');
    setDrawerError('');
    setDrawerModalOpen(true);
  };

  const confirmNoSaleDrawerOpen = async () => {
    if (!tenantId || !activeSession?.id) {
      setDrawerError('Open the register before using the cash drawer.');
      return;
    }

    const reason = drawerReason === 'Other' ? drawerCustomReason.trim() : drawerReason;
    if (reason.length < 3) {
      setDrawerError('Choose or enter a reason before opening the drawer.');
      return;
    }

    setIsRecordingDrawerOpen(true);
    setDrawerError('');
    try {
      await recordCashMovement(tenantId, activeSession.id, {
        type: 'no_sale',
        direction: 'neutral',
        amount: 0,
        staffId: currentUserStaff?.id || null,
        staffName: currentUserStaff?.name || null,
        note: reason,
      });
      setDrawerModalOpen(false);
    } catch (error: any) {
      setDrawerError(error?.message || 'Could not record the drawer open.');
    } finally {
      setIsRecordingDrawerOpen(false);
    }
  };

  const allowedCategories = useMemo(() => {
    if (!currentUserStaff || currentUserStaff.role !== 'cashier') return CATEGORIES;
    const hasSectionRestriction = Array.isArray(currentUserStaff.assignedSections) && currentUserStaff.assignedSections.length > 0;
    const hasCategoryRestriction = Array.isArray(currentUserStaff.assignedCategories) && currentUserStaff.assignedCategories.length > 0;
    
    if (!hasSectionRestriction && !hasCategoryRestriction) return CATEGORIES;

    const allowedCatSet = new Set<string>();
    
    if (hasSectionRestriction) {
      currentUserStaff.assignedSections!.forEach(sec => {
        Object.keys(categoryTree[sec] || {}).forEach(cat => allowedCatSet.add(cat));
      });
    }
    
    if (hasCategoryRestriction) {
      currentUserStaff.assignedCategories!.forEach(cat => allowedCatSet.add(cat));
    }

    return ["All", ...Array.from(allowedCatSet)];
  }, [currentUserStaff, categoryTree, CATEGORIES]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (currentUserStaff && currentUserStaff.role === 'cashier') {
        const hasSectionRestriction = Array.isArray(currentUserStaff.assignedSections) && currentUserStaff.assignedSections.length > 0;
        const hasCategoryRestriction = Array.isArray(currentUserStaff.assignedCategories) && currentUserStaff.assignedCategories.length > 0;
        
        if (hasSectionRestriction || hasCategoryRestriction) {
          const sectionAllowed = hasSectionRestriction && currentUserStaff.assignedSections!.includes(p.section || '');
          const categoryAllowed = hasCategoryRestriction && currentUserStaff.assignedCategories!.includes(p.category);
          
          if (!sectionAllowed && !categoryAllowed) return false;
        }
      }

      const matchesCategory = activeCategory === "All" || p.category === activeCategory;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategory, searchQuery, currentUserStaff]);

  if (!activeSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 max-w-md w-full shadow-2xl text-center border border-slate-100 dark:border-slate-800/60">
          <div className="w-20 h-20 bg-orange-50 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
             <Lock className="w-10 h-10 text-orange-500" />
          </div>
          <h3 className="text-2xl font-black mb-2 tracking-tight text-slate-900 dark:text-white">Register Closed</h3>
          <p className="text-slate-500 font-medium mb-8">You must open the register and declare a starting float before processing transactions.</p>
          <button onClick={openCashDrawer} className="w-full py-4 bg-primary text-white rounded-xl font-bold uppercase tracking-widest text-sm shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
            Open Register
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">
      {cart.length > 0 && !suppressBillPrint && (
        <BillPrint
          cart={cart}
          customer={selectedCustomer}
          config={config}
          subtotal={cartTotal}
          discount={pointsDiscount}
        />
      )}
      <nav className="w-full lg:w-24 bg-white dark:bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-700/60 flex lg:flex-col items-center py-2 lg:py-6 px-4 lg:px-0 gap-3 lg:gap-6 overflow-x-auto no-scrollbar shrink-0 shadow-sm lg:shadow-none z-10">
        {allowedCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`min-w-[80px] lg:w-16 h-12 lg:h-16 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border-2 shrink-0 ${
              activeCategory === cat 
              ? 'bg-[#eff6ff] text-primary border-[#bfdbfe] shadow-sm' 
              : 'text-slate-400 dark:text-slate-500 border-transparent bg-slate-50 dark:bg-[#0B1120] lg:bg-transparent lg:dark:bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="text-base lg:text-xl">{cat === 'All' ? '🏠' : getCategoryIcon(cat)}</span>
            <span className="text-[9px] lg:text-[10px] font-bold uppercase tracking-wide">{cat}</span>
          </button>
        ))}
      </nav>

      <section className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-50/30">
        <div className="p-4 lg:p-6 pb-2 flex flex-col sm:flex-row gap-3 lg:gap-4 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search products..."
              className="w-full pl-12 pr-12 py-3 lg:py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-medium transition-all shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button 
              onClick={() => setIsScanning(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-slate-50 dark:bg-[#0B1120] text-primary rounded-lg hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95"
              title="Price check / scan barcode"
            >
              <ScanLine className="w-5 h-5" />
            </button>
          </div>
          <div className="sm:w-80 relative">
            <CustomerSelector 
              customers={customers}
              selectedId={selectedCustomerId}
              onSelect={setSelectedCustomerId}
              onAddNew={() => {}}
            />
          </div>
          <button
            type="button"
            disabled={!lastReceiptSale || !onPrintLastReceipt}
            onClick={onPrintLastReceipt}
            className="sm:w-44 min-h-[48px] px-4 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-sm transition-all hover:border-primary/40 hover:text-primary disabled:opacity-40 disabled:hover:border-slate-200 dark:disabled:hover:border-slate-700/60 disabled:hover:text-slate-700 dark:disabled:hover:text-slate-200 active:scale-95 flex items-center justify-center gap-2"
            title={lastReceiptSale ? `Reprint last receipt #${lastReceiptSale.id.slice(-8).toUpperCase()}` : 'No completed sale to reprint yet'}
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span className="min-w-0 text-left">
              <span className="block text-[10px] font-black uppercase tracking-widest leading-none">Last receipt</span>
              <span className="mt-1 block truncate text-[10px] font-bold text-slate-400 dark:text-slate-500">
                {lastReceiptSale ? `#${lastReceiptSale.id.slice(-8).toUpperCase()}` : 'None yet'}
              </span>
            </span>
          </button>
          {config?.business?.isRestaurantMode && activeWorkstations.length > 0 && (
            <div className="sm:w-64 flex gap-2">
              <div className="relative flex-1">
                <ChefHat className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                <select
                  value={attachedWorkstationId}
                  onChange={e => updateAttachedWorkstation(e.target.value)}
                  className="w-full pl-10 pr-8 py-3 lg:py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-xs font-black text-slate-700 dark:text-slate-200 transition-all shadow-sm appearance-none"
                  title="Register workstation"
                >
                  <option value="">No Station</option>
                  {activeWorkstations.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              {attachedWorkstation && (
                <button
                  onClick={() => { setSidePanelMode('queue'); setIsCartOpen(true); }}
                  className="lg:hidden relative w-12 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-sm active:scale-95 transition-all"
                  title="Open workstation queue"
                >
                  <ChefHat className="w-5 h-5" />
                  {attachedQueueCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center ring-2 ring-white">
                      {attachedQueueCount > 99 ? '99+' : attachedQueueCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {assignedCompanionMode === 'pole_display' && (
          <div className="fixed inset-0 z-[120] bg-slate-950 text-white flex flex-col">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Pole display</p>
                <h2 className="text-xl font-black">Customer display</h2>
              </div>
              <button
                type="button"
                onClick={() => updateCompanionMode('terminal')}
                className="h-10 px-4 rounded-xl bg-white/10 text-xs font-black uppercase tracking-widest"
              >
                Exit
              </button>
            </div>
            <div className="flex-1 p-6 flex flex-col">
              <div className="flex-1 space-y-3 overflow-y-auto">
                {(displaySnapshot?.items || []).length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-white/50">
                    <ShoppingCart className="w-16 h-16 mb-4" />
                    <p className="text-sm font-black uppercase tracking-widest">Ready for next sale</p>
                  </div>
                ) : (
                  displaySnapshot.items.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white/10 p-4">
                      <div>
                        <p className="text-lg font-black">{item.name}</p>
                        <p className="text-xs font-bold text-white/50">Qty {item.quantity}</p>
                      </div>
                      <p className="text-xl font-black">R{Number(item.lineTotal || 0).toFixed(2)}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-6 rounded-3xl bg-primary p-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">Total</p>
                  <p className="mt-1 text-sm font-bold text-white/80">{displaySnapshot?.customerName || 'Walk-in customer'}</p>
                </div>
                <p className="text-5xl font-black">R{Number(displaySnapshot?.total || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        {stockNotice && (
          <div className={`mx-4 lg:mx-6 mb-2 rounded-2xl border p-3 flex items-start justify-between gap-3 ${
            stockNotice.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/10 dark:border-rose-900/40 dark:text-rose-300'
              : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/10 dark:border-amber-900/40 dark:text-amber-300'
          }`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-xs font-bold">{stockNotice.message}</p>
            </div>
            <button type="button" onClick={() => setStockNotice(null)} className="text-current/70 hover:text-current">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {parkedSales.length > 0 && (
          <div className="mx-4 lg:mx-6 mb-2 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/80 dark:bg-indigo-900/10 p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <PauseCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                <p className="text-xs font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">Parked sales</p>
              </div>
              <span className="text-[10px] font-black text-indigo-500">{parkedSales.length}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {parkedSales.slice(0, 8).map(sale => {
                const customer = sale.customerId ? customers.find(c => c.id === sale.customerId) : null;
                const label = sale.tabName || customer?.name || `Sale #${sale.id.slice(-6).toUpperCase()}`;
                return (
                  <button
                    key={sale.id}
                    type="button"
                    onClick={() => resumeParkedSale(sale)}
                    className="min-w-[190px] rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/40 p-3 text-left shadow-sm active:scale-95 transition-all"
                  >
                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-300">
                      <PlayCircle className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-black truncate">{label}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-400">{sale.items.length} item{sale.items.length === 1 ? '' : 's'}</span>
                      <span className="text-xs font-black text-slate-900 dark:text-white">R{Number(sale.total || 0).toFixed(2)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {config?.business?.isRestaurantMode && activeWorkstations.length > 0 && !hasWorkstationPreference && (
          <div className="mx-4 lg:mx-6 mb-2 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-orange-600 dark:text-orange-400">Use this register as a workstation?</p>
              <p className="text-xs text-orange-700/70 dark:text-orange-300/70 mt-0.5">Choose a station to see and manage incoming tickets beside the register.</p>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => updateAttachedWorkstation('')}
                className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 text-xs font-black text-slate-500 dark:text-slate-300 border border-orange-100 dark:border-orange-900/40 whitespace-nowrap"
              >
                Not now
              </button>
              {activeWorkstations.map(w => (
                <button
                  key={w.id}
                  onClick={() => updateAttachedWorkstation(w.id)}
                  className="px-3 py-2 rounded-lg bg-orange-500 text-white text-xs font-black whitespace-nowrap shadow-sm"
                >
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 lg:p-6 pt-2 grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:gap-4 auto-rows-max lg:auto-rows-[160px] pb-24 lg:pb-6">
          <AnimatePresence>
            {filteredProducts.map(product => {
              const { stock, minStock, remainingAfterCart } = getStockInfo(product);
              const isOutOfStock = stock <= 0 || remainingAfterCart <= 0;
              const isLowStock = !isOutOfStock && (stock <= minStock || remainingAfterCart <= minStock);
              return (
              <motion.div
                key={product.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                whileTap={{ scale: isOutOfStock ? 1 : 0.98 }}
                onClick={() => handleAddToCart(product)}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 flex lg:flex-col justify-between items-center lg:items-start transition-all relative group shadow-sm gap-4 lg:gap-0 ${
                  isOutOfStock
                    ? 'border-rose-200 dark:border-rose-900/50 opacity-70 cursor-not-allowed'
                    : isLowStock
                      ? 'border-amber-200 dark:border-amber-900/50 cursor-pointer hover:bg-amber-50/60 dark:hover:bg-amber-900/10 active:border-amber-400'
                      : 'border-slate-200 dark:border-slate-700/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 active:border-primary'
                }`}
              >
                <div className="w-12 h-12 lg:w-10 lg:h-10 bg-slate-50 dark:bg-[#0B1120] rounded-xl flex items-center justify-center text-xl lg:text-lg group-hover:scale-110 transition-transform shrink-0 overflow-hidden">
                  <img src={getProductImage(product)} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm leading-tight mb-0.5 text-slate-900 dark:text-white truncate">{product.name}</div>
                  <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{product.category}</div>
                  {product.modifiers && product.modifiers.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="text-[8px] font-black text-primary uppercase">Customizable</span>
                    </div>
                  )}
                  <div className="lg:hidden flex items-baseline gap-2 mt-1">
                     <span className="font-extrabold text-primary">R{Number(product.price).toFixed(2)}</span>
                     <span className={`text-[8px] font-black ${isOutOfStock ? 'text-rose-500' : isLowStock ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}>
                      {isOutOfStock ? 'Out' : `${remainingAfterCart} left`}
                     </span>
                  </div>
                </div>
                <div className="hidden lg:flex items-end justify-between w-full mt-2">
                  <div className="font-extrabold text-lg text-primary tracking-tight">R{Number(product.price).toFixed(2)}</div>
                  <div className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${isOutOfStock ? 'bg-rose-50 text-rose-600' : isLowStock ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                    {isOutOfStock ? 'Out' : `${remainingAfterCart} left`}
                  </div>
                </div>
                <div className="absolute top-2 right-2 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1.5">
                  <div className={`p-1.5 rounded-lg transition-all shadow-sm ${isOutOfStock ? 'bg-rose-50 text-rose-400' : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'}`} onClick={(e) => { e.stopPropagation(); handleAddToCart(product); }}>
                    {isOutOfStock ? <AlertTriangle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </div>
                </div>
              </motion.div>
            );
            })}
          </AnimatePresence>
        </div>
      </section>

      {attachedWorkstation && (
        <aside className="hidden 2xl:flex w-[340px] border-l border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-[#0B1120] shrink-0 min-h-0">
          <WorkstationQueuePanel
            sales={sales}
            workstations={workstations}
            customers={customers}
            activeWorkstationId={attachedWorkstationId}
            currentUserStaff={currentUserStaff}
            onSalesUpdated={onSalesUpdated}
            compact
          />
        </aside>
      )}

      <AnimatePresence>
        {(isCartOpen || window.innerWidth >= 1024) && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[45]"
            />
            <motion.aside 
              initial={window.innerWidth < 1024 ? { y: '100%' } : { x: '100%' }}
              animate={window.innerWidth < 1024 ? { y: 0 } : { x: 0 }}
              exit={window.innerWidth < 1024 ? { y: '100%' } : { x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed bottom-0 left-0 right-0 lg:relative lg:inset-auto z-50 lg:z-10 w-full lg:w-[360px] max-h-[90vh] lg:max-h-none bg-white dark:bg-slate-900 lg:border-l border-slate-200 dark:border-slate-700/60 flex flex-col flex-shrink-0 shadow-2xl rounded-t-3xl lg:rounded-none overflow-hidden`}
            >
              {attachedWorkstation && !isWideRegister && (
                <div className="grid grid-cols-2 gap-1 p-2 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shrink-0">
                  <button
                    onClick={() => setSidePanelMode('cart')}
                    className={`h-10 rounded-lg text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${sidePanelMode === 'cart' ? 'bg-white dark:bg-slate-900 text-primary shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Cart
                  </button>
                  <button
                    onClick={() => setSidePanelMode('queue')}
                    className={`relative h-10 rounded-lg text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${sidePanelMode === 'queue' ? 'bg-white dark:bg-slate-900 text-orange-500 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    <ChefHat className="w-4 h-4" />
                    Queue
                    {attachedQueueCount > 0 && (
                      <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                        {attachedQueueCount > 99 ? '99+' : attachedQueueCount}
                      </span>
                    )}
                  </button>
                </div>
              )}

              {(!attachedWorkstation || sidePanelMode === 'cart' || isWideRegister) ? (
                <>
              <div className="p-5 border-b border-slate-200 dark:border-slate-700/60 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 z-10">
                <div>
                  <h2 className="font-extrabold text-lg flex items-center gap-2 text-slate-900 dark:text-white">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                    Current Order
                  </h2>
                  {activeOrderId && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Order Sent · #{activeOrderId.slice(-6).toUpperCase()}</span>
                    </div>
                  )}
                  {selectedCustomerId && (
                    <div className="flex flex-col gap-1 mt-1">
                      <div className="flex items-center gap-1 text-[10px] font-black text-primary uppercase tracking-widest">
                        <Users className="w-3 h-3" />
                        {customers.find(c => c.id === selectedCustomerId)?.name}
                      </div>
                      <div className="text-[9px] font-bold text-slate-500">
                        {customers.find(c => c.id === selectedCustomerId)?.points || 0} Points Available
                      </div>
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => setIsCartOpen(false)}
                  className="lg:hidden p-2 bg-slate-50 dark:bg-[#0B1120] rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/50">
              <div className="px-5 py-4 space-y-4 min-h-[160px]">
                {cart.length === 0 ? (
                  <div className="min-h-[160px] flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 opacity-50 space-y-2 text-center p-8 grayscale">
                    <ShoppingBag className="w-12 h-12" />
                    <p className="text-xs font-black uppercase tracking-widest">Cart is empty</p>
                  </div>
                ) : (
                  cart.map((item, idx) => {
                    const cartId = (item as any).cartItemId || item.id;
                    const modifiers = (item as any).selectedModifiers || [];
                    const product = products.find(p => p.id === ((item as any).productId || item.id));
                    const stock = Number(product?.stock ?? item.stock ?? 0);
                    const isOverAvailableStock = stock > 0 && Number(item.quantity || 0) >= stock;
                    const isCartItemOutOfStock = stock <= 0 || Number(item.quantity || 0) > stock;
                    return (
                      <div key={cartId} className={`bg-white dark:bg-slate-900 p-4 rounded-2xl flex items-center justify-between border shadow-sm transition-all ${isCartItemOutOfStock ? 'border-rose-200 dark:border-rose-900/50' : 'border-slate-100 dark:border-slate-800/60 hover:border-primary/20'}`}>
                        <div className="flex-1 pr-4 min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{item.name}</p>
                          {modifiers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {modifiers.map((m: any) => (
                                <span key={m.optionId} className="text-[8px] font-bold bg-slate-50 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-md">
                                  + {m.name}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-xs font-black text-primary mt-1">R{(Number(item.price) * Number(item.quantity)).toFixed(2)}</p>
                          {isCartItemOutOfStock ? (
                            <p className="mt-1 text-[10px] font-black text-rose-600 uppercase tracking-widest">Stock issue: {stock <= 0 ? 'out of stock' : `${stock} available`}</p>
                          ) : isOverAvailableStock ? (
                            <p className="mt-1 text-[10px] font-black text-amber-600 uppercase tracking-widest">No more available</p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-4 bg-slate-50 dark:bg-[#0B1120] rounded-xl p-1 shrink-0">
                          <button onClick={() => updateQuantity(cartId, -1)} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-lg text-xs font-black shadow-sm active:scale-90">-</button>
                          <span className="font-black text-xs w-4 text-center">{item.quantity}</span>
                          <button
                            disabled={isOverAvailableStock || stock <= 0}
                            onClick={() => {
                              if (product && canAddProductToCart(product)) updateQuantity(cartId, 1);
                            }}
                            className="w-8 h-8 flex items-center justify-center bg-primary text-white rounded-lg text-xs font-black shadow-sm active:scale-90 disabled:opacity-40 disabled:active:scale-100"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {hasBlockingStockIssues && (
                <div className="mx-5 mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/10 dark:text-rose-300">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest">Fix stock before checkout</p>
                      <p className="mt-1 text-xs font-semibold">{blockingStockIssues[0]}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-5 lg:p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/60 shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
                {config?.business?.isRestaurantMode && activeTableNumber && (
                  <div className="flex justify-between items-center mb-4 p-3 bg-primary/10 rounded-xl border border-primary/20">
                    <span className="font-bold text-primary flex items-center gap-2"><Utensils className="w-4 h-4"/> Table {activeTableNumber}</span>
                    <button onClick={() => { setActiveTableNumber(null); setActiveOrderId(null); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">Clear</button>
                  </div>
                )}
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <span className="font-bold text-slate-400 dark:text-slate-500 text-xs uppercase tracking-widest block">Grand Total</span>
                    {selectedCustomerId && (() => {
                      const customer = customers.find(c => c.id === selectedCustomerId);
                      const pts = customer?.loyaltyPoints || customer?.points || 0;
                      const canRedeem = config?.business?.enableLoyalty &&
                        config?.business?.pointsRequiredForDiscount &&
                        pts >= config.business.pointsRequiredForDiscount;
                      return pts > 0 ? (
                        <div className="flex items-center gap-2 mt-1">
                          {pointsDiscount > 0 ? (
                            <button
                              onClick={onClearPointsDiscount}
                              className="text-[9px] font-bold text-red-500 hover:underline"
                            >
                              Remove discount (−R{Number(pointsDiscount).toFixed(2)})
                            </button>
                          ) : canRedeem ? (
                            <button
                              onClick={() => onRedeemPoints(selectedCustomerId, pts)}
                              className="text-[9px] font-bold text-primary hover:underline"
                            >
                              Redeem {pts} pts → −R{Math.min(
                                Math.floor(pts / config!.business!.pointsRequiredForDiscount!) * config!.business!.discountAmountForPoints!,
                                cartTotal
                              ).toFixed(2)}
                            </button>
                          ) : (
                            <span className="text-[9px] font-bold text-slate-400">{pts} pts (need {config?.business?.pointsRequiredForDiscount} to redeem)</span>
                          )}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div className="text-right">
                    {pointsDiscount > 0 && (
                      <div className="text-xs font-bold text-slate-400 line-through">R{Number(cartTotal).toFixed(2)}</div>
                    )}
                    <span className="font-black text-4xl text-slate-900 dark:text-white tracking-tighter">R{Number(amountDue).toFixed(2)}</span>
                    {pointsDiscount > 0 && (
                      <div className="text-[10px] font-bold text-emerald-500">-R{Number(pointsDiscount).toFixed(2)} discount applied</div>
                    )}
                  </div>
                </div>

                <button
                  disabled={isProcessing || cart.length === 0 || hasBlockingStockIssues}
                  onClick={printBill}
                  className="w-full mb-4 h-14 rounded-2xl bg-slate-50 dark:bg-[#0B1120] text-slate-700 dark:text-slate-200 font-black transition-all hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 active:scale-95 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center gap-3 text-xs uppercase tracking-widest"
                >
                  <Printer className="w-4 h-4" />
                  Print Bill
                </button>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <button 
                    disabled={isProcessing || cart.length === 0 || hasBlockingStockIssues}
                    onClick={() => { setTenderModal({ isOpen: true, method: 'cash' }); setTenderedAmount(''); }}
                    className="flex flex-col items-center justify-center gap-2 h-20 rounded-2xl bg-emerald-600 text-white font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 shadow-lg shadow-emerald-600/30"
                  >
                    <Banknote className="w-5 h-5" />
                    <span className="text-[9px] uppercase tracking-widest">CASH</span>
                  </button>
                  <button 
                    disabled={isProcessing || cart.length === 0 || hasBlockingStockIssues}
                    onClick={() => { setTenderModal({ isOpen: true, method: 'card' }); setTenderedAmount(''); }}
                    className="flex flex-col items-center justify-center gap-2 h-20 rounded-2xl bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 shadow-lg shadow-slate-800/30"
                  >
                    <CreditCard className="w-5 h-5" />
                    <span className="text-[9px] uppercase tracking-widest">CARD</span>
                  </button>
                  <button 
                    disabled={isProcessing || cart.length === 0 || hasBlockingStockIssues}
                    onClick={() => handleCheckout('payfast')}
                    className="flex flex-col items-center justify-center gap-2 h-20 rounded-2xl bg-[#E84E1B] text-white font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 shadow-lg shadow-payfast/20"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                    <span className="text-[9px] uppercase tracking-widest">PAYFAST</span>
                  </button>
                </div>

                <button
                  disabled={isProcessing || cart.length === 0 || hasBlockingStockIssues}
                  onClick={() => setSplitPaymentModal(true)}
                  className="w-full mb-4 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-black transition-all hover:shadow-lg disabled:opacity-40 active:scale-95 border border-indigo-200 dark:border-indigo-800/50 flex items-center justify-center gap-3 text-xs uppercase tracking-widest"
                >
                  <Rows className="w-4 h-4" />
                  Split Payment
                </button>

                {/* Wallet payment: only shown for selected clients with wallet funds. */}
                {canPayWithCustomerWallet && (
                  <button
                    disabled={isProcessing || cart.length === 0 || hasBlockingStockIssues || selectedCustomerWalletBalance < amountDue}
                    onClick={handleWalletCheckout}
                    className="w-full mb-4 h-14 rounded-2xl bg-violet-600 text-white font-black transition-all hover:shadow-lg disabled:opacity-40 active:scale-95 shadow-lg shadow-violet-600/30 flex items-center justify-center gap-3 text-xs uppercase tracking-widest"
                  >
                    <Wallet className="w-4 h-4" />
                    Pay with Wallet
                    <span className="ml-auto bg-white/20 px-2 py-0.5 rounded-lg text-[10px]">
                      R{selectedCustomerWalletBalance.toFixed(2)} available
                    </span>
                  </button>
                )}

                {config?.business?.isRestaurantMode && (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button 
                      disabled={isProcessing || cart.length === 0 || hasBlockingStockIssues}
                      onClick={() => handleSaveOrder(false)}
                      className="h-14 rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 text-xs uppercase tracking-widest flex items-center justify-center gap-2 border border-orange-200 dark:border-orange-800/50"
                    >
                      <span className="truncate">Hold</span>
                    </button>
                    <button 
                      disabled={isProcessing || cart.length === 0 || hasBlockingStockIssues}
                      onClick={() => handleSaveOrder(true)}
                      className="h-14 rounded-2xl bg-orange-500 text-white font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 shadow-lg shadow-orange-500/30 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <ChefHat className="w-4 h-4 shrink-0" />}
                      <span className="truncate">Send Order</span>
                    </button>
                  </div>
                )}

                {/* Bar Tab — only when a customer is selected */}
                {config?.business?.isRestaurantMode && selectedCustomerId && (
                  <button
                    disabled={isProcessing || cart.length === 0 || hasBlockingStockIssues}
                    onClick={() => handleOpenTab(customers.find(c => c.id === selectedCustomerId)?.name)}
                    className="w-full mb-4 h-14 rounded-2xl bg-indigo-600 text-white font-black transition-all hover:shadow-lg disabled:opacity-40 active:scale-95 shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-3 text-xs uppercase tracking-widest"
                  >
                    <TabletSmartphone className="w-4 h-4" />
                    {activeOrderId ? 'Update Tab' : 'Open Tab'}
                    <span className="ml-auto bg-white/20 px-2 py-0.5 rounded-lg text-[10px]">
                      {customers.find(c => c.id === selectedCustomerId)?.name}
                    </span>
                  </button>
                )}

                {config?.business?.isRestaurantMode && (
                  <button
                    disabled={isProcessing || cart.length === 0 || hasBlockingStockIssues}
                    onClick={() => {
                      const defaultTable = activeTableNumber || selectedTableForOrder || activeRestaurantTables[0]?.id || '';
                      setSelectedTableForOrder(defaultTable);
                      setTablePickerOpen(true);
                    }}
                    className="w-full mb-4 h-14 rounded-2xl bg-primary text-white font-black transition-all hover:shadow-lg disabled:opacity-40 active:scale-95 shadow-lg shadow-primary/30 flex items-center justify-center gap-3 text-xs uppercase tracking-widest"
                  >
                    <Utensils className="w-4 h-4" />
                    {activeTableNumber ? 'Update Table' : 'Open Table'}
                    {selectedTableLabel && (
                      <span className="ml-auto bg-white/20 px-2 py-0.5 rounded-lg text-[10px] truncate max-w-28">
                        {selectedTableLabel}
                      </span>
                    )}
                  </button>
                )}
                
                <div className="flex gap-2">
                  <button onClick={() => clearCart()} title="Clear Cart" className="h-14 w-14 bg-slate-50 dark:bg-[#0B1120] text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-50 transition-all border border-slate-100 dark:border-slate-800/60 active:scale-95 shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button title="Add Note" className="flex-1 h-14 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center hover:bg-slate-100 dark:bg-slate-800 transition-all border border-slate-100 dark:border-slate-800/60 active:scale-95 gap-2">
                    <StickyNote className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Note</span>
                  </button>
                  <button
                    onClick={openParkModal}
                    disabled={isProcessing || cart.length === 0 || hasBlockingStockIssues}
                    title="Park this sale"
                    className="flex-1 h-14 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 rounded-2xl flex items-center justify-center hover:bg-indigo-100 transition-all border border-indigo-100 dark:border-indigo-900/40 active:scale-95 gap-2 disabled:opacity-40"
                  >
                    <PauseCircle className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Park</span>
                  </button>
                  <button onClick={openDrawerModal} title="Open drawer with reason" className="flex-1 h-14 bg-slate-50 dark:bg-[#0B1120] text-emerald-500 rounded-2xl flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-100 transition-all border border-slate-100 dark:border-slate-800/60 active:scale-95 gap-2">
                    <Banknote className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Drawer</span>
                  </button>
                </div>
              </div>
              </div>
                </>
              ) : (
                <WorkstationQueuePanel
                  sales={sales}
                  workstations={workstations}
                  customers={customers}
                  activeWorkstationId={attachedWorkstationId}
                  currentUserStaff={currentUserStaff}
                  onSalesUpdated={onSalesUpdated}
                  compact
                />
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isScanning && (
          <BarcodeScanner
            title="Price Check"
            subtitle="Scan without adding"
            instructions="Scan a barcode to show the product, price, and stock. Nothing is added to the cart until you choose Add item."
            onScan={handleBarcodeLookup}
            onClose={() => setIsScanning(false)}
          />
        )}

        {(priceCheckProduct || priceCheckError) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => {
              setPriceCheckProduct(null);
              setPriceCheckError('');
            }}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                    <ScanLine className="w-4 h-4" />
                    Price check
                  </div>
                  <h3 className="mt-1 font-black text-lg text-slate-900 dark:text-white">
                    {priceCheckProduct ? priceCheckProduct.name : 'Barcode not found'}
                  </h3>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    {priceCheckProduct ? 'Review the item before adding it to the sale.' : priceCheckError}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPriceCheckProduct(null);
                    setPriceCheckError('');
                  }}
                  className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
                  aria-label="Close price check"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {priceCheckProduct ? (() => {
                const { stock, minStock, remainingAfterCart } = getStockInfo(priceCheckProduct);
                const isOut = stock <= 0 || remainingAfterCart <= 0;
                const isLow = !isOut && (stock <= minStock || remainingAfterCart <= minStock);
                return (
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-950 shrink-0 border border-slate-100 dark:border-slate-800">
                        <img src={getProductImage(priceCheckProduct)} alt={priceCheckProduct.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{priceCheckProduct.category}</p>
                        <p className="mt-1 text-3xl font-black text-primary">R{Number(priceCheckProduct.price || 0).toFixed(2)}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500 truncate">{priceCheckProduct.barcode || 'No barcode saved'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Stock</p>
                        <p className={`mt-1 text-lg font-black ${isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>{stock}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">In cart</p>
                        <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{getCartQuantityForProduct(priceCheckProduct.id)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">After add</p>
                        <p className={`mt-1 text-lg font-black ${isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>{Math.max(0, remainingAfterCart - 1)}</p>
                      </div>
                    </div>

                    <div className={`rounded-2xl border p-3 text-xs font-bold ${
                      isOut
                        ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/10 dark:border-rose-900/40 dark:text-rose-300'
                        : isLow
                          ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/10 dark:border-amber-900/40 dark:text-amber-300'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/10 dark:border-emerald-900/40 dark:text-emerald-300'
                    }`}>
                      {isOut ? 'This item cannot be added because available stock is already used.' : isLow ? 'This item can be sold, but stock is running low.' : 'This item is available to sell.'}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setPriceCheckProduct(null);
                          setPriceCheckError('');
                          setIsScanning(true);
                        }}
                        className="h-12 flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-black text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2"
                      >
                        <ScanLine className="w-4 h-4" />
                        Scan another
                      </button>
                      <button
                        type="button"
                        disabled={isOut}
                        onClick={() => {
                          if (!canAddProductToCart(priceCheckProduct)) return;
                          setPriceCheckProduct(null);
                          handleAddToCart(priceCheckProduct);
                        }}
                        className="h-12 flex-1 rounded-2xl bg-primary text-sm font-black text-white shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add item
                      </button>
                    </div>
                  </div>
                );
              })() : (
                <div className="p-5 space-y-4">
                  <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm font-bold text-amber-700 dark:bg-amber-900/10 dark:border-amber-900/40 dark:text-amber-300">
                    {priceCheckError}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPriceCheckError('');
                      setIsScanning(true);
                    }}
                    className="w-full h-12 rounded-2xl bg-primary text-sm font-black text-white shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                  >
                    <ScanLine className="w-4 h-4" />
                    Scan again
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}

        {parkModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setParkModalOpen(false)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                    <PauseCircle className="w-4 h-4" />
                    Park sale
                  </div>
                  <h3 className="mt-1 font-black text-lg text-slate-900 dark:text-white">Save this cart for later?</h3>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">The register clears immediately so you can help the next customer.</p>
                </div>
                <button
                  onClick={() => setParkModalOpen(false)}
                  className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
                  aria-label="Close park sale"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {parkError && (
                  <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-sm font-bold text-rose-700">
                    {parkError}
                  </div>
                )}

                <div className="rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cart total</span>
                    <span className="text-xl font-black text-slate-900 dark:text-white">R{amountDue.toFixed(2)}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{cart.length} item{cart.length === 1 ? '' : 's'} will be parked.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Label</label>
                  <input
                    value={parkLabel}
                    onChange={(e) => setParkLabel(e.target.value)}
                    placeholder="e.g. Blue jacket customer"
                    className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setParkModalOpen(false)}
                    className="h-12 flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-black text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={confirmParkSale}
                    className="h-12 flex-1 rounded-2xl bg-indigo-600 text-sm font-black text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <PauseCircle className="w-5 h-5" />}
                    Park sale
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {drawerModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setDrawerModalOpen(false)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    <Banknote className="w-4 h-4" />
                    No sale drawer open
                  </div>
                  <h3 className="mt-1 font-black text-lg text-slate-900 dark:text-white">Why are you opening the drawer?</h3>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">This records a zero-value drawer event for cash-up review.</p>
                </div>
                <button
                  onClick={() => setDrawerModalOpen(false)}
                  className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
                  aria-label="Close drawer reason"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {drawerError && (
                  <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-sm font-bold text-rose-700">
                    {drawerError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {drawerReasons.map(reason => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setDrawerReason(reason)}
                      className={`min-h-12 rounded-2xl border px-3 text-xs font-black uppercase tracking-widest transition-all ${
                        drawerReason === reason
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-950'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>

                {drawerReason === 'Other' && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Custom reason</label>
                    <input
                      value={drawerCustomReason}
                      onChange={(e) => setDrawerCustomReason(e.target.value)}
                      placeholder="e.g. Printer test, float check"
                      className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setDrawerModalOpen(false)}
                    className="h-12 flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-black text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isRecordingDrawerOpen}
                    onClick={confirmNoSaleDrawerOpen}
                    className="h-12 flex-1 rounded-2xl bg-emerald-600 text-sm font-black text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isRecordingDrawerOpen ? <Loader2 className="w-5 h-5 animate-spin" /> : <Banknote className="w-5 h-5" />}
                    Record open
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {tablePickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setTablePickerOpen(false)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-lg text-slate-900 dark:text-white">Choose Table</h3>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">Save this sale to a table order.</p>
                </div>
                <button
                  onClick={() => setTablePickerOpen(false)}
                  className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
                  aria-label="Close table picker"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Table</label>
                  <select
                    value={selectedTableForOrder}
                    onChange={(e) => setSelectedTableForOrder(e.target.value)}
                    className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {activeRestaurantTables.map(table => {
                      const activeSale = sales.find(s =>
                        s.tableNumber === table.id &&
                        (s.status === 'open' || s.status === 'kitchen') &&
                        s.id !== activeOrderId
                      );
                      return (
                        <option key={table.id} value={table.id}>
                          {table.label}{activeSale ? ' - occupied' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {activeRestaurantTables.length === 0 && (
                  <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs font-bold text-amber-700 dark:text-amber-300">
                    No active tables are configured.
                  </div>
                )}

                <button
                  disabled={isProcessing || cart.length === 0 || hasBlockingStockIssues || !selectedTableForOrder}
                  onClick={() => saveToTable(selectedTableForOrder)}
                  className="w-full h-14 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 active:scale-95 transition-all"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Utensils className="w-4 h-4" />}
                  {activeOrderId ? 'Transfer / Update Table' : 'Open Table'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {modifyingProduct && (
        <ModifierSelectionModal
          product={modifyingProduct}
          onClose={() => setModifyingProduct(null)}
          onConfirm={(selections) => {
            if (!canAddProductToCart(modifyingProduct)) return;
            addToCart(modifyingProduct, undefined, selections);
            setModifyingProduct(null);
            setIsCartOpen(true);
          }}
        />
      )}
    </div>
  );
};
