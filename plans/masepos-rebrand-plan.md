# MasePOS Rebrand Plan

## Strategy: Hybrid Rebrand (User-Facing + Internal Identifiers, Preserve DB & Licence)

### What Changes
- All user-visible text: "Jimmy's POS" / "JIMMY'S POS" / "Jimmy's POS" → **MasePOS**
- All user-visible text: "JPOS" / "jpos" (in UI, docs, prompts, filenames) → **MasePOS** / **masepos**
- localStorage keys: `jpos_*` → `masepos_*` (with migration layer)
- Custom DOM events: `jpos:*` → `masepos:*` (with dual-dispatch during transition)
- PWA manifest name, short_name, description
- HTML `<title>`, meta tags
- `package.json` name
- Docker container names
- Export filenames (CSV downloads)
- Email addresses in code
- AI system prompts
- Documentation

### What Does NOT Change (Backward Compatibility)
- Database name: `jimmy_pos` stays
- Licence key prefix: `JPOS-` stays
- Environment variables: `JPOS_HOSTED`, `JPOS_REQUIRE_LICENCE`, `JPOS_LICENCE_SERVER`, `JPOS_LICENCE_GRACE_DAYS`, `JPOS_LICENCE_RECHECK_MS`, `JPOS_LICENCE_CACHE_FILE`, `JPOS_HOSTED_PACKAGE_TIER` stay
- `shared/packageCatalog.ts` variable names (`JPOS_PACKAGES`, `JPOS_PACKAGE_ADDONS`, `JposPackage`) stay
- Feature identifier `jpos_branding` stays
- API routes stay unchanged
- Licence server URL stays unchanged

---

## Phase 1: Core Configuration & Build Files

### 1.1 [`package.json`](package.json:2)
- **Line 2**: `"name": "jimmy-pos"` → `"name": "mase-pos"`
- **Line 8**: `"name": "jimmy-pos"` in package-lock.json (auto-regenerated on `npm install`)

### 1.2 [`index.html`](index.html:6)
- **Line 6**: `<title>Jimmy's POS</title>` → `<title>MasePOS</title>`
- **Line 12**: `content="Jimmy's POS — Cloud-Native Point of Sale"` → `content="MasePOS — Cloud-Native Point of Sale"`
- **Line 17**: `content="Jimmy's POS"` (apple-mobile-web-app-title) → `content="MasePOS"`
- **Line 18**: `content="Jimmy's POS"` (application-name) → `content="MasePOS"`

### 1.3 [`vite.config.ts`](vite.config.ts:25)
- **Line 25**: `name: "Jimmy's POS"` → `name: "MasePOS"`
- **Line 26**: `short_name: "Jimmy's POS"` → `short_name: "MasePOS"`
- **Line 27**: `description: 'Cloud-Native Point of Sale for Modern Business'` → `description: 'MasePOS — Cloud-Native Point of Sale for Modern Business'`

### 1.4 [`metadata.json`](metadata.json:2)
- **Line 2**: `"name": "Jimmy's POS"` → `"name": "MasePOS"`
- **Line 3**: Update description to mention MasePOS

### 1.5 [`docker-compose.yml`](docker-compose.yml:1)
- **Line 1**: `name: jims-pos` → `name: mase-pos`
- **Line 7**: `container_name: jimmy-pos-db` → `container_name: masepos-db`
- **Line 29**: `container_name: jimmy-pos-app` → `container_name: masepos-app`
- **Line 67**: `container_name: jimmy-pos-nginx` → `container_name: masepos-nginx`

### 1.6 [`Dockerfile`](Dockerfile:1)
- **Line 1**: Comment `# Multi-stage build for Jimmy's POS` → `# Multi-stage build for MasePOS`

### 1.7 [`.env.example`](.env.example:1)
- No changes needed (env var names preserved for backward compatibility)

---

## Phase 2: PWA Manifest, Service Worker & Icons

