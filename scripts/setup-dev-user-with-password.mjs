/**
 * setup-dev-user-with-password.mjs
 *
 * Seeds dev credentials into PostgreSQL.
 *
 * Usage (from project root):
 *   node scripts/setup-dev-user-with-password.mjs
 */

import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_DATABASE || "jims_pos",
});

// ── Config ──────────────────────────────────────────────────────────────────
const EMAIL = "jameskoen78@gmail.com";
const NAME = "James Koen";
const DEV_PASSWORD = "James4James@1978";
const TENANT_ID = "tenant1"; // must match DEV_TENANT_ID in auth-middleware.ts
const TENANT_NAME = "MasePOS Dev";
const STAFF_ID = "dev-staff-001";
const UID = "Rkfh8ZhwKMXQJurorDSeqf86qOS2";

async function run() {
  const conn = await pool.connect();
  try {
    // ── 1. Migration: add password_hash column if missing ─────────────────
    console.log("\n[1/5] Running password_hash migration…");
    await conn.query(`
      ALTER TABLE staff
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)
    `);
    console.log("   ✓ password_hash column ready");

    // ── 2. Tenant ─────────────────────────────────────────────────────────
    console.log("\n[2/5] Ensuring tenant exists…");
    const { rows: tenants } = await conn.query(
      "SELECT id FROM tenants WHERE id = $1",
      [TENANT_ID],
    );
    if (tenants.length === 0) {
      await conn.query(
        "INSERT INTO tenants (id, name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())",
        [TENANT_ID, TENANT_NAME],
      );
      console.log("   ✓ Tenant created:", TENANT_ID);
    } else {
      console.log("   ✓ Tenant already exists");
    }

    // ── 3. app_settings ───────────────────────────────────────────────────
    console.log("\n[3/5] Ensuring app_settings exist…");
    const { rows: settings } = await conn.query(
      "SELECT tenant_id FROM app_settings WHERE tenant_id = $1",
      [TENANT_ID],
    );
    if (settings.length === 0) {
      await conn.query(
        `INSERT INTO app_settings (tenant_id, setup_completed) VALUES ($1, TRUE)`,
        [TENANT_ID],
      );
      console.log("   ✓ app_settings created");
    } else {
      console.log("   ✓ app_settings already exist");
    }

    // ── 4. User record (users table) ──────────────────────────────────────
    console.log("\n[4a/5] Ensuring user record exists…");
    const { rows: users } = await conn.query(
      "SELECT uid FROM users WHERE uid = $1",
      [UID],
    );
    if (users.length === 0) {
      await conn.query(
        `INSERT INTO users (uid, tenant_id, email, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [UID, TENANT_ID, EMAIL, NAME],
      );
      console.log("   ✓ User record created");
    } else {
      await conn.query(
        "UPDATE users SET tenant_id = $1, email = $2, name = $3, updated_at = NOW() WHERE uid = $4",
        [TENANT_ID, EMAIL, NAME, UID],
      );
      console.log("   ✓ User record updated");
    }

    // ── 5. Staff record & password ────────────────────────────────────────
    console.log("\n[5/5] Ensuring staff record exists…");
    const { rows: existing } = await conn.query(
      "SELECT id FROM staff WHERE email = $1",
      [EMAIL],
    );
    if (existing.length === 0) {
      await conn.query(
        `INSERT INTO staff (id, tenant_id, name, role, email, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'admin', $4, 'active', NOW(), NOW())`,
        [STAFF_ID, TENANT_ID, NAME, EMAIL],
      );
      console.log("   ✓ Staff record created with role: admin");
    } else {
      await conn.query(
        `UPDATE staff SET role = 'admin', tenant_id = $1, updated_at = NOW() WHERE email = $2`,
        [TENANT_ID, EMAIL],
      );
      console.log("   ✓ Staff record updated — role set to admin");
    }

    // Set password
    const hash = await bcrypt.hash(DEV_PASSWORD, 12);
    await conn.query("UPDATE staff SET password_hash = $1 WHERE email = $2", [
      hash,
      EMAIL,
    ]);
    console.log("   ✓ Password set");

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅  Setup complete! You can now log in with:");
    console.log(`    Email   : ${EMAIL}`);
    console.log(`    Password: ${DEV_PASSWORD}`);
    console.log(`    Tenant  : ${TENANT_ID}`);
    console.log("    Role    : admin");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("\n❌  Setup failed:", err.message);
  process.exit(1);
});
