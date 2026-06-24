import { getConnection } from "./db.js";
import { getHostedPackage } from "../shared/packageCatalog.js";
export type DemoSeedMode = "retail" | "restaurant";
type ProductSeed = {
  id: string;
  name: string;
  price: number;
  costPrice: number;
  section: string;
  category: string;
  subCategory: string;
  stock: number;
  minStock: number;
  barcode: string;
  workstationId?: string | null;
  recipe?: Array<[string, number]>;
};
type StaffSeed = {
  id: string;
  name: string;
  role: "admin" | "cashier" | "manager" | "chef";
  email: string;
  phone: string;
  payRate: number;
  payType: "hourly" | "salary";
  assignedSections: string[];
  assignedCategories: string[];
  permissions: Record<string, boolean>;
  discountPercent: number;
  rank: string;
};
type CustomerSeed = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  loyaltyPoints: number;
  walletBalance: number;
  accountEnabled: boolean;
  accountLimit: number;
  accountBalance: number;
  discountPercent: number;
};
type SaleDraft = {
  id: string;
  customerId: string | null;
  userId: string | null;
  staffId: string;
  total: number;
  subtotal: number;
  taxAmount: number;
  paymentMethod:
    | "cash"
    | "payfast"
    | "card"
    | "wallet"
    | "account"
    | "qr"
    | "bnpl"
    | "pending";
  tenderedAmount: number;
  changeAmount: number;
  tipAmount: number;
  cashOutAmount: number;
  pointsDiscount: number;
  status: "pending" | "completed" | "failed" | "open" | "kitchen";
  transactionType: "sale" | "refund" | "void";
  parentSaleId: string | null;
  refundStatus: "none" | "partial" | "full";
  refundedAmount: number;
  refundReason: string | null;
  refundedBy: string | null;
  voidReason: string | null;
  voidedBy: string | null;
  tableNumber: string | null;
  isTab: boolean;
  tabName: string | null;
  offlineEventId: string | null;
  syncSource: "online" | "offline" | "manual";
  createdAt: string;
  updatedAt: string;
  items: SaleItemDraft[];
  payments: PaymentDraft[];
};
type SaleItemDraft = {
  id: string;
  saleId: string;
  productId: string | null;
  productName: string;
  price: number;
  quantity: number;
  status: "pending" | "accepted" | "ready" | "delivered";
  workstationId: string | null;
  orderedAt: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  actionStaffId: string | null;
  createdAt: string;
  updatedAt: string;
};
type PaymentDraft = {
  id: string;
  saleId: string;
  method: "cash" | "payfast" | "card" | "wallet" | "account" | "qr" | "bnpl";
  amount: number;
  tenderedAmount: number;
  changeAmount: number;
  tipAmount: number;
  cashOutAmount: number;
  provider?: string | null;
  providerDeviceId?: string | null;
  providerReference?: string | null;
  authorizationCode?: string | null;
  providerStatus?: string | null;
  providerNote?: string | null;
  qrPayload?: string | null;
  createdAt: string;
  updatedAt: string;
};
type SessionDraft = {
  id: string;
  tenantId: string;
  staffId: string;
  staffName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  accumulatedTips: number;
  netTips: number;
  status: "open" | "closed";
  reviewStatus:
    | "in_progress"
    | "submitted"
    | "reviewed"
    | "reconciled"
    | "disputed";
  note: string;
  managerNote: string | null;
  varianceReason: string | null;
  stats: {
    cashSales: number;
    tips: number;
    cashOut: number;
    refunds: number;
    cardSales: number;
    saleCount: number;
  };
};
type AuditEventDraft = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  relatedSaleId: string | null;
  staffId: string | null;
  staffName: string | null;
  customerId: string | null;
  source: string;
  details: Record<string, unknown>;
  createdAt: string;
};
const TAX_RATE = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEMO_START_DAYS_AGO = 364;
const PASSWORD_HASH_PLACEHOLDER =
  "$2b$10$cllz1VjHJl97oeAyzvZWsOpYd66l7kaOXG977GZ6yDT6C58SgMf9S";
const DEMO_PACKAGE = getHostedPackage("business");
const RETAIL_CATEGORIES = {
  Retail: {
    Electronics: ["Mobile", "Audio", "Accessories", "Computing"],
    Groceries: ["Dairy", "Bakery", "Produce", "Pantry", "Household"],
    Clothing: ["Men", "Women", "Kids", "Footwear"],
    "Home Decor": ["Kitchenware", "Lighting", "Textiles"],
  },
  Service: {
    Consultation: ["In Store", "Remote"],
    Repair: ["Mobile", "Computer", "Small Appliance"],
  },
};
const RESTAURANT_CATEGORIES = {
  Bar: {
    Beer: ["Single", "Case", "Draught"],
    Spirits: ["Single", "Bottle", "Case"],
    Wine: ["Glass", "Bottle"],
    Cocktails: ["Classic", "House"],
  },
  Kitchen: {
    Burgers: ["Beef", "Chicken", "Vegetarian"],
    Mains: ["Grill", "Seafood", "Pasta"],
    Sides: ["Chips", "Salad"],
    Breakfast: ["Hot Breakfast", "Cafe"],
  },
};
const LEGACY_SAMPLE_PRODUCTS = [
  ["Coffee", "123456", "Beverages", "Food & Beverage"],
  ["Soda", "223344", "Beverages", "Food & Beverage"],
  ["Chips", "556677", "Snacks", "Food & Beverage"],
  ["Chocolate", "889900", "Snacks", "Food & Beverage"],
  ["Headphones", "112233", "Electronics", "Retail"],
  ["Milk", "445566", "Groceries", "Retail"],
  ["Bread", "778899", "Groceries", "Retail"],
];
const retailProducts: ProductSeed[] = [
  product(
    "demo_prod_retail_phone",
    "Smartphone A14",
    3499,
    2750,
    "Retail",
    "Electronics",
    "Mobile",
    48,
    8,
    "DEMO-RET-001",
  ),
  product(
    "demo_prod_retail_earbuds",
    "Wireless Earbuds",
    699,
    420,
    "Retail",
    "Electronics",
    "Audio",
    78,
    16,
    "DEMO-RET-002",
  ),
  product(
    "demo_prod_retail_charger",
    "USB-C Fast Charger",
    249,
    110,
    "Retail",
    "Electronics",
    "Accessories",
    136,
    24,
    "DEMO-RET-003",
  ),
  product(
    "demo_prod_retail_keyboard",
    "Bluetooth Keyboard",
    499,
    290,
    "Retail",
    "Electronics",
    "Computing",
    34,
    8,
    "DEMO-RET-004",
  ),
  product(
    "demo_prod_retail_milk",
    "Full Cream Milk 2L",
    34,
    24,
    "Retail",
    "Groceries",
    "Dairy",
    96,
    22,
    "DEMO-RET-005",
  ),
  product(
    "demo_prod_retail_bread",
    "Brown Bread Loaf",
    18,
    12,
    "Retail",
    "Groceries",
    "Bakery",
    104,
    24,
    "DEMO-RET-006",
  ),
  product(
    "demo_prod_retail_apples",
    "Apples 1kg Bag",
    29,
    18,
    "Retail",
    "Groceries",
    "Produce",
    58,
    16,
    "DEMO-RET-007",
  ),
  product(
    "demo_prod_retail_rice",
    "Rice 2kg",
    46,
    32,
    "Retail",
    "Groceries",
    "Pantry",
    122,
    20,
    "DEMO-RET-008",
  ),
  product(
    "demo_prod_retail_detergent",
    "Laundry Detergent 1kg",
    79,
    53,
    "Retail",
    "Groceries",
    "Household",
    66,
    14,
    "DEMO-RET-009",
  ),
  product(
    "demo_prod_retail_tshirt",
    "Plain T-Shirt",
    129,
    66,
    "Retail",
    "Clothing",
    "Men",
    84,
    18,
    "DEMO-RET-010",
  ),
  product(
    "demo_prod_retail_dress",
    "Summer Dress",
    299,
    160,
    "Retail",
    "Clothing",
    "Women",
    36,
    9,
    "DEMO-RET-011",
  ),
  product(
    "demo_prod_retail_sneakers",
    "Canvas Sneakers",
    399,
    245,
    "Retail",
    "Clothing",
    "Footwear",
    44,
    10,
    "DEMO-RET-012",
  ),
  product(
    "demo_prod_retail_mug",
    "Ceramic Mug Set",
    149,
    78,
    "Retail",
    "Home Decor",
    "Kitchenware",
    42,
    8,
    "DEMO-RET-013",
  ),
  product(
    "demo_prod_retail_lamp",
    "Desk Lamp",
    259,
    150,
    "Retail",
    "Home Decor",
    "Lighting",
    25,
    6,
    "DEMO-RET-014",
  ),
  product(
    "demo_prod_retail_repair",
    "Phone Screen Repair",
    899,
    520,
    "Service",
    "Repair",
    "Mobile",
    999,
    0,
    "DEMO-RET-015",
  ),
  product(
    "demo_prod_retail_consult",
    "Device Setup Consultation",
    349,
    110,
    "Service",
    "Consultation",
    "In Store",
    999,
    0,
    "DEMO-RET-016",
  ),
];
const workstations = [
  ["demo_ws_bar", "Demo Bar", "bar"],
  ["demo_ws_kitchen", "Demo Kitchen", "kitchen"],
  ["demo_ws_pass", "Demo Pass", "other"],
] as const;
const bulkItems = [
  [
    "demo_bulk_brandy_ml",
    "House Brandy Pour Stock",
    "single",
    "ml",
    18000,
    3000,
    0.18,
    "DEMO-BULK-BRANDY-ML",
    null,
    1,
    "ml",
  ],
  [
    "demo_bulk_brandy_bottle",
    "House Brandy 750ml Bottle",
    "single",
    "bottles",
    18,
    4,
    135,
    "DEMO-BULK-BRANDY-BOTTLE",
    null,
    1,
    "bottle",
  ],
  [
    "demo_bulk_brandy_case",
    "House Brandy Case",
    "bulk",
    "cases",
    3,
    1,
    1440,
    "DEMO-BULK-BRANDY-CASE",
    "Case",
    12,
    "bottle",
  ],
  [
    "demo_bulk_beer_bottle",
    "Lager Bottle 330ml",
    "single",
    "bottles",
    96,
    24,
    9,
    "DEMO-BULK-BEER-BOTTLE",
    null,
    1,
    "bottle",
  ],
  [
    "demo_bulk_beer_case",
    "Lager Case",
    "bulk",
    "cases",
    6,
    2,
    205,
    "DEMO-BULK-BEER-CASE",
    "Case",
    24,
    "bottle",
  ],
  [
    "demo_bulk_draught_lager",
    "Draught Lager Keg",
    "single",
    "ml",
    30000,
    5000,
    0.035,
    "DEMO-BULK-DRAUGHT",
    null,
    1,
    "ml",
  ],
  [
    "demo_bulk_red_wine_ml",
    "House Red Wine",
    "single",
    "ml",
    9000,
    1500,
    0.12,
    "DEMO-BULK-WINE-RED",
    null,
    1,
    "ml",
  ],
  [
    "demo_bulk_gin_ml",
    "House Gin",
    "single",
    "ml",
    6000,
    1000,
    0.16,
    "DEMO-BULK-GIN",
    null,
    1,
    "ml",
  ],
  [
    "demo_bulk_tonic_can",
    "Tonic Water Can",
    "single",
    "cans",
    48,
    12,
    7,
    "DEMO-BULK-TONIC",
    null,
    1,
    "can",
  ],
  [
    "demo_bulk_buns",
    "Burger Buns",
    "single",
    "items",
    60,
    12,
    3.5,
    "DEMO-BULK-BUNS",
    null,
    1,
    "bun",
  ],
  [
    "demo_bulk_beef_patties",
    "Beef Patties",
    "single",
    "items",
    45,
    10,
    14,
    "DEMO-BULK-BEEF",
    null,
    1,
    "patty",
  ],
  [
    "demo_bulk_chicken_fillets",
    "Chicken Fillets",
    "single",
    "items",
    36,
    8,
    12,
    "DEMO-BULK-CHICKEN",
    null,
    1,
    "fillet",
  ],
  [
    "demo_bulk_cheese",
    "Cheese Slices",
    "single",
    "items",
    100,
    20,
    2.2,
    "DEMO-BULK-CHEESE",
    null,
    1,
    "slice",
  ],
  [
    "demo_bulk_chips_kg",
    "Frozen Chips",
    "single",
    "kg",
    25,
    5,
    32,
    "DEMO-BULK-CHIPS",
    null,
    1,
    "kg",
  ],
  [
    "demo_bulk_steak",
    "Sirloin Steak 250g",
    "single",
    "items",
    24,
    6,
    46,
    "DEMO-BULK-STEAK",
    null,
    1,
    "steak",
  ],
  [
    "demo_bulk_coffee_g",
    "Coffee Beans",
    "single",
    "g",
    5000,
    800,
    0.22,
    "DEMO-BULK-COFFEE",
    null,
    1,
    "g",
  ],
  [
    "demo_bulk_milk_ml",
    "Barista Milk",
    "single",
    "ml",
    12000,
    2000,
    0.018,
    "DEMO-BULK-MILK",
    null,
    1,
    "ml",
  ],
  [
    "demo_bulk_eggs",
    "Large Eggs",
    "single",
    "items",
    90,
    18,
    2.5,
    "DEMO-BULK-EGGS",
    null,
    1,
    "egg",
  ],
  [
    "demo_bulk_bacon",
    "Bacon Rashers",
    "single",
    "items",
    80,
    16,
    3.8,
    "DEMO-BULK-BACON",
    null,
    1,
    "rasher",
  ],
] as const;
const restaurantProducts: ProductSeed[] = [
  product(
    "demo_prod_lager_single",
    "Lager Bottle 330ml",
    28,
    9,
    "Bar",
    "Beer",
    "Single",
    144,
    24,
    "DEMO-BAR-001",
    "demo_ws_bar",
    [["demo_bulk_beer_bottle", 1]],
  ),
  product(
    "demo_prod_lager_case",
    "Lager Case 24",
    420,
    205,
    "Bar",
    "Beer",
    "Case",
    12,
    2,
    "DEMO-BAR-002",
    "demo_ws_bar",
    [["demo_bulk_beer_case", 1]],
  ),
  product(
    "demo_prod_draught_lager",
    "Draught Lager 500ml",
    42,
    17.5,
    "Bar",
    "Beer",
    "Draught",
    90,
    12,
    "DEMO-BAR-003",
    "demo_ws_bar",
    [["demo_bulk_draught_lager", 500]],
  ),
  product(
    "demo_prod_brandy_single",
    "House Brandy Single",
    32,
    9,
    "Bar",
    "Spirits",
    "Single",
    160,
    24,
    "DEMO-BAR-004",
    "demo_ws_bar",
    [["demo_bulk_brandy_ml", 50]],
  ),
  product(
    "demo_prod_brandy_bottle",
    "House Brandy Bottle",
    260,
    135,
    "Bar",
    "Spirits",
    "Bottle",
    24,
    5,
    "DEMO-BAR-005",
    "demo_ws_bar",
    [["demo_bulk_brandy_bottle", 1]],
  ),
  product(
    "demo_prod_brandy_case",
    "House Brandy Case 12",
    2850,
    1440,
    "Bar",
    "Spirits",
    "Case",
    5,
    1,
    "DEMO-BAR-006",
    "demo_ws_bar",
    [["demo_bulk_brandy_case", 1]],
  ),
  product(
    "demo_prod_red_wine_glass",
    "House Red Wine Glass",
    48,
    18,
    "Bar",
    "Wine",
    "Glass",
    72,
    10,
    "DEMO-BAR-007",
    "demo_ws_bar",
    [["demo_bulk_red_wine_ml", 150]],
  ),
  product(
    "demo_prod_gin_tonic",
    "Gin & Tonic",
    58,
    15,
    "Bar",
    "Cocktails",
    "Classic",
    72,
    10,
    "DEMO-BAR-008",
    "demo_ws_bar",
    [
      ["demo_bulk_gin_ml", 50],
      ["demo_bulk_tonic_can", 1],
    ],
  ),
  product(
    "demo_prod_cheeseburger",
    "Classic Cheeseburger",
    89,
    23.7,
    "Kitchen",
    "Burgers",
    "Beef",
    70,
    14,
    "DEMO-KIT-001",
    "demo_ws_kitchen",
    [
      ["demo_bulk_buns", 1],
      ["demo_bulk_beef_patties", 1],
      ["demo_bulk_cheese", 1],
    ],
  ),
  product(
    "demo_prod_chicken_burger",
    "Grilled Chicken Burger",
    86,
    15.5,
    "Kitchen",
    "Burgers",
    "Chicken",
    60,
    12,
    "DEMO-KIT-002",
    "demo_ws_kitchen",
    [
      ["demo_bulk_buns", 1],
      ["demo_bulk_chicken_fillets", 1],
    ],
  ),
  product(
    "demo_prod_fries",
    "Basket of Chips",
    38,
    8,
    "Kitchen",
    "Sides",
    "Chips",
    120,
    20,
    "DEMO-KIT-003",
    "demo_ws_kitchen",
    [["demo_bulk_chips_kg", 0.25]],
  ),
  product(
    "demo_prod_steak",
    "Sirloin Steak Plate",
    169,
    54,
    "Kitchen",
    "Mains",
    "Grill",
    38,
    8,
    "DEMO-KIT-004",
    "demo_ws_kitchen",
    [
      ["demo_bulk_steak", 1],
      ["demo_bulk_chips_kg", 0.25],
    ],
  ),
  product(
    "demo_prod_americano",
    "Americano",
    28,
    4.4,
    "Kitchen",
    "Breakfast",
    "Cafe",
    160,
    24,
    "DEMO-KIT-005",
    "demo_ws_kitchen",
    [["demo_bulk_coffee_g", 20]],
  ),
  product(
    "demo_prod_cappuccino",
    "Cappuccino",
    36,
    8,
    "Kitchen",
    "Breakfast",
    "Cafe",
    130,
    20,
    "DEMO-KIT-006",
    "demo_ws_kitchen",
    [
      ["demo_bulk_coffee_g", 20],
      ["demo_bulk_milk_ml", 200],
    ],
  ),
  product(
    "demo_prod_breakfast",
    "Farmhouse Breakfast",
    98,
    25.1,
    "Kitchen",
    "Breakfast",
    "Hot Breakfast",
    64,
    12,
    "DEMO-KIT-007",
    "demo_ws_kitchen",
    [
      ["demo_bulk_eggs", 2],
      ["demo_bulk_bacon", 2],
      ["demo_bulk_buns", 1],
    ],
  ),
  product(
    "demo_prod_pasta",
    "Creamy Chicken Pasta",
    128,
    38,
    "Kitchen",
    "Mains",
    "Pasta",
    48,
    10,
    "DEMO-KIT-008",
    "demo_ws_kitchen",
    [
      ["demo_bulk_chicken_fillets", 0.5],
      ["demo_bulk_milk_ml", 100],
    ],
  ),
];
function product(
  id: string,
  name: string,
  price: number,
  costPrice: number,
  section: string,
  category: string,
  subCategory: string,
  stock: number,
  minStock: number,
  barcode: string,
  workstationId?: string | null,
  recipe?: Array<[string, number]>,
): ProductSeed {
  return {
    id,
    name,
    price,
    costPrice,
    section,
    category,
    subCategory,
    stock,
    minStock,
    barcode,
    workstationId,
    recipe,
  };
}
function safeParse(value: unknown, fallback: any) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function legacyWhereClause() {
  let idx = 2; // $1 is tenant_id; legacy values start at $2
  return LEGACY_SAMPLE_PRODUCTS.map(() => {
    const clause = `(barcode = $${idx} AND name = $${idx + 1} AND category = $${idx + 2} AND COALESCE(section, '') = COALESCE($${idx + 3}, ''))`;
    idx += 4;
    return clause;
  }).join(" OR ");
}
function legacyWhereValues() {
  return LEGACY_SAMPLE_PRODUCTS.flatMap(
    ([name, barcode, category, section]) => [barcode, name, category, section],
  );
}
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}
function int(rand: () => number, min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function pick<T>(rand: () => number, values: T[]) {
  return values[
    Math.min(values.length - 1, Math.floor(rand() * values.length))
  ];
}
function pickWeighted<T>(rand: () => number, rows: Array<[T, number]>) {
  const total = rows.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = rand() * total;
  for (const [value, weight] of rows) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  return rows[rows.length - 1][0];
}
function baseDate() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}
function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
function sqlDateTime(date: Date | string | null | undefined) {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function sqlDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}
function dateAt(day: Date, hour: number, minute = 0) {
  const d = new Date(day);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}
