import crypto from "crypto";
import { query } from "./db.js";
export type RealtimePubsubEvent = {
    id: string;
    instanceId: string;
    channel: string;
    eventName: string;
    payload: any;
    createdAt: string;
};
export type RealtimePubsubCursor = {
    createdAt: string;
    id: string;
};
export type RealtimeQueryRunner = (sql: string, params?: any[]) => Promise<any[]>;
export const REALTIME_INSTANCE_ID = process.env.JPOS_REALTIME_INSTANCE_ID || `instance_${crypto.randomUUID()}`;
export function realtimeFanoutEnabled(env: NodeJS.ProcessEnv = process.env) {
    return (env.JPOS_REALTIME_FANOUT === "database" ||
        env.JPOS_REALTIME_PUBSUB === "database" ||
        env.JPOS_REALTIME_FANOUT_ENABLED === "true");
}
export function realtimePollIntervalMs(env: NodeJS.ProcessEnv = process.env) {
    return Math.max(500, Number(env.JPOS_REALTIME_POLL_MS || 1000));
}
export function realtimeReplayWindowMs(env: NodeJS.ProcessEnv = process.env) {
    return Math.max(0, Number(env.JPOS_REALTIME_REPLAY_WINDOW_MS || 15000));
}
export function realtimeEventTtlMinutes(env: NodeJS.ProcessEnv = process.env) {
    return Math.max(1, Number(env.JPOS_REALTIME_EVENT_TTL_MINUTES || 10));
}
export function buildRealtimePubsubSchemaStatements() {
    return [
        `CREATE TABLE IF NOT EXISTS realtime_pubsub_events (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      event_name TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    )`,
        `CREATE INDEX IF NOT EXISTS idx_realtime_pubsub_poll ON realtime_pubsub_events (created_at, id)`,
        `CREATE INDEX IF NOT EXISTS idx_realtime_pubsub_expiry ON realtime_pubsub_events (expires_at)`,
    ];
}
export async function ensureRealtimePubsubSchema(runQuery: RealtimeQueryRunner = query) {
    for (const statement of buildRealtimePubsubSchemaStatements()) {
        await runQuery(statement);
    }
}
export async function publishRealtimeEvent(event: Pick<RealtimePubsubEvent, "channel" | "eventName" | "payload">, options: {
    runQuery?: RealtimeQueryRunner;
    instanceId?: string;
    ttlMinutes?: number;
} = {}) {
    const runQuery = options.runQuery || query;
    const instanceId = options.instanceId || REALTIME_INSTANCE_ID;
    const ttlMinutes = options.ttlMinutes || realtimeEventTtlMinutes();
    const id = `rt_${crypto.randomUUID()}`;
    const payload = JSON.stringify(event.payload ?? null);
    await runQuery(`INSERT INTO realtime_pubsub_events (id, instance_id, channel, event_name, payload, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + ($6::text || ' minutes')::interval)`, [id, instanceId, event.channel, event.eventName, payload, String(ttlMinutes)]);
    return id;
}
export async function publishRealtimeEventIfEnabled(event: Pick<RealtimePubsubEvent, "channel" | "eventName" | "payload">) {
    if (!realtimeFanoutEnabled())
        return null;
    return publishRealtimeEvent(event);
}
export function initialRealtimeCursor(now = new Date(), replayWindowMs = realtimeReplayWindowMs()): RealtimePubsubCursor {
    return {
        createdAt: new Date(now.getTime() - replayWindowMs).toISOString(),
        id: "",
    };
}
export function buildFetchRealtimeEventsQuery() {
    return {
        sql: `SELECT id, instance_id, channel, event_name, payload, created_at
      FROM realtime_pubsub_events
      WHERE instance_id <> $1
        AND (created_at > $2 OR (created_at = $3 AND id > $4))
      ORDER BY created_at ASC, id ASC
      LIMIT $5`,
    };
}
export async function fetchRealtimeEvents(cursor: RealtimePubsubCursor, options: {
    runQuery?: RealtimeQueryRunner;
    instanceId?: string;
    batchSize?: number;
} = {}) {
    const runQuery = options.runQuery || query;
    const instanceId = options.instanceId || REALTIME_INSTANCE_ID;
    const batchSize = Math.max(1, Math.min(500, options.batchSize || 100));
    const fetchQuery = buildFetchRealtimeEventsQuery();
    const rows = await runQuery(fetchQuery.sql, [
        instanceId,
        cursor.createdAt,
        cursor.createdAt,
        cursor.id,
        batchSize,
    ]);
    return rows.map(parseRealtimeEventRow).filter((event): event is RealtimePubsubEvent => Boolean(event));
}
export function parseRealtimeEventRow(row: any): RealtimePubsubEvent | null {
    if (!row?.id || !row?.channel || !row?.event_name)
        return null;
    let payload: any = null;
    try {
        payload = row.payload === undefined || row.payload === null ? null : JSON.parse(String(row.payload));
    }
    catch {
        payload = null;
    }
    const createdValue = row.created_at || row.createdAt || new Date().toISOString();
    const createdAt = createdValue instanceof Date ? createdValue.toISOString() : new Date(createdValue).toISOString();
    return {
        id: String(row.id),
        instanceId: String(row.instance_id || row.instanceId || ""),
        channel: String(row.channel),
        eventName: String(row.event_name),
        payload,
        createdAt,
    };
}
export function advanceRealtimeCursor(cursor: RealtimePubsubCursor, events: RealtimePubsubEvent[]) {
    if (events.length === 0)
        return cursor;
    const latest = events[events.length - 1];
    return { createdAt: latest.createdAt, id: latest.id };
}
export async function deleteExpiredRealtimeEvents(runQuery: RealtimeQueryRunner = query) {
    await runQuery(`DELETE FROM realtime_pubsub_events WHERE expires_at < NOW()`);
}
export function startRealtimePubsubPoller(options: {
    emitLocal: (event: RealtimePubsubEvent) => void | Promise<void>;
    runQuery?: RealtimeQueryRunner;
    instanceId?: string;
    intervalMs?: number;
    replayWindowMs?: number;
    enabled?: boolean;
}) {
    const enabled = options.enabled ?? realtimeFanoutEnabled();
    if (!enabled)
        return () => undefined;
    let cursor = initialRealtimeCursor(new Date(), options.replayWindowMs ?? realtimeReplayWindowMs());
    let stopped = false;
    let running = false;
    let cleanupTicks = 0;
    const poll = async () => {
        if (stopped || running)
            return;
        running = true;
        try {
            const events = await fetchRealtimeEvents(cursor, {
                runQuery: options.runQuery,
                instanceId: options.instanceId,
            });
            for (const event of events) {
                await options.emitLocal(event);
            }
            cursor = advanceRealtimeCursor(cursor, events);
            cleanupTicks += 1;
            if (cleanupTicks >= 60) {
                cleanupTicks = 0;
                await deleteExpiredRealtimeEvents(options.runQuery || query);
            }
        }
        catch (err) {
            console.warn("Realtime pub/sub poll failed:", err);
        }
        finally {
            running = false;
        }
    };
    const timer = setInterval(() => {
        void poll();
    }, options.intervalMs ?? realtimePollIntervalMs());
    void poll();
    return () => {
        stopped = true;
        clearInterval(timer);
    };
}
