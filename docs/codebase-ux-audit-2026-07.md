# MasePOS — Codebase, UI/UX & Workflow Audit

**Date:** 2026-07-12
**Commit audited:** `05220bb`
**Scope:** Frontend (React 19 / Vite / Tailwind 4), backend (Express 5 / PostgreSQL / Kysely), architecture, state management, tooling, and repo hygiene.

This document consolidates findings from a full-repo audit. Items are grouped by area and ranked **High / Medium / Low**. Each finding gives the file/line, the problem, its impact, and a concrete fix. A prioritized action list is at the end.

> **Two items need attention today** (see Security H0 and Security H1): a real-looking admin password is committed to git, and an AI API key is inlined into the browser bundle.

---

## 1. The reported issue: Terminal screen is unusable on mobile

The "Terminal" is the point-of-sale sale screen (`PointOfSaleView`, labelled *Terminal* in navigation). On a phone, a stack of chrome and tool panels pushes the actual product grid far below the fold and, in some layouts, covers most of the viewport. Root causes, all verified:

### T1 (High) — "Terminal Tools" quick-action panel is expanded by default on mobile
- **File:** `src/views/PointOfSaleView.tsx:184-197` (default state), `:1169-1295` (render)
- **Problem:** `showQuickActions` defaults to `true`. On mobile this renders a `grid-cols-2` block of up to **7 large action cards** (Register, Receipt, Drawer, Parked, Lay-bys, Tables, Tabs, Queue), each ~90px tall, *above* the product grid — on top of the app header, the sticky mobile nav strip (`App.tsx:1392`), the search/layout-toggle/customer-selector/last-receipt row (`:1076-1167`), the "Terminal Tools" header, and any recovery-action cards. The result is that a phone user scrolls through a full screen of chrome before reaching a single product.
- **Impact:** Core sell flow is buried on the smallest, most common retail device. This is the "unnecessary items that cover almost the whole page" the report describes.
- **Fix:** Default `showQuickActions` to collapsed on small screens (e.g. initialize from a media query, or hide the panel below `lg:` and expose it via a bottom-sheet / "Tools" button). At minimum default the stored value to `false` on first run for narrow viewports. The desktop experience can keep it expanded.

### T2 (High) — Product grid stays single-column on phones because the `xs:` breakpoint doesn't exist
- **File:** `src/views/PointOfSaleView.tsx:1600` — `grid-cols-1 xs:grid-cols-2 md:grid-cols-3 …`
- **Problem:** Tailwind 4 has no built-in `xs` breakpoint and the project defines none (`src/index.css` `@theme` block has no `--breakpoint-xs`). Every `xs:` class is a no-op, so from 0–768px the grid is **one column**, wasting half the width of any phone in landscape or any 400–768px device and compounding T1's scroll problem.
- **Fix:** Either define `--breakpoint-xs: 25rem;` in the `@theme` block of `src/index.css`, or change the class to `grid-cols-2 md:grid-cols-3 …`. Same `xs:` misuse appears in `DevDashboard.tsx`.

### T3 (Medium) — Cart drawer visibility is computed from `window.innerWidth` during render
- **File:** `src/views/PointOfSaleView.tsx:1676`, `:1684-1686`
- **Problem:** `(isCartOpen || window.innerWidth >= 1024)` and the animation direction are read from `window.innerWidth` inside the render body. This is not reactive: rotating a tablet or resizing does not re-evaluate, so the cart can render in the wrong mode until an unrelated re-render occurs.
- **Fix:** Use a `useMediaQuery('(min-width: 1024px)')` hook (or Tailwind responsive classes) so layout follows the viewport reactively.

### T4 (Low) — "Terminal Tools" header + product search + customer selector + last-receipt button all stack full-width on mobile
- **File:** `src/views/PointOfSaleView.tsx:1076-1178`
- **Problem:** The toolbar row is `flex-col sm:flex-row`; on mobile the search box, layout toggle, customer selector, and a large two-line "Last receipt" button each take a full row. The last-receipt button in particular duplicates the Receipt quick-action card and adds vertical height.
- **Fix:** Collapse the last-receipt button into the quick-actions panel on mobile (it already exists there at `:1195-1209`), and consider hiding the layout toggle below `lg:` (grid/sidebar layout is a desktop concern).

---

## 2. Security & backend correctness

**Baseline (verified good):** tenant isolation is enforced centrally (`server/app.ts:292` mounts `requireAuth, requireTenantRouteAccess` on `/api/data/tenants/:tenantId`); all SQL uses parameterized placeholders; `createSale`/refund/void run in transactions with `FOR UPDATE` locks; JWT secret is length-validated and required in production; CORS is a strict env-driven allowlist; auth endpoints are rate-limited (5/15min). The findings below are the exceptions.

