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
  activeSection: string;
  activeCategory: string;
  searchQuery: string;
  selectedCustomerId: string | null;
  activeTableNumber: string | null;
  activeOrderId: string | null;
  isCartOpen: boolean;
  isLivePollingEnabled: boolean;

  // Actions
  addToCart: (product: Product, workstationId?: string, selectedModifiers?: { modifierId: string, optionId: string, name: string, priceExtra: number }[]) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  clearCart: () => void;
  setCurrentUserStaff: (staff: Staff | null) => void;
  setConfig: (config: AppConfig | null) => void;
  setActiveSession: (session: any | null) => void;
  setTenantId: (id: string | null) => void;
  setWorkstations: (ws: Workstation[]) => void;
  setActiveSection: (section: string) => void;
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
  activeSection: 'All',
  activeCategory: 'All',
  searchQuery: '',
  selectedCustomerId: null,
  activeTableNumber: null,
  activeOrderId: null,
  isCartOpen: false,
  isLivePollingEnabled: false,

  addToCart: (product, workstationId, selectedModifiers) =>
    set((state) => {
      // Find item with SAME product ID and SAME modifiers
      const existingIdx = state.cart.findIndex(item => {
        if (item.id !== product.id) return false;
        const itemMods = (item as CartItem).selectedModifiers || [];
        const newMods = selectedModifiers || [];
        if (itemMods.length !== newMods.length) return false;
        return itemMods.every(m => newMods.some(nm => nm.optionId === m.optionId));
      });

      if (existingIdx > -1) {
        const newCart = [...state.cart];
        newCart[existingIdx] = { ...newCart[existingIdx], quantity: newCart[existingIdx].quantity + 1 };
        return { cart: newCart };
      }

      // Calculate extra price from modifiers
      const extraPrice = (selectedModifiers || []).reduce((sum, m) => sum + m.priceExtra, 0);

      const newItem: CartItem = {
        ...product,
        cartItemId: `item_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        price: product.price + extraPrice,
        quantity: 1,
        workstationId: workstationId || product.workstationId,
        selectedModifiers: selectedModifiers || [],
      };
      return { cart: [...state.cart, newItem] };
    }),

  updateQuantity: (cartItemId, delta) =>
    set((state) => ({
      cart: state.cart
        .map(item => {
          const itemCartId = (item as CartItem).cartItemId || item.id;
          if (itemCartId === cartItemId) {
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
  setActiveSection: (section) => set({ activeSection: section, activeCategory: 'All' }),
  setActiveCategory: (category) => set({ activeCategory: category }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCustomerId: (id) => set({ selectedCustomerId: id }),
  setActiveTableNumber: (tableNumber) => set({ activeTableNumber: tableNumber }),
  setActiveOrderId: (orderId) => set({ activeOrderId: orderId }),
  setCart: (cart) => set({ cart }),
  setIsCartOpen: (open) => set({ isCartOpen: open }),
  setIsLivePollingEnabled: (enabled) => set({ isLivePollingEnabled: enabled }),
}));
