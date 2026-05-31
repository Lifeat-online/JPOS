# Jimmy POS Master Todo

Last updated: 2026-05-30

This is the single source of truth for Jimmy POS implementation work. Add new roadmap items, blueprint gaps, security todo items, migration todo items, AI todo items, and restaurant-mode todo items here first. Older specialist planning documents are retained only as historical context or verification notes.

## Current Completed Baseline

- [x] MariaDB/REST data layer is the active backend direction, with tenant-scoped REST APIs and SQL schemas in place.
- [x] JWT-based authentication is wired in the backend and frontend, replacing the older Firebase auth direction.
- [x] Core sales, open orders, restaurant tables, tabs, workstations, customer account sales, Z report, reprints, live dashboard, and basic analytics exist.
- [x] Cash, manual card tender, customer wallet, customer account, PayFast redirect, and split-payment recording exist.
- [x] Product stock, min-stock indicators, barcodes/SKUs, bulk inventory, recipes/BOM, modifiers, vendors, and purchase orders exist.
- [x] Receipt logo/header/footer/paper customization, VAT/tax settings, staff roles, granular permissions, cash sessions, refunds, voids, and staff performance surfaces exist.
- [x] Customer profiles, loyalty points, customer wallets, client portal activity, AI Manager Copilot V1, AI Inventory Copilot proposal mode, and provider test/debug surfaces exist.

## Operating Rule

- Keep this file as the only maintained todo. When a specialist topic needs detail, add the detail under the matching workstream below instead of creating a new active todo document.
- When an item is completed, move the proof into the verification log at the bottom and keep the completed item checked in its workstream.
- Treat older docs as archived context unless this file explicitly says otherwise.

## Product North Star - User Friendliness

User friendliness and easy workflow are a top priority for Jimmy POS. Every implementation slice must be judged by whether a cashier, waiter, manager, owner, or kitchen/bar operator can complete the job quickly, confidently, and with minimal training during a real shift.

- Every critical action should be visible from the workflow where the user naturally needs it, not hidden in a backend-only or Dev-only surface.
- Prefer guided flows, clear next actions, and smart defaults over raw forms and configuration-heavy screens.
- Keep daily operations fast: sell, park, table, tab, refund, void, reprint, cash-up, stock receive, stock adjust, and manager approve should be low-click workflows.
- Show status and consequences before committing risky actions: stock impact, cash impact, customer balance impact, audit trail, and manager approval.
- Role-specific screens should remove noise. Cashiers need speed, managers need exceptions and approvals, owners need summaries, and Dev users need diagnostics.
- If a feature exists but is hard to discover, treat that as an active product gap.

## UX and Workflow Backlog

- [x] Run a daily-operator workflow audit across POS, tables, tabs, refunds, voids, receipts, cash-up, inventory receiving, stock adjustments, staff permissions, and AI approvals.
- [x] Add first manager Action Center surface for cash exceptions, refund/void activity, low stock, AI warnings, recent stock movements, and recent audit activity.
- [x] Add manager task queue with take, approve, decline, dismiss, required decision notes, source drill-through, and audited decisions.
- [x] Add cashier refund and void approval requests that appear in Action Center and execute only after manager approval.
- [x] Add guided stock adjustment requests with reason capture, manager approval for non-manager staff, and ledger/audit execution after approval.
- [x] Add Action Center audit and stock history search by text, staff, product, sale, customer, register, source, action/reason, and date range.
- [x] Add CSV export for filtered Action Center activity search.
- [x] Add stocktake/spot-check workflow with mobile staff assignments, dedicated staff stocktake route, count entry, manager recount, manager approval, and Action Center spot-check launch.
- [x] Add repeatable stocktake smoke test that proves assign, mobile count, approve, stock ledger posting, final stock, and cleanup against a real MariaDB connection.
- [x] Add manager-scheduled daily spot-check rules with assigned staff, product scope controls, one-run-per-day protection, and Action Center/manual run support.
- [x] Add manager cash float view that shows all register floats, petty cash/payouts, wallet cash movements, manager-safe cash, and total cash in the system at any moment.
- [x] Extend the manager action center into remaining pre-action approval requests: AI recommendation tasks, failed/offline sync items, and scheduled stocktake exceptions.
- [ ] Expand operator-friendly audit/stock visibility with deeper device attribution, richer customer/register labels, drill-through context, and PDF/accounting export packs beyond current CSV exports.
- [ ] Add guided stock receiving and deeper stock-count flows that explain valuation, variance reason taxonomy, count sheets, exports, and batch/location impact; current purchase-order receiving is still status-only.
- [ ] Add quick-access daily actions in the POS shell: consolidate currently scattered reprint last receipt, cash drawer/no-sale, active register status, parked sales, open tabs/tables, and pending workstation items into one first-screen operator strip.
- [ ] Add workflow-focused empty states and recovery actions for no open register, no stock, no customer selected, payment failure, offline mode, and printer readiness.
- [ ] Add role-specific onboarding/checklists for cashier, waiter, manager, owner, kitchen/bar, and Dev users that route each role to its first daily actions and missing setup.

