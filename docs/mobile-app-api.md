# MasePOS Mobile App API Handoff

Last updated: 2026-06-05

This document is for a coding agent implementing a mobile app or hybrid WebView
client for MasePOS. The backend already exposes the API. Do not build a second
backend unless the product explicitly moves to a new API version.

## Current Architecture

- Backend: Express, JSON REST routes in `server/app.ts`.
- Database: MariaDB or Postgres, tenant-scoped.
- Auth: JWT access token plus rotating refresh token.
- Realtime: Socket.IO for live workstations, tables, tabs, messaging, device presence, and companion-device state.
- Existing web client: React PWA. It defaults to same-origin `/api` but now supports `VITE_API_BASE_URL` and `VITE_SOCKET_URL`.
- Native recommendation: use the same API with secure token storage. Do not use browser `localStorage` in a native app.

## Environment For Mobile Clients

For a separate web/mobile shell pointed at a hosted backend:

```env
VITE_DEPLOYMENT_MODE="cloud"
VITE_API_BASE_URL="https://masepos.co.za"
VITE_SOCKET_URL="https://masepos.co.za"
CORS_ORIGINS="https://masepos.co.za,capacitor://localhost,ionic://localhost"
PUBLIC_APP_URL="https://masepos.co.za"
```

For a store server that normally serves the POS on the LAN but can fall back to
cloud reads:

```env
VITE_DEPLOYMENT_MODE="hybrid"
VITE_ON_PREM_API_BASE_URL="http://pos-box.local:8080"
VITE_CLOUD_API_BASE_URL="https://masepos.co.za"
VITE_SOCKET_URL=""
CORS_ORIGINS="https://masepos.co.za,capacitor://localhost,ionic://localhost"
PUBLIC_APP_URL="https://masepos.co.za"
```

Notes:

- `VITE_API_BASE_URL` prefixes all frontend REST calls in cloud mode. `VITE_CLOUD_API_BASE_URL` is the preferred explicit cloud URL for hybrid mode.
- `VITE_ON_PREM_API_BASE_URL` points to the local store server for `on_prem` and `hybrid` modes.
- `VITE_SOCKET_URL` overrides Socket.IO origin. If omitted, it falls back to the selected primary API target, then same-origin.
- In `hybrid` mode, safe reads try the selected Settings > Connection target first, then fall back on network or transient gateway outages. Mutations do not fail over between targets.
- `CORS_ORIGINS` matters for WebView/hybrid browser clients. Pure native HTTP clients are not browser-CORS constrained.
- `PUBLIC_APP_URL` is used for generated PayFast callback URLs if the request host is not the public host.

## Authentication Contract

### Login

`POST /api/auth/login`

Request:

```json
{
  "email": "cashier@example.com",
  "password": "secret123",
  "tenantId": "tenant_1",
  "twoFactorCode": "123456"
}
```

`tenantId` is optional unless the same email can exist across tenants. `twoFactorCode` is required when the account is privileged and 2FA is enabled.