### H0 (High, act today) — Real admin credentials committed in e2e tests
- **File:** `tests/e2e/pos.spec.ts:6-7` — `DEV_EMAIL`/`DEV_PASSWORD` hardcoded as fallbacks to what appears to be the owner's real email and password for the live system.
- **Impact:** Anyone with repo access (or a CI log, or a leaked clone) has working admin credentials against production.
- **Fix:** **Rotate the password now.** Make the spec fail fast if `E2E_EMAIL`/`E2E_PASSWORD` are unset (no fallback). Scrub git history (git-filter-repo / BFG) if the repo is or will be shared.

### H1 (High, act today) — `GEMINI_API_KEY` inlined into the client bundle
- **File:** `vite.config.ts` — `define: { 'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY) }`
- **Impact:** If the build host has this env var set, the key ships to every visitor in browser JS. AI calls now run server-side, so this is a leftover.
- **Fix:** Delete the `define` entry; keep all AI keys server-only. Grep the built `dist/` to confirm the key is gone.

### H2 (High) — Route refactor silently dropped auth & step-up controls
- **Files:** `server/routes/customers.ts:37-53`, `products.ts:39-55`, `staff.ts:41-48` vs the now-dead inline handlers in `server/app.ts:667-860`
- **Problem:** The newer routers are mounted first (`app.ts:329-347`), so they win for overlapping paths and the stricter inline handlers are dead code. The routers dropped controls the inline versions had:
  - `customersRouter.delete("/:customerId")` (`customers.ts:46`) — **no role check** (inline version required manager/admin). Any cashier can delete/anonymize any customer, no audit event.
  - `customersRouter.put("/:customerId")` (`customers.ts:37`) — **no step-up** for `walletBalance`/`accountBalance`/`accountLimit`/`discountPercent`. A cashier can credit wallet/account balances or set discounts with no manager approval or audit.
  - `staffRouter.put("/:staffId")` (`staff.ts:41`) — enforces manager role but **dropped `staffSensitiveAction` step-up** for staff `walletBalance` changes.
- **Fix:** Delete the shadowed inline routes (`app.ts:667-860`) and port their `requireManagerRole` / `enforceSensitiveAction` / `auditRouteEvent` middleware onto the router handlers. Add a route-collision test.

### H3 (High) — Manager can self-escalate to admin/dev
- **Files:** `server/routes/staff.ts:41`, `server/validation.ts:125-144`, `server/db-crud.ts:1376-1379`
- **Problem:** `StaffUpdateSchema` permits `role: 'admin'|'dev'`, `updateStaff` writes it verbatim, and the route is gated only by `requireManagerRole`. A manager can promote themselves or anyone to `admin`/`dev` — full tenant control, plus `dev` unlocks AI autopilot, VAPID, and maintenance routes.
- **Fix:** Only `admin`/`dev` may assign `admin`/`dev`; forbid self-elevation. Compare `req.user.role` to the target role in the handler before calling `updateStaff`.

### H4 (High) — PayFast payment secrets exposed to every authenticated user
- **Files:** `server/routes/settings.ts:37-40`, `server/db-adapter.ts:238-248`
- **Problem:** `GET /config` returns the full app config including `payfastMerchantKey` and `payfastPassphrase` (the payment-signing secret), gated by `requireAuth` only. Any cashier token can read them and forge PayFast signatures.
- **Fix:** Strip `payfastMerchantKey`/`payfastPassphrase` from the `/config` response. The server already uses the passphrase internally in `routes/payfast.ts`; the client never needs it.

### M-B1 (Medium) — Sale totals trusted from the client
- **File:** `server/db-crud.ts:2571-2617` (`createSale`), `validation.ts:164-235`
- **Problem:** `sale.total`, `subtotal`, `taxAmount` are inserted directly from the request body; only promotions are re-validated server-side. A tampered client can record a completed sale with `total: 0`, corrupting revenue, tax, and cash reconciliation.
- **Fix:** Recompute subtotal/tax/total server-side from validated `items[]` (+ server-validated discounts) and reject/override mismatches.

### M-B2 (Medium) — Unauthenticated dev routes can reset the schema
- **File:** `server/routes/dev.ts:17-38` — `GET /api/dev/db-test` and `POST /api/dev/init-db` have no auth; mounted when `!isProduction` or `ENABLE_DEV_ROUTES=true` (`app.ts:286-289`).
- **Fix:** Add `requireAuth, requireDevMaintenance` (the backup routes already do this).

### M-B3 (Medium) — Package capacity / entitlement checks bypassed on create
- **Files:** `server/routes/products.ts:39`, `customers.ts:28` vs `app.ts:667-679, 746-761`
- **Problem:** Same shadowing as H2; the router POST handlers skip `requirePackageCapacity`/`requirePackageFeature`. Tenants can exceed paid-plan limits.
- **Fix:** Port capacity/feature middleware onto the router POSTs (fold into the H2 cleanup).