function businessDay(dayIndex: number) {
  return addDays(baseDate(), -DEMO_START_DAYS_AGO + dayIndex);
}
function json(value: unknown) {
  return JSON.stringify(value);
}
function allPermissions(overrides: Record<string, boolean> = {}) {
  return {
    canSell: true,
    canManageCash: true,
    canViewHistory: true,
    canMessage: true,
    canUseKitchen: true,
    canManageTables: true,
    canManageTabs: true,
    canViewLive: true,
    canManageInventory: true,
    canManageCustomers: true,
    canManageStaff: true,
    canManageWallets: true,
    canViewLeaderboard: true,
    canViewReports: true,
    canAccessAi: true,
    canManageSettings: false,
    canAccessDevTools: false,
    ...overrides,
  };
}
function demoStaff(mode: DemoSeedMode): StaffSeed[] {
  const common: StaffSeed[] = [
    {
      id: "demo_staff_mgr",
      name: "Naledi Mokoena",
      role: "manager",
      email: "naledi.manager@masepos.test",
      phone: "+27 82 555 0101",
      payRate: 28500,
      payType: "salary",
      assignedSections:
        mode === "restaurant" ? ["Bar", "Kitchen"] : ["Retail", "Service"],
      assignedCategories: [],
      permissions: allPermissions({ canManageSettings: true }),
      discountPercent: 10,
      rank: "Floor Lead",
    },
    {
      id: "demo_staff_cashier_a",
      name: "Aisha Khan",
      role: "cashier",
      email: "aisha.cashier@masepos.test",
      phone: "+27 82 555 0102",
      payRate: 72,
      payType: "hourly",
      assignedSections: mode === "restaurant" ? ["Bar"] : ["Retail"],
      assignedCategories:
        mode === "restaurant"
          ? ["Beer", "Spirits", "Wine"]
          : ["Electronics", "Groceries"],
      permissions: allPermissions({
        canManageInventory: false,
        canManageStaff: false,
        canManageSettings: false,
        canAccessAi: false,
      }),
      discountPercent: 6,
      rank: "Gold",
    },
    {
      id: "demo_staff_cashier_b",
      name: "Thabo Dlamini",
      role: "cashier",
      email: "thabo.cashier@masepos.test",
      phone: "+27 82 555 0103",
      payRate: 68,
      payType: "hourly",
      assignedSections:
        mode === "restaurant" ? ["Bar", "Kitchen"] : ["Retail", "Service"],
      assignedCategories:
        mode === "restaurant"
          ? ["Burgers", "Mains", "Sides"]
          : ["Clothing", "Home Decor", "Repair"],
      permissions: allPermissions({
        canManageInventory: false,
        canManageStaff: false,
        canManageSettings: false,
        canAccessAi: false,
      }),
      discountPercent: 5,
      rank: "Silver",
    },
    {
      id: "demo_staff_cashier_c",
      name: "Mila Jacobs",
      role: "cashier",
      email: "mila.cashier@masepos.test",
      phone: "+27 82 555 0104",
      payRate: 66,
      payType: "hourly",
      assignedSections: mode === "restaurant" ? ["Kitchen"] : ["Retail"],
      assignedCategories:
        mode === "restaurant"
          ? ["Breakfast", "Cafe"]
          : ["Groceries", "Clothing"],
      permissions: allPermissions({
        canManageCash: false,
        canManageInventory: false,
        canManageStaff: false,
        canManageSettings: false,
        canAccessAi: false,
      }),
      discountPercent: 5,
      rank: "Bronze",
    },
    {
      id: "demo_staff_stock",
      name: "Johan Pretorius",
      role: "manager",
      email: "johan.stock@masepos.test",
      phone: "+27 82 555 0105",
      payRate: 92,
      payType: "hourly",
      assignedSections:
        mode === "restaurant" ? ["Bar", "Kitchen"] : ["Retail", "Service"],
      assignedCategories: [],
      permissions: allPermissions({ canManageStaff: false }),
      discountPercent: 8,
      rank: "Inventory Lead",
    },
  ];
  if (mode === "restaurant") {
    return [
      ...common,
      {
        id: "demo_staff_chef_a",
        name: "Lerato Nkosi",
        role: "chef",
        email: "lerato.chef@masepos.test",
        phone: "+27 82 555 0106",
        payRate: 88,
        payType: "hourly",
        assignedSections: ["Kitchen"],
        assignedCategories: ["Burgers", "Mains", "Sides", "Breakfast"],
        permissions: allPermissions({
          canSell: false,
          canManageCash: false,
          canManageStaff: false,
          canManageWallets: false,
          canViewReports: false,
          canAccessAi: false,
          canManageSettings: false,
        }),
        discountPercent: 8,
        rank: "Fast Pass",
      },
      {
        id: "demo_staff_chef_b",
        name: "Marco van Zyl",
        role: "chef",
        email: "marco.chef@masepos.test",
        phone: "+27 82 555 0107",
        payRate: 82,
        payType: "hourly",
        assignedSections: ["Kitchen"],
        assignedCategories: ["Burgers", "Mains", "Sides"],
        permissions: allPermissions({
          canSell: false,
          canManageCash: false,
          canManageStaff: false,
          canManageWallets: false,
          canViewReports: false,
          canAccessAi: false,
          canManageSettings: false,
        }),
        discountPercent: 8,
        rank: "Steady Hands",
      },
    ];
  }
  return common;
}
const customerNames = [
  "Sipho Ndlovu",
  "Chloe Williams",
  "Imraan Patel",
  "Zanele Khumalo",
  "Pieter Botha",
  "Lindiwe Naidoo",
  "Jade Smith",
  "Karabo Molefe",
  "Anika Meyer",
  "Sibusiso Mthembu",
  "Taryn Govender",
  "Daniel van der Merwe",
  "Nokuthula Dube",
  "Ryan Jacobs",
  "Anele Maseko",
  "Bianca Olivier",
  "Hassan Osman",
  "Kgomotso Phiri",
  "Melissa Adams",
  "Tshepo Radebe",
  "Leanne Daniels",
  "Mpho Sithole",
  "Carmen Engelbrecht",
  "Vuyo Gqola",
  "Nadia Davids",
  "Gareth Cooper",
  "Refilwe Modise",
  "Andre Steyn",
  "Monique Petersen",
  "Bongani Zulu",
  "Keagan Pillay",
  "Nandi Cele",
  "Ruan Visser",
  "Fatima Cassim",
  "Brandon September",
  "Kelebogile Tau",
  "Yusuf Mohamed",
  "Samke Hlongwane",
  "Amy Wilson",
  "Themba Shabalala",
];
function demoCustomers(mode: DemoSeedMode): CustomerSeed[] {
  return customerNames.map((name, index) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z]+/g, ".")
      .replace(/\.$/, "");
    const accountEnabled = index % 6 === 0 || index % 11 === 0;
    const walletBalance =
      index % 5 === 0 ? 120 + index * 7 : index % 7 === 0 ? 45 : 0;
    const accountBalance = accountEnabled
      ? round((index % 4) * 185 + (mode === "restaurant" ? 95 : 220))
      : 0;
    return {
      id: `demo_cust_${String(index + 1).padStart(3, "0")}`,
      name,
      email: `${slug}@demo-customer.test`,
      phone: `+27 83 555 ${String(1000 + index)}`,
      address: `${12 + index} Market Street, Johannesburg`,
      notes:
        index % 8 === 0
          ? "VIP regular; prefers account statement by email."
          : index % 9 === 0
            ? "Often uses wallet credit after refunds."
            : mode === "restaurant" && index % 4 === 0
              ? "Books tables on busy evenings."
              : "Demo customer with natural purchase history.",
      loyaltyPoints: 80 + ((index * 37) % 900),
      walletBalance,
      accountEnabled,
      accountLimit: accountEnabled ? 1500 + (index % 5) * 750 : 0,
      accountBalance,
      discountPercent: index % 10 === 0 ? 7.5 : index % 4 === 0 ? 3 : 0,
    };
  });
}
async function updateDemoConfig(
  conn: any,
  tenantId: string,
  categories: any,
  isRestaurantMode: boolean,
) {
  const [rows] = await conn.query(
    `SELECT business FROM app_settings WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
  );
  const currentBusiness = safeParse(rows[0]?.business, {});
  await conn.query(
    `UPDATE app_settings SET business = $1, categories = $2, setup_completed = 1, updated_at = NOW() WHERE tenant_id = $3`,
    [
      JSON.stringify({
        ...currentBusiness,
        name: currentBusiness.name || "MasePOS Demo",
        currency: "R",
        taxRate: TAX_RATE,
        taxName: "VAT",
        taxInclusive: true,
        packageTier: DEMO_PACKAGE.id,
        packageName: DEMO_PACKAGE.name,
        packageStatus: "active",
        maxRegisters: DEMO_PACKAGE.maxRegisters,
        maxProducts: DEMO_PACKAGE.maxProducts,
        maxStaff: DEMO_PACKAGE.maxStaff,
        maxCustomers: DEMO_PACKAGE.maxCustomers,
        enableLoyalty: true,
        pointsEarnedPerCurrency: 1,
        pointsRequiredForDiscount: 100,
        discountAmountForPoints: 10,
        roleDiscounts: { manager: 10, cashier: 5, chef: 8 },
        happyHourDiscounts: isRestaurantMode
          ? [
              {
                id: "demo_happy_hour_weekday",
                name: "Weekday Sundowner",
                enabled: true,
                discountPercent: 8,
                days: [2, 3, 4],
                startTime: "17:00",
                endTime: "18:30",
              },
              {
                id: "demo_happy_hour_late",
                name: "Late Bar Push",
                enabled: true,
                discountPercent: 5,
                days: [5, 6],
                startTime: "21:00",
                endTime: "22:00",
              },
            ]
          : [
              {
                id: "demo_payday_basket",
                name: "Payday Basket",
                enabled: true,
                discountPercent: 6,
                days: [4, 5, 6],
                startTime: "16:00",
                endTime: "19:00",
              },
            ],
        receiptFooter: "Thank you for trying the MasePOS production demo.",
        isRestaurantMode,
      }),
      JSON.stringify(categories),
      tenantId,
    ],
  );
}
async function clearSeededDemoDataWithConnection(
  conn: any,
  tenantId: string,
  resetSettings: boolean,
) {
  const legacyClause = legacyWhereClause();
  const legacyValues = legacyWhereValues();
  const auditDetailsText = "LOWER(COALESCE(details, ''))";
  await conn.query(
    `DELETE FROM ai_agent_run_steps WHERE tenant_id = $1 AND (id LIKE 'demo_%' OR run_id LIKE 'demo_%')`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM ai_agent_runs WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM ai_staff_scores WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM ai_insights WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM manager_tasks WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM messages WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM audit_events
      WHERE tenant_id = $1
        AND action = 'permission.denied'
        AND staff_id = 'demo-admin-001'
        AND (
          ${auditDetailsText} LIKE $2
          OR ${auditDetailsText} LIKE $3
          OR ${auditDetailsText} LIKE $4
        )`,
    [
      tenantId,
      "%package.feature.%",
      "%package.capacity.%",
      '%"package":"free"%',
    ],
  );
  await conn.query(
    `DELETE FROM audit_events WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM stock_movements WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM reorder_recommendations WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM stock_take_items WHERE tenant_id = $1 AND (id LIKE 'demo_%' OR session_id LIKE 'demo_%')`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM stock_take_sessions WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM stock_take_rules WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM layby_payments WHERE layby_order_id IN (SELECT id FROM layby_orders WHERE tenant_id = $1 AND id LIKE 'demo_%')`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM layby_items WHERE layby_order_id IN (SELECT id FROM layby_orders WHERE tenant_id = $1 AND id LIKE 'demo_%')`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM layby_orders WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM sale_payments WHERE sale_id IN (SELECT id FROM sales WHERE tenant_id = $1 AND id LIKE 'demo_%')`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE tenant_id = $1 AND id LIKE 'demo_%')`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM cash_movements WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM manager_cash_movements WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM cash_custody_transfers WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM cash_close_checkpoints WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM sales WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM cash_sessions WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM customer_payout_requests WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM payout_requests WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM stock_batches WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM purchase_orders WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM vendors WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM companion_device_assignments WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM restaurant_tables WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM table_sections WHERE tenant_id = $1 AND id LIKE 'demo_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM modifier_options WHERE id LIKE 'demo_%' OR modifier_id IN (SELECT id FROM product_modifiers WHERE product_id LIKE 'demo_prod_%')`,
  );
  await conn.query(
    `DELETE FROM product_modifiers WHERE id LIKE 'demo_%' OR product_id LIKE 'demo_prod_%'`,
  );
  await conn.query(
    `DELETE FROM product_recipes WHERE product_id LIKE 'demo_prod_%'`,
  );
  await conn.query(
    `DELETE FROM product_recipes WHERE product_id IN (
       SELECT id FROM products
       WHERE tenant_id = $1 AND (id LIKE 'demo_prod_%' OR barcode LIKE 'DEMO-%' OR ${legacyClause})
     )`,
    [tenantId, ...legacyValues],
  );
  await conn.query(
    `DELETE FROM products WHERE tenant_id = $1 AND (id LIKE 'demo_prod_%' OR barcode LIKE 'DEMO-%' OR ${legacyClause})`,
    [tenantId, ...legacyValues],
  );
  await conn.query(
    `DELETE FROM bulk_items WHERE tenant_id = $1 AND (id LIKE 'demo_bulk_%' OR barcode LIKE 'DEMO-BULK-%')`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM workstations WHERE tenant_id = $1 AND id LIKE 'demo_ws_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM users WHERE tenant_id = $1 AND uid LIKE 'demo_staff_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM staff WHERE tenant_id = $1 AND id LIKE 'demo_staff_%'`,
    [tenantId],
  );
  await conn.query(
    `DELETE FROM customers WHERE tenant_id = $1 AND id LIKE 'demo_cust_%'`,
    [tenantId],
  );
  if (resetSettings) {
    await updateDemoConfig(conn, tenantId, RETAIL_CATEGORIES, false);
  }
}
async function insertRows(
  conn: any,
  table: string,
  columns: string[],
  rows: any[][],
  chunkSize = 300,
) {
  if (rows.length === 0) return;
  const colCount = columns.length;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    let paramIdx = 0;
    const rowPlaceholders = chunk
      .map(() => {
        const start = paramIdx + 1;
        const placeholders = Array.from(
          { length: colCount },
          (_, j) => `$${start + j}`,
        ).join(", ");
        paramIdx += colCount;
        return `(${placeholders})`;
      })
      .join(", ");
    await conn.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${rowPlaceholders} ON CONFLICT (id) DO NOTHING`,
      chunk.flat(),
    );
  }
}
async function seedStaff(conn: any, tenantId: string, staff: StaffSeed[]) {
  const now = sqlDateTime(new Date());
  await insertRows(
    conn,
    "users",
    ["uid", "tenant_id", "email", "name", "created_at", "updated_at"],
    staff.map((s) => [s.id, tenantId, s.email, s.name, now, now]),
  );
  await insertRows(
    conn,
    "staff",
    [
      "id",
      "tenant_id",
      "name",
      "role",
      "email",
      "password_hash",
      "phone",
      "status",
      "permissions",
      "assigned_sections",
      "assigned_categories",
      "id_number",
      "pay_rate",
      "pay_type",
      "accumulated_leave",
      "wallet_balance",
      "discount_percent",
      "metrics",
      "badges",
      "rank",
      "created_at",
      "updated_at",
    ],
    staff.map((s, index) => [
      s.id,
      tenantId,
      s.name,
      s.role,
      s.email,
      PASSWORD_HASH_PLACEHOLDER,
      s.phone,
      "active",
      json(s.permissions),
      json(s.assignedSections),
      json(s.assignedCategories),
      `90010${String(index + 1).padStart(4, "0")}`,
      s.payRate,
      s.payType,
      4 + index,
      index % 3 === 0 ? 160 + index * 15 : 0,
      s.discountPercent,
      json({
        totalOrdersHandled: 0,
        totalTips: 0,
        averagePrepTimeMs: 0,
        totalSales: 0,
      }),
      json(
        index < 2
          ? ["Top Seller", "Cash Safe"]
          : index === 4
            ? ["Stock Hawk"]
            : ["On Track"],
      ),
      s.rank,
      now,
      now,
    ]),
  );
}
async function seedCustomers(
  conn: any,
  tenantId: string,
  customers: CustomerSeed[],
) {
  const now = sqlDateTime(new Date());
  await insertRows(
    conn,
    "customers",
    [
      "id",
      "tenant_id",
      "name",
      "email",
      "phone",
      "address",
      "notes",
      "loyalty_points",
      "wallet_balance",
      "account_enabled",
      "account_limit",
      "account_balance",
      "discount_percent",
      "created_at",
      "updated_at",
    ],
    customers.map((c) => [
      c.id,
      tenantId,
      c.name,
      c.email,
      c.phone,
      c.address,
      c.notes,
      c.loyaltyPoints,
      c.walletBalance,
      c.accountEnabled ? 1 : 0,
      c.accountLimit,
      c.accountBalance,
      c.discountPercent,
      now,
      now,
    ]),
  );
}
async function seedCatalog(
  conn: any,
  tenantId: string,
  mode: DemoSeedMode,
  products: ProductSeed[],
) {
  if (mode === "restaurant") {
    await insertRows(
      conn,
      "workstations",
      ["id", "tenant_id", "name", "type", "status", "created_at", "updated_at"],
      workstations.map(([id, name, type]) => [
        id,
        tenantId,
        name,
        type,
        "active",
        sqlDateTime(new Date()),
        sqlDateTime(new Date()),
      ]),
    );
    await insertRows(
      conn,
      "bulk_items",
      [
        "id",
        "tenant_id",
        "name",
        "item_type",
        "unit",
        "stock",
        "min_stock",
        "cost_per_unit",
        "barcode",
        "pack_name",
        "pack_quantity",
        "single_unit_name",
        "created_at",
        "updated_at",
      ],
      bulkItems.map((item) => [
        item[0],
        tenantId,
        item[1],
        item[2],
        item[3],
        item[4],
        item[5],
        item[6],
        item[7],
        item[8],
        item[9],
        item[10],
        sqlDateTime(new Date()),
        sqlDateTime(new Date()),
      ]),
    );
  }
  await insertRows(
    conn,
    "products",
    [
      "id",
      "tenant_id",
      "name",
      "price",
      "cost_price",
      "section",
      "category",
      "sub_category",
      "stock",
      "min_stock",
      "barcode",
      "workstation_id",
      "created_at",
      "updated_at",
    ],
    products.map((p) => [
      p.id,
      tenantId,
      p.name,
      p.price,
      p.costPrice,
      p.section,
      p.category,
      p.subCategory,
      p.stock,
      p.minStock,
      p.barcode,
      p.workstationId || null,
      sqlDateTime(new Date()),
      sqlDateTime(new Date()),
    ]),
  );
  const recipeRows = products.flatMap((p) =>
    (p.recipe || []).map(([bulkItemId, quantity]) => [
      p.id,
      bulkItemId,
      quantity,
    ]),
  );
  await insertRows(
    conn,
    "product_recipes",
    ["product_id", "bulk_item_id", "quantity"],
    recipeRows,
  );
  if (mode === "restaurant") {
    await seedRestaurantModifiers(conn);
  }
}
async function seedRestaurantModifiers(conn: any) {
  const groups = [
    [
      "demo_mod_burger_side",
      "demo_prod_cheeseburger",
      "Side Choice",
      "single",
      1,
      1,
      1,
    ],
    [
      "demo_mod_burger_extra",
      "demo_prod_cheeseburger",
      "Extras",
      "multiple",
      0,
      0,
      3,
    ],
    [
      "demo_mod_chicken_side",
      "demo_prod_chicken_burger",
      "Side Choice",
      "single",
      1,
      1,
      1,
    ],
    [
      "demo_mod_steak_temp",
      "demo_prod_steak",
      "Steak Temperature",
      "single",
      1,
      1,
      1,
    ],
    ["demo_mod_gin_tonic", "demo_prod_gin_tonic", "Mixer", "single", 1, 1, 1],
  ];
  await insertRows(
    conn,
    "product_modifiers",
    [
      "id",
      "product_id",
      "name",
      "type",
      "required",
      "min_selection",
      "max_selection",
      "created_at",
      "updated_at",
    ],
    groups.map((g) => [
      g[0],
      g[1],
      g[2],
      g[3],
      g[4],
      g[5],
      g[6],
      sqlDateTime(new Date()),
      sqlDateTime(new Date()),
    ]),
  );
  const options = [
    [
      "demo_opt_burger_fries",
      "demo_mod_burger_side",
      "Chips",
      0,
      "demo_bulk_chips_kg",
      0.25,
    ],
    [
      "demo_opt_burger_salad",
      "demo_mod_burger_side",
      "Side Salad",
      12,
      null,
      0,
    ],
    [
      "demo_opt_burger_cheese",
      "demo_mod_burger_extra",
      "Extra Cheese",
      9,
      "demo_bulk_cheese",
      1,
    ],
    [
      "demo_opt_burger_bacon",
      "demo_mod_burger_extra",
      "Bacon",
      18,
      "demo_bulk_bacon",
      2,
    ],
    [
      "demo_opt_chicken_fries",
      "demo_mod_chicken_side",
      "Chips",
      0,
      "demo_bulk_chips_kg",
      0.25,
    ],
    [
      "demo_opt_chicken_salad",
      "demo_mod_chicken_side",
      "Side Salad",
      12,
      null,
      0,
    ],
    [
      "demo_opt_steak_medrare",
      "demo_mod_steak_temp",
      "Medium Rare",
      0,
      null,
      0,
    ],
    ["demo_opt_steak_medium", "demo_mod_steak_temp", "Medium", 0, null, 0],
    [
      "demo_opt_gin_tonic",
      "demo_mod_gin_tonic",
      "Tonic",
      0,
      "demo_bulk_tonic_can",
      1,
    ],
    ["demo_opt_gin_soda", "demo_mod_gin_tonic", "Soda Water", 0, null, 0],
  ];
  await insertRows(
    conn,
    "modifier_options",
    [
      "id",
      "modifier_id",
      "name",
      "price_extra",
      "bulk_item_id",
      "bulk_quantity",
      "created_at",
      "updated_at",
    ],
    options.map((o) => [
      o[0],
      o[1],
      o[2],
      o[3],
      o[4],
      o[5],
      sqlDateTime(new Date()),
      sqlDateTime(new Date()),
    ]),
  );
}
function demandMultiplier(mode: DemoSeedMode, day: Date, rand: () => number) {
  const dow = day.getUTCDay();
  const month = day.getUTCMonth();
  const date = day.getUTCDate();
  const retail = [0.55, 0.72, 0.82, 0.92, 1.08, 1.42, 0.88][dow];
  const restaurant = [0.62, 0.48, 0.56, 0.78, 1.12, 1.82, 1.58][dow];
  let m = mode === "restaurant" ? restaurant : retail;
  if (date >= 25 || date <= 2) m *= mode === "restaurant" ? 1.18 : 1.28;
  if (month === 11) m *= mode === "restaurant" ? 1.35 : 1.55;
  if (mode === "retail" && month === 0 && date <= 15) m *= 1.3;
  if (mode === "restaurant" && [10, 11, 0].includes(month)) m *= 1.12;
  if (dow === 1 && rand() < 0.12) m *= 0.45;
  if (dow === 5 && rand() < 0.18) m *= 1.45;
  return m * (0.82 + rand() * 0.42);
}
function saleCountForDay(mode: DemoSeedMode, day: Date, rand: () => number) {
  const base = mode === "restaurant" ? 15 : 13;
  const multiplier = demandMultiplier(mode, day, rand);
  const noise = int(rand, -2, 4);
  return Math.max(
    mode === "restaurant" ? 4 : 5,
    Math.round(base * multiplier + noise),
  );
}
function saleTime(mode: DemoSeedMode, day: Date, rand: () => number) {
  const dow = day.getUTCDay();
  if (mode === "restaurant") {
    const dinnerBias = dow === 5 || dow === 6 ? 0.64 : 0.43;
    const roll = rand();
    if (roll < 0.14) return dateAt(day, int(rand, 7, 10), int(rand, 0, 55));
    if (roll < 0.14 + (1 - dinnerBias) * 0.58)
      return dateAt(day, int(rand, 12, 15), int(rand, 0, 55));
    return dateAt(
      day,
      int(rand, 17, dow === 5 || dow === 6 ? 23 : 21),
      int(rand, 0, 55),
    );
  }
  const roll = rand();
  if (roll < 0.22) return dateAt(day, int(rand, 8, 11), int(rand, 0, 55));
  if (roll < 0.58) return dateAt(day, int(rand, 12, 15), int(rand, 0, 55));
  return dateAt(day, int(rand, 16, dow === 5 ? 20 : 18), int(rand, 0, 55));
}
function productsForTime(
  mode: DemoSeedMode,
  products: ProductSeed[],
  date: Date,
  rand: () => number,
) {
  if (mode === "restaurant") {
    const hour = date.getUTCHours();
    if (hour < 11) return products.filter((p) => p.category === "Breakfast");
    if (hour < 16)
      return products.filter((p) =>
        ["Burgers", "Mains", "Sides", "Breakfast"].includes(p.category),
      );
    const rows: Array<[ProductSeed, number]> = products.map((p) => {
      if (p.section === "Bar") return [p, p.category === "Beer" ? 1.8 : 1.2];
      if (p.category === "Sides") return [p, 1.4];
      if (p.category === "Burgers") return [p, 1.2];
      return [p, 0.9];
    });
    return [pickWeighted(rand, rows)];
  }
  const payday = date.getUTCDate() >= 25 || date.getUTCDate() <= 2;
  return [
    pickWeighted(
      rand,
      products.map((p) => {
        let weight = 1;
        if (["Groceries"].includes(p.category)) weight = 2.2;
        if (["Electronics"].includes(p.category)) weight = payday ? 1.7 : 0.9;
        if (["Clothing"].includes(p.category)) weight = payday ? 1.45 : 0.8;
        if (p.section === "Service") weight = 0.45;
        return [p, weight] as [ProductSeed, number];
      }),
    ),
  ];
}
function saleItemsFor(
  mode: DemoSeedMode,
  products: ProductSeed[],
  date: Date,
  rand: () => number,
) {
  const target =
    mode === "restaurant"
      ? pickWeighted(rand, [
          [1, 42],
          [2, 32],
          [3, 18],
          [4, 8],
        ])
      : pickWeighted(rand, [
          [1, 38],
          [2, 30],
          [3, 18],
          [4, 10],
          [5, 4],
        ]);
  const selected: Array<{
    product: ProductSeed;
    quantity: number;
  }> = [];
  for (let i = 0; i < target; i += 1) {
    const pool = productsForTime(mode, products, date, rand);
    const productSeed = pool.length === 1 ? pool[0] : pick(rand, pool);
    const quantity =
      mode === "restaurant"
        ? productSeed.section === "Bar" && rand() < 0.26
          ? int(rand, 2, 4)
          : 1
        : productSeed.category === "Groceries" && rand() < 0.4
          ? int(rand, 2, 4)
          : 1;
    selected.push({ product: productSeed, quantity });
    if (
      mode === "restaurant" &&
      productSeed.category !== "Sides" &&
      rand() < 0.38
    ) {
      const side = products.find((p) => p.id === "demo_prod_fries");
      if (side) selected.push({ product: side, quantity: 1 });
    }
  }
  return selected;
}
function splitPayment(
  total: number,
  mode: DemoSeedMode,
  rand: () => number,
): Array<{
  method: PaymentDraft["method"];
  amount: number;
}> {
  const split = total > 120 && rand() < (mode === "restaurant" ? 0.08 : 0.11);
  const primary = pickWeighted<PaymentDraft["method"]>(rand, [
    ["card", mode === "restaurant" ? 48 : 54],
    ["cash", mode === "restaurant" ? 30 : 24],
    ["wallet", 8],
    ["account", mode === "restaurant" ? 7 : 10],
    ["payfast", mode === "restaurant" ? 7 : 4],
  ]);
  if (!split) return [{ method: primary, amount: total }];
  const secondary =
    primary === "cash" ? "card" : rand() < 0.5 ? "cash" : "wallet";
  const first = round(total * (0.45 + rand() * 0.35));
  return [
    { method: primary, amount: first },
    { method: secondary, amount: round(total - first) },
  ];
}
function buildSessionsForDay(
  tenantId: string,
  mode: DemoSeedMode,
  day: Date,
  dayIndex: number,
  staff: StaffSeed[],
) {
  const frontStaff = staff.filter(
    (s) => s.role === "cashier" || s.role === "manager",
  );
  const today = sqlDate(day) === sqlDate(baseDate());
  const rows: SessionDraft[] = [];
  const create = (
    suffix: string,
    staffSeed: StaffSeed,
    openHour: number,
    closeHour: number,
    openingFloat: number,
  ) => {
    const open = dateAt(
      day,
      openHour,
      int(() => ((dayIndex * 13 + openHour) % 59) / 59, 0, 20),
    );
    const close = dateAt(
      day,
      closeHour,
      int(() => ((dayIndex * 17 + closeHour) % 59) / 59, 10, 55),
    );
    rows.push({
      id: `demo_cs_${mode}_${dayIndex}_${suffix}`,
      tenantId,
      staffId: staffSeed.id,
      staffName: staffSeed.name,
      openedAt: sqlDateTime(open)!,
      closedAt:
        today && close.getTime() > new Date().getTime()
          ? null
          : sqlDateTime(close),
      openingFloat,
      expectedCash: openingFloat,
      actualCash:
        today && close.getTime() > new Date().getTime() ? 0 : openingFloat,
      difference: 0,
      accumulatedTips: 0,
      netTips: 0,
      status:
        today && close.getTime() > new Date().getTime() ? "open" : "closed",
      reviewStatus: "reconciled",
      note: `${mode === "restaurant" ? "Restaurant" : "Retail"} demo shift ${suffix.toUpperCase()}`,
      managerNote: null,
      varianceReason: null,
      stats: {
        cashSales: 0,
        tips: 0,
        cashOut: 0,
        refunds: 0,
        cardSales: 0,
        saleCount: 0,
      },
    });
  };
  if (mode === "restaurant") {
    create("lunch", frontStaff[dayIndex % frontStaff.length], 9, 16, 900);
    create(
      "dinner",
      frontStaff[(dayIndex + 1) % frontStaff.length],
      16,
      24,
      1400,
    );
    if ([5, 6].includes(day.getUTCDay()))
      create(
        "bar",
        frontStaff[(dayIndex + 2) % frontStaff.length],
        17,
        25,
        1800,
      );
  } else {
    create("am", frontStaff[dayIndex % frontStaff.length], 8, 15, 850);
    create("pm", frontStaff[(dayIndex + 1) % frontStaff.length], 14, 20, 1050);
  }
  return rows;
}
function sessionForSale(sessions: SessionDraft[], saleDate: Date) {
  const saleTimeMs = saleDate.getTime();
  return (
    sessions.find((s) => {
      const open = new Date(`${s.openedAt}Z`).getTime();
      const close = s.closedAt
        ? new Date(`${s.closedAt}Z`).getTime()
        : Number.POSITIVE_INFINITY;
      return saleTimeMs >= open && saleTimeMs <= close;
    }) || sessions[0]
  );
}
function buildYearData(
  tenantId: string,
  mode: DemoSeedMode,
  products: ProductSeed[],
  staff: StaffSeed[],
  customers: CustomerSeed[],
) {
  const rand = rng(mode === "restaurant" ? 0xc0ffee : 0xbadc0de);
  const sales: SaleDraft[] = [];
  const sessions: SessionDraft[] = [];
  const cashMovements: any[][] = [];
  const stockMovements: any[][] = [];
  const managerTasks: any[][] = [];
  const auditEvents: AuditEventDraft[] = [];
  const staffStats = new Map(
    staff.map((s) => [
      s.id,
      { sales: 0, revenue: 0, tips: 0, prepMs: 0, prepCount: 0 },
    ]),
  );
  const stock = new Map(products.map((p) => [p.id, p.stock + 600]));
  const completedSaleIds: string[] = [];
  const frontStaff = staff.filter(
    (s) => s.role === "cashier" || s.role === "manager",
  );
  const kitchenStaff = staff.filter((s) => s.role === "chef");
  const barStaff = staff.filter((s) => s.assignedSections.includes("Bar"));
  const staffNames = new Map(staff.map((s) => [s.id, s.name]));
  let auditIndex = 0;
  const addAudit = (
    createdAt: Date | string,
    action: string,
    entityType: string,
    entityId: string | null,
    staffId: string | null,
    source: string,
    details: Record<string, unknown> = {},
    relatedSaleId: string | null = null,
    customerId: string | null = null,
  ) => {
    const created = sqlDateTime(createdAt);
    if (!created) return;
    auditEvents.push({
      id: `demo_audit_${mode}_${auditIndex++}`,
      action,
      entityType,
      entityId,
      relatedSaleId,
      staffId,
      staffName: staffId ? staffNames.get(staffId) || null : null,
      customerId,
      source,
      details,
      createdAt: created,
    });
  };
  for (let dayIndex = 0; dayIndex < 365; dayIndex += 1) {
    const day = businessDay(dayIndex);
    const daySessions = buildSessionsForDay(
      tenantId,
      mode,
      day,
      dayIndex,
      staff,
    );
    sessions.push(...daySessions);
    const saleCount = saleCountForDay(mode, day, rand);
    for (let saleIndex = 0; saleIndex < saleCount; saleIndex += 1) {
      const created = saleTime(mode, day, rand);
      const session = sessionForSale(daySessions, created);
      const staffSeed =
        staff.find((s) => s.id === session.staffId) ||
        frontStaff[saleIndex % frontStaff.length];
      const customer = rand() < 0.72 ? pick(rand, customers) : null;
      const itemInputs = saleItemsFor(mode, products, created, rand);
      const discount = customer?.discountPercent
        ? round(
            itemInputs.reduce(
              (sum, item) => sum + item.product.price * item.quantity,
              0,
            ) *
              (customer.discountPercent / 100),
          )
        : 0;
      const gross = round(
        itemInputs.reduce(
          (sum, item) => sum + item.product.price * item.quantity,
          0,
        ),
      );
      const pointsDiscount =
        rand() < 0.06 ? Math.min(30, round(gross * 0.08)) : 0;
      const total = Math.max(0, round(gross - discount - pointsDiscount));
      const taxAmount = round(total * (TAX_RATE / (100 + TAX_RATE)));
      const status: SaleDraft["status"] =
        rand() < 0.985 ? "completed" : "failed";
      const isVoid = status === "failed";
      const tableNumber =
        mode === "restaurant" && rand() < 0.54 ? `T${int(rand, 1, 18)}` : null;
      const isTab = mode === "restaurant" && !tableNumber && rand() < 0.12;
      const saleId = `demo_sale_${mode}_${dayIndex}_${saleIndex}`;
      const sale: SaleDraft = {
        id: saleId,
        customerId: customer?.id || null,
        userId: staffSeed.id,
        staffId: staffSeed.id,
        total: isVoid ? 0 : total,
        subtotal: isVoid ? 0 : round(total - taxAmount),
        taxAmount: isVoid ? 0 : taxAmount,
        paymentMethod: isVoid ? "pending" : "card",
        tenderedAmount: 0,
        changeAmount: 0,
        tipAmount: 0,
        cashOutAmount: 0,
        pointsDiscount,
        status,
        transactionType: isVoid ? "void" : "sale",
        parentSaleId: null,
        refundStatus: "none",
        refundedAmount: 0,
        refundReason: null,
        refundedBy: null,
        voidReason: isVoid
          ? pick(rand, [
              "Customer changed order",
              "Card declined after order",
              "Training correction",
            ])
          : null,
        voidedBy: isVoid ? staffSeed.id : null,
        tableNumber,
        isTab,
        tabName: isTab ? `${customer?.name || "Walk-in"} tab` : null,
        offlineEventId:
          rand() < 0.018
            ? `demo_offline_${mode}_${dayIndex}_${saleIndex}`
            : null,
        syncSource: rand() < 0.018 ? "offline" : "online",
        createdAt: sqlDateTime(created)!,
        updatedAt: sqlDateTime(addMinutes(created, int(rand, 4, 28)))!,
        items: [],
        payments: [],
      };
      itemInputs.forEach((item, itemIndex) => {
        const itemActionStaff =
          mode === "restaurant"
            ? item.product.section === "Kitchen"
              ? kitchenStaff[
                  (dayIndex + saleIndex + itemIndex) %
                    Math.max(1, kitchenStaff.length)
                ] || staffSeed
              : barStaff[
                  (dayIndex + saleIndex + itemIndex) %
                    Math.max(1, barStaff.length)
                ] || staffSeed
            : staffSeed;
        const ordered = addMinutes(created, int(rand, 0, 5));
        const acceptDelay = mode === "restaurant" ? int(rand, 1, 8) : 0;
        const prepDelay =
          mode === "restaurant"
            ? int(rand, 6, item.product.section === "Bar" ? 12 : 26)
            : int(rand, 0, 2);
        const ready = addMinutes(ordered, acceptDelay + prepDelay);
        const delivered = addMinutes(
          ready,
          mode === "restaurant" ? int(rand, 2, 8) : int(rand, 0, 3),
        );
        const itemId = `demo_si_${mode}_${dayIndex}_${saleIndex}_${itemIndex}`;
        sale.items.push({
          id: itemId,
          saleId,
          productId: item.product.id,
          productName: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          status: status === "completed" ? "delivered" : "pending",
          workstationId:
            mode === "restaurant" ? item.product.workstationId || null : null,
          orderedAt: sqlDateTime(ordered),
          acceptedAt:
            status === "completed"
              ? sqlDateTime(addMinutes(ordered, acceptDelay))
              : null,
          readyAt: status === "completed" ? sqlDateTime(ready) : null,
          deliveredAt: status === "completed" ? sqlDateTime(delivered) : null,
          actionStaffId: itemActionStaff.id,
          createdAt: sqlDateTime(ordered)!,
          updatedAt:
            status === "completed"
              ? sqlDateTime(delivered)!
              : sqlDateTime(ordered)!,
        });
        if (status === "completed") {
          const previous = stock.get(item.product.id) || item.product.stock;
          const next = Math.max(0, round(previous - item.quantity, 3));
          stock.set(item.product.id, next);
          stockMovements.push([
            `demo_stock_sale_${mode}_${dayIndex}_${saleIndex}_${itemIndex}`,
            tenantId,
            "product",
            item.product.id,
            null,
            item.product.name,
            -item.quantity,
            previous,
            next,
            "sale",
            "sale",
            "sale",
            saleId,
            saleId,
            itemId,
            staffSeed.id,
            staffSeed.name,
            "Demo checkout stock deduction",
            sale.createdAt,
          ]);
          const stat = staffStats.get(staffSeed.id);
          if (stat) {
            stat.prepMs += Math.max(
              0,
              new Date(`${delivered.toISOString()}`).getTime() -
                ordered.getTime(),
            );
            stat.prepCount += 1;
          }
          if (mode === "restaurant" && itemActionStaff.id !== staffSeed.id) {
            const actionStat = staffStats.get(itemActionStaff.id);
            if (actionStat) {
              actionStat.sales += 1;
              actionStat.prepMs += Math.max(
                0,
                delivered.getTime() - ordered.getTime(),
              );
              actionStat.prepCount += 1;
            }
          }
        }
      });
      if (status === "completed") {
        const payments = splitPayment(total, mode, rand).map((payment) => {
          if (payment.method === "account" && !customer?.accountEnabled)
            return { ...payment, method: "card" as const };
          if (
            payment.method === "wallet" &&
            (!customer || customer.walletBalance <= 0)
          )
            return { ...payment, method: "card" as const };
          return payment;
        });
        let tendered = 0;
        let change = 0;
        const tip =
          mode === "restaurant" && rand() < 0.58
            ? round(total * (0.06 + rand() * 0.11))
            : 0;
        const cashOut =
          rand() < 0.012
            ? pickWeighted(rand, [
                [50, 3],
                [100, 2],
                [200, 1],
              ])
            : 0;
        sale.paymentMethod = payments[0].method;
        sale.tipAmount = tip;
        sale.cashOutAmount = cashOut;
        payments.forEach((payment, paymentIndex) => {
          const isCash = payment.method === "cash";
          const paymentTip = paymentIndex === 0 ? tip : 0;
          const paymentCashOut = isCash && paymentIndex === 0 ? cashOut : 0;
          const paymentAmount = round(payment.amount);
          const tenderedAmount = isCash
            ? round(
                Math.ceil((paymentAmount + paymentTip + paymentCashOut) / 10) *
                  10,
              )
            : paymentAmount;
          const changeAmount = isCash
            ? round(
                Math.max(
                  0,
                  tenderedAmount - paymentAmount - paymentTip - paymentCashOut,
                ),
              )
            : 0;
          tendered += tenderedAmount;
          change += changeAmount;
          const paymentId = `demo_pay_${mode}_${dayIndex}_${saleIndex}_${paymentIndex}`;
          sale.payments.push({
            id: paymentId,
            saleId,
            method: payment.method,
            amount: paymentAmount,
            tenderedAmount,
            changeAmount,
            tipAmount: paymentTip,
            cashOutAmount: paymentCashOut,
            createdAt: sale.createdAt,
            updatedAt: sale.updatedAt,
          });
          if (payment.method === "cash") {
            session.stats.cashSales = round(
              session.stats.cashSales + paymentAmount,
            );
            session.stats.cashOut = round(
              session.stats.cashOut + paymentCashOut,
            );
            cashMovements.push([
              `demo_cm_sale_${mode}_${dayIndex}_${saleIndex}_${paymentIndex}`,
              tenantId,
              session.id,
              "cash_sale",
              "in",
              paymentAmount,
              saleId,
              paymentId,
              staffSeed.id,
              staffSeed.name,
              staffSeed.id,
              "Cash tender on demo sale",
              sale.createdAt,
            ]);
            if (paymentCashOut > 0) {
              cashMovements.push([
                `demo_cm_cashout_${mode}_${dayIndex}_${saleIndex}`,
                tenantId,
                session.id,
                "cash_out",
                "out",
                paymentCashOut,
                saleId,
                paymentId,
                staffSeed.id,
                staffSeed.name,
                staffSeed.id,
                "Customer cash-out on card/cash mix",
                sale.createdAt,
              ]);
            }
          } else {
            session.stats.cardSales = round(
              session.stats.cardSales + paymentAmount,
            );
          }
          if (paymentTip > 0) {
            session.stats.tips = round(session.stats.tips + paymentTip);
            cashMovements.push([
              `demo_cm_tip_${mode}_${dayIndex}_${saleIndex}`,
              tenantId,
              session.id,
              "tip",
              "in",
              paymentTip,
              saleId,
              paymentId,
              staffSeed.id,
              staffSeed.name,
              staffSeed.id,
              "Tip captured during demo shift",
              sale.createdAt,
            ]);
          }
        });
        sale.tenderedAmount = tendered;
        sale.changeAmount = change;
        session.stats.saleCount += 1;
        const stat = staffStats.get(staffSeed.id);
        if (stat) {
          stat.sales += 1;
          stat.revenue += sale.total;
          stat.tips += tip;
        }
        completedSaleIds.push(saleId);
      } else {
        managerTasks.push(
          managerTaskRow(
            tenantId,
            `demo_task_void_${mode}_${dayIndex}_${saleIndex}`,
            "void_request",
            "Void review",
            "A demo sale was voided after items were sent to the queue.",
            "normal",
            "done",
            "sale",
            saleId,
            saleId,
            null,
            staffSeed.id,
            staffSeed.id,
            { reason: sale.voidReason },
            sale.createdAt,
          ),
        );
      }
      sales.push(sale);
      if (status === "completed") {
        if (
          (dayIndex + saleIndex) % 5 === 0 ||
          sale.total >= (mode === "restaurant" ? 420 : 650)
        ) {
          addAudit(
            sale.createdAt,
            "sale.completed",
            "sale",
            sale.id,
            staffSeed.id,
            "pos",
            {
              total: sale.total,
              paymentMethod: sale.paymentMethod,
              itemCount: sale.items.length,
              tableNumber: sale.tableNumber,
              isTab: sale.isTab,
              mode,
            },
            sale.id,
            sale.customerId,
          );
        }
        if (sale.offlineEventId) {
          addAudit(
            addMinutes(new Date(`${sale.createdAt}Z`), 12),
            "offline.sale_synced",
            "sale",
            sale.id,
            staffSeed.id,
            "offline_queue",
            {
              offlineEventId: sale.offlineEventId,
              localReceiptNumber: `OFF-${mode.toUpperCase()}-${dayIndex}-${saleIndex}`,
              deviceId: `demo-${mode}-terminal-${(dayIndex % 3) + 1}`,
              syncBatchId: `demo_sync_${mode}_${dayIndex}`,
              attempts: 1,
            },
            sale.id,
            sale.customerId,
          );
        }
      } else {
        addAudit(
          sale.createdAt,
          "sale.voided",
          "sale",
          sale.id,
          staffSeed.id,
          "pos",
          {
            reason: sale.voidReason,
            reviewStatus: "manager_reviewed",
            mode,
          },
          sale.id,
          sale.customerId,
        );
      }
      if (status === "completed" && rand() < 0.01 && dayIndex < 360) {
        const refundItem = pick(rand, sale.items);
        const refundTotal = round(
          refundItem.price * Math.min(1, refundItem.quantity),
        );
        const refundDate = addMinutes(
          new Date(`${sale.createdAt}Z`),
          int(rand, 80, 60 * 24 * 5),
        );
        const refundId = `demo_refund_${mode}_${dayIndex}_${saleIndex}`;
        sale.refundStatus =
          refundTotal >= sale.total - 0.01 ? "full" : "partial";
        sale.refundedAmount = refundTotal;
        sale.refundReason = pick(rand, [
          "Customer changed mind",
          "Incorrect item selected",
          "Quality issue resolved",
        ]);
        sale.refundedBy = staffSeed.id;
        const signedTax = round(-refundTotal * (TAX_RATE / (100 + TAX_RATE)));
        sales.push({
          id: refundId,
          customerId: sale.customerId,
          userId: staffSeed.id,
          staffId: staffSeed.id,
          total: -refundTotal,
          subtotal: round(-refundTotal - signedTax),
          taxAmount: signedTax,
          paymentMethod:
            sale.paymentMethod === "account" ? "wallet" : sale.paymentMethod,
          tenderedAmount: -refundTotal,
          changeAmount: 0,
          tipAmount: 0,
          cashOutAmount: 0,
          pointsDiscount: 0,
          status: "completed",
          transactionType: "refund",
          parentSaleId: sale.id,
          refundStatus: "none",
          refundedAmount: refundTotal,
          refundReason: sale.refundReason,
          refundedBy: staffSeed.id,
          voidReason: null,
          voidedBy: null,
          tableNumber: sale.tableNumber,
          isTab: false,
          tabName: null,
          offlineEventId: null,
          syncSource: "online",
          createdAt: sqlDateTime(refundDate)!,
          updatedAt: sqlDateTime(refundDate)!,
          items: [
            {
              ...refundItem,
              id: `demo_si_refund_${mode}_${dayIndex}_${saleIndex}`,
              saleId: refundId,
              quantity: Math.min(1, refundItem.quantity),
              createdAt: sqlDateTime(refundDate)!,
              updatedAt: sqlDateTime(refundDate)!,
            },
          ],
          payments: [
            {
              id: `demo_pay_refund_${mode}_${dayIndex}_${saleIndex}`,
              saleId: refundId,
              method:
                sale.paymentMethod === "account"
                  ? "wallet"
                  : (sale.paymentMethod as PaymentDraft["method"]),
              amount: -refundTotal,
              tenderedAmount: -refundTotal,
              changeAmount: 0,
              tipAmount: 0,
              cashOutAmount: 0,
              createdAt: sqlDateTime(refundDate)!,
              updatedAt: sqlDateTime(refundDate)!,
            },
          ],
        });
        addAudit(
          refundDate,
          "sale.refunded",
          "sale",
          refundId,
          staffSeed.id,
          "refund",
          {
            refundTotal,
            reason: sale.refundReason,
            parentSaleId: sale.id,
            method: sale.paymentMethod,
          },
          sale.id,
          sale.customerId,
        );
      }
    }
    if (dayIndex % 31 === 0) {
      const productSeed = pick(rand, products);
      const previous = stock.get(productSeed.id) || productSeed.stock;
      const received = int(rand, 24, mode === "restaurant" ? 120 : 180);
      const next = round(previous + received, 3);
      stock.set(productSeed.id, next);
      stockMovements.push([
        `demo_stock_recv_${mode}_${dayIndex}`,
        tenantId,
        "product",
        productSeed.id,
        null,
        productSeed.name,
        received,
        previous,
        next,
        "purchase_order",
        "receiving",
        "purchase_order",
        `demo_po_${mode}_${dayIndex}`,
        null,
        null,
        "demo_staff_stock",
        "Johan Pretorius",
        "Demo supplier receiving",
        sqlDateTime(dateAt(day, 9, 30)),
      ]);
      addAudit(
        dateAt(day, 9, 35),
        "purchase_order.received",
        "purchase_order",
        `demo_po_${mode}_${dayIndex}`,
        "demo_staff_stock",
        "inventory",
        {
          productId: productSeed.id,
          productName: productSeed.name,
          receivedQuantity: received,
          varianceQuantity: 0,
        },
      );
    }
    if (dayIndex % 19 === 0) {
      const productSeed = pick(rand, products);
      const previous = stock.get(productSeed.id) || productSeed.stock;
      const delta = -int(rand, 1, 5);
      const next = Math.max(0, round(previous + delta, 3));
      stock.set(productSeed.id, next);
      stockMovements.push([
        `demo_stock_adj_${mode}_${dayIndex}`,
        tenantId,
        "product",
        productSeed.id,
        null,
        productSeed.name,
        delta,
        previous,
        next,
        mode === "restaurant" ? "wastage" : "shrinkage",
        mode === "restaurant" ? "wastage" : "shrinkage",
        "stock_take_session",
        `demo_st_${mode}_${dayIndex}`,
        null,
        null,
        "demo_staff_stock",
        "Johan Pretorius",
        mode === "restaurant"
          ? "Kitchen waste logged during demo count"
          : "Cycle count variance logged in demo",
        sqlDateTime(dateAt(day, 10, 15)),
      ]);
      addAudit(
        dateAt(day, 10, 20),
        "stock.adjusted",
        "product",
        productSeed.id,
        "demo_staff_stock",
        "inventory",
        {
          productName: productSeed.name,
          delta,
          previousQuantity: previous,
          newQuantity: next,
          reason: mode === "restaurant" ? "wastage" : "shrinkage",
          sourceSessionId: `demo_st_${mode}_${dayIndex}`,
        },
      );
    }
  }
  addOpenRestaurantOrders(
    mode,
    tenantId,
    products,
    staff,
    customers,
    sales,
    sessions,
    rand,
  );
  finalizeSessions(mode, tenantId, sessions, cashMovements, rand);
  sessions.forEach((session, index) => {
    if (index % 2 === 0) {
      addAudit(
        session.openedAt,
        "cash_session.opened",
        "cash_session",
        session.id,
        session.staffId,
        "cash",
        {
          openingFloat: session.openingFloat,
          shift: session.note,
          mode,
        },
      );
    }
    if (
      session.closedAt &&
      (index % 2 === 0 || Math.abs(session.difference) > 0.009)
    ) {
      addAudit(
        session.closedAt,
        Math.abs(session.difference) > 0.009
          ? "cash_session.variance_reviewed"
          : "cash_session.closed",
        "cash_session",
        session.id,
        "demo_staff_mgr",
        "cash",
        {
          staffId: session.staffId,
          staffName: session.staffName,
          expectedCash: session.expectedCash,
          actualCash: session.actualCash,
          difference: session.difference,
          reviewStatus: session.reviewStatus,
        },
      );
    }
  });
  sales
    .filter((sale) => sale.id.startsWith("demo_open_rest_"))
    .forEach((sale) => {
      addAudit(
        sale.createdAt,
        "restaurant.order_started",
        "sale",
        sale.id,
        sale.staffId,
        "pos",
        {
          tableNumber: sale.tableNumber,
          isTab: sale.isTab,
          status: sale.status,
          itemCount: sale.items.length,
          timerAgeMinutes: Math.max(
            0,
            Math.round(
              (Date.now() - new Date(`${sale.createdAt}Z`).getTime()) / 60000,
            ),
          ),
        },
        sale.id,
        sale.customerId,
      );
    });
  for (let month = 0; month < 12; month += 1) {
    const monthDate = addDays(baseDate(), -month * 30 - 2);
    addAudit(
      dateAt(monthDate, 8, 45),
      "auth.login",
      "staff",
      "demo_staff_mgr",
      "demo_staff_mgr",
      "auth",
      { deviceId: `demo-office-${(month % 3) + 1}`, mode },
    );
    addAudit(
      dateAt(monthDate, 17, 25),
      "report.exported",
      "report",
      `demo_report_${mode}_${month}`,
      "demo_staff_mgr",
      "reporting",
      {
        reportType: month % 2 === 0 ? "sales_summary" : "cash_close",
        range: "monthly",
        format: "csv",
      },
    );
    if (month % 4 === 1) {
      addAudit(
        dateAt(monthDate, 13, 10),
        "permission.denied",
        "security",
        "demo_staff_cashier_a",
        "demo_staff_cashier_a",
        "permission",
        {
          attemptedAction: "manager_cash.summary_view",
          actorRole: "cashier",
          reason: "manager_required",
          route: `/api/mariadb/tenants/${tenantId}/manager-cash/summary`,
          method: "GET",
        },
      );
    }
  }
  addAudit(
    addMinutes(new Date(), -18),
    "ai.insights.generated",
    "ai_insight",
    `demo_ai_sales_${mode}`,
    "demo_staff_mgr",
    "ai",
    {
      insightCount: mode === "restaurant" ? 6 : 5,
      source: "demo_seed",
      signalWindowDays: 365,
    },
  );
  return {
    sales,
    sessions,
    cashMovements,
    stockMovements,
    managerTasks,
    auditEvents,
    staffStats,
    stock,
    completedSaleIds,
  };
}
function addOpenRestaurantOrders(
  mode: DemoSeedMode,
  tenantId: string,
  products: ProductSeed[],
  staff: StaffSeed[],
  customers: CustomerSeed[],
  sales: SaleDraft[],
  sessions: SessionDraft[],
  rand: () => number,
) {
  if (mode !== "restaurant") return;
  const today = baseDate();
  const activeSession =
    sessions.find((s) => s.status === "open") || sessions[sessions.length - 1];
  const serverNow = new Date();
  const cashier = staff.find((s) => s.id === activeSession.staffId) || staff[1];
  const chef = staff.find((s) => s.role === "chef") || staff[0];
  for (let index = 0; index < 8; index += 1) {
    const created = addMinutes(serverNow, -int(rand, 4, 68));
    const itemInputs = saleItemsFor(mode, products, created, rand).slice(
      0,
      int(rand, 1, 3),
    );
    const total = round(
      itemInputs.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0,
      ),
    );
    const saleId = `demo_open_rest_${index}`;
    const status = index % 3 === 0 ? "open" : "kitchen";
    sales.push({
      id: saleId,
      customerId:
        index % 2 === 0 ? customers[index % customers.length].id : null,
      userId: cashier.id,
      staffId: cashier.id,
      total,
      subtotal: round(total - total * (TAX_RATE / (100 + TAX_RATE))),
      taxAmount: round(total * (TAX_RATE / (100 + TAX_RATE))),
      paymentMethod: "pending",
      tenderedAmount: 0,
      changeAmount: 0,
      tipAmount: 0,
      cashOutAmount: 0,
      pointsDiscount: 0,
      status,
      transactionType: "sale",
      parentSaleId: null,
      refundStatus: "none",
      refundedAmount: 0,
      refundReason: null,
      refundedBy: null,
      voidReason: null,
      voidedBy: null,
      tableNumber: `T${index + 1}`,
      isTab: index % 4 === 0,
      tabName: index % 4 === 0 ? `Table ${index + 1} running tab` : null,
      offlineEventId: null,
      syncSource: "online",
      createdAt: sqlDateTime(created)!,
      updatedAt: sqlDateTime(serverNow)!,
      items: itemInputs.map((item, itemIndex) => {
        const ordered = addMinutes(created, itemIndex);
        const accepted =
          index % 3 === 1 || index % 3 === 2 ? addMinutes(ordered, 3) : null;
        const ready = index % 3 === 2 ? addMinutes(ordered, 16) : null;
        return {
          id: `demo_si_open_${index}_${itemIndex}`,
          saleId,
          productId: item.product.id,
          productName: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          status: ready ? "ready" : accepted ? "accepted" : "pending",
          workstationId: item.product.workstationId || null,
          orderedAt: sqlDateTime(ordered),
          acceptedAt: sqlDateTime(accepted),
          readyAt: sqlDateTime(ready),
          deliveredAt: null,
          actionStaffId: chef.id,
          createdAt: sqlDateTime(ordered)!,
          updatedAt: sqlDateTime(serverNow)!,
        };
      }),
      payments: [],
    });
  }
  sessions.push({
    id: "demo_cs_restaurant_live_bar",
    tenantId,
    staffId: cashier.id,
    staffName: cashier.name,
    openedAt: sqlDateTime(dateAt(today, 16, 0))!,
    closedAt: null,
    openingFloat: 1800,
    expectedCash: 1800,
    actualCash: 0,
    difference: 0,
    accumulatedTips: 0,
    netTips: 0,
    status: "open",
    reviewStatus: "in_progress",
    note: "Live demo dinner shift",
    managerNote: null,
    varianceReason: null,
    stats: {
      cashSales: 0,
      tips: 0,
      cashOut: 0,
      refunds: 0,
      cardSales: 0,
      saleCount: 0,
    },
  });
}
function finalizeSessions(
  mode: DemoSeedMode,
  tenantId: string,
  sessions: SessionDraft[],
  cashMovements: any[][],
  rand: () => number,
) {
  for (const session of sessions) {
    session.expectedCash = round(
      session.openingFloat +
        session.stats.cashSales +
        session.stats.tips -
        session.stats.cashOut -
        session.stats.refunds,
    );
    session.accumulatedTips = round(session.stats.tips);
    session.netTips = round(session.stats.tips * 0.92);
    cashMovements.push([
      `demo_cm_open_${session.id}`,
      tenantId,
      session.id,
      "opening_float",
      "in",
      session.openingFloat,
      null,
      null,
      session.staffId,
      session.staffName,
      session.staffId,
      "Opening float counted for demo shift",
      session.openedAt,
    ]);
    if (session.status === "open") {
      session.reviewStatus = "in_progress";
      continue;
    }
    const variance =
      rand() < 0.82
        ? 0
        : pickWeighted(rand, [
            [-25, 2],
            [-10, 4],
            [10, 4],
            [35, 1],
          ]);
    session.difference = variance;
    session.actualCash = round(session.expectedCash + variance);
    session.reviewStatus =
      variance === 0
        ? "reconciled"
        : Math.abs(variance) >= 25
          ? "disputed"
          : "reviewed";
    session.varianceReason =
      variance === 0 ? null : "Demo cash-up variance for manager review";
    session.managerNote =
      variance === 0
        ? "Balanced demo shift."
        : "Variance accepted for training data.";
    if (session.stats.cashSales > 0) {
      cashMovements.push([
        `demo_cm_drop_${session.id}`,
        tenantId,
        session.id,
        "cash_drop",
        "out",
        round(Math.max(0, session.stats.cashSales - 250)),
        null,
        null,
        session.staffId,
        session.staffName,
        "demo_staff_mgr",
        "End-of-shift safe drop",
        session.closedAt,
      ]);
    }
  }
}
function managerTaskRow(
  tenantId: string,
  id: string,
  taskType: string,
  title: string,
  summary: string,
  priority: string,
  status: string,
  sourceType: string,
  sourceId: string,
  relatedSaleId: string | null,
  relatedProductId: string | null,
  assignedTo: string | null,
  requestedBy: string | null,
  details: Record<string, unknown>,
  createdAt: string,
) {
  return [
    id,
    tenantId,
    taskType,
    title,
    summary,
    priority,
    status,
    sourceType,
    sourceId,
    relatedSaleId,
    relatedProductId,
    assignedTo,
    requestedBy,
    status === "done" || status === "approved" ? "demo_staff_mgr" : null,
    status === "done" || status === "approved"
      ? "Resolved during demo operations"
      : null,
    json(details),
    sqlDateTime(addMinutes(new Date(`${createdAt}Z`), 60 * 24)),
    status === "done" || status === "dismissed"
      ? sqlDateTime(addMinutes(new Date(`${createdAt}Z`), 90))
      : null,
    createdAt,
    sqlDateTime(addMinutes(new Date(`${createdAt}Z`), 90)),
  ];
}
async function persistYearData(
  conn: any,
  tenantId: string,
  mode: DemoSeedMode,
  products: ProductSeed[],
  data: ReturnType<typeof buildYearData>,
) {
  await insertRows(
    conn,
    "cash_sessions",
    [
      "id",
      "tenant_id",
      "staff_id",
      "staff_name",
      "opened_at",
      "closed_at",
      "submitted_at",
      "reviewed_at",
      "reviewed_by",
      "reconciled_at",
      "reconciled_by",
      "opening_float",
      "opening_breakdown",
      "expected_cash",
      "actual_cash",
      "closing_breakdown",
      "difference",
      "accumulated_tips",
      "net_tips",
      "status",
      "review_status",
      "notes",
      "manager_notes",
      "variance_reason",
      "created_at",
      "updated_at",
    ],
    data.sessions.map((s) => [
      s.id,
      tenantId,
      s.staffId,
      s.staffName,
      s.openedAt,
      s.closedAt,
      s.closedAt
        ? sqlDateTime(addMinutes(new Date(`${s.closedAt}Z`), 8))
        : null,
      s.closedAt
        ? sqlDateTime(addMinutes(new Date(`${s.closedAt}Z`), 14))
        : null,
      s.closedAt ? "demo_staff_mgr" : null,
      s.reviewStatus === "reconciled" && s.closedAt
        ? sqlDateTime(addMinutes(new Date(`${s.closedAt}Z`), 20))
        : null,
      s.reviewStatus === "reconciled" ? "demo_staff_mgr" : null,
      s.openingFloat,
      json({ R200: 2, R100: 3, R50: 4, R20: 5, R10: 5 }),
      s.expectedCash,
      s.actualCash,
      json({
        R200: Math.floor(s.actualCash / 200),
        R100: 2,
        R50: 4,
        R20: 5,
        coins: round(s.actualCash % 20),
      }),
      s.difference,
      s.accumulatedTips,
      s.netTips,
      s.status,
      s.reviewStatus,
      s.note,
      s.managerNote,
      s.varianceReason,
      s.openedAt,
      s.closedAt || s.openedAt,
    ]),
    220,
  );
  await insertRows(
    conn,
    "sales",
    [
      "id",
      "tenant_id",
      "customer_id",
      "user_id",
      "staff_id",
      "total",
      "subtotal",
      "tax_amount",
      "tax_rate",
      "tax_inclusive",
      "payment_method",
      "tendered_amount",
      "change_amount",
      "tip_amount",
      "cash_out_amount",
      "points_discount",
      "status",
      "transaction_type",
      "parent_sale_id",
      "refund_status",
      "refunded_amount",
      "refund_reason",
      "refunded_by",
      "void_reason",
      "voided_by",
      "table_number",
      "is_tab",
      "tab_name",
      "offline_event_id",
      "sync_source",
      "created_at",
      "updated_at",
    ],
    data.sales.map((s) => [
      s.id,
      tenantId,
      s.customerId,
      s.userId,
      s.staffId,
      s.total,
      s.subtotal,
      s.taxAmount,
      TAX_RATE,
      1,
      s.paymentMethod,
      s.tenderedAmount,
      s.changeAmount,
      s.tipAmount,
      s.cashOutAmount,
      s.pointsDiscount,
      s.status,
      s.transactionType,
      s.parentSaleId,
      s.refundStatus,
      s.refundedAmount,
      s.refundReason,
      s.refundedBy,
      s.voidReason,
      s.voidedBy,
      s.tableNumber,
      s.isTab ? 1 : 0,
      s.tabName,
      s.offlineEventId,
      s.syncSource,
      s.createdAt,
      s.updatedAt,
    ]),
    180,
  );
  await insertRows(
    conn,
    "sale_items",
    [
      "id",
      "sale_id",
      "product_id",
      "product_name",
      "price",
      "quantity",
      "status",
      "workstation_id",
      "ordered_at",
      "accepted_at",
      "ready_at",
      "delivered_at",
      "action_staff_id",
      "created_at",
      "updated_at",
    ],
    data.sales.flatMap((s) =>
      s.items.map((item) => [
        item.id,
        item.saleId,
        item.productId,
        item.productName,
        item.price,
        item.quantity,
        item.status,
        item.workstationId,
        item.orderedAt,
        item.acceptedAt,
        item.readyAt,
        item.deliveredAt,
        item.actionStaffId,
        item.createdAt,
        item.updatedAt,
      ]),
    ),
    280,
  );
  await insertRows(
    conn,
    "sale_payments",
    [
      "id",
      "sale_id",
      "method",
      "amount",
      "tendered_amount",
      "change_amount",
      "tip_amount",
      "cash_out_amount",
      "created_at",
      "updated_at",
    ],
    data.sales.flatMap((s) =>
      s.payments.map((p) => [
        p.id,
        p.saleId,
        p.method,
        p.amount,
        p.tenderedAmount,
        p.changeAmount,
        p.tipAmount,
        p.cashOutAmount,
        p.createdAt,
        p.updatedAt,
      ]),
    ),
    350,
  );
  await insertRows(
    conn,
    "cash_movements",
    [
      "id",
      "tenant_id",
      "cash_session_id",
      "type",
      "direction",
      "amount",
      "sale_id",
      "payment_id",
      "staff_id",
      "staff_name",
      "created_by",
      "note",
      "created_at",
    ],
    data.cashMovements,
    300,
  );
  await insertRows(
    conn,
    "stock_movements",
    [
      "id",
      "tenant_id",
      "item_type",
      "product_id",
      "bulk_item_id",
      "item_name",
      "quantity_delta",
      "previous_quantity",
      "new_quantity",
      "reason",
      "reason_code",
      "reference_type",
      "reference_id",
      "sale_id",
      "sale_item_id",
      "staff_id",
      "staff_name",
      "note",
      "created_at",
    ],
    data.stockMovements,
    250,
  );
  await insertRows(
    conn,
    "audit_events",
    [
      "id",
      "tenant_id",
      "action",
      "entity_type",
      "entity_id",
      "related_sale_id",
      "staff_id",
      "staff_name",
      "customer_id",
      "source",
      "details",
      "created_at",
    ],
    data.auditEvents.map((event) => [
      event.id,
      tenantId,
      event.action,
      event.entityType,
      event.entityId,
      event.relatedSaleId,
      event.staffId,
      event.staffName,
      event.customerId,
      event.source,
      json(event.details),
      event.createdAt,
    ]),
    250,
  );
  for (const p of products) {
    await conn.query(
      `UPDATE products SET stock = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3`,
      [
        Math.max(p.minStock, Math.round(data.stock.get(p.id) || p.stock)),
        tenantId,
        p.id,
      ],
    );
  }
  await seedOperationalRows(conn, tenantId, mode, products, data);
}
async function seedOperationalRows(
  conn: any,
  tenantId: string,
  mode: DemoSeedMode,
  products: ProductSeed[],
  data: ReturnType<typeof buildYearData>,
) {
  const now = baseDate();
  const vendorRows = [
    [
      "demo_vendor_fresh",
      tenantId,
      mode === "restaurant" ? "Freshline Foods" : "Freshline Grocers",
      "Priya Singh",
      "orders@freshline.test",
      "+27 11 555 2001",
      "12 Supplier Park, Johannesburg",
      "active",
      sqlDateTime(addDays(now, -320)),
      sqlDateTime(now),
    ],
    [
      "demo_vendor_bev",
      tenantId,
      mode === "restaurant" ? "Jozi Beverage Co" : "Metro Wholesale",
      "Gavin Naicker",
      "sales@jozibev.test",
      "+27 11 555 2002",
      "88 Warehouse Road, Midrand",
      "active",
      sqlDateTime(addDays(now, -300)),
      sqlDateTime(now),
    ],
    [
      "demo_vendor_general",
      tenantId,
      mode === "restaurant" ? "KitchenPro Supply" : "Tech & Home Distribution",
      "Nora Jacobs",
      "support@kitchenpro.test",
      "+27 11 555 2003",
      "44 Trade Avenue, Sandton",
      "active",
      sqlDateTime(addDays(now, -280)),
      sqlDateTime(now),
    ],
  ];
  await insertRows(
    conn,
    "vendors",
    [
      "id",
      "tenant_id",
      "name",
      "contact_person",
      "email",
      "phone",
      "address",
      "status",
      "created_at",
      "updated_at",
    ],
    vendorRows,
  );
  const poRows: any[][] = [];
  const batchRows: any[][] = [];
  for (let month = 0; month < 12; month += 1) {
    const day = addDays(now, -month * 30 - 5);
    const chosen = products
      .slice(month % 3, (month % 3) + 4)
      .concat(
        products.slice(
          0,
          Math.max(0, 4 - products.slice(month % 3, (month % 3) + 4).length),
        ),
      );
    const items = chosen.map((p, line) => ({
      productId: p.id,
      productName: p.name,
      quantity: 12 + month + line * 3,
      expectedPrice: p.costPrice,
      receivedQuantity:
        12 + month + line * 3 - (line === 2 && month % 4 === 0 ? 2 : 0),
      receivedPrice: p.costPrice,
      varianceQuantity: line === 2 && month % 4 === 0 ? -2 : 0,
      invoiceNumber: `INV-DEMO-${mode}-${month + 1}`,
      invoiceDate: sqlDate(day),
      batchNumber: `B-${mode}-${month + 1}-${line + 1}`,
      expiryDate:
        mode === "restaurant" || p.category === "Groceries"
          ? sqlDate(addDays(day, 35 + line * 12))
          : null,
    }));
    const total = round(
      items.reduce(
        (sum, item) => sum + item.receivedQuantity * item.receivedPrice,
        0,
      ),
    );
    const poId = `demo_po_${mode}_${month}`;
    poRows.push([
      poId,
      tenantId,
      vendorRows[month % vendorRows.length][0],
      month === 0 ? "sent" : "received",
      month % 3 === 0 ? "recurring" : "once_off",
      month % 3 === 0 ? "monthly" : null,
      json(items),
      total,
      sqlDateTime(addDays(day, 3)),
      month === 0 ? "unpaid" : "paid",
      `INV-DEMO-${mode}-${month + 1}`,
      sqlDateTime(day),
      month === 0 ? null : sqlDateTime(addDays(day, 2)),
      "demo_staff_stock",
      "Johan Pretorius",
      month % 4 === 0
        ? "Short delivery captured; variance task created."
        : "Received into demo stock.",
      month === 0 ? 0 : total,
      sqlDateTime(day),
      sqlDateTime(addDays(day, 2)),
    ]);
    if (month !== 0) {
      items.forEach((item, line) => {
        batchRows.push([
          `demo_batch_${mode}_${month}_${line}`,
          tenantId,
          item.productId,
          item.productName,
          poId,
          vendorRows[month % vendorRows.length][0],
          item.invoiceNumber,
          item.invoiceDate,
          item.batchNumber,
          item.receivedQuantity,
          Math.max(
            0,
            Math.round(item.receivedQuantity * (0.2 + (line % 3) * 0.18)),
          ),
          item.receivedPrice,
          item.expiryDate,
          sqlDateTime(addDays(day, 2)),
          "demo_staff_stock",
          "Johan Pretorius",
          item.expiryDate && new Date(`${item.expiryDate}T00:00:00.000Z`) < now
            ? "expired"
            : "active",
          line === 2 && month % 4 === 0
            ? "Supplier delivered short."
            : "Demo batch receiving.",
          sqlDateTime(addDays(day, 2)),
          sqlDateTime(addDays(day, 2)),
        ]);
      });
    }
  }
  await insertRows(
    conn,
    "purchase_orders",
    [
      "id",
      "tenant_id",
      "vendor_id",
      "status",
      "type",
      "recurring_frequency",
      "items",
      "total_amount",
      "expected_delivery_date",
      "invoice_status",
      "invoice_number",
      "invoice_date",
      "received_at",
      "received_by",
      "received_by_name",
      "receiving_note",
      "received_total_amount",
      "created_at",
      "updated_at",
    ],
    poRows,
    80,
  );
  await insertRows(
    conn,
    "stock_batches",
    [
      "id",
      "tenant_id",
      "product_id",
      "product_name",
      "purchase_order_id",
      "vendor_id",
      "supplier_invoice_number",
      "supplier_invoice_date",
      "batch_number",
      "received_quantity",
      "remaining_quantity",
      "unit_cost",
      "expiry_date",
      "received_at",
      "received_by",
      "received_by_name",
      "status",
      "note",
      "created_at",
      "updated_at",
    ],
    batchRows,
    100,
  );
  await seedLaybys(conn, tenantId, mode, products, data.completedSaleIds);
  await seedStockTakeRows(conn, tenantId, mode, products);
  await seedReorderAndTasks(conn, tenantId, mode, products, data);
  await seedCashControlRows(conn, tenantId, mode, data);
  await seedAiRows(conn, tenantId, mode, data);
  await seedMessagesAndPayouts(conn, tenantId, mode);
  if (mode === "restaurant") await seedRestaurantFloor(conn, tenantId);
}
async function seedLaybys(
  conn: any,
  tenantId: string,
  mode: DemoSeedMode,
  products: ProductSeed[],
  completedSaleIds: string[],
) {
  const rows: any[][] = [];
  const itemRows: any[][] = [];
  const paymentRows: any[][] = [];
  const eligible = products.filter((p) =>
    mode === "retail" ? p.section !== "Service" : p.price >= 86,
  );
  for (let i = 0; i < 18; i += 1) {
    const created = addDays(baseDate(), -340 + i * 18);
    const productSeed = eligible[i % eligible.length];
    const quantity = i % 5 === 0 ? 2 : 1;
    const subtotal = round(productSeed.price * quantity);
    const tax = round(subtotal * (TAX_RATE / (100 + TAX_RATE)));
    const status =
      i % 7 === 0 ? "cancelled" : i % 4 === 0 ? "active" : "completed";
    const paid =
      status === "completed"
        ? subtotal
        : status === "cancelled"
          ? round(subtotal * 0.2)
          : round(subtotal * (0.35 + (i % 3) * 0.18));
    const id = `demo_layby_${mode}_${i}`;
    rows.push([
      id,
      tenantId,
      `demo_cust_${String((i % customerNames.length) + 1).padStart(3, "0")}`,
      customerNames[i % customerNames.length],
      i % 2 === 0 ? "demo_staff_cashier_a" : "demo_staff_cashier_b",
      i % 2 === 0 ? "Aisha Khan" : "Thabo Dlamini",
      status,
      round(subtotal - tax),
      tax,
      TAX_RATE,
      1,
      subtotal,
      round(subtotal * 0.2),
      paid,
      round(Math.max(0, subtotal - paid)),
      status === "cancelled" ? round(paid * 0.5) : 0,
      status === "cancelled" ? round(paid * 0.5) : 0,
      sqlDate(addDays(created, 60)),
      status === "cancelled" ? "Customer did not complete payments." : null,
      status === "cancelled" ? "demo_staff_mgr" : null,
      status === "cancelled" ? "Naledi Mokoena" : null,
      status === "cancelled" ? sqlDateTime(addDays(created, 45)) : null,
      status === "completed"
        ? completedSaleIds[i % Math.max(1, completedSaleIds.length)] || null
        : null,
      status === "completed" ? "demo_staff_mgr" : null,
      status === "completed" ? "Naledi Mokoena" : null,
      status === "completed" ? sqlDateTime(addDays(created, 42)) : null,
      sqlDateTime(created),
      sqlDateTime(addDays(created, status === "active" ? 20 : 45)),
    ]);
    itemRows.push([
      `demo_layby_item_${mode}_${i}`,
      id,
      productSeed.id,
      productSeed.name,
      productSeed.price,
      quantity,
      quantity,
      sqlDateTime(created),
    ]);
    paymentRows.push([
      `demo_layby_pay_${mode}_${i}_dep`,
      id,
      i % 3 === 0 ? "card" : "cash",
      round(subtotal * 0.2),
      round(subtotal * 0.2),
      0,
      "demo_staff_cashier_a",
      "Aisha Khan",
      null,
      "Deposit",
      sqlDateTime(created),
    ]);
    if (paid > subtotal * 0.2) {
      paymentRows.push([
        `demo_layby_pay_${mode}_${i}_follow`,
        id,
        i % 2 === 0 ? "wallet" : "cash",
        round(paid - subtotal * 0.2),
        round(paid - subtotal * 0.2),
        0,
        "demo_staff_cashier_b",
        "Thabo Dlamini",
        null,
        "Follow-up layby payment",
        sqlDateTime(addDays(created, 21)),
      ]);
    }
  }
  await insertRows(
    conn,
    "layby_orders",
    [
      "id",
      "tenant_id",
      "customer_id",
      "customer_name",
      "staff_id",
      "staff_name",
      "status",
      "subtotal",
      "tax_amount",
      "tax_rate",
      "tax_inclusive",
      "total_amount",
      "deposit_amount",
      "amount_paid",
      "balance_due",
      "refund_amount",
      "forfeited_amount",
      "due_date",
      "cancel_reason",
      "cancelled_by",
      "cancelled_by_name",
      "cancelled_at",
      "completed_sale_id",
      "completed_by",
      "completed_by_name",
      "completed_at",
      "created_at",
      "updated_at",
    ],
    rows,
    80,
  );
  await insertRows(
    conn,
    "layby_items",
    [
      "id",
      "layby_order_id",
      "product_id",
      "product_name",
      "price",
      "quantity",
      "reserved_quantity",
      "created_at",
    ],
    itemRows,
    80,
  );
  await insertRows(
    conn,
    "layby_payments",
    [
      "id",
      "layby_order_id",
      "method",
      "amount",
      "tendered_amount",
      "change_amount",
      "staff_id",
      "staff_name",
      "cash_session_id",
      "note",
      "created_at",
    ],
    paymentRows,
    100,
  );
}
async function seedStockTakeRows(
  conn: any,
  tenantId: string,
  mode: DemoSeedMode,
  products: ProductSeed[],
) {
  const sessionRows: any[][] = [];
  const itemRows: any[][] = [];
  for (let i = 0; i < 16; i += 1) {
    const created = addDays(baseDate(), -350 + i * 23);
    const sessionId = `demo_st_${mode}_${i}`;
    const status =
      i % 5 === 0 ? "submitted" : i % 7 === 0 ? "active" : "approved";
    sessionRows.push([
      sessionId,
      tenantId,
      `${mode === "restaurant" ? "Kitchen and bar" : "Retail floor"} cycle count ${i + 1}`,
      i % 4 === 0 ? "spot_check" : "cycle",
      status,
      "demo_staff_stock",
      "Johan Pretorius",
      sqlDateTime(addDays(created, 2)),
      i % 5 === 0
        ? "Supervisor recount required on one item."
        : "Routine demo stock count.",
      sqlDateTime(created),
      sqlDateTime(addDays(created, 1)),
      status === "approved"
        ? sqlDateTime(addDays(created, 1))
        : status === "submitted"
          ? sqlDateTime(addDays(created, 1))
          : null,
      status === "approved" ? sqlDateTime(addDays(created, 2)) : null,
      status === "approved" ? "demo_staff_mgr" : null,
      status === "approved" ? "Naledi Mokoena" : null,
    ]);
    products
      .slice(i % products.length, (i % products.length) + 5)
      .forEach((p, line) => {
        const expected = p.stock + line * 2;
        const variance =
          line === 2 && i % 5 === 0 ? -3 : line === 3 && i % 6 === 0 ? 2 : 0;
        const counted = expected + variance;
        itemRows.push([
          `demo_sti_${mode}_${i}_${line}`,
          tenantId,
          sessionId,
          p.id,
          p.name,
          p.barcode,
          expected,
          counted,
          variance,
          "demo_staff_stock",
          "Johan Pretorius",
          "demo_staff_stock",
          "Johan Pretorius",
          variance === 0 ? null : variance < 0 ? "missing" : "found_extra",
          variance === 0
            ? null
            : variance < 0
              ? "Missing stock"
              : "Found extra stock",
          Math.abs(variance) >= 3 ? "high" : variance === 0 ? "none" : "low",
          Math.abs(variance) >= 3 ? 1 : 0,
          2,
          Math.abs(variance) >= 3 ? sqlDateTime(addDays(created, 1)) : null,
          Math.abs(variance) >= 3 ? "demo_staff_mgr" : null,
          Math.abs(variance) >= 3 ? "Naledi Mokoena" : null,
          status === "active"
            ? "assigned"
            : Math.abs(variance) >= 3
              ? "recount"
              : "confirmed",
          status === "active" ? null : sqlDateTime(addDays(created, 1)),
          status === "approved" ? sqlDateTime(addDays(created, 2)) : null,
          status === "approved" ? "demo_staff_mgr" : null,
          status === "approved" ? "Naledi Mokoena" : null,
          variance === 0 ? "Count matched." : "Demo variance for reports.",
          sqlDateTime(created),
          sqlDateTime(addDays(created, 1)),
        ]);
      });
  }
  await insertRows(
    conn,
    "stock_take_sessions",
    [
      "id",
      "tenant_id",
      "name",
      "type",
      "status",
      "assigned_by",
      "assigned_by_name",
      "due_at",
      "notes",
      "created_at",
      "updated_at",
      "submitted_at",
      "approved_at",
      "approved_by",
      "approved_by_name",
    ],
    sessionRows,
    80,
  );
  await insertRows(
    conn,
    "stock_take_items",
    [
      "id",
      "tenant_id",
      "session_id",
      "product_id",
      "product_name",
      "barcode",
      "expected_quantity",
      "counted_quantity",
      "variance_quantity",
      "assigned_to",
      "assigned_to_name",
      "counted_by",
      "counted_by_name",
      "variance_reason",
      "variance_reason_label",
      "variance_severity",
      "supervisor_recount_required",
      "supervisor_recount_threshold",
      "supervisor_recount_at",
      "supervisor_recount_by",
      "supervisor_recount_by_name",
      "status",
      "counted_at",
      "confirmed_at",
      "confirmed_by",
      "confirmed_by_name",
      "note",
      "created_at",
      "updated_at",
    ],
    itemRows,
    120,
  );
  await insertRows(
    conn,
    "stock_take_rules",
    [
      "id",
      "tenant_id",
      "name",
      "status",
      "schedule_type",
      "run_time",
      "product_scope",
      "product_count",
      "category",
      "product_ids",
      "assigned_to",
      "assigned_to_name",
      "last_run_for_date",
      "last_run_at",
      "created_by",
      "created_by_name",
      "created_at",
      "updated_at",
    ],
    [
      [
        `demo_strule_${mode}_low`,
        tenantId,
        "Low-stock daily check",
        "active",
        "daily",
        "08:00",
        "low_stock",
        6,
        null,
        json([]),
        "demo_staff_stock",
        "Johan Pretorius",
        sqlDate(baseDate()),
        sqlDateTime(dateAt(baseDate(), 8, 5)),
        "demo_staff_mgr",
        "Naledi Mokoena",
        sqlDateTime(addDays(baseDate(), -220)),
        sqlDateTime(baseDate()),
      ],
      [
        `demo_strule_${mode}_random`,
        tenantId,
        "Random shelf audit",
        "active",
        "daily",
        "15:30",
        "random",
        5,
        null,
        json([]),
        "demo_staff_cashier_b",
        "Thabo Dlamini",
        sqlDate(baseDate()),
        sqlDateTime(dateAt(baseDate(), 15, 33)),
        "demo_staff_stock",
        "Johan Pretorius",
        sqlDateTime(addDays(baseDate(), -120)),
        sqlDateTime(baseDate()),
      ],
    ],
  );
}
async function seedReorderAndTasks(
  conn: any,
  tenantId: string,
  mode: DemoSeedMode,
  products: ProductSeed[],
  data: ReturnType<typeof buildYearData>,
) {
  const lowProducts = products.slice(0, 6);
  await insertRows(
    conn,
    "reorder_recommendations",
    [
      "id",
      "tenant_id",
      "product_id",
      "product_name",
      "status",
      "priority",
      "current_stock",
      "min_stock",
      "target_stock",
      "recommended_quantity",
      "estimated_unit_cost",
      "estimated_total_cost",
      "avg_daily_sales",
      "days_of_cover",
      "vendor_id",
      "location_id",
      "source",
      "evidence",
      "purchase_order_id",
      "requested_by",
      "requested_by_name",
      "approved_by",
      "approved_by_name",
      "approved_at",
      "dismissed_at",
      "created_at",
      "updated_at",
    ],
    lowProducts.map((p, index) => {
      const current = Math.max(
        1,
        Math.round((data.stock.get(p.id) || p.stock) % (p.minStock + 10)),
      );
      const recommended = Math.max(10, p.minStock * 3 - current);
      const status =
        index === 0
          ? "open"
          : index === 1
            ? "in_review"
            : index === 2
              ? "approved"
              : "ordered";
      return [
        `demo_reorder_${mode}_${index}`,
        tenantId,
        p.id,
        p.name,
        status,
        current <= p.minStock ? "critical" : "high",
        current,
        p.minStock,
        p.minStock * 4,
        recommended,
        p.costPrice,
        round(recommended * p.costPrice),
        round(1.5 + index * 0.7, 3),
        14,
        index % 2 === 0 ? "demo_vendor_fresh" : "demo_vendor_general",
        "main",
        index % 2 === 0 ? "sales_velocity" : "min_stock",
        json([
          `Current stock ${current}`,
          `Minimum stock ${p.minStock}`,
          "Generated from one-year demo sales velocity",
        ]),
        status === "ordered" ? `demo_po_${mode}_${index}` : null,
        "demo_staff_stock",
        "Johan Pretorius",
        ["approved", "ordered"].includes(status) ? "demo_staff_mgr" : null,
        ["approved", "ordered"].includes(status) ? "Naledi Mokoena" : null,
        ["approved", "ordered"].includes(status)
          ? sqlDateTime(addDays(baseDate(), -2 - index))
          : null,
        null,
        sqlDateTime(addDays(baseDate(), -7 - index)),
        sqlDateTime(addDays(baseDate(), -1 - index)),
      ];
    }),
  );
  const taskRows = [
    managerTaskRow(
      tenantId,
      `demo_task_low_${mode}`,
      "low_stock",
      "Critical low stock",
      `${lowProducts[0].name} is below its target cover.`,
      "critical",
      "open",
      "reorder",
      `demo_reorder_${mode}_0`,
      null,
      lowProducts[0].id,
      "demo_staff_stock",
      "demo_staff_stock",
      { product: lowProducts[0].name },
      sqlDateTime(addDays(baseDate(), -1))!,
    ),
    managerTaskRow(
      tenantId,
      `demo_task_cash_${mode}`,
      "cash_variance",
      "Cash-up variance",
      "One register closed R25 short after a busy shift.",
      "high",
      "in_review",
      "cash_session",
      data.sessions.find((s) => s.difference !== 0)?.id || data.sessions[0].id,
      null,
      null,
      "demo_staff_mgr",
      "demo_staff_cashier_a",
      { variance: -25 },
      sqlDateTime(addDays(baseDate(), -2))!,
    ),
    managerTaskRow(
      tenantId,
      `demo_task_ai_${mode}`,
      "ai_recommendation",
      "AI sales pattern",
      "Friday nights outperform Mondays; adjust staffing and promo timing.",
      "normal",
      "done",
      "ai_insight",
      `demo_ai_sales_${mode}`,
      null,
      null,
      "demo_staff_mgr",
      "demo_staff_mgr",
      { pattern: "weekend uplift" },
      sqlDateTime(addDays(baseDate(), -4))!,
    ),
    managerTaskRow(
      tenantId,
      `demo_task_stock_${mode}`,
      "stock_variance",
      "Stock variance recount",
      "Cycle count found a material variance on a fast-moving item.",
      "high",
      "approved",
      "stock_take_session",
      `demo_st_${mode}_5`,
      null,
      lowProducts[2].id,
      "demo_staff_stock",
      "demo_staff_stock",
      { varianceQuantity: -3 },
      sqlDateTime(addDays(baseDate(), -8))!,
    ),
    managerTaskRow(
      tenantId,
      `demo_task_offline_${mode}`,
      "offline_sync",
      "Offline sale synced",
      "A mobile checkout synced after network recovery.",
      "normal",
      "dismissed",
      "offline_sync",
      `demo_offline_${mode}`,
      null,
      null,
      "demo_staff_mgr",
      "demo_staff_cashier_b",
      { syncSource: "offline" },
      sqlDateTime(addDays(baseDate(), -3))!,
    ),
  ];
  await insertRows(
    conn,
    "manager_tasks",
    [
      "id",
      "tenant_id",
      "task_type",
      "title",
      "summary",
      "priority",
      "status",
      "source_type",
      "source_id",
      "related_sale_id",
      "related_product_id",
      "assigned_to",
      "requested_by",
      "decided_by",
      "decision_note",
      "details",
      "due_at",
      "resolved_at",
      "created_at",
      "updated_at",
    ],
    [...data.managerTasks, ...taskRows],
    100,
  );
}
async function seedCashControlRows(
  conn: any,
  tenantId: string,
  mode: DemoSeedMode,
  data: ReturnType<typeof buildYearData>,
) {
  const managerRows: any[][] = [];
  const checkpointRows: any[][] = [];
  const custodyRows: any[][] = [];
  for (let i = 0; i < 45; i += 1) {
    const day = addDays(baseDate(), -i);
    const expected = round(
      6500 + (i % 6) * 840 + (mode === "restaurant" ? 1800 : 600),
    );
    const variance = i % 13 === 0 ? -25 : i % 17 === 0 ? 35 : 0;
    checkpointRows.push([
      `demo_close_${mode}_${i}`,
      tenantId,
      sqlDate(day),
      variance === 0 ? "balanced" : "review_needed",
      expected,
      round(expected + variance),
      variance,
      4500,
      i < 1 ? 1800 : 0,
      i % 9 === 0 ? 2600 : 0,
      1200 + i * 4,
      i % 8 === 0 ? 450 : 0,
      i % 6 === 0 ? 180 : 0,
      i % 5 === 0 ? 300 : 0,
      i % 7 === 0 ? 120 : 0,
      i % 10 === 0 ? 1 : 0,
      variance,
      json(
        variance === 0
          ? []
          : [
              {
                type: "pending_cash_up",
                id: `demo_cs_${mode}_${i}`,
                label: "Register variance review",
                variance,
              },
            ],
      ),
      json({ R200: Math.floor(expected / 200), R100: 6, R50: 8, coins: 42 }),
      variance === 0
        ? "Balanced close."
        : "Demo checkpoint requires manager review.",
      "demo_staff_mgr",
      "Naledi Mokoena",
      sqlDateTime(dateAt(day, 22, 15)),
      sqlDateTime(dateAt(day, 22, 10)),
      sqlDateTime(dateAt(day, 22, 15)),
    ]);
    managerRows.push([
      `demo_mcm_drop_${mode}_${i}`,
      tenantId,
      "safe_drop",
      "in",
      round(expected * 0.58),
      null,
      "demo_staff_mgr",
      "Naledi Mokoena",
      null,
      null,
      "manager_float",
      "safe",
      `demo_close_${mode}_${i}`,
      "cash_up",
      "Daily safe drop from demo close.",
      null,
      null,
      json({ R200: Math.floor(expected / 200), R100: 4 }),
      "demo_staff_mgr",
      "Naledi Mokoena",
      sqlDateTime(dateAt(day, 22, 15)),
      "demo_staff_mgr",
      "Naledi Mokoena",
      sqlDateTime(dateAt(day, 22, 16)),
    ]);
  }
  custodyRows.push([
    `demo_custody_${mode}_pending`,
    tenantId,
    "pending_confirmation",
    "register",
    data.sessions.find((s) => s.status === "open")?.id || data.sessions[0].id,
    "Live register",
    "safe",
    "main_safe",
    "Main safe",
    data.sessions.find((s) => s.status === "open")?.id || data.sessions[0].id,
    1800,
    0,
    0,
    json({}),
    "Dinner shift handover awaiting confirmation.",
    "demo_staff_cashier_a",
    "Aisha Khan",
    null,
    null,
    null,
    null,
    null,
    sqlDateTime(addDays(baseDate(), 0)),
    null,
    null,
    sqlDateTime(addDays(baseDate(), 0)),
    sqlDateTime(addDays(baseDate(), 0)),
  ]);
  await insertRows(
    conn,
    "manager_cash_movements",
    [
      "id",
      "tenant_id",
      "movement_type",
      "direction",
      "amount",
      "cash_session_id",
      "staff_id",
      "staff_name",
      "customer_id",
      "customer_name",
      "source_type",
      "cash_source",
      "reference_id",
      "category",
      "note",
      "receipt_attachment_url",
      "receipt_attachment_name",
      "counted_breakdown",
      "approved_by",
      "approved_by_name",
      "approved_at",
      "created_by",
      "created_by_name",
      "created_at",
    ],
    managerRows,
    120,
  );
  await insertRows(
    conn,
    "cash_close_checkpoints",
    [
      "id",
      "tenant_id",
      "business_date",
      "status",
      "expected_physical_cash",
      "counted_physical_cash",
      "variance",
      "manager_float",
      "open_register_cash",
      "pending_cash_up_cash",
      "wallet_liability",
      "pending_payouts",
      "petty_cash_today",
      "wallet_cash_in_today",
      "wallet_cash_out_today",
      "custody_pending_count",
      "custody_variance_today",
      "unresolved_items",
      "counted_breakdown",
      "note",
      "closed_by",
      "closed_by_name",
      "closed_at",
      "created_at",
      "updated_at",
    ],
    checkpointRows,
    120,
  );
  await insertRows(
    conn,
    "cash_custody_transfers",
    [
      "id",
      "tenant_id",
      "status",
      "from_type",
      "from_id",
      "from_name",
      "to_type",
      "to_id",
      "to_name",
      "cash_session_id",
      "expected_amount",
      "counted_amount",
      "variance",
      "counted_breakdown",
      "note",
      "requested_by",
      "requested_by_name",
      "confirmed_by",
      "confirmed_by_name",
      "cancelled_by",
      "cancelled_by_name",
      "cancel_reason",
      "requested_at",
      "confirmed_at",
      "cancelled_at",
      "created_at",
      "updated_at",
    ],
    custodyRows,
  );
}
async function seedAiRows(
  conn: any,
  tenantId: string,
  mode: DemoSeedMode,
  data: ReturnType<typeof buildYearData>,
) {
  const completed = data.sales.filter(
    (s) => s.status === "completed" && s.transactionType === "sale",
  );
  const revenue = round(completed.reduce((sum, s) => sum + s.total, 0));
  const avg = completed.length ? round(revenue / completed.length) : 0;
  const insightRows = [
    [
      `demo_ai_sales_${mode}`,
      tenantId,
      "sales",
      "success",
      "One-year demo revenue baseline",
      `Revenue is R${revenue.toFixed(2)} across ${completed.length} completed demo sales.`,
      `Use the R${avg.toFixed(2)} average order value as the baseline for upsells, staff targets, and promo tests.`,
      json([
        `Completed sales: ${completed.length}`,
        `Revenue: R${revenue.toFixed(2)}`,
        `Average order: R${avg.toFixed(2)}`,
      ]),
      94,
      "open",
      "deterministic",
      sqlDateTime(addDays(baseDate(), -1)),
      sqlDateTime(addDays(baseDate(), -1)),
    ],
    [
      `demo_ai_stock_${mode}`,
      tenantId,
      "stock",
      "warning",
      "Fast movers need cover",
      "Several high-velocity products are near reorder level after busy weekend trading.",
      "Approve the open reorder recommendations or raise target stock before the next peak period.",
      json([
        "Low stock recommendations open",
        "Recent stock variances present",
        "Purchase orders seeded for comparison",
      ]),
      88,
      "open",
      "deterministic",
      sqlDateTime(addDays(baseDate(), -2)),
      sqlDateTime(addDays(baseDate(), -2)),
    ],
    [
      `demo_ai_cash_${mode}`,
      tenantId,
      "cash",
      "info",
      "Cash-up variance pattern",
      "Most demo shifts reconcile cleanly, with occasional small variances for manager workflow testing.",
      "Review disputed cash sessions and confirm whether variance notes are being captured consistently.",
      json([
        "Balanced closes seeded",
        "Disputed shifts seeded",
        "Custody handover pending",
      ]),
      82,
      "open",
      "deterministic",
      sqlDateTime(addDays(baseDate(), -3)),
      sqlDateTime(addDays(baseDate(), -3)),
    ],
    [
      `demo_ai_staff_${mode}`,
      tenantId,
      "staff",
      "success",
      "Staff leaderboard has useful spread",
      "Top sellers, steady operators, and coaching opportunities are all represented in the demo year.",
      "Use staff scores to test coaching notes and leaderboard visibility by role.",
      json([
        "Staff scores seeded",
        "Tips and orders distributed across shifts",
      ]),
      90,
      "done",
      "deterministic",
      sqlDateTime(addDays(baseDate(), -4)),
      sqlDateTime(addDays(baseDate(), -4)),
    ],
    [
      `demo_ai_customer_${mode}`,
      tenantId,
      "customer",
      "info",
      "Account and wallet balances active",
      "Customer accounts, wallet credits, loyalty points, and payout requests are populated.",
      "Use the account-sales and wallet-liability reports to validate customer finance workflows.",
      json([
        "Account customers seeded",
        "Wallet balances seeded",
        "Payout requests seeded",
      ]),
      86,
      "open",
      "deterministic",
      sqlDateTime(addDays(baseDate(), -5)),
      sqlDateTime(addDays(baseDate(), -5)),
    ],
  ];
  if (mode === "restaurant") {
    insightRows.push([
      `demo_ai_restaurant_${mode}`,
      tenantId,
      "restaurant",
      "warning",
      "Dinner queue pressure",
      "Friday and Saturday dinner services carry longer prep and handoff timers.",
      "Schedule an extra pass runner on busy nights and watch stale timer counts in Live view.",
      json([
        "Open kitchen tickets seeded",
        "Bar and kitchen workstations seeded",
        "Table and tab activity seeded",
      ]),
      89,
      "open",
      "deterministic",
      sqlDateTime(addDays(baseDate(), -1)),
      sqlDateTime(addDays(baseDate(), -1)),
    ]);
  }
  await insertRows(
    conn,
    "ai_insights",
    [
      "id",
      "tenant_id",
      "category",
      "severity",
      "title",
      "summary",
      "recommendation",
      "evidence",
      "confidence",
      "status",
      "source",
      "created_at",
      "updated_at",
    ],
    insightRows,
  );
  const scoreRows = Array.from(data.staffStats.entries()).map(
    ([staffId, stats], index) => {
      const handledBoost = Math.min(18, stats.sales / 80);
      const score = Math.max(
        58,
        Math.min(
          98,
          Math.round(
            70 +
              (stats.revenue / Math.max(1, revenue)) * 82 +
              handledBoost -
              index * 2,
          ),
        ),
      );
      const staffName =
        staffId === "demo_staff_mgr"
          ? "Naledi Mokoena"
          : staffId === "demo_staff_cashier_a"
            ? "Aisha Khan"
            : staffId === "demo_staff_cashier_b"
              ? "Thabo Dlamini"
              : staffId === "demo_staff_cashier_c"
                ? "Mila Jacobs"
                : staffId === "demo_staff_stock"
                  ? "Johan Pretorius"
                  : staffId === "demo_staff_chef_a"
                    ? "Lerato Nkosi"
                    : "Marco van Zyl";
      return [
        `demo_score_${mode}_${index}`,
        tenantId,
        staffId,
        staffName,
        sqlDateTime(addDays(baseDate(), -30)),
        sqlDateTime(baseDate()),
        score,
        score >= 90
          ? "A"
          : score >= 78
            ? "B"
            : score >= 65
              ? "C"
              : "Needs Attention",
        json({
          salesThroughput: score,
          cashAccuracy: Math.min(98, score + 4),
          teamwork: Math.min(96, score + 8),
          compliance: Math.min(99, score + 5),
        }),
        json(
          stats.sales > 100
            ? ["Strong sales throughput", "Consistent shift presence"]
            : ["Reliable coverage"],
        ),
        json(
          score < 72
            ? ["Coach on upsell prompts and timer discipline"]
            : ["Keep reinforcing current habits"],
        ),
        json(score >= 90 ? ["Top Seller", "Trusted Cash-Up"] : ["On Track"]),
        json(score < 70 ? ["Needs follow-up"] : []),
        "deterministic",
        sqlDateTime(baseDate()),
      ];
    },
  );
  await insertRows(
    conn,
    "ai_staff_scores",
    [
      "id",
      "tenant_id",
      "staff_id",
      "staff_name",
      "period_start",
      "period_end",
      "score",
      "grade",
      "component_scores",
      "strengths",
      "coaching_notes",
      "badges",
      "risk_flags",
      "source",
      "created_at",
    ],
    scoreRows,
  );
  const runId = `demo_ai_run_${mode}_invoice`;
  await insertRows(
    conn,
    "ai_agent_runs",
    [
      "id",
      "tenant_id",
      "mode",
      "status",
      "summary",
      "requires_human_approval",
      "full_autopilot",
      "requested_by",
      "requested_by_name",
      "warnings",
      "data_access",
      "apply_result",
      "applied_at",
      "created_at",
      "updated_at",
    ],
    [
      [
        runId,
        tenantId,
        "invoice",
        "completed",
        "Demo invoice run created vendors, purchase orders, and stock batches.",
        1,
        0,
        "demo_staff_stock",
        "Johan Pretorius",
        json(["Variance lines require review"]),
        json(["products", "vendors", "purchase_orders", "stock_batches"]),
        json({ createdPurchaseOrder: `demo_po_${mode}_1` }),
        sqlDateTime(addDays(baseDate(), -9)),
        sqlDateTime(addDays(baseDate(), -9)),
        sqlDateTime(addDays(baseDate(), -9)),
      ],
    ],
  );
  await insertRows(
    conn,
    "ai_agent_run_steps",
    [
      "id",
      "tenant_id",
      "run_id",
      "step_id",
      "step_type",
      "label",
      "risk",
      "confidence",
      "approved",
      "status",
      "payload",
      "evidence",
      "result",
      "skip_reason",
      "approved_by",
      "approved_by_name",
      "approved_at",
      "applied_at",
      "created_at",
      "updated_at",
    ],
    [
      [
        `demo_ai_step_${mode}_vendor`,
        tenantId,
        runId,
        "vendor",
        "create_vendor",
        "Matched supplier to demo invoice",
        "low",
        0.94,
        1,
        "applied",
        json({ vendorId: "demo_vendor_general" }),
        json(["Supplier name matched"]),
        json({ vendorId: "demo_vendor_general" }),
        null,
        "demo_staff_mgr",
        "Naledi Mokoena",
        sqlDateTime(addDays(baseDate(), -9)),
        sqlDateTime(addDays(baseDate(), -9)),
        sqlDateTime(addDays(baseDate(), -9)),
        sqlDateTime(addDays(baseDate(), -9)),
      ],
      [
        `demo_ai_step_${mode}_po`,
        tenantId,
        runId,
        "po",
        "create_purchase_order",
        "Created purchase order draft from invoice",
        "medium",
        0.88,
        1,
        "applied",
        json({ purchaseOrderId: `demo_po_${mode}_1` }),
        json(["4 invoice lines read"]),
        json({ purchaseOrderId: `demo_po_${mode}_1` }),
        null,
        "demo_staff_mgr",
        "Naledi Mokoena",
        sqlDateTime(addDays(baseDate(), -9)),
        sqlDateTime(addDays(baseDate(), -9)),
        sqlDateTime(addDays(baseDate(), -9)),
        sqlDateTime(addDays(baseDate(), -9)),
      ],
    ],
  );
}
async function seedMessagesAndPayouts(
  conn: any,
  tenantId: string,
  mode: DemoSeedMode,
) {
  await insertRows(
    conn,
    "messages",
    [
      "id",
      "tenant_id",
      "channel",
      "sender_id",
      "sender_name",
      "sender_role",
      "text",
      "created_at",
      "read_by",
      "is_dev_broadcast",
      "is_system",
    ],
    [
      [
        `demo_msg_${mode}_1`,
        tenantId,
        "general",
        "demo_staff_mgr",
        "Naledi Mokoena",
        "manager",
        "Busy demo weekend loaded. Please watch stock cover and cash-up notes.",
        sqlDateTime(addDays(baseDate(), -3)),
        json(["demo_staff_cashier_a"]),
        0,
        0,
      ],
      [
        `demo_msg_${mode}_2`,
        tenantId,
        "general",
        "system",
        "MasePOS",
        "system",
        "AI insights refreshed from one year of demo trading history.",
        sqlDateTime(addDays(baseDate(), -1)),
        json([]),
        0,
        1,
      ],
      [
        `demo_msg_${mode}_3`,
        tenantId,
        "dm_demo_staff_mgr_demo_staff_stock",
        "demo_staff_stock",
        "Johan Pretorius",
        "manager",
        "Supplier variance captured on the last received order.",
        sqlDateTime(addDays(baseDate(), -6)),
        json(["demo_staff_mgr"]),
        0,
        0,
      ],
    ],
  );
  await insertRows(
    conn,
    "payout_requests",
    [
      "id",
      "tenant_id",
      "staff_id",
      "staff_name",
      "customer_id",
      "customer_name",
      "customer_email",
      "amount",
      "status",
      "created_at",
      "processed_at",
      "processed_by",
      "note",
      "updated_at",
    ],
    [
      [
        `demo_payout_staff_${mode}_1`,
        tenantId,
        "demo_staff_cashier_a",
        "Aisha Khan",
        null,
        null,
        null,
        420,
        "approved",
        sqlDateTime(addDays(baseDate(), -14)),
        sqlDateTime(addDays(baseDate(), -13)),
        "demo_staff_mgr",
        "Tip payout batch",
        sqlDateTime(addDays(baseDate(), -13)),
      ],
      [
        `demo_payout_staff_${mode}_2`,
        tenantId,
        "demo_staff_cashier_b",
        "Thabo Dlamini",
        null,
        null,
        null,
        260,
        "pending",
        sqlDateTime(addDays(baseDate(), -2)),
        null,
        null,
        "Wallet payout request",
        sqlDateTime(addDays(baseDate(), -2)),
      ],
    ],
  );
  await insertRows(
    conn,
    "customer_payout_requests",
    [
      "id",
      "tenant_id",
      "customer_id",
      "customer_name",
      "customer_email",
      "amount",
      "status",
      "created_at",
      "processed_at",
      "processed_by",
      "note",
      "updated_at",
    ],
    [
      [
        `demo_customer_payout_${mode}_1`,
        tenantId,
        "demo_cust_001",
        customerNames[0],
        "sipho.ndlovu@demo-customer.test",
        180,
        "paid",
        sqlDateTime(addDays(baseDate(), -25)),
        sqlDateTime(addDays(baseDate(), -24)),
        "demo_staff_mgr",
        "Wallet cash-out after refund.",
        sqlDateTime(addDays(baseDate(), -24)),
      ],
      [
        `demo_customer_payout_${mode}_2`,
        tenantId,
        "demo_cust_006",
        customerNames[5],
        "lindiwe.naidoo@demo-customer.test",
        95,
        "pending",
        sqlDateTime(addDays(baseDate(), -1)),
        null,
        null,
        "Customer portal payout request.",
        sqlDateTime(addDays(baseDate(), -1)),
      ],
    ],
  );
}
async function seedRestaurantFloor(conn: any, tenantId: string) {
  const sections = [
    ["demo_section_main", tenantId, "Main Floor", "emerald", 1],
    ["demo_section_patio", tenantId, "Patio", "sky", 2],
    ["demo_section_bar", tenantId, "Bar", "amber", 3],
  ];
  const orderColumn = `"order"`;
  await insertRows(
    conn,
    "table_sections",
    [
      "id",
      "tenant_id",
      "name",
      "color",
      orderColumn,
      "created_at",
      "updated_at",
    ],
    sections.map((s) => [
      ...s,
      sqlDateTime(new Date()),
      sqlDateTime(new Date()),
    ]),
  );
  const tables: any[][] = [];
  for (let i = 1; i <= 18; i += 1) {
    const section =
      i <= 10
        ? "demo_section_main"
        : i <= 14
          ? "demo_section_patio"
          : "demo_section_bar";
    tables.push([
      `demo_table_${i}`,
      tenantId,
      section === "demo_section_bar" ? `Bar ${i - 14}` : `Table ${i}`,
      section,
      section === "demo_section_bar" ? 2 : i % 4 === 0 ? 6 : 4,
      "active",
      sqlDateTime(new Date()),
      sqlDateTime(new Date()),
    ]);
  }
  await insertRows(
    conn,
    "restaurant_tables",
    [
      "id",
      "tenant_id",
      "label",
      "section_id",
      "capacity",
      "status",
      "created_at",
      "updated_at",
    ],
    tables,
  );
  await insertRows(
    conn,
    "companion_device_assignments",
    [
      "id",
      "tenant_id",
      "device_id",
      "device_name",
      "workstation_id",
      "default_mode",
      "assigned_by",
      "created_at",
      "updated_at",
    ],
    [
      [
        "demo_device_bar_display",
        tenantId,
        "demo-bar-display",
        "Bar Pole Display",
        "demo_ws_bar",
        "pole_display",
        "demo_staff_mgr",
        sqlDateTime(new Date()),
        sqlDateTime(new Date()),
      ],
      [
        "demo_device_kitchen_tablet",
        tenantId,
        "demo-kitchen-tablet",
        "Kitchen Tablet",
        "demo_ws_kitchen",
        "wireless_scanner",
        "demo_staff_mgr",
        sqlDateTime(new Date()),
        sqlDateTime(new Date()),
      ],
    ],
  );
}
async function updateStaffMetrics(
  conn: any,
  tenantId: string,
  mode: DemoSeedMode,
  data: ReturnType<typeof buildYearData>,
) {
  for (const [staffId, stats] of data.staffStats.entries()) {
    const avgPrepTimeMs = stats.prepCount
      ? Math.round(stats.prepMs / stats.prepCount)
      : 0;
    await conn.query(
      `UPDATE staff SET metrics = $1, badges = $2, updated_at = NOW() WHERE tenant_id = $3 AND id = $4`,
      [
        json({
          totalOrdersHandled: stats.sales,
          totalSales: round(stats.revenue),
          totalTips: round(stats.tips),
          totalTipsRounded: Math.round(stats.tips),
          averagePrepTimeMs: avgPrepTimeMs,
          avgPrepTimeMs,
          averageTurnaroundTimeMs:
            avgPrepTimeMs + (mode === "restaurant" ? 260000 : 45000),
          avgTableTurnaroundMs: mode === "restaurant" ? 54 * 60 * 1000 : 0,
        }),
        json(
          stats.sales > 900
            ? ["Top Seller", "Trusted Cash-Up", "Peak Performer"]
            : stats.sales > 500
              ? ["Reliable Seller", "Cash Safe"]
              : ["On Track"],
        ),
        tenantId,
        staffId,
      ],
    );
  }
}
export async function clearSeededDemoData(tenantId: string): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await clearSeededDemoDataWithConnection(conn, tenantId, true);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
export async function seedDemoData(
  tenantId: string,
  mode: DemoSeedMode,
): Promise<void> {
  const conn = await getConnection();
  const products = mode === "restaurant" ? restaurantProducts : retailProducts;
  const staff = demoStaff(mode);
  const customers = demoCustomers(mode);
  try {
    await conn.beginTransaction();
    await clearSeededDemoDataWithConnection(conn, tenantId, false);
    await updateDemoConfig(
      conn,
      tenantId,
      mode === "restaurant" ? RESTAURANT_CATEGORIES : RETAIL_CATEGORIES,
      mode === "restaurant",
    );
    await seedStaff(conn, tenantId, staff);
    await seedCustomers(conn, tenantId, customers);
    await seedCatalog(conn, tenantId, mode, products);
    const yearData = buildYearData(tenantId, mode, products, staff, customers);
    await persistYearData(conn, tenantId, mode, products, yearData);
    await updateStaffMetrics(conn, tenantId, mode, yearData);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
