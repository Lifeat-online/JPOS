import { createCustomer, createProduct, updateCustomer, updateProduct } from "./db-crud.js";
import { getCustomersByTenant, getProductsByTenant } from "./db-adapter.js";
import { DEFAULT_INVENTORY_LOCATION_ID, listProductLocationStocks, upsertProductLocationStock } from "./inventoryLocations.js";
import type { Customer, Product } from "./types.js";

export type BatchActor = {
  staffId?: string | null;
  staffName?: string | null;
  role?: string | null;
};

export type BatchInput = {
  rows?: Record<string, unknown>[];
  csv?: string | null;
  dryRun?: boolean;
  locationId?: string | null;
};

export type BatchRowError = {
  row: number;
  message: string;
  data?: Record<string, unknown>;
};

export type BatchMutationResult = {
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: BatchRowError[];
  rows: Record<string, unknown>[];
};

export type BatchExportResult = {
  rows: Record<string, unknown>[];
  csv: string;
  filename: string;
  mimeType: string;
  count: number;
};

const CSV_MIME = "text/csv;charset=utf-8";

function clean(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeKey(key: string) {
  return clean(key)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeRow(row: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row || {})) {
    normalized[normalizeKey(key)] = value;
  }
  return normalized;
}

function read(row: Record<string, unknown>, aliases: string[], fallback: unknown = "") {
  const normalized = normalizeRow(row);
  for (const alias of aliases) {
    const value = normalized[normalizeKey(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrDefault(value: unknown, fallback = 0) {
  const parsed = numberOrNull(value);
  return parsed === null ? fallback : parsed;
}

function boolValue(value: unknown) {
  const text = clean(value).toLowerCase();
  return ["1", "true", "yes", "y", "on", "enabled"].includes(text);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[], headers: string[]) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function parseCsv(csv: string) {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => clean(cell))) records.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => clean(cell))) records.push(row);
  if (records.length === 0) return [];
  const headers = records[0].map((header) => clean(header));
  return records.slice(1).map((cells) => {
    const mapped: Record<string, string> = {};
    headers.forEach((header, index) => {
      mapped[header] = clean(cells[index]);
    });
    return mapped;
  });
}

function rowsFromInput(input: BatchInput) {
  if (Array.isArray(input.rows)) return input.rows;
  if (clean(input.csv)) return parseCsv(String(input.csv));
  return [];
}

function indexProducts(products: Product[]) {
  const byId = new Map<string, Product>();
  const byBarcode = new Map<string, Product>();
  const byName = new Map<string, Product>();
  for (const product of products) {
    byId.set(String(product.id), product);
    if (product.barcode) byBarcode.set(clean(product.barcode).toLowerCase(), product);
    byName.set(clean(product.name).toLowerCase(), product);
  }
  return { byId, byBarcode, byName };
}

function findProduct(row: Record<string, unknown>, index: ReturnType<typeof indexProducts>) {
  const id = clean(read(row, ["id", "productId", "product_id"]));
  const barcode = clean(read(row, ["barcode", "sku"])).toLowerCase();
  const name = clean(read(row, ["name", "productName", "product_name"])).toLowerCase();
  return (id ? index.byId.get(id) : null)
    || (barcode ? index.byBarcode.get(barcode) : null)
    || (name ? index.byName.get(name) : null)
    || null;
}