### M-B4 (Medium) — Uncontrolled tenant creation + mass-assignment on `/api/data/setup`
- **Files:** `server/app.ts:580-588`, `server/db-crud.ts:4441-4491`
- **Problem:** `POST /api/data/setup` (only `requireAuth`, outside the `:tenantId` guard) passes `req.body` straight into `setupTenant`, creating a tenant and inserting users/staff from client-supplied `uid`/`email`/`displayName` as `admin`. No zod validation.
- **Fix:** Gate to a provisioning role/flow, validate with zod, derive owner identity from `req.user` not the body, and rate-limit.

### M-B5 (Medium) — Cashier can modify vendors, purchase orders, and recipe (bulk) items
- **File:** `server/routes/inventory.ts:255-314` — `POST/PUT /vendors`, `POST/PUT /purchase-orders`, `POST/PUT/DELETE /bulk-items` have only `requireAuth`, unlike the rest of the inventory router (`canManageInventory`). Recipe items drive automatic stock deductions on sales.
- **Fix:** Add `canManageInventory` to these handlers.

### M-B6 (Medium) — Tenant settings write requires only step-up, not a role
- **File:** `server/routes/settings.ts:42-51` — `PUT /settings/app` is gated by `enforceSensitiveAction("settings_change")` (own PIN/password), no admin/manager check. Any user can rewrite business config, tax rate, package tier, and PayFast credentials.
- **Fix:** Add an admin/manager role check in addition to step-up.

### M-B7 (Medium) — Unbounded list endpoints
- **File:** `server/db-adapter.ts` — `getProductsByTenant:130`, `getCustomersByTenant:250`, `getStaffByTenant:302`, payout lists `:472/:488` have no `LIMIT`/pagination (customers also fan out consent lookups).
- **Fix:** Add limit/offset (or keyset) pagination with a sane default cap.

### M-B8 (Medium) — N+1 in active-sales fetch
- **File:** `server/db-adapter.ts:353-435` — `getActiveSalesByTenant` runs 2 extra queries per sale (up to ~200 round-trips) on the hot `GET /sales` path.
- **Fix:** Fetch items/payments with `WHERE sale_id = ANY($1)` and group in memory.

### L-B1 — Cash-movement `expected_cash` update not atomic with the movement insert
- **File:** `server/routes/cash.ts:313-343` — the movement insert and the `UPDATE cash_sessions SET expected_cash` are separate queries with no transaction; a crash between them desyncs the drawer balance from the ledger. Wrap both in one transaction.

### L-B2 — JWT verify doesn't pin the algorithm
- **File:** `server/auth-middleware.ts:107-114` — pass `{ algorithms: ['HS256'] }` as defense-in-depth.

### L-B3 — PayFast ITN webhook non-functional / wrong passphrase source
- **File:** `server/routes/payfast.ts:103-119` — `/notify` validates against the global passphrase while `/generate` signs with the tenant passphrase, so multi-tenant notifications mismatch; no server-to-server confirmation and it updates nothing. Resolve the tenant passphrase via `m_payment_id → sale → tenant`, add validation-query confirmation, and update sale/payment status.

### L-B4 — Money as JS floats
- **Files:** e.g. `db-crud.ts:297`, `routes/cash.ts:15-23`, refund proration `db-crud.ts:3694-3703` — ad-hoc `toFixed(2)`/`Number()` risks rounding drift in tips/refunds/wallet math over time. Standardize on integer cents or a decimal type.

---

## 3. Frontend UI/UX (beyond the Terminal)

### H-F1 (High) — Lay-by "Cancel & Release Stock" / "Final Collection" fire irreversible money actions with no confirmation
- **File:** `src/components/LaybyManagerModal.tsx:153-175` (`handleCancel`), `:132-151` (`handleComplete`), buttons `:364-397`
- **Problem:** One tap cancels a lay-by, posts a refund, and releases reserved stock — no confirm dialog, and `cancelReason` may be empty. "Final Collection" records a full-balance payment and completes the order in one tap. Both immediately `window.print()`.
- **Impact:** A mistap on a phone destroys a customer's lay-by. Comparable actions elsewhere are guarded (`confirm()` in `SettingsView`, the dedicated `SensitiveActionModal`).
- **Fix:** Require an explicit confirm step and a non-empty cancellation reason before enabling the button.

