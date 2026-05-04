# MariaDB + Nginx Migration Plan

## Goal
Refactor the current Firebase-backed POS into a MariaDB-backed backend served behind Nginx, while preserving the existing Firebase version in `firebase-v1-preserve`.

## Current Branch State
- Active working branch for this refactor: `master`
- Firebase preservation branch: `firebase-v1-preserve`
- Local preservation tag: `firebase-v1`

## Current Architecture
- Frontend: React + Vite + Tailwind + Zustand
- Backend: Express.js in `server.ts`
- Database: Firebase Firestore
- Auth: Firebase Auth via `src/hooks/useAuth.ts`
- Multi-tenant data layout: `tenants/{tenantId}/...`
- App config & admin data: top-level `users`, `slugs`, and `tenants` collections

## Existing Firebase Collections / Entities
### Top-level collections
- `users` — maps auth `uid` to `tenantId`, email, name, createdAt
- `slugs` — maps business slug to `tenantId`
- `config/primary` — PayFast configuration and fallback server config

### Tenant-scoped collections under `tenants/{tenantId}`
- `products`
- `customers`
- `staff`
- `sales`
- `workstations`
- `settings/app`
- `cashSessions`
- `customerPayoutRequests`
- `messages`
- `purchaseOrders`
- `vendors`
- `payoutRequests`
- `restaurantTables`
- `tableSections`

### Important behavior and data patterns
- `Sale` documents store `items[]`, order lifecycle status, payment data, loyalty discounts, tab behavior, table numbers, and staff/customer associations.
- `OrderItem` objects embed lifecycle timestamps and are nested inside `Sale.items`.
- `Staff.metrics` and `Customer.loyaltyPoints` are updated in place.
- `messages` supports tenant-scoped internal notifications, including workstation-ready alerts.
- `useAppData` subscribes to real-time Firestore streams for products, customers, staff, sales, workstations, cash sessions, and config.
- `useBusinessPage` resolves a public slug to `tenantId` via top-level `slugs`.
- `useAuth` uses Google sign-in and relies entirely on Firebase Auth state.

## High-Level Migration Strategy
### Phase 0: Preserve baseline
- Ensure `firebase-v1-preserve` branch is intact.
- If remote push is needed, add a fork remote and push the preserve branch/tag.

### Phase 1: Schema design
Create MariaDB schemas for:
- `users`
- `tenants`
- `slugs`
- `products`
- `customers`
- `staff`
- `sales`
- `sale_items`
- `workstations`
- `settings` / `app_settings`
- `cash_sessions`
- `customer_payout_requests`
- `messages`
- `purchase_orders`
- `vendors`
- `payout_requests`
- `restaurant_tables`
- `table_sections`

### Phase 2: Backend data abstraction
- Add a MariaDB client: `mysql2`, `knex`, or `Prisma`.
- Build a data access layer and repository functions.
- Replace Firestore calls in `server.ts` and backend helpers with SQL logic.
- Preserve tenant scoping using `tenant_id` columns rather than Firestore path nesting.
- Implement transaction-safe writes for order checkout, cash sessions, and loyalty point updates.

### Phase 3: Authentication
- Replace Firebase Auth with one of:
  - JWT-based auth + refresh tokens
  - Session cookies + server session store
- Support Google sign-in using OAuth2 on the backend or keep the existing user data model and only replace verification.
- Keep `users` table as the auth-to-tenant mapping layer.
- Add `staff`/`user` role checking and session handling.

### Phase 4: Frontend API adaptation
- Keep the React UI largely intact.
- Replace direct Firestore SDK access in frontend hooks with REST API calls to Express.
- Convert real-time subscriptions into polling or WebSocket/SSE where needed.
- Migrate `src/firebase.ts` and auth hooks to a backend-driven auth session model.
- Migrate tenant lookup from `slugs` on Firestore to backend slug lookup.

