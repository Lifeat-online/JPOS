import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { query, getConnection } from './db.ts';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyToken, 
  AuthTokenPayload 
} from './auth-middleware.ts';

// Hash password for storage
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Verify password against hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
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

    // Create JWT payload
    const payload: AuthTokenPayload = {
      uid: staff.id, // Using staff ID as uid for compatibility
      email: staff.email,
      name: staff.name,
      tenantId: staff.tenant_id,
      role: staff.role,
      staffId: staff.id
    };

    // Generate tokens
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token in database (optional - for token revocation)
    // For simplicity, we're not storing refresh tokens in this implementation
    // In production, consider storing refresh tokens in a separate table

    // Return tokens and user info
    res.json({
      accessToken,
      refreshToken,
      user: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
        tenantId: staff.tenant_id,
        tenantName: staff.tenant_name
      }
    });

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

// Setup password for staff (admin only)
export async function handleSetupPassword(req: Request, res: Response) {
  try {
    if (!req.user || req.user.role !== 'admin') {
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
