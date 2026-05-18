import { query } from "./db.js";
import { getProductsByTenant } from "./mariadb-adapter.js";
import { createBulkItem, createProduct, createPurchaseOrder, createVendor, getBulkItems, getVendors } from "./mariadb-crud.js";

type AgentMode = "invoice" | "low_stock" | "event";
type StepType =
  | "create_vendor"
  | "create_bulk_item"
  | "create_sales_unit"
  | "create_purchase_order"
  | "receive_invoice"
  | "book_stock"
  | "review_event_demand";

export interface InventoryAgentStep {
  id: string;
  type: StepType;
  label: string;
  confidence: number;
  risk: "low" | "medium" | "high";
  approved: boolean;
  payload: Record<string, any>;
  evidence: string[];
}

export interface InventoryAgentProposal {
  id: string;
  mode: AgentMode;
  status: "draft";
  summary: string;
  requiresHumanApproval: true;
  steps: InventoryAgentStep[];
  warnings: string[];
  dataAccess: string[];
}

export interface InventoryAgentApplyResult {
  applied: { stepId: string; type: StepType; result: any }[];
  skipped: { stepId: string; type: StepType; reason: string }[];
}

function proposalId(mode: AgentMode) {
  return `agent_${mode}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function step(type: StepType, label: string, payload: Record<string, any>, evidence: string[], risk: InventoryAgentStep["risk"] = "medium", confidence = 0.7): InventoryAgentStep {
  return {
    id: `step_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    label,
    confidence,
    risk,
    approved: false,
    payload,
    evidence,
  };
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getProductVelocity(tenantId: string) {
  const rows = await query<any>(
    `SELECT
       si.product_id AS productId,
       si.product_name AS productName,
       SUM(si.quantity) AS quantitySold,
       COUNT(DISTINCT s.id) AS saleCount,
       MIN(s.created_at) AS firstSoldAt,
       MAX(s.created_at) AS lastSoldAt
     FROM sale_items si
     INNER JOIN sales s ON s.id = si.sale_id
     WHERE s.tenant_id = ?
       AND s.status = 'completed'
       AND s.created_at >= NOW() - INTERVAL '90 days'
     GROUP BY si.product_id, si.product_name`,
    [tenantId]
  ).catch(async () => query<any>(
    `SELECT
       si.product_id AS productId,
       si.product_name AS productName,
       SUM(si.quantity) AS quantitySold,
       COUNT(DISTINCT s.id) AS saleCount,
       MIN(s.created_at) AS firstSoldAt,
       MAX(s.created_at) AS lastSoldAt
     FROM sale_items si
     INNER JOIN sales s ON s.id = si.sale_id
     WHERE s.tenant_id = ?
       AND s.status = 'completed'
       AND s.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     GROUP BY si.product_id, si.product_name`,
    [tenantId]
  ));

  const byProduct = new Map<string, { quantitySold: number; avgDaily: number; saleCount: number }>();
  for (const row of rows) {
    const quantitySold = toNumber(row.quantitySold);
    byProduct.set(row.productId || row.productName, {
      quantitySold,
      avgDaily: quantitySold / 90,
      saleCount: toNumber(row.saleCount),
    });
  }
  return byProduct;
}

