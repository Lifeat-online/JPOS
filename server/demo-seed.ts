import { getConnection } from "./db.js";

export type DemoSeedMode = "retail" | "restaurant";

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

const retailProducts = [
  ["demo_prod_retail_phone", "Smartphone A14", 3499, 2750, "Retail", "Electronics", "Mobile", 18, 4, "DEMO-RET-001"],
  ["demo_prod_retail_earbuds", "Wireless Earbuds", 699, 420, "Retail", "Electronics", "Audio", 36, 8, "DEMO-RET-002"],
  ["demo_prod_retail_charger", "USB-C Fast Charger", 249, 110, "Retail", "Electronics", "Accessories", 64, 12, "DEMO-RET-003"],
  ["demo_prod_retail_keyboard", "Bluetooth Keyboard", 499, 290, "Retail", "Electronics", "Computing", 14, 3, "DEMO-RET-004"],
  ["demo_prod_retail_milk", "Full Cream Milk 2L", 34, 24, "Retail", "Groceries", "Dairy", 44, 10, "DEMO-RET-005"],
  ["demo_prod_retail_bread", "Brown Bread Loaf", 18, 12, "Retail", "Groceries", "Bakery", 38, 12, "DEMO-RET-006"],
  ["demo_prod_retail_apples", "Apples 1kg Bag", 29, 18, "Retail", "Groceries", "Produce", 22, 6, "DEMO-RET-007"],
  ["demo_prod_retail_rice", "Rice 2kg", 46, 32, "Retail", "Groceries", "Pantry", 52, 8, "DEMO-RET-008"],
  ["demo_prod_retail_detergent", "Laundry Detergent 1kg", 79, 53, "Retail", "Groceries", "Household", 30, 6, "DEMO-RET-009"],
  ["demo_prod_retail_tshirt", "Plain T-Shirt", 129, 66, "Retail", "Clothing", "Men", 40, 8, "DEMO-RET-010"],
  ["demo_prod_retail_dress", "Summer Dress", 299, 160, "Retail", "Clothing", "Women", 16, 4, "DEMO-RET-011"],
  ["demo_prod_retail_sneakers", "Canvas Sneakers", 399, 245, "Retail", "Clothing", "Footwear", 20, 5, "DEMO-RET-012"],
  ["demo_prod_retail_mug", "Ceramic Mug Set", 149, 78, "Retail", "Home Decor", "Kitchenware", 24, 5, "DEMO-RET-013"],
  ["demo_prod_retail_lamp", "Desk Lamp", 259, 150, "Retail", "Home Decor", "Lighting", 12, 3, "DEMO-RET-014"],
  ["demo_prod_retail_repair", "Phone Screen Repair", 899, 520, "Service", "Repair", "Mobile", 999, 0, "DEMO-RET-015"],
];

const workstations = [
  ["demo_ws_bar", "Demo Bar", "bar"],
  ["demo_ws_kitchen", "Demo Kitchen", "kitchen"],
];

const bulkItems = [
  ["demo_bulk_brandy_ml", "House Brandy Pour Stock", "single", "ml", 18000, 3000, 0.18, "DEMO-BULK-BRANDY-ML", null, 1, "ml"],
  ["demo_bulk_brandy_bottle", "House Brandy 750ml Bottle", "single", "bottles", 18, 4, 135, "DEMO-BULK-BRANDY-BOTTLE", null, 1, "bottle"],
  ["demo_bulk_brandy_case", "House Brandy Case", "bulk", "cases", 3, 1, 1440, "DEMO-BULK-BRANDY-CASE", "Case", 12, "bottle"],
  ["demo_bulk_beer_bottle", "Lager Bottle 330ml", "single", "bottles", 96, 24, 9, "DEMO-BULK-BEER-BOTTLE", null, 1, "bottle"],
  ["demo_bulk_beer_case", "Lager Case", "bulk", "cases", 6, 2, 205, "DEMO-BULK-BEER-CASE", "Case", 24, "bottle"],
  ["demo_bulk_draught_lager", "Draught Lager Keg", "single", "ml", 30000, 5000, 0.035, "DEMO-BULK-DRAUGHT", null, 1, "ml"],
  ["demo_bulk_red_wine_ml", "House Red Wine", "single", "ml", 9000, 1500, 0.12, "DEMO-BULK-WINE-RED", null, 1, "ml"],
  ["demo_bulk_gin_ml", "House Gin", "single", "ml", 6000, 1000, 0.16, "DEMO-BULK-GIN", null, 1, "ml"],
  ["demo_bulk_tonic_can", "Tonic Water Can", "single", "cans", 48, 12, 7, "DEMO-BULK-TONIC", null, 1, "can"],
  ["demo_bulk_buns", "Burger Buns", "single", "items", 60, 12, 3.5, "DEMO-BULK-BUNS", null, 1, "bun"],
  ["demo_bulk_beef_patties", "Beef Patties", "single", "items", 45, 10, 14, "DEMO-BULK-BEEF", null, 1, "patty"],
  ["demo_bulk_chicken_fillets", "Chicken Fillets", "single", "items", 36, 8, 12, "DEMO-BULK-CHICKEN", null, 1, "fillet"],
  ["demo_bulk_cheese", "Cheese Slices", "single", "items", 100, 20, 2.2, "DEMO-BULK-CHEESE", null, 1, "slice"],
  ["demo_bulk_chips_kg", "Frozen Chips", "single", "kg", 25, 5, 32, "DEMO-BULK-CHIPS", null, 1, "kg"],
  ["demo_bulk_steak", "Sirloin Steak 250g", "single", "items", 24, 6, 46, "DEMO-BULK-STEAK", null, 1, "steak"],
  ["demo_bulk_coffee_g", "Coffee Beans", "single", "g", 5000, 800, 0.22, "DEMO-BULK-COFFEE", null, 1, "g"],
  ["demo_bulk_milk_ml", "Barista Milk", "single", "ml", 12000, 2000, 0.018, "DEMO-BULK-MILK", null, 1, "ml"],
  ["demo_bulk_eggs", "Large Eggs", "single", "items", 90, 18, 2.5, "DEMO-BULK-EGGS", null, 1, "egg"],
  ["demo_bulk_bacon", "Bacon Rashers", "single", "items", 80, 16, 3.8, "DEMO-BULK-BACON", null, 1, "rasher"],
];

