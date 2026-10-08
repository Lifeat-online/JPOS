import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/audit.js", () => ({
  recordAuditEventSafe: vi.fn(async () => null),
}));
vi.mock("../../server/sensitiveActions.js", () => ({
  verifySensitiveActionForRequest: vi.fn(),
}));

import { sendRouteError, isInternalError } from "../../server/securityHardening.js";
import { requireTenantRouteAccess } from "../../server/routes/_helpers.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const GENERIC = "Something went wrong. Please try again.";

function fakeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function pgError() {
  return Object.assign(new Error('duplicate key value violates unique constraint "products_sku_key"'), {
    code: "23505",
    severity: "ERROR",
  });
}

const req: any = { requestId: "r1", method: "GET", headers: {}, originalUrl: "/x", url: "/x", path: "/x", socket: { remoteAddress: "127.0.0.1" }, get: () => undefined };

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  vi.restoreAllMocks();
});

describe("sendRouteError", () => {
  it("hides database errors in production", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.NODE_ENV = "production";
    const res = fakeRes();
    sendRouteError(res, pgError(), req);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe(GENERIC);
    expect(body.error).not.toContain("products_sku_key");
    expect(body.requestId).toBe("r1");
  });

  it("passes app-authored messages through in production", () => {
    process.env.NODE_ENV = "production";
    const res = fakeRes();
    sendRouteError(res, new Error("Promotion could not be applied."), req, 400);
    expect(res.json.mock.calls[0][0].error).toBe("Promotion could not be applied.");
  });

  it("passes database messages through outside production", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.NODE_ENV = "development";
    const res = fakeRes();
    const err = pgError();
    sendRouteError(res, err, req);
    expect(res.json.mock.calls[0][0].error).toBe(err.message);
  });

  it("defaults to 500 and respects an explicit status", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.NODE_ENV = "development";
    const a = fakeRes();
    sendRouteError(a, new Error("boom"), req);
    expect(a.status).toHaveBeenCalledWith(500);
    const b = fakeRes();
    sendRouteError(b, new Error("bad input"), req, 400);
    expect(b.status).toHaveBeenCalledWith(400);
  });

  it("classifies system and non-Error values as internal", () => {
    expect(isInternalError("string")).toBe(true);
    expect(isInternalError(Object.assign(new Error("x"), { syscall: "connect", errno: -111 }))).toBe(true);
    expect(isInternalError(new Error("Plain"))).toBe(false);
  });
});

describe("requireTenantRouteAccess", () => {
  const mkReq = (tokenTenant: string | undefined) =>
    ({ ...req, params: { tenantId: "t1" }, user: tokenTenant === undefined ? undefined : { tenantId: tokenTenant, role: "admin" } }) as any;

  it("denies when the token has no tenantId", () => {
    const res = fakeRes();
    const next = vi.fn();
    requireTenantRouteAccess(mkReq(""), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("denies a mismatched tenant", () => {
    const res = fakeRes();
    const next = vi.fn();
    requireTenantRouteAccess(mkReq("t2"), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("allows a matching tenant", () => {
    const res = fakeRes();
    const next = vi.fn();
    requireTenantRouteAccess(mkReq("t1"), res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