### Phase 5: Nginx deployment
- Build static frontend with Vite: `npm run build`
- Serve static assets from Nginx
- Reverse-proxy `/api/*` to Express backend
- Configure CORS and security headers in Nginx
- Add SSL/TLS configuration for production

### Phase 6: Testing & validation
- Functional testing for:
  - login
  - tenant resolve by slug
  - product/customer/staff CRUD
  - order lifecycle and workstation flow
  - checkout and PayFast payment flow
  - cash sessions and payouts
- Migration validation of existing Firebase data, if needed.

## Detailed Schema Mapping
### Firebase → MariaDB mapping
- `users` → `users` table
- `slugs` → `slugs` table
- `tenants/{tenantId}/settings/app` → `app_settings` (or `tenant_settings`)
- `tenants/{tenantId}/products` → `products` with `tenant_id`
- `tenants/{tenantId}/customers` → `customers` with `tenant_id`
- `tenants/{tenantId}/staff` → `staff` with `tenant_id`
- `tenants/{tenantId}/sales` → `sales` + `sale_items`
- `tenants/{tenantId}/workstations` → `workstations`
- `tenants/{tenantId}/cashSessions` → `cash_sessions`
- `tenants/{tenantId}/customerPayoutRequests` → `customer_payout_requests`
- `tenants/{tenantId}/messages` → `messages`
- `tenants/{tenantId}/purchaseOrders` → `purchase_orders`
- `tenants/{tenantId}/vendors` → `vendors`
- `tenants/{tenantId}/payoutRequests` → `payout_requests`
- `tenants/{tenantId}/restaurantTables` → `restaurant_tables`
- `tenants/{tenantId}/tableSections` → `table_sections`

### Notes on order data
- Use a dedicated `sale_items` table for `Sale.items[]`.
- Denormalize common fields for performance: `sale_items.name`, `sale_items.price`, `sale_items.quantity`, `sale_items.status`, `sale_items.workstation_id`, `sale_items.ordered_at`, `sale_items.accepted_at`, `sale_items.ready_at`, `sale_items.delivered_at`, `sale_items.action_staff_id`.
- Keep `sales` for order-level state and totals.

## Execution Milestones
### Milestone 1: Baseline & discovery
- Confirm the preserve branch exists.
- Document all Firestore collection names and access patterns.
- Choose MariaDB client/ORM.
- Design schema and migration strategy.

### Milestone 2: Backend proof-of-concept
- Add MariaDB connection and environment variables
- Implement `GET /api/health`
- Implement `GET /api/tenants/:tenantId/products`
- Implement `POST /api/tenants/:tenantId/sales`
- Validate SQL model with sample data

### Milestone 3: Frontend integration
- Create frontend service layer for REST API calls
- Replace `useAppData` and `useCheckout` Firestore dependencies with backend requests
- Implement auth session handling

### Milestone 4: Nginx configuration
- Create `nginx.conf`
- Deploy static build + backend proxy locally
- Validate with `npm run build`

### Milestone 5: Complete migration
- Migrate remaining tenant collections
- Migrate messaging and payouts
- Add tests and QA checklist
- Document production deployment

## Immediate next tasks
1. Review `server.ts` for all Firestore backend uses beyond PayFast config.
2. Review `src/hooks/useAppData.ts`, `src/hooks/useCheckout.ts`, and `src/hooks/useAuth.ts` for direct Firestore/ Firebase Auth usage.
3. Draft the MariaDB schema and tenant table definitions.
4. Decide whether to use `mysql2` + raw SQL, `knex`, or `Prisma`.

## Risks & open decisions
- Real-time Firestore subscriptions will require a replacement strategy (polling or WebSocket/SSE).
- Google sign-in needs backend auth handling.
- Existing `tenantId` lookup via collectionGroup queries is heavy; the new system should normalize this to explicit tenant associations.
- If full Firebase data migration is required, a data export/import path must be added.

---

> This plan is ready to start the first implementation phase. If you want, I can now produce the exact MariaDB schema DDL and the first `server.ts` data adapter skeleton.