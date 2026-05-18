# AI Manager Copilot Todo

## Current status

Implementation complete. AI Manager Copilot now supports OpenAI, Ollama, AnythingLLM, Google Gemini, Vertex AI, and OpenRouter with fresh verification passed.

## Completed work

- [x] Phase 1: AI foundation
- [x] Phase 2: Database and API
- [x] Phase 3: Staff performance scoring
- [x] Phase 4: Manager Copilot insights
- [x] Phase 5: Frontend
- [x] Phase 6: Verification and cleanup
- [x] Phase 7: Multi-provider AI expansion
- [x] Phase 8: Provider model picker stability

## In progress

- None.

## Next up

- [x] Inspect current app wiring and data helpers.
- [x] Add AI schema tables to MySQL and Postgres.
- [x] Add tenant-scoped AI API routes.
- [x] Add deterministic staff scoring.
- [x] Add insight generation and persistence.
- [x] Add frontend AI settings, AI Copilot, dashboard strip, and staff score visibility.
- [x] Add focused tests and run verification.
- [x] Add local Ollama provider.
- [x] Add AnythingLLM provider.
- [x] Add Google Gemini provider.
- [x] Add OpenRouter provider.
- [x] Add provider configuration fields and environment documentation.
- [x] Prevent background Settings refresh from resetting AI provider/model selection while the AI tab is open.

## Blockers/risks

- OpenAI calls remain backend-only and optional when no API key is configured.
- AI features obey package and role permissions.
- V1 recommendations remain suggest-only.
- Settings background refresh now preserves in-progress AI provider/model browsing while the AI tab is open.

## Verification log

- Repo wiring inspected: `permissions.ts`, `App.tsx`, `api.ts`, `server/app.ts`, `server/init-db.ts`, and schema files.
- Backend AI module added with OpenAI-first provider fallback, deterministic staff scores, deterministic insights, persistence, and audit logging.
- AI schema added to MySQL/Postgres schema files and startup ensure logic.
- Tenant-scoped AI settings, insights, and staff-score API routes added behind auth, package, and role gates.
- Frontend AI Copilot view, dashboard insight strip, Settings AI controls, navigation, API helpers, and staff score display added.
- Focused AI staff scoring test added.
- `npm.cmd run lint` passed.
- `npx.cmd vitest run tests/backend/ai.test.ts tests/backend/api.test.ts` passed.
- `npm.cmd run build` passed with the existing Vite large-chunk warning.
- Provider expansion added after the original verification.
- `npm.cmd run lint` passed after provider expansion.
- `npx.cmd vitest run tests/backend/ai.test.ts tests/backend/api.test.ts` passed after provider expansion.
- `npm.cmd run build` passed after provider expansion with the existing Vite large-chunk warning.
- AI settings model picker stability fix added after user-reported reset while browsing models.
- `npm.cmd run lint` passed after model picker stability fix.
- `npm.cmd run build` passed after model picker stability fix with the existing Vite large-chunk warning.
