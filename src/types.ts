export interface Product {
  id: string;
  name: string;
  price: number;
  costPrice?: number;
  section?: string;
  category: string;
  subCategory?: string;
  stock: number;
  minStock?: number;
  imageUrl?: string;
  barcode?: string;
  workstationId?: string;
}

export interface Workstation {
  id: string;
  name: string;
  type: 'kitchen' | 'bar' | 'other';
  status: 'active' | 'inactive';
}

export interface CartItem extends Product {
  cartItemId?: string;
  quantity: number;
}

/** Item with full restaurant lifecycle tracking */
export interface OrderItem extends CartItem {
  status: 'pending' | 'accepted' | 'ready' | 'delivered';
  workstationId?: string;
  orderedAt?: any;
  acceptedAt?: any;
  readyAt?: any;
  deliveredAt?: any;
  actionStaffId?: string;
}

export interface Sale {
  id: string;
  items: (CartItem | OrderItem)[];
  total: number;
  subtotal?: number;
  taxAmount?: number;
  taxRate?: number;
  taxInclusive?: boolean;
  paymentMethod: 'cash' | 'payfast' | 'card' | 'wallet' | 'pending';
  tenderedAmount?: number;
  changeAmount?: number;
  tipAmount?: number;
  cashOutAmount?: number;
  pointsDiscount?: number;
  status: 'pending' | 'completed' | 'failed' | 'open' | 'kitchen';
  createdAt: any;
  updatedAt?: any;
  userId?: string;
  staffId?: string;
  payfast_payment_id?: string;
  customerId?: string;
  tableNumber?: string;
  /** Bar tab fields */
  isTab?: boolean;
  tabName?: string;
}

export interface Staff {
  id: string;
  name: string;
  role: 'admin' | 'cashier' | 'manager' | 'dev';
  email: string;
  phone?: string;
  status: 'active' | 'inactive';
  assignedSections?: string[];
  assignedCategories?: string[];
  idNumber?: string;
  payRate?: number;
  payType?: 'hourly' | 'salary';
  accumulatedLeave?: number;
  walletBalance?: number;
  createdAt: any;
  metrics?: {
    totalTips?: number;
    totalTipsRounded?: number;
    averagePrepTimeMs?: number;
    avgPrepTimeMs?: number;
    averageTurnaroundTimeMs?: number;
    avgTableTurnaroundMs?: number;
    totalOrdersHandled?: number;
  };
  badges?: string[];
  rank?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  notes?: string;
  /** Legacy field — use loyaltyPoints going forward */
  points?: number;
  loyaltyPoints?: number;
  /** Customer wallet balance (for refunds, credits, etc.) */
  walletBalance?: number;
  /** Firebase Auth UID if the customer has a portal account */
  uid?: string;
  createdAt?: any;
}

export interface BusinessSettings {
  name: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  taxRate?: number;
  taxName?: string;
  taxInclusive?: boolean;
  currency?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  isRestaurantMode?: boolean;
  // Loyalty
  enableLoyalty?: boolean;
  pointsEarnedPerCurrency?: number;
  pointsRequiredForDiscount?: number;
  discountAmountForPoints?: number;
}

export interface CategoryTree {
  [sectionName: string]: {
    [categoryName: string]: string[];
  }
}

export interface AppConfig {
  payfastMerchantId: string;
  payfastMerchantKey: string;
  payfastPassphrase: string;
  payfastSandbox: boolean;
  enableCash?: boolean;
  enableCard?: boolean;
  business?: BusinessSettings;
  setupCompleted?: boolean;
  categories?: CategoryTree;
  /** URL slug for the business profile page e.g. "yebo_apps" */
  slug?: string;
}

export interface Vendor {
  id: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  status: 'active' | 'inactive';
  createdAt?: any;
}

export interface POItem {
  productId: string;
  productName: string;
  quantity: number;
  expectedPrice: number;
}

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  status: 'draft' | 'sent' | 'received' | 'cancelled';
  type: 'once_off' | 'recurring';
  recurringFrequency?: 'weekly' | 'monthly';
  items: POItem[];
  totalAmount: number;
  expectedDeliveryDate?: any;
  createdAt: any;
  updatedAt: any;
  invoiceStatus?: 'unpaid' | 'paid';
}

export interface CashSession {
  id: string;
  staffId: string;
  staffName: string;
  openedAt: any;
  closedAt?: any;
  openingFloat: number;
  openingBreakdown?: Record<string, number>;
  expectedCash: number;
  actualCash?: number;
  closingBreakdown?: Record<string, number>;
  difference?: number;
  accumulatedTips?: number;
  netTips?: number;
  status: 'open' | 'closed';
  notes?: string;
}

export interface CashTransaction {
  id: string;
  sessionId: string;
  type: 'add_float' | 'remove_cash' | 'cash_sale' | 'refund';
  amount: number;
  timestamp: any;
  note?: string;
}

// ── Restaurant Tables ──────────────────────────────────────────────────────────

export interface RestaurantTable {
  id: string;          // e.g. "T1", "BAR-1", "PATIO-3"
  label: string;       // display name e.g. "Table 1", "Bar Seat 1"
  sectionId: string;
  capacity?: number;
  status: 'active' | 'inactive';
}

export interface TableSection {
  id: string;
  name: string;        // e.g. "Main Floor", "Patio", "Bar"
  color?: string;      // tailwind color key e.g. "blue", "emerald"
  order: number;
}

// ── Payout Requests ────────────────────────────────────────────────────────────

export interface PayoutRequest {
  id: string;
  staffId?: string;
  staffName?: string;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  createdAt: any;
  processedAt?: any;
  processedBy?: string;
  note?: string;
}

// ── Messaging ──────────────────────────────────────────────────────────────────

export type MessageChannel = 'general' | `dm_${string}`;

export interface Message {
  id: string;
  /** 'general' | 'dm_{uid1}_{uid2}' (uids sorted alphabetically) */
  channel: MessageChannel;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  createdAt: any;
  /** staffId[] who have read this message */
  readBy: string[];
  /** true = sent from the dev account, shown platform-wide */
  isDevBroadcast?: boolean;
  /** true = auto-generated system notification (e.g. workstation ready alert) */
  isSystemNotification?: boolean;
  tenantId?: string;
}
