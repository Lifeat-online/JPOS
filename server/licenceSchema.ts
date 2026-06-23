import { query } from "./db.js";

export async function ensureLicenceSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS licences (
      licence_id TEXT PRIMARY KEY,
      tenant_name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL,
      max_registers INTEGER NOT NULL DEFAULT 2,
      features TEXT NOT NULL DEFAULT '[]',
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      revoked SMALLINT NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
      revoked_at TIMESTAMPTZ,
      revoked_reason TEXT
    )
  `);
  await query("CREATE INDEX IF NOT EXISTS idx_licences_key_hash ON licences (key_hash)");
}
