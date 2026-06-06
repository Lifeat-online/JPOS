# MasePOS

**MasePOS** is a cloud-native, multi-tenant Point of Sale for restaurants, cafés, and retail counters. It runs on Node.js 22, MariaDB or Postgres, and ships as a PWA that installs on Android, iOS, and desktop.

> Live deployment: **https://masepos.co.za**

## Quick start (local Docker stack)

```bash
cp .env.docker .env.docker.local
# edit secrets in .env.docker.local (DB password, JWT_SECRET, PayFast keys, etc.)
docker compose up -d
# open http://localhost
```

See **[DOCKER.md](DOCKER.md)** for the full guide, troubleshooting, backups, and production deploy notes.

## Quick start (bare Node)

```bash
npm install
cp .env.example .env
# set DB_HOST/DB_USER/DB_PASSWORD/DB_DATABASE and JWT_SECRET
npm run db:init   # creates schema and seed (no real PII — see db/schema.sql)
npm run dev       # http://localhost:3000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite + Express on port 3000 with HMR |
| `npm run build` | Production build to `dist/` |
| `npm start` | Run the production server |
| `npm run lint` | TypeScript typecheck (`tsc --noEmit`) |
| `npm test` | Run unit + API test suites |
| `npm run test:unit` | Vitest unit tests only |
| `npm run test:api` | Backend API tests only |
| `npm run test:e2e` | Playwright e2e |
| `npm run db:init` | Apply the schema to a fresh database |
| `npm run smoke:stocktake` | Stocktake end-to-end smoke test |
| `npm run ops:verify-endpoint` | Validate production HTTPS, TLS, security headers, and `/api/health` |

## Architecture

- **Frontend:** React 19, Vite 6, Tailwind 4, zustand, recharts, html5-qrcode, vite-plugin-pwa
- **Backend:** Express 4 (ESM), mysql2 / pg, JWT (jsonwebtoken), bcryptjs, zod, web-push
- **Realtime:** socket.io (deps installed, used by pole-display / multi-terminal presence; falls back to polling if disabled)
- **Payments:** PayFast (webhook at `POST /api/payfast/notify`), plus card terminal, BNPL, and QR providers via the `paymentProviderBoundary` shim
- **Storage:** MariaDB 11 or Postgres 14+; schema in `db/schema.sql` and `db/schema.postgres.sql`

## Mobile/API clients

The browser app defaults to same-origin `/api` calls, but mobile shells and
separate frontends can point at a hosted backend with:

```env
VITE_DEPLOYMENT_MODE="cloud"
VITE_API_BASE_URL="https://masepos.co.za"
VITE_SOCKET_URL="https://masepos.co.za"
CORS_ORIGINS="https://masepos.co.za,capacitor://localhost,ionic://localhost"
```

Hybrid cloud/on-prem deployments can set a local store server and cloud backend:

```env
VITE_DEPLOYMENT_MODE="hybrid"
VITE_ON_PREM_API_BASE_URL="http://pos-box.local:8080"
VITE_CLOUD_API_BASE_URL="https://masepos.co.za"
VITE_SOCKET_URL=""
```

In hybrid mode, safe reads use the selected Settings > Connection target first
and fail over for transient target outages. Mutations stay on the selected
primary target so cash/card sales can enter the offline queue instead of being
silently written to a different environment.

See **[docs/mobile-app-api.md](docs/mobile-app-api.md)** for the API contract,
auth flow, Socket.IO events, offline-sale replay model, and implementation
checklist for a mobile coding agent.

## Project layout

```
server/          Express app, route handlers, repos, auth
src/             React app
shared/          Types & zod schemas shared by client and server
db/              Schema SQL + migrations
nginx/           nginx configs (Docker, dev, Windows)
tests/           Vitest + Playwright
scripts/         Dev/CI helpers (no one-off patches)
Implementation Plan/   Active roadmap and todo (single source of truth)
```

## Security

- Auth uses JWT access tokens (8h) + refresh tokens (7d, stored hashed server-side with rotation).
- Sensitive actions (refund / void / cash movement / no-sale / discount override / stock adjustment / settings change) require a manager PIN/password re-auth.
- All state-changing endpoints are audit-logged to `audit_events`.
- PayFast signature verification is done over the raw form body in canonical order with `crypto.timingSafeEqual`.
- bcrypt cost is 12 (`bcryptjs` — see `server/auth-handler.ts`); migrating to native `bcrypt` is on the roadmap.

See **[Implementation Plan/implementation_plan.md](Implementation%20Plan/implementation_plan.md)** for the active security, PCI, and POPIA work, and the audit-driven hardening backlog.

## Licence & hosted mode

- **Self-hosted Docker** (default): free tier, all packages, no licence required.
- **Hosted (Hetzner / masepos.co.za):** packages enforced via a signed licence key; admin endpoints gated on `JPOS_HOSTED=true`. See `server/licenceServer.ts` and `server/licenceMiddleware.ts`.
- The Docker image and the Hetzner/Coolify build both use the same `server.ts` entry point.

## Contributing

1. Fork / branch from `master`.
2. Make changes; ensure `npm run lint` and `npm test` pass.
3. Open a PR — CI runs lint, unit, API, and a Vite production build.
4. New server modules: add a co-located test under `tests/backend/` (or `tests/frontend/` for React).

## License

Proprietary — © MasePOS / Lifeat Online. All rights reserved.