export async function batchCreateProducts(tenantId: string, input: BatchInput, actor: BatchActor = {}): Promise<BatchMutationResult> {
  const rows = rowsFromInput(input);
  const dryRun = Boolean(input.dryRun);
  const result: BatchMutationResult = { dryRun, created: 0, updated: 0, skipped: 0, errors: [], rows: [] };
  const existing = indexProducts(await getProductsByTenant(tenantId, { role: actor.role || "manager" }) as Product[]);

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const name = clean(read(row, ["name", "productName", "product_name"]));
    const price = numberOrNull(read(row, ["price", "sellingPrice", "selling_price"]));
    if (!name) {
      result.errors.push({ row: rowNumber, message: "Product name is required", data: row });
      result.skipped += 1;
      continue;
    }
    if (price === null) {
      result.errors.push({ row: rowNumber, message: "Product price is required", data: row });
      result.skipped += 1;
      continue;
    }
    const barcode = clean(read(row, ["barcode", "sku"]));
    if (existing.byName.has(name.toLowerCase()) || (barcode && existing.byBarcode.has(barcode.toLowerCase()))) {
      result.errors.push({ row: rowNumber, message: "Product already exists by name or barcode", data: row });
      result.skipped += 1;
      continue;
    }

    const product = {
      name,
      price,
      costPrice: numberOrDefault(read(row, ["costPrice", "cost_price", "cost"], 0), 0),
      section: clean(read(row, ["section"], "")) || undefined,
      category: clean(read(row, ["category"], "General"), "General"),
      subCategory: clean(read(row, ["subCategory", "sub_category"], "")) || undefined,
      stock: Math.max(0, numberOrDefault(read(row, ["stock", "quantity"], 0), 0)),
      minStock: Math.max(0, numberOrDefault(read(row, ["minStock", "min_stock"], 0), 0)),
      imageUrl: clean(read(row, ["imageUrl", "image_url"], "")) || undefined,
      barcode: barcode || undefined,
      workstationId: clean(read(row, ["workstationId", "workstation_id"], "")) || undefined,
    };

    if (dryRun) {
      result.rows.push({ row: rowNumber, action: "create", name: product.name, price: product.price, stock: product.stock });
    } else {
      const created = await createProduct(tenantId, product as Omit<Product, "id">);
      existing.byId.set(created.id, created);
      existing.byName.set(created.name.toLowerCase(), created);
      if (created.barcode) existing.byBarcode.set(created.barcode.toLowerCase(), created);
      result.rows.push({ row: rowNumber, action: "created", id: created.id, name: created.name });
    }
    result.created += 1;
  }

  return result;
}

export async function batchUpdateProductPrices(tenantId: string, input: BatchInput, actor: BatchActor = {}): Promise<BatchMutationResult> {
  const rows = rowsFromInput(input);
  const dryRun = Boolean(input.dryRun);
  const result: BatchMutationResult = { dryRun, created: 0, updated: 0, skipped: 0, errors: [], rows: [] };
  const productIndex = indexProducts(await getProductsByTenant(tenantId, { role: actor.role || "manager" }) as Product[]);

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const product = findProduct(row, productIndex);
    if (!product) {
      result.errors.push({ row: rowNumber, message: "Matching product was not found", data: row });
      result.skipped += 1;
      continue;
    }
    const price = numberOrNull(read(row, ["price", "sellingPrice", "selling_price"]));
    const costPrice = numberOrNull(read(row, ["costPrice", "cost_price", "cost"]));
    const updates: Partial<Product> = {};
    if (price !== null) updates.price = price;
    if (costPrice !== null) updates.costPrice = costPrice;
    if (Object.keys(updates).length === 0) {
      result.errors.push({ row: rowNumber, message: "Price or cost price is required", data: row });
      result.skipped += 1;
      continue;
    }
    if (dryRun) {
      result.rows.push({ row: rowNumber, action: "update_price", id: product.id, name: product.name, ...updates });
    } else {
      const updated = await updateProduct(tenantId, product.id, updates);
      result.rows.push({ row: rowNumber, action: "updated", id: updated.id, name: updated.name, price: updated.price, costPrice: updated.costPrice });
    }
    result.updated += 1;
  }

  return result;
}

function indexCustomers(customers: Customer[]) {
  const byId = new Map<string, Customer>();
  const byEmail = new Map<string, Customer>();
  const byPhone = new Map<string, Customer>();
  for (const customer of customers) {
    byId.set(String(customer.id), customer);
    if (customer.email) byEmail.set(clean(customer.email).toLowerCase(), customer);
    if (customer.phone) byPhone.set(clean(customer.phone), customer);
  }
  return { byId, byEmail, byPhone };
}