### Daily Operator Workflow Audit - 2026-05-30

- Covered POS sell/park/table/tab flows, refund/void/reprint history, cash drawer/no-sale, register open/close/cash-up, manager cash/EOD, inventory receiving, stock adjustments, stocktake, staff permissions, manager approvals, and AI inventory approvals.
- Confirmed working surfaces: POS has active-register guarding, parked sales, table save, no-sale drawer logging, last receipt reprint, offline queue review, and wallet/account online guards; History has guided refund/void/reprint with manager approval routing; Cash Management has open/close, manager review, Z checklist, printer readiness, EOD checkpoint, cash custody, and searchable/exportable manager-cash movements.
- Confirmed approval surfaces: refund, void, stock adjustment, stocktake variance, AI warnings, and offline sync conflicts now converge into Action Center or guarded manager routes.
- Remaining operator friction: daily POS actions are discoverable but split across separate panels instead of a single first-screen action strip.
- Remaining stock friction: purchase orders can be created and marked received, but receiving does not yet book stock with invoice/variance evidence, batches, valuation, or ledger review.
- Remaining guidance friction: empty states and role checklists are inconsistent, especially for first login, no register, no customer, no stock, payment failure, offline recovery, and printer readiness.
- Remaining AI/approval friction: AI proposal application is guarded, but per-step persisted agent runs, one-mutation approval records, and stronger manager task conversion remain active P3/P8 gaps.

## P0 - Data Integrity, Audit, and Offline Reliability

- [x] Add audit and stock movement foundation tables/helpers, with completed sale stock deductions, refund restocks, void restocks, and sale create/update/refund/void audit events recorded.
- [x] Add manager-facing audit/stock activity search with date, staff, product, sale, customer, register, source, and action/reason filters.
- [x] Add CSV export for owner/accountant review of filtered audit and stock activity.
- [x] Add immutable audit/event log for every sale, refund, void, cash movement, stock change, customer change, staff change, settings change, login/security event, failed permission check, and AI/autopilot approval.
- [x] Make audit logs searchable by staff member, customer, sale, register, device, action type, and date range.
- [x] Add exportable audit reports for owners, accountants, and compliance review.
- [x] Add transaction-safe checkout boundaries across sale rows, sale items, payments, stock deduction, cash-session movements, loyalty/customer-account updates, wallet changes, and staff metrics.
- [x] Add manager float/safe ledger that aggregates till floats, cash drops, cash added, petty cash, payouts, wallet cash movements, reconciled cash-ups, and manager-held cash into a real-time cash position.
- [x] Add first cash-in-system dashboard: open register expected cash + pending cash-ups + manager float/safe = total physical cash, with wallet liability and pending payouts shown separately.
- [x] Expand cash custody transfers between registers, staff, and the manager float/safe with counted denominations, expected-vs-counted variance, dual confirmation, manager approval, and audit trail.
- [x] Expand petty cash and payout tracking with receipt/photo attachment, cash-source selection, approver, and searchable/exportable reports.
- [x] Add manager/admin wallet cash reconciliation path so wallet cash top-ups and wallet cash payouts update wallet balance, manager float, and audit ledger atomically.
- [x] Extend wallet cash reconciliation into cashier/customer self-service flows so customer wallet top-ups, withdrawals, refunds, and liabilities automatically update the relevant register/session, manager float, and audit ledger consistently.
- [x] Expand end-of-day cash reconciliation so register cash + manager float/safe + petty cash + pending drops/pickups + wallet cash movements produces a total expected physical cash checkpoint, with variances surfaced in Action Center.
- [x] Add stock movement ledger with reason codes for receiving, sale, refund, void, adjustment, count correction, transfer, wastage, and shrinkage.
- [x] Add first Offline Solo frontend foundation: browser-local cash/card sale queue, local offline receipt number, cashier offline banner, wallet/account/PayFast offline blocking, and background replay when the browser returns online.
- [x] Add offline transaction queue with local sale capture, local receipt, sync/retry status, conflict handling, stock reconciliation, and clear cashier warnings.
- [x] Add offline sync/reconciliation UI for failed, pending, duplicated, and conflicted transactions.
- [x] Add offline sync event model that replays durable business facts only, with idempotency keys, register-prefixed local receipt numbers, batch upload, priority ordering, retry/backpressure, and summary notifications instead of stale live alert replay.
- [x] Block all wallet usage while offline, including customer/staff wallet spend, top-up, payout, refund-to-wallet, transfer, and adjustment flows; show an online-required warning and do not queue wallet balance mutations for later replay.
- [x] Add offline conflict policies for multi-device solo mode: allow sale capture, then surface negative stock, duplicate table/tab, receipt sequence, and duplicate customer/order issues as manager review tasks after sync.

## P1 - Payments and Checkout