export async function generateInventoryAgentProposal(tenantId: string, body: any): Promise<InventoryAgentProposal> {
  const mode = (body?.mode === "low_stock" || body?.mode === "event" || body?.mode === "invoice") ? body.mode : "invoice";
  const [products, bulkItems, vendors] = await Promise.all([
    getProductsByTenant(tenantId),
    getBulkItems(tenantId),
    getVendors(tenantId),
  ]);

  const dataAccess = [
    `${products.length} sales-unit products`,
    `${bulkItems.length} bulk/single stock items`,
    `${vendors.length} vendors`,
    "90 days of completed sales item movement when available",
  ];

  if (mode === "low_stock") {
    const velocity = await getProductVelocity(tenantId);
    const lowProducts = (products as any[]).filter((p) => toNumber(p.stock) <= toNumber(p.minStock, 10));
    const lowBulk = bulkItems.filter((b) => toNumber(b.stock) <= toNumber(b.minStock, 0));
    const items = lowProducts.map((p: any) => {
      const movement = velocity.get(p.id) || velocity.get(p.name);
      const avgDaily = movement?.avgDaily || 0;
      const minStock = toNumber(p.minStock, 10);
      const stock = toNumber(p.stock);
      const target = Math.max(minStock * 2, Math.ceil(avgDaily * 14 + minStock));
      return {
        productId: p.id,
        productName: p.name,
        quantity: Math.max(1, Math.ceil(target - stock)),
        expectedPrice: toNumber(p.costPrice, toNumber(p.price)),
        avgDailySales: Number(avgDaily.toFixed(2)),
        currentStock: stock,
        minStock,
      };
    });

    const steps: InventoryAgentStep[] = [];
    if (items.length) {
      steps.push(step(
        "create_purchase_order",
        `Create draft low-stock purchase order for ${items.length} sales unit item${items.length === 1 ? "" : "s"}`,
        { vendorId: vendors.find((v) => v.status === "active")?.id || null, status: "draft", type: "once_off", items },
        ["Products are at or below minimum stock", "Reorder quantities include 90-day sales velocity where available"],
        "medium",
        0.82
      ));
    }
    for (const item of lowBulk) {
      steps.push(step(
        "create_bulk_item",
        `Review low bulk stock: ${item.name}`,
        { existingBulkItemId: item.id, name: item.name, currentStock: item.stock, minStock: item.minStock, suggestedQuantity: Math.max(1, toNumber(item.minStock) * 2 - toNumber(item.stock)) },
        ["Bulk item is at or below minimum stock"],
        "low",
        0.76
      ));
    }

    return {
      id: proposalId(mode),
      mode,
      status: "draft",
      summary: steps.length ? `Prepared ${steps.length} approval step${steps.length === 1 ? "" : "s"} for low-stock replenishment.` : "No low-stock items were found right now.",
      requiresHumanApproval: true,
      steps,
      warnings: steps.length ? ["Copilot will only create a draft PO after manager approval."] : ["No action proposed."],
      dataAccess,
    };
  }

  if (mode === "event") {
    const event = body?.event || {};
    const expectedPeople = toNumber(event.expectedPeople);
    const steps = [
      step(
        "review_event_demand",
        `Estimate event stock needs for ${expectedPeople || "the expected"} guests`,
        {
          eventName: event.name || "Untitled event",
          expectedPeople,
          eventDate: event.date || null,
          serviceStyle: event.serviceStyle || "mixed",
          menuNotes: event.menuNotes || body?.notes || "",
          assumptions: ["Use recent sales mix as the baseline", "Manager must confirm menu, duration, and service style"],
        },
        ["Manager supplied event details", "Copilot can compare against current stock and sales movement"],
        "medium",
        expectedPeople ? 0.74 : 0.48
      ),
    ];
    return {
      id: proposalId(mode),
      mode,
      status: "draft",
      summary: "Prepared an event demand planning review step.",
      requiresHumanApproval: true,
      steps,
      warnings: ["Event quantities are advisory until menu, expected people, duration, and service style are confirmed."],
      dataAccess,
    };
  }

  const imageCount = Array.isArray(body?.imageDataUrls) ? body.imageDataUrls.length : 0;
  const notes = String(body?.notes || "").trim();
  const steps = [
    step(
      "create_vendor",
      "Review invoice supplier and create vendor if missing",
      { vendorName: body?.vendorName || "", contactPerson: "", email: "", phone: "", address: "", status: "active" },
      [`${imageCount} invoice image${imageCount === 1 ? "" : "s"} uploaded`, notes ? "Manager notes supplied" : "No invoice notes supplied"],
      "high",
      notes || imageCount ? 0.58 : 0.32
    ),
    step(
      "create_bulk_item",
      "Review invoice lines for bulk or single stock items",
      { invoiceLineCandidates: body?.invoiceLines || [], createMissingOnly: true },
      ["Human must confirm pack size, unit, cost, and barcode before creation"],
      "high",
      0.46
    ),
    step(
      "create_purchase_order",
      "Create draft purchase order from approved invoice lines",
      { vendorId: null, status: "draft", type: "once_off", items: [] },
      ["Draft PO is created only after vendor and item lines are approved"],
      "medium",
      0.44
    ),
    step(
      "receive_invoice",
      "Receive invoice against approved purchase order",
      { invoiceNumber: body?.invoiceNumber || "", invoiceDate: body?.invoiceDate || null },
      ["Requires invoice number/date confirmation"],
      "medium",
      0.42
    ),
    step(
      "book_stock",
      "Book approved stock quantities into inventory",
      { adjustments: [], source: "copilot_invoice" },
      ["Stock movement remains blocked until quantities and units are approved"],
      "high",
      0.4
    ),
  ];

  return {
    id: proposalId(mode),
    mode,
    status: "draft",
    summary: "Prepared an invoice intake workflow with human approval required at every step.",
    requiresHumanApproval: true,
    steps,
    warnings: ["Invoice image extraction is experimental. Confirm vendor, units, pack sizes, costs, and quantities before applying anything."],
    dataAccess,
  };
}

