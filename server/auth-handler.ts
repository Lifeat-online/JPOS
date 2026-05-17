import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { query, getConnection } from './db.js';
import { seedDemoData } from './demo-seed.js';
import { ensureBulkInventorySchema } from './init-db.js';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyToken, 
  AuthTokenPayload 
} from './auth-middleware.js';

// Hash password for storage
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Verify password against hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function buildAuthResponse(staff: {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  name: string;
  role: string;
  email: string;
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
    },
  };
}

async function ensureDemoTenant() {
  const tenantId = 'demo-tenant-001';
  const staffId = 'demo-admin-001';
  const email = 'demo@jimmyspos.test';
  const name = 'Demo Admin';
  const tenantName = "Jimmy's POS Demo";
  const passwordHash = await hashPassword('DemoPass123');

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
      isRestaurantMode: true,
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
  await seedDemoData(tenantId, 'restaurant');

  return {
    id: staffId,
    tenant_id: tenantId,
    tenant_name: tenantName,
    name,
    role: 'admin',
    email,
  };
}

export async function handleStartDemo(_req: Request, res: Response) {
  try {
    const staff = await ensureDemoTenant();
    res.json({ ...buildAuthResponse(staff), seeded: true });
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
    const business = { name: businessName, currency: 'R', taxRate: 15 };

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

    res.status(201).json(buildAuthResponse({
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

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find staff by email - if tenantId provided, scope to that tenant
    let sql = `
      SELECT 
        s.id, s.tenant_id, s.name, s.role, s.email, s.password_hash, s.status,
        t.name as tenant_name
      FROM staff s
      JOIN tenants t ON s.tenant_id = t.id
      WHERE s.email = ? AND s.status = 'active'
    `;
    const params: any[] = [email.toLowerCase()];

    if (tenantId) {
      sql += ` AND s.tenant_id = ?`;
      params.push(tenantId);
    }

    const rows = await query<any>(sql, params);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const staff = rows[0];

    // If no password_hash is set, reject login
    if (!staff.password_hash) {
      return res.status(401).json({ error: 'Account not configured for password login. Contact admin.' });
    }

    // Verify password
    const isValid = await verifyPassword(password, staff.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json(buildAuthResponse(staff));

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Logout endpoint handler
export async function handleLogout(req: Request, res: Response) {
  // In a stateless JWT setup, the client simply discards the token
  // For enhanced security, you could maintain a token blacklist
  // or store refresh tokens and revoke them here
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

    // Create clean payload without exp property for new tokens
    const cleanPayload: AuthTokenPayload = {
      uid: payload.uid,
      email: payload.email,
      name: payload.name,
      tenantId: payload.tenantId,
      role: payload.role,
      staffId: payload.staffId
    };

    // Generate new access token
    const newAccessToken = generateAccessToken(cleanPayload);
    const newRefreshToken = generateRefreshToken(cleanPayload);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get current user info from token
export async function handleGetMe(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.json({
    user: {
      id: req.user.staffId,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      tenantId: req.user.tenantId
    }
  });
}

// Setup password for staff (admin/dev only)
export async function handleSetupPassword(req: Request, res: Response) {
  try {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'dev')) {
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

    res.json({ message: 'Password set successfully' });

  } catch (error) {
    console.error('Setup password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