### H-F2 (High) — Critical cash/data operations fail silently (console.error only)
- **Files:** `CashManagementView.tsx` `openRegister:382-384`, `closeRegister:412-414`, `reviewSession:428-430`; `PurchaseOrdersView.tsx:85-87`; `BulkInventoryView.tsx:113-125`; `VendorManagementView.tsx:55-70`; several handlers in `SettingsView.tsx`.
- **Problem:** On API failure these log to console and show nothing. For cash-up, a failed "Submit Cash Up" looks identical to success until the next refresh — a money-integrity issue.
- **Fix:** Surface every catch via `toast.error(...)` or the local banner (patterns already exist in `SettingsView` `handleSave:433` and `HardwareAdaptersPanel:202`); keep form state for retry.

### H-F3 (High) — Table-section colour swatches use dynamic classes that Tailwind never generates
- **File:** `src/components/SettingsView.tsx:3284` — `` bg-${c}-400 `` for `['blue','emerald','orange','violet','red','amber']`.
- **Problem:** Tailwind 4 scans for literal class names; there's no safelist, and only `bg-emerald-400`/`bg-amber-400` exist as literals in `src/`. The other four swatches render as transparent, unlabeled 32px squares.
- **Fix:** Map to static classes (the file already does this for `colorMap` at `:3082-3089`) and add `aria-label={c}`.

### H-F4 (High) — Multi-column grid "tables" don't scroll or collapse on phones
- **Files:** `ReorderRecommendationsView.tsx:445-499` (7 cols), `RecipeCostingView.tsx:115-152` (7 cols), `InventoryLocationsView.tsx:335-376` (5 cols incl. 3 number inputs per row).
- **Problem:** Wrappers are `overflow-hidden` (not `overflow-x-auto`) and the column templates never collapse. On a 375px phone each column gets ~35–50px; the stock inputs in `InventoryLocationsView` become un-editable.
- **Fix:** Wrap in `overflow-x-auto` with a `min-w-[640px]` inner container, or switch to stacked cards below `md:` (the pattern exists in `StockBatchesView:240-285`).

### H-F5 (High) — Loyalty "points/redemption" rows overflow phones
- **File:** `src/components/SettingsView.tsx:2056-2092` — `flex items-center gap-4` sentence rows with fixed `w-32` inputs and no `flex-wrap`; ~500px min content in a ~300px container. The loyalty program can't be configured from a phone.
- **Fix:** Add `flex-wrap min-w-0` or stack `flex-col sm:flex-row`.

### H-F6 (High) — "Lay-bys" toggle is stranded in the Retention tab and can't be saved there
- **File:** `src/components/SettingsView.tsx:2823-2835` — the `enableLaybuys` checkbox sits in the Retention footer row; the global Save is hidden on that tab (`:3157`) and the tab's own "Save policy" persists only the retention policy, never `business.enableLaybuys`.
- **Impact:** Toggling appears to work (local state) but is lost on reload.
- **Fix:** Move the toggle to the Features tab (same card pattern at `:1233-1259`) or persist it in the retention save.

### M-F1 (Medium) — Inconsistent modal accessibility
- **Files:** most modals lack Escape handling, focus trap, `role="dialog"`, and backdrop dismissal — `SettingsView` category/workstation/section/table modals (`:3172-3360`), `StaffProfileView:481-500`, `PurchaseOrdersView:218-421`, `VendorManagementView:135-170`, `LaybyManagerModal:181-416`, `LaybyCreateModal:134-264`, `TablesView:171-266`, `BarcodeScanner:63-111`. `SensitiveActionModal` does it correctly (`:57-79`).
- **Fix:** Extract one modal shell (Escape, `role="dialog"`, `aria-modal`, backdrop close, focus trap) modeled on `SensitiveActionModal` and reuse.

### M-F2 (Medium) — Interactive text below the 12px floor
- Widespread `text-[10px]`/`text-[9px]` on buttons (SettingsView tier/promotion actions, `CashManagementView` handover Confirm/Cancel `:1296-1315`, `LaybyManagerModal` action buttons `:356-397`). Illegible on tablets at arm's length; several are money actions.
- **Fix:** Raise interactive text to `text-xs` (12px) minimum; reserve `text-[10px]` for non-interactive eyebrow labels.

### M-F3 (Medium) — Touch targets under 44px on icon-only row actions
- SettingsView category-tree `p-1.5` (~28px) and table-tile `p-1` (~22px) edit/delete; `ReorderRecommendationsView`/`InventoryLocationsView` `h-9 w-9` (36px); `ToastContainer`/`CustomerSelector` `p-1`. Per-row destructive actions sit side by side at ~30px — high mistap risk on a finger-operated POS.
- **Fix:** Normalize row actions to a 44px hit area (`h-11 w-11`), keep icon size.

