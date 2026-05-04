const fs = require('fs');

const appTsx = fs.readFileSync('src/App.tsx', 'utf8');

const posStart = appTsx.indexOf("{view === 'pos' ? (");
let posEnd = appTsx.indexOf(") : view === 'history' ? (");

// Extract the JSX
let posJsx = appTsx.substring(posStart + 19, posEnd).trim();

// Strip the opening and closing parens of the ternary branch
if (posJsx.startsWith('!activeSession')) {
  posJsx = '{' + posJsx + '}';
}

const outFile = `import React, { useMemo } from 'react';
import { ShoppingBag, Search, Plus, Minus, Trash2, CreditCard, Banknote, LayoutGrid, Settings, Package, CheckCircle2, X, ShoppingCart, Loader2, QrCode, Users, UserPlus, UserCog, Save, ShieldCheck, ChevronRight, ChevronDown, Edit, StickyNote, Maximize, AlertCircle, History as HistoryIcon, Moon, Sun, Lock, ChefHat, Trophy, BarChart3, Utensils } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePosStore } from '../store/usePosStore';
import { CustomerSelector } from './CustomerSelector';
import { BarcodeScanner } from './BarcodeScanner';
import { DEFAULT_CATEGORY_TREE } from '../App'; // If needed
import { useNavigate } from 'react-router-dom';

export function PointOfSaleView({
  user,
  currentUserStaff,
  activeSession,
  config,
  categoryTree,
  CATEGORY_MAP,
  SUB_CATEGORY_MAP,
  CATEGORIES,
  allowedCategories,
  filteredProducts,
  getCategoryIcon,
  getProductImage,
  handleCheckout,
  handleSaveOrder,
  checkoutModal,
  setCheckoutModal,
  customerModal,
  setCustomerModal,
  tenderModal,
  setTenderModal,
  tenderedAmount,
  setTenderedAmount,
  cardOverageAction,
  setCardOverageAction,
  isScanning,
  setIsScanning,
  handleBarcodeScan,
  isCartOpen,
  setIsCartOpen
}: any) {

  const navigate = useNavigate();
  const { 
    cart, 
    addToCart, 
    updateQuantity, 
    clearCart, 
    setCart,
    searchQuery, 
    setSearchQuery,
    selectedCustomerId,
    setSelectedCustomerId,
    activeTableNumber,
    setActiveTableNumber,
    activeOrderId,
    setActiveOrderId,
    isProcessing,
    activeCategory,
    setActiveCategory,
    products,
    customers,
  } = usePosStore();

  const cartTotal = useMemo(
    () => cart.reduce((total, item) => total + (item.price * item.quantity), 0),
    [cart]
  );

  return (
    <>
      ${posJsx}
    </>
  );
}
`;

fs.writeFileSync('src/components/PointOfSaleView.tsx', outFile);
