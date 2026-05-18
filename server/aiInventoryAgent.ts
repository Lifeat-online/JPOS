import { query } from "./db.js";
import { extractInvoiceWithAi } from "./ai.js";
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

type UploadedDocumentEvidence = {
  name?: string;
  type?: string;
  size?: number;
  dataUrl?: string;
};

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

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "invoice_item";
}

function sameName(a: unknown, b: unknown) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function normalizeInvoiceLine(line: any, index: number) {
  const description = String(line?.productName || line?.description || line?.name || `Invoice line ${index + 1}`).trim();
  const quantity = Math.max(1, toNumber(line?.quantity, 1));
  const unitCost = toNumber(line?.unitCost ?? line?.expectedPrice ?? line?.price, 0);
  const packSize = Math.max(1, toNumber(line?.packSize, 1));
  return {
    description,
    productName: description,
    sku: String(line?.sku || "").trim(),
    barcode: String(line?.barcode || "").trim(),
    quantity,
    unit: String(line?.unit || "items").trim() || "items",
    unitCost,
    lineTotal: toNumber(line?.lineTotal, unitCost * quantity),
    packSize,
    itemType: line?.itemType === "bulk" || packSize > 1 ? "bulk" : "single",
    sellable: line?.sellable !== false,
    confidence: Math.max(0, Math.min(1, toNumber(line?.confidence, 0.65))),
  };
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
  const documents: UploadedDocumentEvidence[] = Array.isArray(body?.documentDataUrls) ? body.documentDataUrls : [];
  const documentCount = documents.length;
  const pdfCount = documents.filter((doc) => String(doc.type || "").includes("pdf") || String(doc.name || "").toLowerCase().endsWith(".pdf")).length;
  const documentNames = documents.map((doc) => doc.name).filter(Boolean).slice(0, 5);
  const notes = String(body?.notes || "").trim();
  let aiExtraction: any = null;
  let aiError = "";
  try {
    aiExtraction = await extractInvoiceWithAi(tenantId, {
      notes,
      images: Array.isArray(body?.imageDataUrls) ? body.imageDataUrls : [],
      documents: documents.filter((doc) => doc.dataUrl) as any,
      context: {
        existingVendors: vendors.map((vendor) => ({ id: vendor.id, name: vendor.name })),
        existingProducts: (products as any[]).slice(0, 200).map((product) => ({ id: product.id, name: product.name, barcode: product.barcode })),
        existingBulkItems: bulkItems.slice(0, 200).map((item) => ({ id: item.id, name: item.name, barcode: item.barcode })),
      },
    });
  } catch (err: any) {
    aiError = err?.message || "AI invoice extraction failed";
  }
  const extractedLines = Array.isArray(aiExtraction?.lines)
    ? aiExtraction.lines.map(normalizeInvoiceLine).filter((line: any) => line.description && line.description !== "Invoice line")
    : [];
  const extractedVendorName = String(aiExtraction?.vendorName || body?.vendorName || "").trim();
  const existingVendor = vendors.find((vendor) => sameName(vendor.name, extractedVendorName));
  const purchaseOrderItems = extractedLines.map((line: any, index: number) => {
    const existingProduct = (products as any[]).find((product) => sameName(product.name, line.productName) || (line.barcode && product.barcode === line.barcode));
    return {
      productId: existingProduct?.id || `pending_${slug(line.productName)}_${index + 1}`,
      productName: line.productName,
      quantity: line.quantity,
      expectedPrice: line.unitCost,
      sku: line.sku,
      barcode: line.barcode,
      lineTotal: line.lineTotal,
      extractedConfidence: line.confidence,
    };
  });
  const uploadEvidence = [
    `${imageCount} invoice image${imageCount === 1 ? "" : "s"} uploaded`,
    `${documentCount} invoice document${documentCount === 1 ? "" : "s"} uploaded`,
    pdfCount ? `${pdfCount} PDF invoice${pdfCount === 1 ? "" : "s"} included` : "No PDF invoice uploaded",
    documentNames.length ? `Files: ${documentNames.join(", ")}` : "No document filenames supplied",
    aiExtraction ? "AI extracted invoice fields from uploaded files" : aiError ? `AI extraction failed: ${aiError}` : "AI extraction did not return invoice fields",
    extractedLines.length ? `${extractedLines.length} invoice line candidate${extractedLines.length === 1 ? "" : "s"} extracted` : "No invoice line candidates extracted",
    notes ? "Manager notes supplied" : "No invoice notes supplied",
  ];
  if (!aiExtraction || (extractedLines.length === 0 && !extractedVendorName)) {
    return {
      id: proposalId(mode),
      mode,
      status: "draft",
      summary: aiError
        ? "AI could not read the invoice because the provider call failed."
        : "AI could not extract usable vendor or line items from this invoice.",
      requiresHumanApproval: true,
      steps: [],
      warnings: [
        aiError ? `AI provider error: ${aiError}` : "No vendor or invoice lines were extracted.",
        "Full autopilot did not apply anything because extraction did not produce safe payloads.",
        "Check the configured AI provider/model supports invoice image or PDF input, then retry.",
      ],
      dataAccess,
    };
  }
  const steps: InventoryAgentStep[] = [
    step(
      "create_vendor",
      existingVendor ? `Use existing vendor: ${existingVendor.name}` : "Create invoice supplier as vendor",
      { vendorId: existingVendor?.id || null, vendorName: extractedVendorName, name: extractedVendorName, contactPerson: "", email: "", phone: "", address: "", status: "active", documentNames },
      uploadEvidence,
      existingVendor ? "low" : "medium",
      extractedVendorName ? 0.78 : (notes || imageCount || documentCount ? 0.48 : 0.32)
    )
  ];

  for (const [index, line] of extractedLines.entries()) {
    const existingBulk = bulkItems.find((item) => sameName(item.name, line.productName) || (line.barcode && item.barcode === line.barcode));
    if (!existingBulk) {
      steps.push(step(
        "create_bulk_item",
        `Create ${line.itemType} stock item: ${line.productName}`,
        {
          name: line.productName,
          itemType: line.itemType,
          unit: line.unit,
          stock: line.quantity * line.packSize,
          minStock: 0,
          costPerUnit: line.packSize > 1 ? line.unitCost / line.packSize : line.unitCost,
          barcode: line.barcode || null,
          packName: line.packSize > 1 ? "Case" : undefined,
          packQuantity: line.packSize,
          singleUnitName: line.unit || "item",
          invoiceLineIndex: index,
        },
        ["AI extracted this line from the uploaded invoice", `Quantity: ${line.quantity}`, `Unit cost: ${line.unitCost}`],
        line.confidence >= 0.75 ? "medium" : "high",
        line.confidence
      ));
    }

    const existingProduct = (products as any[]).find((product) => sameName(product.name, line.productName) || (line.barcode && product.barcode === line.barcode));
    if (!existingProduct && line.sellable) {
      steps.push(step(
        "create_sales_unit",
        `Create sales unit item: ${line.productName}`,
        {
          name: line.productName,
          price: Number((line.unitCost * 1.35).toFixed(2)),
          costPrice: line.unitCost,
          category: "General",
          section: "General",
          stock: line.quantity,
          minStock: 0,
          barcode: line.barcode || undefined,
          invoiceLineIndex: index,
        },
        ["AI marked this line as sellable or did not rule it out", "Selling price defaults to cost plus 35% and can be edited"],
        "high",
        Math.min(line.confidence, 0.68)
      ));
    }
  }

  if (extractedLines.length === 0) {
    steps.push(step(
      "create_bulk_item",
      "Review invoice lines for bulk or single stock items",
      { invoiceLineCandidates: body?.invoiceLines || [], createMissingOnly: true },
      ["AI could not extract line items", "Human must confirm pack size, unit, cost, and barcode before creation", documentCount ? "Invoice documents attached as review evidence" : "No invoice documents attached"],
      "high",
      documentCount || imageCount ? 0.35 : 0.25
    ));
  }

  steps.push(
    step(
      "create_purchase_order",
      extractedLines.length ? `Create draft purchase order from ${extractedLines.length} extracted line${extractedLines.length === 1 ? "" : "s"}` : "Create draft purchase order from approved invoice lines",
      {
        vendorId: existingVendor?.id || null,
        vendorName: extractedVendorName,
        status: "draft",
        type: "once_off",
        items: purchaseOrderItems,
        invoiceNumber: aiExtraction?.invoiceNumber || body?.invoiceNumber || "",
        invoiceDate: aiExtraction?.invoiceDate || body?.invoiceDate || null,
      },
      ["Draft PO is created from AI-extracted invoice lines", documentCount ? "PDF/document invoice can be used during review" : "No document invoice supplied"],
      extractedLines.length ? "medium" : "high",
      extractedLines.length ? 0.72 : 0.34
    ),
    step(
      "receive_invoice",
      "Receive invoice against approved purchase order",
      { invoiceNumber: aiExtraction?.invoiceNumber || body?.invoiceNumber || "", invoiceDate: aiExtraction?.invoiceDate || body?.invoiceDate || null, totals: aiExtraction?.totals || {} },
      [aiExtraction?.invoiceNumber ? `Invoice number: ${aiExtraction.invoiceNumber}` : "Requires invoice number confirmation", pdfCount ? "PDF invoice attached" : "No PDF invoice attached"],
      "medium",
      aiExtraction?.invoiceNumber ? 0.68 : 0.42
    ),
    step(
      "book_stock",
      "Book approved stock quantities into inventory",
      { adjustments: extractedLines.map((line: any) => ({ name: line.productName, quantity: line.quantity * line.packSize, unit: line.unit, cost: line.unitCost })), source: "copilot_invoice" },
      [extractedLines.length ? `${extractedLines.length} stock adjustment candidate${extractedLines.length === 1 ? "" : "s"}` : "Stock movement remains blocked until quantities and units are approved"],
      "high",
      extractedLines.length ? 0.62 : 0.4
    )
  );

  return {
    id: proposalId(mode),
    mode,
    status: "draft",
    summary: extractedLines.length
      ? `AI extracted ${extractedLines.length} invoice line${extractedLines.length === 1 ? "" : "s"}${extractedVendorName ? ` from ${extractedVendorName}` : ""}.`
      : "Prepared an invoice intake workflow, but AI could not extract usable line items.",
    requiresHumanApproval: true,
    steps,
    warnings: [
      "AI invoice extraction is experimental. Confirm vendor, units, pack sizes, costs, and quantities before applying anything.",
      ...(aiError ? [`AI provider error: ${aiError}`] : []),
      ...((Array.isArray(aiExtraction?.warnings) ? aiExtraction.warnings.map(String) : []).slice(0, 4)),
    ],
    dataAccess,
  };
}

