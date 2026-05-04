export interface Product {
  id: string;
  name: string;
  price: number;
  workstationId?: string;
  costPrice?: number;
  section?: string;
  category: string;
  subCategory?: string;
  stock: number;
  minStock?: number;
  imageUrl?: string;
  barcode?: string;
}

export interface CartItem extends Product {
  quantity: number;
}

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
  paymentMethod: 'cash' | 'payfast' | 'card' | 'pending';
  tenderedAmount?: number;
  changeAmount?: number;
  tipAmount?: number;
  cashOutAmount?: number;
  status: 'pending' | 'completed' | 'failed' | 'open' | 'kitchen';
  createdAt: any;
  userId?: string;
  payfast_payment_id?: string;
  customerId?: string;
  tableNumber?: string;
}

export interface Staff {
  id: string;
  name: string;
  role: 'admin' | 'cashier' | 'manager';
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
    avgPrepTimeMs?: number;
    avgTableTurnaroundMs?: number;
    totalTipsRounded?: number;
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
  createdAt?: any;
  loyaltyPoints?: number;
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
  
  // Loyalty settings
  enableLoyalty?: boolean;
  pointsEarnedPerCurrency?: number; // e.g. 1 point per $x spent
  pointsRequiredForDiscount?: number; // e.g. 100 points
  discountAmountForPoints?: number; // e.g. $10
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

export interface Workstation {
  id: string;
  name: string;
  type: 'kitchen' | 'bar' | 'other';
}
