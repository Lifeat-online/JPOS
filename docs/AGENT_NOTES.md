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
- `npm run ops:verify-endpoint -- --url https://masepos.co.za` passed HTTPS, TLS, security-header, app-response, and health checks on 2026-06-06 after deploy `bdba200`.
- Live `/api/packages` exposes the `local_server_sync` package feature for Business and White-label after Hetzner deploy `bdba200`.
- 2026-06-10: Commit `3f83ddf` (`fix(licensing): expose admin route when secrets configured`) was pushed and deployed to Hetzner/Coolify.
- 2026-06-10: Coolify application `mkbgv2fpxb35n5z9kpe2hrm6` has hosted licence env enabled (`JPOS_HOSTED`, `LICENCE_SECRET`, `ADMIN_API_KEY`) and is running image tag `3f83ddf54dbe815eb477f5b70f7b0ba770bb497d`.
- 2026-06-10: Live `/api/admin/licence/generate` returns 401 without `x-admin-key`, proving the route is mounted and admin-key protected.
- 2026-06-10: A Business verification licence containing `local_server_sync` was generated through the live endpoint and immediately revoked successfully.
- 2026-06-10: The generated hosted licence admin handoff file is stored locally at `C:\tmp\masepos-licence-secrets-2026-06-10.txt`. Do not commit or print its contents.

## Workflow preference

- When the user says test/deploy/verify for this project, use the Hetzner VPS/live API path first.
- Do not switch to Railway or Windows assumptions unless the user says that is the target.