- [x] Add formal lay-by workflow: deposit, instalments, due dates, cancellation, final collection, reserved stock, and lay-by receipts.
- [ ] Add QR/mobile-wallet rails: SnapScan, Yoco payment links/terminal flows, and generic QR payment capture.
- [ ] Add BNPL providers: PayJustNow, Mobicred, PayFlex, provider reconciliation, settlement status, and return/refund handling.
- [ ] Add card-terminal pairing so card payment is confirmed by an acquiring provider instead of only recorded manually.
- [ ] Keep offline card tender capture available as an external-hardware payment record because authorization happens on the card terminal/provider side; store only tender type, amount, provider/device reference, optional authorization/reference code, and reconciliation status.
- [ ] Extend split bills from tender splitting into restaurant split-by-seat, split-by-person, and split-by-table workflows.
- [ ] Add payment provider reconciliation reports without exposing card PAN/CVV data.
- [ ] Store provider tokens/payment references only for PayFast and future Yoco, SnapScan, and BNPL integrations.

## P2 - Inventory, Stock Control, and Purchasing

- [ ] Add multi-location inventory: branches, warehouses, stock by location, transfer orders, location-aware cashier access, and per-location reorder thresholds.
- [x] Add `stock_movements` table and product stock movement recording for completed sale deductions, refund restocks, and void restocks.
- [x] Add audited manual stock adjustment request/apply flow with Action Center approval and stock movement recording.
- [x] Add `stock_take_sessions` and `stock_take_items` tables so counted stock variances can be assigned, audited, reconciled, and approved.
- [x] Add formal stocktake, cycle-count, and spot-check workflow with staff product assignments, dedicated staff/mobile stocktake route, count entry, variance capture, manager recount, manager sign-off, and stock movement posting on approval.
- [x] Add recurring daily spot-check rules with random, low-stock, category, and manual product scopes plus manager scheduling controls.
- [ ] Add smarter spot-check suggestions based on shrinkage, low stock, wastage, expiry risk, sales velocity, and recent variances.
- [ ] Add formal shrinkage/wastage/damage/expiry reason taxonomy per variance, count sheets, count export packs, and supervisor second-count thresholds.
- [ ] Add `stock_batches` with expiry dates, supplier/invoice references, received quantities, remaining quantities, FIFO/FEFO guidance, and expiry warnings.
- [ ] Finish audited receiving/stock booking from purchase orders and invoice intake.
- [ ] Add min-stock recommendation storage, notification rules, reorder approvals, and purchase-order suggestions by location.
- [ ] Expand recipe costing with yield, waste, ingredient substitution, and gross-margin reporting.
- [ ] Keep invoice receiving and stock booking review-only until stock movements are fully audited.

## P3 - AI Inventory Copilot

- [x] Add vendor and purchase-order backend foundations.
- [x] Add Inventory Copilot Agent tab.
- [x] Add proposal generation for invoice intake, PDF/document intake, low-stock purchase orders, and event/function planning.
- [x] Add guarded apply endpoint for approved draft-safe steps.
- [x] Add Dev-only full autopilot switch for automatic draft-safe apply.
- [x] Add provider-specific AI extraction for invoice images and PDF/document uploads.
- [ ] Add persisted `ai_agent_runs` table with per-step approval and audit logs.
- [ ] Persist controlled execution runs with one mutation per explicit approval.
- [ ] Add audited execution records for each approved Copilot step.
- [ ] Add full bookings/events CRUD and calendar visibility.
- [ ] Add `event_bookings` table and bookings UI for private/public events.
- [ ] Keep full autopilot limited to draft-safe operations until audited stock receiving is complete.

## P4 - Reporting, Tax, and Analytics

- [ ] Add daily, weekly, monthly, and custom-date report filters with CSV/PDF export.
- [ ] Add SARS-ready VAT exports, tax-period locking, and audit-friendly tax invoice summaries.
- [ ] Add margin reports by product, category, staff member, payment method, and period.
- [ ] Add category performance, average basket segmentation, table turnover, open-tab aging, refund/void reports, and cash variance trends.
- [ ] Add cash position reports for current manager float, per-register expected cash, petty cash spend, wallet cash activity, cash-in-system history, and unresolved variances.
- [ ] Add accounting journal export foundation for future Sage, Xero, and QuickBooks integrations.
- [ ] Add dashboard KPIs for real-time sales, average basket size, table turnover, open tabs, cash variance, low stock, and active staff.

## P5 - CRM, Loyalty, Promotions, and POPIA

- [ ] Add promotions/coupons engine with validity windows, product/category/customer targeting, redemption limits, and checkout validation.
- [ ] Add loyalty tiers, reward rules, member status, and optional membership-card IDs/barcodes.
- [ ] Add reservations/bookings for restaurant mode and connect bookings to tables, customers, deposits, and reminders.
- [ ] Add customer segmentation and campaign-ready exports.
- [ ] Add customer consent tracking for loyalty, marketing, customer portal, stored contact details, promotions, and AI recommendations.
- [ ] Add customer data export workflow.
- [ ] Add customer delete/anonymize workflow that preserves legally required transaction records.
- [ ] Add retention policy settings for customer notes, messages, device/session metadata, and audit logs.