### 2.1 [`public/push-sw-addon.js`](public/push-sw-addon.js:9)
- **Line 9**: `const title = payload.title || "Jimmy's POS"` → `const title = payload.title || "MasePOS"`
- **Line 19**: `tag: payload.tag || 'jpos-notification'` → `tag: payload.tag || 'masepos-notification'`
- **Line 31**: `client.postMessage({ type: 'jpos-push-notification', ... })` → `client.postMessage({ type: 'masepos-push-notification', ... })`
- **Line 47**: `client.postMessage({ type: 'jpos-notification-open', url })` → `client.postMessage({ type: 'masepos-notification-open', url })`

### 2.2 Icons
- [`public/favicon.svg`](public/favicon.svg:1): Currently a blue POS terminal icon — no text, so no change required unless you want a new design
- [`public/icons/icon-192.png`](public/icons/icon-192.png), [`public/icons/icon-512.png`](public/icons/icon-512.png), [`public/icons/maskable-icon-192.png`](public/icons/maskable-icon-192.png), [`public/icons/maskable-icon-512.png`](public/icons/maskable-icon-512.png): These are raster images — if they contain "J" branding, they need redesign. If they're abstract POS icons, they can stay.
- [`public/apple-touch-icon.png`](public/apple-touch-icon.png): Same consideration
- [`public/mstile-150x150.png`](public/mstile-150x150.png): Same consideration

---

## Phase 3: Shared Package Catalog

### 3.1 [`shared/packageCatalog.ts`](shared/packageCatalog.ts:1)
- **Variable names KEPT**: `JPOS_PACKAGES`, `JPOS_PACKAGE_ADDONS`, `JposPackage`, `JPOS_PACKAGE_ADDONS` — these are internal identifiers
- **Feature identifier KEPT**: `'jpos_branding'` — used in licence validation
- **Line 55**: `limitsLabel: '2 registers, 100 products, 3 staff, JPOS branding'` → `'2 registers, 100 products, 3 staff, MasePOS branding'`
- **Line 56**: `description: 'Hosted starter workspace...'` — no change needed
- Review all `description` and `limitsLabel` fields for "JPOS" references and update to "MasePOS"

---

## Phase 4: Server-Side Branding

### 4.1 [`server/app.ts`](server/app.ts:1)
- **Line 521**: `upgrade: "Upgrade your JPOS package to unlock more capacity"` → `"Upgrade your MasePOS package to unlock more capacity"`
- **Line 561**: `upgrade: "Upgrade your JPOS package to unlock this feature"` → `"Upgrade your MasePOS package to unlock this feature"`
- **Line 824**: `title: "JPOS push test"` → `title: "MasePOS push test"`
- **Line 1041**: `upgrade: "Upgrade your JPOS package to use your own logo"` → `"Upgrade your MasePOS package to use your own logo"`
- **Line 1060**: `upgrade: "Upgrade your JPOS package to upload your own logo"` → `"Upgrade your MasePOS package to upload your own logo"`

### 4.2 [`server/ai.ts`](server/ai.ts:1)
- **Line 161-162**: `"JPOS had an OpenRouter key..."` → `"MasePOS had an OpenRouter key..."`
- **Line 162**: `"JPOS did not have an OpenRouter key..."` → `"MasePOS did not have an OpenRouter key..."`
- **Line 887**: `"Extract supplier invoice data for JPOS inventory automation..."` → `"...for MasePOS inventory automation..."`
- **Line 977**: `"You are an invoice extraction engine for JPOS..."` → `"...for MasePOS..."`
- **Line 1063**: `"X-Title": "JPOS AI Manager Copilot"` → `"X-Title": "MasePOS AI Manager Copilot"`
- **Line 1068**: `"You are an invoice extraction engine for JPOS..."` → `"...for MasePOS..."`
- **Line 1250**: `"You are a provider connectivity tester for JPOS..."` → `"...for MasePOS..."`
- **Line 1274**: `"You are JPOS Manager Copilot..."` → `"You are MasePOS Manager Copilot..."`
- **Line 1298**: `"You are a provider connectivity tester for JPOS..."` → `"...for MasePOS..."`
- **Line 1318**: `"You are JPOS Manager Copilot..."` → `"You are MasePOS Manager Copilot..."`
- **Line 1487**: `"X-Title": "JPOS AI Manager Copilot"` → `"X-Title": "MasePOS AI Manager Copilot"`
- **Line 1492**: `"You are a provider connectivity tester for JPOS..."` → `"...for MasePOS..."`
- **Line 1514**: `"X-Title": "JPOS AI Manager Copilot"` → `"X-Title": "MasePOS AI Manager Copilot"`
- **Line 1519**: `"You are JPOS Manager Copilot..."` → `"You are MasePOS Manager Copilot..."`

