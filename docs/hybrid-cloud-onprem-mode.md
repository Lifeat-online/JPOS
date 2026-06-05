# Hybrid Cloud/On-Prem Mode

Last updated: 2026-06-05

Use hybrid mode when a store has a local POS server on the LAN plus a hosted
cloud backend for remote access, reporting, and continuity checks.

## Environment

```env
VITE_DEPLOYMENT_MODE="hybrid"
VITE_ON_PREM_API_BASE_URL="http://pos-box.local:8080"
VITE_CLOUD_API_BASE_URL="https://masepos.co.za"
VITE_SOCKET_URL=""
```

For a local-only install, use:

```env
VITE_DEPLOYMENT_MODE="on_prem"
VITE_ON_PREM_API_BASE_URL="http://pos-box.local:8080"
```

For hosted-only installs, keep:

```env
VITE_DEPLOYMENT_MODE="cloud"
VITE_API_BASE_URL="https://masepos.co.za"
```

## Target Selection

- Settings > Connection shows the compiled deployment mode, active primary API
  target, and fallback order.
- Auto uses the environment order. In hybrid mode this is on-prem, cloud, then
  same-origin.
- Operators can prefer cloud or on-prem on a device. The selection is stored in
  browser localStorage under `masepos-api-target`.

## Failover Rules

- Safe reads (`GET` and `HEAD`) try the primary API target first.
- Safe reads fail over to the next target only for network errors or transient
  gateway/outage statuses: `408`, `502`, `503`, `504`, `521`, `522`, `523`,
  and `524`.
- Mutations (`POST`, `PUT`, `DELETE`) do not fail over between targets.

Mutation failover is intentionally blocked so checkout writes do not silently
land in the wrong environment. A failed cash or external-card checkout write is
treated as an offline candidate by `src/hooks/useCheckout.ts`.

## Offline-First Checkout

The current web client queues only:

- Cash sales.
- External-card sales where the card capture happened outside MasePOS.

The client does not queue:

- Wallet payments.
- Customer account payments.
- PayFast.
- QR/mobile wallet.
- BNPL.

Queued sales include a local receipt number, device ID, offline event ID,
sync event metadata, batch ID, and sequence number. Replay uses the normal sale
routes with idempotency fields:

- `POST /api/mariadb/tenants/:tenantId/sales`
- `PUT /api/mariadb/tenants/:tenantId/sales/:saleId`

Sync conflicts are reported to:

```http
POST /api/mariadb/tenants/:tenantId/offline-sync/issues
```

The backend records audit events and Action Center tasks for manager review.

## Verification

Run the focused frontend checks after changing hybrid behavior:

```bash
npx vitest run tests/frontend/api-config.test.ts tests/frontend/api-hybrid.test.ts tests/frontend/offline-sales.test.ts
```

Before production launch, also validate the hosted target:

```bash
npm run ops:verify-endpoint -- --url https://masepos.co.za
```
