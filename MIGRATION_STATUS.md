# MariaDB/Nginx Migration - Phase 1 & 2 Complete ✅

## Overview
Successfully migrated the data layer from Firebase Firestore to MariaDB with a complete REST API backend, and implemented JWT-based authentication system.

## Architecture Changes

### Before (Firebase)
```
React Frontend
    ↓
Firebase Client SDK (Auth + Firestore)
    ↓
Firebase Backend
```

### After (MariaDB + REST + JWT Auth)
```
React Frontend (JWT-based auth)
    ↓ (REST API calls with Bearer token)
Express Server (Node.js) + JWT Middleware
    ↓ (mysql2 with connection pool)
MariaDB Database
```

## Phase 1: Data Layer Migration ✅ COMPLETED

### New Files Created
1. **server/db.ts** - MariaDB connection pool and query executor
2. **server/mariadb-adapter.ts** - Read operations (GET endpoints)
3. **server/mariadb-crud.ts** - Write operations (CREATE/UPDATE/DELETE)
4. **server.ts** - Added 40+ REST endpoints
5. **src/api.ts** - REST client helpers + CRUD wrappers
6. **db/schema.sql** - Complete MariaDB schema
7. **nginx/nginx.conf** - Nginx reverse proxy config
8. **server/init-db.ts** - Database initialization script

### REST API Endpoints Implemented

#### Tenant Data Queries (11 endpoints)
- `GET /api/mariadb/health` - DB health check
- `GET /api/mariadb/tenants/:tenantId/products`
- `GET /api/mariadb/tenants/:tenantId/customers`
- `GET /api/mariadb/tenants/:tenantId/staff`
- `GET /api/mariadb/tenants/:tenantId/workstations`
- `GET /api/mariadb/tenants/:tenantId/sales`
- `GET /api/mariadb/tenants/:tenantId/config`
- `GET /api/mariadb/tenants/:tenantId/cash-sessions?staffId=...`
- `GET /api/mariadb/slugs/:slug/tenant`
- `GET /api/mariadb/users/:uid`
- `GET /api/mariadb/staff?email=...`

#### Products CRUD (3 endpoints)
- `POST /api/mariadb/tenants/:tenantId/products`
- `PUT /api/mariadb/tenants/:tenantId/products/:id`
- `DELETE /api/mariadb/tenants/:tenantId/products/:id`

#### Customers CRUD (3 endpoints)
- `POST /api/mariadb/tenants/:tenantId/customers`
- `PUT /api/mariadb/tenants/:tenantId/customers/:id`
- `DELETE /api/mariadb/tenants/:tenantId/customers/:id`

#### Staff CRUD (3 endpoints)
- `POST /api/mariadb/tenants/:tenantId/staff`
- `PUT /api/mariadb/tenants/:tenantId/staff/:id`
- `DELETE /api/mariadb/tenants/:tenantId/staff/:id`

#### Workstations CRUD (2 endpoints)
- `POST /api/mariadb/tenants/:tenantId/workstations`
- `DELETE /api/mariadb/tenants/:tenantId/workstations/:id`

#### Sales Operations (3 endpoints)
- `POST /api/mariadb/tenants/:tenantId/sales`
- `GET /api/mariadb/tenants/:tenantId/sales/:id`
- `PUT /api/mariadb/tenants/:tenantId/sales/:id` (update status)

### Frontend Hook Migrations
1. **useAppData.ts** - Migrated all data loading from Firestore subscriptions to REST API
2. **useBusinessPage.ts** - Migrated public page data fetching

---

## Phase 2: JWT Authentication ✅ COMPLETED

### New Files Created
1. **server/auth-middleware.ts** - JWT middleware and token management
   - `generateAccessToken()` - Creates short-lived access tokens (8h default)
   - `generateRefreshToken()` - Creates long-lived refresh tokens (7d default)
   - `verifyToken()` - Verifies and decodes JWT tokens
   - `requireAuth()` - Middleware to protect routes
   - `optionalAuth()` - Middleware for optional authentication

2. **server/auth-handler.ts** - Auth endpoint handlers
   - `handleLogin()` - Email/password login with bcrypt verification
   - `handleLogout()` - Logout endpoint (client discards token)
   - `handleRefreshToken()` - Refresh expired access tokens
   - `handleGetMe()` - Get current user info from token
   - `handleSetupPassword()` - Admin sets staff password (bcrypt hashed)

3. **server/migrate-add-password-hash.sql** - Database migration
   - Adds `password_hash` column to `staff` table

