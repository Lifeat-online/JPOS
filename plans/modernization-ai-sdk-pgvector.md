# Modernization Plan — TS Stack Upgrade, AI SDK, pgvector

**Status:** Draft plan · **Date:** 2026-07-12 · **Branch:** `claude/laravel-13-postgres-vector-aevyds`

## Context

JPOS/MasePOS is a **Node.js 22 + React 19 + Express + Vite** TypeScript app on
**PostgreSQL** (via `pg` + Kysely). It already has extensive AI integration in
`server/ai.ts` (~124KB) that talks to OpenAI, Gemini, Vertex, OpenRouter,
Ollama, and AnythingLLM through hand-rolled `fetch()` calls.

This plan modernizes that stack in place — **no framework rewrite**. Three
independent workstreams, sequenced so each is shippable on its own.

---

## Workstream A — Version upgrades

Goal: current tooling + supported runtimes, no behavior change.

| Package | From | To | Risk |
|---|---|---|---|
| `vite` | 6.2 | 8.x | Med — config/plugin API, PWA plugin compat |
| `@vitejs/plugin-react` | 5.x | latest | Low |
| `vite-plugin-pwa` | 1.3 | latest | Med — verify SW/manifest output |
| `@tailwindcss/vite` | 4.1 | latest | Low |
| `kysely` | 0.27 | 0.29 | Low — type-only tweaks |
| `react` / `react-dom` | 19.0 | 19.2 | Low |
| `express` | 4.21 | 5.x | **High — deferred to its own PR** |
| `vitest` / `@vitest/ui` | 4.1 | latest | Low |

**Steps**
1. Branch, bump devDeps first (Vite, plugins, vitest), run `npm run build` +
   `npm run test:unit` + `npm run test:e2e`.
2. Fix Vite 7→8 config breaks in `vite.config.ts` (env handling, `build.target`,
   plugin option renames). Confirm PWA service worker still emits.
3. Bump Kysely + React patch, re-run `npm run lint` (`tsc --noEmit`).
4. **Express 5 is a separate PR** — breaking router/middleware changes across
   `server/app.ts` (52KB) + `server/routes/*`; async error handling changes.
   Do not bundle with the Vite bump.

**Exit:** green `build`, `lint`, `test:unit`, `test:api`, `test:e2e`; PWA installs.

---

## Workstream B — Adopt the Vercel AI SDK

Goal: replace the per-provider `fetch` dispatch in `server/ai.ts` with one
unified SDK — streaming, tool-calling, structured output, image/file input —
without changing the public functions the rest of the app calls.

**Keep the seams that already exist** (do not touch callers):
- `getAiSettings` / `saveAiSettings` / `serializeAiSettings`
- `generateInsights`, `generateStaffScores`, `extractInvoiceWithAi`
- `AiSettings`, `AiProviderName`, role-gating middleware

**Replace the internals:**
- `callOpenAi`, `callOpenAiWithFiles`, `callOpenAiText`
- `callGoogleWithFiles`, `callVertexWithFiles`
- `callOpenRouterWithImages`, `callOllama*`, AnythingLLM path
- `callProviderForInsights`, `callProviderForStaffScores`

**Steps**
1. Add deps: `ai`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/openai-compatible`
   (covers OpenRouter + Ollama + AnythingLLM via OpenAI-compatible endpoints),
   `@ai-sdk/google-vertex`.
2. New module `server/aiProvider.ts`: `resolveModel(settings) -> LanguageModel`
   — maps `AiSettings.provider`/`model`/`apiKey`/`baseUrl` to the right
   `@ai-sdk/*` factory. Single place that owns provider selection.
3. Rewrite the dispatch functions to call `generateText` / `generateObject`
   (use `generateObject` + a Zod schema for insights & staff scores — you
   already use Zod 4). Feed images/docs through the SDK's file-part message API.
4. Preserve OpenRouter key/model normalization and the friendly auth-error
   guidance (`openRouterAuthGuidance`, `normalizeOpenRouterModel`).
5. Optional: stream the `AiCopilotView` responses via `streamText` (frontend
   `src/views/AiCopilotView.tsx`) for a better UX.
6. Update `.env.example` provider notes; keep secrets server-side.

**Testing:** unit tests around `resolveModel`; a mocked-SDK contract test per
provider for `generateInsights` / `extractInvoiceWithAi`. Manual "Send test"
per provider via existing `testAiProviderContact`.

**Exit:** every provider path works through the SDK; `server/ai.ts` shrinks
substantially; no route/frontend changes required.

---

## Workstream C — pgvector + embeddings

Goal: semantic search + retrieval so AI features are faster and smarter
(RAG over products/customers, semantic product lookup, better inventory agent).

**Prereqs:** Postgres with the `vector` extension (Supabase has it built in;
self-hosted needs `pgvector` installed in the image — update `Dockerfile` /
`docker-compose.yml`).

**Steps**
1. Migration (idempotent, mirror `db/schema.postgres.sql` style):
   - `CREATE EXTENSION IF NOT EXISTS vector;`
   - `ALTER TABLE products ADD COLUMN embedding vector(1536);` (dim matches the
     chosen embedding model, e.g. OpenAI `text-embedding-3-small` = 1536).
   - Optional `product_embeddings` side table if we want to keep `products`
     lean / support multiple embedding sources.
   - `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);`
2. Add `embed`/`embedMany` (from the `ai` SDK) in `server/aiProvider.ts`;
   add `pgvector` npm pkg for `pg` type (de)serialization.
3. Backfill job (`scripts/backfill-embeddings.ts`) + write path: (re)embed a
   product on create/update in `server/db-crud.ts`.
4. Query helpers in `server/db-adapter.ts`:
   `searchProductsBySimilarity(tenantId, queryEmbedding, k)` using
   `ORDER BY embedding <=> $1 LIMIT k`, always tenant-scoped.
5. Wire into: semantic product search (POS), and RAG context for
   `aiInventoryAgent.ts` / `generateInsights`.

**Cost/perf notes:** embeddings are cheap and cached in-column; only re-embed
on text change. HNSW index keeps similarity queries sub-ms at this scale.

**Exit:** `vector` extension live, products embedded, tenant-scoped similarity
query returns sensible results, inventory agent uses retrieved context.

---

## Sequencing & PRs

1. **PR 1 — Vite/tooling upgrade** (Workstream A minus Express). Lowest risk,
   unblocks everything.
2. **PR 2 — AI SDK refactor** (Workstream B). Behavior-preserving.
3. **PR 3 — pgvector + embeddings** (Workstream C). Builds on B's `aiProvider`.
4. **PR 4 — Express 5** (optional, separate). Higher risk, isolate it.

Each PR keeps `build` + `lint` + `test:unit` + `test:api` green before merge.

## Open questions
- Which embedding model/provider is the default (drives vector dimension)?
- Self-hosted Postgres image — confirm we can add the `pgvector` extension, or
  is prod on Supabase/managed PG that already has it?
- Appetite for the Express 5 upgrade now, or defer indefinitely?
