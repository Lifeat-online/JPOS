import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { query, getConnection } from './db.js';
import { seedDemoData, type DemoSeedMode } from './demo-seed.js';
import { ensureBulkInventorySchema } from './init-db.js';
import { getHostedPackage } from '../shared/packageCatalog.js';
import { recordAuditEventSafe } from './audit.js';
import {
  buildTotpUri,
  generateTotpSecret,
  isPrivilegedTwoFactorRole,
  verifyTotpCode,
} from './twoFactor.js';
import {
  expiryFromJwtPayload,
  revokeRefreshToken,
  revokeStaffRefreshTokens,
  storeRefreshTokenSession,
  verifyStoredRefreshToken,
} from './refreshTokenSessions.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  AuthTokenPayload,
  DEV_EMAIL,
  DEV_TENANT_ID,
  devBootstrapEnabled,
  isDevEmail,
  normalizeEmail,
  normalizeAuthTokenPayload,
} from './auth-middleware.js';

// Hash password for storage.
// 12 rounds of bcryptjs ≈ 250-400ms on a typical CPU — strong enough
// for a POS app and stays pure-JS (no native build deps on the
// Hetzner VPS). Existing 10-round hashes still verify fine because
// bcryptjs.compare is format-agnostic; the next password change
// re-hashes at 12 rounds.
const BCRYPT_ROUNDS = 12;
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(password, salt);
}

// Verify password against hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

type StaffAuthRow = {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  name: string;
  role: string;
  email: string;
  password_hash?: string | null;
  two_factor_enabled?: number | boolean | string | null;
  two_factor_secret?: string | null;
  two_factor_confirmed_at?: string | null;
  status?: string;
};

async function ensureTenantExists(tenantId: string, tenantName: string) {
  const tenants = await query<any>('SELECT id, name FROM tenants WHERE id = ? LIMIT 1', [tenantId]);
  if (tenants.length > 0) {
    return tenants[0].name || tenantName;
  }

  await query('INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())', [tenantId, tenantName]);
  return tenantName;
}

async function normalizeDevStaff(staff: StaffAuthRow): Promise<StaffAuthRow> {
  if (!devBootstrapEnabled()) {
    throw new Error('Dev staff normalization is disabled (ENABLE_DEV_BOOTSTRAP=false)');
  }
  const tenantName = await ensureTenantExists(DEV_TENANT_ID, staff.tenant_name || "MasePOS");
  const nextStaff: StaffAuthRow = {
    ...staff,
    tenant_id: DEV_TENANT_ID,
    tenant_name: tenantName,
    role: 'dev',
    email: DEV_EMAIL,
    status: 'active',
  };

  try {
    await query(
      'UPDATE staff SET tenant_id = ?, role = ?, email = ?, status = ?, updated_at = NOW() WHERE id = ?',
      [DEV_TENANT_ID, 'dev', DEV_EMAIL, 'active', staff.id]
    );
    await query(
      'UPDATE users SET tenant_id = ?, email = ?, name = ?, updated_at = NOW() WHERE uid = ?',
      [DEV_TENANT_ID, DEV_EMAIL, staff.name, staff.id]
    );
  } catch (error) {
    console.warn('Unable to persist Dev staff tenant normalization:', error);
  }

  return nextStaff;
}

function buildAuthResponse(staff: {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  name: string;
  role: string;
  email: string;
  two_factor_enabled?: number | boolean | string | null;
}) {
  const payload: AuthTokenPayload = {
    uid: staff.id,
    email: staff.email,
    name: staff.name,
    tenantId: staff.tenant_id,
    role: staff.role,
    staffId: staff.id,
  };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    user: {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      tenantId: staff.tenant_id,
      tenantName: staff.tenant_name,
      twoFactorEnabled: truthy(staff.two_factor_enabled),
      twoFactorEligible: isPrivilegedTwoFactorRole(staff.role),
    },
  };
}

