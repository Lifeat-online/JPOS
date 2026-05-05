# Phase 2: JWT Authentication - Implementation Summary

## ✅ Completed

### 1. Dependencies Installed
- `jsonwebtoken` - JWT token generation/verification
- `bcryptjs` - Password hashing
- `@types/jsonwebtoken`, `@types/bcryptjs` - TypeScript types

### 2. Files Created

#### `server/auth-middleware.ts`
- JWT token generation (access + refresh tokens)
- Token verification function
- `requireAuth` middleware for protected routes
- `optionalAuth` middleware for optional authentication
- TypeScript types for auth payload

#### `server/auth-handler.ts`
- `handleLogin` - Email/password login, returns JWT tokens
- `handleLogout` - Logout endpoint (client discards token)
- `handleRefreshToken` - Refresh expired access tokens
- `handleGetMe` - Get current user info from token
- `handleSetupPassword` - Admin sets up staff password (bcrypt hashed)
- Helper functions: `hashPassword`, `verifyPassword`

#### `server/migrate-add-password-hash.sql`
- SQL to add `password_hash` column to staff table

### 3. Environment Configuration
Updated `.env.example` with:
```
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="8h"
REFRESH_TOKEN_EXPIRES_IN="7d"
```

---

## 🔧 Manual Steps Required

### Step 1: Add Imports to `server.ts`

Add after line 42 (after mariadb-crud.ts import):

```typescript
import {
  handleLogin,
  handleLogout,
  handleRefreshToken,
  handleGetMe,
  handleSetupPassword,
} from "./server/auth-handler.ts";
import { requireAuth, optionalAuth } from "./server/auth-middleware.ts";
```

### Step 2: Add Auth Routes to `server.ts`

Add after the health endpoint (after line 131):

```typescript
  // Auth Routes
  app.post("/api/auth/login", handleLogin);
  app.post("/api/auth/logout", handleLogout);
  app.post("/api/auth/refresh", handleRefreshToken);
  app.get("/api/auth/me", requireAuth, handleGetMe);
  app.post("/api/auth/setup-password", requireAuth, handleSetupPassword);
```

### Step 3: Run Database Migration

Execute this SQL on your MariaDB database:
```sql
ALTER TABLE staff ADD COLUMN password_hash VARCHAR(255) AFTER email;
```

### Step 4: Set JWT Secret

Update your `.env` file with a strong JWT secret:
```
JWT_SECRET=your-actual-secret-key-min-32-chars
```

### Step 5: Create Test User (Optional)

After starting the server, you can set up a password for a staff member:
1. First, ensure the staff member exists in the database
2. Use the setup-password endpoint (requires admin auth)
3. Or directly update the database with a bcrypt hash

---

## 🧪 Testing the Auth Endpoints

After integration, test with:

```bash
# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"test123"}'

# Should return: { accessToken, refreshToken, user: {...} }

# Test get current user
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Test refresh token
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

---

## 📝 Next Steps (Phase 3)

1. **Migrate `useAuth.ts`** - Update frontend to use JWT instead of Firebase Auth
2. **Add token management to frontend** - Store tokens in localStorage/sessionStorage
3. **Add Authorization header** - Include Bearer token in API requests
4. **Seed test data** - Create test users with passwords
5. **Update MIGRATION_STATUS.md** - Document Phase 2 completion