Success:

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "user": {
    "id": "staff_1",
    "email": "cashier@example.com",
    "name": "Cashier",
    "role": "cashier",
    "tenantId": "tenant_1",
    "tenantName": "Demo Store",
    "twoFactorEnabled": false,
    "twoFactorEligible": false
  }
}
```

2FA required error:

```json
{
  "error": "Two-factor code required",
  "twoFactorRequired": true,
  "role": "manager"
}
```

### Token Storage

Native app:

- Store `accessToken`, `refreshToken`, and user profile in secure storage.
- iOS: Keychain.
- Android: EncryptedSharedPreferences or equivalent secure storage.
- Never store tokens in plain AsyncStorage unless the app is only a quick prototype.

Browser/PWA:

- Current web app uses `masepos_access_token`, `masepos_refresh_token`, and `masepos_user` in `localStorage`.

### Auth Headers

All protected routes:

```http
Authorization: Bearer <accessToken>
Accept: application/json
Content-Type: application/json
```

### Refresh

`POST /api/auth/refresh`

```json
{
  "refreshToken": "jwt"
}
```

Response:

```json
{
  "accessToken": "new-jwt",
  "refreshToken": "new-refresh-jwt"
}
```

On any `401`, refresh once, retry the original request once, then clear the session and return the user to login.

### Logout

`POST /api/auth/logout`

Request body:

```json
{
  "refreshToken": "jwt"
}
```

Send `Authorization` too when available. Clear local storage even if the server is unreachable.

## Error Handling

Common responses:

- `400`: invalid input or missing field.
- `401`: missing/invalid/expired access token.
- `403`: role/package/licence denied.
- `409`: duplicate or conflict.
- `428`: sensitive action verification required.
- `429`: auth or API rate limit.
- `500`: server error.

For `428`, show a manager PIN/password prompt and retry the same JSON mutation with:

```json
{
  "sensitiveVerification": {
    "actionType": "refund",
    "password": "manager-password",
    "pin": "1234"
  }
}
```

## Core Mobile Implementation Order

1. Build auth client: login, refresh, logout, current user, secure storage.
2. Load tenant bootstrap data: config, products, customers, staff, workstations, tables, active sales, cash sessions.
3. Build POS/table workflows using existing sale routes.
4. Add offline sale queue for cash and external-card only.
5. Add Socket.IO for live updates and device presence.
6. Add manager flows: Action Center, refund/void approval, stocktake assignments.
7. Add push subscription if the mobile shell uses web push; use native push separately if building fully native.
8. Add optional modules: AI, reports, integrations, hardware, inventory.

## Core Data Shapes

The exact TypeScript shapes live in `src/types.ts`. A mobile agent should import
or mirror those where possible. Minimal shapes:

```ts
type UserRole = 'dev' | 'admin' | 'manager' | 'cashier' | 'chef' | 'staff';

type Product = {
  id: string;
  tenantId?: string;
  name: string;
  price: number;
  stock?: number;
  category?: string;
  section?: string;
  subCategory?: string;
  barcode?: string;
  imageUrl?: string;
};

type Customer = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  walletBalance?: number;
  accountEnabled?: boolean;
  accountLimit?: number;
};

type SaleItem = {
  id: string;
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  category?: string;
  workstationId?: string;
  status?: 'pending' | 'preparing' | 'ready' | 'delivered';
};

type SalePayment = {
  id?: string;
  method: 'cash' | 'card' | 'payfast' | 'wallet' | 'account' | 'qr' | 'bnpl';
  amount: number;
  provider?: string;
  providerReference?: string;
  providerStatus?: 'pending' | 'approved' | 'declined' | 'settled' | 'reconciled';
};

