import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Real pgvector integration test. Skipped unless PGVECTOR_TEST_URL points at a
 * Postgres with the `vector` extension available, e.g.:
 *   PGVECTOR_TEST_URL=postgres://user@127.0.0.1:5432/db \
 *     npx vitest run tests/backend/product-embeddings.integration.test.ts
 */
const TEST_URL = process.env.PGVECTOR_TEST_URL;
// Safety: this suite DROPs/CREATEs the products table, so only run it against a
// database whose name is explicitly test-only. Refuse anything else.
const TARGETS_TEST_DB = !!TEST_URL && /test/i.test(new URL(TEST_URL).pathname);
if (TEST_URL && !TARGETS_TEST_DB) {
  throw new Error(
    "PGVECTOR_TEST_URL must point at a test-only database (name must contain 'test'); refusing to run destructive migration test.",
  );
}
const suite = TARGETS_TEST_DB ? describe : describe.skip;

function unitVector(axis: number): number[] {
  const a = new Array(1536).fill(0);
  a[axis] = 1;
  return a;
}
function literal(v: number[]): string {
  return `[${v.join(",")}]`;
}

suite("product embeddings (pgvector integration)", () => {
  let query: any;
  let pgPool: any;
  let ensureProductEmbeddingSchema: any;
  let searchProductsBySimilarity: any;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.DB_SSL = "false";
    ({ query, pgPool } = await import("../../server/db.js"));
    ({ ensureProductEmbeddingSchema } = await import("../../server/init-db.js"));
    ({ searchProductsBySimilarity } = await import("../../server/db-adapter.js"));

    await query(`DROP TABLE IF EXISTS products`);
    await query(
      `CREATE TABLE products (
         id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, price NUMERIC DEFAULT 0,
         cost_price NUMERIC, section TEXT, category TEXT, sub_category TEXT,
         stock INT DEFAULT 0, image_url TEXT, barcode TEXT
       )`,
    );
    // The real migration: extension + vector column + hnsw index.
    await ensureProductEmbeddingSchema();

    const blended = new Array(1536).fill(0);
    blended[0] = 0.9;
    blended[1] = 0.1;
    const rows: Array<[string, string, string, number[]]> = [
      ["p1", "t1", "Espresso Beans", unitVector(0)],
      ["p2", "t1", "Coffee Grounds", blended],
      ["p3", "t1", "Car Battery", unitVector(500)],
      ["p4", "t2", "Other Tenant Beans", unitVector(0)],
    ];
    for (const [id, tenant, name, vec] of rows) {
      await query(
        `INSERT INTO products (id, tenant_id, name, embedding) VALUES ($1, $2, $3, $4::vector)`,
        [id, tenant, name, literal(vec)],
      );
    }
  });

  afterAll(async () => {
    await pgPool?.end();
  });

  it("creates the embedding column + hnsw index idempotently", async () => {
    // Second call must not throw.
    await expect(ensureProductEmbeddingSchema()).resolves.toBeUndefined();
    const cols = await query(
      `SELECT data_type FROM information_schema.columns WHERE table_name='products' AND column_name='embedding'`,
    );
    expect(cols.length).toBe(1);
  });

  it("ranks products by cosine similarity, scoped to the tenant", async () => {
    const hits = await searchProductsBySimilarity("t1", unitVector(0), 10);
    const ids = hits.map((h: any) => h.id);
    expect(ids[0]).toBe("p1"); // exact match
    expect(ids[1]).toBe("p2"); // blended-near
    expect(ids[2]).toBe("p3"); // orthogonal, last
    expect(ids).not.toContain("p4"); // other tenant excluded
    expect(Number(hits[0].distance)).toBeCloseTo(0, 5);
  });
});
