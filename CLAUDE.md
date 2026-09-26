# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Chessplain (getchessplain.com) turns a chess game into a short review of the few moments that decided it. pnpm monorepo: `apps/web` (Next.js 16 / React 19 / Tailwind, deployed to Cloudflare Workers) and `apps/engine` (Fastify API + analysis worker with Stockfish, an LLM and Supabase, deployed to a VPS). Schema lives in `supabase/migrations`.

## Commands

```bash
pnpm typecheck                                   # tsc in both apps
pnpm test                                        # engine Vitest suite (web has no unit tests)
pnpm build                                       # production build of both apps
pnpm --filter @chessplain/engine exec vitest run test/quota.test.ts   # one test file
pnpm --filter @chessplain/engine exec vitest run -t "name"            # tests by name

pnpm --filter @chessplain/engine dev             # API + worker on :8080
pnpm --filter @chessplain/web dev                # site on :3000
pnpm --filter @chessplain/web test:viewport      # layout audit across page/width combinations

pnpm --filter @chessplain/web build:worker && pnpm --filter @chessplain/web deploy:worker   # deploy web
node apps/engine/scripts/verify-deployment.mjs https://api.getchessplain.com              # API smoke check
pnpm --filter @chessplain/engine verify:20       # live acceptance gate; spends real LLM tokens
pnpm --filter @chessplain/engine benchmark:models   # model benchmark over benchmark/fixtures.json
```

Engine deploy (VPS `london-ampere`, systemd `chessplain-engine`) is documented in `docs/ENGINE_DEPLOYMENT.md`: fast-forward to the reviewed commit, install with the lockfile, build, test, restart. Don't use `git reset --hard` there.

## Architecture

**Request flow.** The browser never touches the database. It signs in with Supabase (passwordless magic link, PKCE) and calls the engine over HTTP with the Supabase access token as `Bearer`; the engine verifies it with `supabase.auth.getUser` and uses the service-role key for all table access. All tables have RLS on with no anon/authenticated policies, deliberately (see `supabase/migrations/20260831000000_baseline_schema.sql`).

**Queue.** The username path first lists the player's 10 most recent standard games (`GET /api/chesscom/:username/games`); the player picks one. `POST /api/reports` (`apps/engine/src/http/server.ts`) fetches that game (`chesscom_game_url`, default latest) and rejects unknown usernames with a 400. It then enforces the free quota (2 reports per 7 days, keyed by `user_id` when signed in, else client IP; premium is never blocked), inserts `source_games` + `game_analyses` rows, and returns. The worker (`src/queue/worker.ts`, started in-process unless `WORKER_ENABLED=false`) claims rows from `game_analyses`, runs the pipeline, retries, then marks `failed`. Failed rows and completed reports with no moments don't count against quota. The report page streams progress from `GET /api/reports/:id/events` (SSE).

**Pipeline** (`src/analysis/pipeline.ts`), in order:
1. `pgn.ts` parses the PGN and identifies the player.
2. `sweep.ts` does a fast Stockfish pass over every position (cached in `analysis_cache`).
3. `select.ts` picks candidate moments and builds refutation lines (extended up to 2 plies to finish capture sequences).
4. `verify.ts` re-checks candidates at depth and drops false positives.
5. `explain.ts` asks the LLM for each moment's explanation, then a game summary.

If every moment falls back to generic text, or credits run out, the pipeline throws `LlmUnavailableError` rather than publish a degraded "completed" report.

**Grounding rule.** Explanations must rest on code-verified facts from `src/analysis/chess-facts.ts` (per-move annotations of the refutation line, mate threats, why escapes fail, mate geometry), which are passed into the prompt. `validateMomentJson` rejects output that breaks the contract (word limits, first-person mind-reading). Never let the model's own chess claims stand in for these facts.

**Prompt changes.** `src/analysis/prompts.ts` carries `PROMPT_VERSION`; bump it on any prompt change and mirror the prompt in `docs/MOMENT_PROMPT.md`. Quality claims come from the benchmark harness (`scripts/benchmark-models.ts`, results in `apps/engine/benchmark/results/`), not from reading a few outputs.

**LLM provider.** The engine uses the `openai` SDK against an OpenAI-compatible endpoint (production: OpenRouter, `openai/gpt-6-luna`). Endpoint, model and key come from `/etc/chessplain/engine.env` on the VPS; `reasoning_effort: 'none'` is set in `explain.ts`.

**Billing.** Stripe Checkout/Portal via the engine; `POST /api/billing/webhook` sets `profiles.subscription_tier`. A trigger (`on_auth_user_created`) creates the `profiles` row the webhook updates, so a missing profile means a paying user is silently never upgraded.

**Web.** `apps/web/lib/supabase.ts` sets `detectSessionInUrl: false` on purpose: `/auth/callback` owns the code exchange, and letting the client do it too shows a sign-in error to a signed-in user. Square names in explanation text become colored chips linked to board highlights (`lib/squares.ts`, `components/SquareText.tsx`).

## Constraints

- **Production database, no staging.** A local engine pointed at production must run with `WORKER_ENABLED=false`, or it will consume real queued jobs.
- **Migrations:** production has migration history absent from this repo. Don't blindly `supabase db push` or mark migrations applied; see the migration warning in `docs/LAUNCH_CHECKLIST.md`. That history includes constraints the repo schema lacks: `UNIQUE (user_id, source, external_id)` on `source_games` and `UNIQUE (source_game_id)` on `game_analyses`. So there's one report per game per signed-in user: `external_id` is the Chess.com game URL, and `POST /api/reports` returns the existing report on resubmit.
- **No default credentials.** Missing config fails at startup by design (`src/config.ts`, `apps/web/lib/supabase.ts`).
- **Web on Workers:** load fonts with `<link>`/`@import`, not `next/font/google`. `patches/` carries required patches for `next` and `@opennextjs/cloudflare`.
- **Auth email templates** are sourced from `supabase/templates/` and pasted into the Supabase dashboard; the auth server keeps sending the old template for ~10 minutes after a save. Mail goes out through Resend SMTP from `mail.getchessplain.com`.
- **Design system:** "The Forensic Match Report" in `apps/web/DESIGN.md` (graphite `#111310`, Signal Lime `#c9f36d` for actions/insight, Mistake Coral `#ff725c` for blunders, IBM Plex). Product intent is in `apps/web/PRODUCT.md`, which wins when docs disagree about intent; the code wins on facts.

## Docs

`docs/LAUNCH_CHECKLIST.md` is the source of truth for production state and remaining launch gates. `docs/ANALYSIS_QUALITY_ROADMAP.md` covers analysis-quality work and benchmarks. `plans/` and `docs/archive/` are historical records, not instructions.
