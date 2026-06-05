# Jimmy POS Production Hardening Checklist

Last updated: 2026-06-05

Use this before every hosted or self-hosted production launch.

## Required Secrets

- Set a strong `JWT_SECRET`; never use a default or example value.
- Store database username, password, host, port, and database name outside source control.
- Store PayFast merchant ID, merchant key, and passphrase outside source control.
- Store AI provider keys, webhook/API keys, VAPID keys, and object-storage credentials outside source control.
- Rotate secrets after any accidental exposure, staff departure, or environment migration.

## TLS and Proxy

- Serve the public app only over HTTPS.
- Terminate SSL/TLS at the trusted host, reverse proxy, or load balancer.
- Redirect HTTP to HTTPS at the edge.
- Configure `TRUST_PROXY_HOPS` to the exact number of trusted proxies in front of the Node app.
- Verify HSTS is present in production responses.
- Set `CORS_ORIGINS` to an explicit comma-separated allowlist of trusted origins.

## Firewall and Network

- Expose only HTTP/HTTPS ingress required by the deployment platform.
- Do not expose the database publicly.
- Restrict database access to the app service and authorized maintenance hosts.
- Restrict admin consoles, database consoles, and container dashboards to authorized operators.
- Keep outbound provider endpoints available for PayFast, payment providers, push notifications, AI providers, and email/SMS providers.

## Database and Pooling

- Use production database credentials with least privilege for the app runtime.
- Enable connection pooling appropriate to the hosting platform.
- Apply current schema migrations/startup self-healing before opening traffic.
- Verify `staff.password_hash`, audit tables, stock tables, payment tables, security tables, integration tables, and hardware tables exist.
- Schedule encrypted backups and test restore before launch.
- Keep retention policies aligned with POPIA and business requirements.

## Encryption and Storage

- Use encrypted managed database/storage volumes where available.
- Keep backups encrypted at rest.
- Restrict backup download and restore permissions.
- Store uploaded or exported artifacts with access controls and expiry where possible.

## Runtime Security

- Keep `NODE_ENV=production`.
- Keep `AUTH_RATE_LIMIT_DISABLED` unset in production.
- Set production values for:
  - `API_RATE_LIMIT_PER_MIN`
  - `AUTH_RATE_LIMIT_WINDOW_MS`
  - `AUTH_RATE_LIMIT_MAX`
  - `SENSITIVE_ROUTE_RATE_LIMIT_WINDOW_MS`
  - `SENSITIVE_ROUTE_RATE_LIMIT_MAX`
  - `INTEGRATION_WEBHOOK_RATE_LIMIT_WINDOW_MS`
  - `INTEGRATION_WEBHOOK_RATE_LIMIT_MAX`
- Confirm security headers are present: CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, COOP, CORP, Referrer Policy, and Permissions Policy.
- Keep raw cardholder data out of Jimmy POS according to `docs/security-pci-boundary.md`.

## Monitoring and Logs

- Capture app stdout/stderr into a centralized log system.
- Preserve request IDs in reverse-proxy and app logs.
- Alert on repeated auth failures, rate-limit spikes, provider failures, webhook failures, schema initialization failures, and offline sync conflicts.
- Review structured security logs for redacted details rather than raw secret payloads.
- Rotate logs or configure retention so logs do not exhaust disk.

## SAST and Dependencies

- Run `npm.cmd run lint` before release.
- Run focused Vitest suites for changed surfaces.
- Run `npm audit --omit=dev` or the deployment platform's dependency scanner before release.
- Review dependency and container-image alerts in GitHub or the hosting platform.
- Treat high/critical runtime dependency alerts as release blockers unless explicitly waived.

## Operational Rollback

- Keep the previous deploy artifact or image available.
- Record any migrations or startup schema changes included in the release.
- Back up the database before irreversible production changes.
- If rollback requires database action, write the exact SQL or migration command before deploy.

## Launch Verification

- Run `npm run ops:verify-endpoint -- --url https://masepos.co.za`.
- Confirm `/api/health` returns `200`.
- Confirm login, token refresh, logout, and 2FA flows.
- Confirm checkout writes a completed sale and receipt without card PAN/CVV data.
- Confirm refund/void sensitive-action prompts.
- Confirm inventory stock adjustment and stocktake approval prompts.
- Confirm PayFast notify endpoint accepts only valid signed callbacks.
- Confirm manager reports export without raw secret or cardholder data.
- Confirm websocket/realtime connections work from the public domain.
