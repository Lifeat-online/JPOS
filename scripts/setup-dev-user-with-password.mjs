/**
 * setup-dev-user-with-password.mjs
 *
 * One-shot setup script that:
 *  1. Runs the password_hash column migration (safe to re-run)
 *  2. Creates the dev tenant, user, and staff record if they don't exist
 *  3. Sets a bcrypt password on the dev staff record so you can log in
 *
 * Usage:
 *   DB_PASSWORD=yourpass node setup-dev-user-with-password.mjs
 *   (or just run with an empty DB_PASSWORD if root has no password)
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  port:             Number(process.env.DB_PORT || 3306),
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  database:         process.env.DB_DATABASE || 'jimmy_pos',
  waitForConnections: true,
  connectionLimit:  1,
  multipleStatements: true,
});

// ── Config ──────────────────────────────────────────────────────────────────
const EMAIL       = 'jameskoen78@gmail.com';
const NAME        = 'James Koen';
const DEV_PASSWORD = 'admin123';        // ← change this after first login
const TENANT_ID   = 'dev-tenant-001';
const TENANT_NAME = "MasePOS Dev";
const STAFF_ID    = 'dev-staff-001';

async function run() {
  const conn = await pool.getConnection();
  try {
    // ── 1. Migration: add password_hash column if missing ─────────────────
    console.log('\n[1/5] Running password_hash migration…');
    await conn.execute(`
      ALTER TABLE staff
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) AFTER email
    `).catch(() => {
      // MariaDB < 10.3 doesn't support IF NOT EXISTS on ALTER TABLE
      // Swallow the error if column already exists
    });
    // Fallback for older MariaDB
    try {
      await conn.execute(`ALTER TABLE staff ADD COLUMN password_hash VARCHAR(255) AFTER email`);
    } catch (e) {
      if (!e.message?.includes('Duplicate column')) throw e;
    }
    console.log('   ✓ password_hash column ready');

    // ── 2. Tenant ─────────────────────────────────────────────────────────
    console.log('\n[2/5] Ensuring tenant exists…');
    const [tenants] = await conn.execute('SELECT id FROM tenants WHERE id = ?', [TENANT_ID]);
    if ((tenants).length === 0) {
      await conn.execute('INSERT INTO tenants (id, name) VALUES (?, ?)', [TENANT_ID, TENANT_NAME]);
      console.log('   ✓ Tenant created:', TENANT_ID);
    } else {
      console.log('   ✓ Tenant already exists');
    }

    // ── 3. app_settings ───────────────────────────────────────────────────
    console.log('\n[3/5] Ensuring app_settings exist…');
    const [settings] = await conn.execute('SELECT tenant_id FROM app_settings WHERE tenant_id = ?', [TENANT_ID]);
    if ((settings).length === 0) {
      await conn.execute(
        `INSERT INTO app_settings (tenant_id, setup_completed) VALUES (?, TRUE)`,
        [TENANT_ID]
      );
      console.log('   ✓ app_settings created');
    } else {
      console.log('   ✓ app_settings already exist');
    }

    // ── 4. Staff record ───────────────────────────────────────────────────
    console.log('\n[4/5] Ensuring staff record exists…');
    const [existing] = await conn.execute('SELECT id FROM staff WHERE email = ?', [EMAIL]);
    if ((existing).length === 0) {
      await conn.execute(
        `INSERT INTO staff (id, tenant_id, name, role, email, status)
         VALUES (?, ?, ?, 'admin', ?, 'active')`,
        [STAFF_ID, TENANT_ID, NAME, EMAIL]
      );
      console.log('   ✓ Staff record created with role: admin');
    } else {
      // Ensure role is admin for the dev account
      await conn.execute(
        `UPDATE staff SET role = 'admin', tenant_id = ? WHERE email = ?`,
        [TENANT_ID, EMAIL]
      );
      console.log('   ✓ Staff record exists — role set to admin');
    }

    // ── 5. Set password ───────────────────────────────────────────────────
    console.log('\n[5/5] Setting password…');
    const hash = await bcrypt.hash(DEV_PASSWORD, 10);
    await conn.execute(
      `UPDATE staff SET password_hash = ? WHERE email = ?`,
      [hash, EMAIL]
    );
    console.log('   ✓ Password set');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅  Setup complete! You can now log in with:');
    console.log(`    Email   : ${EMAIL}`);
    console.log(`    Password: ${DEV_PASSWORD}`);
    console.log(`    Tenant  : ${TENANT_ID}`);
    console.log('    Role    : admin');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('\n❌  Setup failed:', err.message);
  process.exit(1);
});
