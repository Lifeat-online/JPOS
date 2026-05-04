/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { usePosStore } from './store/usePosStore';
import { PointOfSaleView } from './components/PointOfSaleView';
import { TransactionHistoryView } from './components/TransactionHistoryView';
import { InventoryView } from './components/InventoryView';
import { CustomersView } from './components/CustomersView';
import { StaffControlView } from './components/StaffControlView';
import { 
  ShoppingBag, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  Banknote, 
  LayoutGrid, 
  History, 
  Settings,
  Package,
  CheckCircle2,
  XCircle,
  X,
  ShoppingCart,
  Loader2,
  QrCode,
  ArrowRight,
  Users,
  UserPlus,
  UserCog,
  Mail,
  Phone,
  MapPin,
  Save,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Edit,
  StickyNote,
  Maximize,
  Camera,
  AlertCircle,
  History as HistoryIcon,
  Moon,
  Sun,
  Lock
, ChefHat, Trophy, BarChart3, Utensils } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BarcodeScanner } from './components/BarcodeScanner';
import { CustomerSelector } from './components/CustomerSelector';
import { SetupWizard } from './components/SetupWizard';
import { SettingsView } from './components/SettingsView';
import { TablesView } from './components/TablesView';
import { WorkstationView } from './components/WorkstationView';
import { LeaderboardView } from './components/LeaderboardView';
import { ReportsView } from './components/ReportsView';
import { WelcomeView } from './components/WelcomeView';
import { CashManagementView } from './components/CashManagementView';
import { VendorManagementView } from './components/VendorManagementView';
import { PurchaseOrdersView } from './components/PurchaseOrdersView';
import { StaffProfileView } from './components/StaffProfileView';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp,
  updateDoc,
  doc,
  setDoc,
  where,
  getDoc,
  increment,
  deleteDoc,
  collectionGroup,
  getDocs
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User 
} from 'firebase/auth';
import { db, auth } from './firebase';
import { getTenantCollection, getTenantDoc } from "./tenantHelper";
import { Product, CartItem, Sale, Customer, AppConfig, Staff } from './types';

export const DEFAULT_CATEGORY_TREE: Record<string, Record<string, string[]>> = {
  "Retail": {
    "Electronics": ["Mobile", "Audio", "Accessories", "Computing"],
    "Groceries": ["Dairy", "Bakery", "Produce", "Pantry"],
    "Clothing": [],
    "Home Decor": []
  },
  "Food & Beverage": {
    "Beverages": ["Hot Drinks", "Cold Drinks", "Alcoholic"],
    "Snacks": ["Sweets", "Savoury", "Healthy"],
    "Meals": [],
    "Ingredients": []
  },
  "Service": {
    "Consultation": [],
    "Repair": [],
    "Subscription": []
  }
};