### Auth Endpoints Added to server.ts
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/logout` - Logout (client discards token)
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user info (protected)
- `POST /api/auth/setup-password` - Set staff password (admin only)

### Dependencies Installed
- `jsonwebtoken` - JWT token generation and verification
- `bcryptjs` - Password hashing (client-side compatible)
- `@types/jsonwebtoken` - TypeScript types
- `@types/bcryptjs` - TypeScript types

### Environment Configuration
Updated `.env.example` with:
```
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="8h"
REFRESH_TOKEN_EXPIRES_IN="7d"
```

### Key Features
✅ **JWT-based authentication** - Stateless auth with access + refresh tokens  
✅ **Password hashing** - Bcrypt with 10 salt rounds  
✅ **Protected routes** - `requireAuth` middleware for API protection  
✅ **Token refresh** - Automatic token renewal mechanism  
✅ **Multi-tenant aware** - Tokens include tenant_id and role  

---

## Current Limitations
⚠️ **Frontend still uses Firebase Auth** - Need to migrate `useAuth.ts` to JWT  
⚠️ **No data seeding** - Need to populate initial test data  
⚠️ **No transaction support** - Sales with items need atomic operations  
⚠️ **No CSRF protection** - Consider adding for production  

---

## Phase 3: Frontend Auth Migration (NEXT)

### Tasks
- [ ] Migrate `useAuth.ts` hook from Firebase to JWT session-based
- [ ] Update `src/api.ts` to include Authorization header
- [ ] Add token storage (localStorage/sessionStorage) to frontend
- [ ] Implement token refresh logic in frontend
- [ ] Create login page component
- [ ] Seed test user data with passwords

### Dependencies
- Update frontend to use `/api/auth/login` instead of Firebase popup
- Store JWT tokens in frontend
- Add Bearer token to API requests

---

## Phase 4: Testing & Data Seeding

### Data Population
- [ ] Create seed script for test tenants
- [ ] Create test users and staff with passwords
- [ ] Create sample products and customers
- [ ] Create sample sales transactions

### Testing
- [ ] Unit tests for auth middleware
- [ ] Integration tests for auth endpoints
- [ ] Multi-tenant isolation tests
- [ ] End-to-end tests with UI

---

## Phase 5: Advanced Operations

### Transactions
- [ ] Create sale with sale_items atomically
- [ ] Update inventory on sale completion
- [ ] Handle cash session reconciliation

### Bulk Operations
- [ ] Batch create products
- [ ] Batch update prices
- [ ] Export/import customers

---

## Phase 6: Deployment

### Nginx Configuration
- Static file serving (dist/)
- API proxy to Express (port 3000)
- SSL/TLS termination
- Rate limiting

### Environment
- MariaDB hosted (AWS RDS, DigitalOcean, etc.)
- Express deployed (Heroku, AWS EC2, Docker)
- Nginx reverse proxy
- Environment variables for credentials

---

## Performance Metrics

**Database**
- Connection pool: 10 connections
- Query type: Parameterized (safe)
- Indexes: On tenant_id, slug, email, status

**Authentication**
- JWT access token expiry: 8 hours
- JWT refresh token expiry: 7 days
- Password hashing: bcrypt (10 rounds)

**Frontend**
- Data loading: Concurrent REST calls
- Caching: Browser cache + Zustand store
- Bundle size: Monitor with build output

---

## Manual Steps Required

### 1. Run Database Migration
Execute this SQL on your MariaDB database:
```sql
ALTER TABLE staff ADD COLUMN password_hash VARCHAR(255) AFTER email;
```

### 2. Set JWT Secret
Update your `.env` file with a strong JWT secret:
```
JWT_SECRET=your-actual-secret-key-min-32-chars
```

### 3. Create Test User
After starting the server, set up a password for a staff member:
- Use the `/api/auth/setup-password` endpoint (requires admin auth)
- Or directly update the database with a bcrypt hash

---

## Rollback Plan
If migration encounters issues:
1. Firebase branch still exists at `firebase-v1-preserve`
2. Can revert to Firebase in `useAppData.ts` and `useBusinessPage.ts`
3. Dual-write possibility during transition period

---

## Next Immediate Steps
1. **Run DB migration** - Add `password_hash` column to staff table
2. **Set JWT secret** - Update `.env` with strong secret
3. **Migrate frontend auth** - Update `useAuth.ts` to use JWT
4. **Add token management** - Store/refresh tokens in frontend
5. **Seed test data** - Create test users with passwords

---

**Last Updated:** 2026-05-04  
**Status:** Phase 1 & 2 Complete, Ready for Phase 3 (Frontend Auth Migration) ✅
