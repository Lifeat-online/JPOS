import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import { getProductsByTenant, semanticProductSearch } from "../db-adapter.js";
import { createProduct, updateProduct, deleteProduct } from "../db-crud.js";
import { validateSchema, ProductSchema } from "../validation.js";
import { sendRouteError } from "../securityHardening.js";
import { auditChangedFields, auditRouteEvent, requireStaffPermission } from "./_helpers.js";
import { requirePackageCapacity, requirePackageFeature } from "../packageCapacity.js";

export const productsRouter = Router({ mergeParams: true });

// Semantic (vector) product search. Returns { mode: "semantic", results } when
// pgvector embeddings are configured, or { mode: "unavailable" } so the client
// can fall back to keyword search.
productsRouter.get("/search", requireAuth, async (req: any, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) return res.status(400).json({ error: "Query parameter 'q' is required" });
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const results = await semanticProductSearch(req.params.tenantId, q, limit);
    if (results === null) return res.json({ mode: "unavailable", results: [] });
    res.json({ mode: "semantic", results });
  } catch (err: any) {
    sendRouteError(res, err, req);
  }
});

productsRouter.get("/", requireAuth, async (req: any, res) => {
  try {
    const products = await getProductsByTenant(req.params.tenantId, {
      locationId: typeof req.query.locationId === "string" ? req.query.locationId : null,
      staffId: req.user?.staffId || null,
      role: req.user?.role || null,
    });
    res.json(products);
  } catch (err: any) {
    const status = String(err?.message || "").includes("not assigned") ? 403 : 500;
    sendRouteError(res, err, req, status);
  }
});

const requireInventoryPermission = (action: string) =>
  requireStaffPermission("canManageInventory", action, "Inventory access is required to change products.");

// Image uploads are a package feature; only check it when an image is sent.
const requireImagesWhenPresent = (req: any, res: any, next: any) =>
  req.body?.imageUrl ? requirePackageFeature("images")(req, res, next) : next();

productsRouter.post("/", requireAuth, requireInventoryPermission("products.create"), validateSchema(ProductSchema),
  (req: any, res: any, next: any) => requirePackageCapacity(req, res, next, "products", "maxProducts", "products"),
  requireImagesWhenPresent,
  async (req: any, res) => {
    try {
      const created = await createProduct(req.params.tenantId, req.body);
      await auditRouteEvent(req, "product.created", "product", { name: created?.name || null, price: created?.price ?? null }, created?.id || null, "inventory");
      res.status(201).json(created);
    } catch (err: any) {
      sendRouteError(res, err, req, 400);
    }
  });

productsRouter.put("/:productId", requireAuth, requireInventoryPermission("products.update"), validateSchema(ProductSchema), requireImagesWhenPresent, async (req: any, res) => {
  try {
    const updated = await updateProduct(req.params.tenantId, req.params.productId, req.body);
    await auditRouteEvent(req, "product.updated", "product", {
      name: updated?.name || req.body?.name || null,
      price: req.body?.price ?? null,
      changedFields: auditChangedFields(req.body || {}),
    }, req.params.productId, "inventory");
    res.json(updated);
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});

productsRouter.delete("/:productId", requireAuth, requireInventoryPermission("products.delete"), async (req: any, res) => {
  try {
    await deleteProduct(req.params.tenantId, req.params.productId);
    await auditRouteEvent(req, "product.deleted", "product", {}, req.params.productId, "inventory");
    res.status(204).end();
  } catch (err: any) {
    sendRouteError(res, err, req, 400);
  }
});