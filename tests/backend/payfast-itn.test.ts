// @vitest-environment node
import crypto from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getAppConfigByTenant: vi.fn(),
  updateSale: vi.fn(),
  recordAuditEventSafe: vi.fn(),
  broadcastSalesUpdate: vi.fn(),
}));

vi.mock("../../server/db.js", () => ({ query: mocks.query }));
vi.mock("../../server/db-adapter.js", () => ({ getAppConfigByTenant: mocks.getAppConfigByTenant }));
vi.mock("../../server/db-crud.js", () => ({ updateSale: mocks.updateSale }));
vi.mock("../../server/audit.js", () => ({ recordAuditEventSafe: mocks.recordAuditEventSafe }));
vi.mock("../../server/socket.js", () => ({ broadcastSalesUpdate: mocks.broadcastSalesUpdate }));

import { payfastRouter } from "../../server/routes/payfast.js";

const PASSPHRASE = "secret phrase";

// Independent PHP urlencode() implementation.
const phpEncode = (v: string) =>
  encodeURIComponent(v)
    .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");

function buildBody(overrides: Record<string, string> = {}, omit: string[] = []) {
  const fields: Record<string, string> = {
    m_payment_id: "sale_1",
    pf_payment_id: "pf_12345",
    payment_status: "COMPLETE",
    item_name: "POS Purchase (test)",
    amount_gross: "100.00",
    merchant_id: "10000100",
    ...overrides,
  };
  for (const key of omit) delete fields[key];
  const paramString = Object.entries(fields).map(([k, v]) => `${k}=${phpEncode(v)}`).join("&");
  const signature = crypto.createHash("md5").update(`${paramString}&passphrase=${phpEncode(PASSPHRASE)}`).digest("hex");
  return { fields, paramString, signature, body: `${paramString}&signature=${signature}` };
}

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use("/api/payfast", payfastRouter);

const post = (body: string) =>
  request(app).post("/api/payfast/notify").type("form").send(body);

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([{ id: "sale_1", tenantId: "t1", total: "100.00", status: "pending" }]);
  mocks.getAppConfigByTenant.mockResolvedValue({
    payfastMerchantId: "10000100",
    payfastPassphrase: PASSPHRASE,
    payfastSandbox: true,
  });
  mocks.updateSale.mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(new Response("VALID", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("POST /api/payfast/notify", () => {
  it("completes the sale for a valid, confirmed notification", async () => {
    const res = await post(buildBody().body);
    expect(res.status).toBe(200);
    expect(mocks.updateSale).toHaveBeenCalledWith("t1", "sale_1", {
      status: "completed",
      paymentMethod: "payfast",
      payfast_payment_id: "pf_12345",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("sandbox.payfast.co.za/eng/query/validate");
  });

  it("rejects a tampered signature and audits it", async () => {
    const { paramString } = buildBody();
    const res = await post(`${paramString}&signature=${"0".repeat(32)}`);
    expect(res.status).toBe(400);
    expect(mocks.updateSale).not.toHaveBeenCalled();
    expect(mocks.recordAuditEventSafe).toHaveBeenCalledWith(expect.objectContaining({ action: "payfast.itn_rejected" }));
  });

  it("rejects an amount that differs from the sale total", async () => {
    const res = await post(buildBody({ amount_gross: "50.00" }).body);
    expect(res.status).toBe(400);
    expect(mocks.updateSale).not.toHaveBeenCalled();
  });

  it("rejects a merchant_id mismatch", async () => {
    const res = await post(buildBody({ merchant_id: "99999999" }).body);
    expect(res.status).toBe(400);
    expect(mocks.updateSale).not.toHaveBeenCalled();
  });

  it("rejects when PayFast does not confirm the notification", async () => {
    fetchMock.mockResolvedValue(new Response("INVALID", { status: 200 }));
    const res = await post(buildBody().body);
    expect(res.status).toBe(400);
    expect(mocks.updateSale).not.toHaveBeenCalled();
  });

  it("acknowledges but does not update a sale that is already completed", async () => {
    mocks.query.mockResolvedValue([{ id: "sale_1", tenantId: "t1", total: "100.00", status: "completed" }]);
    const res = await post(buildBody().body);
    expect(res.status).toBe(200);
    expect(mocks.updateSale).not.toHaveBeenCalled();
  });

  it("marks the sale failed for a CANCELLED notification", async () => {
    const res = await post(buildBody({ payment_status: "CANCELLED" }).body);
    expect(res.status).toBe(200);
    expect(mocks.updateSale).toHaveBeenCalledWith("t1", "sale_1", { status: "failed" });
  });

  it("rejects a notification without m_payment_id", async () => {
    const res = await post(buildBody({}, ["m_payment_id"]).body);
    expect(res.status).toBe(400);
    expect(mocks.updateSale).not.toHaveBeenCalled();
  });
});