function findCustomer(row: Record<string, unknown>, index: ReturnType<typeof indexCustomers>) {
  const id = clean(read(row, ["id", "customerId", "customer_id"]));
  const email = clean(read(row, ["email"])).toLowerCase();
  const phone = clean(read(row, ["phone"]));
  return (id ? index.byId.get(id) : null)
    || (email ? index.byEmail.get(email) : null)
    || (phone ? index.byPhone.get(phone) : null)
    || null;
}

function customerPayload(row: Record<string, unknown>, existing?: Customer | null, actor: BatchActor = {}) {
  const payload: Partial<Customer> & Record<string, unknown> = {};
  const fields: Array<[string, string[]]> = [
    ["name", ["name", "customerName", "customer_name"]],
    ["email", ["email"]],
    ["phone", ["phone"]],
    ["address", ["address"]],
    ["notes", ["notes"]],
    ["loyaltyMemberStatus", ["loyaltyMemberStatus", "loyalty_status"]],
    ["membershipCardId", ["membershipCardId", "membership_card_id"]],
    ["membershipBarcode", ["membershipBarcode", "membership_barcode"]],
    ["uid", ["uid"]],
  ];
  for (const [target, aliases] of fields) {
    const value = read(row, aliases, undefined);
    if (value !== undefined && String(value).trim() !== "") payload[target] = clean(value);
  }
  const numericFields: Array<[string, string[]]> = [
    ["loyaltyPoints", ["loyaltyPoints", "points"]],
    ["walletBalance", ["walletBalance", "wallet_balance"]],
    ["accountLimit", ["accountLimit", "account_limit"]],
    ["accountBalance", ["accountBalance", "account_balance"]],
    ["discountPercent", ["discountPercent", "discount_percent"]],
  ];
  for (const [target, aliases] of numericFields) {
    const parsed = numberOrNull(read(row, aliases, undefined));
    if (parsed !== null) payload[target] = Math.max(0, parsed);
  }
  const accountEnabled = read(row, ["accountEnabled", "account_enabled"], undefined);
  if (accountEnabled !== undefined && String(accountEnabled).trim() !== "") payload.accountEnabled = boolValue(accountEnabled);
  payload.consentActor = actor;
  if (!payload.name && existing?.name) payload.name = existing.name;
  return payload;
}

export async function importCustomers(tenantId: string, input: BatchInput, actor: BatchActor = {}): Promise<BatchMutationResult> {
  const rows = rowsFromInput(input);
  const dryRun = Boolean(input.dryRun);
  const result: BatchMutationResult = { dryRun, created: 0, updated: 0, skipped: 0, errors: [], rows: [] };
  const customerIndex = indexCustomers(await getCustomersByTenant(tenantId) as Customer[]);

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const existing = findCustomer(row, customerIndex);
    const payload = customerPayload(row, existing, actor);
    if (!existing && !clean(payload.name)) {
      result.errors.push({ row: rowNumber, message: "Customer name is required for new customers", data: row });
      result.skipped += 1;
      continue;
    }

    if (dryRun) {
      result.rows.push({ row: rowNumber, action: existing ? "update_customer" : "create_customer", id: existing?.id || null, name: payload.name });
    } else if (existing) {
      const updated = await updateCustomer(tenantId, existing.id, payload);
      result.rows.push({ row: rowNumber, action: "updated", id: updated.id, name: updated.name });
      result.updated += 1;
      continue;
    } else {
      const created = await createCustomer(tenantId, payload as Omit<Customer, "id">);
      customerIndex.byId.set(created.id, created);
      if (created.email) customerIndex.byEmail.set(created.email.toLowerCase(), created);
      if (created.phone) customerIndex.byPhone.set(created.phone, created);
      result.rows.push({ row: rowNumber, action: "created", id: created.id, name: created.name });
    }
    if (existing) result.updated += 1;
    else result.created += 1;
  }

  return result;
}

