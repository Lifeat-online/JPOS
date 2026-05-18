# AI Inventory Copilot Agent Mode

## Current Status
- [x] Created an experimental approval-first inventory Copilot plan.
- [x] Added missing backend foundations for vendors and purchase orders.
- [x] Added a Copilot Agent tab under Inventory.
- [x] Added proposal generation for invoice intake, low-stock purchase orders, and event/function planning.
- [x] Added guarded apply endpoint for approved draft-safe steps.
- [ ] Add provider-specific vision/OCR extraction for invoice images.
- [ ] Add audited execution records for each approved Copilot step.
- [ ] Add full bookings/events CRUD and calendar visibility.

## Completed Work
- Added vendor API routes:
  - `GET /api/mariadb/tenants/:tenantId/vendors`
  - `POST /api/mariadb/tenants/:tenantId/vendors`
  - `PUT /api/mariadb/tenants/:tenantId/vendors/:id`
- Added purchase order API routes:
  - `GET /api/mariadb/tenants/:tenantId/purchase-orders`
  - `POST /api/mariadb/tenants/:tenantId/purchase-orders`
  - `PUT /api/mariadb/tenants/:tenantId/purchase-orders/:id`
- Added `POST /api/mariadb/tenants/:tenantId/ai/agent/inventory/proposal`.
- Added `POST /api/mariadb/tenants/:tenantId/ai/agent/inventory/apply`.
- Added low-stock proposal logic using current stock, min stock, and 90-day sales movement.
- Added invoice image upload UI with human approval steps for vendor, bulk/single stock, sales unit, PO, invoice receiving, and stock booking.
- Added event/function planning proposal mode using expected people, date, service style, menu notes, inventory, and sales context.
- Added apply handling for approved vendor creation, bulk item creation, sales unit creation, and draft PO creation.

## In Progress
- [x] Verification pass for lint, focused backend tests, and build.

## Next Up
- [ ] Add OCR/vision extraction so invoice images produce real line candidates automatically.
- [ ] Add a persisted `ai_agent_runs` table with per-step approval and audit logs.
- [ ] Add an `event_bookings` table and bookings UI for private/public events.
- [ ] Persist controlled execution runs with one mutation per explicit approval.
- [ ] Add min-stock recommendation storage and manager approval.

## Blockers/Risks
- Invoice image parsing currently accepts images as evidence but does not yet OCR them into exact item lines.
- Applying stock movements must remain audited because mistakes affect inventory valuation.
- Receiving invoices and booking stock are intentionally review-only until stock movements are audited.
- Event demand planning needs reliable booking details and menu assumptions before it can be trusted.

## Verification Log
- Passed: `npm.cmd run lint`.
- Passed: `npx.cmd vitest run tests/backend/ai.test.ts tests/backend/api.test.ts`.
- Passed: `npm.cmd run build`.
