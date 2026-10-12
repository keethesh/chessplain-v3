# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Chessplain (getchessplain.com) finds the mistake a player keeps making: it scans their last 10 Chess.com games, names the recurring idea as a "gremlin" (a fixed, code-derived concept), explains one example on the board, lets them try the better move, and gives one check for their next game. Single-game reviews remain. Strategy and phases: `docs/STRATEGY.md`. pnpm monorepo: `apps/web` (Next.js 16 / React 19 / Tailwind, deployed to Cloudflare Workers) and `apps/engine` (Fastify API + analysis worker with Stockfish, an LLM and Supabase, deployed to a VPS). Schema lives in `supabase/migrations`.

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

**Request flow.** The browser never touches the database. It signs in with Supabase (Google OAuth or passwordless magic link, both PKCE) and calls the engine over HTTP with the Supabase access token as `Bearer`; the engine verifies it with `supabase.auth.getUser` and uses the service-role key for all table access. All tables have RLS on with no anon/authenticated policies, deliberately (see `supabase/migrations/20260831000000_baseline_schema.sql`).

**Scan.** The front door is `POST /api/scans` (`{ chesscom_username }`): the worker fetches the last 10 standard rapid/blitz/daily games (no bullet), runs sweep + select (`quietDriftFallback: false`, so "nothing decisive" is honest) + verify + `classifyMoment` per game, aggregates the top concept (counted once per game), and enqueues one example report (`hero_variant = 'scan'`, excluded from the review quota and rejected if a client sends it). `GET /api/scans/:id` is polled by `/scan/[id]`; `POST /api/scans/:id/checkin` records whether the player remembered the last check; `/claim` attaches an anonymous scan after sign-in. Free: 2 scans per 7 days (same key and lock as reports). No LLM in the scan itself. Scan jobs share the worker loops with reports, with lease heartbeats and attempt-guarded writes (`src/queue/scan-worker.ts`). A game whose analysis throws (e.g. a Stockfish timeout) is stored with `analyzed: false, error: true` and the scan completes over the games that were read; only when every game fails does the attempt retry. `GET /api/scans/:id` returns `previous` (the player's last scan that named a concept, with its counts) so the second scan can show the count against last time before asking whether the player remembered the check.

**Queue.** Single-game reviews: `GET /api/chesscom/:username/games` lists the 10 most recent rapid/blitz/daily games; the player picks one. `POST /api/reports` (`apps/engine/src/http/server.ts`) fetches that game (`chesscom_game_url`, default latest) and rejects unknown usernames with a 400. It then enforces the free quota (2 reports per 7 days, keyed by `user_id` when signed in, else client IP; premium is never blocked), inserts `source_games` + `game_analyses` rows, and returns. The worker (`src/queue/worker.ts`, started in-process unless `WORKER_ENABLED=false`) runs `WORKER_CONCURRENCY` job loops (default 2) that claim rows from `game_analyses` by compare-and-swap, run the pipeline, retry, then mark `failed`. Failed rows and completed reports with no moments don't count against quota. Resubmitting a game whose review failed less than 7 days ago re-queues it free and keeps its original `created_at`; an older failure goes through the quota check and gets a fresh date (otherwise it would be a free review that never counts). The report page streams progress from `GET /api/reports/:id/events` (SSE).

**Pipeline** (`src/analysis/pipeline.ts`), in order:
1. `pgn.ts` parses the PGN and identifies the player.
2. `sweep.ts` does a fast Stockfish pass over every position (cached in `analysis_cache`).
3. `select.ts` picks candidate moments and builds refutation lines (extended up to 2 plies to finish capture sequences).
4. `verify.ts` re-checks candidates at depth and drops false positives.
5. `concepts.ts` `classifyMoment` tags each verified moment with a `concept_id` (hanging_piece, double_attack, missed_mate_threat, weak_back_rank, losing_exchange for what the move allowed; missed_chance for a win the player had and did not play) or null when unsure; a wrong tag is worse than none. Accuracy is gated by `benchmark:concepts` on `benchmark/concepts/labelled.json`.
6. `explain.ts` asks the LLM for each moment's explanation (the prompt names the code concept), then a game summary.

If every moment falls back to generic text, or credits run out, the pipeline throws `LlmUnavailableError` rather than publish a degraded "completed" report.

**Grounding rule.** Explanations must rest on code-verified facts from `src/analysis/chess-facts.ts` (per-move annotations of the refutation line, mate threats, why escapes fail, mate geometry), which are passed into the prompt. The refutation line is what the move allowed, not what was played: `inGameFacts` (`pgn.ts`) sends the moves really played next as `in_the_game`, and only the part of the line the game followed may be told as an event. `validateMomentJson` rejects output that breaks the contract (word limits, first-person mind-reading). Never let the model's own chess claims stand in for these facts.

**Prompt changes.** `src/analysis/prompts.ts` carries `PROMPT_VERSION`; bump it on any prompt change and mirror the prompt in `docs/MOMENT_PROMPT.md`. Quality claims come from the benchmark harness (`scripts/benchmark-models.ts`, results in `apps/engine/benchmark/results/`), not from reading a few outputs.

**LLM provider.** The engine uses the `openai` SDK against an OpenAI-compatible endpoint (production: OpenRouter, `openai/gpt-6-luna`). Endpoint, model and key come from `/etc/chessplain/engine.env` on the VPS; `reasoning_effort: 'none'` is set in `explain.ts`.

**Billing.** Stripe Checkout/Portal via the engine. Checkout uses Stripe Managed Payments (`managed_payments.enabled`; Onelink is merchant of record and handles tax; needs Stripe API version ≥ `2025-03-31.basil`, and rejects `payment_method_types`); prices are tax-inclusive. `POST /api/billing/webhook` sets `profiles.subscription_tier`. A trigger (`on_auth_user_created`) creates the `profiles` row the webhook updates, so a missing profile means a paying user is silently never upgraded.

**Web.** `apps/web/lib/supabase.ts` sets `detectSessionInUrl: false` on purpose: `/auth/callback` owns the code exchange, and letting the client do it too shows a sign-in error to a signed-in user. Square names in explanation text become colored chips linked to board highlights (`lib/squares.ts`, `components/SquareText.tsx`).

**Signed-in experience.** The site is session-aware. `lib/use-session.ts` `useMe()` calls `GET /api/me` (plan, review and scan allowances, `open_idea` from the latest completed scan, scans, reviews, patterns grouped by `concept_id`, the Chess.com username: `profiles.chesscom_username` when saved, else the last used). `PATCH /api/me` saves the username once (checked against Chess.com). Each page has one job: the signed-in home (`app/page.tsx`) is the dashboard (onboarding asks for the username once, then "Scan my last 10 games" is one click; your gremlin, latest scan, reviews, patterns), `/account` is settings only (plan and billing, username, sign out), `/scan/[id]` is one scan, `/report/[id]` is the analysis workspace (game context, step guide, board and prompt above the fold), plan-aware `/pricing`. The sample at `/report/demo` is Morphy's Opera Game from Black's side (`lib/demo-report.ts`; evaluations from Stockfish 18 at depth 18-20, replay-checked in `engine/test/reliability.test.ts`).

## Constraints

- **Production database, no staging.** A local engine pointed at production must run with `WORKER_ENABLED=false`, or it will consume real queued jobs.
- **Migrations:** production has migration history absent from this repo. Don't blindly `supabase db push` or mark migrations applied; see the migration warning in `docs/LAUNCH_CHECKLIST.md`. That history includes constraints the repo schema lacks: `UNIQUE (user_id, source, external_id)` on `source_games` and `UNIQUE (source_game_id)` on `game_analyses`. So there's one report per game per signed-in user: `external_id` is the Chess.com game URL, and `POST /api/reports` returns the existing report on resubmit.
- **No default credentials.** Missing config fails at startup by design (`src/config.ts`, `apps/web/lib/supabase.ts`).
- **Web on Workers:** load fonts with `<link>`/`@import`, not `next/font/google`. `patches/` carries required patches for `next` and `@opennextjs/cloudflare`.
- **Auth email templates** are sourced from `supabase/templates/` and pasted into the Supabase dashboard; the auth server keeps sending the old template for ~10 minutes after a save. Mail goes out through Resend SMTP from `mail.getchessplain.com`.
- **Design system:** "Gremlin Club" in `apps/web/DESIGN.md`: white paper, ink, Archivo Expanded display + Satoshi body, pastel scene panels (butter, pink, mint, sky, lilac; one tint per concept), framed `.panel` for marketing and soft `.surface` for product screens, gremlin art in `public/gremlins/<concept_id>.png` rendered only through `components/Gremlin.tsx` (swap point for Rive). Tokens and shared classes live only in `app/globals.css`; page styles sit next to each page. Product intent is in `apps/web/PRODUCT.md`, which wins when docs disagree about intent; the code wins on facts.

## Docs

`docs/LAUNCH_CHECKLIST.md` is the source of truth for production state and remaining launch gates. `docs/ANALYSIS_QUALITY_ROADMAP.md` covers analysis-quality work and benchmarks. `plans/` and `docs/archive/` are historical records, not instructions.
