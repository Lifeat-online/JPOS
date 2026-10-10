import { createCustomer, createProduct, createStaff, createVendor, getVendors, updateCustomer, updateProduct, updateVendor } from "./db-crud.js";
import { getCustomersByTenant, getProductsByTenant, getStaffByTenant } from "./db-adapter.js";
import { remainingPackageCapacity } from "./packageCapacity.js";
import { assignableStaffRoles } from "./routes/_helpers.js";
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

export const MAX_BATCH_ROWS = 1000;

function rowsFromInput(input: BatchInput) {
  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(input.rows)) rows = input.rows;
  else if (clean(input.csv)) rows = parseCsv(String(input.csv));
  if (rows.length > MAX_BATCH_ROWS) {
    throw new Error(`This file has ${rows.length} rows. Import up to ${MAX_BATCH_ROWS} rows at a time — split the file and try again.`);
  }
  return rows;
}

function packageLimitMessage(noun: string) {
  return `Package limit reached — upgrade your package to add more ${noun}`;
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
  let remaining = rows.length ? await remainingPackageCapacity(tenantId, "products", "maxProducts") : Infinity;

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
    if (remaining <= 0) {
      result.errors.push({ row: rowNumber, message: packageLimitMessage("products"), data: row });
      result.skipped += 1;
      continue;
    }
    remaining -= 1;

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
      // Skip per-row embedding on bulk import; run scripts/backfill-embeddings.ts after.
      const created = await createProduct(tenantId, product as Omit<Product, "id">, { embed: false });
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
  let remaining = rows.length ? await remainingPackageCapacity(tenantId, "customers", "maxCustomers") : Infinity;

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const existing = findCustomer(row, customerIndex);
    const payload = customerPayload(row, existing, actor);
    if (!existing && !clean(payload.name)) {
      result.errors.push({ row: rowNumber, message: "Customer name is required for new customers", data: row });
      result.skipped += 1;
      continue;
    }
    if (!existing) {
      if (remaining <= 0) {
        result.errors.push({ row: rowNumber, message: packageLimitMessage("customers"), data: row });
        result.skipped += 1;
        continue;
      }
      remaining -= 1;
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function importVendors(tenantId: string, input: BatchInput, _actor: BatchActor = {}): Promise<BatchMutationResult> {
  const rows = rowsFromInput(input);
  const dryRun = Boolean(input.dryRun);
  const result: BatchMutationResult = { dryRun, created: 0, updated: 0, skipped: 0, errors: [], rows: [] };
  const existingByName = new Map<string, any>();
  for (const vendor of await getVendors(tenantId) as any[]) existingByName.set(clean(vendor.name).toLowerCase(), vendor);
  const seen = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const fail = (message: string) => {
      result.errors.push({ row: rowNumber, message, data: row });
      result.skipped += 1;
    };
    const name = clean(read(row, ["name", "vendorName", "vendor_name"]));
    if (!name) { fail("Vendor name is required"); continue; }
    const key = name.toLowerCase();
    if (seen.has(key)) { fail("Duplicate vendor name in file"); continue; }
    seen.add(key);
    const email = clean(read(row, ["email"]));
    if (email && !EMAIL_PATTERN.test(email)) { fail("Vendor email is not valid"); continue; }
    const statusText = clean(read(row, ["status"])).toLowerCase();
    if (statusText && statusText !== "active" && statusText !== "inactive") { fail("Status must be active or inactive"); continue; }

    const fields: Record<string, string> = {};
    const contactPerson = clean(read(row, ["contact_person", "contactPerson", "contact"]));
    const phone = clean(read(row, ["phone"]));
    const address = clean(read(row, ["address"]));
    if (contactPerson) fields.contactPerson = contactPerson;
    if (email) fields.email = email;
    if (phone) fields.phone = phone;
    if (address) fields.address = address;
    if (statusText) fields.status = statusText;

    const existing = existingByName.get(key);
    if (existing) {
      if (!dryRun) await updateVendor(tenantId, existing.id, fields);
      result.rows.push({ row: rowNumber, action: dryRun ? "update_vendor" : "updated", id: existing.id, name: existing.name });
      result.updated += 1;
    } else if (dryRun) {
      result.rows.push({ row: rowNumber, action: "create_vendor", id: null, name });
      result.created += 1;
    } else {
      const created = await createVendor(tenantId, { name, status: "active", ...fields } as any);
      existingByName.set(key, created);
      result.rows.push({ row: rowNumber, action: "created", id: created.id, name });
      result.created += 1;
    }
  }

  return result;
}

export async function exportVendorsCsv(tenantId: string): Promise<BatchExportResult> {
  const vendors = await getVendors(tenantId) as any[];
  const headers = ["name", "contact_person", "email", "phone", "address", "status"];
  const rows = vendors.map((vendor) => ({
    name: vendor.name,
    contact_person: vendor.contactPerson || "",
    email: vendor.email || "",
    phone: vendor.phone || "",
    address: vendor.address || "",
    status: vendor.status || "active",
  }));
  return {
    rows,
    csv: toCsv(rows, headers),
    filename: `vendors-${new Date().toISOString().slice(0, 10)}.csv`,
    mimeType: CSV_MIME,
    count: rows.length,
  };
}

const STAFF_ROLES = ["cashier", "chef", "manager", "admin"];

// Only the columns read below are ever used; anything else in the file (password,
// pin, wallet_balance, discount_percent, id_number, permissions…) is ignored.
export async function importStaff(tenantId: string, input: BatchInput, actor: BatchActor = {}): Promise<BatchMutationResult> {
  const rows = rowsFromInput(input);
  const dryRun = Boolean(input.dryRun);
  const result: BatchMutationResult = { dryRun, created: 0, updated: 0, skipped: 0, errors: [], rows: [] };
  const knownEmails = new Set<string>();
  for (const member of await getStaffByTenant(tenantId) as any[]) {
    if (member.email) knownEmails.add(clean(member.email).toLowerCase());
  }
  const allowedRoles = assignableStaffRoles(actor.role);
  let remaining = rows.length ? await remainingPackageCapacity(tenantId, "staff", "maxStaff") : Infinity;

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const fail = (message: string) => {
      result.errors.push({ row: rowNumber, message, data: row });
      result.skipped += 1;
    };
    const name = clean(read(row, ["name"]));
    const email = clean(read(row, ["email"])).toLowerCase();
    const role = clean(read(row, ["role"])).toLowerCase();
    if (!name) { fail("Staff name is required"); continue; }
    if (!email || !EMAIL_PATTERN.test(email)) { fail("A valid staff email is required"); continue; }
    if (!STAFF_ROLES.includes(role)) { fail("Role must be cashier, chef, manager or admin"); continue; }
    if (!allowedRoles.includes(role)) { fail(`Your role can't create ${role} accounts`); continue; }
    const payRateRaw = read(row, ["pay_rate", "payRate"]);
    const payRate = numberOrNull(payRateRaw);
    if (String(payRateRaw).trim() !== "" && (payRate === null || payRate < 0)) { fail("Pay rate must be a number of 0 or more"); continue; }
    const payType = clean(read(row, ["pay_type", "payType"])).toLowerCase();
    if (payType && payType !== "hourly" && payType !== "salary") { fail("Pay type must be hourly or salary"); continue; }
    const status = clean(read(row, ["status"]), "active").toLowerCase();
    if (status !== "active" && status !== "inactive") { fail("Status must be active or inactive"); continue; }
    if (knownEmails.has(email)) { fail("Staff member with this email already exists"); continue; }
    if (remaining <= 0) { fail(packageLimitMessage("staff")); continue; }

    const staff: Record<string, unknown> = { name, email, role, status };
    const phone = clean(read(row, ["phone"]));
    if (phone) staff.phone = phone;
    if (payRate !== null) staff.payRate = payRate;
    if (payType) staff.payType = payType;

    if (dryRun) {
      result.rows.push({ row: rowNumber, action: "create_staff", id: null, name, role });
    } else {
      try {
        const created = await createStaff(tenantId, staff as any);
        result.rows.push({ row: rowNumber, action: "created", id: created.id, name, role });
      } catch {
        fail("Couldn't create this staff member — the email may already be in use");
        continue;
      }
    }
    knownEmails.add(email);
    remaining -= 1;
    result.created += 1;
  }

  return result;
}