type Sale = {
  id: string;
  tenantId?: string;
  items: SaleItem[];
  payments?: SalePayment[];
  total: number;
  paymentMethod: 'cash' | 'card' | 'payfast' | 'wallet' | 'account' | 'qr' | 'bnpl' | 'pending';
  status: 'open' | 'kitchen' | 'completed' | 'voided' | 'refunded';
  customerId?: string | null;
  staffId?: string | null;
  cashSessionId?: string | null;
  tableNumber?: string | null;
  tabName?: string | null;
  isTab?: boolean;
  offlineEventId?: string | null;
  syncSource?: 'online' | 'offline' | 'manual';
};
```

## Main Mobile Workflows

### App Bootstrap After Login

Recommended parallel calls:

- `GET /api/auth/me`
- `GET /api/mariadb/tenants/:tenantId/config`
- `GET /api/mariadb/tenants/:tenantId/products`
- `GET /api/mariadb/tenants/:tenantId/customers`
- `GET /api/mariadb/tenants/:tenantId/staff`
- `GET /api/mariadb/tenants/:tenantId/workstations`
- `GET /api/mariadb/tenants/:tenantId/table-sections`
- `GET /api/mariadb/tenants/:tenantId/restaurant-tables`
- `GET /api/mariadb/tenants/:tenantId/sales?status=open,kitchen`
- `GET /api/mariadb/tenants/:tenantId/cash-sessions?staffId=<staffId>`

### Create Online Sale

`POST /api/mariadb/tenants/:tenantId/sales`

Minimal request:

```json
{
  "items": [
    { "id": "line_1", "productId": "prod_1", "name": "Burger", "price": 95, "quantity": 1 }
  ],
  "total": 95,
  "paymentMethod": "cash",
  "status": "completed",
  "customerId": null,
  "staffId": "staff_1",
  "staffName": "Cashier",
  "cashSessionId": "cash_1",
  "payments": [
    { "method": "cash", "amount": 95, "tenderedAmount": 100, "changeAmount": 5 }
  ]
}
```

The backend handles sale rows, items, payments, stock deduction, wallet/account effects, cash movements, staff metrics, audit events, and kitchen print jobs inside the sale boundary.

### Park/Open Table Or Tab

Use the same sale create/update routes with:

```json
{
  "status": "open",
  "paymentMethod": "pending",
  "tableNumber": "T1",
  "isTab": false
}
```

Send to kitchen:

```json
{
  "status": "kitchen",
  "tableNumber": "T1"
}
```

Update:

`PUT /api/mariadb/tenants/:tenantId/sales/:saleId`

### Offline Sale Queue

Offline queue is a client responsibility. Current web implementation is in `src/utils/offlineSales.ts`.

In hybrid mode, cash and external-card sale writes intentionally stay on the
selected primary API target. If that write fails with an offline-like network
error, the current web client stores the sale locally, prints a pending-sync
receipt, and replays the sale with idempotency metadata when the selected target
is reachable again.

Only queue:

- cash
- external card capture

Do not queue:

- wallet
- customer account
- PayFast
- QR/mobile wallet
- BNPL

Queued sale payload must include:

```json
{
  "offlineEventId": "offline_sale_...",
  "deviceId": "device_...",
  "localReceiptNumber": "OFF-REG1-0001",
  "syncSource": "offline",
  "syncEventType": "sale.create",
  "syncEventVersion": 1,
  "syncBatchId": "offline_batch_...",
  "syncSequence": 1
}
```

Replay with:

- `POST /api/mariadb/tenants/:tenantId/sales` for new sales.
- `PUT /api/mariadb/tenants/:tenantId/sales/:saleId` for updates.

If replay fails, report:

`POST /api/mariadb/tenants/:tenantId/offline-sync/issues`

```json
{
  "offlineEventId": "offline_sale_1",
  "localReceiptNumber": "OFF-REG1-0001",
  "deviceId": "device_1",
  "operation": "create_sale",
  "status": "failed",
  "attempts": 2,
  "message": "negative stock after sync",
  "syncBatchId": "offline_batch_1",
  "syncSequence": 1
}
```

The backend records audit events and Action Center manager tasks for conflicts.

### Refund And Void

Refund:

`POST /api/mariadb/tenants/:tenantId/sales/:saleId/refund`

Void:

`POST /api/mariadb/tenants/:tenantId/sales/:saleId/void`

Cashiers may receive `202` with `approvalRequired: true`; managers/admin/dev may need `428` sensitive verification.

### PayFast

Generate payment form:

`POST /api/payfast/generate`

Protected with Bearer token.

```json
{
  "amount": 150,
  "item_name": "POS Purchase - sale_1",
  "sale_id": "sale_1",
  "return_url": "https://masepos.co.za/pos?payment=success",
  "cancel_url": "https://masepos.co.za/pos?payment=cancel"
}
```

Response:

```json
{
  "url": "https://sandbox.payfast.co.za/eng/process",
  "fields": {
    "merchant_id": "10000100",
    "merchant_key": "key",
    "amount": "150.00",
    "item_name": "POS Purchase - sale_1",
    "m_payment_id": "sale_1",
    "return_url": "https://...",
    "cancel_url": "https://...",
    "notify_url": "https://masepos.co.za/api/payfast/notify",
    "signature": "md5"
  }
}
```

Webhook:

`POST /api/payfast/notify`

Public PayFast callback. Do not call it from the app.

## Socket.IO

Connect to `VITE_SOCKET_URL` or API base URL.

Client auth:

```ts
io(socketUrl, {
  auth: { token: `Bearer ${accessToken}` },
  transports: ['websocket', 'polling'],
});
```

Client emits:

- `join_tenant(tenantId)`
- `leave_tenant(tenantId)`
- `join_workstation(workstationId)`
- `leave_workstation(workstationId)`
- `join_table(tableId)`
- `leave_table(tableId)`
- `join_tab(tabId)`
- `leave_tab(tabId)`
- `join_messages(tenantId)`
- `leave_messages(tenantId)`
- `account_device_active({ tenantId, staffId, deviceId })`
- `account_terminal_select({ tenantId, staffId, deviceId })`
- `terminal_register({ tenantId, staffId, terminalId, deviceId })`
- `companion_join({ terminalId, deviceId, mode })`
- `companion_command({ terminalId, command, data })`
- `terminal_display_update({ terminalId, data })`

Server emits:

- `sales_update`
- `messages_update`
- `account_device_presence`
- `companion_state`
- `companion_mode_assigned`
- `companion_command`
- `terminal_display_update`

Current product rule: mobile is a normal browser/PWA POS view. Do not reintroduce a remote-control mode. Remaining companion modes are wireless scanner and pole display.

## Route Catalog

Unless noted, routes are JSON and protected by Bearer JWT.

### Public And Platform

- `GET /api/health`
- `GET /api/licence/info`
- `GET /api/packages`
- `POST /api/demo/start`
- `POST /api/enroll`
- `POST /api/payfast/notify` public PayFast webhook

### Dev/Admin Repair

- `GET /api/dev/db-test`
- `POST /api/dev/init-db`
- `POST /api/admin/licence/generate` requires `x-admin-key`
- `POST /api/admin/licence/revoke` requires `x-admin-key`

### Auth And Security

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `POST /api/auth/refresh-tokens/revoke`
- `GET /api/auth/me`
- `POST /api/auth/setup-password`
- `GET /api/auth/2fa`
- `POST /api/auth/2fa/setup`
- `POST /api/auth/2fa/confirm`
- `POST /api/auth/2fa/disable`

### Tenant Bootstrap

- `GET /api/mariadb/users/:uid`
- `GET /api/mariadb/staff`
- `GET /api/mariadb/tenants/:tenantId/config`
- `PUT /api/mariadb/tenants/:tenantId/settings/app`
- `GET /api/mariadb/tenants/:tenantId/package-limits`
- `POST /api/mariadb/setup`
- `POST /api/mariadb/tenants/:tenantId/seed-products`
- `POST /api/mariadb/tenants/:tenantId/demo-seed/:mode`
- `DELETE /api/mariadb/tenants/:tenantId/demo-seed`

### Products And Inventory

- `GET /api/mariadb/tenants/:tenantId/products`
- `POST /api/mariadb/tenants/:tenantId/products`
- `PUT /api/mariadb/tenants/:tenantId/products/:id`
- `DELETE /api/mariadb/tenants/:tenantId/products/:id`
- `POST /api/mariadb/tenants/:tenantId/products/:id/stock-adjustments`
- `GET /api/mariadb/tenants/:tenantId/inventory-locations`
- `POST /api/mariadb/tenants/:tenantId/inventory-locations`
- `PUT /api/mariadb/tenants/:tenantId/inventory-locations/:locationId`
- `GET /api/mariadb/tenants/:tenantId/inventory-location-stock`
- `PUT /api/mariadb/tenants/:tenantId/inventory-location-stock`
- `GET /api/mariadb/tenants/:tenantId/stock-transfers`
- `POST /api/mariadb/tenants/:tenantId/stock-transfers`
- `POST /api/mariadb/tenants/:tenantId/stock-transfers/:transferId/complete`
- `GET /api/mariadb/tenants/:tenantId/stock-batches`
- `GET /api/mariadb/tenants/:tenantId/stock-reports/valuation`

### Recipe, Modifiers, Bulk Items, Vendors, Purchase Orders

- `GET /api/mariadb/tenants/:tenantId/vendors`
- `POST /api/mariadb/tenants/:tenantId/vendors`
- `PUT /api/mariadb/tenants/:tenantId/vendors/:id`
- `GET /api/mariadb/tenants/:tenantId/purchase-orders`
- `POST /api/mariadb/tenants/:tenantId/purchase-orders`
- `PUT /api/mariadb/tenants/:tenantId/purchase-orders/:id`
- `POST /api/mariadb/tenants/:tenantId/purchase-orders/:id/receive`
- `GET /api/mariadb/tenants/:tenantId/bulk-items`
- `POST /api/mariadb/tenants/:tenantId/bulk-items`
- `PUT /api/mariadb/tenants/:tenantId/bulk-items/:id`
- `DELETE /api/mariadb/tenants/:tenantId/bulk-items/:id`
- `GET /api/mariadb/tenants/:tenantId/recipe-costing-report`
- `GET /api/mariadb/products/:productId/recipe`
- `PUT /api/mariadb/products/:productId/recipe`
- `GET /api/mariadb/products/:productId/modifiers`
- `POST /api/mariadb/products/:productId/modifiers`
- `PUT /api/mariadb/modifiers/:modifierId/options`
- `DELETE /api/mariadb/modifiers/:modifierId`

### Sales, Tables, Tabs, Live POS

- `GET /api/mariadb/tenants/:tenantId/sales`
- `POST /api/mariadb/tenants/:tenantId/sales`
- `GET /api/mariadb/tenants/:tenantId/sales/:saleId`
- `PUT /api/mariadb/tenants/:tenantId/sales/:saleId`
- `DELETE /api/mariadb/tenants/:tenantId/sales`
- `PUT /api/mariadb/tenants/:tenantId/sales/:saleId/items/:itemId`
- `PUT /api/mariadb/tenants/:tenantId/sales/:saleId/payments/:paymentId/provider-status`
- `POST /api/mariadb/tenants/:tenantId/sales/:saleId/refund`
- `POST /api/mariadb/tenants/:tenantId/sales/:saleId/void`
- `POST /api/mariadb/tenants/:tenantId/offline-sync/issues`
- `GET /api/mariadb/tenants/:tenantId/live`
- `GET /api/mariadb/tenants/:tenantId/table-sections`
- `POST /api/mariadb/tenants/:tenantId/table-sections`
- `PUT /api/mariadb/tenants/:tenantId/table-sections/:id`
- `DELETE /api/mariadb/tenants/:tenantId/table-sections/:id`
- `GET /api/mariadb/tenants/:tenantId/restaurant-tables`
- `POST /api/mariadb/tenants/:tenantId/restaurant-tables`
- `PUT /api/mariadb/tenants/:tenantId/restaurant-tables/:id`
- `DELETE /api/mariadb/tenants/:tenantId/restaurant-tables/:id`

### Cash, Wallet, Payouts

- `GET /api/mariadb/tenants/:tenantId/cash-sessions`
- `POST /api/mariadb/tenants/:tenantId/cash-sessions`
- `PUT /api/mariadb/tenants/:tenantId/cash-sessions/:id`
- `PUT /api/mariadb/tenants/:tenantId/cash-sessions/:id/review`
- `GET /api/mariadb/tenants/:tenantId/cash-sessions/:id/movements`
- `POST /api/mariadb/tenants/:tenantId/cash-sessions/:id/movements`
- `POST /api/mariadb/tenants/:tenantId/cash-sessions/:id/wallet-cash`
- `GET /api/mariadb/tenants/:tenantId/manager-cash/summary`
- `GET /api/mariadb/tenants/:tenantId/manager-cash/movements`
- `GET /api/mariadb/tenants/:tenantId/manager-cash/movements/export`
- `POST /api/mariadb/tenants/:tenantId/manager-cash/movements`
- `GET /api/mariadb/tenants/:tenantId/manager-cash/transfers`
- `POST /api/mariadb/tenants/:tenantId/manager-cash/transfers`
- `PUT /api/mariadb/tenants/:tenantId/manager-cash/transfers/:transferId/confirm`
- `PUT /api/mariadb/tenants/:tenantId/manager-cash/transfers/:transferId/cancel`
- `GET /api/mariadb/tenants/:tenantId/manager-cash/close/preview`
- `GET /api/mariadb/tenants/:tenantId/manager-cash/close`
- `POST /api/mariadb/tenants/:tenantId/manager-cash/close`
- `GET /api/mariadb/tenants/:tenantId/manager-cash/close/:checkpointId/export`
- `POST /api/mariadb/tenants/:tenantId/manager-cash/wallet-cash`
- `GET /api/mariadb/tenants/:tenantId/payout-requests`
- `POST /api/mariadb/tenants/:tenantId/payout-requests`
- `PUT /api/mariadb/tenants/:tenantId/payout-requests/:id`
- `GET /api/mariadb/tenants/:tenantId/customer-payout-requests`
- `POST /api/mariadb/tenants/:tenantId/customer-payout-requests`
- `PUT /api/mariadb/tenants/:tenantId/customer-payout-requests/:id`

### Customers

- `GET /api/mariadb/tenants/:tenantId/customers`
- `POST /api/mariadb/tenants/:tenantId/customers`
- `PUT /api/mariadb/tenants/:tenantId/customers/:id`
- `DELETE /api/mariadb/tenants/:tenantId/customers/:id`
- `GET /api/mariadb/tenants/:tenantId/customers/campaign-export`
- `GET /api/mariadb/tenants/:tenantId/customers/:id/consents`
- `PUT /api/mariadb/tenants/:tenantId/customers/:id/consents`
- `GET /api/mariadb/tenants/:tenantId/customers/:id/data-export`
- `GET /api/mariadb/customers/by-email` optional auth

### Staff And Workforce

- `GET /api/mariadb/tenants/:tenantId/staff`
- `POST /api/mariadb/tenants/:tenantId/staff`
- `PUT /api/mariadb/tenants/:tenantId/staff/:id`
- `DELETE /api/mariadb/tenants/:tenantId/staff/:id`
- `GET /api/mariadb/tenants/:tenantId/workforce/shifts`
- `POST /api/mariadb/tenants/:tenantId/workforce/shifts`
- `PUT /api/mariadb/tenants/:tenantId/workforce/shifts/:shiftId`
- `DELETE /api/mariadb/tenants/:tenantId/workforce/shifts/:shiftId`
- `POST /api/mariadb/tenants/:tenantId/workforce/roster/publish`
- `GET /api/mariadb/tenants/:tenantId/workforce/attendance/me`
- `POST /api/mariadb/tenants/:tenantId/workforce/clock-in`
- `POST /api/mariadb/tenants/:tenantId/workforce/break/start`
- `POST /api/mariadb/tenants/:tenantId/workforce/break/end`
- `POST /api/mariadb/tenants/:tenantId/workforce/clock-out`
- `GET /api/mariadb/tenants/:tenantId/workforce/timesheet-payroll`
- `GET /api/mariadb/tenants/:tenantId/workforce/staff-performance`
- `POST /api/mariadb/tenants/:tenantId/workforce/staff-performance/coaching-notes`
- `GET /api/mariadb/tenants/:tenantId/workforce/tip-pool-rules`
- `POST /api/mariadb/tenants/:tenantId/workforce/tip-pool-rules`
- `PUT /api/mariadb/tenants/:tenantId/workforce/tip-pool-rules/:ruleId`
- `POST /api/mariadb/tenants/:tenantId/workforce/tip-pools/preview`
- `POST /api/mariadb/tenants/:tenantId/workforce/tip-pools/generate`
- `GET /api/mariadb/tenants/:tenantId/workforce/tip-pool-payouts`

### Workstations, Hardware, Companion Devices

- `GET /api/mariadb/tenants/:tenantId/workstations`
- `POST /api/mariadb/tenants/:tenantId/workstations`
- `DELETE /api/mariadb/tenants/:tenantId/workstations/:id`
- `GET /api/mariadb/tenants/:tenantId/hardware-devices`
- `POST /api/mariadb/tenants/:tenantId/hardware-devices`
- `PUT /api/mariadb/tenants/:tenantId/hardware-devices/:deviceId`
- `DELETE /api/mariadb/tenants/:tenantId/hardware-devices/:deviceId`
- `POST /api/mariadb/tenants/:tenantId/hardware-devices/:deviceId/test`
- `GET /api/mariadb/tenants/:tenantId/hardware-events`
- `GET /api/mariadb/tenants/:tenantId/companion-device-assignments`
- `GET /api/mariadb/tenants/:tenantId/companion-device-assignments/:deviceId`
- `PUT /api/mariadb/tenants/:tenantId/companion-device-assignments/:deviceId`
- `DELETE /api/mariadb/tenants/:tenantId/companion-device-assignments/:deviceId`

### Stocktake

- `GET /api/mariadb/tenants/:tenantId/stocktakes`
- `POST /api/mariadb/tenants/:tenantId/stocktakes`
- `GET /api/mariadb/tenants/:tenantId/stocktakes/suggestions`
- `GET /api/mariadb/tenants/:tenantId/stocktakes/rules`
- `POST /api/mariadb/tenants/:tenantId/stocktakes/rules`
- `POST /api/mariadb/tenants/:tenantId/stocktakes/rules/run-due`
- `PUT /api/mariadb/tenants/:tenantId/stocktakes/rules/:ruleId`
- `DELETE /api/mariadb/tenants/:tenantId/stocktakes/rules/:ruleId`
- `GET /api/mariadb/tenants/:tenantId/stocktakes/my-assignments`
- `GET /api/mariadb/tenants/:tenantId/stocktakes/:sessionId/export-pack`
- `GET /api/mariadb/tenants/:tenantId/stocktakes/:sessionId`
- `PUT /api/mariadb/tenants/:tenantId/stocktakes/items/:itemId/count`
- `PUT /api/mariadb/tenants/:tenantId/stocktakes/items/:itemId/recount`
- `PUT /api/mariadb/tenants/:tenantId/stocktakes/:sessionId/approve`

### Promotions And Loyalty

- `GET /api/mariadb/tenants/:tenantId/promotions`
- `POST /api/mariadb/tenants/:tenantId/promotions`
- `PUT /api/mariadb/tenants/:tenantId/promotions/:promotionId`
- `POST /api/mariadb/tenants/:tenantId/promotions/validate`
- `GET /api/mariadb/tenants/:tenantId/loyalty/tiers`
- `POST /api/mariadb/tenants/:tenantId/loyalty/tiers`
- `PUT /api/mariadb/tenants/:tenantId/loyalty/tiers/:tierId`
- `GET /api/mariadb/tenants/:tenantId/loyalty/reward-rules`
- `POST /api/mariadb/tenants/:tenantId/loyalty/reward-rules`
- `PUT /api/mariadb/tenants/:tenantId/loyalty/reward-rules/:ruleId`
- `POST /api/mariadb/tenants/:tenantId/loyalty/preview`

### Lay-bys And Events

- `GET /api/mariadb/tenants/:tenantId/laybys`
- `POST /api/mariadb/tenants/:tenantId/laybys`
- `GET /api/mariadb/tenants/:tenantId/laybys/:laybyId`
- `POST /api/mariadb/tenants/:tenantId/laybys/:laybyId/payments`
- `POST /api/mariadb/tenants/:tenantId/laybys/:laybyId/complete`
- `POST /api/mariadb/tenants/:tenantId/laybys/:laybyId/cancel`
- `GET /api/mariadb/tenants/:tenantId/event-bookings`
- `POST /api/mariadb/tenants/:tenantId/event-bookings`
- `PUT /api/mariadb/tenants/:tenantId/event-bookings/:id`
- `DELETE /api/mariadb/tenants/:tenantId/event-bookings/:id`

### Messaging And Push

- `GET /api/mariadb/tenants/:tenantId/messages`
- `POST /api/mariadb/tenants/:tenantId/messages`
- `PUT /api/mariadb/tenants/:tenantId/messages/:id/read`
- `GET /api/mariadb/tenants/:tenantId/push/status`
- `POST /api/mariadb/tenants/:tenantId/push/vapid/generate` dev role
- `POST /api/mariadb/tenants/:tenantId/push/subscriptions`
- `DELETE /api/mariadb/tenants/:tenantId/push/subscriptions`
- `POST /api/mariadb/tenants/:tenantId/push/test`

### Action Center And Manager Reviews

- `GET /api/mariadb/tenants/:tenantId/action-center`
- `GET /api/mariadb/tenants/:tenantId/action-center/tasks`
- `PUT /api/mariadb/tenants/:tenantId/action-center/tasks/:taskId`
- `GET /api/mariadb/tenants/:tenantId/action-center/activity`
- `GET /api/mariadb/tenants/:tenantId/action-center/activity/export`
- `GET /api/mariadb/tenants/:tenantId/action-center/activity/report`
- `GET /api/mariadb/tenants/:tenantId/manager-overrides`

### Reporting And Tax

- `GET /api/mariadb/tenants/:tenantId/payment-provider-reconciliation/report`
- `GET /api/mariadb/tenants/:tenantId/tax/periods`
- `GET /api/mariadb/tenants/:tenantId/tax/vat-report`
- `POST /api/mariadb/tenants/:tenantId/tax/periods/lock`
- `GET /api/mariadb/tenants/:tenantId/reports/margins`
- `GET /api/mariadb/tenants/:tenantId/reports/operational`
- `GET /api/mariadb/tenants/:tenantId/reports/accounting-journal`

### Reorder Recommendations

- `GET /api/mariadb/tenants/:tenantId/reorder-recommendations`
- `POST /api/mariadb/tenants/:tenantId/reorder-recommendations/refresh`
- `POST /api/mariadb/tenants/:tenantId/reorder-recommendations/:id/approve`
- `POST /api/mariadb/tenants/:tenantId/reorder-recommendations/:id/dismiss`
- `GET /api/mariadb/tenants/:tenantId/reorder-notification-rules`
- `POST /api/mariadb/tenants/:tenantId/reorder-notification-rules`
- `PUT /api/mariadb/tenants/:tenantId/reorder-notification-rules/:id`
- `POST /api/mariadb/tenants/:tenantId/reorder-notification-rules/:id/run`

### Integrations

Staff/admin UI routes:

- `GET /api/mariadb/tenants/:tenantId/integrations/ecommerce/products-export`
- `GET /api/mariadb/tenants/:tenantId/integrations/api-keys`
- `POST /api/mariadb/tenants/:tenantId/integrations/api-keys`
- `POST /api/mariadb/tenants/:tenantId/integrations/api-keys/:keyId/revoke`
- `GET /api/mariadb/tenants/:tenantId/integrations/webhook-events`
- `GET /api/mariadb/tenants/:tenantId/integrations/delivery/orders`
- `POST /api/mariadb/tenants/:tenantId/integrations/delivery/orders`
- `PUT /api/mariadb/tenants/:tenantId/integrations/delivery/orders/:orderId/status`

Server-to-server route:

- `POST /api/integrations/:tenantId/stock-sync`

Use `x-jpos-integration-key`, `x-jimmy-integration-key`, or `Authorization: Bearer <integration-secret>`. This is for ERP/stock systems, not staff mobile login.

### AI

- `GET /api/mariadb/tenants/:tenantId/ai/settings`
- `PUT /api/mariadb/tenants/:tenantId/ai/settings`
- `POST /api/mariadb/tenants/:tenantId/ai/models`
- `POST /api/mariadb/tenants/:tenantId/ai/test`
- `GET /api/mariadb/tenants/:tenantId/ai/insights`
- `DELETE /api/mariadb/tenants/:tenantId/ai/insights/:insightId`
- `POST /api/mariadb/tenants/:tenantId/ai/insights/generate`
- `GET /api/mariadb/tenants/:tenantId/ai/staff-scores`
- `POST /api/mariadb/tenants/:tenantId/ai/staff-scores/generate`
- `POST /api/mariadb/tenants/:tenantId/ai/agent/inventory/proposal`
- `POST /api/mariadb/tenants/:tenantId/ai/agent/inventory/apply`

## Mobile Build Notes

- Prefer a thin API client module with `apiGet`, `apiPost`, `apiPut`, `apiDelete`, auth refresh, and request retry.
- Keep one authoritative offline queue. Use idempotency keys. Never replay wallet/account side effects separately.
- Treat `tenantId` from the authenticated user as the default tenant.
- Always use backend role/package failures as source of truth. Do not hide unavailable features without surfacing why.
- For native push, add a native-push endpoint rather than trying to reuse browser Web Push subscriptions directly.
- For WebView push, use existing web-push routes and a service worker only where the shell/browser supports it.
- For hardware adapters, mobile may trigger backend setup/test routes, but actual printer/drawer/scanner execution depends on the configured local adapter/device bridge.

## Suggested Agent Prompt

Use this prompt for a coding agent implementing the mobile client:

```text
Build a MasePOS mobile app against the existing backend API documented in docs/mobile-app-api.md. Do not create a new backend. Implement secure JWT login/refresh/logout, tenant bootstrap, POS table/tab ordering, online sale create/update, cash/card offline queue with idempotent sync, Socket.IO live updates, and manager approval/sensitive-action handling. Use the route catalog exactly. Store tokens in native secure storage. Do not implement remote-control mode; mobile is a normal POS/PWA client with optional scanner/pole-display companion modes.
```
