import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import { getProductsByTenant } from "../mariadb-adapter.js";
import { createProduct, updateProduct, deleteProduct } from "../mariadb-crud.js";
import { validateSchema, ProductSchema } from "../validation.js";

export const productsRouter = Router({ mergeParams: true });

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
    res.status(status).json({ error: err.message });
  }
});

productsRouter.post("/", requireAuth, validateSchema(ProductSchema), async (req: any, res) => {
  try {
    const created = await createProduct(req.params.tenantId, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

productsRouter.put("/:productId", requireAuth, validateSchema(ProductSchema), async (req: any, res) => {
  try {
    const updated = await updateProduct(req.params.tenantId, req.params.productId, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

productsRouter.delete("/:productId", requireAuth, async (req: any, res) => {
  try {
    await deleteProduct(req.params.tenantId, req.params.productId);
    res.status(204).end();
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});