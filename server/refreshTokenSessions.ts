import crypto from "crypto";
import type { Request } from "express";
import { query } from "./db.js";
import { recordAuditEventSafe } from "./audit.js";
type StoreRefreshTokenInput = {
    token: string;
    tenantId: string;
    staffId: string;
    staffName?: string | null;
    expiresAt?: Date | null;
    replacedToken?: string | null;
};
function id(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
export function hashRefreshToken(token: string) {
    return crypto.createHash("sha256").update(token).digest("hex");
}
export function expiryFromJwtPayload(payload: any) {
    const exp = Number(payload?.exp || 0);
    return Number.isFinite(exp) && exp > 0 ? new Date(exp * 1000) : null;
}
function requestMeta(req: Request) {
    return {
        ipAddress: req.ip || req.socket?.remoteAddress || null,
        userAgent: req.get?.("user-agent") || null,
    };
}
export async function storeRefreshTokenSession(req: Request, input: StoreRefreshTokenInput) {
    const tokenHash = hashRefreshToken(input.token);
    const replacedHash = input.replacedToken ? hashRefreshToken(input.replacedToken) : null;
    const meta = requestMeta(req);
    if (replacedHash) {
        await query(`UPDATE refresh_token_sessions
          SET revoked_at = COALESCE(revoked_at, NOW()),
              revoked_reason = COALESCE(revoked_reason, 'rotated'),
              replaced_by_token_hash = $1
        WHERE token_hash = $2`, [tokenHash, replacedHash]);
    }
    await query(`INSERT INTO refresh_token_sessions (
       id, tenant_id, staff_id, token_hash, ip_address, user_agent,
       expires_at, created_at, last_used_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`, [
        id("rts"),
        input.tenantId,
        input.staffId,
        tokenHash,
        meta.ipAddress,
        meta.userAgent,
        input.expiresAt || null,
    ]);
    return tokenHash;
}
export async function verifyStoredRefreshToken(token: string) {
    const tokenHash = hashRefreshToken(token);
    const rows = await query<any>(`SELECT id, tenant_id AS tenantId, staff_id AS staffId, token_hash AS tokenHash,
            revoked_at AS revokedAt, expires_at AS expiresAt
       FROM refresh_token_sessions
      WHERE token_hash = $1
      LIMIT 1`, [tokenHash]);
    const row = rows[0];
    if (!row)
        return { valid: false, reason: "not_found", tokenHash };
    if (row.revokedAt ?? row.revoked_at)
        return { valid: false, reason: "revoked", tokenHash, row };
    const expiresAt = row.expiresAt ?? row.expires_at;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now())
        return { valid: false, reason: "expired", tokenHash, row };
    await query(`UPDATE refresh_token_sessions SET last_used_at = NOW() WHERE token_hash = $1`, [tokenHash]);
    return { valid: true, tokenHash, row };
}
export async function revokeRefreshToken(req: Request, token: string | null | undefined, reason = "logout") {
    if (!token)
        return 0;
    const tokenHash = hashRefreshToken(token);
    await query(`UPDATE refresh_token_sessions
        SET revoked_at = COALESCE(revoked_at, NOW()),
            revoked_reason = COALESCE(revoked_reason, $1)
      WHERE token_hash = $2`, [reason, tokenHash]);
    return 1;
}
export async function revokeStaffRefreshTokens(req: Request, tenantId: string, staffId: string, reason = "suspected_compromise") {
    await query(`UPDATE refresh_token_sessions
        SET revoked_at = COALESCE(revoked_at, NOW()),
            revoked_reason = COALESCE(revoked_reason, $1)
      WHERE tenant_id = $2 AND staff_id = $3 AND revoked_at IS NULL`, [reason, tenantId, staffId]);
    await recordAuditEventSafe({
        tenantId,
        action: "auth.refresh_tokens_revoked",
        entityType: "security",
        entityId: staffId,
        staffId: req.user?.staffId || req.user?.uid || null,
        staffName: req.user?.name || null,
        source: "auth",
        details: {
            targetStaffId: staffId,
            reason,
            ip: req.ip || req.socket?.remoteAddress || null,
            userAgent: req.get?.("user-agent") || null,
        },
    });
}
