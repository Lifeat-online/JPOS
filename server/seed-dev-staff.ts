import bcrypt from "bcryptjs";
import { query } from "./db.js";

const DEV_EMAIL = "jameskoen78@gmail.com";
const DEV_NAME = "James Koen";
const DEV_TENANT_ID = "tenant1";
const DEV_TENANT_NAME = "MasePOS Dev";
const DEV_STAFF_ID = "dev-staff-001";
const DEV_UID = "Rkfh8ZhwKMXQJurorDSeqf86qOS2";
const DEFAULT_DEV_PASSWORD = "James4James@1978";

export async function seedDevStaffIfMissing(): Promise<void> {
    const raw = String(process.env.ENABLE_DEV_BOOTSTRAP || "").trim().toLowerCase();
    if (raw !== "true" && raw !== "1" && raw !== "yes") return;

    const password = process.env.DEV_SEED_PASSWORD || DEFAULT_DEV_PASSWORD;

    try {
        const existing = await query<any>(
            "SELECT id, password_hash FROM staff WHERE LOWER(email) = $1 LIMIT 1",
            [DEV_EMAIL]
        );

        if (existing.length > 0 && existing[0].password_hash) {
            console.log("[seed-dev] Dev staff already exists with a password — skipping seed.");
            return;
        }

        const tenants = await query<any>("SELECT id FROM tenants WHERE id = $1", [DEV_TENANT_ID]);
        if (tenants.length === 0) {
            await query(
                "INSERT INTO tenants (id, name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())",
                [DEV_TENANT_ID, DEV_TENANT_NAME]
            );
            console.log("[seed-dev] Created tenant:", DEV_TENANT_ID);
        }

        const settings = await query<any>("SELECT tenant_id FROM app_settings WHERE tenant_id = $1", [DEV_TENANT_ID]);
        if (settings.length === 0) {
            await query(
                "INSERT INTO app_settings (tenant_id, setup_completed, created_at, updated_at) VALUES ($1, 1, NOW(), NOW())",
                [DEV_TENANT_ID]
            );
            console.log("[seed-dev] Created app_settings for tenant:", DEV_TENANT_ID);
        }

        const users = await query<any>("SELECT uid FROM users WHERE uid = $1", [DEV_UID]);
        if (users.length === 0) {
            await query(
                "INSERT INTO users (uid, tenant_id, email, name, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())",
                [DEV_UID, DEV_TENANT_ID, DEV_EMAIL, DEV_NAME]
            );
            console.log("[seed-dev] Created user record:", DEV_UID);
        } else {
            await query(
                "UPDATE users SET tenant_id = $1, email = $2, name = $3, updated_at = NOW() WHERE uid = $4",
                [DEV_TENANT_ID, DEV_EMAIL, DEV_NAME, DEV_UID]
            );
        }

        const hash = await bcrypt.hash(password, 12);

        if (existing.length === 0) {
            await query(
                `INSERT INTO staff (id, tenant_id, name, role, email, password_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'dev', $4, $5, 'active', NOW(), NOW())`,
                [DEV_STAFF_ID, DEV_TENANT_ID, DEV_NAME, DEV_EMAIL, hash]
            );
            console.log("[seed-dev] Created dev staff record with role: dev");
        } else {
            await query(
                `UPDATE staff SET role = 'dev', tenant_id = $1, password_hash = $2, status = 'active', updated_at = NOW() WHERE LOWER(email) = $3`,
                [DEV_TENANT_ID, hash, DEV_EMAIL]
            );
            console.log("[seed-dev] Updated dev staff record — role set to dev, password set");
        }

        console.log("[seed-dev] Dev staff seeded successfully.");
        console.log(`[seed-dev]   Email:    ${DEV_EMAIL}`);
        console.log(`[seed-dev]   Password: ${process.env.DEV_SEED_PASSWORD ? "(from DEV_SEED_PASSWORD)" : "(default)"}`);
        console.log(`[seed-dev]   Tenant:   ${DEV_TENANT_ID}`);
        console.log(`[seed-dev]   Role:     dev`);
    } catch (err) {
        console.warn("[seed-dev] Failed to seed dev staff:", err);
    }
}