### M-F4 (Medium) — Icon-only buttons with no accessible name; two wrong icons
- Missing `aria-label`/`title` on many icon buttons (SettingsView `:2859/2870/2877/2641/1528/3281`, PurchaseOrders `:223/295/329`, Vendor `:140`, BarcodeScanner `:80`, TablesView `:179`, BulkInventory `:356`). Wrong icon: `BulkInventoryView:356` uses the Save (floppy) icon for Edit; `SettingsView:3133` uses a rotated Plus (renders as ✕) for the table Edit button. `CustomerSelector:96-101` nests a clickable `<div>` inside a `<button>` (invalid, not keyboard-reachable).
- **Fix:** Add `aria-label`; use `Pencil`/`Edit` icons; make the clear-X a sibling button.

### M-F5 (Medium) — Purchase Order modals break on phones
- **File:** `PurchaseOrdersView.tsx:227` (`grid-cols-2` with no base single column), `:271-299` (fixed `w-20`/`w-24` item inputs, no wrap), `:352-394` (receiving `grid-cols-12` puts number inputs at ~45px). Goods-receiving is effectively impossible on a phone.
- **Fix:** `grid-cols-1 sm:grid-cols-2`; wrap item rows; stack receiving lines below `md:`.

### M-F6 (Medium) — Cash-management search re-fetches everything per keystroke
- **File:** `CashManagementView.tsx:358` — `managerMovementSearch` is a dep of the effect calling `fetchSessions()` (sessions + per-session movements + summary + transfers + close preview + history), with no debounce, on the busiest manager screen; also resets the 30s poll each keystroke.
- **Fix:** Debounce ~300ms and/or fetch only `getManagerCashMovements` on filter change.

### M-F7 (Medium) — "Submit Cash Up" accepts an empty count with no confirmation
- **File:** `CashManagementView.tsx:388-416`, submit `:1709-1711` — untouched counter → `closeAmount = 0` → one tap closes the register with `actualCash: 0` and a full negative variance, no "are you sure". Reconcile/Dispute (`:1738-1739`) are also one-tap irreversible.
- **Fix:** Require `closeAmount > 0` or an explicit "drawer empty" acknowledgement; confirm before submit and before Dispute.

### M-F8 (Medium) — Payout request fails silently on invalid amount
- **File:** `StaffProfileView.tsx:68` — `if (amount <= 0 || amount > walletBalance) return;` with no message; the input allows over-balance typing. Pressing Request does nothing.
- **Fix:** Inline error ("Amount exceeds wallet balance of R…").

### M-F9 (Medium) — Placeholder-only / missing labels on data-entry inputs
- Loyalty tier/rule forms (`SettingsView:2116-2265`, incl. two unlabeled `datetime-local`), CashManagement filters, `LaybyManagerModal:335-342`, `HardwareAdaptersPanel:337-478`, others. Placeholders vanish once filled; screen readers announce nothing.
- **Fix:** Use the labeled pattern already in `LoginModal`/`EnrollmentModal`/`LaybyCreateModal` (visible `<label>` or `aria-label`).

### M-F10 (Medium) — FAQ accordion overrides its accessible name; no `aria-expanded`
- **File:** `WelcomeView.tsx:1143-1160` — `aria-label` replaces the button's name so SRs hear "Expand FAQ" five times with no question text; `aria-expanded` missing. Drop the `aria-label`, add `aria-expanded={isOpen}`.

### M-F11 (Medium) — "Mark Ready Items as Delivered" has no loading/error state
- **File:** `TablesView.tsx:47-64, 234-244` — one `apiPut` per item in a loop, no try/catch, button never disabled in flight → a double-tap fires duplicate PUTs and a failure half-delivers with no message.
- **Fix:** try/catch + toast, add a `busy` state to disable and show a spinner.

### Low (frontend)
- **L-F1** Priority/margin badges lack dark-mode variants (`ReorderRecommendationsView:31-35`, `RecipeCostingView:12-16`) — pastel chips on dark cards. Copy dark variants from `StockBatchesView:17-21`.
- **L-F2** Settings 13+ tab strip hides its scrollbar (`SettingsView:1031`) with no off-screen affordance; reuse the `<select>` tab picker `CashManagementView` uses at `:856-872`.
- **L-F3** Hero flag gradient (`WelcomeView:915`) uses two `via-` stops; one is dropped — renders 3 colours, not 4.
- **L-F4** `ToastContainer:37-40` returns the cleanup from the event handler, not the effect — timers aren't cancellable and fire after unmount.
- **L-F5** Fixed `p-8` cards/modals squeeze 360px screens (~96px padding); use `p-4 sm:p-8`.
- **L-F6** `HardwareAdaptersPanel` `saveDevice:179-206` surfaces raw JSON parse errors and allows empty device names; validate first.
- **L-F7** `CashManagementView` denomination inputs (`:120-127`) are ~36px tall — below target for the most-tapped cash inputs; use `h-11`.

---

## 4. Architecture, state & tooling

