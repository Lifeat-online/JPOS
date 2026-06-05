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
  aggregateStock?: number;
  activeLocationId?: string;
  locationStock?: ProductLocationStock | null;
  locationStocks?: ProductLocationStock[];
  modifiers?: ModifierGroup[];
  recipe?: RecipeItem[];
}

export interface InventoryLocation {
  id: string;
  tenantId?: string;
  name: string;
  type: 'branch' | 'warehouse' | 'register' | 'kitchen' | 'other';
  status: 'active' | 'inactive';
  isDefault: boolean;
  address?: string | null;
  notes?: string | null;
  productCount?: number;
  totalQuantity?: number;
  lowStockCount?: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface ProductLocationStock {
  productId: string;
  productName?: string;
  category?: string;
  section?: string;
  locationId: string;
  locationName?: string;
  locationType?: InventoryLocation['type'];
  quantity: number;
  minStock: number;
  reorderThreshold: number;
  isLowStock?: boolean;
  updatedBy?: string | null;
  updatedByName?: string | null;
  updatedAt?: any;
}

export interface BatchRowError {
  row: number;
  message: string;
  data?: Record<string, unknown>;
}

export interface BatchMutationResult {
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: BatchRowError[];
  rows: Record<string, unknown>[];
}

export interface BatchExportResult {
  rows: Record<string, unknown>[];
  csv: string;
  filename: string;
  mimeType: string;
  count: number;
}

export interface StockTransferItem {
  id?: string;
  transferId?: string;
  productId: string;
  productName: string;
  quantity: number;
  fromPreviousQuantity?: number;
  fromNewQuantity?: number;
  toPreviousQuantity?: number;
  toNewQuantity?: number;
}

export interface StockTransferOrder {
  id: string;
  tenantId?: string;
  fromLocationId: string;
  fromLocationName?: string | null;
  toLocationId: string;
  toLocationName?: string | null;
  status: 'draft' | 'requested' | 'approved' | 'in_transit' | 'completed' | 'cancelled';
  requestedBy?: string | null;
  requestedByName?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
  notes?: string | null;
  completedAt?: any;
  createdAt?: any;
  updatedAt?: any;
  items: StockTransferItem[];
}

export type StockBatchExpiryStatus = 'ok' | 'expiring' | 'expired' | 'depleted';

export interface StockBatch {
  id: string;
  tenantId?: string;
  productId: string;
  productName: string;
  purchaseOrderId?: string | null;
  vendorId?: string | null;
  supplierInvoiceNumber?: string | null;
  supplierInvoiceDate?: any;
  batchNumber?: string | null;
  receivedQuantity: number;
  remainingQuantity: number;
  unitCost?: number;
  expiryDate?: any;
  receivedAt?: any;
  receivedBy?: string | null;
  receivedByName?: string | null;
  status: 'active' | 'depleted' | 'expired';
  note?: string | null;
  daysToExpiry?: number | null;
  expiryStatus?: StockBatchExpiryStatus;
  rotationRank?: number | null;
  rotationGuidance?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface StockValuationProductRow {
  productId: string;
  productName: string;
  category: string;
  productSection: string;
  currentStock: number;
  minStock: number;
  unitCost: number;
  retailPrice: number;
  productBookValue: number;
  batchTrackedQuantity: number;
  batchTrackedValue: number;
  unbatchedQuantity: number;
  unbatchedValue: number;
  locationId: string;
  locationName: string;
  marginPercent: number;
}

export interface StockValuationBatchRow {
  id: string;
  productId: string;
  productName: string;
  purchaseOrderId?: string | null;
  vendorId?: string | null;
  supplierInvoiceNumber?: string | null;
  supplierInvoiceDate?: any;
  batchNumber?: string | null;
  receivedQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  receivedValue: number;
  remainingValue: number;
  expiryDate?: any;
  receivedAt?: any;
  receivedByName?: string | null;
  status: StockBatchExpiryStatus;
  locationId: string;
  locationName: string;
  note?: string | null;
}

export interface StockValuationReceivingRow {
  purchaseOrderId: string;
  lineIndex: number;
  invoiceNumber?: string | null;
  invoiceDate?: any;
  receivedAt?: any;
  receivedByName?: string | null;
  productId?: string | null;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  varianceQuantity: number;
  unitCost: number;
  receivedValue: number;
  batchNumber?: string | null;
  expiryDate?: any;
  locationId: string;
  locationName: string;
  note?: string | null;
}

export interface StockValuationLocationRow {
  locationId: string;
  locationName: string;
  currentStockQuantity: number;
  productBookValue: number;
  batchTrackedQuantity: number;
  batchRemainingValue: number;
  unbatchedQuantity: number;
  receivedQuantity: number;
  receivedValue: number;
  movementQuantityIn: number;
  movementQuantityOut: number;
  movementValueDelta: number;
  note: string;
}

export interface StockValuationReport {
  filename: string;
  pdfFilename: string;
  mimeType: string;
  pdfMimeType: string;
  generatedAt: string;
  filters: Record<string, any>;
  summary: {
    totalProducts: number;
    currentStockQuantity: number;
    productBookValue: number;
    batchTrackedQuantity: number;
    batchRemainingValue: number;
    unbatchedQuantity: number;
    unbatchedValue: number;
    receivedQuantity: number;
    receivedValue: number;
    varianceQuantity: number;
    expiredBatchValue: number;
    expiringBatchValue: number;
    movementValueDelta: number;
  };
  productRows: StockValuationProductRow[];
  batchRows: StockValuationBatchRow[];
  receivingRows: StockValuationReceivingRow[];
  movementRows: Array<{
    reasonCode: string;
    movementCount: number;
    quantityIn: number;
    quantityOut: number;
    netQuantity: number;
    valueDelta: number;
    locationId: string;
    locationName: string;
  }>;
  locationRows: StockValuationLocationRow[];
  csv: string;
  pdfBase64: string;
}

export interface ReorderRecommendation {
  id: string;
  tenantId?: string;
  productId: string;
  productName: string;
  status: 'open' | 'in_review' | 'approved' | 'ordered' | 'dismissed';
  priority: 'low' | 'normal' | 'high' | 'critical';
  currentStock: number;
  minStock: number;
  targetStock: number;
  recommendedQuantity: number;
  estimatedUnitCost: number;
  estimatedTotalCost: number;
  avgDailySales: number;
  daysOfCover: number;
  vendorId?: string | null;
  locationId?: string | null;
  source?: string;
  evidence: string[];
  purchaseOrderId?: string | null;
  requestedBy?: string | null;
  requestedByName?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: any;
  dismissedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface ReorderNotificationRule {
  id: string;
  tenantId?: string;
  name: string;
  status: 'active' | 'inactive';
  locationId?: string | null;
  triggerType: 'below_threshold' | 'critical_only' | 'days_cover';
  priority: 'normal' | 'high' | 'critical';
  daysOfCover: number;
  vendorId?: string | null;
  notifyRoles: string[];
  lastRunAt?: any;
  lastResult?: {
    locationId?: string | null;
    triggerType?: string;
    priority?: string;
    daysOfCover?: number;
    vendorId?: string | null;
    created?: number;
    updated?: number;
    skippedApproved?: number;
    recommendationCount?: number;
  } | Record<string, any>;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export interface StockTakeSuggestion {
  productId: string;
  productName: string;
  barcode?: string | null;
  category?: string | null;
  section?: string | null;
  stock: number;
  minStock: number;
  score: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
  evidence: string[];
  signals: {
    shrinkageQuantity: number;
    wastageQuantity: number;
    varianceQuantity: number;
    expiryQuantity: number;
    quantitySold: number;
    avgDailySales: number;
    daysCover: number | null;
    lastIssueAt?: any;
  };
}

export interface Workstation {
  id: string;
  name: string;
  type: 'kitchen' | 'bar' | 'other';
  status: 'active' | 'inactive';
}

export type HardwareDeviceType =
  | 'receipt_printer'
  | 'kitchen_printer'
  | 'cash_drawer'
  | 'scale'
  | 'barcode_scanner'
  | 'pole_display'
  | 'card_terminal';

export type HardwareConnectionType =
  | 'browser_print'
  | 'escpos_network'
  | 'escpos_usb'
  | 'serial'
  | 'webserial'
  | 'webhid'
  | 'keyboard_wedge'
  | 'local_bridge'
  | 'payment_provider';

export interface HardwareDevice {
  id: string;
  tenantId: string;
  name: string;
  deviceType: HardwareDeviceType;
  connectionType: HardwareConnectionType;
  status: 'active' | 'inactive';
  workstationId?: string | null;
  isDefault: boolean;
  connectionConfig: Record<string, any>;
  capabilities: string[];
  lastCheckStatus?: string | null;
  lastCheckMessage?: string | null;
  lastCheckedAt?: any;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export interface HardwareDeviceEvent {
  id: string;
  tenantId: string;
  deviceId?: string | null;
  eventType: string;
  commandType: string;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  requestPayload: any;
  responsePayload: any;
  errorMessage?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
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
  method: 'cash' | 'payfast' | 'card' | 'wallet' | 'account' | 'qr' | 'bnpl';
  amount: number;
  tenderedAmount?: number;
  changeAmount?: number;
  tipAmount?: number;
  cashOutAmount?: number;
  provider?: string | null;
  providerDeviceId?: string | null;
  providerReference?: string | null;
  authorizationCode?: string | null;
  providerStatus?: 'pending' | 'confirmed' | 'approved' | 'settled' | 'failed' | 'reversed' | 'refunded' | 'partial_refund' | string | null;
  providerNote?: string | null;
  qrPayload?: string | null;
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
  paymentMethod: 'cash' | 'payfast' | 'card' | 'wallet' | 'account' | 'qr' | 'bnpl' | 'pending';
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
  loyaltyPointsRedeemed?: number;
  loyaltyPointsEarned?: number;
  promotionId?: string | null;
  promotionCode?: string | null;
  promotionDiscount?: number;
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

export type PromotionDiscountType = 'percent' | 'fixed';
export type PromotionStatus = 'active' | 'inactive';
export type PromotionAppliesTo = 'cart' | 'products' | 'categories';
export type PromotionCustomerScope = 'all' | 'selected' | 'no_customer';

export interface Promotion {
  id: string;
  tenantId?: string;
  code: string;
  name: string;
  description?: string | null;
  status: PromotionStatus;
  discountType: PromotionDiscountType;
  discountValue: number;
  startsAt?: any;
  endsAt?: any;
  minSubtotal: number;
  maxDiscountAmount?: number | null;
  appliesTo: PromotionAppliesTo;
  targetProductIds: string[];
  targetCategories: string[];
  customerScope: PromotionCustomerScope;
  targetCustomerIds: string[];
  totalRedemptionLimit?: number | null;
  perCustomerLimit?: number | null;
  redemptionCount: number;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export interface PromotionValidationResult {
  valid: boolean;
  reason?: string;
  promotion: Promotion | null;
  discountAmount: number;
  targetSubtotal: number;
  remainingRedemptions?: number | null;
}

export interface TaxInvoiceSummary {
  taxInvoiceNumber: string;
  saleId: string;
  parentSaleId?: string | null;
  createdAt?: any;
  transactionType: string;
  status: string;
  customerId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  paymentMethod: string;
  taxInclusive: boolean;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  taxableSupply: number;
  zeroRatedSupply: number;
  itemCount: number;
  unitCount: number;
  evidence: string;
}

export interface TaxPeriod {
  id: string;
  tenantId?: string;
  periodStart: any;
  periodEnd: any;
  status: 'locked';
  lockedAt?: any;
  lockedBy?: string | null;
  lockedByName?: string | null;
  lockNote?: string | null;
  currency: string;
  standardRate: number;
  grossSales: number;
  taxableSales: number;
  zeroRatedSales: number;
  exemptSales: number;
  outputTax: number;
  inputTax: number;
  netVatPayable: number;
  invoiceCount: number;
  refundCount: number;
  summary?: Record<string, any> | null;
}

export interface VatTaxReport {
  filename: string;
  pdfFilename: string;
  mimeType: string;
  pdfMimeType: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  locked: boolean;
  lockedPeriods: TaxPeriod[];
  summary: {
    invoiceCount: number;
    standardRatedInvoiceCount: number;
    refundCount: number;
    grossSales: number;
    taxableSales: number;
    zeroRatedSales: number;
    exemptSales: number;
    outputTax: number;
    inputTax: number;
    netVatPayable: number;
    currency: string;
    standardRate: number;
  };
  vat201Fields: Record<string, number>;
  rateBreakdown: Array<{ taxRate: number; invoiceCount: number; grossSales: number; outputTax: number }>;
  invoices: TaxInvoiceSummary[];
  notes: string[];
  csv: string;
  pdfBase64: string;
}

export interface MarginReportRow {
  key: string;
  label: string;
  quantity: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  grossMarginPercent: number;
  saleCount: number;
  missingCostCount: number;
}

export interface MarginReport {
  filename: string;
  pdfFilename: string;
  mimeType: string;
  pdfMimeType: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  summary: {
    revenue: number;
    cost: number;
    grossProfit: number;
    quantity: number;
    saleCount: number;
    productCount: number;
    categoryCount: number;
    staffCount: number;
    paymentMethodCount: number;
    missingCostCount: number;
    grossMarginPercent: number;
  };
  productRows: MarginReportRow[];
  categoryRows: MarginReportRow[];
  staffRows: MarginReportRow[];
  paymentMethodRows: MarginReportRow[];
  periodRows: MarginReportRow[];
  lowMarginRows: MarginReportRow[];
  csv: string;
  pdfBase64: string;
}

export interface OperationalCategoryPerformanceRow {
  key: string;
  label: string;
  lineCount: number;
  saleCount: number;
  quantity: number;
  revenue: number;
  averageLineRevenue: number;
}

export interface OperationalBasketSegmentRow {
  label: string;
  saleCount: number;
  revenue: number;
  averageBasket: number;
  averageItems: number;
}

export interface OperationalTableTurnoverRow {
  tableNumber: string;
  saleCount: number;
  revenue: number;
  averageCheck: number;
  averageDurationMinutes: number;
}

export interface OperationalOpenTabRow {
  saleId: string;
  tabName: string;
  tableNumber?: string | null;
  status: string;
  total: number;
  ageMinutes: number;
  ageBucket: string;
  staffId?: string | null;
  createdAt?: any;
}

export interface OperationalRefundVoidRow {
  saleId: string;
  createdAt?: any;
  transactionType: string;
  parentSaleId?: string | null;
  amount: number;
  refundStatus?: string | null;
  refundedAmount: number;
  refundReason?: string;
  voidReason?: string;
  reason: string;
  staffId?: string | null;
  paymentMethod?: string | null;
}

export interface OperationalCashVarianceRow {
  source: 'register' | 'eod' | string;
  id: string;
  label: string;
  staffName?: string | null;
  expected: number;
  counted: number;
  variance: number;
  status?: string | null;
  reason?: string | null;
}

export interface OperationalCashVarianceTrendRow {
  label: string;
  registerVariance: number;
  closeVariance: number;
  netVariance: number;
  absoluteVariance: number;
  count: number;
}

export interface OperationalReport {
  filename: string;
  pdfFilename: string;
  mimeType: string;
  pdfMimeType: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  summary: {
    categoryCount: number;
    basketSegmentCount: number;
    completedSaleCount: number;
    tableSaleCount: number;
    openTabCount: number;
    refundVoidCount: number;
    cashVarianceCount: number;
    cashAbsoluteVariance: number;
  };
  categoryPerformance: OperationalCategoryPerformanceRow[];
  basketSegments: OperationalBasketSegmentRow[];
  tableTurnoverSummary: {
    activeTableCount: number;
    tableSaleCount: number;
    turnoverPerTable: number;
  };
  tableTurnoverRows: OperationalTableTurnoverRow[];
  openTabAging: {
    count: number;
    totalValue: number;
    oldestAgeMinutes: number;
    buckets: Array<{ label: string; count: number; total: number }>;
    rows: OperationalOpenTabRow[];
  };
  refundVoidSummary: {
    refundCount: number;
    voidCount: number;
    refundAmount: number;
    voidAmount: number;
  };
  refundVoidRows: OperationalRefundVoidRow[];
  cashVarianceSummary: {
    count: number;
    netVariance: number;
    absoluteVariance: number;
    unresolvedCount: number;
  };
  cashVarianceTrend: OperationalCashVarianceTrendRow[];
  cashVarianceRows: OperationalCashVarianceRow[];
  csv: string;
  pdfBase64: string;
}

export interface AccountingAccountMapping {
  key: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'income' | 'expense' | 'equity';
}

export interface AccountingIntegrationTarget {
  id: 'sage' | 'xero' | 'quickbooks' | string;
  name: string;
  status: string;
  filename?: string;
  requiredFields: string[];
}

export interface AccountingTargetExport {
  targetId: 'sage' | 'xero' | 'quickbooks' | string;
  targetName: string;
  status: string;
  filename: string;
  mimeType: string;
  requiredFields: string[];
  lineCount: number;
  csv: string;
}

export interface AccountingJournalLine {
  lineNumber: number;
  entryId: string;
  entryDate: string;
  sourceType: string;
  sourceId: string;
  sourceLineId?: string | null;
  reference: string;
  memo: string;
  accountKey: string;
  accountCode: string;
  accountName: string;
  accountType: AccountingAccountMapping['type'];
  debit: number;
  credit: number;
  amount: number;
  currency: string;
  taxCode?: string;
  contactId?: string | null;
  contactName?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  paymentMethod?: string | null;
  externalReference?: string;
  sageReference?: string;
  xeroReference?: string;
  quickBooksReference?: string;
}

export interface AccountingJournalReport {
  filename: string;
  pdfFilename: string;
  mimeType: string;
  pdfMimeType: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  summary: {
    entryCount: number;
    lineCount: number;
    salesCount: number;
    refundCount: number;
    paymentLineCount: number;
    cogsLineCount: number;
    cashVarianceLineCount: number;
    missingCostLineCount: number;
    totalDebits: number;
    totalCredits: number;
    outOfBalance: number;
    balanced: boolean;
  };
  accountMappings: AccountingAccountMapping[];
  integrationTargets: AccountingIntegrationTarget[];
  targetExports: AccountingTargetExport[];
  journalLines: AccountingJournalLine[];
  csv: string;
  pdfBase64: string;
}

export interface EcommerceIntegrationTarget {
  id: 'shopify' | 'woocommerce' | 'takealot' | string;
  name: string;
  status: string;
  filename: string;
  requiredFields: string[];
  productCount: number;
}

export interface EcommerceTargetExport {
  targetId: 'shopify' | 'woocommerce' | 'takealot' | string;
  targetName: string;
  status: string;
  filename: string;
  mimeType: string;
  requiredFields: string[];
  productCount: number;
  csv: string;
}

export interface EcommerceMarketplaceExport {
  generatedAt: string;
  summary: {
    productCount: number;
    targetCount: number;
    outOfStockCount: number;
    lowStockCount: number;
    inventoryValue: number;
    includeInactive: boolean;
  };
  targets: EcommerceIntegrationTarget[];
  targetExports: EcommerceTargetExport[];
}

export type IntegrationApiKeyStatus = 'active' | 'revoked';
export type IntegrationWebhookStatus = 'received' | 'applied' | 'failed' | 'duplicate';

export interface IntegrationApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: IntegrationApiKeyStatus;
  lastUsedAt?: any;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
  revokedAt?: any;
  revokedBy?: string | null;
  revokedByName?: string | null;
}

export interface IntegrationWebhookEvent {
  id: string;
  tenantId: string;
  apiKeyId?: string | null;
  source: string;
  eventType: string;
  idempotencyKey: string;
  status: IntegrationWebhookStatus;
  entityType?: string | null;
  entityId?: string | null;
  payload?: any;
  result?: any;
  errorMessage?: string | null;
  createdAt?: any;
  processedAt?: any;
}

export type DeliveryProvider = 'uber_eats' | 'mr_d';
export type DeliveryOrderStatus = 'new' | 'accepted' | 'preparing' | 'ready' | 'dispatched' | 'completed' | 'cancelled';

export interface DeliveryOrderItem {
  id: string;
  externalItemId?: string | null;
  productId?: string | null;
  productName: string;
  quantity: number;
  price: number;
  note?: string | null;
  modifiers?: any[];
}

export interface DeliveryOrder {
  id: string;
  tenantId: string;
  provider: DeliveryProvider;
  externalOrderId: string;
  status: DeliveryOrderStatus;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  subtotal: number;
  deliveryFee: number;
  tipAmount: number;
  discountAmount: number;
  total: number;
  currency: string;
  placedAt?: any;
  acceptedAt?: any;
  dueAt?: any;
  saleId?: string | null;
  rawPayload?: any;
  createdAt?: any;
  updatedAt?: any;
  items: DeliveryOrderItem[];
}

export type LaybyStatus = 'active' | 'completed' | 'cancelled';
export type LaybyPaymentMethod = 'cash' | 'payfast' | 'card' | 'wallet' | 'account';

export interface LaybyItem {
  id: string;
  laybyOrderId: string;
  productId?: string | null;
  productName: string;
  name?: string;
  price: number;
  quantity: number;
  reservedQuantity: number;
  createdAt?: any;
}

export interface LaybyPayment {
  id: string;
  laybyOrderId: string;
  method: LaybyPaymentMethod;
  amount: number;
  tenderedAmount?: number;
  changeAmount?: number;
  staffId?: string | null;
  staffName?: string | null;
  cashSessionId?: string | null;
  note?: string | null;
  createdAt?: any;
}

export interface LaybyOrder {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string;
  staffId?: string | null;
  staffName?: string | null;
  status: LaybyStatus;
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  taxInclusive: boolean;
  totalAmount: number;
  depositAmount: number;
  amountPaid: number;
  balanceDue: number;
  refundAmount?: number;
  forfeitedAmount?: number;
  dueDate: any;
  cancelReason?: string | null;
  cancelledBy?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: any;
  completedSaleId?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
  completedAt?: any;
  createdAt?: any;
  updatedAt?: any;
  items: LaybyItem[];
  payments: LaybyPayment[];
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
  defaultLocationId?: string | null;
  assignedLocationIds?: string[];
  idNumber?: string;
  payRate?: number;
  payType?: 'hourly' | 'salary';
  accumulatedLeave?: number;
  walletBalance?: number;
  walletBalanceDelta?: number;
  discountPercent?: number;
  twoFactorEnabled?: boolean;
  twoFactorEligible?: boolean;
  twoFactorConfirmedAt?: any;
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

export interface StaffShift {
  id: string;
  tenantId?: string;
  staffId: string;
  staffName: string;
  role?: string | null;
  shiftDate: any;
  startAt: any;
  endAt: any;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  locationId?: string | null;
  breakMinutesPlanned: number;
  notes?: string | null;
  publishedAt?: any;
  publishedBy?: string | null;
  publishedByName?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export interface StaffAttendance {
  id: string;
  tenantId?: string;
  staffId: string;
  staffName: string;
  shiftId?: string | null;
  status: 'open' | 'closed';
  clockInAt: any;
  clockOutAt?: any;
  breakStartedAt?: any;
  breakMinutes: number;
  scheduledMinutes: number;
  workedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  payRate: number;
  payType: 'hourly' | 'salary';
  payrollAmount: number;
  note?: string | null;
  shiftDate?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface StaffAttendanceStatus {
  openAttendance: StaffAttendance | null;
  recentAttendance: StaffAttendance[];
}

export interface StaffTimesheetReport {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  filename: string;
  mimeType: string;
  summary: {
    staffCount: number;
    entryCount: number;
    workedMinutes: number;
    regularMinutes: number;
    overtimeMinutes: number;
    breakMinutes: number;
    payrollAmount: number;
  };
  staffTotals: Array<{
    staffId: string;
    staffName: string;
    workedMinutes: number;
    regularMinutes: number;
    overtimeMinutes: number;
    breakMinutes: number;
    payrollAmount: number;
    shiftCount: number;
  }>;
  entries: StaffAttendance[];
  csv: string;
}

export interface StaffCoachingNote {
  id: string;
  staffId: string;
  staffName: string;
  noteType: 'coaching' | 'recognition' | 'warning' | 'follow_up';
  title: string;
  note: string;
  source: 'manager' | 'ai' | 'performance' | string;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
}

export interface StaffPerformanceReport {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  filename: string;
  mimeType: string;
  summary: {
    staffCount: number;
    completedSales: number;
    salesRevenue: number;
    refundCount: number;
    voidCount: number;
    tableTurns: number;
    workstationItems: number;
    coachingNoteCount: number;
    insightCount: number;
  };
  staffPerformance: Array<{
    staffId: string;
    staffName: string;
    role: string;
    status: string;
    sales: {
      completedCount: number;
      revenue: number;
      averageBasket: number;
      tipAmount: number;
      salesPerShift: number;
    };
    exceptions: {
      refundCount: number;
      refundAmount: number;
      voidCount: number;
      voidAmount: number;
      refundVoidRate: number;
      topReasons: Array<{ reason: string; count: number }>;
    };
    tableTurnover: {
      tableSaleCount: number;
      revenue: number;
      averageCheck: number;
      averageDurationMinutes: number;
      openTabCount: number;
    };
    prepTime: {
      itemCount: number;
      averageAcceptSeconds: number;
      averagePrepSeconds: number;
      averageHandoffSeconds: number;
      averageTotalSeconds: number;
      stalePrepCount: number;
    };
    coachingHistory: StaffCoachingNote[];
    exceptionInsights: Array<{
      severity: 'success' | 'info' | 'warning' | 'critical' | string;
      title: string;
      detail: string;
      evidence: string[];
    }>;
    aiScore?: {
      score: number;
      grade: string;
      strengths: string[];
      coachingNotes: string[];
      badges: string[];
      riskFlags: string[];
      source?: string;
      createdAt?: any;
      periodStart?: any;
      periodEnd?: any;
    } | null;
  }>;
  csv: string;
}

export interface TipPoolRule {
  id: string;
  tenantId?: string;
  name: string;
  status: 'active' | 'inactive';
  distributionMethod: 'worked_hours' | 'equal_shift' | 'role_weighted';
  source: 'sale_tips';
  includedRoles: string[];
  roleWeights: Record<string, number>;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export interface TipPoolEntry {
  attendanceId: string;
  staffId: string;
  staffName: string;
  role: string;
  shiftId?: string | null;
  shiftDate: any;
  workedMinutes: number;
  weight: number;
  tipPoolAmount: number;
  payoutAmount: number;
  payoutId?: string | null;
  status?: string | null;
}

export interface TipPoolReport {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  rule: TipPoolRule;
  generated: boolean;
  filename: string;
  mimeType: string;
  summary: {
    poolAmount: number;
    saleTipCount: number;
    participantCount: number;
    shiftCount: number;
    workedMinutes: number;
    payoutAmount: number;
  };
  staffTotals: Array<{
    staffId: string;
    staffName: string;
    role: string;
    shiftCount: number;
    workedMinutes: number;
    weight: number;
    payoutAmount: number;
  }>;
  entries: TipPoolEntry[];
  csv: string;
}

export type CustomerConsentType =
  | 'loyalty'
  | 'marketing'
  | 'customer_portal'
  | 'stored_contact_details'
  | 'promotions'
  | 'ai_recommendations';

export type CustomerConsentStatus = 'unknown' | 'granted' | 'denied' | 'revoked';

export interface CustomerConsentRecord {
  consentType: CustomerConsentType;
  status: CustomerConsentStatus;
  source?: string | null;
  note?: string | null;
  capturedBy?: string | null;
  capturedByName?: string | null;
  capturedAt?: any;
  expiresAt?: any;
  updatedAt?: any;
}

export type CustomerConsentMap = Record<CustomerConsentType, CustomerConsentRecord>;

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
  loyaltyMemberStatus?: 'active' | 'paused' | 'opted_out';
  loyaltyTierId?: string | null;
  membershipCardId?: string | null;
  membershipBarcode?: string | null;
  membershipStartedAt?: any;
  /** Customer wallet balance (for refunds, credits, etc.) */
  walletBalance?: number;
  /** Customer account credit switch and balances */
  accountEnabled?: boolean;
  accountLimit?: number;
  accountBalance?: number;
  accountBalanceDelta?: number;
  /** Firebase Auth UID if the customer has a portal account */
  uid?: string;
  isAnonymized?: boolean;
  anonymizedAt?: any;
  anonymizedBy?: string | null;
  anonymizedByName?: string | null;
  anonymizationReason?: string | null;
  profileType?: 'customer' | 'staff';
  staffId?: string;
  staffRole?: Staff['role'];
  discountPercent?: number;
  consents?: Partial<Record<CustomerConsentType, Partial<CustomerConsentRecord>>>;
  createdAt?: any;
  updatedAt?: any;
}

export interface CustomerCampaignRow {
  customerId: string;
  name: string;
  email: string;
  phone: string;
  preferredChannel: 'email' | 'sms' | 'none';
  contactable: boolean;
  primarySegment: string;
  segmentTags: string[];
  campaignHint: string;
  totalSpend: number;
  orderCount: number;
  averageOrderValue: number;
  firstPurchaseAt?: any;
  lastPurchaseAt?: any;
  daysSinceLastPurchase?: number | null;
  loyaltyPoints: number;
  loyaltyMemberStatus: Customer['loyaltyMemberStatus'] | string;
  accountBalance: number;
  walletBalance: number;
  discountPercent: number;
  createdAt?: any;
  loyaltyConsentStatus: CustomerConsentStatus;
  marketingConsentStatus: CustomerConsentStatus;
  customerPortalConsentStatus: CustomerConsentStatus;
  storedContactDetailsConsentStatus: CustomerConsentStatus;
  promotionsConsentStatus: CustomerConsentStatus;
  aiRecommendationsConsentStatus: CustomerConsentStatus;
  campaignEligible: boolean;
}

export interface CustomerCampaignExport {
  generatedAt: string;
  filename: string;
  mimeType: string;
  segment: string;
  count: number;
  totalCustomers: number;
  contactableCount: number;
  campaignReadyCount: number;
  summary: Array<{ segment: string; count: number }>;
  rows: CustomerCampaignRow[];
  csv: string;
  consentNote: string;
}

export interface CustomerDataExport {
  generatedAt: string;
  tenantId: string;
  customerId: string;
  exportType: 'customer_data';
  filename: string;
  mimeType: string;
  fileContents: string;
  summary: {
    saleCount: number;
    completedSaleCount: number;
    refundCount: number;
    completedSalesTotal: number;
    refundsTotal: number;
    walletBalance: number;
    accountEnabled: boolean;
    accountBalance: number;
    payoutRequestCount: number;
    laybyCount: number;
    consentStatuses: Record<CustomerConsentType, CustomerConsentStatus>;
  };
  data: {
    profile: Customer;
    consents: CustomerConsentMap;
    sales: Array<Record<string, any>>;
    payoutRequests: Array<Record<string, any>>;
    laybys: Array<Record<string, any>>;
  };
}

export interface LoyaltyTier {
  id: string;
  tenantId?: string;
  name: string;
  status: 'active' | 'inactive';
  minPoints: number;
  earnMultiplier: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface LoyaltyRewardRule {
  id: string;
  tenantId?: string;
  name: string;
  status: 'active' | 'inactive';
  ruleType: 'base' | 'category' | 'product' | 'time_window';
  pointsPerCurrency: number;
  multiplier: number;
  bonusPoints: number;
  minSubtotal: number;
  startsAt?: any;
  endsAt?: any;
  targetProductIds: string[];
  targetCategories: string[];
  daysOfWeek: number[];
  createdAt?: any;
  updatedAt?: any;
}

export interface LoyaltyAwardResult {
  enabled: boolean;
  customerFound: boolean;
  memberStatus: Customer['loyaltyMemberStatus'] | null;
  previousPoints: number;
  pointsRedeemed: number;
  pointsEarned: number;
  nextPoints: number;
  tier: LoyaltyTier | null;
  matchedRules: Array<{ id: string; name: string; points: number }>;
  reason?: string;
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
  retentionPolicy?: RetentionPolicy;
  /** URL slug for the business profile page e.g. "yebo_apps" */
  slug?: string;
}

export interface RetentionPolicy {
  customerNotesDays: number;
  messagesDays: number;
  deviceMetadataDays: number;
  auditLogsDays: number;
  lastAppliedAt?: any;
  lastAppliedBy?: string | null;
  lastAppliedByName?: string | null;
  lastResult?: {
    customerNotesToClear: number;
    messagesToDelete: number;
    deviceMetadataRowsToDelete: number;
    auditLogsToDelete: number;
  } | null;
}

export interface RetentionPreview {
  generatedAt: string;
  policy: RetentionPolicy;
  customerNotes: { cutoff: string; count: number };
  messages: { cutoff: string; count: number };
  stalePushSubscriptions: { cutoff: string; count: number };
  staleCompanionDevices: { cutoff: string; count: number };
  auditLogs: { cutoff: string; count: number };
  summary: {
    customerNotesToClear: number;
    messagesToDelete: number;
    deviceMetadataRowsToDelete: number;
    auditLogsToDelete: number;
  };
}

export interface RetentionApplyResult extends RetentionPreview {
  appliedAt: string;
  appliedBy?: string | null;
  appliedByName?: string | null;
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
  locationId?: string | null;
  quantity: number;
  expectedPrice: number;
  sourceRecommendationId?: string | null;
  receivedQuantity?: number;
  receivedPrice?: number;
  varianceQuantity?: number;
  receivedAt?: any;
  receivedBy?: string | null;
  receivedByName?: string | null;
  receivingNote?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: any;
  expiryDate?: any;
  batchNumber?: string | null;
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
  invoiceNumber?: string | null;
  invoiceDate?: any;
  receivedAt?: any;
  receivedBy?: string | null;
  receivedByName?: string | null;
  receivingNote?: string | null;
  receivedTotalAmount?: number;
}

export interface EventBooking {
  id: string;
  tenantId?: string;
  customerId?: string | null;
  customerName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  title: string;
  eventType: 'private' | 'public' | 'restaurant' | 'catering' | 'other';
  status: 'inquiry' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  startAt: any;
  endAt?: any;
  guestCount: number;
  tableNumbers: string[];
  tableIds?: string[];
  depositAmount: number;
  depositStatus: 'none' | 'unpaid' | 'paid' | 'refunded';
  depositDueAt?: any;
  depositPaidAt?: any;
  depositReference?: string | null;
  menuNotes?: string | null;
  internalNotes?: string | null;
  reminderAt?: any;
  reminderStatus?: 'none' | 'pending' | 'sent' | 'failed' | 'skipped';
  reminderSentAt?: any;
  reminderNote?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
  updatedAt?: any;
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
  type: 'opening_float' | 'cash_sale' | 'refund' | 'cash_drop' | 'cash_added' | 'cash_removed' | 'cash_out' | 'tip' | 'manager_adjustment' | 'no_sale' | 'wallet_cash_in' | 'wallet_cash_out';
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

export type ManagerCashMovementType =
  | 'safe_drop'
  | 'cash_added'
  | 'petty_cash'
  | 'payout'
  | 'wallet_cash_in'
  | 'wallet_cash_out'
  | 'register_close'
  | 'manager_adjustment'
  | 'transfer';

export interface ManagerCashMovement {
  id: string;
  tenantId: string;
  movementType: ManagerCashMovementType;
  direction: 'in' | 'out' | 'neutral';
  amount: number;
  cashSessionId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  sourceType?: string | null;
  cashSource?: string | null;
  referenceId?: string | null;
  category?: string | null;
  note?: string | null;
  receiptAttachmentUrl?: string | null;
  receiptAttachmentName?: string | null;
  countedBreakdown?: Record<string, number>;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: any;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: any;
}

export type CashCustodyTransferPartyType = 'register' | 'staff' | 'manager_float' | 'safe' | 'petty_cash';
export type CashCustodyTransferStatus = 'pending_confirmation' | 'confirmed' | 'cancelled';

export interface CashCustodyTransfer {
  id: string;
  tenantId: string;
  status: CashCustodyTransferStatus;
  fromType: CashCustodyTransferPartyType;
  fromId?: string | null;
  fromName?: string | null;
  toType: CashCustodyTransferPartyType;
  toId?: string | null;
  toName?: string | null;
  cashSessionId?: string | null;
  expectedAmount: number;
  countedAmount: number;
  variance: number;
  countedBreakdown?: Record<string, number>;
  note?: string | null;
  requestedBy?: string | null;
  requestedByName?: string | null;
  confirmedBy?: string | null;
  confirmedByName?: string | null;
  cancelledBy?: string | null;
  cancelledByName?: string | null;
  cancelReason?: string | null;
  requestedAt?: any;
  confirmedAt?: any;
  cancelledAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface ManagerCashSummary {
  managerFloat: number;
  openRegisterCash: number;
  openRegisterCount: number;
  pendingCashUpCash: number;
  pendingCashUpCount: number;
  totalPhysicalCash: number;
  walletLiability: number;
  staffWalletLiability: number;
  customerWalletLiability: number;
  pendingPayouts: number;
  availableAfterWalletLiability: number;
  safeDropsToday: number;
  cashUpsToManagerToday: number;
  pettyCashToday: number;
  walletCashToday: number;
  pendingCustodyTransfers: number;
  custodyTransfersToday: number;
  custodyVarianceToday: number;
  recentMovements: ManagerCashMovement[];
  generatedAt: string;
}

export type CashCloseStatus = 'balanced' | 'review_needed';

export interface CashCloseUnresolvedItem {
  type: 'open_register' | 'pending_cash_up' | 'pending_handover' | string;
  id: string;
  label: string;
  amount?: number;
  variance?: number;
}

export interface CashCloseCheckpoint {
  id: string;
  tenantId: string;
  businessDate: string;
  status: CashCloseStatus;
  expectedPhysicalCash: number;
  countedPhysicalCash: number;
  variance: number;
  managerFloat: number;
  openRegisterCash: number;
  pendingCashUpCash: number;
  walletLiability: number;
  pendingPayouts: number;
  pettyCashToday: number;
  walletCashInToday: number;
  walletCashOutToday: number;
  custodyPendingCount: number;
  custodyVarianceToday: number;
  unresolvedItems: CashCloseUnresolvedItem[];
  countedBreakdown?: Record<string, number>;
  note?: string | null;
  closedBy?: string | null;
  closedByName?: string | null;
  closedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface CashClosePreview {
  businessDate: string;
  expectedPhysicalCash: number;
  managerFloat: number;
  openRegisterCash: number;
  openRegisterCount: number;
  pendingCashUpCash: number;
  pendingCashUpCount: number;
  walletLiability: number;
  pendingPayouts: number;
  availableAfterWalletLiability: number;
  safeDropsToday: number;
  cashUpsToManagerToday: number;
  pettyCashToday: number;
  walletCashInToday: number;
  walletCashOutToday: number;
  walletCashNetToday: number;
  transferInToday: number;
  transferOutToday: number;
  custodyPendingCount: number;
  custodyVarianceToday: number;
  unresolvedItems: CashCloseUnresolvedItem[];
  latestClose?: CashCloseCheckpoint | null;
  generatedAt: string;
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
  oldestActiveAt?: any;
  oldestAgeSeconds: number;
  oldestActiveAgeSeconds: number;
  activeMedianAgeSeconds: number;
  activeP90AgeSeconds: number;
  staleTimerCount: number;
  unclosedHandoffCount: number;
  avgAcceptSecondsLast2h: number;
  avgPrepSecondsLast2h: number;
  avgHandoffSecondsLast2h: number;
  avgTotalSecondsLast2h: number;
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
  dashboardKpis?: {
    generatedAt: string;
    realTimeSales: {
      todayCount: number;
      todayRevenue: number;
      lastHourCount: number;
      lastHourRevenue: number;
      activeOrdersCount: number;
    };
    averageBasket: {
      todayAverage: number;
      lastHourAverage: number;
    };
    tableTurnover: {
      activeTableCount: number;
      servedTableCount: number;
      tableSaleCount: number;
      turnoverPerTable: number;
    };
    openTabs: {
      count: number;
      totalValue: number;
      oldestAgeMinutes: number;
    };
    cashVariance: {
      sessionCount: number;
      unresolvedCount: number;
      netVariance: number;
      absoluteVariance: number;
    };
    lowStock: {
      count: number;
      criticalCount: number;
      rows: Array<{
        productId: string;
        productName: string;
        category: string;
        stock: number;
        minStock: number;
      }>;
    };
    activeStaff: {
      activeCount: number;
      openRegisterCount: number;
      activeOrderStaffCount: number;
    };
  };
  retail: {
    openRegisterCount: number;
    registers: LiveRegisterStats[];
  };
  totals: LiveTotals;
  restaurant: LiveRestaurantStats | null;
}

// ── Inventory Expansion ────────────────────────────────────────────────────────

export type AiRole = 'admin' | 'manager' | 'dev' | 'cashier' | 'chef';
export type AiInsightCategory = 'sales' | 'stock' | 'cash' | 'staff' | 'restaurant' | 'customer' | 'package' | 'integration';
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
  runId?: string;
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
  runId?: string;
  alreadyCompleted?: boolean;
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
  yieldQuantity?: number;
  wastePercent?: number;
  substituteGroup?: string | null;
  substituteRank?: number;
  isOptional?: boolean;
  bulkItemName?: string; // transient
  unit?: string; // transient
  costPerUnit?: number; // transient
  availableStock?: number; // transient
  effectiveQuantity?: number; // transient
  lineCost?: number; // transient
}

export interface RecipeCostingLine {
  bulkItemId: string;
  bulkItemName: string;
  unit: string;
  quantity: number;
  yieldQuantity: number;
  wastePercent: number;
  effectiveQuantity: number;
  costPerUnit: number;
  lineCost: number;
  substituteGroup?: string | null;
  substituteRank: number;
  isOptional: boolean;
  costed: boolean;
}

export interface RecipeCostingProductRow {
  productId: string;
  productName: string;
  category?: string | null;
  section?: string | null;
  sellingPrice: number;
  productCost: number;
  recipeCost: number;
  expectedUnitCost: number;
  grossProfit: number;
  grossMarginPercent: number;
  ingredientCount: number;
  substituteGroupCount: number;
  optionalCount: number;
  lines: RecipeCostingLine[];
}

export interface RecipeCostingReport {
  generatedAt: string;
  summary: {
    productCount: number;
    recipeProductCount: number;
    avgGrossMarginPercent: number;
    lowMarginCount: number;
    substitutionGroupCount: number;
    optionalIngredientCount: number;
  };
  rows: RecipeCostingProductRow[];
  csv: string;
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
