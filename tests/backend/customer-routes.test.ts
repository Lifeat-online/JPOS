// @vitest-environment node
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  recordAuditEventSafe: vi.fn(),
  verifySensitiveActionForRequest: vi.fn(),
  remainingPackageCapacity: vi.fn(),
  getTenantPackageContext: vi.fn(),
}));

vi.mock("../../server/auth-middleware.js", () => ({ requireAuth: (_req: any, _res: any, next: any) => next() }));
vi.mock("../../server/db.js", () => ({ query: mocks.query }));
vi.mock("../../server/db-crud.js", () => ({
  createCustomer: mocks.createCustomer,
  updateCustomer: mocks.updateCustomer,
  deleteCustomer: mocks.deleteCustomer,
}));
vi.mock("../../server/audit.js", () => ({ recordAuditEventSafe: mocks.recordAuditEventSafe }));
vi.mock("../../server/sensitiveActions.js", () => ({ verifySensitiveActionForRequest: mocks.verifySensitiveActionForRequest }));
vi.mock("../../server/packageCapacity.js", () => ({
  remainingPackageCapacity: mocks.remainingPackageCapacity,
  getTenantPackageContext: mocks.getTenantPackageContext,
  packageLimitResponse: (res: any, details: any) => res.status(403).json({ error: "Package limit reached", ...details }),
}));

import { customersRouter } from "../../server/routes/customers.js";

function appAs(role: string) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { uid: "actor1", staffId: "actor1", tenantId: "t1", role, name: "Actor" };
    next();
  });
  app.use("/t/:tenantId/customers", customersRouter);
  return app;
}

const auditedActions = () => mocks.recordAuditEventSafe.mock.calls.map((c) => c[0].action);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.remainingPackageCapacity.mockResolvedValue(5);
  mocks.getTenantPackageContext.mockResolvedValue({ package: { id: "starter", maxCustomers: 10 } });
  mocks.verifySensitiveActionForRequest.mockResolvedValue({
    ok: false, status: 428, message: "Re-auth required", actionType: "wallet_adjustment", actionLabel: "Wallet adjustment",
  });
  mocks.createCustomer.mockImplementation(async (_t: string, input: any) => ({ id: "c_new", ...input }));
  mocks.updateCustomer.mockImplementation(async (_t: string, id: string, input: any) => ({ id, ...input }));
  mocks.deleteCustomer.mockResolvedValue({ mode: "anonymized", retainedSaleCount: 0 });
});

describe("customer routes", () => {
  it("requires sensitive re-auth for a cashier changing walletBalance", async () => {
    const res = await request(appAs("cashier")).put("/t/t1/customers/c1").send({ walletBalance: 50 });
    expect(res.status).toBe(428);
    expect(res.body.sensitiveActionRequired).toBe(true);
    expect(mocks.updateCustomer).not.toHaveBeenCalled();
  });

  it("lets a cashier update a non-sensitive field", async () => {
    const res = await request(appAs("cashier")).put("/t/t1/customers/c1").send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(mocks.verifySensitiveActionForRequest).not.toHaveBeenCalled();
    expect(mocks.updateCustomer).toHaveBeenCalledTimes(1);
    expect(auditedActions()).toContain("customer.updated");
  });

  it("forbids a cashier from deleting a customer", async () => {
    const res = await request(appAs("cashier")).delete("/t/t1/customers/c1");
    expect(res.status).toBe(403);
    expect(mocks.deleteCustomer).not.toHaveBeenCalled();
  });

  it("lets a manager delete (anonymize) a customer", async () => {
    const res = await request(appAs("manager")).delete("/t/t1/customers/c1");
    expect(res.status).toBe(200);
    expect(mocks.deleteCustomer).toHaveBeenCalledWith("t1", "c1", expect.objectContaining({ role: "manager" }));
    expect(auditedActions()).toContain("customer.deleted");
  });

  it("returns a package limit error when capacity is exhausted", async () => {
    mocks.remainingPackageCapacity.mockResolvedValue(0);
    const res = await request(appAs("cashier")).post("/t/t1/customers").send({ name: "New Customer" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/package limit/i);
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });

  it("creates a customer when capacity remains", async () => {
    const res = await request(appAs("cashier")).post("/t/t1/customers").send({ name: "New Customer" });
    expect(res.status).toBe(201);
    expect(mocks.createCustomer).toHaveBeenCalledTimes(1);
  });
});
