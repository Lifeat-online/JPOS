# Agent Notes

## Target environment

- The authoritative target for MasePOS/JPOS is the Hetzner VPS behind `https://masepos.co.za`.
- Do not keep configuring or testing against local Windows as the primary target unless the user explicitly asks for Windows-local work.
- Use local checks only as secondary safety checks before deploying to the VPS.
- For runtime verification, prefer live HTTPS/API checks against `https://masepos.co.za`.

## Current live checks

- `https://masepos.co.za/api/health` returns HTTP 200 with `{"status":"ok"}`.
- `https://www.masepos.co.za/api/health` returns HTTP 200 with `{"status":"ok"}`.
- `http://masepos.co.za/api/health` redirects to HTTPS.
- `npm run ops:verify-endpoint -- --url https://masepos.co.za` passed HTTPS, TLS, security-header, app-response, and health checks on 2026-06-06.
- Live `/api/packages` does not yet expose the `local_server_sync` package feature, so the local entitlement changes still need to be deployed to Hetzner.

## Workflow preference

- When the user says test/deploy/verify for this project, use the Hetzner VPS/live API path first.
- Do not switch to Railway or Windows assumptions unless the user says that is the target.
