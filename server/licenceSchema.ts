import { isPostgres, query } from "./db.js";

export async function ensureLicenceSchema() {
  if (isPostgres()) {
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
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS licences (
      licence_id VARCHAR(64) PRIMARY KEY,
      tenant_name VARCHAR(255) NOT NULL,
      key_hash VARCHAR(128) NOT NULL UNIQUE,
      tier VARCHAR(32) NOT NULL,
      max_registers INT NOT NULL DEFAULT 2,
      features TEXT NOT NULL DEFAULT '[]',
      issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      revoked_at DATETIME,
      revoked_reason TEXT,
      INDEX idx_licences_key_hash (key_hash)
    )
  `);
}
