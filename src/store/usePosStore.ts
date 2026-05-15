import { create } from 'zustand';
import { CartItem, OrderItem, Product, Staff, AppConfig, Workstation } from '../types';

interface PosState {
  cart: (CartItem | OrderItem)[];
  // Synced from useAppData — kept here so components can read without prop drilling
  currentUserStaff: Staff | null;
  config: AppConfig | null;
  activeSession: any | null;
  tenantId: string | null;
  workstations: Workstation[];
  // UI state
  activeCategory: string;
  searchQuery: string;
  selectedCustomerId: string | null;
  activeTableNumber: string | null;
  activeOrderId: string | null;
  isCartOpen: boolean;
  isLivePollingEnabled: boolean;

  // Actions
  addToCart: (product: Product, workstationId?: string) => void;
  updateQuantity: (productId: string, delta: number) => void;
  clearCart: () => void;
  setCurrentUserStaff: (staff: Staff | null) => void;
  setConfig: (config: AppConfig | null) => void;
  setActiveSession: (session: any | null) => void;
  setTenantId: (id: string | null) => void;
  setWorkstations: (ws: Workstation[]) => void;
  setActiveCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCustomerId: (id: string | null) => void;
  setActiveTableNumber: (tableNumber: string | null) => void;
  setActiveOrderId: (orderId: string | null) => void;
  /** Replace the cart with a new array */
  setCart: (cart: (CartItem | OrderItem)[]) => void;
  setIsCartOpen: (open: boolean) => void;
  setIsLivePollingEnabled: (enabled: boolean) => void;
}

export const usePosStore = create<PosState>((set) => ({
  cart: [],
  currentUserStaff: null,
  config: null,
  activeSession: null,
  tenantId: null,
  workstations: [],
  activeCategory: 'All',
  searchQuery: '',
  selectedCustomerId: null,
  activeTableNumber: null,
  activeOrderId: null,
  isCartOpen: false,
  isLivePollingEnabled: false,

  addToCart: (product, workstationId) =>
    set((state) => {
      const existing = state.cart.find(item => item.id === product.id);
      if (existing) {
        return {
          cart: state.cart.map(item =>
            item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
          ),
        };
      }
      const newItem: OrderItem = {
        ...product,
        quantity: 1,
        status: 'pending',
        workstationId: workstationId || product.workstationId,
      };
      return { cart: [...state.cart, newItem] };
    }),

  updateQuantity: (productId, delta) =>
    set((state) => ({
      cart: state.cart
        .map(item => {
          if (item.id === productId) {
            return { ...item, quantity: Math.max(0, item.quantity + delta) };
          }
          return item;
        })
        .filter(item => item.quantity > 0),
    })),

  clearCart: () => set({ cart: [], activeTableNumber: null, activeOrderId: null, selectedCustomerId: null }),
  setCurrentUserStaff: (staff) => set({ currentUserStaff: staff }),
  setConfig: (config) => set({ config }),
  setActiveSession: (session) => set({ activeSession: session }),
  setTenantId: (id) => set({ tenantId: id }),
  setWorkstations: (ws) => set({ workstations: ws }),
  setActiveCategory: (category) => set({ activeCategory: category }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCustomerId: (id) => set({ selectedCustomerId: id }),
  setActiveTableNumber: (tableNumber) => set({ activeTableNumber: tableNumber }),
  setActiveOrderId: (orderId) => set({ activeOrderId: orderId }),
  setCart: (cart) => set({ cart }),
  setIsCartOpen: (open) => set({ isCartOpen: open }),
  setIsLivePollingEnabled: (enabled) => set({ isLivePollingEnabled: enabled }),
}));
