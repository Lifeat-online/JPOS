# Migration Note Archive

The active platform operations source of truth is `Implementation Plan/implementation_plan.md`, supported by:

- `docs/production-hardening-checklist.md`
- `docs/operational-rollback-notes.md`
- `scripts/verify-production-schema.ts`
- `scripts/seed-test-tenant.ts`

Older MariaDB/Nginx migration notes, historical phase files, and one-off deployment notes are archival unless they are re-verified against the current codebase and copied into the active implementation workstream.

## Archive Rule

- Do not use an older MariaDB/Nginx note as a launch checklist by itself.
- Re-check current `server/init-db.ts`, `db/schema.sql`, `db/schema.postgres.sql`, `Dockerfile`, `DOCKER.md`, and Railway environment settings before reusing old migration steps.
- If a historical note is still valid, copy the verified step into the implementation plan or a current docs runbook with the date, evidence, and command used.
- If a historical note conflicts with current code, keep it only as background context and follow the current schema verifier, rollback notes, and production hardening checklist.