export async function applyApprovedInventoryAgentSteps(tenantId: string, steps: InventoryAgentStep[]): Promise<InventoryAgentApplyResult> {
  const result: InventoryAgentApplyResult = { applied: [], skipped: [] };
  for (const item of steps || []) {
    if (!item.approved) {
      result.skipped.push({ stepId: item.id, type: item.type, reason: "Step was not approved" });
      continue;
    }

    try {
      if (item.type === "create_vendor") {
        const name = item.payload?.name || item.payload?.vendorName;
        if (!name) {
          result.skipped.push({ stepId: item.id, type: item.type, reason: "Vendor name is required" });
          continue;
        }
        const created = await createVendor(tenantId, {
          name,
          contactPerson: item.payload?.contactPerson || "",
          email: item.payload?.email || "",
          phone: item.payload?.phone || "",
          address: item.payload?.address || "",
          status: "active",
        });
        result.applied.push({ stepId: item.id, type: item.type, result: created });
        continue;
      }

      if (item.type === "create_bulk_item") {
        if (item.payload?.existingBulkItemId) {
          result.skipped.push({ stepId: item.id, type: item.type, reason: "Existing bulk item review does not mutate stock" });
          continue;
        }
        if (!item.payload?.name) {
          result.skipped.push({ stepId: item.id, type: item.type, reason: "Bulk item name is required" });
          continue;
        }
        const created = await createBulkItem(tenantId, {
          name: item.payload.name,
          itemType: item.payload.itemType || "single",
          unit: item.payload.unit || "items",
          stock: Number(item.payload.stock || 0),
          minStock: Number(item.payload.minStock || 0),
          costPerUnit: Number(item.payload.costPerUnit || 0),
          barcode: item.payload.barcode || null,
          packName: item.payload.packName || undefined,
          packQuantity: Number(item.payload.packQuantity || 1),
          singleUnitName: item.payload.singleUnitName || "item",
        });
        result.applied.push({ stepId: item.id, type: item.type, result: created });
        continue;
      }

      if (item.type === "create_sales_unit") {
        if (!item.payload?.name) {
          result.skipped.push({ stepId: item.id, type: item.type, reason: "Sales unit name is required" });
          continue;
        }
        const created = await createProduct(tenantId, {
          name: item.payload.name,
          price: Number(item.payload.price || 0),
          costPrice: Number(item.payload.costPrice || 0),
          category: item.payload.category || "General",
          section: item.payload.section || "General",
          subCategory: item.payload.subCategory || undefined,
          stock: Number(item.payload.stock || 0),
          minStock: Number(item.payload.minStock || 0),
          imageUrl: item.payload.imageUrl || undefined,
          barcode: item.payload.barcode || undefined,
          workstationId: item.payload.workstationId || undefined,
        } as any);
        result.applied.push({ stepId: item.id, type: item.type, result: created });
        continue;
      }

      if (item.type === "create_purchase_order") {
        if (!Array.isArray(item.payload?.items) || item.payload.items.length === 0) {
          result.skipped.push({ stepId: item.id, type: item.type, reason: "Purchase order needs at least one approved item" });
          continue;
        }
        const totalAmount = item.payload.items.reduce((sum: number, line: any) => sum + Number(line.quantity || 0) * Number(line.expectedPrice || 0), 0);
        const created = await createPurchaseOrder(tenantId, {
          vendorId: item.payload.vendorId || null,
          status: "draft",
          type: item.payload.type || "once_off",
          items: item.payload.items,
          totalAmount,
          expectedDeliveryDate: item.payload.expectedDeliveryDate || null,
        });
        result.applied.push({ stepId: item.id, type: item.type, result: created });
        continue;
      }

      result.skipped.push({ stepId: item.id, type: item.type, reason: "This step remains review-only until audited stock receiving is added" });
    } catch (err: any) {
      result.skipped.push({ stepId: item.id, type: item.type, reason: err?.message || "Step failed" });
    }
  }
  return result;
}
