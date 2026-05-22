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
  modifiers?: ModifierGroup[];
  recipe?: RecipeItem[];
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
  selectedModifiers?: {
    modifierId: string;
    optionId: string;
    name: string;
    priceExtra: number;
  }[];
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

export interface SalePayment {
  id: string;
  saleId: string;
  method: 'cash' | 'payfast' | 'card' | 'wallet' | 'account';
  amount: number;
  tenderedAmount?: number;
  changeAmount?: number;
  tipAmount?: number;
  cashOutAmount?: number;
  createdAt: any;
}

export interface Sale {
  id: string;
  items: (CartItem | OrderItem)[];
  total: number;
  subtotal?: number;
  taxAmount?: number;
  taxRate?: number;
  taxInclusive?: boolean;
  paymentMethod: 'cash' | 'payfast' | 'card' | 'wallet' | 'account' | 'pending';
  /** @deprecated use payments array for multi-tender sales */
  tenderedAmount?: number;
  /** @deprecated use payments array for multi-tender sales */
  changeAmount?: number;
  /** @deprecated use payments array for multi-tender sales */
  tipAmount?: number;
  /** @deprecated use payments array for multi-tender sales */
  cashOutAmount?: number;
  payments?: SalePayment[];
  pointsDiscount?: number;
  status: 'pending' | 'completed' | 'failed' | 'open' | 'kitchen';
  transactionType?: 'sale' | 'refund' | 'void';
  parentSaleId?: string | null;
  refundStatus?: 'none' | 'partial' | 'full';
  refundedAmount?: number;
  refundReason?: string | null;
  refundedBy?: string | null;
  voidReason?: string | null;
  voidedBy?: string | null;
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

export interface StaffPermissions {
  canSell?: boolean;
  canManageCash?: boolean;
  canViewHistory?: boolean;
  canMessage?: boolean;
  canUseKitchen?: boolean;
  canManageTables?: boolean;
  canManageTabs?: boolean;
  canViewLive?: boolean;
  canManageInventory?: boolean;
  canManageCustomers?: boolean;
  canManageStaff?: boolean;
  canManageWallets?: boolean;
  canViewLeaderboard?: boolean;
  canViewReports?: boolean;
  canAccessAi?: boolean;
  canManageSettings?: boolean;
  canAccessDevTools?: boolean;
}

export interface Staff {
  id: string;
  name: string;
  role: 'admin' | 'cashier' | 'manager' | 'chef' | 'dev';
  email: string;
  phone?: string;
  status: 'active' | 'inactive';
  permissions?: StaffPermissions;
  assignedSections?: string[];
  assignedCategories?: string[];
  idNumber?: string;
  payRate?: number;
  payType?: 'hourly' | 'salary';
  accumulatedLeave?: number;
  walletBalance?: number;
  walletBalanceDelta?: number;
  discountPercent?: number;
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
  newPassword?: string;
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
  /** Customer account credit switch and balances */
  accountEnabled?: boolean;
  accountLimit?: number;
  accountBalance?: number;
  accountBalanceDelta?: number;
  /** Firebase Auth UID if the customer has a portal account */
  uid?: string;
  profileType?: 'customer' | 'staff';
  staffId?: string;
  staffRole?: Staff['role'];
  discountPercent?: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface BusinessSettings {
  name: string;
  packageTier?: 'free' | 'starter' | 'business' | 'whitelabel';
  logoUrl?: string;
  address?: string;
  phone?: string;
  taxRate?: number;
  taxName?: string;
  taxInclusive?: boolean;
  currency?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  receiptPrint?: ReceiptPrintSettings;
  isRestaurantMode?: boolean;
  // Loyalty
  enableLoyalty?: boolean;
  pointsEarnedPerCurrency?: number;
  pointsRequiredForDiscount?: number;
  discountAmountForPoints?: number;
  roleDiscounts?: Partial<Record<Staff['role'], number>>;
  happyHourDiscounts?: HappyHourDiscount[];
}

export interface HappyHourDiscount {
  id: string;
  name: string;
  enabled: boolean;
  discountPercent: number;
  days: number[];
  startTime: string;
  endTime: string;
}

export interface ReceiptPrintSettings {
  paperSize?: '58mm' | '80mm' | '112mm' | 'a4' | 'letter' | 'custom';
  customPaperWidthMm?: number;
  marginMm?: number;
  fontSizePx?: number;
  showLogo?: boolean;
  logoMode?: 'none' | 'compact' | 'standard' | 'large';
  itemNameMode?: 'wrap' | 'truncate';
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
  submittedAt?: any;
  reviewedAt?: any;
  reviewedBy?: string;
  reconciledAt?: any;
  reconciledBy?: string;
  openingFloat: number;
  openingBreakdown?: Record<string, number>;
  expectedCash: number;
  actualCash?: number;
  closingBreakdown?: Record<string, number>;
  difference?: number;
  accumulatedTips?: number;
  netTips?: number;
  status: 'open' | 'closed';
  reviewStatus?: 'in_progress' | 'submitted' | 'reviewed' | 'reconciled' | 'disputed';
  notes?: string;
  managerNotes?: string;
  varianceReason?: string;
}

export interface CashTransaction {
  id: string;
  sessionId: string;
  type: 'opening_float' | 'cash_sale' | 'refund' | 'cash_drop' | 'cash_added' | 'cash_removed' | 'cash_out' | 'tip' | 'manager_adjustment' | 'no_sale';
  direction: 'in' | 'out' | 'neutral';
  amount: number;
  timestamp: any;
  saleId?: string;
  paymentId?: string;
  staffId?: string;
  staffName?: string;
  createdBy?: string;
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

export interface LiveRegisterStats {
  cashSessionId: string;
  staffId: string;
  staffName: string;
  openedAt: any;
  openingFloat: number;
  expectedCash: number;
  actualCash: number;
  accumulatedTips: number;
  netTips: number;
  completedCount: number;
  completedRevenue: number;
  activeOrders: number;
  lastSaleAt?: any;
  cashRevenue: number;
  cardRevenue: number;
  walletRevenue: number;
}

export interface LiveTotals {
  activeOrdersCount: number;
  openTabsCount: number;
  lastHour: { completedCount: number; completedRevenue: number };
  today: { completedCount: number; completedRevenue: number };
}

export interface LiveRestaurantTables {
  activeTableCount: number;
  openTableCount: number;
  openTables: Array<{
    tableNumber: string;
    activeOrders: number;
    oldestOrderAt?: any;
    activeOrderValue: number;
  }>;
}

export interface LiveStaffPerformanceRow {
  staffId: string;
  staffName: string;
  staffRole: string;
  completedCount: number;
  completedRevenue: number;
  activeOrders: number;
  lastSaleAt?: any;
}

export interface LiveWorkstationQueueRow {
  workstationId: string;
  workstationName: string;
  workstationType: string;
  pendingCount: number;
  acceptedCount: number;
  readyCount: number;
  queueCount: number;
  oldestOrderedAt?: any;
  oldestAgeSeconds: number;
  avgPrepSecondsLast2h: number;
}

export interface LiveRestaurantStats {
  tables: LiveRestaurantTables;
  staffPerformance: LiveStaffPerformanceRow[];
  workstationQueues: LiveWorkstationQueueRow[];
}

export interface LiveTenantStats {
  tenantId: string;
  isRestaurantMode: boolean;
  serverTime: string;
  retail: {
    openRegisterCount: number;
    registers: LiveRegisterStats[];
  };
  totals: LiveTotals;
  restaurant: LiveRestaurantStats | null;
}

// ── Inventory Expansion ────────────────────────────────────────────────────────

export type AiRole = 'admin' | 'manager' | 'dev' | 'cashier' | 'chef';
export type AiInsightCategory = 'sales' | 'stock' | 'cash' | 'staff' | 'restaurant' | 'customer' | 'package';
export type AiInsightSeverity = 'info' | 'success' | 'warning' | 'critical';

export type AiProviderName = 'openai' | 'ollama' | 'anythingllm' | 'google' | 'vertex' | 'openrouter';

export interface AiSettings {
  tenantId: string;
  enabled: boolean;
  provider: AiProviderName;
  model: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  workspaceSlug?: string | null;
  insightsEnabled: boolean;
  staffScoringEnabled: boolean;
  visibleRoles: AiRole[];
  staffScoreVisibleRoles: AiRole[];
  openAiConfigured?: boolean;
  apiKeyConfigured?: boolean;
  providerStatus?: Record<AiProviderName, boolean>;
  updatedAt?: string;
}

export interface AiModelOption {
  id: string;
  name: string;
  provider: AiProviderName;
  ownedBy?: string;
}

export interface AiInsight {
  id: string;
  tenantId: string;
  category: AiInsightCategory;
  severity: AiInsightSeverity;
  title: string;
  summary: string;
  recommendation: string;
  evidence: string[];
  confidence: number;
  status: 'open' | 'dismissed' | 'done';
  source: 'deterministic' | 'openai';
  createdAt?: string;
}

export interface AiStaffScore {
  id: string;
  tenantId: string;
  staffId: string;
  staffName: string;
  periodStart: string;
  periodEnd: string;
  score: number;
  grade: string;
  componentScores: Record<string, number>;
  strengths: string[];
  coachingNotes: string[];
  badges: string[];
  riskFlags: string[];
  source: 'deterministic' | 'openai';
  createdAt?: string;
}

export type InventoryAgentMode = 'invoice' | 'low_stock' | 'event';

export interface InventoryAgentStep {
  id: string;
  type: 'create_vendor' | 'create_bulk_item' | 'create_sales_unit' | 'create_purchase_order' | 'receive_invoice' | 'book_stock' | 'review_event_demand';
  label: string;
  confidence: number;
  risk: 'low' | 'medium' | 'high';
  approved: boolean;
  payload: Record<string, any>;
  evidence: string[];
}

export interface InventoryAgentProposal {
  id: string;
  mode: InventoryAgentMode;
  status: 'draft';
  summary: string;
  requiresHumanApproval: true;
  steps: InventoryAgentStep[];
  warnings: string[];
  dataAccess: string[];
}

export interface InventoryAgentApplyResult {
  applied: { stepId: string; type: InventoryAgentStep['type']; result: any }[];
  skipped: { stepId: string; type: InventoryAgentStep['type']; reason: string }[];
}

export interface BulkItem {
  id: string;
  name: string;
  itemType?: 'single' | 'bulk';
  unit: string; // ml, g, kg, items
  stock: number;
  minStock?: number;
  costPerUnit?: number;
  barcode?: string;
  packName?: string;
  packQuantity?: number;
  singleUnitName?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface RecipeItem {
  bulkItemId: string;
  quantity: number; // deduction quantity
  bulkItemName?: string; // transient
  unit?: string; // transient
}

export interface ModifierOption {
  id: string;
  modifierId: string;
  name: string;
  priceExtra: number;
  bulkItemId?: string;
  bulkQuantity?: number;
}

export interface ModifierGroup {
  id: string;
  productId: string;
  name: string;
  type: 'single' | 'multiple';
  required: boolean;
  minSelection: number;
  maxSelection: number;
  options: ModifierOption[];
}