### H-A1 (High) — Two sources of truth for server state
- **Files:** `src/hooks/useAppData.ts:70-78`, `src/App.tsx:897-912`, `src/store/usePosStore.ts:6-11`
- **Problem:** `config`, `activeSession`, `currentUserStaff`, `workstations` live in `useAppData` local state and are re-synced into zustand via four `useEffect`s; `App.tsx:752` then merges them (`effectiveActiveSession = storeActiveSession || activeSession`) because neither is authoritative. This causes one-render staleness windows and "which copy do I read" ambiguity (components read both) — the root of the prop-drilling-vs-store inconsistency, and a real risk for checkout reading a stale session.
- **Fix:** Pick one home. Move server-fetched entities into a query cache (TanStack Query fits the polling model: `refetchInterval` + socket-driven `invalidateQueries`); keep zustand for pure UI/cart state; delete the sync effects.

### H-A2 (High) — Ten independent polling loops, no caching/dedup
- **Files:** `useAppData.ts` (products 30s, customers 30s, staff 60s, config 120s, **sales 15s**, workstations 30s, cash 60s, sections 60s, tables 30s) + messages 10s in `useMessaging.ts:12`.
- **Problem:** Hand-rolled `setInterval` + `visibilitychange` duplicated ~9×; wholesale refetch on schedule regardless of the active view; the sales poll runs even while logged out (interval keeps firing; `useAppData.ts:429-461`). The homegrown `rateLimitPausedUntil` (`:36-43`) is a symptom of self-inflicted load. Sanitizers are duplicated (`refreshCustomers` vs `loadCustomers`, `refreshStaff` vs `loadStaff`) — four copies of two mappers that can drift.
- **Fix:** Adopt TanStack Query (per-dataset `staleTime`, shared visibility handling), extract `sanitizeCustomer`/`sanitizeStaff`/`sanitizeSale` into `src/utils/sanitizers.ts`, gate all polling behind auth, and use sockets to invalidate instead of the 15s sales poll.

### H-A3 (High) — Offline queue: localStorage read-modify-write, no cross-tab safety
- **File:** `src/utils/offlineSales.ts:234-248, 402-410, 556-639`
- **Problem:** Every mutation is full-array overwrite; change notification is a same-tab `CustomEvent` with no `storage` listener and no lock. Two tabs/companion devices can both run a sync pass and double-submit sales or clobber queue writes. The server `offlineEventId` idempotency key mitigates only if enforced on every backend path.
- **Fix:** Add a `storage`-event listener; serialize sync with `navigator.locks.request('offline-sync', …)` (or a localStorage lease); longer term move the queue to IndexedDB. Verify the backend rejects duplicate `offlineEventId` on both create and update.

### H-A4 (High) — Only `handleCheckout` is offline-capable; order-save paths hard-fail offline
- **File:** `src/hooks/useCheckout.ts:466-667` — `handleSaveOrder`, `handleParkSale`, `handleOpenTab`, `handleOpenTable` call `createSale`/`apiPut` with no `isBrowserOffline` check or `isOfflineLikeError` fallback (only `handleCheckout:812-848` queues).
- **Impact:** In restaurant mode a dropped connection means "send to kitchen", table orders, and tabs silently fail — undermining the offline story.
- **Fix:** Queue these through the same offline envelope (they already have `sale.create`/`sale.update` event types) or show an explicit "offline — table orders unavailable" state.

### M-A1 (Medium) — God components with no code-splitting
- `App.tsx` (1,880), `PointOfSaleView.tsx` (2,938), `SettingsView.tsx` (~3,363), `CashManagementView.tsx` (1,826), `api.ts` (1,820), `types.ts` (2,278). App uses string `pathname` matching, not `<Routes>` (`App.tsx:663`), so `React.lazy` route splitting is unavailable and all view props are wired in one place. `PointOfSaleView` takes **44 props** (~25 straight from `useCheckout`) and holds 40 `useState`s.
- **Fix:** Start with `PointOfSaleView`: have it call `useCheckout`/`usePosStore` directly instead of piping 25 props through App. Then extract `UserMenu`/`DesktopNav` from `App.tsx`, split `SettingsView` tabs into `components/settings/*`, and split `api.ts` by domain. Adopt `<Routes>` to enable lazy loading.

### M-A2 (Medium) — `window` CustomEvent bus with dual-fired `masepos:*`/`jpos:*` names
- **Files:** `App.tsx:200-232, 374-375, 778-830`, `PointOfSaleView.tsx:537-565`, `useAuth.ts:132-133, 184-185`, `api.ts:23-24`.
- **Problem:** App dispatches companion events twice (`masepos:` + `jpos:`) but `PointOfSaleView` listens only to `masepos:*` — all `jpos:companion-*` dispatches are dead code; meanwhile `UserMenu` listens to both, so some handlers fire twice per update. The companion state machine is an untyped, unordered protocol over `window`.
- **Fix:** Delete the `jpos:*` variants; replace the companion bus with a typed zustand slice (`useCompanionStore`) or a typed emitter — same-window communication doesn't need `window.dispatchEvent`.