### 4.3 [`server/auth-handler.ts`](server/auth-handler.ts:52)
- **Line 52**: `staff.tenant_name || "Jimmy's POS"` → `staff.tenant_name || "MasePOS"`
- **Line 116**: `const email = 'demo@jimmyspos.test'` → `const email = 'demo@masepos.test'`
- **Line 118**: `const tenantName = "Jimmy's POS Demo"` → `const tenantName = "MasePOS Demo"`

### 4.4 [`server/actionCenter.ts`](server/actionCenter.ts:662)
- **Line 662**: `filename: \`jimmy-pos-activity-...\`` → `filename: \`masepos-activity-...\``

### 4.5 [`server/managerCash.ts`](server/managerCash.ts:1499)
- **Line 1499**: `filename: \`jimmy-pos-cash-close-...\`` → `filename: \`masepos-cash-close-...\``

### 4.6 [`server/pushNotifications.ts`](server/pushNotifications.ts:25)
- **Line 25**: `"mailto:dev@jimmyspos.local"` → `"mailto:dev@masepos.local"`

### 4.7 [`server/db.ts`](server/db.ts:83)
- **Line 83**: `|| "jimmy_pos"` — **KEPT** (database name preserved)

### 4.8 [`server/licenceMiddleware.ts`](server/licenceMiddleware.ts:1)
- **No changes** — all `JPOS_` env vars preserved

### 4.9 [`server/licenceKey.ts`](server/licenceKey.ts:33)
- **Line 33**: `const KEY_PREFIX = "JPOS-"` — **KEPT** (licence prefix preserved)

### 4.10 [`server/licenceServer.ts`](server/licenceServer.ts:1)
- **No changes** — licence server logic preserved

---

## Phase 5: Client-Side Storage Keys & DOM Events (With Migration)

### Migration Strategy
For localStorage keys, implement a **read-old/write-new** pattern:
1. On read: check new key first, fall back to old key, then migrate the value
2. On write: always write to new key, also clear old key
3. This ensures existing sessions survive the upgrade

For DOM events, implement **dual-dispatch** during transition:
1. Dispatch both old (`jpos:*`) and new (`masepos:*`) event names
2. Listen on new event names only
3. This ensures companion devices and cross-tab communication don't break

### 5.1 [`src/api.ts`](src/api.ts:13)
- **Lines 13-15**: localStorage keys `jpos_access_token`, `jpos_refresh_token`, `jpos_user` → `masepos_access_token`, `masepos_refresh_token`, `masepos_user`
- **Line 17**: `window.dispatchEvent(new Event('jpos:auth-cleared'))` → dispatch both `jpos:auth-cleared` AND `masepos:auth-cleared`
- **Line 25**: `localStorage.getItem('jpos_refresh_token')` → migrate: try `masepos_refresh_token` first, fall back to `jpos_refresh_token`
- **Lines 40-41**: Write to new keys, clear old keys

### 5.2 [`src/hooks/useAuth.ts`](src/hooks/useAuth.ts:52)
- **Lines 52-54**: `KEYS` object — update to `masepos_*` keys
- **Line 75**: `tenantName: user.tenantName || "Jimmy's POS"` → `tenantName: user.tenantName || "MasePOS"`
- **Line 129**: `window.dispatchEvent(new Event('jpos:auth-cleared'))` → dispatch both
- **Line 180**: Listen on `masepos:auth-cleared` (and keep `jpos:auth-cleared` for transition)

