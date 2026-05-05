# Phase 2: JWT Authentication - Manual Integration Steps

## Files Created (Already Done)
✅ `server/auth-middleware.ts` - JWT middleware, token generation, auth middleware
✅ `server/auth-handler.ts` - Login, logout, refresh, setup password handlers
✅ `server/migrate-add-password-hash.sql` - Database migration

## Manual Steps Required

### 1. Update `server.ts` - Add Imports (after line 42)

Add these imports after the mariadb-crud.ts import block:

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

### 2. Update `server.ts` - Add Auth Routes (after line 131)

Add these routes after the health endpoint:

```typescript
  // Auth Routes
  app.post("/api/auth/login", handleLogin);
  app.post("/api/auth/logout", handleLogout);
  app.post("/api/auth/refresh", handleRefreshToken);
  app.get("/api/auth/me", requireAuth, handleGetMe);
  app.post("/api/auth/setup-password", requireAuth, handleSetupPassword);
```

### 3. Update `.env.example` - Add JWT Configuration (after line 24)

Add these environment variables:

```
# JWT Authentication
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="8h"
REFRESH_TOKEN_EXPIRES_IN="7d"
```

### 4. Update `db/schema.sql` - Add password_hash to staff table (line 82)

Change:
```sql
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(64),
```

To:
```sql
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  phone VARCHAR(64),
```

### 5. Run Database Migration

Execute this SQL on your MariaDB database:
```sql
ALTER TABLE staff ADD COLUMN password_hash VARCHAR(255) AFTER email;
```

### 6. Create Test User (after DB migration)

You can use the `/api/auth/setup-password` endpoint after logging in as admin, or directly insert into DB:

```sql
-- Hash for password "test123" (generated with bcrypt)
UPDATE staff SET password_hash = '$2a$10$...' WHERE email = 'admin@test.com';
```

## Frontend Changes (Next Step)

After backend is integrated, update `src/hooks/useAuth.ts` to use JWT instead of Firebase.