export async function applyApprovedInventoryAgentSteps(tenantId: string, steps: InventoryAgentStep[], options: { fullAutopilot?: boolean } = {}): Promise<InventoryAgentApplyResult> {
  const result: InventoryAgentApplyResult = { applied: [], skipped: [] };
  const vendorIdsByName = new Map<string, string>();
  for (const item of steps || []) {
    const approved = options.fullAutopilot || item.approved;
    if (!approved) {
      result.skipped.push({ stepId: item.id, type: item.type, reason: "Step was not approved" });
      continue;
    }

    try {
      if (item.type === "create_vendor") {
        const name = item.payload?.name || item.payload?.vendorName;
        if (item.payload?.vendorId) {
          vendorIdsByName.set(String(name || item.payload.vendorId).toLowerCase(), item.payload.vendorId);
          result.applied.push({ stepId: item.id, type: item.type, result: { id: item.payload.vendorId, existing: true, name } });
          continue;
        }
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
        vendorIdsByName.set(String(name).toLowerCase(), created.id);
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
        const vendorName = String(item.payload.vendorName || "").toLowerCase();
        const vendorId = item.payload.vendorId || (vendorName ? vendorIdsByName.get(vendorName) : null) || null;
        const totalAmount = item.payload.items.reduce((sum: number, line: any) => sum + Number(line.quantity || 0) * Number(line.expectedPrice || 0), 0);
        const created = await createPurchaseOrder(tenantId, {
          vendorId,
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
