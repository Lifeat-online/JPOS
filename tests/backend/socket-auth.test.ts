// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";

vi.mock("../../server/db.js", () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    const key = JSON.stringify(params);
    if (key === JSON.stringify(["ws_own", "tenantA"])) return [{}];
    if (key === JSON.stringify(["table_own", "tenantA"])) return [{}];
    if (key === JSON.stringify(["sale_own", "tenantA"])) return [{}];
    return [];
  }),
}));

vi.mock("../../server/realtimePubsub.js", () => ({
  startRealtimePubsubPoller: vi.fn(() => () => {}),
  publishRealtimeEventIfEnabled: vi.fn(async () => null),
}));

import { generateAccessToken, generateRefreshToken } from "../../server/auth-middleware.js";
import { setupSocketIO, broadcastToTenant, broadcastToWorkstation, broadcastToTable, broadcastToTab } from "../../server/socket.js";

const payloadA = { uid: "u1", email: "a@example.com", name: "A", tenantId: "tenantA", role: "admin", staffId: "u1" };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("socket.io authentication and tenant isolation", () => {
  let server: http.Server;
  let io: any;
  let url: string;
  const clients: ClientSocket[] = [];

  beforeEach(async () => {
    server = http.createServer();
    io = setupSocketIO(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  function connect(token?: string): ClientSocket {
    const c = ioClient(url, {
      transports: ["websocket"],
      reconnection: false,
      auth: token === undefined ? {} : { token },
    });
    clients.push(c);
    return c;
  }

  const connected = (c: ClientSocket) =>
    new Promise<void>((resolve, reject) => {
      c.on("connect", () => resolve());
      c.on("connect_error", (e) => reject(e));
    });

  const rejection = (c: ClientSocket) =>
    new Promise<Error>((resolve, reject) => {
      c.on("connect_error", (e) => resolve(e));
      c.on("connect", () => reject(new Error("connected unexpectedly")));
    });

  /** Resolves true if `event` arrives within `ms`, else false. */
  const receives = (c: ClientSocket, event: string, ms = 300) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      c.once(event, () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

  it("rejects a garbage bearer token", async () => {
    const err = await rejection(connect("Bearer garbage"));
    expect(err.message).toBe("Authentication required");
  });

  it("rejects a connection with no token", async () => {
    const err = await rejection(connect());
    expect(err.message).toBe("Authentication required");
  });

  it("rejects a refresh token used as an access token", async () => {
    const err = await rejection(connect(`Bearer ${generateRefreshToken(payloadA)}`));
    expect(err.message).toBe("Authentication required");
  });

  it("rejects an access token that carries no tenant", async () => {
    const err = await rejection(connect(`Bearer ${generateAccessToken({ ...payloadA, tenantId: "" })}`));
    expect(err.message).toBe("Authentication required");
  });

  it("only lets a socket join its own tenant room", async () => {
    const c = connect(`Bearer ${generateAccessToken(payloadA)}`);
    await connected(c);

    c.emit("join_tenant", "tenantB");
    await wait(100);
    const leaked = receives(c, "sales_update");
    broadcastToTenant(io, "tenantB", "sales_update", { x: 1 });
    expect(await leaked).toBe(false);

    c.emit("join_tenant", "tenantA");
    await wait(100);
    const own = receives(c, "sales_update", 1000);
    broadcastToTenant(io, "tenantA", "sales_update", { x: 1 });
    expect(await own).toBe(true);
  });

  it("only lets a socket join workstation rooms owned by its tenant", async () => {
    const c = connect(`Bearer ${generateAccessToken(payloadA)}`);
    await connected(c);

    c.emit("join_workstation", "ws_other");
    await wait(100);
    const leaked = receives(c, "workstation_update");
    broadcastToWorkstation(io, "ws_other", { x: 1 });
    expect(await leaked).toBe(false);

    c.emit("join_workstation", "ws_own");
    await wait(100);
    const own = receives(c, "workstation_update", 1000);
    broadcastToWorkstation(io, "ws_own", { x: 1 });
    expect(await own).toBe(true);
  });

  it("only lets a socket join table and tab rooms owned by its tenant", async () => {
    const c = connect(`Bearer ${generateAccessToken(payloadA)}`);
    await connected(c);

    c.emit("join_table", "table_other");
    c.emit("join_tab", "sale_other");
    await wait(100);
    const tableLeak = receives(c, "table_update");
    const tabLeak = receives(c, "tab_update");
    broadcastToTable(io, "table_other", { x: 1 });
    broadcastToTab(io, "sale_other", { x: 1 });
    expect(await tableLeak).toBe(false);
    expect(await tabLeak).toBe(false);

    c.emit("join_table", "table_own");
    c.emit("join_tab", "sale_own");
    await wait(100);
    const tableOwn = receives(c, "table_update", 1000);
    const tabOwn = receives(c, "tab_update", 1000);
    broadcastToTable(io, "table_own", { x: 1 });
    broadcastToTab(io, "sale_own", { x: 1 });
    expect(await tableOwn).toBe(true);
    expect(await tabOwn).toBe(true);
  });
});
