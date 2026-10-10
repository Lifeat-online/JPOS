// @vitest-environment node
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  recordAuditEventSafe: vi.fn(),
  requirePackageCapacity: vi.fn(),
  requirePackageFeature: vi.fn(),
}));

vi.mock("../../server/auth-middleware.js", () => ({ requireAuth: (_req: any, _res: any, next: any) => next() }));
vi.mock("../../server/db.js", () => ({ query: mocks.query }));
vi.mock("../../server/db-adapter.js", () => ({
  getProductsByTenant: vi.fn(),
  semanticProductSearch: vi.fn(),
}));
vi.mock("../../server/db-crud.js", () => ({
  createProduct: mocks.createProduct,
  updateProduct: mocks.updateProduct,
  deleteProduct: mocks.deleteProduct,
}));
vi.mock("../../server/audit.js", () => ({ recordAuditEventSafe: mocks.recordAuditEventSafe }));
vi.mock("../../server/packageCapacity.js", () => ({
  requirePackageCapacity: mocks.requirePackageCapacity,
  requirePackageFeature: mocks.requirePackageFeature,
}));

import { productsRouter } from "../../server/routes/products.js";

function appAs(role: string) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { uid: "actor1", staffId: "actor1", tenantId: "t1", role, name: "Actor" };
    next();
  });
  app.use("/t/:tenantId/products", productsRouter);
  return app;
}

const product = { name: "Widget", price: 10 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requirePackageCapacity.mockImplementation(async (_req: any, _res: any, next: any) => next());
  mocks.requirePackageFeature.mockImplementation(() => (_req: any, _res: any, next: any) => next());
  mocks.createProduct.mockImplementation(async (_t: string, input: any) => ({ id: "p_new", ...input }));
  mocks.updateProduct.mockImplementation(async (_t: string, id: string, input: any) => ({ id, ...input }));
  mocks.deleteProduct.mockResolvedValue(undefined);
});

describe("product write routes", () => {
  it("forbids a cashier with empty permissions from creating a product", async () => {
    mocks.query.mockResolvedValue([{ permissions: "{}" }]);
    const res = await request(appAs("cashier")).post("/t/t1/products").send(product);
    expect(res.status).toBe(403);
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it("lets a cashier with canManageInventory create a product", async () => {
    mocks.query.mockResolvedValue([{ permissions: '{"canManageInventory":true}' }]);
    const res = await request(appAs("cashier")).post("/t/t1/products").send(product);
    expect(res.status).toBe(201);
    expect(mocks.createProduct).toHaveBeenCalledTimes(1);
  });

  it("lets a manager create a product without a permissions lookup", async () => {
    const res = await request(appAs("manager")).post("/t/t1/products").send(product);
    expect(res.status).toBe(201);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("forbids a cashier without permission from updating a product", async () => {
    mocks.query.mockResolvedValue([{ permissions: "{}" }]);
    const res = await request(appAs("cashier")).put("/t/t1/products/p1").send(product);
    expect(res.status).toBe(403);
    expect(mocks.updateProduct).not.toHaveBeenCalled();
  });

  it("forbids a cashier without permission from deleting a product", async () => {
    mocks.query.mockResolvedValue([{ permissions: "{}" }]);
    const res = await request(appAs("cashier")).delete("/t/t1/products/p1");
    expect(res.status).toBe(403);
    expect(mocks.deleteProduct).not.toHaveBeenCalled();
  });

  it("only checks the images feature when an imageUrl is sent", async () => {
    await request(appAs("manager")).post("/t/t1/products").send(product);
    expect(mocks.requirePackageFeature).not.toHaveBeenCalled();
    await request(appAs("manager")).post("/t/t1/products").send({ ...product, imageUrl: "https://example.com/a.png" });
    expect(mocks.requirePackageFeature).toHaveBeenCalledWith("images");
  });
});