### 5.3 [`src/hooks/useSocket.ts`](src/hooks/useSocket.ts:41)
- **Line 41**: `localStorage.getItem('jpos_access_token')` → migrate: try `masepos_access_token` first, fall back to `jpos_access_token`

### 5.4 [`src/App.tsx`](src/App.tsx:150)
- **Line 150**: `window.addEventListener('jpos:companion-state', handler)` → listen on `masepos:companion-state`
- **Line 155**: `new CustomEvent('jpos:companion-state-request')` → dispatch both
- **Line 164**: `new CustomEvent('jpos:companion-mode-change', ...)` → dispatch both
- **Line 173**: `new CustomEvent('jpos:companion-mark-terminal')` → dispatch both
- **Line 307**: `new CustomEvent('jpos:companion-open-scanner')` → dispatch both
- **Line 619**: `new CustomEvent('jpos:account-terminal-presence', ...)` → dispatch both
- **Line 626**: `new CustomEvent('jpos:companion-state', ...)` → dispatch both
- **Line 630**: `window.addEventListener('jpos:account-terminal-presence-request', ...)` → listen on `masepos:account-terminal-presence-request`
- **Line 641**: `new CustomEvent('jpos:companion-state', ...)` → dispatch both
- **Line 696**: `if (message.type === 'jpos-push-notification')` → check both `jpos-push-notification` AND `masepos-push-notification`
- **Line 699**: `if (message.type === 'jpos-notification-open' ...)` → check both
- **Line 1110**: `"Jimmy's POS"` → `"MasePOS"`
- **Line 1418**: `"Install Jimmy's POS"` → `"Install MasePOS"`

### 5.5 [`src/views/PointOfSaleView.tsx`](src/views/PointOfSaleView.tsx:103)
- **Line 103**: `localStorage.getItem('jpos-terminal-category-layout')` → migrate pattern
- **Line 376-383**: Event listeners — update to `masepos:*` names
- **Line 397-405**: Event dispatchers — dispatch both old and new
- **Line 444**: `new CustomEvent('jpos:companion-state', ...)` → dispatch both
- **Line 722**: `localStorage.setItem('jpos-terminal-category-layout', ...)` → write to new key

### 5.6 [`src/utils/offlineSales.ts`](src/utils/offlineSales.ts:39)
- **Line 39**: `const QUEUE_EVENT = 'jpos:offline-sales-changed'` → `const QUEUE_EVENT = 'masepos:offline-sales-changed'`
- **Line 46**: `\`jpos-offline-sales:v${QUEUE_VERSION}:${tenantId}\`` → `\`masepos-offline-sales:v${QUEUE_VERSION}:${tenantId}\``
- **Line 63**: `\`jpos-offline-device:${tenantId}:${staffId || 'staff'}\`` → `\`masepos-offline-device:${tenantId}:${staffId || 'staff'}\``
- **Line 72**: `\`jpos-offline-receipt-seq:${tenantId}:${deviceId}\`` → `\`masepos-offline-receipt-seq:${tenantId}:${deviceId}\``
- **Add migration**: on read, check new key first, fall back to old key

---

## Phase 6: UI Components — All React Views & Components

### 6.1 [`src/components/WelcomeView.tsx`](src/components/WelcomeView.tsx:1)
- **Line 98**: `'Install Jimmy\'s POS on desktop...'` → `'Install MasePOS on desktop...'`
- **Line 205**: `'Use Jimmy\'s POS from desktop...'` → `'Use MasePOS from desktop...'`
- **Line 563**: `Jimmy's POS works from any modern browser...` → `MasePOS works from any modern browser...`
- **Line 689**: `<p>Jimmy's POS</p>` → `<p>MasePOS</p>`
- **Line 739**: `See what Jimmy's POS actually does...` → `See what MasePOS actually does...`
- **Line 742**: `Jimmy's POS is for businesses...` → `MasePOS is for businesses...`
- **Line 794**: `Jimmy's POS is built for that` → `MasePOS is built for that`
- **Line 1028**: `<p>Jimmy's POS</p>` → `<p>MasePOS</p>`

