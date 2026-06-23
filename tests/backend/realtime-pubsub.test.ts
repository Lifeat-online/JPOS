import { describe, expect, it } from "vitest";

import {
  advanceRealtimeCursor,
  buildFetchRealtimeEventsQuery,
  buildRealtimePubsubSchemaStatements,
  ensureRealtimePubsubSchema,
  fetchRealtimeEvents,
  initialRealtimeCursor,
  parseRealtimeEventRow,
  publishRealtimeEvent,
  realtimeFanoutEnabled,
} from "../../server/realtimePubsub.ts";

describe("database realtime pub/sub fan-out", () => {
  it("is opt-in for scaled deployments", () => {
    expect(realtimeFanoutEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(realtimeFanoutEnabled({ JPOS_REALTIME_FANOUT: "database" } as NodeJS.ProcessEnv)).toBe(true);
    expect(realtimeFanoutEnabled({ JPOS_REALTIME_PUBSUB: "database" } as NodeJS.ProcessEnv)).toBe(true);
    expect(realtimeFanoutEnabled({ JPOS_REALTIME_FANOUT_ENABLED: "true" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("creates the realtime event table", async () => {
    const statements = buildRealtimePubsubSchemaStatements();
    const executed: string[] = [];

    await ensureRealtimePubsubSchema(async (sql) => {
      executed.push(sql);
      return [];
    });

    expect(statements.join("\n")).toContain("CREATE TABLE IF NOT EXISTS realtime_pubsub_events");
    expect(statements.join("\n")).toContain("CREATE INDEX IF NOT EXISTS idx_realtime_pubsub_poll");
    expect(executed).toEqual(statements);
  });

  it("publishes room events with instance id, channel, event name, payload, and expiry", async () => {
    const calls: Array<{ sql: string; params: any[] }> = [];

    const id = await publishRealtimeEvent(
      { channel: "tenant:tenant_1", eventName: "sales_update", payload: { saleId: "sale_1" } },
      {
        instanceId: "instance_a",
        ttlMinutes: 7,
        runQuery: async (sql, params = []) => {
          calls.push({ sql, params });
          return [];
        },
      }
    );

    expect(id).toMatch(/^rt_/);
    expect(calls[0].sql).toContain("INSERT INTO realtime_pubsub_events");
    expect(calls[0].sql).toContain("(?::text || ' minutes')::interval");
    expect(calls[0].params.slice(1)).toEqual([
      "instance_a",
      "tenant:tenant_1",
      "sales_update",
      '{"saleId":"sale_1"}',
      "7",
    ]);
  });

  it("fetches only sibling-instance events after the cursor", async () => {
    const cursor = { createdAt: "2026-06-05T10:00:00.000Z", id: "rt_a" };
    const events = await fetchRealtimeEvents(cursor, {
      instanceId: "instance_a",
      runQuery: async (sql, params = []) => {
        expect(sql).toContain("instance_id <> ?");
        expect(params).toEqual(["instance_a", cursor.createdAt, cursor.createdAt, cursor.id, 100]);
        return [
          {
            id: "rt_b",
            instance_id: "instance_b",
            channel: "tenant:tenant_1:messages",
            event_name: "messages_update",
            payload: '{"messageId":"msg_1"}',
            created_at: "2026-06-05T10:00:01.000Z",
          },
        ];
      },
    });

    expect(events).toEqual([
      {
        id: "rt_b",
        instanceId: "instance_b",
        channel: "tenant:tenant_1:messages",
        eventName: "messages_update",
        payload: { messageId: "msg_1" },
        createdAt: "2026-06-05T10:00:01.000Z",
      },
    ]);
    expect(advanceRealtimeCursor(cursor, events)).toEqual({
      createdAt: "2026-06-05T10:00:01.000Z",
      id: "rt_b",
    });
  });

  it("exposes stable cursor and query helpers for the poller", () => {
    expect(initialRealtimeCursor(new Date("2026-06-05T10:00:00.000Z"), 1000)).toEqual({
      createdAt: "2026-06-05T09:59:59.000Z",
      id: "",
    });
    expect(buildFetchRealtimeEventsQuery().sql).toContain("ORDER BY created_at ASC, id ASC");
    expect(parseRealtimeEventRow({ id: "", channel: "tenant:1", event_name: "sales_update" })).toBeNull();
  });
});