### M-A3 (Medium) — Sensitive-action prompt breaks under concurrent 428s
- **Files:** `src/api-sensitive-action.ts:24-35`, `src/components/SensitiveActionModal.tsx:28-63`
- **Problem:** Each 428 registers a `{ once: true }` listener for `masepos:sensitive-action-resolved`. Two concurrent 428s (double-click / poll retry) both resolve from the first submission — the second request reuses the first credential for a possibly different `actionType`.
- **Fix:** Add a correlation id to the required/resolved events, or funnel prompts through a module-level promise queue (mutex).

### M-A4 (Medium) — Dual localStorage key families (`masepos_*` vs `jpos_*`)
- **Files:** `api.ts:14-52`, `useSocket.ts:43`, `useAuth.ts:57-61`, `PointOfSaleView.tsx:158`.
- **Problem:** `useSocket`/`api.ts` fall back to `jpos_access_token`/`jpos_refresh_token`, but `useAuth.getAccessToken()` (used for the auth header) reads only `masepos_access_token`. A legacy user with only `jpos_*` keys can open a socket but every REST call throws "Session expired". `jpos-terminal-category-layout` is read as fallback but only `masepos-` is written.
- **Fix:** One-shot migration at boot (copy `jpos_*` → `masepos_*`, delete old), then remove every fallback read. Centralize keys in a `storageKeys.ts` module (they're scattered across 10+ files).

### M-A5 (Medium) — React 19 runtime with transitive `@types/react` 18
- `package.json` has `react ^19.2.7` but no direct `@types/react`/`@types/react-dom`; `npm ls @types/react` resolves 18.3.28 transitively. tsc currently passes by hoisting luck; a lockfile refresh could break `npm run lint`.
- **Fix:** Add `@types/react@^19` and `@types/react-dom@^19` as direct devDependencies.

### M-A6 (Medium) — Pervasive `any` on the money-critical path
- 502 `any` occurrences; hotspots `types.ts` (152), `api.ts` (90), `CashManagementView.tsx` (38), `PointOfSaleView.tsx` (26), `useCheckout.ts` (22). Worst by consequence: `saleData: any` throughout `useCheckout`/`offlineSales`, `activeSession: any`, `payments: any[]`, `splitPayments?: any[]`. Zod 4 is a dependency but unused for client response parsing.
- **Fix:** Define `SalePayload`/`SalePayment`/`CashSession` in `shared/` (used by both server and client) and parse critical responses (`createSale`, `getOpenCashSession`) with zod. Prioritize the checkout/offline path.

### M-A7 (Medium) — E2E is a single smoke file with vacuous assertions
- **File:** `tests/e2e/pos.spec.ts` — Playwright declares chromium+webkit but there's one spec; several tests are conditional no-ops ("add to cart" asserts only URL unchanged; theme test ends with a tautology `expect(hasDark || hasLight)`). No e2e for checkout (cash/card/split), cash session open/close (`CashManagementView` has zero frontend tests), or offline→sync. Backend coverage is strong (63 suites).
- **Fix:** Add `data-testid`s to the POS grid/cart/tender modal, then three real journeys: cash checkout with change, split payment, offline checkout + sync (`context.setOffline(true)`). Delete or harden the `if (visible)` tests.

### M-A8 (Medium) — Stale/dead Vite config
- `vite.config.ts`: dev HMR hardcoded to `wss://jpos-production.up.railway.app` (no longer the target; local HMR broken unless `DISABLE_HMR=true`); Workbox `runtimeCaching` still targets `firestore.googleapis.com` (Firebase removed); `manualChunks` checks `id.includes('react')` before the icons branch, so `lucide-react` lands in `vendor-react` and `vendor-icons` is unreachable.
- **Fix:** Default HMR to same-origin; drop the firestore rule; reorder chunk checks most-specific-first (`/node_modules\/(react|react-dom|react-router-dom)\//`).

### M-A9 (Medium) — `lint` is only tsc; no ESLint / format check
- `package.json:17` `"lint": "tsc --noEmit"`; no eslint config/dep, yet `// eslint-disable-next-line` comments exist (`useAuth.ts:335`) that do nothing; `.prettierrc` exists with no `format` script; tsconfig `paths` maps `@/*` to repo root so `@/` imports can silently reach server code from the client; `noUnusedLocals`/`noUnusedParameters` off.
- **Fix:** Add `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` (exhaustive-deps would catch several effect bugs here), rename current script to `typecheck`, add `format:check`, wire both into CI.

### M-A10 (Medium) — Sandbox PayFast credentials as shipped client defaults
- **File:** `src/hooks/useAppData.ts:21-26` — `DEFAULT_CONFIG` embeds PayFast merchant id/key/passphrase (public sandbox values) as the fallback for every tenant; normalizes secrets-in-source and points checkout at sandbox before config loads.
- **Fix:** Default to empty strings + `payfastSandbox: true`; surface "PayFast not configured" in the tender UI; keep real credentials server-side only.

### Low (architecture)
- **L-A1** Repo-root litter: delete `$null` (a Windows PowerShell error artifact); move `PHASE2_*.md`, `SECURITY_*.md`, `WEBSOCKET_IMPLEMENTATION.md`, `DOCKER.md` into `docs/`; merge `Implementation Plan/` (space in the name) into `plans/`; move `AGENT_NOTES.md` (contains live infra IDs and a pointer to a local secrets file) to a private ops doc. Three overlapping doc locations exist (`docs/`, `plans/`, `Implementation Plan/`) — consolidate.
- **L-A2** `usePosStore.addToCart` modifier comparison (`usePosStore.ts:67`) treats duplicate modifier options as equal sets — harmless today, wrong for quantity-based modifiers.
- **L-A3** `isAuthenticated` reads localStorage during render (`useAppData.ts:67`) — non-reactive across tabs.
- **L-A4** `useCheckout.ts:863` `refreshCustomers?.()` is a floating promise with no `.catch` (the sibling call two lines up is caught).
- **L-A5** `useSocket.ts:160-171` — every consumer opens its own Socket.IO connection (3-4 per tab); use a ref-counted module-level socket manager.
- **L-A6** `package.json` `test:api` hardcodes six spec paths; the other ~57 backend suites run only under `test:unit`, so `npm test` runs most files twice — use vitest project workspaces (frontend jsdom / backend node).

---

## 5. Recommended enhancements

- **Responsive layout primitives:** add a `useMediaQuery` hook and a shared `<Modal>` shell (Escape/focus-trap/backdrop/`role="dialog"`) — resolves T3, M-F1, and several accessibility findings at once.
- **TanStack Query** for all server reads: eliminates ~9 hand-rolled polling loops, the rate-limit workaround, and the dual-source-of-truth problem (H-A1/H-A2), with socket-driven invalidation.
- **Shared money types + zod parsing** across `shared/`: types the checkout/offline path end-to-end (M-A6, M-B1).
- **ESLint with `react-hooks` rules** in CI: mechanically catches the stale-closure and missing-dependency classes of bug.
- **A design-token pass** to replace `text-[9px]/[10px]` interactive text and sub-44px hit areas with a small set of button sizes — improves usability on the actual POS hardware (tablets, finger input).
- **Offline parity** for table/tab/park flows (H-A4) so restaurant mode survives connectivity drops as designed.
- **Route-level code splitting** (adopt `<Routes>` + `React.lazy`) so the POS bundle stops shipping Settings/retention/AI-admin code.

---

## 6. Suggested order of attack

1. **Today:** rotate the e2e password and remove the fallback (H0); delete the `GEMINI_API_KEY` `define` (H1); `git rm '$null'`.
2. **This week (security):** restore auth/step-up on the refactored routers and delete the dead inline routes (H2); block role self-escalation (H3); strip PayFast secrets from `/config` (H4); recompute sale totals server-side (M-B1); lock down dev routes (M-B2).
3. **This week (the reported mobile issue):** collapse "Terminal Tools" by default on mobile (T1); fix the `xs:` breakpoint (T2); make the cart drawer reactive (T3).
4. **Next (UX safety):** confirmations on lay-by cancel/collect and cash-up submit (H-F1, M-F7); surface silent failures via toasts (H-F2); fix invisible colour swatches (H-F3); make stock/PO tables scroll or stack on phones (H-F4, M-F5); fix loyalty-form overflow (H-F5); relocate the lay-bys toggle (H-F6).
5. **Then (architecture):** add `@types/react` 19 and ESLint (M-A5, M-A9); one-shot localStorage key migration (M-A4); fix Vite HMR/chunks (M-A8); collapse `PointOfSaleView` props (M-A1); migrate polling to TanStack Query and delete the store-sync effects (H-A1, H-A2).
6. **Then (resilience & tests):** offline cross-tab locking (H-A3); offline support for table/tab saves (H-A4); three real e2e journeys incl. offline sync (M-A7).

---

*Findings were verified against source. A small number of leaf components (some payment modals) were not exhaustively re-reviewed in this pass; the modal-shell and silent-failure recommendations (M-F1, H-F2) apply to them as a class.*