export async function exportCustomersCsv(tenantId: string): Promise<BatchExportResult> {
  const customers = await getCustomersByTenant(tenantId) as Customer[];
  const headers = ["id", "name", "email", "phone", "address", "loyaltyPoints", "walletBalance", "accountEnabled", "accountLimit", "accountBalance", "discountPercent"];
  const rows = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    email: customer.email || "",
    phone: customer.phone || "",
    address: customer.address || "",
    loyaltyPoints: customer.loyaltyPoints ?? customer.points ?? 0,
    walletBalance: customer.walletBalance || 0,
    accountEnabled: customer.accountEnabled ? "yes" : "no",
    accountLimit: customer.accountLimit || 0,
    accountBalance: customer.accountBalance || 0,
    discountPercent: customer.discountPercent || 0,
  }));
  return {
    rows,
    csv: toCsv(rows, headers),
    filename: `customers-${tenantId}.csv`,
    mimeType: CSV_MIME,
    count: rows.length,
  };
}

export async function exportInventoryCsv(tenantId: string, input: { locationId?: string | null } = {}): Promise<BatchExportResult> {
  const products = await getProductsByTenant(tenantId, { role: "manager" }) as Product[];
  const productIndex = indexProducts(products);
  const stocks = await listProductLocationStocks(tenantId, { locationId: input.locationId || null });
  const headers = ["productId", "name", "barcode", "category", "section", "locationId", "locationName", "quantity", "minStock", "reorderThreshold"];
  const rows = stocks.map((stock: any) => {
    const product = productIndex.byId.get(String(stock.productId));
    return {
      productId: stock.productId,
      name: stock.productName || product?.name || "",
      barcode: product?.barcode || "",
      category: stock.category || product?.category || "",
      section: stock.section || product?.section || "",
      locationId: stock.locationId || DEFAULT_INVENTORY_LOCATION_ID,
      locationName: stock.locationName || "",
      quantity: stock.quantity ?? 0,
      minStock: stock.minStock ?? product?.minStock ?? 0,
      reorderThreshold: stock.reorderThreshold ?? stock.minStock ?? product?.minStock ?? 0,
    };
  });
  return {
    rows,
    csv: toCsv(rows, headers),
    filename: `inventory-${tenantId}${input.locationId ? `-${input.locationId}` : ""}.csv`,
    mimeType: CSV_MIME,
    count: rows.length,
  };
}

export async function importInventory(tenantId: string, input: BatchInput, actor: BatchActor = {}): Promise<BatchMutationResult> {
  const rows = rowsFromInput(input);
  const dryRun = Boolean(input.dryRun);
  const result: BatchMutationResult = { dryRun, created: 0, updated: 0, skipped: 0, errors: [], rows: [] };
  const productIndex = indexProducts(await getProductsByTenant(tenantId, { role: actor.role || "manager" }) as Product[]);

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const product = findProduct(row, productIndex);
    const quantity = numberOrNull(read(row, ["quantity", "stock"]));
    if (!product) {
      result.errors.push({ row: rowNumber, message: "Matching product was not found", data: row });
      result.skipped += 1;
      continue;
    }
    if (quantity === null) {
      result.errors.push({ row: rowNumber, message: "Quantity or stock is required", data: row });
      result.skipped += 1;
      continue;
    }
    const locationId = clean(read(row, ["locationId", "location_id"], input.locationId || DEFAULT_INVENTORY_LOCATION_ID), DEFAULT_INVENTORY_LOCATION_ID);
    const minStock = numberOrDefault(read(row, ["minStock", "min_stock"], product.minStock || 0), product.minStock || 0);
    const reorderThreshold = numberOrDefault(read(row, ["reorderThreshold", "reorder_threshold"], minStock), minStock);
    if (dryRun) {
      result.rows.push({ row: rowNumber, action: "update_inventory", id: product.id, name: product.name, locationId, quantity });
    } else {
      const updated = await upsertProductLocationStock(tenantId, {
        productId: product.id,
        locationId,
        quantity: Math.max(0, quantity),
        minStock: Math.max(0, minStock),
        reorderThreshold: Math.max(0, reorderThreshold),
        note: "Batch inventory import",
        staffId: actor.staffId || null,
        staffName: actor.staffName || null,
      });
      result.rows.push({ row: rowNumber, action: "updated", id: product.id, name: product.name, locationId: updated.locationId, quantity: updated.quantity });
    }
    result.updated += 1;
  }

  return result;
}
