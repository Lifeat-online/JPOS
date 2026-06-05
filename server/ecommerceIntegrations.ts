import { query } from "./db.js";

type EcommerceExportFilters = {
  includeInactive?: string | boolean | null;
};

type ProductRow = {
  id: string;
  name: string;
  price: number | string;
  costPrice?: number | string | null;
  cost_price?: number | string | null;
  section?: string | null;
  category?: string | null;
  subCategory?: string | null;
  sub_category?: string | null;
  stock: number | string;
  minStock?: number | string | null;
  min_stock?: number | string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  barcode?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number((Number.isFinite(parsed) ? parsed : 0).toFixed(2));
}

function quantity(value: unknown) {
  const parsed = Number(value || 0);
  return Math.max(0, Number((Number.isFinite(parsed) ? parsed : 0).toFixed(3)));
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(header: string[], rows: unknown[][]) {
  return [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
}

function slug(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "product";
}

function sku(row: ProductRow) {
  return clean(row.barcode) || clean(row.id);
}

function categoryPath(row: ProductRow) {
  return [row.section, row.category, row.subCategory ?? row.sub_category]
    .map(clean)
    .filter(Boolean)
    .join(" > ");
}

function normalizedProduct(row: ProductRow) {
  return {
    id: row.id,
    handle: slug(`${row.name}-${row.id}`),
    name: clean(row.name),
    sku: sku(row),
    barcode: clean(row.barcode),
    section: clean(row.section),
    category: clean(row.category) || "Uncategorised",
    subCategory: clean(row.subCategory ?? row.sub_category),
    categoryPath: categoryPath(row) || clean(row.category) || "Uncategorised",
    price: money(row.price),
    costPrice: money(row.costPrice ?? row.cost_price),
    stock: quantity(row.stock),
    minStock: quantity(row.minStock ?? row.min_stock),
    imageUrl: clean(row.imageUrl ?? row.image_url),
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  };
}

function buildTargetExports(products: ReturnType<typeof normalizedProduct>[], generatedDate: string) {
  const shopifyRows = products.map(product => [
    product.handle,
    product.name,
    "",
    "Jimmy POS",
    product.categoryPath,
    product.category,
    [product.section, product.category, product.subCategory].filter(Boolean).join(", "),
    "TRUE",
    "Title",
    "Default Title",
    product.sku,
    product.barcode,
    product.stock,
    product.price,
    product.imageUrl,
    product.stock > 0 ? "active" : "draft",
  ]);

  const wooRows = products.map(product => [
    "",
    "simple",
    product.sku,
    product.name,
    "1",
    "0",
    "visible",
    "",
    "",
    "taxable",
    product.stock > 0 ? "1" : "0",
    product.stock,
    product.price,
    product.categoryPath,
    product.imageUrl,
  ]);

  const takealotRows = products.map(product => [
    product.sku,
    product.name,
    "Jimmy POS",
    product.barcode,
    product.categoryPath,
    product.price,
    product.costPrice,
    product.stock,
    product.imageUrl,
    "2-3 working days",
    product.stock > 0 ? "active" : "out_of_stock",
  ]);

  const targets = [
    {
      targetId: "shopify",
      targetName: "Shopify",
      status: "export_ready",
      filename: `jimmy-pos-shopify-products-${generatedDate}.csv`,
      requiredFields: ["Handle", "Title", "Variant SKU", "Variant Inventory Qty", "Variant Price"],
      header: ["Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags", "Published", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Barcode", "Variant Inventory Qty", "Variant Price", "Image Src", "Status"],
      rows: shopifyRows,
    },
    {
      targetId: "woocommerce",
      targetName: "WooCommerce",
      status: "export_ready",
      filename: `jimmy-pos-woocommerce-products-${generatedDate}.csv`,
      requiredFields: ["Type", "SKU", "Name", "Stock", "Regular price", "Categories"],
      header: ["ID", "Type", "SKU", "Name", "Published", "Is featured?", "Visibility in catalog", "Short description", "Description", "Tax status", "In stock?", "Stock", "Regular price", "Categories", "Images"],
      rows: wooRows,
    },
    {
      targetId: "takealot",
      targetName: "Takealot",
      status: "export_ready",
      filename: `jimmy-pos-takealot-products-${generatedDate}.csv`,
      requiredFields: ["SKU", "Title", "Barcode", "Category", "Selling Price", "Quantity"],
      header: ["SKU", "Title", "Brand", "Barcode", "Category", "Selling Price", "Cost Price", "Quantity", "Image URL", "Leadtime", "Product Status"],
      rows: takealotRows,
    },
  ];

  return targets.map(target => ({
    targetId: target.targetId,
    targetName: target.targetName,
    status: target.status,
    filename: target.filename,
    mimeType: "text/csv",
    requiredFields: target.requiredFields,
    productCount: target.rows.length,
    csv: rowsToCsv(target.header, target.rows),
  }));
}

export async function getEcommerceMarketplaceExport(tenantId: string, filters: EcommerceExportFilters = {}) {
  const includeInactive = filters.includeInactive === true || filters.includeInactive === "true";
  const rows = await query<ProductRow>(
    `SELECT
       id,
       name,
       price,
       cost_price AS costPrice,
       section,
       category,
       sub_category AS subCategory,
       stock,
       min_stock AS minStock,
       image_url AS imageUrl,
       barcode,
       updated_at AS updatedAt
     FROM products
     WHERE tenant_id = ?
     ORDER BY category ASC, name ASC`,
    [tenantId]
  );
  const products = rows.map(normalizedProduct).filter(product => includeInactive || product.stock > 0);
  const generatedAt = new Date().toISOString();
  const generatedDate = generatedAt.slice(0, 10);
  const targetExports = buildTargetExports(products, generatedDate);

  return {
    generatedAt,
    summary: {
      productCount: products.length,
      targetCount: targetExports.length,
      outOfStockCount: products.filter(product => product.stock <= 0).length,
      lowStockCount: products.filter(product => product.stock <= product.minStock).length,
      inventoryValue: money(products.reduce((sum, product) => sum + product.stock * (product.costPrice || product.price), 0)),
      includeInactive,
    },
    targets: targetExports.map(target => ({
      id: target.targetId,
      name: target.targetName,
      status: target.status,
      filename: target.filename,
      requiredFields: target.requiredFields,
      productCount: target.productCount,
    })),
    targetExports,
  };
}