const restaurantProducts = [
  ["demo_prod_lager_single", "Lager Bottle 330ml", 28, 9, "Bar", "Beer", "Single", 96, 24, "DEMO-BAR-001", "demo_ws_bar", [["demo_bulk_beer_bottle", 1]]],
  ["demo_prod_lager_case", "Lager Case 24", 420, 205, "Bar", "Beer", "Case", 6, 2, "DEMO-BAR-002", "demo_ws_bar", [["demo_bulk_beer_case", 1]]],
  ["demo_prod_draught_lager", "Draught Lager 500ml", 42, 17.5, "Bar", "Beer", "Draught", 60, 10, "DEMO-BAR-003", "demo_ws_bar", [["demo_bulk_draught_lager", 500]]],
  ["demo_prod_brandy_single", "House Brandy Single", 32, 9, "Bar", "Spirits", "Single", 120, 20, "DEMO-BAR-004", "demo_ws_bar", [["demo_bulk_brandy_ml", 50]]],
  ["demo_prod_brandy_bottle", "House Brandy Bottle", 260, 135, "Bar", "Spirits", "Bottle", 18, 4, "DEMO-BAR-005", "demo_ws_bar", [["demo_bulk_brandy_bottle", 1]]],
  ["demo_prod_brandy_case", "House Brandy Case 12", 2850, 1440, "Bar", "Spirits", "Case", 3, 1, "DEMO-BAR-006", "demo_ws_bar", [["demo_bulk_brandy_case", 1]]],
  ["demo_prod_red_wine_glass", "House Red Wine Glass", 48, 18, "Bar", "Wine", "Glass", 48, 8, "DEMO-BAR-007", "demo_ws_bar", [["demo_bulk_red_wine_ml", 150]]],
  ["demo_prod_gin_tonic", "Gin & Tonic", 58, 15, "Bar", "Cocktails", "Classic", 48, 8, "DEMO-BAR-008", "demo_ws_bar", [["demo_bulk_gin_ml", 50], ["demo_bulk_tonic_can", 1]]],
  ["demo_prod_cheeseburger", "Classic Cheeseburger", 89, 23.7, "Kitchen", "Burgers", "Beef", 45, 10, "DEMO-KIT-001", "demo_ws_kitchen", [["demo_bulk_buns", 1], ["demo_bulk_beef_patties", 1], ["demo_bulk_cheese", 1]]],
  ["demo_prod_chicken_burger", "Grilled Chicken Burger", 86, 15.5, "Kitchen", "Burgers", "Chicken", 36, 8, "DEMO-KIT-002", "demo_ws_kitchen", [["demo_bulk_buns", 1], ["demo_bulk_chicken_fillets", 1]]],
  ["demo_prod_fries", "Basket of Chips", 38, 8, "Kitchen", "Sides", "Chips", 80, 15, "DEMO-KIT-003", "demo_ws_kitchen", [["demo_bulk_chips_kg", 0.25]]],
  ["demo_prod_steak", "Sirloin Steak Plate", 169, 54, "Kitchen", "Mains", "Grill", 24, 6, "DEMO-KIT-004", "demo_ws_kitchen", [["demo_bulk_steak", 1], ["demo_bulk_chips_kg", 0.25]]],
  ["demo_prod_americano", "Americano", 28, 4.4, "Kitchen", "Breakfast", "Cafe", 120, 20, "DEMO-KIT-005", "demo_ws_kitchen", [["demo_bulk_coffee_g", 20]]],
  ["demo_prod_cappuccino", "Cappuccino", 36, 8, "Kitchen", "Breakfast", "Cafe", 80, 15, "DEMO-KIT-006", "demo_ws_kitchen", [["demo_bulk_coffee_g", 20], ["demo_bulk_milk_ml", 200]]],
  ["demo_prod_breakfast", "Farmhouse Breakfast", 98, 25.1, "Kitchen", "Breakfast", "Hot Breakfast", 45, 10, "DEMO-KIT-007", "demo_ws_kitchen", [["demo_bulk_eggs", 2], ["demo_bulk_bacon", 2], ["demo_bulk_buns", 1]]],
];

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
  return LEGACY_SAMPLE_PRODUCTS
    .map(() => "(barcode = ? AND name = ? AND category = ? AND COALESCE(section, '') = COALESCE(?, ''))")
    .join(" OR ");
}