const INITIAL_PRODUCTS: Partial<Product>[] = [
  { name: "Coffee", price: 25.00, category: "Beverages", section: "Food & Beverage", subCategory: "Hot Drinks", stock: 100, barcode: "123456" },
  { name: "Soda", price: 15.00, category: "Beverages", section: "Food & Beverage", subCategory: "Cold Drinks", stock: 80, barcode: "223344" },
  { name: "Chips", price: 12.50, category: "Snacks", section: "Food & Beverage", subCategory: "Savoury", stock: 120, barcode: "556677" },
  { name: "Chocolate", price: 18.00, category: "Snacks", section: "Food & Beverage", subCategory: "Sweets", stock: 50, barcode: "889900" },
  { name: "Headphones", price: 450.00, category: "Electronics", section: "Retail", subCategory: "Audio", stock: 10, barcode: "112233" },
  { name: "Milk", price: 22.00, category: "Groceries", section: "Retail", subCategory: "Dairy", stock: 40, barcode: "445566" },
  { name: "Bread", price: 16.00, category: "Groceries", section: "Retail", subCategory: "Bakery", stock: 35, barcode: "778899" },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const { tenantId, setTenantId } = usePosStore();
  const [tenantLoading, setTenantLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [isStaffLoading, setIsStaffLoading] = useState(true);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // ... existing states
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();
  const clearCart = usePosStore(state => state.clearCart);
  const location = useLocation();
  const view = location.pathname.substring(1) || 'pos';
  const [inventoryTab, setInventoryTab] = useState<'products' | 'vendors' | 'purchaseOrders'>('products');
  const [sales, setSales] = useState<Sale[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [activeTableNumber, setActiveTableNumber] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [filterCustomerId, setFilterCustomerId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [tenderModal, setTenderModal] = useState<{ isOpen: boolean, method: 'cash' | 'card' | null }>({ isOpen: false, method: null });
  const [tenderedAmount, setTenderedAmount] = useState<number | string>('');
  const [cardOverageAction, setCardOverageAction] = useState<'tip' | 'cashout'>('tip');
  const [config, setConfig] = useState<AppConfig>({
    payfastMerchantId: '10000100',
    payfastMerchantKey: '46f0cd694581a',
    payfastPassphrase: 'jt7v60h69n8a1',
    payfastSandbox: true
  });
  
  const categoryTree = config?.categories || DEFAULT_CATEGORY_TREE;
  const SECTIONS = Object.keys(categoryTree);
  const CATEGORY_MAP = SECTIONS.reduce((acc, sec) => {
    acc[sec] = Object.keys(categoryTree[sec]);
    return acc;
  }, {} as Record<string, string[]>);
  const SUB_CATEGORY_MAP = SECTIONS.reduce((acc, sec) => {
    Object.keys(categoryTree[sec]).forEach(cat => {
      acc[cat] = categoryTree[sec][cat] || [];
    });
    return acc;
  }, {} as Record<string, string[]>);
  const CATEGORIES = ["All", ...Object.values(CATEGORY_MAP).flat()];
  
  const [checkoutModal, setCheckoutModal] = useState<{ isOpen: boolean; paymentMethod: 'cash' | 'payfast' | null }>({
    isOpen: false,
    paymentMethod: null
  });

  const [customerModal, setCustomerModal] = useState<{ isOpen: boolean; customer: Partial<Customer> | null }>({
    isOpen: false,
    customer: null
  });

  const [productModal, setProductModal] = useState<{ isOpen: boolean; product: Partial<Product> | null }>({
    isOpen: false,
    product: null
  });

  const [staffModal, setStaffModal] = useState<{ isOpen: boolean; staff: Partial<Staff> | null }>({
    isOpen: false,
    staff: null
  });
  const [staffToDelete, setStaffToDelete] = useState<string | null>(null);

  const [inventorySearch, setInventorySearch] = useState("");
  const [inventorySection, setInventorySection] = useState("All");
  const [inventoryCategory, setInventoryCategory] = useState("All");
  const [inventorySubCategory, setInventorySubCategory] = useState("All");

  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'manager' | 'cashier' | null>(null);
  const [currentUserStaff, setCurrentUserStaff] = useState<Staff | null>(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true';
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [isDarkMode]);

  // Auth and Tenant Listener
  useEffect(() => {
    let tenantUnsub: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        setTenantLoading(true);
        tenantUnsub = onSnapshot(doc(db, "users", u.uid), async (docSnap) => {
          if (docSnap.exists() && docSnap.data().tenantId) {
            setTenantId(docSnap.data().tenantId);
            setTenantLoading(false);
          } else {
            try {
                const staffQuery = query(collectionGroup(db, "staff"), where("email", "==", u.email));
                const snap = await getDocs(staffQuery);
                if (!snap.empty) {
                   const staffDoc = snap.docs[0];
                   const foundTenantId = staffDoc.ref.parent.parent?.id;
                   if (foundTenantId) {
                       await setDoc(doc(db, "users", u.uid), {
                           tenantId: foundTenantId,
                           email: u.email,
                           name: u.displayName || u.email?.split('@')[0] || 'User',
                           createdAt: serverTimestamp()
                       }, { merge: true });
                       return;
                   }
                }
             } catch (err) {
                console.error("Failed to check invited staff:", err);
             }
            setTenantId(null);
            setTenantLoading(false);
          }
        });
        }
    });
    return () => {
      unsubscribe();
      if (tenantUnsub) tenantUnsub();
    };
  }, []);

  useEffect(() => {
    if (user && !isStaffLoading) {
      if (staff.length > 0) {
        const s = staff.find(s => s.email === user.email);
        if (s) {
          setCurrentUserRole(s.role);
          setCurrentUserStaff(s);
        } else {
          setCurrentUserRole(null);
          setCurrentUserStaff(null);
        }
      } else {
        // App is unconfigured, or setup is in progress. Default to null until setup completes.
        setCurrentUserRole(null);
        setCurrentUserStaff(null);
      }
    } else if (!user || !tenantId) {
      setCurrentUserRole(null);
      setCurrentUserStaff(null);
    }
  }, [user, staff, isStaffLoading]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Fetch Products (Requires Auth)
  useEffect(() => {
    if (!user || !tenantId) {
      setProducts([]);
      return;
    }
    const q = query(getTenantCollection(db, tenantId, "products"));
    const unsubscribe = onSnapshot(q, {
      next: (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Product));
        setProducts(items);
      },
      error: (err) => {
        console.error("Products subscription error:", err);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Seed initial data if admin is logged in and products are empty
  useEffect(() => {
    if (user && products.length === 0 && !isProcessing) {
      const seedData = async () => {
        setIsProcessing(true);
        try {
          for (const p of INITIAL_PRODUCTS) {
            await addDoc(getTenantCollection(db, tenantId, "products"), { ...p, createdAt: serverTimestamp() });
          }
        } catch (err) {
          console.error("Seeding failed:", err);
        } finally {
          setIsProcessing(false);
        }
      };
      seedData();
    }
  }, [user, products.length]);

  // Fetch Customers (Requires Auth)
  useEffect(() => {
    if (!user || !tenantId) {
      setCustomers([]);
      return;
    }
    const q = query(getTenantCollection(db, tenantId, "customers"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, {
      next: (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Customer));
        setCustomers(items);
      },
      error: (err) => console.error("Customers subscription error:", err)
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Staff (Requires Auth)
  useEffect(() => {
    if (!user || !tenantId) {
      setStaff([]);
      setIsStaffLoading(false);
      return;
    }
    setIsStaffLoading(true);
    const q = query(getTenantCollection(db, tenantId, "staff"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, {
      next: (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Staff));
        setStaff(items);
        setIsStaffLoading(false);
      },
      error: (err) => {
        console.error("Staff subscription error:", err);
        setIsStaffLoading(false);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Active Cash Session
  useEffect(() => {
    if (!currentUserStaff || !tenantId) {
      setActiveSession(null);
      return;
    }
    const q = query(
      getTenantCollection(db, tenantId, "cashSessions"),
      where("staffId", "==", currentUserStaff.id),
      where("status", "==", "open")
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setActiveSession(null);
      } else {
        setActiveSession({ id: snap.docs[0].id, ...(snap.docs[0].data() as any) });
      }
    });
    return () => unsubscribe();
  }, [currentUserStaff]);

  // Fetch Config (Requires Auth)
  useEffect(() => {
    if (!user || !tenantId) {
      setConfigLoading(false);
      return;
    }
    setConfigLoading(true);
    const unsubscribe = onSnapshot(getTenantDoc(db, tenantId, "settings", "app"), {
      next: (docSnap) => {
        if (docSnap.exists()) {
          setConfig(docSnap.data() as AppConfig);
        }
        setConfigLoading(false);
      },
      error: (err) => {
        console.error("Config subscription error:", err);
        setConfigLoading(false);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Recent Sales (Requires Auth)
  useEffect(() => {
    if (!user || !tenantId) {
      setSales([]);
      return;
    }
    const q = query(getTenantCollection(db, tenantId, "sales"), where("status", "in", ["completed", "pending"]), orderBy("createdAt", "desc"), limit(50));
    const unsubscribe = onSnapshot(q, {
      next: (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Sale));
        setSales(items);
      },
      error: (err) => {
        console.error("Sales subscription error:", err);
        // If query fails due to missing index, we might need to fallback or wait
      }
    });

    return () => unsubscribe();
  }, [user]);

  const cartSubtotal = useMemo(() => 
    cart.reduce((total, item) => total + (item.price * item.quantity), 0), 
  [cart]);

  const taxRate = config?.business?.taxRate || 0;
  const taxInclusive = config?.business?.taxInclusive !== false;
  
  const taxAmount = useMemo(() => {
    if (!taxRate) return 0;
    if (taxInclusive) {
      return cartSubtotal - (cartSubtotal / (1 + (taxRate / 100)));
    } else {
      return cartSubtotal * (taxRate / 100);
    }
  }, [cartSubtotal, taxRate, taxInclusive]);

  const cartTotal = taxInclusive ? cartSubtotal : cartSubtotal + taxAmount;

  const allowedCategories = useMemo(() => {
    if (!currentUserStaff || currentUserStaff.role !== 'cashier') return CATEGORIES;
    const hasSectionRestriction = currentUserStaff.assignedSections && currentUserStaff.assignedSections.length > 0;
    const hasCategoryRestriction = currentUserStaff.assignedCategories && currentUserStaff.assignedCategories.length > 0;
    
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

  // Sync activeCategory if it becomes disallowed
  useEffect(() => {
    if (!allowedCategories.includes(activeCategory)) {
      setActiveCategory("All");
    }
  }, [allowedCategories, activeCategory]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Check Staff Restrictions
      if (currentUserStaff && currentUserStaff.role === 'cashier') {
        const hasSectionRestriction = currentUserStaff.assignedSections && currentUserStaff.assignedSections.length > 0;
        const hasCategoryRestriction = currentUserStaff.assignedCategories && currentUserStaff.assignedCategories.length > 0;
        
        if (hasSectionRestriction || hasCategoryRestriction) {
          const sectionAllowed = hasSectionRestriction && currentUserStaff.assignedSections!.includes(p.section);
          const categoryAllowed = hasCategoryRestriction && currentUserStaff.assignedCategories!.includes(p.category);
          
          // Allow if explicitly allowed by category, OR allowed by section
          if (!sectionAllowed && !categoryAllowed) {
            return false;
          }
        }
      }

      const matchesCategory = activeCategory === "All" || p.category === activeCategory;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategory, searchQuery, currentUserStaff]);

  const filteredInventory = useMemo(() => {
    return products.filter(p => {
      const matchesSection = inventorySection === "All" || p.section === inventorySection;
      const matchesCategory = inventoryCategory === "All" || p.category === inventoryCategory;
      const matchesSubCategory = inventorySubCategory === "All" || p.subCategory === inventorySubCategory;
      const matchesSearch = p.name.toLowerCase().includes(inventorySearch.toLowerCase()) || 
                           (p.barcode && p.barcode.includes(inventorySearch));
      return matchesSection && matchesCategory && matchesSubCategory && matchesSearch;
    });
  }, [products, inventorySection, inventoryCategory, inventorySubCategory, inventorySearch]);

  const inventoryStats = useMemo(() => {
    const totalItems = products.reduce((sum, p) => sum + p.stock, 0);
    const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
    const lowStockItems = products.filter(p => p.stock <= (p.minStock || 10)).length;
    return { totalItems, totalValue, lowStockItems };
  }, [products]);

  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      // Cashiers can only see their own sales
      if (currentUserRole === 'cashier' && sale.staffId !== currentUserStaff?.id) {
        return false;
      }
      if (filterCustomerId) {
        return sale.customerId === filterCustomerId;
      }
      if (searchQuery && view === 'history') {
        const customerName = sale.customerId ? customers.find(c => c.id === sale.customerId)?.name || '' : 'Guest';
        return customerName.toLowerCase().includes(searchQuery.toLowerCase()) || 
               sale.id.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [sales, filterCustomerId, searchQuery, view, customers, currentUserRole, currentUserStaff]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const handleBarcodeScan = (barcode: string) => {
    const product = products.find(p => p.barcode === barcode);
    if (product) {
      addToCart(product);
      setIsScanning(false);
      // Optional: Add a sound or haptic feedback here if desired
    } else {
      // Maybe show a toast that product wasn't found
      console.warn("Product not found for barcode:", barcode);
    }
  };

    const handleSaveOrder = async (sendToKitchen: boolean) => {
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
        await updateDoc(getTenantDoc(db, tenantId, "sales", activeOrderId), saleData);
      } else {
        saleData.createdAt = serverTimestamp();
        await addDoc(getTenantCollection(db, tenantId, "sales"), saleData);
      }
      setCart([]);
      setSelectedCustomerId(null);
      setActiveOrderId(null);
      setActiveTableNumber(null);
      navigate('/tables'); // send them back to tables view
    } catch (error) {
      console.error(error);
      alert('Error saving order');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const handleCheckout = async (method: 'cash' | 'payfast' | 'card') => {
    if (cart.length === 0) return;
    setIsProcessing(true);

    try {
      let saleData: any = {
        items: cart,
        total: cartTotal,
        subtotal: cartSubtotal,
        taxAmount: taxAmount,
        taxRate: taxRate,
        taxInclusive: taxInclusive,
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
      }

      if (method === 'cash' || method === 'card') {
         saleData.tenderedAmount = Number(tenderedAmount || 0);
         const overage = Math.max(0, Number(tenderedAmount || 0) - cartTotal);
         if (method === 'cash') {
            saleData.changeAmount = overage;
         } else {
            if (cardOverageAction === 'tip') {
               saleData.tipAmount = overage;
            } else {
               saleData.cashOutAmount = overage;
            }
         }
      }

            let saleId = "";
      if (activeOrderId) {
        await updateDoc(getTenantDoc(db, tenantId, "sales", activeOrderId), saleData);
        saleId = activeOrderId;
      } else {
        const saleRef = await addDoc(getTenantCollection(db, tenantId, "sales"), saleData);
        saleId = saleRef.id;
      }

      // Add loyalty points to customer
      if (selectedCustomerId && (method === 'cash' || method === 'card') && config?.business?.enableLoyalty && config?.business?.pointsEarnedPerCurrency) {
        const pointsEarned = Math.floor(cartTotal / config.business.pointsEarnedPerCurrency);
        if (pointsEarned > 0) {
          await updateDoc(getTenantDoc(db, tenantId, "customers", selectedCustomerId), {
            loyaltyPoints: increment(pointsEarned)
          });
        }
      }

      if (method === 'cash' || method === 'card') {
        if (activeSession) {
           let expectedCashChange = 0;
           let tipChange = 0;

           if (method === 'cash') {
              expectedCashChange = cartTotal;
           } else if (method === 'card') {
              if (cardOverageAction === 'cashout') {
                 expectedCashChange = -(saleData.cashOutAmount || 0);
              } else if (cardOverageAction === 'tip') {
                 tipChange = saleData.tipAmount || 0;
              }
           }

           const updates: any = {};
           if (expectedCashChange !== 0) updates.expectedCash = increment(expectedCashChange);
           if (tipChange > 0) updates.accumulatedTips = increment(tipChange);

           if (Object.keys(updates).length > 0) {
              await updateDoc(getTenantDoc(db, tenantId, "cashSessions", activeSession.id), updates);
           }
        }
        setCart([]);
        setSelectedCustomerId(null);
        setActiveOrderId(null);
        setActiveTableNumber(null);
        setTenderModal({ isOpen: false, method: null });
        setCheckoutModal({ isOpen: true, paymentMethod: method });
        setIsProcessing(false);
        setTimeout(() => setCheckoutModal({ isOpen: false, paymentMethod: null }), 3000);
      } else {
        const response = await fetch('/api/payfast/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: cartTotal,
            item_name: `POS Purchase - ${saleId}`,
            sale_id: saleId,
            return_url: window.location.href + '?payment=success',
            cancel_url: window.location.href + '?payment=cancel'
          })
        });

        const { url, fields } = await response.json();
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        Object.keys(fields).forEach(key => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = fields[key];
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
      }
    } catch (err) {
      console.error("Checkout failed:", err);
      setIsProcessing(false);
    }
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      await setDoc(getTenantDoc(db, tenantId, "config", "primary"), config);
      alert("Configuration saved successfully!");
    } catch (err) {
      console.error("Failed to save config:", err);
    }
    setIsProcessing(false);
  };

  const saveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerModal.customer) return;
    setIsProcessing(true);
    try {
      const { id, ...data } = customerModal.customer;
      if (id) {
        await updateDoc(getTenantDoc(db, tenantId, "customers", id), data);
      } else {
        await addDoc(getTenantCollection(db, tenantId, "customers"), { ...data, createdAt: serverTimestamp() });
      }
      setCustomerModal({ isOpen: false, customer: null });
    } catch (err) {
      console.error("Failed to save customer:", err);
    }
    setIsProcessing(false);
  };

  const saveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffModal.staff) return;
    setIsProcessing(true);
    try {
      const { id, ...data } = staffModal.staff;
      if (id) {
        await updateDoc(getTenantDoc(db, tenantId, "staff", id), { ...data, updatedAt: serverTimestamp() });
      } else {
        const existing = staff.find(s => s.email.toLowerCase() === data.email?.toLowerCase());
        if (existing) {
           alert("A staff member with this email already exists!");
           setIsProcessing(false);
           return;
        }
        await addDoc(getTenantCollection(db, tenantId, "staff"), { ...data, status: 'active', createdAt: serverTimestamp() });
      }
      setStaffModal({ isOpen: false, staff: null });
    } catch (err) {
      console.error("Failed to save staff:", err);
    }
    setIsProcessing(false);
  };

  const deleteStaff = async (id: string) => {
    setIsProcessing(true);
    try {
      await deleteDoc(getTenantDoc(db, tenantId, "staff", id));
      setStaffToDelete(null);
    } catch (err) {
      console.error("Failed to delete staff:", err);
      // alert("Failed to delete staff. Make sure you have permission.");
    }
    setIsProcessing(false);
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productModal.product) return;
    setIsProcessing(true);
    try {
      const { id, ...data } = productModal.product;
      const cleanData = {
        ...data,
        price: Number(data.price) || 0,
        costPrice: Number(data.costPrice) || 0,
        stock: Number(data.stock) || 0,
        minStock: Number(data.minStock) || 10,
        updatedAt: serverTimestamp()
      };

      if (id) {
        await updateDoc(getTenantDoc(db, tenantId, "products", id), cleanData);
      } else {
        await addDoc(getTenantCollection(db, tenantId, "products"), { ...cleanData, createdAt: serverTimestamp() });
      }
      setProductModal({ isOpen: false, product: null });
    } catch (err) {
      console.error("Failed to save product:", err);
    }
    setIsProcessing(false);
  };

  const getCategoryIcon = (cat: string) => {
    switch(cat) {
      case 'Beverages': return '☕';
      case 'Snacks': return '🥨';
      case 'Electronics': return '🎁';
      case 'Groceries': return '🥪';
      default: return '📦';
    }
  };

  const getProductImage = (product: Partial<Product>) => {
    if (product.imageUrl) return product.imageUrl;
    const bgColor = "1e293b"; // Slate 800
    const textColor = "f8fafc"; // Slate 50
    return `https://placehold.co/600x600/${bgColor}/${textColor}?text=${encodeURIComponent(product.name || 'Product')}%0A${encodeURIComponent(product.category || 'Category')}`;
  };

  const getNavItems = () => {
    const items: any[] = [
      { id: 'pos', icon: LayoutGrid, label: 'Terminal' }
    ];
    if (config.business?.isRestaurantMode) {
      items.push({ id: 'tables', icon: Utensils, label: 'Tables' });
      items.push({ id: 'workstation', icon: ChefHat, label: 'Stations' });
    }
    items.push(
      { id: 'history', icon: HistoryIcon, label: 'History' },
      { id: 'cash', icon: Banknote, label: 'Cash Mgmt' },
      { id: 'profile', icon: UserCog, label: 'My Wallet' }
    );
    if (currentUserRole === 'admin' || currentUserRole === 'manager') {
       items.push({ id: 'inventory', icon: Package, label: 'Inventory' });
       items.push({ id: 'customers', icon: Users, label: 'Customers' });
       items.push({ id: 'reports', icon: BarChart3, label: 'Reports' });
       items.push({ id: 'leaderboard', icon: Trophy, label: 'Leaderboard' });
    }
    if (currentUserRole === 'admin') {
       items.push({ id: 'staff', icon: Users, label: 'Staff' });
       items.push({ id: 'settings', icon: Settings, label: 'Settings' });
    }
    return items;
  };

  useEffect(() => {
    const items = getNavItems();
    if (!items.find(i => i.id === view)) {
      navigate('/');
    }
  }, [currentUserRole, view]);

  if (authLoading || (user && (configLoading || isStaffLoading))) {
    return (
      <div className="h-screen w-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !tenantId) {
    return <WelcomeView onLogin={login} isDarkMode={isDarkMode} toggleDarkMode={() => setIsDarkMode(!isDarkMode)} />;
  }

  if (user && !config?.setupCompleted) {
    return <SetupWizard user={user} config={config} />;
  }

  if (user && tenantId && config?.setupCompleted && currentUserRole === null) {
    return (
      <div className="h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Access Denied</h1>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-8 max-w-sm">
          You are not registered as staff for this business. Please contact your administrator.
        </p>
        <button onClick={logout} className="px-8 py-3 bg-slate-100 dark:bg-[#0B1120] text-slate-600 dark:text-slate-300 font-bold rounded-xl transition-all hover:bg-slate-200 dark:hover:bg-slate-900">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-50 dark:bg-slate-950 flex flex-col font-sans overflow-hidden">
      {/* Professional Header */}
      <header className="h-14 lg:h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700/60 px-4 lg:px-6 flex items-center justify-between flex-shrink-0 z-40 sticky top-0">
        <div className="flex items-center gap-4 lg:gap-8">
          <div className="font-extrabold text-lg lg:text-xl tracking-tighter text-primary shrink-0">Jimmy's POS</div>
          <nav className="hidden lg:flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            {getNavItems().map(item => (
              <button 
                key={item.id}
                onClick={() => navigate(item.id as any)}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${view === item.id ? 'bg-white dark:bg-slate-900 text-primary shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                <item.icon className="w-3 h-3" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3 lg:gap-6">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center cursor-pointer"
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="flex flex-col items-end hidden sm:flex">
            <span className="font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Station 01</span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Admin Panel</span>
          </div>
          
          <div className="flex items-center gap-3 lg:gap-4">
            {user ? (
              <>
                <div className="text-right hidden sm:block">
                  <p className="font-bold text-slate-900 dark:text-white text-xs leading-none mb-1">{user.displayName || 'Admin'}</p>
                  <button onClick={logout} className="text-[10px] font-bold text-primary uppercase hover:underline">Logout</button>
                </div>
                <img 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'Admin'}`} 
                  alt="Avatar" 
                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700/60"
                />
              </>
            ) : (
              <button 
                onClick={login}
                className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-bold shadow-md shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
              >
                Login
              </button>
            )}
          </div>

          {/* Mobile Cart Trigger */}
          {view === 'pos' && (
            <button 
              onClick={() => setIsCartOpen(!isCartOpen)}
              className="lg:hidden relative p-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/20"
            >
              <ShoppingCart className="w-5 h-5" />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <nav className="lg:hidden flex overflow-x-auto bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/60 px-4 py-2 gap-2 no-scrollbar scroll-smooth transition-all shrink-0 sticky top-14 lg:top-16 z-30 shadow-sm">
        {getNavItems().map(item => (
          <button 
            key={item.id}
            onClick={() => {
                navigate(item.id as any);
                setIsCartOpen(false);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap border ${view === item.id ? 'bg-primary/5 text-primary border-primary/20' : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0B1120] border-transparent'}`}
          >
            <item.icon className="w-3.5 h-3.5" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">

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
  
      </div>

      <AnimatePresence>
        {tenderModal.isOpen && tenderModal.method && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col relative overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{tenderModal.method === 'cash' ? 'Cash Payment' : 'Card Payment'}</h3>
                <button onClick={() => setTenderModal({ isOpen: false, method: null })} className="p-2 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-all"><X className="w-5 h-5"/></button>
              </div>
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl flex justify-between items-center border border-slate-100 dark:border-slate-700">
                  <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Total Due</span>
                  <span className="text-2xl font-black text-primary">{config?.business?.currency || 'R'}{cartTotal.toFixed(2)}</span>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-1 block">{tenderModal.method === 'cash' ? 'Amount Tendered' : 'Charge Amount'}</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    autoFocus
                    required 
                    value={tenderedAmount} 
                    onChange={e => setTenderedAmount(e.target.value)} 
                    className="w-full text-3xl font-black px-4 py-4 bg-white dark:bg-[#0B1120] border-2 border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-center" 
                  />
                </div>
                {tenderModal.method === 'cash' ? (
                  <div className={`p-4 rounded-xl flex justify-between items-center border ${Number(tenderedAmount || 0) >= cartTotal ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400' : 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'}`}>
                    <span className="text-sm font-black uppercase tracking-widest">Change</span>
                    <span className="text-2xl font-black">{config?.business?.currency || 'R'}{Math.max(0, Number(tenderedAmount || 0) - cartTotal).toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl flex justify-between items-center border ${Number(tenderedAmount || 0) >= cartTotal ? 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-400' : 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'}`}>
                      <span className="text-sm font-black uppercase tracking-widest">Overage</span>
                      <span className="text-2xl font-black">{config?.business?.currency || 'R'}{Math.max(0, Number(tenderedAmount || 0) - cartTotal).toFixed(2)}</span>
                    </div>
                    {Number(tenderedAmount || 0) > cartTotal && (
                       <div className="flex bg-slate-100 dark:bg-[#0B1120] p-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
                          <button onClick={() => setCardOverageAction('tip')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${cardOverageAction === 'tip' ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Register as Tip</button>
                          <button onClick={() => setCardOverageAction('cashout')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${cardOverageAction === 'cashout' ? 'bg-white dark:bg-slate-800 shadow-sm text-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Cash Payout</button>
                       </div>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-8 flex gap-3">
                <button onClick={() => setTenderModal({ isOpen: false, method: null })} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">Cancel</button>
                <button 
                  disabled={isProcessing || Number(tenderedAmount || 0) < cartTotal}
                  onClick={() => handleCheckout(tenderModal.method!)} 
                  className="flex-1 py-4 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex justify-center items-center gap-2"
                >
                  {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />} Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {checkoutModal.isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-[#eff6ff] rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-12 h-12 text-primary" />
              </div>
              <h3 className="text-2xl font-black tracking-tight mb-2 text-slate-900 dark:text-white">Checkout Success</h3>
              <p className="text-[#64748b] text-sm font-medium mb-8">Transaction has been recorded.</p>
              <button onClick={() => setCheckoutModal({ isOpen: false, paymentMethod: null })} className="w-full py-4 bg-primary text-white rounded-2xl font-black shadow-lg shadow-primary/20 hover:bg-primary-hover transition-all">COMPLETED</button>
            </motion.div>
          </motion.div>
        )}

        {customerModal.isOpen && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl overflow-hidden relative">
              <h3 className="text-2xl font-black tracking-tight mb-6 text-slate-900 dark:text-white">{customerModal.customer?.id ? 'Edit Customer' : 'Add New Customer'}</h3>
              <form onSubmit={saveCustomer} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Full Name</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                    value={customerModal.customer?.name || ""}
                    onChange={e => setCustomerModal({...customerModal, customer: {...customerModal.customer, name: e.target.value}})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Email Address</label>
                  <input 
                    required
                    type="email" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                    value={customerModal.customer?.email || ""}
                    onChange={e => setCustomerModal({...customerModal, customer: {...customerModal.customer, email: e.target.value}})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Phone Number</label>
                  <input 
                    type="tel" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                    value={customerModal.customer?.phone || ""}
                    onChange={e => setCustomerModal({...customerModal, customer: {...customerModal.customer, phone: e.target.value}})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Address</label>
                  <textarea 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white h-20 resize-none"
                    value={customerModal.customer?.address || ""}
                    onChange={e => setCustomerModal({...customerModal, customer: {...customerModal.customer, address: e.target.value}})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Customer Notes</label>
                  <textarea 
                    placeholder="Add special requests, preferences, or internal notes..."
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white h-24 resize-none"
                    value={customerModal.customer?.notes || ""}
                    onChange={e => setCustomerModal({...customerModal, customer: {...customerModal.customer, notes: e.target.value}})}
                  />
                </div>
                <div className="flex gap-3 mt-8">
                   <button type="button" onClick={() => setCustomerModal({ isOpen: false, customer: null })} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:bg-slate-700 transition-all">Cancel</button>
                   <button type="submit" disabled={isProcessing} className="flex-1 py-4 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
                     {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                     {customerModal.customer?.id ? 'Save Changes' : 'Create Profile'}
                   </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
        {isScanning && (
          <BarcodeScanner 
            onScan={handleBarcodeScan}
            onClose={() => setIsScanning(false)}
          />
        )}
        
        {productModal.isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-2xl w-full shadow-2xl overflow-hidden relative max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{productModal.product?.id ? 'Edit Product' : 'Add New Product'}</h3>
                <button onClick={() => setProductModal({ isOpen: false, product: null })} className="p-2 hover:bg-slate-100 dark:bg-slate-800 rounded-full transition-all text-slate-400 dark:text-slate-500"><X className="w-6 h-6" /></button>
              </div>

              <form onSubmit={saveProduct} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Product Name</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      value={productModal.product?.name || ""}
                      onChange={e => setProductModal({...productModal, product: {...productModal.product, name: e.target.value}})}
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Product Image URL</label>
                    <input 
                      type="url" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      placeholder="Paste image URL here..."
                      value={productModal.product?.imageUrl || ""}
                      onChange={e => setProductModal({...productModal, product: {...productModal.product, imageUrl: e.target.value}})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Selling Price (R)</label>
                    <input 
                      required
                      type="number" step="0.01"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      value={productModal.product?.price ?? ""}
                      onChange={e => setProductModal({...productModal, product: {...productModal.product, price: parseFloat(e.target.value)}})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Cost Price (R)</label>
                    <input 
                      required
                      type="number" step="0.01"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      value={productModal.product?.costPrice ?? ""}
                      onChange={e => setProductModal({...productModal, product: {...productModal.product, costPrice: parseFloat(e.target.value)}})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Section</label>
                    <select 
                      required
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      value={productModal.product?.section || ""}
                      onChange={e => setProductModal({...productModal, product: {...productModal.product, section: e.target.value, category: CATEGORY_MAP[e.target.value]?.[0] || "", subCategory: ""}})}
                    >
                      <option value="">Select Section</option>
                      {SECTIONS.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Category</label>
                    <select 
                      required
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      value={productModal.product?.category || ""}
                      onChange={e => setProductModal({...productModal, product: {...productModal.product, category: e.target.value, subCategory: (SUB_CATEGORY_MAP[e.target.value] || [])[0] || ""}})}
                    >
                      <option value="">Select Category</option>
                      {(productModal.product?.section ? CATEGORY_MAP[productModal.product.section] || [] : []).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Sub-Category</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      value={productModal.product?.subCategory || ""}
                      onChange={e => setProductModal({...productModal, product: {...productModal.product, subCategory: e.target.value}})}
                    >
                      <option value="">None</option>
                      {(productModal.product?.category ? SUB_CATEGORY_MAP[productModal.product.category] || [] : []).map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Barcode / SKU</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      value={productModal.product?.barcode || ""}
                      onChange={e => setProductModal({...productModal, product: {...productModal.product, barcode: e.target.value}})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Current Stock</label>
                    <input 
                      required
                      type="number" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      value={productModal.product?.stock ?? ""}
                      onChange={e => setProductModal({...productModal, product: {...productModal.product, stock: parseInt(e.target.value)}})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Low Stock Threshold</label>
                    <input 
                      required
                      type="number" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      value={productModal.product?.minStock ?? 10}
                      onChange={e => setProductModal({...productModal, product: {...productModal.product, minStock: parseInt(e.target.value)}})}
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-8">
                  <button type="button" onClick={() => setProductModal({ isOpen: false, product: null })} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:bg-slate-700 transition-all">Cancel</button>
                  <button type="submit" disabled={isProcessing} className="flex-1 py-4 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {productModal.product?.id ? 'Save Changes' : 'Add to Catalog'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {staffModal.isOpen && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[#1e293b]/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl overflow-hidden relative max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center mb-6 shrink-0">
                <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{staffModal.staff?.id ? 'Edit Personnel' : 'New Personnel'}</h3>
                <button onClick={() => setStaffModal({ isOpen: false, staff: null })} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 transition-all"><X className="w-6 h-6" /></button>
              </div>

              <form onSubmit={saveStaff} className="space-y-5 overflow-y-auto no-scrollbar pb-6 flex-1 min-h-0 pr-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Full Name</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                    value={staffModal.staff?.name || ""}
                    onChange={e => setStaffModal({...staffModal, staff: {...staffModal.staff, name: e.target.value}})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Email Address</label>
                  <input 
                    required
                    type="email" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                    value={staffModal.staff?.email || ""}
                    onChange={e => setStaffModal({...staffModal, staff: {...staffModal.staff, email: e.target.value}})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Role Designation</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white appearance-none"
                    value={staffModal.staff?.role || "cashier"}
                    onChange={e => setStaffModal({...staffModal, staff: {...staffModal.staff, role: e.target.value as any}})}
                  >
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Phone</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      value={staffModal.staff?.phone || ""}
                      onChange={e => setStaffModal({...staffModal, staff: {...staffModal.staff, phone: e.target.value}})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">ID Number</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      value={staffModal.staff?.idNumber || ""}
                      onChange={e => setStaffModal({...staffModal, staff: {...staffModal.staff, idNumber: e.target.value}})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Pay Rate</label>
                    <input 
                      type="number" 
                      min="0"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white"
                      value={staffModal.staff?.payRate || ""}
                      onChange={e => setStaffModal({...staffModal, staff: {...staffModal.staff, payRate: Number(e.target.value)}})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Pay Type</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-sm font-semibold text-slate-900 dark:text-white appearance-none"
                      value={staffModal.staff?.payType || "hourly"}
                      onChange={e => setStaffModal({...staffModal, staff: {...staffModal.staff, payType: e.target.value as 'hourly' | 'salary'}})}
                    >
                      <option value="hourly">Hourly</option>
                      <option value="salary">Salary (Monthly)</option>
                    </select>
                  </div>
                </div>

                {staffModal.staff?.role === 'cashier' && (
                  <div className="space-y-3 pt-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest px-1">Restricted Access (Optional)</label>
                    <div className="bg-slate-50 dark:bg-[#0B1120] p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-4 max-h-48 overflow-y-auto">
                      {SECTIONS.map(section => (
                        <div key={section} className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={staffModal.staff?.assignedSections?.includes(section) || false}
                              onChange={(e) => {
                                const current = staffModal.staff?.assignedSections || [];
                                const newSections = e.target.checked ? [...current, section] : current.filter(s => s !== section);
                                setStaffModal({...staffModal, staff: {...staffModal.staff, assignedSections: newSections}});
                              }}
                              className="rounded border-slate-300 text-primary focus:ring-primary"
                            />
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{section}</span>
                          </label>
                          <div className="pl-6 space-y-1">
                            {CATEGORY_MAP[section].map(category => (
                              <label key={category} className="flex items-center gap-2 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={staffModal.staff?.assignedCategories?.includes(category) || false}
                                  onChange={(e) => {
                                    const current = staffModal.staff?.assignedCategories || [];
                                    const newCategories = e.target.checked ? [...current, category] : current.filter(c => c !== category);
                                    setStaffModal({...staffModal, staff: {...staffModal.staff, assignedCategories: newCategories}});
                                  }}
                                  className="rounded border-slate-300 text-primary focus:ring-primary"
                                />
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{category}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      <p className="text-[10px] text-slate-500 font-medium italic mt-2">If no sections or categories are selected, the cashier will have access to all products.</p>
                    </div>
                  </div>
                )}

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setStaffModal({ isOpen: false, staff: null })} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 dark:bg-slate-700 transition-all">Cancel</button>
                  <button 
                    type="submit"
                    disabled={isProcessing}
                    className="flex-1 py-3.5 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Personnel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {staffToDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-6">
                <Trash2 className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="text-2xl font-black tracking-tight mb-2 text-slate-900 dark:text-white">Delete Personnel</h3>
              <p className="text-slate-500 font-medium mb-8">Are you sure you want to delete this staff member? This action cannot be undone.</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setStaffToDelete(null)} disabled={isProcessing} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold uppercase tracking-widest text-xs">Cancel</button>
                <button onClick={() => deleteStaff(staffToDelete)} disabled={isProcessing} className="flex-1 py-4 bg-red-500 text-white rounded-xl font-bold uppercase tracking-widest text-xs flex justify-center items-center gap-2">
                  {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />} Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

