/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
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
  deleteDoc
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User 
} from 'firebase/auth';
import { db, auth } from './firebase';
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
  const [view, setView] = useState<'pos' | 'history' | 'inventory' | 'customers' | 'settings' | 'staff' | 'cash' | 'profile' | 'tables' | 'workstation' | 'leaderboard' | 'reports'>('pos');
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

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
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
    } else if (!user) {
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
      setView('pos');
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Fetch Products (Requires Auth)
  useEffect(() => {
    if (!user) {
      setProducts([]);
      return;
    }
    const q = query(collection(db, "products"));
    const unsubscribe = onSnapshot(q, {
      next: (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
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
            await addDoc(collection(db, "products"), { ...p, createdAt: serverTimestamp() });
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
    if (!user) {
      setCustomers([]);
      return;
    }
    const q = query(collection(db, "customers"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, {
      next: (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
        setCustomers(items);
      },
      error: (err) => console.error("Customers subscription error:", err)
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Staff (Requires Auth)
  useEffect(() => {
    if (!user) {
      setStaff([]);
      setIsStaffLoading(false);
      return;
    }
    setIsStaffLoading(true);
    const q = query(collection(db, "staff"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, {
      next: (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));
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
    if (!currentUserStaff) {
      setActiveSession(null);
      return;
    }
    const q = query(
      collection(db, "cashSessions"),
      where("staffId", "==", currentUserStaff.id),
      where("status", "==", "open")
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setActiveSession(null);
      } else {
        setActiveSession({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
    });
    return () => unsubscribe();
  }, [currentUserStaff]);

  // Fetch Config (Requires Auth)
  useEffect(() => {
    if (!user) {
      setConfigLoading(false);
      return;
    }
    setConfigLoading(true);
    const unsubscribe = onSnapshot(doc(db, "settings", "app"), {
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
    if (!user) {
      setSales([]);
      return;
    }
    const q = query(collection(db, "sales"), where("status", "in", ["completed", "pending"]), orderBy("createdAt", "desc"), limit(50));
    const unsubscribe = onSnapshot(q, {
      next: (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
        setSales(items);
      },
      error: (err) => {
        console.error("Sales subscription error:", err);
        // If query fails due to missing index, we might need to fallback or wait
      }
    });

    return () => unsubscribe();
  }, [user]);

  const cartTotal = useMemo(() => 
    cart.reduce((total, item) => total + (item.price * item.quantity), 0), 
  [cart]);

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
        await updateDoc(doc(db, "sales", activeOrderId), saleData);
        saleId = activeOrderId;
      } else {
        const saleRef = await addDoc(collection(db, "sales"), saleData);
        saleId = saleRef.id;
      }

      // Add loyalty points to customer
      if (selectedCustomerId && (method === 'cash' || method === 'card')) {
        const pointsEarned = Math.floor(cartTotal / 10);
        await updateDoc(doc(db, "customers", selectedCustomerId), {
          loyaltyPoints: increment(pointsEarned)
        });
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
              await updateDoc(doc(db, "cashSessions", activeSession.id), updates);
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
      await setDoc(doc(db, "config", "primary"), config);
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
        await updateDoc(doc(db, "customers", id), data);
      } else {
        await addDoc(collection(db, "customers"), { ...data, createdAt: serverTimestamp() });
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
        await updateDoc(doc(db, "staff", id), { ...data, updatedAt: serverTimestamp() });
      } else {
        const existing = staff.find(s => s.email.toLowerCase() === data.email?.toLowerCase());
        if (existing) {
           alert("A staff member with this email already exists!");
           setIsProcessing(false);
           return;
        }
        await addDoc(collection(db, "staff"), { ...data, status: 'active', createdAt: serverTimestamp() });
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
      await deleteDoc(doc(db, "staff", id));
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
        await updateDoc(doc(db, "products", id), cleanData);
      } else {
        await addDoc(collection(db, "products"), { ...cleanData, createdAt: serverTimestamp() });
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
      setView('pos');
    }
  }, [currentUserRole, view]);

  if (authLoading || (user && (configLoading || isStaffLoading))) {
    return (
      <div className="h-screen w-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <WelcomeView onLogin={login} isDarkMode={isDarkMode} toggleDarkMode={() => setIsDarkMode(!isDarkMode)} />;
  }

  if (user && !config?.setupCompleted) {
    return <SetupWizard user={user} config={config} />;
  }

  if (user && config?.setupCompleted && currentUserRole === null) {
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
                onClick={() => setView(item.id as any)}
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
                setView(item.id as any);
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
        {view === 'pos' ? (
          !activeSession ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 max-w-md w-full shadow-2xl text-center border border-slate-100 dark:border-slate-800/60">
                <div className="w-20 h-20 bg-orange-50 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                   <Lock className="w-10 h-10 text-orange-500" />
                </div>
                <h3 className="text-2xl font-black mb-2 tracking-tight text-slate-900 dark:text-white">Register Closed</h3>
                <p className="text-slate-500 font-medium mb-8">You must open the register and declare a starting float before processing transactions.</p>
                <button onClick={() => setView('cash')} className="w-full py-4 bg-primary text-white rounded-xl font-bold uppercase tracking-widest text-sm shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                  Open Register
                </button>
              </div>
            </div>
          ) : (
          <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">
            {/* Categories Section - Mobile Horizontal, Desktop Sidebar */}
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

            {/* Product Section */}
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
                    title="Scan Barcode"
                  >
                    <Maximize className="w-5 h-5" />
                  </button>
                </div>
                <div className="sm:w-80 relative">
                  <CustomerSelector 
                    customers={customers}
                    selectedId={selectedCustomerId}
                    onSelect={setSelectedCustomerId}
                    onAddNew={() => setCustomerModal({ isOpen: true, customer: {} })}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 lg:p-6 pt-2 grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:gap-4 auto-rows-max lg:auto-rows-[160px] pb-24 lg:pb-6">
                <AnimatePresence>
                  {filteredProducts.map(product => (
                    <motion.div
                      key={product.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => addToCart(product)}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-4 flex lg:flex-col justify-between items-center lg:items-start cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800 relative group shadow-sm active:border-primary gap-4 lg:gap-0"
                    >
                      <div className="w-12 h-12 lg:w-10 lg:h-10 bg-slate-50 dark:bg-[#0B1120] rounded-xl flex items-center justify-center text-xl lg:text-lg group-hover:scale-110 transition-transform shrink-0 overflow-hidden">
                        <img 
                          src={getProductImage(product)} 
                          alt={product.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm leading-tight mb-0.5 text-slate-900 dark:text-white truncate">{product.name}</div>
                        <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{product.category}</div>
                        <div className="lg:hidden flex items-baseline gap-2 mt-1">
                           <span className="font-extrabold text-primary">R{product.price.toFixed(2)}</span>
                           <span className="text-[8px] font-black text-slate-300 dark:text-slate-600">{product.stock} Units</span>
                        </div>
                      </div>
                      <div className="hidden lg:flex items-end justify-between w-full mt-2">
                        <div className="font-extrabold text-lg text-primary tracking-tight">R{product.price.toFixed(2)}</div>
                        <div className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${product.stock < 10 ? 'bg-red-50 text-red-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                          {product.stock}
                        </div>
                      </div>
                      <div className="absolute top-2 right-2 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1.5">
                        <div 
                          className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all shadow-sm"
                          onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                        >
                          <Plus className="w-4 h-4" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </section>

            {/* Cart Section - Drawer on mobile, Sidebar on desktop */}
            <AnimatePresence>
              {(isCartOpen || window.innerWidth >= 1024) && (
                <>
                  {/* Backdrop for mobile */}
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
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
                    <div className="p-5 border-b border-slate-200 dark:border-slate-700/60 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 z-10">
                      <div>
                        <h2 className="font-extrabold text-lg flex items-center gap-2 text-slate-900 dark:text-white">
                          <ShoppingCart className="w-5 h-5 text-primary" />
                          Current Order
                        </h2>
                        {selectedCustomerId && (
                          <div className="flex items-center gap-1 text-[10px] font-black text-primary uppercase tracking-widest mt-1">
                            <Users className="w-3 h-3" />
                            {customers.find(c => c.id === selectedCustomerId)?.name}
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

                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/50 min-h-[200px]">
                      {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 opacity-50 space-y-2 text-center p-8 grayscale">
                          <ShoppingBag className="w-12 h-12" />
                          <p className="text-xs font-black uppercase tracking-widest">Cart is empty</p>
                        </div>
                      ) : (
                        cart.map(item => (
                          <div key={item.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl flex items-center justify-between border border-slate-100 dark:border-slate-800/60 shadow-sm transition-all hover:border-primary/20">
                            <div className="flex-1 pr-4 min-w-0">
                              <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{item.name}</p>
                              <p className="text-xs font-black text-primary mt-0.5">R{(item.price * item.quantity).toFixed(2)}</p>
                            </div>
                            <div className="flex items-center gap-4 bg-slate-50 dark:bg-[#0B1120] rounded-xl p-1 shrink-0">
                              <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-lg text-xs font-black shadow-sm active:scale-90">-</button>
                              <span className="font-black text-xs w-4 text-center">{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 flex items-center justify-center bg-primary text-white rounded-lg text-xs font-black shadow-sm active:scale-90">+</button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="p-5 lg:p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/60 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] sticky bottom-0">
                      
                      {config?.business?.isRestaurantMode && activeTableNumber && (
                        <div className="flex justify-between items-center mb-4 p-3 bg-primary/10 rounded-xl border border-primary/20">
                          <span className="font-bold text-primary flex items-center gap-2"><Utensils className="w-4 h-4"/> Table {activeTableNumber}</span>
                          <button onClick={() => { setActiveTableNumber(null); setActiveOrderId(null); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">Clear</button>
                        </div>
                      )}
                      <div className="flex justify-between items-center mb-6">
                        <span className="font-bold text-slate-400 dark:text-slate-500 text-xs uppercase tracking-widest">Grand Total</span>
                        <span className="font-black text-4xl text-slate-900 dark:text-white tracking-tighter">R{cartTotal.toFixed(2)}</span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <button 
                          disabled={isProcessing || cart.length === 0}
                          onClick={() => { setTenderModal({ isOpen: true, method: 'cash' }); setTenderedAmount(''); }}
                          className="flex flex-col items-center justify-center gap-2 h-20 rounded-2xl bg-emerald-600 text-white font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 shadow-lg shadow-emerald-600/30"
                        >
                          <Banknote className="w-5 h-5" />
                          <span className="text-[9px] uppercase tracking-widest">CASH</span>
                        </button>
                        <button 
                          disabled={isProcessing || cart.length === 0}
                          onClick={() => { setTenderModal({ isOpen: true, method: 'card' }); setTenderedAmount(''); }}
                          className="flex flex-col items-center justify-center gap-2 h-20 rounded-2xl bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 shadow-lg shadow-slate-800/30"
                        >
                          <CreditCard className="w-5 h-5" />
                          <span className="text-[9px] uppercase tracking-widest">CARD</span>
                        </button>
                        <button 
                          disabled={isProcessing || cart.length === 0}
                          onClick={() => handleCheckout('payfast')}
                          className="flex flex-col items-center justify-center gap-2 h-20 rounded-2xl bg-payfast text-white font-black transition-all hover:shadow-lg disabled:opacity-50 active:scale-95 shadow-lg shadow-payfast/20"
                        >
                          {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                          <span className="text-[9px] uppercase tracking-widest">PAYFAST</span>
                        </button>
                      </div>


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
                      
                      <div className="flex gap-2">
                        <button onClick={() => setCart([])} title="Clear Cart" className="h-14 w-14 bg-slate-50 dark:bg-[#0B1120] text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-50 transition-all border border-slate-100 dark:border-slate-800/60 active:scale-95 shrink-0">
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <button title="Add Note" className="flex-1 h-14 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center hover:bg-slate-100 dark:bg-slate-800 transition-all border border-slate-100 dark:border-slate-800/60 active:scale-95 gap-2">
                          <StickyNote className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Note</span>
                        </button>
                        <button onClick={() => setView('cash')} title="Cash Drawer" className="flex-1 h-14 bg-slate-50 dark:bg-[#0B1120] text-emerald-500 rounded-2xl flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-100 transition-all border border-slate-100 dark:border-slate-800/60 active:scale-95 gap-2">
                          <Banknote className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Drawer</span>
                        </button>
                      </div>
                    </div>
                  </motion.aside>
                </>
              )}
            </AnimatePresence>
          </div>
          )
        ) : view === 'history' ? (
          <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
             <div className="max-w-5xl mx-auto space-y-4 lg:space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                  <h2 className="text-xl lg:text-2xl font-black tracking-tight text-slate-900 dark:text-white">Transaction History</h2>
                  {filterCustomerId && (
                    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-bold border border-primary/20">
                      <Users className="w-3 h-3" />
                      Profile: {customers.find(c => c.id === filterCustomerId)?.name || 'Unknown'}
                      <button onClick={() => setFilterCustomerId(null)} className="ml-1 hover:text-red-500 font-extrabold">×</button>
                    </div>
                  )}
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                  <input 
                    type="text" 
                    placeholder="Search transactions..."
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-primary/50 text-xs font-medium shadow-sm min-h-[44px]"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (filterCustomerId) setFilterCustomerId(null);
                    }}
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[600px]">
                    <thead className="bg-slate-50 dark:bg-[#0B1120] border-b border-slate-200 dark:border-slate-700/60">
                      <tr>
                        <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Order ID</th>
                        <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Customer</th>
                        <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Timestamp</th>
                        <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Method</th>
                        <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Amount</th>
                        <th className="px-6 py-4 font-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSales.map(sale => (
                        <tr key={sale.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                          <td className="px-6 py-4 font-mono text-[10px] text-slate-400 dark:text-slate-500">#{sale.id.slice(-8)}</td>
                          <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-300">
                            {sale.customerId ? customers.find(c => c.id === sale.customerId)?.name || 'Deleted' : 'Guest'}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">{sale.createdAt?.toDate().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td className="px-6 py-4 text-xs font-bold uppercase text-slate-500 dark:text-slate-400">{sale.paymentMethod}</td>
                          <td className="px-6 py-4 font-extrabold text-slate-900 dark:text-white">R{sale.total.toFixed(2)}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                              sale.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {sale.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredSales.length === 0 && (
                  <div className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm font-black uppercase tracking-widest opacity-50">No transactions</div>
                )}
              </div>
            </div>
          </div>
        ) : view === 'cash' ? (
          <CashManagementView currentUserStaff={currentUserStaff} />
        ) : view === 'inventory' ? (
          <div className="flex-1 p-4 lg:p-10 overflow-y-auto bg-slate-50 dark:bg-[#0B1120]">
            <div className="max-w-[1600px] mx-auto flex flex-col gap-8">
              {/* Inventory Sub-Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
                <button 
                  onClick={() => setInventoryTab('products')} 
                  className={`pb-4 px-2 text-sm font-bold transition-all ${inventoryTab === 'products' ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >Products</button>
                <button 
                  onClick={() => setInventoryTab('vendors')} 
                  className={`pb-4 px-2 text-sm font-bold transition-all ${inventoryTab === 'vendors' ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >Vendors</button>
                <button 
                  onClick={() => setInventoryTab('purchaseOrders')} 
                  className={`pb-4 px-2 text-sm font-bold transition-all ${inventoryTab === 'purchaseOrders' ? 'border-b-2 border-primary text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >Purchase Orders</button>
              </div>
              
              {inventoryTab === 'vendors' ? (
                <VendorManagementView />
              ) : inventoryTab === 'purchaseOrders' ? (
                <PurchaseOrdersView />
              ) : (
                <div className="flex flex-col lg:flex-row gap-10">
                  {/* Filter Sidebar */}
                  <aside className="lg:w-80 shrink-0 space-y-8">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-100 dark:border-slate-800/60 shadow-xl shadow-slate-200/50 space-y-10 lg:sticky lg:top-10">
                  <div>
                    <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white leading-none">Stock</h2>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-3">Master Inventory</p>
                  </div>

                  <div className="space-y-8">
                    {/* Search */}
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest block px-1">Quick Search</label>
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
                        <input 
                          type="text" 
                          placeholder="Name or SKU..."
                          className="w-full pl-11 pr-4 py-4 bg-slate-50 dark:bg-[#0B1120] border border-slate-100 dark:border-slate-800/60 rounded-2xl focus:ring-4 ring-primary/10 text-sm font-bold transition-all outline-none"
                          value={inventorySearch}
                          onChange={(e) => setInventorySearch(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Section Filter */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Section</label>
                        {inventorySection !== "All" && (
                          <button onClick={() => { setInventorySection("All"); setInventoryCategory("All"); setInventorySubCategory("All"); }} className="text-[9px] font-black text-primary uppercase tracking-widest hover:underline">Clear</button>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {SECTIONS.map(sec => (
                          <button
                            key={sec}
                            onClick={() => {
                              setInventorySection(sec === inventorySection ? "All" : sec);
                              setInventoryCategory("All");
                              setInventorySubCategory("All");
                            }}
                            className={`flex items-center justify-between px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border-2 group ${
                              inventorySection === sec 
                              ? 'bg-slate-900 dark:bg-white text-white border-slate-900 shadow-lg shadow-slate-900/20' 
                              : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-800/60 hover:border-slate-200 dark:border-slate-700/60'
                            }`}
                          >
                            <span>{sec}</span>
                            {inventorySection === sec ? <ChevronRight className="w-3 h-3" /> : <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Category Filter */}
                    {inventorySection !== "All" && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Category</label>
                          <ChevronDown className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                        </div>
                        <div className="flex flex-col gap-2">
                          {(CATEGORY_MAP[inventorySection] || []).map(cat => (
                            <button
                              key={cat}
                              onClick={() => {
                                setInventoryCategory(cat === inventoryCategory ? "All" : cat);
                                setInventorySubCategory("All");
                              }}
                              className={`flex items-center justify-between px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                inventoryCategory === cat 
                                ? 'bg-primary/10 text-primary ring-2 ring-primary/20' 
                                : 'bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:bg-slate-800'
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sub-Category Filter */}
                    {inventoryCategory !== "All" && SUB_CATEGORY_MAP[inventoryCategory] && (
                       <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest block px-1">Sub-Category</label>
                        <div className="flex flex-wrap gap-2">
                          {SUB_CATEGORY_MAP[inventoryCategory].map(sub => (
                            <button
                              key={sub}
                              onClick={() => setInventorySubCategory(sub === inventorySubCategory ? "All" : sub)}
                              className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                inventorySubCategory === sub 
                                ? 'bg-slate-800 dark:bg-slate-100 text-white shadow-md' 
                                : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 text-slate-400 dark:text-slate-500 hover:border-slate-300'
                              }`}
                            >
                              {sub}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-6">
                    <button 
                      onClick={() => setProductModal({ isOpen: true, product: { stock: 0, price: 0, costPrice: 0 } })}
                      className="w-full py-5 bg-primary text-white rounded-3xl font-black flex items-center justify-center gap-3 shadow-2xl shadow-primary/40 active:scale-95 hover:shadow-primary/60 transition-all text-xs uppercase tracking-[0.2em]"
                    >
                      <Plus className="w-5 h-5" />
                      Add Product
                    </button>
                  </div>
                </div>
              </aside>

              {/* Inventory Content area */}
              <div className="flex-1 space-y-10">
                {/* Visual Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-100 dark:border-slate-800/60 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all">
                    <div className="relative z-10">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Stock Items</p>
                      <h4 className="text-4xl font-black text-slate-900 dark:text-white">{inventoryStats.totalItems}</h4>
                      <p className="text-[9px] font-bold text-slate-300 dark:text-slate-600 mt-2">Active SKUs</p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:rotate-12 transition-transform duration-500">
                      <Package className="w-32 h-32 text-slate-900 dark:text-white" />
                    </div>
                  </div>

                  <div className={`p-8 rounded-[32px] border relative overflow-hidden group hover:shadow-xl transition-all ${inventoryStats.lowStockItems > 0 ? 'bg-orange-50 border-orange-100 shadow-orange-100/50' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/60'}`}>
                    <div className="relative z-10">
                      <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${inventoryStats.lowStockItems > 0 ? 'text-orange-600' : 'text-slate-400 dark:text-slate-500'}`}>Low Stock Alerts</p>
                      <h4 className={`text-4xl font-black ${inventoryStats.lowStockItems > 0 ? 'text-orange-600' : 'text-slate-900 dark:text-white'}`}>{inventoryStats.lowStockItems}</h4>
                      <button 
                        onClick={() => { setInventorySection("All"); setInventoryCategory("All"); setInventorySearch(""); /* logic to filter low stock */ }}
                        className="text-[9px] font-bold text-orange-400 mt-2 uppercase tracking-widest block hover:underline"
                      >
                        Needs Restocking
                      </button>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:rotate-12 transition-transform duration-500">
                      <ShieldCheck className="w-32 h-32 text-slate-900 dark:text-white" />
                    </div>
                  </div>

                  <div className="bg-slate-900 dark:bg-white p-8 rounded-[32px] border border-slate-800 dark:border-slate-200 shadow-2xl shadow-slate-900/20 relative overflow-hidden group animate-in zoom-in-95 duration-500">
                    <div className="relative z-10">
                      <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Inventory Value</p>
                      <h4 className="text-4xl font-black text-white">R{inventoryStats.totalValue.toLocaleString()}</h4>
                      <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-2">Current Asset Value</p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:-rotate-12 transition-transform duration-500">
                      <Banknote className="w-32 h-32 text-white" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8 mb-20">
                  {filteredInventory.map(product => {
                    const isLowStock = product.stock <= (product.minStock || 10);
                    return (
                      <div 
                        key={product.id} 
                        className={`bg-white dark:bg-slate-900 rounded-[40px] border transition-all hover:shadow-2xl hover:shadow-slate-200/50 group relative overflow-hidden ${isLowStock ? 'border-orange-200 ring-8 ring-orange-50/50' : 'border-slate-100 dark:border-slate-800/60'}`}
                      >
                        {/* Image/Icon Header */}
                        <div className="h-60 bg-slate-50 dark:bg-[#0B1120] relative overflow-hidden flex items-center justify-center">
                          <img 
                            src={getProductImage(product)} 
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                            referrerPolicy="no-referrer"
                          />
                          
                          {/* Floating Labels */}
                          <div className="absolute top-6 left-6 flex flex-col gap-2">
                             {isLowStock && (
                              <div className="px-3 py-1.5 bg-orange-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-xl">
                                Low Stock
                              </div>
                            )}
                            <div className="px-3 py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-900 dark:text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm border border-white/20">
                              {product.category}
                            </div>
                          </div>

                          {/* Quick Edit Trigger */}
                          <div className="absolute top-6 right-6 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                             <button 
                              onClick={() => setProductModal({ isOpen: true, product })}
                              className="w-10 h-10 bg-white dark:bg-slate-900 shadow-xl rounded-2xl flex items-center justify-center text-slate-900 dark:text-white hover:bg-slate-900 dark:hover:bg-white hover:text-white dark:hover:text-slate-900 transition-all ring-4 ring-white/50"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-8 space-y-6">
                          <div className="space-y-2">
                            <div className="flex justify-between items-start gap-4">
                              <h3 className="font-black text-xl text-slate-900 dark:text-white leading-tight">{product.name}</h3>
                              <p className="text-xl font-black text-primary">R{product.price.toFixed(2)}</p>
                            </div>
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{product.barcode || 'NO SERIAL'}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-4 pb-6 border-b border-slate-50">
                            <div>
                              <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 opacity-50">Quantity</p>
                              <div className="flex items-center gap-3">
                                <span className={`text-2xl font-black ${isLowStock ? 'text-orange-500 animate-pulse' : 'text-slate-900 dark:text-white'}`}>{product.stock}</span>
                                <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600">PCS</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 opacity-50">Asset Value</p>
                              <p className="text-2xl font-black text-slate-900 dark:text-white">R{(product.stock * (product.costPrice || product.price)).toLocaleString()}</p>
                            </div>
                          </div>

                          {/* Quick Stock Controls */}
                          <div className="flex gap-2">
                            <button 
                              onClick={async () => {
                                const ref = doc(db, "products", product.id);
                                await updateDoc(ref, { stock: Math.max(0, (product.stock || 0) - 1) });
                              }}
                              className="flex-1 py-4 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all border border-transparent hover:border-red-100"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={async () => {
                                const ref = doc(db, "products", product.id);
                                await updateDoc(ref, { stock: (product.stock || 0) + 1 });
                              }}
                              className="flex-1 py-4 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-500 transition-all border border-transparent hover:border-emerald-100"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button 
                               onClick={() => setProductModal({ isOpen: true, product })}
                               className="px-6 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center shadow-lg active:scale-95 transition-all"
                            >
                               Edit
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {filteredInventory.length === 0 && (
                    <div className="col-span-full py-32 text-center bg-white dark:bg-slate-900 rounded-[40px] border border-dashed border-slate-200 dark:border-slate-700/60">
                       <Package className="w-16 h-16 text-slate-200 mx-auto mb-6" />
                       <h4 className="text-xl font-black text-slate-900 dark:text-white">No matching inventory found</h4>
                       <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">Try adjusting your filters or search terms</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
        ) : view === 'customers' ? (
          <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl lg:text-2xl font-black tracking-tight text-slate-900 dark:text-white">Customer Intelligence</h2>
                <button 
                  onClick={() => setCustomerModal({ isOpen: true, customer: {} })}
                  className="w-full sm:w-auto px-6 py-3.5 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary/20 active:scale-95 transition-all text-sm"
                >
                  <UserPlus className="w-5 h-5" />
                  New Customer
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800/60 shadow-sm flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <UserPlus className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Add Your First Customer</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium max-w-xs mx-auto">Build your database to track purchases and offer personalized service.</p>
                </div>
                <button 
                   onClick={() => setCustomerModal({ isOpen: true, customer: {} })}
                   className="px-8 py-3 bg-slate-800 dark:bg-slate-100 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all"
                >
                  Launch Creator
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {customers.map(c => (
                  <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 lg:p-6 shadow-sm flex flex-col gap-4 transition-all hover:border-primary/20">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-slate-800 dark:bg-slate-100 text-white rounded-2xl flex items-center justify-center font-black uppercase text-lg shadow-lg shadow-slate-200">{c.name.charAt(0)}</div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 dark:text-white truncate">{c.name}</h3>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest truncate">{c.email}</p>
                        </div>
                      </div>
                      <button onClick={() => setCustomerModal({ isOpen: true, customer: c })} className="p-2.5 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 hover:text-primary rounded-xl transition-all"><Edit className="w-4 h-4" /></button>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                      <div className="flex -space-x-2">
                        {[1,2,3].map(i => (
                          <div key={i} className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-white" />
                        ))}
                      </div>
                      <button 
                        onClick={() => {
                          setFilterCustomerId(c.id);
                          setView('history');
                        }}
                        className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                      >
                        View Orders
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : view === 'staff' ? (
          <div className="flex-1 p-4 lg:p-8 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/50">
            <div className="max-w-6xl mx-auto space-y-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div>
                  <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Staff Control</h2>
                  <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Personnel Management</p>
                </div>
                <button 
                  onClick={() => setStaffModal({ isOpen: true, staff: { role: 'cashier' } })}
                  className="w-full sm:w-auto px-8 py-4 bg-primary text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-2xl shadow-primary/30 active:scale-95 hover:scale-105 transition-all text-sm uppercase tracking-widest"
                >
                  <UserPlus className="w-5 h-5" />
                  Add Personnel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {staff.map(s => (
                  <div key={s.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800/60 shadow-sm transition-all hover:shadow-xl group">
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-16 h-16 bg-slate-900 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg">
                        {s.name.charAt(0)}
                      </div>
                      <div className="flex gap-2">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                          s.role === 'admin' ? 'bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400' : 
                          s.role === 'manager' ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' : 
                          'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        }`}>
                          {s.role}
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-1 mb-6">
                      <h3 className="font-black text-lg text-slate-900 dark:text-white leading-tight">{s.name}</h3>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{s.email}</p>
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                       <div className="flex items-center gap-2">
                         <div className={`w-2 h-2 rounded-full ${s.status === 'active' ? 'bg-green-500' : 'bg-slate-300'}`} />
                         <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{s.status}</span>
                       </div>
                       <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                         <button 
                           onClick={() => setStaffModal({ isOpen: true, staff: s })}
                           className="p-2.5 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-xl hover:bg-primary hover:text-white transition-all"
                         >
                           <Edit className="w-4 h-4" />
                         </button>
                         <button 
                           onClick={() => setStaffToDelete(s.id)}
                           className="p-2.5 bg-slate-50 dark:bg-[#0B1120] text-slate-400 dark:text-slate-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
              {staff.length === 0 && (
                <div className="p-20 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700/60">
                  <UserCog className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                  <p className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No staff members assigned</p>
                </div>
              )}
            </div>
          </div>
                ) : view === 'profile' ? (
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
        ) : view === 'workstation' ? (
          <WorkstationView sales={sales} workstations={[{id: 'ws-1', name: 'Kitchen', type: 'kitchen'}]} currentUserStaff={currentUserStaff} />
        ) : view === 'leaderboard' ? (
          <LeaderboardView staff={staff} />
        ) : view === 'reports' ? (
          <ReportsView sales={sales} />
        ) : null}
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
                  <span className="text-2xl font-black text-primary">R{cartTotal.toFixed(2)}</span>
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
                    <span className="text-2xl font-black">R{Math.max(0, Number(tenderedAmount || 0) - cartTotal).toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl flex justify-between items-center border ${Number(tenderedAmount || 0) >= cartTotal ? 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-400' : 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'}`}>
                      <span className="text-sm font-black uppercase tracking-widest">Overage</span>
                      <span className="text-2xl font-black">R{Math.max(0, Number(tenderedAmount || 0) - cartTotal).toFixed(2)}</span>
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