## P6 - Staff, Workforce, and Permissions

- [ ] Add shift scheduling, roster publishing, clock-in/out, attendance, overtime, break tracking, and timesheet/payroll export.
- [ ] Add tip pooling/distribution rules and per-shift payout summaries.
- [ ] Expand staff performance into sales-per-staff, void/refund patterns, table turnover, prep-time trends, coaching history, and staff exception insights.
- [ ] Add sensitive-action re-auth/PIN prompts for refunds, voids, no-sale drawer opens, cash drawer movements, manual discounts, manager overrides, account balance edits, wallet adjustments, stock adjustments, and settings changes.
- [ ] Add manager override flow with reason capture and audit trail.
- [ ] Add 2FA for admin, manager, and dev accounts.
- [ ] Add token revocation/refresh-token storage so logout and suspected compromise can invalidate live sessions.

## P7 - Integrations, Hardware, and Deployment

- [ ] Add accounting integrations: Sage, Xero, QuickBooks.
- [ ] Add e-commerce/marketplace integrations: Shopify, WooCommerce, Takealot.
- [ ] Add delivery integrations: Uber Eats and Mr D order ingestion.
- [ ] Add generic webhooks/API access for ERP and stock-system sync.
- [ ] Add direct hardware adapters for ESC/POS printers, kitchen printer routing, cash drawers, scales, barcode scanners, pole displays, and card terminals.
- [ ] Add handheld/tablet flow for tableside ordering and mobile checkout.
- [ ] Add true hybrid cloud/on-prem mode with offline-first sync.
- [ ] Validate Nginx static serving, API reverse proxy, SSL/TLS termination, rate limits, and production deployment docs.

## P8 - AI Manager Copilot and Differentiators

- [x] AI Manager Copilot V1 supports provider settings, deterministic staff scores, persisted insights, dashboard strips, refresh/delete controls, and provider test diagnostics.
- [x] AI providers include OpenAI, Ollama, AnythingLLM, Google Gemini, Vertex AI, and OpenRouter.
- [x] Refresh AI Manager Copilot data model with Action Center tasks, audit/offline/device metadata, stock movement reason codes, stocktake sessions/items/rules, manager cash/EOD/custody signals, lay-bys, purchase orders, split payments, refund/void traces, customer/payout exposure, and workstation timing groups.
- [ ] Add cashier-facing AI upsell prompts using cart contents, customer history, current stock, margin rules, active promotions, and time-of-day demand.
- [ ] Add AI menu/product optimization using product margin, category performance, low stock, wastage, and recipe-cost data.
- [ ] Add category performance, margin, table turnover, refund/void, cash variance, and staff exception insight types.
- [ ] Add manager approval/task workflow so AI recommendations can become tracked actions with owner, due date, status, and audit trail.
- [ ] Add integration-health insight cards for PayFast, future Yoco/SnapScan/BNPL, accounting, delivery, e-commerce, and ERP connectors.
- [ ] Keep V2 recommendations approval-first; AI must not auto-discount, auto-order, change stock, change staff permissions, or alter settings without auditable manager action.

## P9 - Security, PCI Boundary, and Production Hardening

- [x] Rotate exposed credentials and remove default JWT/PayFast credentials.
- [x] Add auth endpoint rate limiting, validation middleware, security headers, SQL-injection hardening, and centralized error handling.
- [ ] Document that card data is never stored in Jimmy POS.
- [ ] Add clear PCI boundary notes for self-hosted and hosted deployments.
- [ ] Add CSRF protection or an explicit same-site session strategy if cookie auth is introduced.
- [ ] Add rate limiting for sensitive non-auth endpoints, especially payment, refund, stock, login setup, and AI-provider test routes.
- [ ] Add structured security logging with redaction for tokens, API keys, passwords, and customer private data.
- [ ] Add SAST/dependency scanning and security regression tests.
- [ ] Add production environment checklist for JWT secret, database credentials, PayFast credentials, SSL, firewall rules, pooling, encryption at rest, backups, monitoring, alerting, and log rotation.

## P10 - Restaurant Mode

- [x] Workstation model, product routing, item lifecycle statuses, table/tab workflows, staff metrics, leaderboard surfaces, and live queue reporting exist.
- [x] Add server-owned per-item workstation timers for accept, prep, handoff, and total elapsed time with stale timer quality flags.
- [ ] Add restaurant split-by-seat/person/table bill workflows.
- [ ] Add reservations connected to tables, customers, deposits, and reminders.
- [ ] Add table-turnover reporting, open-tab aging, prep-time trend reporting, and staff coaching history.
- [ ] Add direct kitchen printer routing and printer readiness checks by workstation.
- [ ] Add AI menu optimization using time-of-day demand, margin, stock, wastage, and recipe data.