function legacyWhereValues() {
  return LEGACY_SAMPLE_PRODUCTS.flatMap(([name, barcode, category, section]) => [barcode, name, category, section]);
}

async function updateDemoConfig(conn: any, tenantId: string, categories: any, isRestaurantMode: boolean) {
  const [rows] = await conn.query(`SELECT business FROM app_settings WHERE tenant_id = ? LIMIT 1`, [tenantId]);
  const currentBusiness = safeParse(rows[0]?.business, {});
  await conn.query(
    `UPDATE app_settings SET business = ?, categories = ?, updated_at = NOW() WHERE tenant_id = ?`,
    [JSON.stringify({ ...currentBusiness, isRestaurantMode }), JSON.stringify(categories), tenantId]
  );
}

async function clearSeededDemoDataWithConnection(conn: any, tenantId: string, resetSettings: boolean) {
  const legacyClause = legacyWhereClause();
  const legacyValues = legacyWhereValues();

  await conn.query(`DELETE FROM product_modifiers WHERE product_id LIKE 'demo_prod_%'`);
  await conn.query(`DELETE FROM product_recipes WHERE product_id LIKE 'demo_prod_%'`);
  await conn.query(
    `DELETE FROM product_recipes WHERE product_id IN (
       SELECT id FROM products
       WHERE tenant_id = ? AND (id LIKE 'demo_prod_%' OR barcode LIKE 'DEMO-%' OR ${legacyClause})
     )`,
    [tenantId, ...legacyValues]
  );
  await conn.query(
    `DELETE FROM products WHERE tenant_id = ? AND (id LIKE 'demo_prod_%' OR barcode LIKE 'DEMO-%' OR ${legacyClause})`,
    [tenantId, ...legacyValues]
  );
  await conn.query(`DELETE FROM bulk_items WHERE tenant_id = ? AND (id LIKE 'demo_bulk_%' OR barcode LIKE 'DEMO-BULK-%')`, [tenantId]);
  await conn.query(`DELETE FROM workstations WHERE tenant_id = ? AND id LIKE 'demo_ws_%'`, [tenantId]);

  if (resetSettings) {
    await updateDemoConfig(conn, tenantId, RETAIL_CATEGORIES, false);
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

export async function seedDemoData(tenantId: string, mode: DemoSeedMode): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await clearSeededDemoDataWithConnection(conn, tenantId, false);
    await updateDemoConfig(conn, tenantId, mode === "restaurant" ? RESTAURANT_CATEGORIES : RETAIL_CATEGORIES, mode === "restaurant");

    if (mode === "restaurant") {
      for (const [id, name, type] of workstations) {
        await conn.query(
          `INSERT INTO workstations (id, tenant_id, name, type, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', NOW(), NOW())`,
          [id, tenantId, name, type]
        );
      }

      for (const item of bulkItems) {
        await conn.query(
          `INSERT INTO bulk_items (
             id, tenant_id, name, item_type, unit, stock, min_stock, cost_per_unit,
             barcode, pack_name, pack_quantity, single_unit_name, created_at, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [item[0], tenantId, item[1], item[2], item[3], item[4], item[5], item[6], item[7], item[8], item[9], item[10]]
        );
      }

      for (const p of restaurantProducts) {
        await conn.query(
          `INSERT INTO products (
            id, tenant_id, name, price, cost_price, section, category, sub_category,
            stock, min_stock, barcode, workstation_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [p[0], tenantId, p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10]]
        );

        for (const [bulkItemId, quantity] of p[11] as Array<[string, number]>) {
          await conn.query(
            `INSERT INTO product_recipes (product_id, bulk_item_id, quantity) VALUES (?, ?, ?)`,
            [p[0], bulkItemId, quantity]
          );
        }
      }
    } else {
      for (const p of retailProducts) {
        await conn.query(
          `INSERT INTO products (
            id, tenant_id, name, price, cost_price, section, category, sub_category,
            stock, min_stock, barcode, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [p[0], tenantId, p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9]]
        );
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