### 6.2 [`src/components/LoginModal.tsx`](src/components/LoginModal.tsx:86)
- **Line 86**: `Sign in to your Jimmy's POS account` → `Sign in to your MasePOS account`

### 6.3 [`src/components/Receipt.tsx`](src/components/Receipt.tsx:42)
- **Line 42**: `|| "JIMMY'S POS"` → `|| "MASEPOS"`

### 6.4 [`src/components/BillPrint.tsx`](src/components/BillPrint.tsx:41)
- **Line 41**: `|| "JIMMY'S POS"` → `|| "MASEPOS"`

### 6.5 [`src/components/SettingsView.tsx`](src/components/SettingsView.tsx:535)
- **Line 535**: `(formData.business?.name || 'JPOS')` → `(formData.business?.name || 'MASEPOS')`
- **Line 541**: `const jimmyPosLogoUrl = '/icons/icon-512.png'` → `const masePosLogoUrl = '/icons/icon-512.png'`
- **Line 745**: `onClick={() => setFormData({...formData, business: {...formData.business, logoUrl: jimmyPosLogoUrl}})}` → use `masePosLogoUrl`
- **Line 748**: `Use Jimmy's POS` → `Use MasePOS`
- **Line 1551**: `|| "JIMMY'S POS"` → `|| "MASEPOS"`
- **Line 1602**: `|| "JIMMY'S POS"` → `|| "MASEPOS"`

### 6.6 [`src/views/ClientPortalView.tsx`](src/views/ClientPortalView.tsx:111)
- **Line 111**: `|| "Jimmy's POS"` → `|| "MasePOS"`

### 6.7 [`src/views/PublicPackagesPage.tsx`](src/views/PublicPackagesPage.tsx:23)
- **Line 23**: `'mailto:sales@jimmyspos.com?subject=JPOS%20White-label%20package'` → `'mailto:sales@masepos.com?subject=MasePOS%20White-label%20package'`
- **Line 35**: `<p>Jimmy's POS</p>` → `<p>MasePOS</p>`

### 6.8 [`src/views/DevDashboard.tsx`](src/views/DevDashboard.tsx:155)
- **Line 155**: `'mailto:dev@jimmyspos.local'` → `'mailto:dev@masepos.local'`
- **Line 236**: `'mailto:dev@jimmyspos.local'` → `'mailto:dev@masepos.local'`
- **Line 620**: `\`jimmys-pos-export-${Date.now()}.json\`` → `\`masepos-export-${Date.now()}.json\``

### 6.9 [`src/views/ManagerActionCenterView.tsx`](src/views/ManagerActionCenterView.tsx:232)
- **Line 232**: `result.filename || 'jimmy-pos-activity.csv'` → `result.filename || 'masepos-activity.csv'`

### 6.10 [`src/components/PackagesPricing.tsx`](src/components/PackagesPricing.tsx:27)
- **Line 27**: `how you want to run JPOS` → `how you want to run MasePOS`

---

## Phase 7: Documentation

### 7.1 [`README.md`](README.md:1)
- Update title and any references from "Jimmy's POS" to "MasePOS"