async function issueAuthResponse(
  req: Request,
  staff: {
    id: string;
    tenant_id: string;
    tenant_name?: string;
    name: string;
    role: string;
    email: string;
    two_factor_enabled?: number | boolean | string | null;
  },
  replacedToken?: string | null
) {
  const response = buildAuthResponse(staff);
  const refreshPayload = verifyToken(response.refreshToken) as (AuthTokenPayload & { exp?: number }) | null;
  await storeRefreshTokenSession(req, {
    token: response.refreshToken,
    tenantId: staff.tenant_id,
    staffId: staff.id,
    staffName: staff.name,
    expiresAt: expiryFromJwtPayload(refreshPayload),
    replacedToken: replacedToken || null,
  });
  return response;
}

function truthy(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function requestAuditDetails(req: Request, extra: Record<string, unknown> = {}) {
  return {
    ip: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.get?.('user-agent') || null,
    ...extra,
  };
}

function resolveAuthUser(req: Request): AuthTokenPayload | null {
  if (req.user) return req.user;

  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.substring(7));
}

async function recordLoginFailure(req: Request, input: {
  tenantId?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  email?: string | null;
  reason: string;
}) {
  if (!input.tenantId) return;

  await recordAuditEventSafe({
    tenantId: input.tenantId,
    action: 'auth.login_failed',
    entityType: 'security',
    entityId: input.staffId || null,
    staffId: input.staffId || null,
    staffName: input.staffName || null,
    source: 'auth',
    details: requestAuditDetails(req, {
      email: input.email || null,
      reason: input.reason,
    }),
  });
}

function parseDemoMode(value: unknown): DemoSeedMode {
  return value === 'retail' ? 'retail' : 'restaurant';
}