## P11 - Platform Migration, QA, and Operations

- [ ] Verify production database migrations are applied consistently, including `staff.password_hash` and any later audit, stock, AI, and payment tables.
- [ ] Create seed scripts for test tenants, users, staff passwords, sample products, sample customers, sample sales, and restaurant tables.
- [ ] Add auth middleware tests, auth endpoint integration tests, multi-tenant isolation tests, and end-to-end UI tests for login through checkout.
- [ ] Add batch create products, batch update prices, customer import/export, and inventory import/export flows.
- [ ] Add operational rollback notes for database migrations and production deploys.
- [ ] Keep MariaDB/Nginx migration notes archived unless they are re-verified against current code and copied into this workstream.

## P12 - Messaging and Realtime

- [x] Messaging currently works through REST polling.
- [ ] Keep REST polling for the current scale unless latency or concurrent-user growth justifies WebSockets.
- [ ] If real-time messaging becomes necessary, add Socket.IO server initialization, tenant/channel joins, message broadcasts, client subscription hooks, reconnect handling, and polling fallback.
- [ ] If scaling beyond one server instance, add Redis or another shared pub/sub layer for WebSocket fan-out.

## Implementation Order

1. Daily-operator workflow audit and UX gate for every P0/P1 feature.
2. Immutable audit/event log and stock movement ledger.
3. Operator-friendly audit/stock visibility and manager action center.
4. Transaction-safe checkout and offline queue/sync reconciliation.
5. Audited inventory receiving, stock counts, batch/expiry, and multi-location stock.
6. Sensitive-action re-auth/PIN, manager override trails, 2FA, and token revocation.
7. Payment expansion: Yoco/SnapScan/QR first, then BNPL and card-terminal pairing.
8. SARS/accounting export pack, margin/category reports, and dashboard KPI expansion.
9. Staff scheduling, attendance, tip distribution, and workforce reports.
10. Promotions, reservations, membership cards, and POPIA customer workflows.
11. Hardware adapters, hybrid cloud/on-prem mode, and production Nginx deployment validation.
12. Seed data, auth/API coverage, multi-tenant isolation tests, and bulk import/export operations.
13. E-commerce, delivery, accounting, ERP integrations, AI upsell prompts, manager task workflows, and optional WebSocket realtime.

## Verification Log

