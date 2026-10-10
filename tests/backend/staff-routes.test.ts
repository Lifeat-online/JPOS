// @vitest-environment node
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  createStaff: vi.fn(),
  updateStaff: vi.fn(),
  deleteStaff: vi.fn(),
  recordAuditEventSafe: vi.fn(),
  verifySensitiveActionForRequest: vi.fn(),
  remainingPackageCapacity: vi.fn(),
  getTenantPackageContext: vi.fn(),
}));

vi.mock("../../server/auth-middleware.js", () => ({ requireAuth: (_req: any, _res: any, next: any) => next() }));
vi.mock("../../server/db.js", () => ({ query: mocks.query }));
vi.mock("../../server/db-crud.js", () => ({
  createStaff: mocks.createStaff,
  updateStaff: mocks.updateStaff,
  deleteStaff: mocks.deleteStaff,
}));
vi.mock("../../server/audit.js", () => ({ recordAuditEventSafe: mocks.recordAuditEventSafe }));
vi.mock("../../server/sensitiveActions.js", () => ({ verifySensitiveActionForRequest: mocks.verifySensitiveActionForRequest }));
vi.mock("../../server/packageCapacity.js", () => ({
  remainingPackageCapacity: mocks.remainingPackageCapacity,
  getTenantPackageContext: mocks.getTenantPackageContext,
  packageLimitResponse: (res: any, details: any) => res.status(403).json({ error: "Package limit reached", ...details }),
}));

import { staffRouter } from "../../server/routes/staff.js";

function appAs(role: string) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { uid: "actor1", staffId: "actor1", tenantId: "t1", role, name: "Actor" };
    next();
  });
  app.use("/t/:tenantId/staff", staffRouter);
  return app;
}

const newStaff = (role: string, extra: Record<string, unknown> = {}) => ({
  name: "New Person",
  role,
  email: "new@example.com",
  ...extra,
});

const auditedActions = () => mocks.recordAuditEventSafe.mock.calls.map((c) => c[0].action);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.remainingPackageCapacity.mockResolvedValue(5);
  mocks.getTenantPackageContext.mockResolvedValue({ package: { id: "starter", maxStaff: 3 } });
  mocks.verifySensitiveActionForRequest.mockResolvedValue({
    ok: false, status: 428, message: "Re-auth required", actionType: "wallet_adjustment", actionLabel: "Wallet adjustment",
  });
  mocks.createStaff.mockImplementation(async (_t: string, input: any) => ({ id: "s_new", ...input }));
  mocks.updateStaff.mockImplementation(async (_t: string, id: string, input: any) => ({ id, ...input }));
  mocks.deleteStaff.mockResolvedValue(undefined);
});

describe("POST /staff", () => {
  it("rejects a manager assigning the admin role", async () => {
    const res = await request(appAs("manager")).post("/t/t1/staff").send(newStaff("admin"));
    expect(res.status).toBe(403);
    expect(mocks.createStaff).not.toHaveBeenCalled();
  });

  it("rejects an admin assigning the dev role", async () => {
    const res = await request(appAs("admin")).post("/t/t1/staff").send(newStaff("dev"));
    expect(res.status).toBe(403);
    expect(mocks.createStaff).not.toHaveBeenCalled();
  });

  it("lets a manager create a cashier", async () => {
    const res = await request(appAs("manager")).post("/t/t1/staff").send(newStaff("cashier"));
    expect(res.status).toBe(201);
    expect(mocks.createStaff).toHaveBeenCalledTimes(1);
    expect(auditedActions()).toContain("staff.created");
  });

  it("returns a package limit error when capacity is exhausted", async () => {
    mocks.remainingPackageCapacity.mockResolvedValue(0);
    const res = await request(appAs("manager")).post("/t/t1/staff").send(newStaff("cashier"));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/package limit/i);
    expect(mocks.createStaff).not.toHaveBeenCalled();
  });

  it("requires sensitive re-auth when an opening walletBalance is supplied", async () => {
    const res = await request(appAs("manager")).post("/t/t1/staff").send(newStaff("cashier", { walletBalance: 100 }));
    expect(res.status).toBe(428);
    expect(res.body.sensitiveActionRequired).toBe(true);
    expect(mocks.createStaff).not.toHaveBeenCalled();
  });

  it("creates the member when sensitive verification passes", async () => {
    mocks.verifySensitiveActionForRequest.mockResolvedValue({ ok: true });
    const res = await request(appAs("manager")).post("/t/t1/staff").send(newStaff("cashier", { walletBalance: 100 }));
    expect(res.status).toBe(201);
    expect(mocks.createStaff).toHaveBeenCalledTimes(1);
  });

  it("rejects cashier callers", async () => {
    const res = await request(appAs("cashier")).post("/t/t1/staff").send(newStaff("cashier"));
    expect(res.status).toBe(403);
    expect(mocks.createStaff).not.toHaveBeenCalled();
  });
});

describe("PUT /staff/:staffId", () => {
  it("rejects a manager editing an admin", async () => {
    mocks.query.mockResolvedValue([{ role: "admin" }]);
    const res = await request(appAs("manager")).put("/t/t1/staff/target1").send({ name: "X" });
    expect(res.status).toBe(403);
    expect(mocks.updateStaff).not.toHaveBeenCalled();
  });

  it("rejects a manager promoting a cashier to admin", async () => {
    mocks.query.mockResolvedValue([{ role: "cashier" }]);
    const res = await request(appAs("manager")).put("/t/t1/staff/target1").send({ role: "admin" });
    expect(res.status).toBe(403);
    expect(mocks.updateStaff).not.toHaveBeenCalled();
  });

  it("lets a manager rename a cashier and audits staff.updated", async () => {
    mocks.query.mockResolvedValue([{ role: "cashier" }]);
    const res = await request(appAs("manager")).put("/t/t1/staff/target1").send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(mocks.updateStaff).toHaveBeenCalledWith("t1", "target1", { name: "Renamed" });
    expect(auditedActions()).toContain("staff.updated");
  });

  it("returns 404 for an unknown staff member", async () => {
    mocks.query.mockResolvedValue([]);
    const res = await request(appAs("manager")).put("/t/t1/staff/missing").send({ name: "X" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /staff/:staffId", () => {
  it("rejects a manager deleting an admin", async () => {
    mocks.query.mockResolvedValue([{ role: "admin" }]);
    const res = await request(appAs("manager")).delete("/t/t1/staff/target1");
    expect(res.status).toBe(403);
    expect(mocks.deleteStaff).not.toHaveBeenCalled();
  });

  it("lets a manager delete a cashier", async () => {
    mocks.query.mockResolvedValue([{ role: "cashier" }]);
    const res = await request(appAs("manager")).delete("/t/t1/staff/target1");
    expect(res.status).toBe(204);
    expect(mocks.deleteStaff).toHaveBeenCalledWith("t1", "target1");
    expect(auditedActions()).toContain("staff.deleted");
  });
});
