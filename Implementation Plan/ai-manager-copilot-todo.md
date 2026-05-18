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
- [x] Phase 9: Provider contact test chat
- [x] Phase 10: Provider test error visibility

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
- [x] Add AI credentials test chat with optional media attachments.
- [x] Show detailed provider errors in the AI test chat instead of generic API wrapper messages.

## Blockers/risks

- OpenAI calls remain backend-only and optional when no API key is configured.
- AI features obey package and role permissions.
- V1 recommendations remain suggest-only.
- Settings background refresh now preserves in-progress AI provider/model browsing while the AI tab is open.
- Provider test chat sends the selected provider/model/key and optional image/document attachments for contact testing.
- Provider test failures now surface nested provider messages and metadata where available.

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
- AI credentials test chat with media attachments added after provider contact failures.
- `npm.cmd run lint` passed after provider test chat.
- `npx.cmd vitest run tests/backend/ai.test.ts tests/backend/api.test.ts` passed after provider test chat.
- `npm.cmd run build` passed after provider test chat with the existing Vite large-chunk warning.
- Provider test error visibility improved after generic `Provider returned error` report.
- `npm.cmd run lint` passed after provider error visibility fix.
- `npx.cmd vitest run tests/backend/ai.test.ts tests/backend/api.test.ts` passed after provider error visibility fix.
- `npm.cmd run build` passed after provider error visibility fix with the existing Vite large-chunk warning.
- Provider test now maps 429 errors to rate limit/quota/credits guidance and includes raw provider response for generic gateway errors.
- `npm.cmd run lint` passed after 429 guidance update.
- `npx.cmd vitest run tests/backend/ai.test.ts tests/backend/api.test.ts` passed after 429 guidance update.
- `npm.cmd run build` passed after 429 guidance update with the existing Vite large-chunk warning.
- Vertex AI blocked `aiplatform.googleapis.com GenerateContent` errors now get explicit Google Cloud remediation guidance and Gemini API-key fallback where possible.
- `npm.cmd run lint` passed after Vertex blocked API guidance update.
- `npx.cmd vitest run tests/backend/ai.test.ts tests/backend/api.test.ts` passed after Vertex blocked API guidance update.
- `npm.cmd run build` passed after Vertex blocked API guidance update with the existing Vite large-chunk warning.
