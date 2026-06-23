import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { JPOS_PACKAGE_ADDONS, JPOS_PACKAGES, featureSetForPackage, getPackageByTier, PackageTier } from "../shared/packageCatalog.js";
import { query } from "./db.js";
import { generateLicenceKey, hashLicenceKey, LicenceFeature, LicencePayload, LicenceTier } from "./licenceKey.js";
export { ensureLicenceSchema } from "./licenceSchema.js";
type LicenceRecord = {
    licence_id: string;
    tenant_name: string;
    key_hash: string;
    tier: LicenceTier;
    max_registers: number;
    features: string;
    issued_at: Date | string;
    expires_at: Date | string | null;
    revoked: boolean | number;
    revoked_at: Date | string | null;
    revoked_reason: string | null;
};
const LICENCE_SECRET = process.env.LICENCE_SECRET || "";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || process.env.LICENCE_ADMIN_KEY || "";
export const licenceRouter = Router();
const validateLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: Number(process.env.LICENCE_VALIDATE_DAILY_LIMIT || 5),
    message: JSON.stringify({ valid: false, reason: "Too many licence validation requests" }),
});
licenceRouter.post("/admin/licence/generate", requireAdminKey, async (req, res) => {
    try {
        ensureServerConfigured();
        const body = req.body as {
            tenantName?: string;
            tier?: LicenceTier;
            packageId?: PackageTier;
            maxRegisters?: number;
            features?: LicenceFeature[];
            expiresInDays?: number | null;
            supportPlus?: boolean;
        };
        const packageId = body.packageId || body.tier;
        const selectedPackage = getPackageByTier(packageId);
        if (!body.tenantName || !selectedPackage) {
            res.status(400).json({ error: "tenantName and a valid packageId or tier are required" });
            return;
        }
        if (!["free", "starter", "business", "whitelabel"].includes(selectedPackage.id)) {
            res.status(400).json({ error: "Invalid tier" });
            return;
        }
        const licenceId = crypto.randomUUID();
        const issuedAt = Math.floor(Date.now() / 1000);
        const expiresAt = body.expiresInDays ? issuedAt + body.expiresInDays * 86400 : null;
        const payload: LicencePayload = {
            licenceId,
            tenantName: body.tenantName.trim(),
            maxRegisters: body.maxRegisters === undefined ? selectedPackage.maxRegisters : Number(body.maxRegisters),
            features: (Array.isArray(body.features)
                ? body.features
                : featureSetForPackage(selectedPackage.id, Boolean(body.supportPlus))) as LicenceFeature[],
            issuedAt,
            expiresAt,
            tier: selectedPackage.id,
        };
        const key = generateLicenceKey(payload, LICENCE_SECRET);
        await insertLicenceRecord(payload, key);
        res.json({
            licenceId,
            key,
            tenantName: payload.tenantName,
            tier: payload.tier,
            maxRegisters: payload.maxRegisters,
            features: payload.features,
            package: selectedPackage,
            addOns: body.supportPlus && selectedPackage.id === "whitelabel" ? [JPOS_PACKAGE_ADDONS[0]] : [],
            issuedAt: new Date(issuedAt * 1000).toISOString(),
            expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
        });
    }
    catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to generate licence" });
    }
});
licenceRouter.get("/packages", (_req, res) => {
    res.json({
        packages: JPOS_PACKAGES,
        addOns: JPOS_PACKAGE_ADDONS,
    });
});
licenceRouter.post("/admin/licence/revoke", requireAdminKey, async (req, res) => {
    try {
        ensureServerConfigured();
        const { licenceId, reason } = req.body as {
            licenceId?: string;
            reason?: string;
        };
        if (!licenceId) {
            res.status(400).json({ error: "licenceId required" });
            return;
        }
        await query("UPDATE licences SET revoked = $1, revoked_at = NOW(), revoked_reason = $2 WHERE licence_id = $3", [1, reason || null, licenceId]);
        res.json({ success: true, licenceId });
    }
    catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to revoke licence" });
    }
});
licenceRouter.get("/licence/validate/:licenceId", validateLimiter, async (req, res) => {
    try {
        const { licenceId } = req.params;
        if (!licenceId || licenceId.length > 64) {
            res.status(400).json({ valid: false, reason: "Invalid request" });
            return;
        }
        const rows = await query<LicenceRecord>("SELECT revoked, revoked_reason, expires_at FROM licences WHERE licence_id = $1 LIMIT 1", [licenceId]);
        const record = rows[0];
        if (!record) {
            res.json({ valid: false, reason: "Licence not found" });
            return;
        }
        if (record.revoked === true || record.revoked === 1) {
            res.json({ valid: false, reason: record.revoked_reason || "Licence revoked" });
            return;
        }
        if (record.expires_at && new Date(record.expires_at) < new Date()) {
            res.json({ valid: false, reason: "Licence expired" });
            return;
        }
        res.json({ valid: true });
    }
    catch (err: any) {
        res.status(500).json({ valid: false, reason: err.message || "Validation failed" });
    }
});
function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
    if (!safeEqual(String(req.headers["x-admin-key"] || ""), ADMIN_API_KEY)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    next();
}
function safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length === 0 || left.length !== right.length)
        return false;
    return crypto.timingSafeEqual(left, right);
}
function ensureServerConfigured() {
    if (!LICENCE_SECRET || !ADMIN_API_KEY) {
        throw new Error("LICENCE_SECRET and ADMIN_API_KEY must be set");
    }
}
async function insertLicenceRecord(payload: LicencePayload, key: string) {
    await query(`INSERT INTO licences (
      licence_id, tenant_name, key_hash, tier, max_registers, features, issued_at, expires_at, revoked
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
        payload.licenceId,
        payload.tenantName,
        hashLicenceKey(key),
        payload.tier,
        payload.maxRegisters,
        JSON.stringify(payload.features),
        new Date(payload.issuedAt * 1000),
        payload.expiresAt ? new Date(payload.expiresAt * 1000) : null,
        0,
    ]);
}
