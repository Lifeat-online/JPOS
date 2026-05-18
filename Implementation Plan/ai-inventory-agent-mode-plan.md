# AI Inventory Copilot Agent Mode

## Current Status
- [x] Created an experimental approval-first inventory Copilot plan.
- [x] Added missing backend foundations for vendors and purchase orders.
- [x] Added a Copilot Agent tab under Inventory.
- [x] Added proposal generation for invoice intake, PDF/document intake, low-stock purchase orders, and event/function planning.
- [x] Added guarded apply endpoint for approved draft-safe steps.
- [x] Added Dev-only full autopilot switch for automatic draft-safe apply.
- [x] Add provider-specific AI extraction for invoice images and PDF/document uploads.
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
- Added invoice image/PDF/document upload UI with human approval steps for vendor, bulk/single stock, sales unit, PO, invoice receiving, and stock booking.
- Added event/function planning proposal mode using expected people, date, service style, menu notes, inventory, and sales context.
- Added apply handling for approved vendor creation, bulk item creation, sales unit creation, and draft PO creation.
- Added a Dev-only full autopilot switch that auto-approves and applies draft-safe steps immediately after proposal generation.
- Added server-side Dev role enforcement so non-Dev users cannot spoof full autopilot.
- Added AI-provider invoice extraction for uploaded PDFs/images/documents through OpenAI, Google Gemini, Vertex AI, OpenRouter image models, and Ollama image models where supported.
- Added automatic proposal payloads from extracted invoice data: vendor, bulk/single stock items, sales units, and draft purchase order lines.
- Hardened Vertex AI authentication for bearer tokens and service account JSON, with Gemini API-key fallback when Vertex rejects key-only calls.
- Stopped full autopilot from applying empty placeholder steps when invoice extraction fails.

## In Progress
- [x] Verification pass for lint, focused backend tests, and build.

## Next Up
- [x] Add OCR/vision/PDF extraction so invoice files produce real line candidates automatically via the configured AI provider.
- [ ] Add a persisted `ai_agent_runs` table with per-step approval and audit logs.
- [ ] Add an `event_bookings` table and bookings UI for private/public events.
- [ ] Persist controlled execution runs with one mutation per explicit approval.
- [ ] Add min-stock recommendation storage and manager approval.

## Blockers/Risks
- Invoice file parsing now uses the configured AI provider, but extraction quality depends on the selected model's document/image support.
- Applying stock movements must remain audited because mistakes affect inventory valuation.
- Receiving invoices and booking stock are intentionally review-only until stock movements are audited.
- Full autopilot currently runs only draft-safe operations; audited stock receiving still needs the next execution layer.
- OpenRouter/Ollama support is image-focused; PDF extraction is strongest with OpenAI, Google Gemini, or Vertex AI models that support document input.
- Vertex AI may require `GOOGLE_VERTEX_ACCESS_TOKEN` or `GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON`; API-key-only Vertex calls can be rejected by Google with a missing authentication header.
- Event demand planning needs reliable booking details and menu assumptions before it can be trusted.

## Verification Log
- Passed: `npm.cmd run lint`.
- Passed: `npx.cmd vitest run tests/backend/ai.test.ts tests/backend/api.test.ts`.
- Passed: `npm.cmd run build`.
- Passed after PDF/document upload support: `npm.cmd run lint`.
- Passed after PDF/document upload support: `npx.cmd vitest run tests/backend/ai.test.ts tests/backend/api.test.ts`.
- Passed after PDF/document upload support: `npm.cmd run build`.
- Passed after Dev full autopilot switch: `npm.cmd run lint`.
- Passed after Dev full autopilot switch: `npx.cmd vitest run tests/backend/ai.test.ts tests/backend/api.test.ts`.
- Passed after Dev full autopilot switch: `npm.cmd run build`.
- Passed after AI invoice extraction: `npm.cmd run lint`.
- Passed after AI invoice extraction: `npx.cmd vitest run tests/backend/ai.test.ts tests/backend/api.test.ts`.
- Passed after AI invoice extraction: `npm.cmd run build`.
- Passed after Vertex auth hardening: `npm.cmd run lint`.
- Passed after Vertex auth hardening: `npx.cmd vitest run tests/backend/ai.test.ts tests/backend/api.test.ts`.
- Passed after Vertex auth hardening: `npm.cmd run build`.
