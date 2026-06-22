import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import {
  getTableSectionsByTenant, getRestaurantTablesByTenant,
  createTableSection, updateTableSection, deleteTableSection,
  createRestaurantTable, updateRestaurantTable, deleteRestaurantTable,
} from "../mariadb-adapter.js";
import { validateSchema, TableSectionSchema, RestaurantTableSchema } from "../validation.js";

export const tablesRouter = Router({ mergeParams: true });

tablesRouter.get("/table-sections", requireAuth, async (req: any, res) => {
  try { res.json(await getTableSectionsByTenant(req.params.tenantId)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

tablesRouter.post("/table-sections", requireAuth, validateSchema(TableSectionSchema), async (req: any, res) => {
  try { res.json(await createTableSection(req.params.tenantId, req.body)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

tablesRouter.put("/table-sections/:id", requireAuth, validateSchema(TableSectionSchema), async (req: any, res) => {
  try { res.json(await updateTableSection(req.params.tenantId, req.params.id, req.body)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

tablesRouter.delete("/table-sections/:id", requireAuth, async (req: any, res) => {
  try { await deleteTableSection(req.params.tenantId, req.params.id); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

tablesRouter.get("/restaurant-tables", requireAuth, async (req: any, res) => {
  try { res.json(await getRestaurantTablesByTenant(req.params.tenantId)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

tablesRouter.post("/restaurant-tables", requireAuth, validateSchema(RestaurantTableSchema), async (req: any, res) => {
  try { res.json(await createRestaurantTable(req.params.tenantId, req.body)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

tablesRouter.put("/restaurant-tables/:id", requireAuth, validateSchema(RestaurantTableSchema), async (req: any, res) => {
  try { res.json(await updateRestaurantTable(req.params.tenantId, req.params.id, req.body)); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

tablesRouter.delete("/restaurant-tables/:id", requireAuth, async (req: any, res) => {
  try { await deleteRestaurantTable(req.params.tenantId, req.params.id); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});
