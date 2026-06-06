# Operational Rollback Notes

Use this runbook before production deploys that include database migrations, startup schema healing, payment/provider changes, AI workflow changes, or POS checkout changes.

## Pre-Deploy Gate

- Run `npm run ops:verify-schema` against the target production database before opening traffic.
- Run `npm run lint`, `npm run build`, and the focused tests listed in `Implementation Plan/implementation_plan.md` for the release slice.
- Take a database backup before irreversible schema changes or before running a live repair/init endpoint.
- Record the deploy artifact, Git commit, environment, database host, and operator in the release notes.
- Confirm `JWT_SECRET`, database credentials, PayFast credentials, provider keys, and licence variables are present in the target environment.

## Database Rollback

- Prefer forward-only repair migrations for additive columns, tables, and indexes.
- Restore from the pre-deploy backup only when data corruption, destructive migration, or incompatible schema state is confirmed.
- Before restoring, export the current failed state for investigation and pause write traffic if possible.
- Re-run `npm run ops:verify-schema` after restoring or repairing.
- Smoke test login, product load, customer load, checkout, refund/void, cash session, Action Center, and any touched integration route before reopening traffic.

## Application Rollback

- Roll back the application artifact or Hetzner/Coolify deployment first when the database remains backward-compatible.
- Keep the database on the newer additive schema unless the migration itself caused the incident.
- If a route contract changed, validate both browser flows and public API/mobile clients before declaring recovery.
- For payment-provider incidents, disable the provider integration or route traffic to cash/card-external fallback before rolling back data.

## Seed And Test Tenants

- Use `npm run seed:test-tenant -- --tenant test_tenant --mode restaurant --clear-first` to rebuild a restaurant-mode tenant for staging or production smoke testing.
- Use `--mode retail` when validating non-restaurant checkout, stock, loyalty, and customer workflows.
- The seed command creates the tenant/app settings, staff with password hashes, sample products, sample customers, sample sales, and restaurant tables through the same demo seed path used by the app.

## Do Not Roll Back When

- The only issue is a missing additive column that startup healing or `npm run db:init` can safely repair.
- The previous app version cannot read newer production data.
- Payment reconciliation, tax period locks, or audit trails would become inconsistent.
- A live incident can be isolated by disabling a provider, feature flag, package entitlement, or integration key.

## Verification After Recovery

- `GET /api/health` returns healthy.
- `npm run ops:verify-endpoint -- --url https://masepos.co.za` passes.
- Authenticated tenant routes load products, customers, staff, app config, and sales.
- A test checkout completes and writes sale items, payments, stock movements, and audit events.
- Manager views load Action Center, cash management, reports, inventory, and hardware/integration status where relevant.
- `npm run ops:verify-schema` passes against the recovered database.