### 7.2 [`DOCKER.md`](DOCKER.md:1)
- **Line 1**: `# Docker Setup for Jimmy's POS` → `# Docker Setup for MasePOS`
- **Line 3**: `run Jimmy's POS using Docker` → `run MasePOS using Docker`
- **Lines 52, 58, 65**: Container names → `masepos-db`, `masepos-app`, `masepos-nginx`
- **Line 110**: `docker exec -it jimmy-pos-db mysql...` → `docker exec -it masepos-db mysql...`
- **Line 115**: `docker exec jimmy-pos-app npm run db:init` → `docker exec masepos-app npm run db:init`
- **Line 132**: `DB_DATABASE | jimmy_pos` — **KEPT**
- **Line 149**: `docker exec jimmy-pos-app mysql...` → `docker exec masepos-app mysql...`
- **Line 225**: `docker exec jimmy-pos-db mysqldump...` → `docker exec masepos-db mysqldump...`
- **Line 230**: `docker exec -i jimmy-pos-db mysql...` → `docker exec -i masepos-db mysql...`
- **Line 249**: `docker volume ls | grep jimmy` → `docker volume ls | grep mase`
- **Line 256-257**: Container names → `masepos-app`
- **Line 262**: `docker build -t jimmy-pos:v1.0 .` → `docker build -t masepos:v1.0 .`
- **Line 267**: `docker tag jimmy-pos:v1.0 yourusername/jimmy-pos:v1.0` → `docker tag masepos:v1.0 yourusername/masepos:v1.0`
- **Line 268**: `docker push yourusername/jimmy-pos:v1.0` → `docker push yourusername/masepos:v1.0`

### 7.3 [`Implementation Plan/implementation_plan.md`](Implementation%20Plan/implementation_plan.md:1)
- **Line 1**: `# Jimmy POS Master Todo` → `# MasePOS Master Todo`
- **Line 5**: `Jimmy POS implementation work` → `MasePOS implementation work`
- **Line 25**: `Jimmy POS` → `MasePOS`
- **Line 177**: `Jimmy POS` → `MasePOS`

### 7.4 [`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md:1)
- **Line 1**: `# Security Checklist - Jimmy's POS` → `# Security Checklist - MasePOS`

### 7.5 Other Markdown Files
- [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md): Update title references
- [`SECURITY_IMPLEMENTATION_SUMMARY.md`](SECURITY_IMPLEMENTATION_SUMMARY.md): Update title references
- [`PHASE2_AUTH_SUMMARY.md`](PHASE2_AUTH_SUMMARY.md): Update references
- [`PHASE2_COMPLETE_SUMMARY.md`](PHASE2_COMPLETE_SUMMARY.md): Update references
- [`PHASE2_INTEGRATION_STEPS.md`](PHASE2_INTEGRATION_STEPS.md): Update references
- [`MIGRATION_STATUS.md`](MIGRATION_STATUS.md): Update references

---

## Phase 8: Tests

### 8.1 [`tests/e2e/pos.spec.ts`](tests/e2e/pos.spec.ts:5)
- **Line 5**: `await expect(page).toHaveTitle(/Jimmy's POS/)` → `await expect(page).toHaveTitle(/MasePOS/)`

### 8.2 [`tests/frontend/WelcomeView.test.tsx`](tests/frontend/WelcomeView.test.tsx:36)
- **Line 36**: `screen.getByText(/See what Jimmy's POS actually does/i)` → `screen.getByText(/See what MasePOS actually does/i)`

### 8.3 [`tests/backend/action-center.test.ts`](tests/backend/action-center.test.ts:219)
- **Line 219**: `expect(result.filename).toMatch(/jimmy-pos-activity-.../)` → `expect(result.filename).toMatch(/masepos-activity-.../)`

### 8.4 [`tests/backend/licence.test.ts`](tests/backend/licence.test.ts:21)
- **Line 21**: `"generates self-contained signed JPOS licence keys"` → `"generates self-contained signed MasePOS licence keys"`
- **Line 25**: `expect(key.startsWith("JPOS-")).toBe(true)` — **KEPT** (licence prefix preserved)

---

## Phase 9: Scripts, Nginx Configs & Database Schema Comments

### 9.1 [`scripts/setup-dev-user.mjs`](scripts/setup-dev-user.mjs:17)
- **Line 17**: `const TENANT_NAME = 'Jimmy\'s POS Dev'` → `const TENANT_NAME = 'MasePOS Dev'`

