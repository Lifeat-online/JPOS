import { create } from 'zustand';
import { Product, CartItem, OrderItem, Customer, Staff, Sale, AppConfig, Workstation } from '../types';

interface PosState {
  products: Product[];
  cart: (CartItem | OrderItem)[];
  customers: Customer[];
  staff: Staff[];
  sales: Sale[];
  workstations: Workstation[];
  
  activeCategory: string;
  searchQuery: string;
  activeTableNumber: string | null;
  activeOrderId: string | null;
  filterCustomerId: string | null;
  activeSession: any | null;
  tenantId: string | null;
  
  isProcessing: boolean;
  
  // Setters
  setProducts: (products: Product[]) => void;
  setCustomers: (customers: Customer[]) => void;
  setStaff: (staff: Staff[]) => void;
  setSales: (sales: Sale[]) => void;
  setWorkstations: (ws: Workstation[]) => void;
  setActiveCategory: (cat: string) => void;
  setSearchQuery: (q: string) => void;
  setActiveTableNumber: (t: string | null) => void;
  setActiveOrderId: (id: string | null) => void;
  setFilterCustomerId: (id: string | null) => void;
  setActiveSession: (session: any | null) => void;
  setTenantId: (id: string | null) => void;
  setIsProcessing: (v: boolean) => void;
  
  // Cart operations
  addToCart: (product: Product, workstationId?: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  setCart: (items: (CartItem | OrderItem)[]) => void;
  clearCart: () => void;
}

export const usePosStore = create<PosState>((set) => ({
  products: [],
  cart: [],
  tenantId: null,
  customers: [],
  staff: [],
  sales: [],
  workstations: [],
  
  activeCategory: "All",
  searchQuery: "",
  activeTableNumber: null,
  activeOrderId: null,
  filterCustomerId: null,
  activeSession: null,
  
  isProcessing: false,

  setProducts: (items) => set({ products: items }),
  setCustomers: (items) => set({ customers: items }),
  setStaff: (items) => set({ staff: items }),
  setSales: (items) => set({ sales: items }),
  setWorkstations: (items) => set({ workstations: items }),
  
  setActiveCategory: (cat) => set({ activeCategory: cat }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveTableNumber: (t) => set({ activeTableNumber: t }),
  setActiveOrderId: (id) => set({ activeOrderId: id }),
  setFilterCustomerId: (id) => set({ filterCustomerId: id }),
  setActiveSession: (s) => set({ activeSession: s }),
  setIsProcessing: (p) => set({ isProcessing: p }),
  
  addToCart: (product: Product, workstationId?: string) => set((state) => {
    const existing = state.cart.find((item) => item.id === product.id);
    if (existing) {
      return {
        cart: state.cart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        ),
      };
    }
    // For restaurant mode, add it as an OrderItem pending
    const newItem: OrderItem = { 
       ...product, 
       quantity: 1, 
       status: 'pending',
       workstationId: workstationId || product.workstationId
    };
    return { cart: [...state.cart, newItem] };
  }),
  
  updateQuantity: (id: string, delta: number) => set((state) => {
    return {
      cart: state.cart.map((item) => {
        if (item.id === id) {
          return { ...item, quantity: Math.max(0, item.quantity + delta) };
        }
        return item;
      }).filter((item) => item.quantity > 0),
    };
  }),
  
  removeFromCart: (id: string) => set((state) => ({
    cart: state.cart.filter((item) => item.id !== id)
  })),
  
  setCart: (items) => set({ cart: items }),
  clearCart: () => set({ cart: [] }),
  setTenantId: (id) => set({ tenantId: id }),
}));