- 2026-05-26: Added user friendliness/easy workflow as the product north star, plus a dedicated UX and Workflow Backlog and updated implementation order so workflow review gates future feature work.
- 2026-05-26: Added `audit_events` and `stock_movements` schema tables for MariaDB/Postgres, startup self-healing, audit helper functions, product stock delta helper, and sale/refund/void ledger wiring.
- 2026-05-26: Passed focused backend verification for audit helpers/schema and sale stock/audit wiring: `npx.cmd vitest run tests/backend/audit.test.ts tests/backend/audit-stock-ledger-schema.test.ts tests/backend/mariadb-crud.test.ts tests/backend/cash-management-schema.test.ts`.
- 2026-05-26: Added the first manager Action Center API and UI for daily exception queues across cash variances, refunds/voids, low stock, AI warnings, stock movements, and audit activity.
- 2026-05-26: Passed Action Center verification: `npx.cmd vitest run tests/backend/action-center.test.ts tests/frontend/permissions.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Added `manager_tasks` schema, signal-to-task syncing, manager decision API, audited approve/decline/dismiss workflow, and Action Center task controls with manager notes.
- 2026-05-26: Passed manager task verification: `npx.cmd vitest run tests/backend/manager-tasks.test.ts tests/backend/action-center.test.ts tests/backend/audit-stock-ledger-schema.test.ts tests/frontend/permissions.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Added cashier refund/void approval requests, manager approval execution for requested refunds/voids, History UI request messaging, and approval-request schema support.
- 2026-05-26: Passed refund/void approval request verification: `npx.cmd vitest run tests/backend/manager-tasks.test.ts tests/backend/action-center.test.ts tests/backend/audit-stock-ledger-schema.test.ts tests/frontend/permissions.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Added guided inventory stock adjustment requests, manager/direct backend stock adjustment endpoint, Action Center approval execution, audit events, and stock movement ledger recording.
- 2026-05-26: Passed stock adjustment approval verification: `npx.cmd vitest run tests/backend/manager-tasks.test.ts tests/backend/audit-stock-ledger-schema.test.ts tests/frontend/permissions.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Added manager-facing Action Center activity search for audit events and stock movements with text, staff, product, sale, action/reason, and date filters.
- 2026-05-26: Passed activity search verification: `npx.cmd vitest run tests/backend/action-center.test.ts tests/backend/manager-tasks.test.ts tests/frontend/permissions.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Extended Action Center activity search with customer, register/cash-session, and source filters plus CSV export for filtered audit/stock rows.
- 2026-05-26: Passed Action Center export verification: `npx.cmd vitest run tests/backend/action-center.test.ts tests/backend/manager-tasks.test.ts tests/frontend/permissions.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Added stocktake mode with `stock_take_sessions`/`stock_take_items` schema, staff product assignments, dedicated staff/mobile stocktake route, mobile count entry, spot-check/cycle/full modes, manager recount, manager approval, stock ledger posting, and Action Center spot-check launch.
- 2026-05-26: Passed stocktake verification: `npx.cmd vitest run tests/backend/stock-take.test.ts tests/backend/audit-stock-ledger-schema.test.ts`, `npx.cmd vitest run tests/backend/stock-take.test.ts tests/backend/action-center.test.ts tests/backend/manager-tasks.test.ts tests/backend/audit-stock-ledger-schema.test.ts tests/frontend/permissions.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Fixed local MariaDB app-user connectivity for ignored `.env`, verified `stock_take_sessions`, `stock_take_items`, `stock_movements`, and `audit_events` exist in the running MariaDB container, and added/passed `npm.cmd run smoke:stocktake`; smoke test creates temporary tenant/staff/products, assigns a spot check, submits staff counts, approves it, verifies stock/ledger, and cleans up.
- 2026-05-26: Added `stock_take_rules` schema/startup healing, daily spot-check rule APIs, Stocktake manager scheduling UI, rule run auditing, one-run-per-day protection, and rule-generated staff assignments; passed `npx.cmd vitest run tests/backend/stock-take.test.ts tests/backend/audit-stock-ledger-schema.test.ts tests/frontend/permissions.test.ts`, `npm.cmd run lint`, `npm.cmd run smoke:stocktake`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Added `manager_cash_movements` schema/startup healing, manager cash summary/movement APIs, automatic safe-drop/cash-added/petty-cash mirroring, reconciled cash-up transfer into manager float, Cash Management cash-in-system dashboard, and manager float movement form; passed `npx.cmd vitest run tests/backend/manager-cash.test.ts tests/backend/cash-management-schema.test.ts tests/frontend/permissions.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Added atomic wallet cash reconciliation for manager/admin wallet top-ups and paid wallet payouts, including wallet balance update, manager float movement, audit event, and Wallet Admin cash-vs-balance correction control; passed `npx.cmd vitest run tests/backend/manager-cash.test.ts tests/backend/cash-management-schema.test.ts tests/frontend/permissions.test.ts tests/backend/validation.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Added cash custody handover workflow with pending transfer records, counted denominations, expected-vs-counted variance, second-person confirmation, manager cash ledger posting, register expected-cash updates, audit events, and Cash Management pending-handover/EOD visibility; passed `npx.cmd vitest run tests/backend/manager-cash.test.ts tests/backend/cash-management-schema.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Added end-of-day cash close checkpoints with physical cash counting, expected-vs-counted variance, wallet/petty-cash/handover snapshot totals, unresolved cash item warnings, Action Center `cash_variance` task sync, CSV export, and Cash Management close history; passed `npx.cmd vitest run tests/backend/manager-cash.test.ts tests/backend/cash-management-schema.test.ts`, `npx.cmd vitest run tests/backend/manager-cash.test.ts tests/backend/cash-management-schema.test.ts tests/frontend/permissions.test.ts tests/backend/validation.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Extended wallet cash reconciliation into cashier/customer flows: POS customer wallet cash top-up/payout modal records register expected-cash movement plus neutral manager-cash activity/audit, wallet checkout deductions moved into sale transactions, customer/staff payout requests now reserve wallet balance atomically, and portal/profile balances refresh immediately.
- 2026-05-26: Passed wallet reconciliation verification with `npx.cmd vitest run tests/backend/manager-cash.test.ts tests/backend/mariadb-crud.test.ts tests/backend/cash-management-schema.test.ts tests/backend/validation.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; browser smoke confirmed app/demo/register flow, while the customer wallet modal visual path was limited by demo customer selection.
- 2026-05-26: Extended Action Center pre-action work so AI warnings remain manager tasks, submitted/overdue stocktakes create `stock_variance` tasks, stocktake approvals execute through the stocktake ledger, and future offline/sync failure audit events create `offline_sync` tasks; Action Center now shows stocktake and sync issue counts/panels.
- 2026-05-26: Passed Action Center pre-action verification with `npx.cmd vitest run tests/backend/manager-tasks.test.ts tests/backend/action-center.test.ts tests/backend/stock-take.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; local server returned HTTP 200 on port 8087, but in-app browser automation timed out before visual interaction.
- 2026-05-26: Passed `npm.cmd run lint` and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-26: Broader `npx.cmd vitest run tests/backend` ran 12 backend files successfully but failed `tests/backend/db-tables.test.ts` because the local test database login was denied for `root`.
- 2026-05-26: Consolidated active roadmap/todo items from the former implementation roadmap, AI Inventory Copilot plan, AI Manager Copilot todo, MariaDB/Nginx migration plan, migration status notes, security checklist, security implementation summary, and POS feature blueprint audit into this master todo.
- 2026-05-26: Confirmed current code references JWT-based `useAuth`, bearer-token API helpers, `/api/auth/login`, password-hash schema columns, and refresh-token handlers, so old migration docs about frontend auth migration are historical rather than active.
- 2026-05-27: Added first Offline Solo frontend foundation with local sale queue storage, offline cashier banner, wallet/account/PayFast offline blocking, external card/cash queueing, offline receipt messaging, split-payment offline guardrails, and automatic replay when the browser reports online again; passed `npx.cmd vitest run tests/frontend/offline-sales.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-30: Completed transaction-safe checkout boundary hardening. Checkout now attaches loyalty, cash-session, cash-movement, staff-metric, and account-balance side-effect payloads before online writes or offline queueing; the backend applies those effects inside the sale create/update transaction with sale rows, items, payments, stock deduction, and wallet changes, and only runs update side effects on the transition into completed sale state.
- 2026-05-30: Added offline sale sync idempotency support with `offline_event_id`, `sync_source`, startup schema healing, durable local receipt/device metadata, server-owned sync audit events, and removal of the old frontend post-sale cash/staff replay path so offline sync cannot double-apply register or staff totals.
- 2026-05-30: Passed focused verification for this slice: `npx.cmd vitest run tests/frontend/offline-sales.test.ts tests/backend/mariadb-crud.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-30: Added POS offline queue review controls for pending/syncing/failed sales, manual retry, local dismiss, and a server endpoint that records browser-side sync failures/conflicts as `offline.sync_failed` or `offline.sync_conflict` audit events so existing Action Center sync creates manager `offline_sync` tasks.
- 2026-05-30: Passed offline recovery verification: `npx.cmd vitest run tests/frontend/offline-sales.test.ts tests/backend/offline-sync.test.ts tests/backend/manager-tasks.test.ts tests/backend/action-center.test.ts`, `npx.cmd vitest run tests/backend/mariadb-crud.test.ts tests/frontend/offline-sales.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-30: Completed offline conflict policy hardening. Offline sync now classifies negative-stock, duplicate-receipt, duplicate-table/tab, duplicate-customer/order, and generic sync failures with recommended manager actions; backend offline sale sync records `offline.sync_conflict` audit events for stock shortages and open table/tab/customer-order collisions; POS and Action Center show the conflict category and next action.
- 2026-05-30: Passed conflict policy verification: `npx.cmd vitest run tests/frontend/offline-sales.test.ts tests/backend/offline-sync.test.ts tests/backend/mariadb-crud.test.ts tests/backend/manager-tasks.test.ts tests/backend/action-center.test.ts`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`; build still reports the existing large-chunk warning, and `git diff --check` only reported LF-to-CRLF normalization warnings.
- 2026-05-30: Completed offline sync event model hardening. Queued offline checkouts now carry durable sale sync event envelopes with idempotency keys, register-prefixed local receipt numbers, batch IDs, sequence numbers, priority ordering, bounded batch replay, retry backpressure windows, and POS summary messaging; server-side offline audit details include batch/sequence/event metadata for Action Center review.
- 2026-05-30: Passed offline event model verification: `npx.cmd vitest run tests/frontend/offline-sales.test.ts tests/backend/offline-sync.test.ts tests/backend/mariadb-crud.test.ts tests/backend/manager-tasks.test.ts tests/backend/action-center.test.ts`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`; build still reports the existing large-chunk warning, and `git diff --check` only reported LF-to-CRLF normalization warnings.
- 2026-05-30: Completed offline wallet online-only blocking. Added a shared wallet online-required guard and browser online-status hook, then wired it through POS wallet checkout/split/wallet cash, refund-to-wallet, staff and customer payout requests, Wallet Admin payout/adjustment actions, and Cash Management wallet-cash movement controls so wallet balance mutations are not queued offline.
- 2026-05-30: Passed wallet offline verification: `npx.cmd vitest run tests/frontend/offline-guards.test.ts tests/frontend/offline-sales.test.ts tests/backend/offline-sync.test.ts tests/backend/mariadb-crud.test.ts tests/backend/manager-tasks.test.ts tests/backend/action-center.test.ts tests/backend/manager-cash.test.ts`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`; build still reports the existing large-chunk warning, `git diff --check` only reported LF-to-CRLF normalization warnings, and the in-app browser reached `http://127.0.0.1:8080` but visual verification remained limited by the existing blank-root/Vite websocket issue.
- 2026-05-30: Added structured stock movement `reason_code` taxonomy for receiving, sale, refund, void, adjustment, count correction, transfer, wastage, and shrinkage while preserving the existing free-text `reason`; schema self-healing backfills legacy movement reasons, stock writes classify sale/refund/void/stocktake/manual-adjustment movements, and Action Center search/export now includes the reason code.
- 2026-05-30: Passed stock reason-code verification: `npx.cmd vitest run tests/backend/audit.test.ts tests/backend/audit-stock-ledger-schema.test.ts tests/backend/action-center.test.ts tests/backend/manager-tasks.test.ts tests/backend/mariadb-crud.test.ts tests/backend/stock-take.test.ts`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`; build still reports the existing large-chunk warning, and `git diff --check` only reported LF-to-CRLF normalization warnings.
- 2026-05-30: Expanded immutable audit coverage across auth login/logout/password setup, failed role/package checks, AI settings/test/autopilot apply, app/logo/push/device settings, customer/staff CRUD, cash-session lifecycle events, and every server-side cash-movement insertion path.
- 2026-05-30: Passed immutable audit coverage verification: `npx.cmd vitest run tests/backend/audit.test.ts tests/backend/audit-coverage.test.ts tests/backend/auth-handler.test.ts tests/backend/mariadb-crud.test.ts tests/backend/manager-cash.test.ts`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`; build still reports the existing large-chunk warning, and `git diff --check` only reported LF-to-CRLF normalization warnings.
- 2026-05-30: Completed audit searchability expansion. Action Center audit/stock activity search now includes device ID filtering, audit-detail metadata search for register/customer/device/local receipt context, richer display of device/local receipt fields, and sale audit details now carry cash-session/device/local receipt metadata for searchable online/offline traces.
- 2026-05-30: Passed audit searchability verification: `npx.cmd vitest run tests/backend/action-center.test.ts tests/backend/audit-coverage.test.ts tests/backend/mariadb-crud.test.ts`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`; build still reports the existing large-chunk warning, and `git diff --check` only reported LF-to-CRLF normalization warnings.
- 2026-05-30: Added exportable audit report packs for owner, accounting, and compliance review. Reports reuse Action Center filters, include metadata, summary counts, action/source/staff/stock-reason breakdowns, review-focus labels, and full activity detail rows with register/device/local receipt context.
- 2026-05-30: Passed audit report export verification: `npx.cmd vitest run tests/backend/action-center.test.ts tests/backend/audit-coverage.test.ts tests/backend/mariadb-crud.test.ts`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`; build still reports the existing large-chunk warning, and `git diff --check` only reported LF-to-CRLF normalization warnings.
- 2026-05-30: Expanded petty cash and payout tracking on the manager-cash ledger with physical cash source, receipt/photo reference fields, approver metadata, searchable filters, CSV export route, and Cash Management UI controls; Wallet Admin paid wallet payouts now write approver/source metadata into the ledger.
- 2026-05-30: Passed petty cash/payout tracking verification: `npx.cmd vitest run tests/backend/manager-cash.test.ts tests/backend/cash-management-schema.test.ts`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`; build still reports the existing large-chunk warning, and `git diff --check` only reported LF-to-CRLF normalization warnings.
- 2026-05-30: Completed the daily-operator workflow audit across POS, tables/tabs, refund/void/reprint, cash-up, stock receiving, stock adjustments, staff permissions, and AI approvals; captured confirmed working surfaces and converted the remaining operator friction into active UX/P2/P3/P8 roadmap gaps inside this master todo.
- 2026-05-30: Added the formal lay-by workflow with `layby_orders`, `layby_items`, and `layby_payments` schema/startup healing, POS lay-by creation, active lay-by manager controls for instalments, final collection, cancellation/release, reserved-stock stock movements, cash-session movement capture for cash lay-by payments/refunds, completed `layby_final` sale creation, audit events, and printable lay-by receipts.
- 2026-05-30: Passed lay-by verification: `npx.cmd vitest run tests/backend/layby.test.ts tests/backend/layby-schema.test.ts`, `node --check server\layby.ts`, `npm.cmd run build`, and `npm.cmd run lint`; build still reports the existing large-chunk warning.
- 2026-05-31: Updated AI Manager Copilot with the newer operational data model: Action Center tasks, audit/offline/device and local-receipt metadata, stock movement reason codes, stocktake workflow signals, manager cash/EOD/custody ledgers, lay-by exposure, purchase-order pipeline, split-payment/refund/void traces, and customer/payout exposure. Staff scoring now includes Action Center follow-through, stocktake variance, refund/void exceptions, no-sale traces, and offline sync issues. Passed `npx.cmd vitest run tests/backend/ai.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
- 2026-05-31: Implemented workstation timer telemetry with backend-owned UTC/server timestamps: held/open orders do not stamp `ordered_at`, send-to-workstation stamps `ordered_at`, accept/ready/delivered stamp their own phase timestamps once, edit/re-send preserves existing timestamps, and newly added sent items get fresh sent timestamps. Added shared timing thresholds, stale/unclosed-handoff handling, live workstation phase averages/P90/stale counts, Workstation and Tables timer chips, and AI `liveTiming`/`servicePeriodTiming` intake. Passed `npx.cmd vitest run tests/backend/mariadb-crud.test.ts tests/backend/workstation-stats.test.ts tests/frontend/workstation-timing.test.ts tests/backend/ai.test.ts`, `npm.cmd run lint`, and `npm.cmd run build`; build still reports the existing large-chunk warning.