### 9.2 [`scripts/setup-dev-user-with-password.mjs`](scripts/setup-dev-user-with-password.mjs:33)
- **Line 33**: `const TENANT_NAME = "Jimmy's POS Dev"` → `const TENANT_NAME = "MasePOS Dev"`

### 9.3 [`scripts/setup-dev-user.sql`](scripts/setup-dev-user.sql:5)
- **Line 5**: `SELECT 'dev-tenant-001', 'Jimmy\'s POS Dev'` → `SELECT 'dev-tenant-001', 'MasePOS Dev'`

### 9.4 [`nginx/nginx-windows.conf`](nginx/nginx-windows.conf:22)
- **Line 22**: `root "c:/Users/Phoenix/Downloads/jimmy's-pos/dist"` → `root "c:/Users/Phoenix/Downloads/jims-pos/dist"` (match actual directory name)

### 9.5 [`db/schema.sql`](db/schema.sql:1)
- **Line 1**: `-- MariaDB schema for Jimmy's POS` → `-- MariaDB schema for MasePOS`
- **Line 537**: `'mailto:dev@jimmyspos.local'` → `'mailto:dev@masepos.local'`

### 9.6 [`db/schema.postgres.sql`](db/schema.postgres.sql:1)
- **Line 1**: `-- Postgres schema for Jimmy's POS (Supabase)` → `-- Postgres schema for MasePOS (Supabase)`
- **Line 521**: `'mailto:dev@jimmyspos.local'` → `'mailto:dev@masepos.local'`

---

## Phase 10: Final Verification

Run a comprehensive grep across the entire codebase to ensure no old branding remains:

```powershell
# Check for remaining "Jimmy" references (should only be in DB name and legacy migration code)
Get-ChildItem -Recurse -Include *.ts,*.tsx,*.js,*.mjs,*.json,*.html,*.md,*.yml,*.yaml,*.conf,*.sql,*.css | Select-String -Pattern "(?i)jimmy|jim.s" | Where-Object { $_ -notmatch "jimmy_pos" -and $_ -notmatch "node_modules" -and $_ -notmatch "\.git" }

# Check for remaining "jpos" references (should only be in env vars, licence prefix, and package catalog identifiers)
Get-ChildItem -Recurse -Include *.ts,*.tsx,*.js,*.mjs,*.json,*.html,*.md,*.yml,*.yaml,*.conf,*.sql,*.css | Select-String -Pattern "(?i)jpos" | Where-Object { $_ -notmatch "JPOS_HOSTED|JPOS_REQUIRE|JPOS_LICENCE|JPOS_PACKAGE|jpos_branding|jimmy_pos|node_modules|\.git" }
```

---

## Migration Safety Checklist

| Area | Risk | Mitigation |
|------|------|------------|
| localStorage keys | Users logged out after deploy | Read-old/write-new migration pattern |
| DOM custom events | Companion devices lose sync | Dual-dispatch both old and new event names |
| Database name | Data loss | **NOT CHANGED** — `jimmy_pos` preserved |
| Licence keys | All licences invalidated | **NOT CHANGED** — `JPOS-` prefix preserved |
| Env vars | Deployment configs break | **NOT CHANGED** — `JPOS_*` vars preserved |
| API routes | 404 errors | **NOT CHANGED** — no route changes |
| Package catalog IDs | Billing/licencing breaks | **NOT CHANGED** — identifiers preserved |

---

## Execution Order

Phases should be executed in order (1→10) because:
1. Config files (Phase 1) are the foundation
2. PWA (Phase 2) depends on config
3. Shared catalog (Phase 3) is imported by both server and client
4. Server (Phase 4) and Client storage (Phase 5) can be done in parallel
5. UI (Phase 6) is the largest surface area
6. Docs (Phase 7) and Tests (Phase 8) come after implementation
7. Scripts/DB (Phase 9) are low-risk cleanup
8. Verification (Phase 10) is the final sweep

Each phase is self-contained and can be verified independently before moving to the next.