async function ensureDemoTenant(mode: DemoSeedMode) {
  const tenantId = 'demo-tenant-001';
  const staffId = 'demo-admin-001';
  const email = 'demo@masepos.test';
  const name = 'Demo Admin';
  const tenantName = "MasePOS Demo";
  const passwordHash = await hashPassword('DemoPass123');
  const demoPackage = getHostedPackage('business');

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [tenants] = await conn.query<any>('SELECT id FROM tenants WHERE id = ?', [tenantId]);
    if (tenants.length === 0) {
      await conn.query(
        'INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
        [tenantId, tenantName]
      );
    } else {
      await conn.query('UPDATE tenants SET name = ?, updated_at = NOW() WHERE id = ?', [tenantName, tenantId]);
    }

    const [users] = await conn.query<any>('SELECT uid FROM users WHERE uid = ?', [staffId]);
    if (users.length === 0) {
      await conn.query(
        'INSERT INTO users (uid, tenant_id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [staffId, tenantId, email, name]
      );
    } else {
      await conn.query(
        'UPDATE users SET tenant_id = ?, email = ?, name = ?, updated_at = NOW() WHERE uid = ?',
        [tenantId, email, name, staffId]
      );
    }

    const [staffRows] = await conn.query<any>('SELECT id FROM staff WHERE id = ?', [staffId]);
    if (staffRows.length === 0) {
      await conn.query(
        `INSERT INTO staff (id, tenant_id, name, role, email, password_hash, status, created_at, updated_at)
         VALUES (?, ?, ?, 'admin', ?, ?, 'active', NOW(), NOW())`,
        [staffId, tenantId, name, email, passwordHash]
      );
    } else {
      await conn.query(
        `UPDATE staff
         SET tenant_id = ?, name = ?, role = 'admin', email = ?, password_hash = ?, status = 'active', updated_at = NOW()
         WHERE id = ?`,
        [tenantId, name, email, passwordHash, staffId]
      );
    }

    const business = {
      name: tenantName,
      currency: 'R',
      taxRate: 15,
      isRestaurantMode: mode === 'restaurant',
      packageTier: demoPackage.id,
      packageName: demoPackage.name,
      packageStatus: 'active',
      maxRegisters: demoPackage.maxRegisters,
      maxProducts: demoPackage.maxProducts,
      maxStaff: demoPackage.maxStaff,
      maxCustomers: demoPackage.maxCustomers,
      enableLoyalty: true,
      pointsEarnedPerCurrency: 1,
      pointsRequiredForDiscount: 100,
      discountAmountForPoints: 10,
    };
    const [settings] = await conn.query<any>('SELECT tenant_id FROM app_settings WHERE tenant_id = ?', [tenantId]);
    if (settings.length === 0) {
      await conn.query(
        `INSERT INTO app_settings (
          tenant_id, payfast_merchant_id, payfast_merchant_key, payfast_passphrase,
          payfast_sandbox, business, categories, slug, setup_completed, created_at, updated_at
        ) VALUES (?, '10000100', '46f0cd694581a', 'jt7v60h69n8a1', 1, ?, NULL, 'demo', 1, NOW(), NOW())`,
        [tenantId, JSON.stringify(business)]
      );
    } else {
      await conn.query(
        `UPDATE app_settings
         SET business = ?, slug = 'demo', setup_completed = 1, updated_at = NOW()
         WHERE tenant_id = ?`,
        [JSON.stringify(business), tenantId]
      );
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  await ensureBulkInventorySchema();
  await seedDemoData(tenantId, mode);

  return {
    id: staffId,
    tenant_id: tenantId,
    tenant_name: tenantName,
    name,
    role: 'admin',
    email,
  };
}

export async function handleStartDemo(req: Request, res: Response) {
  try {
    const mode = parseDemoMode(req.body?.mode);
    const staff = await ensureDemoTenant(mode);
    res.json({ ...(await issueAuthResponse(req, staff)), seeded: true, mode });
  } catch (error) {
    console.error('Demo start error:', error);
    res.status(500).json({ error: 'Unable to start demo workspace' });
  }
}

export async function handleEnrollment(req: Request, res: Response) {
  try {
    const ownerName = String(req.body?.ownerName || '').trim();
    const businessName = String(req.body?.businessName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!ownerName || !businessName || !email || !password) {
      return res.status(400).json({ error: 'Business name, owner name, email, and password are required' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await query<any>('SELECT id FROM staff WHERE email = ? AND status = \'active\' LIMIT 1', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An active staff account already exists for this email' });
    }

    const tenantId = `tnt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const staffId = `staff_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const passwordHash = await hashPassword(password);
    const requestedPackage = getHostedPackage(String(req.body?.packageTier || 'free'));
    const business = {
      name: businessName,
      currency: 'R',
      taxRate: 15,
      packageTier: requestedPackage.id,
      packageName: requestedPackage.name,
      maxRegisters: requestedPackage.maxRegisters,
    };

    const conn = await getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        'INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
        [tenantId, businessName]
      );
      await conn.query(
        'INSERT INTO users (uid, tenant_id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [staffId, tenantId, email, ownerName]
      );
      await conn.query(
        `INSERT INTO staff (id, tenant_id, name, role, email, password_hash, status, created_at, updated_at)
         VALUES (?, ?, ?, 'admin', ?, ?, 'active', NOW(), NOW())`,
        [staffId, tenantId, ownerName, email, passwordHash]
      );
      await conn.query(
        `INSERT INTO app_settings (
          tenant_id, payfast_merchant_id, payfast_merchant_key, payfast_passphrase,
          payfast_sandbox, business, categories, slug, setup_completed, created_at, updated_at
        ) VALUES (?, '10000100', '46f0cd694581a', 'jt7v60h69n8a1', 1, ?, NULL, NULL, 0, NOW(), NOW())`,
        [tenantId, JSON.stringify(business)]
      );

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    res.status(201).json(await issueAuthResponse(req, {
      id: staffId,
      tenant_id: tenantId,
      tenant_name: businessName,
      name: ownerName,
      role: 'admin',
      email,
    }));
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ error: 'Unable to start enrollment' });
  }
}

// Login endpoint handler
export async function handleLogin(req: Request, res: Response) {
  try {
    const { email, password, tenantId } = (req.body ?? {}) as any;
    const emailValue = normalizeEmail(email);
    const isDev = isDevEmail(emailValue);

    if (!emailValue || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find staff by email - if tenantId provided, scope to that tenant
    let sql = `
      SELECT 
        s.id, s.tenant_id, s.name, s.role, s.email, s.password_hash,
        s.two_factor_enabled, s.two_factor_secret, s.two_factor_confirmed_at, s.status,
        t.name as tenant_name
      FROM staff s
      JOIN tenants t ON s.tenant_id = t.id
      WHERE LOWER(s.email) = ? AND s.status = 'active'
    `;
    const params: any[] = [emailValue];

    if (!isDev && tenantId) {
      sql += ` AND s.tenant_id = ?`;
      params.push(tenantId);
    }

    if (isDev) {
      sql += ` ORDER BY CASE WHEN s.tenant_id = ? THEN 0 ELSE 1 END`;
      params.push(DEV_TENANT_ID);
    }

    if (!isDev) {
      sql += ` LIMIT 1`;
    }

    const rows = await query<any>(sql, params);

    if (rows.length === 0) {
      await recordLoginFailure(req, {
        tenantId: typeof tenantId === 'string' ? tenantId : null,
        email: emailValue,
        reason: 'staff_not_found',
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const candidates = (isDev ? rows : rows.slice(0, 1)) as StaffAuthRow[];
    const hasConfiguredPassword = candidates.some(staff => Boolean(staff.password_hash));
    let staff: StaffAuthRow | null = null;

    for (const candidate of candidates) {
      if (!candidate.password_hash) continue;
      if (await verifyPassword(password, candidate.password_hash)) {
        staff = candidate;
        break;
      }
    }

    if (!hasConfiguredPassword) {
      await recordLoginFailure(req, {
        tenantId: candidates[0]?.tenant_id || null,
        staffId: candidates[0]?.id || null,
        staffName: candidates[0]?.name || null,
        email: emailValue,
        reason: 'password_not_configured',
      });
      return res.status(401).json({ error: 'Account not configured for password login. Contact admin.' });
    }

    if (!staff) {
      await recordLoginFailure(req, {
        tenantId: candidates[0]?.tenant_id || null,
        staffId: candidates[0]?.id || null,
        staffName: candidates[0]?.name || null,
        email: emailValue,
        reason: 'password_mismatch',
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const authStaff = isDev ? await normalizeDevStaff(staff) : staff;
    if (isPrivilegedTwoFactorRole(authStaff.role) && truthy(authStaff.two_factor_enabled)) {
      const twoFactorCode = String(req.body?.twoFactorCode || req.body?.totpCode || '').trim();
      if (!verifyTotpCode(authStaff.two_factor_secret, twoFactorCode)) {
        await recordAuditEventSafe({
          tenantId: authStaff.tenant_id,
          action: twoFactorCode ? 'auth.two_factor_failed' : 'auth.two_factor_required',
          entityType: 'security',
          entityId: authStaff.id,
          staffId: authStaff.id,
          staffName: authStaff.name,
          source: 'auth',
          details: requestAuditDetails(req, {
            email: authStaff.email,
            role: authStaff.role,
          }),
        });
        return res.status(401).json({
          error: twoFactorCode ? 'Invalid two-factor code' : 'Two-factor code required',
          twoFactorRequired: true,
          role: authStaff.role,
        });
      }
    }

    await recordAuditEventSafe({
      tenantId: authStaff.tenant_id,
      action: 'auth.login_succeeded',
      entityType: 'security',
      entityId: authStaff.id,
      staffId: authStaff.id,
      staffName: authStaff.name,
      source: 'auth',
      details: requestAuditDetails(req, {
        email: authStaff.email,
        role: authStaff.role,
      }),
    });
    res.json(await issueAuthResponse(req, authStaff));

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Logout endpoint handler
export async function handleLogout(req: Request, res: Response) {
  const user = resolveAuthUser(req);
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : null;

  await revokeRefreshToken(req, refreshToken, 'logout');

  if (user?.tenantId) {
    await recordAuditEventSafe({
      tenantId: user.tenantId,
      action: 'auth.logout',
      entityType: 'security',
      entityId: user.staffId || user.uid || null,
      staffId: user.staffId || user.uid || null,
      staffName: user.name || null,
      source: 'auth',
      details: requestAuditDetails(req, {
        email: user.email,
        role: user.role,
        refreshTokenRevoked: Boolean(refreshToken),
      }),
    });
  }

  res.json({ message: 'Logged out successfully' });
}

// Refresh token endpoint handler
export async function handleRefreshToken(req: Request, res: Response) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const payload = verifyToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const stored = await verifyStoredRefreshToken(refreshToken);
    if (!stored.valid) {
      await recordAuditEventSafe({
        tenantId: payload.tenantId,
        action: 'auth.refresh_token_rejected',
        entityType: 'security',
        entityId: payload.staffId || payload.uid || null,
        staffId: payload.staffId || payload.uid || null,
        staffName: payload.name || null,
        source: 'auth',
        details: requestAuditDetails(req, {
          reason: stored.reason,
        }),
      });
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    const storedRow = stored.row as { tenantId?: string; tenant_id?: string; staffId?: string; staff_id?: string } | undefined;
    if (storedRow && ((storedRow.tenantId ?? storedRow.tenant_id) !== payload.tenantId || (storedRow.staffId ?? storedRow.staff_id) !== (payload.staffId || payload.uid))) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Create clean payload without exp property for new tokens
    const cleanPayload: AuthTokenPayload = normalizeAuthTokenPayload({
      uid: payload.uid,
      email: payload.email,
      name: payload.name,
      tenantId: payload.tenantId,
      role: payload.role,
      staffId: payload.staffId
    });

    // Generate new access token
    const newAccessToken = generateAccessToken(cleanPayload);
    const newRefreshToken = generateRefreshToken(cleanPayload);
    const newRefreshPayload = verifyToken(newRefreshToken) as (AuthTokenPayload & { exp?: number }) | null;

    await storeRefreshTokenSession(req, {
      token: newRefreshToken,
      tenantId: cleanPayload.tenantId,
      staffId: cleanPayload.staffId || cleanPayload.uid,
      staffName: cleanPayload.name,
      expiresAt: expiryFromJwtPayload(newRefreshPayload),
      replacedToken: refreshToken,
    });

    await recordAuditEventSafe({
      tenantId: cleanPayload.tenantId,
      action: 'auth.refresh_token_rotated',
      entityType: 'security',
      entityId: cleanPayload.staffId || cleanPayload.uid || null,
      staffId: cleanPayload.staffId || cleanPayload.uid || null,
      staffName: cleanPayload.name || null,
      source: 'auth',
      details: requestAuditDetails(req, {}),
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function handleRevokeRefreshTokens(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const actorStaffId = req.user.staffId || req.user.uid;
    const targetStaffId = String(req.body?.staffId || actorStaffId || '').trim();
    const isSelf = targetStaffId === actorStaffId;
    const canRevokeOthers = req.user.role === 'admin' || req.user.role === 'dev';

    if (!targetStaffId) {
      return res.status(400).json({ error: 'Staff ID required' });
    }

    if (!isSelf && !canRevokeOthers) {
      await recordAuditEventSafe({
        tenantId: req.user.tenantId,
        action: 'permission.denied',
        entityType: 'security',
        entityId: actorStaffId || null,
        staffId: actorStaffId || null,
        staffName: req.user.name || null,
        source: 'permission',
        details: requestAuditDetails(req, {
          attemptedAction: 'auth.refresh_tokens.revoke',
          targetStaffId,
          role: req.user.role,
        }),
      });
      return res.status(403).json({ error: 'Admin access required to revoke another staff member sessions' });
    }

    const reason = String(req.body?.reason || (isSelf ? 'self_service' : 'suspected_compromise')).trim().slice(0, 255) || 'suspected_compromise';
    await revokeStaffRefreshTokens(req, req.user.tenantId, targetStaffId, reason);
    res.json({ revoked: true, staffId: targetStaffId });
  } catch (error) {
    console.error('Refresh token revoke error:', error);
    res.status(500).json({ error: 'Unable to revoke refresh sessions' });
  }
}

// Get current user info from token
export async function handleGetMe(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const rows = await query<any>(
    `SELECT two_factor_enabled AS twoFactorEnabled, two_factor_confirmed_at AS twoFactorConfirmedAt
       FROM staff
      WHERE tenant_id = ? AND id = ?
      LIMIT 1`,
    [req.user.tenantId, req.user.staffId || req.user.uid]
  );
  const twoFactor = rows[0] || {};

  res.json({
    user: {
      id: req.user.staffId,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      tenantId: req.user.tenantId,
      twoFactorEnabled: truthy(twoFactor.twoFactorEnabled ?? twoFactor.two_factor_enabled),
      twoFactorEligible: isPrivilegedTwoFactorRole(req.user.role),
      twoFactorConfirmedAt: twoFactor.twoFactorConfirmedAt ?? twoFactor.two_factor_confirmed_at ?? null,
    }
  });
}

function requireTwoFactorEligibleUser(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  if (!isPrivilegedTwoFactorRole(req.user.role)) {
    res.status(403).json({ error: '2FA is available for admin, manager, and dev accounts.' });
    return false;
  }
  return true;
}

async function loadCurrentStaffSecurity(req: Request) {
  const rows = await query<any>(
    `SELECT id, name, role, email, password_hash AS passwordHash,
            two_factor_enabled AS twoFactorEnabled,
            two_factor_secret AS twoFactorSecret,
            two_factor_confirmed_at AS twoFactorConfirmedAt
       FROM staff
      WHERE tenant_id = ? AND id = ?
      LIMIT 1`,
    [req.user?.tenantId, req.user?.staffId || req.user?.uid]
  );
  return rows[0] || null;
}

export async function handleTwoFactorStatus(req: Request, res: Response) {
  try {
    if (!requireTwoFactorEligibleUser(req, res)) return;
    const staff = await loadCurrentStaffSecurity(req);
    res.json({
      eligible: true,
      enabled: truthy(staff?.twoFactorEnabled ?? staff?.two_factor_enabled),
      confirmedAt: staff?.twoFactorConfirmedAt ?? staff?.two_factor_confirmed_at ?? null,
    });
  } catch (error) {
    console.error('2FA status error:', error);
    res.status(500).json({ error: 'Unable to load 2FA status' });
  }
}

export async function handleTwoFactorSetup(req: Request, res: Response) {
  try {
    if (!requireTwoFactorEligibleUser(req, res)) return;
    const secret = generateTotpSecret();
    await query(
      `UPDATE staff
          SET two_factor_secret = ?,
              two_factor_enabled = 0,
              two_factor_confirmed_at = NULL,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [secret, req.user!.tenantId, req.user!.staffId || req.user!.uid]
    );

    await recordAuditEventSafe({
      tenantId: req.user!.tenantId,
      action: 'auth.two_factor_setup_started',
      entityType: 'security',
      entityId: req.user!.staffId || req.user!.uid || null,
      staffId: req.user!.staffId || req.user!.uid || null,
      staffName: req.user!.name || null,
      source: 'auth',
      details: requestAuditDetails(req, { role: req.user!.role }),
    });

    res.json({
      secret,
      otpauthUri: buildTotpUri({
        accountName: req.user!.email || req.user!.name || 'staff',
        secret,
      }),
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ error: 'Unable to start 2FA setup' });
  }
}

export async function handleTwoFactorConfirm(req: Request, res: Response) {
  try {
    if (!requireTwoFactorEligibleUser(req, res)) return;
    const code = String(req.body?.code || req.body?.twoFactorCode || '').trim();
    const staff = await loadCurrentStaffSecurity(req);
    if (!staff?.twoFactorSecret && !staff?.two_factor_secret) {
      return res.status(400).json({ error: 'Start 2FA setup before confirming.' });
    }
    if (!verifyTotpCode(staff.twoFactorSecret ?? staff.two_factor_secret, code)) {
      return res.status(400).json({ error: 'Invalid two-factor code' });
    }

    await query(
      `UPDATE staff
          SET two_factor_enabled = 1,
              two_factor_confirmed_at = NOW(),
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [req.user!.tenantId, req.user!.staffId || req.user!.uid]
    );
    await recordAuditEventSafe({
      tenantId: req.user!.tenantId,
      action: 'auth.two_factor_enabled',
      entityType: 'security',
      entityId: req.user!.staffId || req.user!.uid || null,
      staffId: req.user!.staffId || req.user!.uid || null,
      staffName: req.user!.name || null,
      source: 'auth',
      details: requestAuditDetails(req, { role: req.user!.role }),
    });
    res.json({ enabled: true });
  } catch (error) {
    console.error('2FA confirm error:', error);
    res.status(500).json({ error: 'Unable to confirm 2FA setup' });
  }
}

export async function handleTwoFactorDisable(req: Request, res: Response) {
  try {
    if (!requireTwoFactorEligibleUser(req, res)) return;
    const password = String(req.body?.password || '');
    const code = String(req.body?.code || req.body?.twoFactorCode || '').trim();
    const staff = await loadCurrentStaffSecurity(req);
    const passwordHash = staff?.passwordHash ?? staff?.password_hash ?? null;
    if (!password || !passwordHash || !await verifyPassword(password, passwordHash)) {
      return res.status(403).json({ error: 'Current password is required to disable 2FA.' });
    }
    if (truthy(staff?.twoFactorEnabled ?? staff?.two_factor_enabled) && !verifyTotpCode(staff?.twoFactorSecret ?? staff?.two_factor_secret, code)) {
      return res.status(403).json({ error: 'Valid two-factor code is required to disable 2FA.' });
    }

    await query(
      `UPDATE staff
          SET two_factor_enabled = 0,
              two_factor_secret = NULL,
              two_factor_confirmed_at = NULL,
              updated_at = NOW()
        WHERE tenant_id = ? AND id = ?`,
      [req.user!.tenantId, req.user!.staffId || req.user!.uid]
    );
    await recordAuditEventSafe({
      tenantId: req.user!.tenantId,
      action: 'auth.two_factor_disabled',
      entityType: 'security',
      entityId: req.user!.staffId || req.user!.uid || null,
      staffId: req.user!.staffId || req.user!.uid || null,
      staffName: req.user!.name || null,
      source: 'auth',
      details: requestAuditDetails(req, { role: req.user!.role }),
    });
    res.json({ enabled: false });
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ error: 'Unable to disable 2FA' });
  }
}

// Setup password for staff (admin/dev only)
export async function handleSetupPassword(req: Request, res: Response) {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'dev')) {
      if (req.user?.tenantId) {
        await recordAuditEventSafe({
          tenantId: req.user.tenantId,
          action: 'permission.denied',
          entityType: 'security',
          entityId: req.user.staffId || req.user.uid || null,
          staffId: req.user.staffId || req.user.uid || null,
          staffName: req.user.name || null,
          source: 'permission',
          details: requestAuditDetails(req, {
            attemptedAction: 'auth.setup_password',
            role: req.user.role || null,
          }),
        });
      }
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { staffId, password } = req.body;

    if (!staffId || !password) {
      return res.status(400).json({ error: 'Staff ID and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await hashPassword(password);

    const result = await query(
      'UPDATE staff SET password_hash = ? WHERE id = ? AND tenant_id = ?',
      [passwordHash, staffId, req.user.tenantId]
    );

    await recordAuditEventSafe({
      tenantId: req.user.tenantId,
      action: 'staff.password_set',
      entityType: 'staff',
      entityId: staffId,
      staffId: req.user.staffId || req.user.uid || null,
      staffName: req.user.name || null,
      source: 'auth',
      details: requestAuditDetails(req, {
        targetStaffId: staffId,
        actorRole: req.user.role,
      }),
    });

    res.json({ message: 'Password set successfully' });

  } catch (error) {
    console.error('Setup password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
