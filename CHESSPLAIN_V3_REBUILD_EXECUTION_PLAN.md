# Chessplain v3 Rebuild — Execution Plan

## Context
Chessplain is being rebuilt around its single validated loop: user pastes a PGN or enters a chess.com username → 3-stage Stockfish 18 analysis on a 4-core VPS identifies turning points → LLM explains the player's mistakes in plain language ("what you were probably thinking", why the plan fails, concept name, checkable habit). This plan implements the full v1 production stack (Supabase migrations, server-side Stockfish 18 engine service, Next.js web application, PostHog analytics, Stripe billing, GitHub branch hygiene, and Vercel/VPS deployments), replacing the inactive v2 daily-coach product.

---

## Approach

### Phase 0 — Quiesce v2 Services (Pre-Migration Safety)
Before touching the database schema, stop live v2 workers that actively poll `game_analyses`.
1. **Suspend Fly Worker**:
   Primary: Fly.io Web Dashboard → app `chessplain-worker` → Suspend (the local `fly` CLI is installed but unauthenticated — verified; `fly auth login` enables the CLI alternative: `fly apps suspend chessplain-worker`).
2. **Note on v2 Vercel Crons**:
   V2 cron jobs (`/api/cron/sync-games`, `/api/cron/generate-briefings`, `/api/cron/send-winback-emails`) will be decommissioned automatically when the old Vercel project `prj_n3R8dPpzp6RyS6oXhEOsMPNKitRR` is deleted in Phase 6.

---

### Phase 1 — Initialize Monorepo & GitHub Repository
Initialize the clean v3 repository structure in `C:/Users/keeth/WebstormProjects/ChessplainCloud`.

1. **Initialize Git & .gitignore**:
   Create `.gitignore` containing:
   ```
   node_modules/
   .env*
   !.env.example
   dist/
   .next/
   data/*.db*
   .DS_Store
   ```
   Run `git init -b main`.

2. **Establish Monorepo Layout**:
   Create root `package.json`:
   ```json
   {
     "name": "chessplain-monorepo",
     "private": true,
     "workspaces": [
       "apps/*"
     ],
     "scripts": {
       "build": "pnpm --filter ./apps/* build",
       "lint": "pnpm --filter ./apps/* lint"
     },
     "packageManager": "pnpm@10.28.2"
   }
   ```
   Directory structure:
   - `apps/engine/` — Node.js / Fastify Stockfish engine worker & API
   - `apps/web/` — Next.js 16 App Router web app
   - `docs/` — `REBUILD_STRATEGY_31082026.md`, `MOMENT_PROMPT.md`
   - `supabase/migrations/` — SQL migration files

3. **Initial Commit & GitHub Push**:
   Create initial commit: `git add . && git commit -m "chore: seed v3 monorepo with strategy, prompt contract, and wireframe"`
   Create GitHub repo `keethesh/chessplain-v3` via `gh repo create keethesh/chessplain-v3 --public --source . --remote origin --push` (or via `mcp__github_create_repository` with name `chessplain-v3`, followed by `git remote add origin https://github.com/keethesh/chessplain-v3.git && git push -u origin main`).

---

### Phase 2 — Supabase Database Migrations
Apply migrations sequentially to project `jgtxprfulkbtzkcvinph` using `mcp__supabase_apply_migration`. Save corresponding SQL files in `supabase/migrations/`.

1. **Migration 1: Drop Inactive v2 Tables (`20260831000001_drop_v2_tables.sql`)**:
   ```sql
   -- Drop v2 coaching, pattern tracking, and quota reservation tables
   DROP TABLE IF EXISTS public.analysis_quota_reservations CASCADE;
   DROP TABLE IF EXISTS public.assignment_evidence CASCADE;
   DROP TABLE IF EXISTS public.assignment_events CASCADE;
   DROP TABLE IF EXISTS public.coaching_assignments CASCADE;
   DROP TABLE IF EXISTS public.pattern_progress CASCADE;
   DROP TABLE IF EXISTS public.pattern_progress_facts CASCADE;
   DROP TABLE IF EXISTS public.player_accounts CASCADE;
   DROP TABLE IF EXISTS public.usage CASCADE;

   -- Remove orphaned FK column from source_games
   ALTER TABLE public.source_games DROP COLUMN IF EXISTS player_account_id;
   ```

2. **Migration 2: Slim Profiles (`20260831000002_slim_profiles.sql`)**:
   ```sql
   -- Remove unused v2 email nudge, trial, and preference columns
   ALTER TABLE public.profiles
     DROP COLUMN IF EXISTS welcome_email_sent_at,
     DROP COLUMN IF EXISTS activation_nudge_1_sent_at,
     DROP COLUMN IF EXISTS activation_nudge_2_sent_at,
     DROP COLUMN IF EXISTS resend_contact_id,
     DROP COLUMN IF EXISTS resend_synced_at,
     DROP COLUMN IF EXISTS focus_time_controls,
     DROP COLUMN IF EXISTS trial_ends_at;
   ```

3. **Migration 3: v3 Pipeline Schema & Analysis Cache (`20260831000003_v3_pipeline.sql`)**:
   ```sql
   -- 1. Create Position Analysis Cache for Fast Lookup (opening tree hits & shared positions)
   CREATE TABLE IF NOT EXISTS public.analysis_cache (
     fen text NOT NULL,
     profile_key text NOT NULL, -- 'pass1_15k' or 'd20'
     eval_pawns real NOT NULL,
     best_move text NOT NULL,
     pv text NOT NULL DEFAULT '',
     multipv jsonb NOT NULL DEFAULT '[]'::jsonb,
     created_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (fen, profile_key)
   );
   ALTER TABLE public.analysis_cache ENABLE ROW LEVEL SECURITY;
   -- RLS enabled with NO policies: service-role-only by design (the engine's service key bypasses RLS; anon clients must never read this table). Do NOT add anon policies.

   -- 2. Adapt game_analyses for v3 report output and anonymous runs
   ALTER TABLE public.game_analyses
     ALTER COLUMN user_id DROP NOT NULL,
     ADD COLUMN IF NOT EXISTS ip inet,
     ADD COLUMN IF NOT EXISTS elo_band text,
     ADD COLUMN IF NOT EXISTS share_id text UNIQUE,
     ADD COLUMN IF NOT EXISTS moments jsonb NOT NULL DEFAULT '[]'::jsonb,
     ADD COLUMN IF NOT EXISTS summary jsonb,
     ADD COLUMN IF NOT EXISTS hero_variant text;

   -- Ensure valid state transitions
   ALTER TABLE public.game_analyses
     DROP CONSTRAINT IF EXISTS game_analyses_status_check;
   ALTER TABLE public.game_analyses
     ADD CONSTRAINT game_analyses_status_check
     CHECK (status IN ('pending', 'sweeping', 'verifying', 'explaining', 'completed', 'failed'));

   -- 3. Adapt source_games for anonymous runs
   ALTER TABLE public.source_games
     ALTER COLUMN user_id DROP NOT NULL,
     ADD COLUMN IF NOT EXISTS ip inet;
   ```

4. **Commit Migrations**:
   `git add supabase/migrations && git commit -m "feat(db): v3 migrations for analysis cache, report schema, and table cleanup"`

---

### Phase 3 — Engine Service Implementation (`apps/engine`)
Develop the TypeScript/Node.js backend service responsible for Stockfish UCI management, the 3-stage analysis pipeline, and Fastify HTTP/SSE APIs.

1. **Project Setup (`apps/engine/package.json`, `tsconfig.json`)**:
   Package name `@chessplain/engine` (the Verification section filters by it). Dependencies: `fastify`, `@fastify/cors`, `@fastify/rate-limit`, `openai`, `@supabase/supabase-js`, `chess.js`, `stripe`, `posthog-node`, `nanoid`, `pino`, `dotenv`.
   DevDependencies: `typescript`, `tsx`, `vitest`, `@types/node`. Scripts: `build: tsc`, `start: node dist/http/server.js`, `verify:20: tsx scripts/verify-20-games.ts`.

2. **UCI Engine Pool & Process Management (`apps/engine/src/uci/`)**:
   - `uci-client.ts`: Lightweight UCI driver over `child_process.spawn`. Implements `setoption`, `ucinewgame`, `position fen ... moves ...`, `go nodes 15000 multipv 2`, `go depth 20`, and stream parsers for `info depth ... score cp/mate ... pv ...` and `bestmove`.
   - `engine-pool.ts`: Spawns 4 Stockfish instances using `/usr/local/bin/stockfish18_clang`. Core-pins each instance only on Linux: `process.platform === 'linux' ? spawn('taskset', ['-c', String(i), ENGINE_PATH]) : spawn(ENGINE_PATH)` — `taskset` does not exist on the Windows dev machine. Sets UCI options: `Threads=1`, `Hash=1024`, `SyzygyPath=/var/chess/syzygy`.
   Local dev (Windows): install a Stockfish binary (`winget install --id=OfficialStockfish.Stockfish` or download from stockfishchess.org) and set `ENGINE_PATH` to it; the taskset guard already no-ops off Linux.

3. **3-Stage Analysis Pipeline (`apps/engine/src/analysis/`)**:
   - `pgn.ts`: Validates and parses PGN using `chess.js`. Generates FEN list and SAN move histories.
   - `chesscom.ts`: Fetches the most recent game for a username via `https://api.chess.com/pub/player/{user}/games/{yyyy}/{mm}` with custom `User-Agent: Chessplain/3.0`. Fetches rating from `/pub/player/{user}/stats` to map `elo_band` (`under_1000`, `1000_1400`, `above_1400`).
   - `sweep.ts` (Stage 1): Evaluates all game positions concurrently across the 4 engine workers with `nodes=15000` (`MultiPV=2`). Checks `analysis_cache` (`profile_key='pass1_15k'`) before evaluation and writes back misses.
   - `select.ts` & `verify.ts` (Stage 2):
     - Computes player swing: `delta = eval_after - eval_before` (adjusted for player perspective).
     - Identifies candidates: `delta <= -1.5` pawns or missed win (`eval_before >= +2.0` and `eval_after <= +0.5`).
     - Deduplicates within 3 plies (keeps largest swing) and caps at top 5 moments.
     - Runs Stage 2b: Depth 20 verification on selected candidates. Drops candidate if verified swing `< 1.0` pawn. If 0 blunders found, selects the single largest swing as a "Quiet drift" moment.
   - `prompts.ts`: Embeds prompt contracts verbatim from `docs/MOMENT_PROMPT.md` (`prompt_version: "2026-08-31.2"`), including banned-token regex checkers.
   - `explain.ts` (Stage 3):
     - Calls the OpenAI-compatible gateway via the `openai` SDK: `new OpenAI({ baseURL: process.env.LLM_API_BASE, apiKey: process.env.LLM_API_KEY })`, model `process.env.LLM_MODEL` (default `deepseek-v4`), `response_format: { type: "json_object" }`, then `JSON.parse` + required-keys validation server-side (same checks as the smoke test: field presence, severity enum, ≤8-word definition). Runs moment explanation calls in parallel, followed by the game summary call.
     - Enforces mechanical banned-token validation (`blunder`, `mistake`, `inaccuracy`, `accuracy`, `centipawn`, `eval`, `better was`, signed numbers, percentages). Retries once on violation, logging persistent failures to `analysis_errors`.

4. **Background Queue Worker (`apps/engine/src/queue/worker.ts`)**:
   - Polls `game_analyses` every 1000ms using PostgreSQL `FOR UPDATE SKIP LOCKED`:
     ```sql
     UPDATE public.game_analyses
     SET status = 'sweeping', locked_at = now(), attempts = attempts + 1
     WHERE id = (
       SELECT id FROM public.game_analyses
       WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now())
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *;
     ```
   - Executes Stage 1 → Stage 2 → Stage 3, updating `game_analyses.moments` incrementally as moments finish and setting `status = 'completed'`, `completed_at = now()`.
   - On error: logs to `analysis_errors`, sets `status = 'failed'` or schedules retry if `attempts < 3`. Emits server-side PostHog events via `posthog-node`: `analysis_completed` (properties: `duration_ms`, `moments_count`, `cache_hit_rate`) and `analysis_failed` (properties: `stage`, `attempts`).

5. **Fastify HTTP & SSE Server (`apps/engine/src/http/server.ts`)**:
   - `POST /api/reports`: Accepts `{ pgn?, chesscom_username?, hero_variant? }`. Rate limit (10 req/hr/IP via `@fastify/rate-limit`) requires the server booted as `fastify({ trustProxy: true })` — behind Caddy the client IP arrives via `X-Forwarded-For`, and without trustProxy every visitor shares 127.0.0.1's bucket (verified: Caddy will be the only listener on 80/443). Free quota for anon/free users: `SELECT count(*) FROM game_analyses WHERE ip = $1 AND created_at > now() - interval '7 days'` — >= 2 returns 402 with an upgrade prompt; `profiles.subscription_tier = 'premium'` bypasses. No new quota table. Inserts into `source_games` and `game_analyses` with generated `share_id` (`nanoid(8)`).
   - `GET /api/reports/:id`: Returns report JSON.
   - `GET /api/reports/:id/events`: Server-Sent Events (SSE) streaming progress and incremental moments by polling the DB row every 500ms.
   - `GET /api/reports/share/:shareId`: Public report endpoint.
   - `POST /api/reports/:id/claim`: Authenticated endpoint that sets `user_id` on anonymous `source_games` and `game_analyses` rows when a user signs in.
   - `POST /api/billing/checkout`: Creates Stripe Checkout Session for subscription tier (`price_1SOs7yFtgmZSE6kx0wJ3wY3u` monthly or `price_1SOs7yFtgmZSE6kxI9RoSTXR` yearly).
   - `POST /api/billing/webhook`: Verifies Stripe signature, updates `profiles.subscription_tier = 'premium'` on `checkout.session.completed` and `customer.subscription.updated`, or reverts to `'free'` on `customer.subscription.deleted`.
   - `GET /healthz`: Health check returning `{ status: "ok", engines: 4 }`.

6. **Automated Verification Script (`apps/engine/scripts/verify-20-games.ts`)**:
   Fetches 20 recent games from public chess.com accounts, runs the full analysis pipeline, and asserts:
   - >= 19/20 games complete successfully.
   - Every completed report has a valid headline, 1–5 moments, valid concept definitions (<= 8 words), and 0 banned tokens.
   - Median completion time <= 30 seconds.

7. **Commit Engine Service**:
   `git add apps/engine && git commit -m "feat(engine): stockfish 18 pool, 3-stage analysis pipeline, and fastify api"`

---

### Phase 4 — VPS Deployment (`london-ampere`)
Deploy the engine service to the Oracle ARM VPS (`193.123.179.67`).

1. **Clone and Build on VPS**:
   SSH into `london-ampere`:
   ```bash
   # pnpm is NOT installed on the VPS (verified); Node 22 ships corepack
   sudo corepack enable && corepack prepare pnpm@10.28.2 --activate
   git clone https://github.com/keethesh/chessplain-v3.git /home/ubuntu/chessplain-v3
   cd /home/ubuntu/chessplain-v3
   pnpm install
   pnpm --filter @chessplain/engine build
   ```

2. **Configure Environment (`/etc/chessplain/engine.env`)**:
   Create `/etc/chessplain/engine.env` (permissions `0600`, owned by `ubuntu`):
   ```env
   PORT=8080
   NODE_ENV=production
   SUPABASE_URL=https://jgtxprfulkbtzkcvinph.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndHhwcmZ1bGtidHprY3ZpbnBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyODk0ODIsImV4cCI6MjA3Njg2NTQ4Mn0.E8eXXrpiAiA_T0wz5yh_u6m2USL7QMs7IfSDc80bIKI
   LLM_API_BASE=https://api.crof.ai/v1
   LLM_API_KEY=<LLM_API_KEY>
   LLM_MODEL=deepseek-v4
   STRIPE_SECRET_KEY=<STRIPE_SECRET_KEY>
   STRIPE_WEBHOOK_SECRET=<STRIPE_WEBHOOK_SECRET>
   POSTHOG_KEY=phc_UKy5oAuRvZ0zofoUDe1hWPGchLU1IkcpjOP2P3aCUa5
   POSTHOG_HOST=https://eu.i.posthog.com
   ENGINE_PATH=/usr/local/bin/stockfish18_clang
   SYZYGY_PATH=/var/chess/syzygy
   WEB_ORIGIN=https://chessplain.com
   ```

3. **Configure Systemd Service (`/etc/systemd/system/chessplain-engine.service`)**:
   ```ini
   [Unit]
   Description=Chessplain v3 Engine API & Worker
   After=network.target

   [Service]
   Type=simple
   User=ubuntu
   WorkingDirectory=/home/ubuntu/chessplain-v3/apps/engine
   ExecStart=/usr/bin/node dist/http/server.js
   Restart=always
   RestartSec=3
   EnvironmentFile=/etc/chessplain/engine.env

   [Install]
   WantedBy=multi-user.target
   ```
   Run: `sudo systemctl daemon-reload && sudo systemctl enable --now chessplain-engine`

4. **Setup Caddy Reverse Proxy & TLS**:
   Install Caddy on Ubuntu (`sudo apt install -y caddy`).
   Update `/etc/caddy/Caddyfile`:
   ```caddyfile
   api.chessplain.com {
       reverse_proxy 127.0.0.1:8080
   }
   ```
   Run: `sudo systemctl reload caddy`.

5. **Update DNS for `api.chessplain.com`**:
   In Porkbun DNS settings, update the `A` record for `api.chessplain.com` to point to `193.123.179.67` (TTL 300).

---

### Phase 5 — Web Application Implementation (`apps/web`)
Build the Next.js 16 frontend directly from `wireframes-report-page.html` design tokens.

1. **Project Setup**:
   Dependencies: `next@16.1.6`, `react@19`, `react-dom@19`, `tailwindcss@4`, `react-chessboard@5`, `chess.js@1.4`, `@supabase/supabase-js`, `posthog-js`, `lucide-react`.

2. **Design Tokens & Global Styles (`apps/web/app/globals.css`)**:
   Port tokens from `wireframes-report-page.html`:
   - Grayscale palette (`--w-canvas: #ffffff / #1a1a20`, `--w-surface: #f4f4f6 / #232329`, `--w-border: #d6d6dd / #3a3a44`, `--w-ink1: #26262e / #e8e8ee`, `--w-ink2: #62626b / #9a9aa6`).
   - Accent: `--w-accent: #4338ca / #7c6ff0`, `--w-error: #b42318 / #f97066`.
   - 4px grid spacing, type scale (`t-xs` through `t-2xl`).

3. **Pages & Components (`apps/web/app/`)**:
   - `app/page.tsx`: Input form (PGN paste or chess.com username) with 3 rotating hero angles (A: "Explained, not graded", B: "The mind-read", E: "For people who don't speak engine"). Variant assignment is deterministic per visitor: `['A','B','E'][hashOf(posthog.get_distinct_id()) % 3]` — stable across visits, no wrong-variant flash, attributable at submit via `hero_variant`. Hero copy for each variant comes from `docs/REBUILD_STRATEGY_31082026.md` §7 — do not write new copy.
   - `app/report/[id]/page.tsx`: Full report view matching `wireframes-report-page.html` (mobile 390px stacked view, desktop 1440px 2-column view with left rail, streaming moment skeletons, `react-chessboard` with played move arrows, email capture post-report, share link). Failure state is mandatory: an SSE `{type:"failed"}` event OR a 60-second stream stall renders the wireframe kit's callout pattern — "This is taking longer than it should. Your game is queued — try refreshing in a minute." with a secondary "Try again" button. Never a dead error screen (the only refund-and-"scam" incident in product history came from exactly that screen).
   - `app/r/[shareId]/page.tsx`: Public share page (renders report view with "Analyze your game" CTA).
   - `app/pricing/page.tsx`: Clean pricing cards for $9.99/mo and $99.99/yr triggering Stripe Checkout.
   - `app/auth/callback/route.ts`: Handles Supabase OTP exchange and triggers `/api/reports/:id/claim`.

4. **PostHog Instrumentation (`apps/web/lib/posthog.ts`)**:
   Initialize `posthog-js` with token `phc_UKy5oAuRvZ0zofoUDe1hWPGchLU1IkcpjOP2P3aCUa5` and host `https://eu.i.posthog.com`.
   Instrument required events:
   - `pgn_submitted` (properties: `method: 'pgn' | 'chesscom'`, `hero_variant`)
   - `report_viewed` (properties: `report_id`, `is_shared`)
   - `moment_expanded` (properties: `moment_index`, `concept_name`)
   - `report_engaged` (fired when 2+ moments expanded or dwell time >= 60s)
   - `paywall_viewed`, `paywall_clicked`
   - `game_submitted` (properties: `is_repeat: boolean`)

5. **Commit Web App**:
   `git add apps/web && git commit -m "feat(web): report page, input form, pricing, and posthog analytics"`

---

### Phase 6 — Vercel Deployment & Production Cutover
Connect the web application to Vercel, transfer `chessplain.com`, and decommission old v2 services.

1. **Source Secrets Fresh (Vercel env values are NOT recoverable)**:
   Sensitive Vercel env values are write-only — they cannot be read back via API or dashboard after creation. Create fresh: `LLM_API_KEY` from the OpenAI-compatible gateway account; `STRIPE_SECRET_KEY` from the Stripe dashboard (account `acct_1SDWuSFtgmZSE6kx`); `SUPABASE_SERVICE_ROLE_KEY` from the Supabase dashboard (Settings → API). Nothing needs to be extracted from the old Vercel project before deletion.

2. **Create New Vercel Project**:
   Create project `chessplain-v3` under team `keetheshs-projects` linked to GitHub `keethesh/chessplain-v3` (`rootDirectory: "apps/web"`).
   Set environment variables:
   - `NEXT_PUBLIC_API_URL`: `https://api.chessplain.com`
   - `NEXT_PUBLIC_SUPABASE_URL`: `https://jgtxprfulkbtzkcvinph.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndHhwcmZ1bGtidHprY3ZpbnBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyODk0ODIsImV4cCI6MjA3Njg2NTQ4Mn0.E8eXXrpiAiA_T0wz5yh_u6m2USL7QMs7IfSDc80bIKI`
   - `NEXT_PUBLIC_POSTHOG_KEY`: `phc_UKy5oAuRvZ0zofoUDe1hWPGchLU1IkcpjOP2P3aCUa5`
   - `NEXT_PUBLIC_POSTHOG_HOST`: `https://eu.i.posthog.com`

3. **Verify Preview Deployment**:
   Trigger deployment and verify end-to-end report generation on the `*.vercel.app` preview URL.

4. **Domain Cutover** (verify DNS reality first — current live records: `chessplain.com` apex → Google IPs `216.239.32.21/34.21/36.21/38.21`, NOT Vercel; `api.chessplain.com` → Vercel anycast `207.207.210.x`):
   - Identify the registrar and DNS zone for `chessplain.com` first (registrar unverified — check whois; if DNS is delegated elsewhere, edit records at the zone host).
   - In old Vercel project `chessplain`: remove `chessplain.com` and `www.chessplain.com` if attached (the apex currently resolving to Google IPs means it may not be).
   - In new Vercel project `chessplain-v3`: add `chessplain.com` and `www.chessplain.com`; set the apex + www A/CNAME records at the registrar per Vercel's shown values (TTL 300). Repoint the `api.chessplain.com` A record from Vercel anycast to `193.123.179.67`.
   - Only after the new project serves chessplain.com with a verified end-to-end report for >1 hour: delete old Vercel project `prj_n3R8dPpzp6RyS6oXhEOsMPNKitRR`.

5. **Stripe Webhook Registration**:
   In Stripe Dashboard (account `acct_1SDWuSFtgmZSE6kx`), add webhook endpoint `https://api.chessplain.com/api/billing/webhook` for events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy signing secret to VPS `/etc/chessplain/engine.env` and run `sudo systemctl restart chessplain-engine`.


6. **Compliance & Analytics Setup**:
   - Stripe Checkout requires a Terms of Service URL: add two static pages to `apps/web` — `app/terms/page.tsx` and `app/privacy/page.tsx` (concise, honest: reports are AI + engine generated; cancel anytime; refunds on request) — then set the terms URL in Stripe Dashboard → Settings → Payment Links details.
   - Create the PostHog dashboard "v3 weekly board" (project 137893): funnel `pgn_submitted → report_viewed → moment_expanded → game_submitted(is_repeat=true)`, trends for `analysis_completed` / `analysis_failed` (reliability), and `paywall_viewed → paywall_clicked`. Success targets live in `docs/REBUILD_STRATEGY_31082026.md` §6 — this dashboard is the weekly review instrument.
---

### Phase 7 — GitHub Branch Hygiene & Archiving Legacy Repositories
Clean up remote branches in the legacy `keethesh/Chessplain` repository.

1. **Tag Last v2 State (both branch heads — which commit Vercel deployed from is unrecorded)**:
   In `C:/Users/keeth/ChessplainV2`:
   ```bash
   git tag -a v2-final 257be7c0a00c00ad8a63fd97ec180b527e88024a -m "v2 daily coach — master head"
   git tag -a v2-branch-final 64123ecf2202f98ee33828bca1bc1126aa6694dd -m "v2 daily coach — v2 branch head"
   git push origin v2-final v2-branch-final
   ```

2. **Delete Stale Remote Branches on `keethesh/Chessplain`**:
   Execute branch deletions (local copies in `C:/Users/keeth/ChessplainV2` are preserved):
   ```bash
   git push origin --delete \
     codex/daily-coach-plan-phases-1-7 \
     design/the-study-phase-1 \
     dev \
     dev-legacy \
     feature/report-card \
     fix/daily-coach-review-fixes \
     legacy \
     refactor/deterministic-pattern-engine
   ```
   Retain only `master` and `v2` on the remote.

3. **Archive Legacy Repo**:
   Via GitHub repository settings, set `keethesh/Chessplain` to **Archived (Read-only)**.

---

## Critical Files & Anchors

1. `docs/MOMENT_PROMPT.md`: Authoritative LLM prompt templates and JSON schemas (`prompt_version: 2026-08-31.2`).
2. `wireframes-report-page.html`: Target UI specification and CSS token definitions for mobile and desktop report layouts.
3. `/usr/local/bin/stockfish18_clang`: Production Stockfish 18 binary on `london-ampere` VPS.
4. `/var/chess/syzygy`: Tablebase path on `london-ampere` VPS for endgames.
5. `supabase/migrations/20260831000003_v3_pipeline.sql`: DDL for `analysis_cache` and `game_analyses` v3 report columns.

---

## Verification

Execute these explicit verification checks to certify the implementation:

1. **Engine Pipeline 20-Game Gate**:
   Run `pnpm --filter @chessplain/engine verify:20` on VPS `london-ampere`.
   - **Expected**: >= 19/20 games complete in < 30s median latency with 0 banned tokens.

2. **API & SSE Stream Verification**:
   ```bash
   # 1. Health check
   curl -s https://api.chessplain.com/healthz
   # Expected: {"status":"ok","engines":4}

   # 2. Submit PGN
   REPORT_ID=$(curl -s -X POST https://api.chessplain.com/api/reports \
     -H "Content-Type: application/json" \
     -d '{"chesscom_username":"hikaru"}' | jq -r .id)

   # 3. Stream SSE events
   curl -N https://api.chessplain.com/api/reports/$REPORT_ID/events
   # Expected: progressive "stage" and "moment" events ending with "done"
   ```

3. **Public Share Link**:
   Open `https://chessplain.com/r/<shareId>` in an incognito window.
   - **Expected**: Report renders without login; "Analyze your game" CTA visible.

4. **PostHog Event Ingestion**:
   Execute SQL via `mcp__posthog_exec`:
   ```sql
   SELECT event, count() FROM events
   WHERE timestamp >= now() - INTERVAL 1 HOUR
   GROUP BY event ORDER BY count() DESC
   ```
   - **Expected**: `pgn_submitted`, `report_viewed`, `moment_expanded` present.

5. **Stripe Billing**:
   Click $9.99/mo checkout on `https://chessplain.com/pricing`.
   - **Expected**: Redirects to Stripe Checkout session referencing product `prod_TLZG5MYANZZG3w`.

---

## Assumptions & Contingencies

1. **LLM Provider (decided)**: OpenAI-compatible gateway (DeepSeek v4 default, e.g. crof.ai) via the `openai` SDK with `LLM_API_BASE`/`LLM_API_KEY`/`LLM_MODEL` env vars — switching provider or model is an env edit, no code change.
   *Fallback*: If the gateway is down or rate-limits at peak, point `LLM_API_BASE` at any other OpenAI-compatible endpoint (GLM, OpenRouter, OpenAI) — same JSON contract, same banned-token checks, no other pipeline changes.
2. **Repository Naming**: Monorepo created as `keethesh/chessplain-v3` with legacy `keethesh/Chessplain` archived.
   *Fallback*: If user prefers keeping `keethesh/Chessplain`, rename old repo to `Chessplain-v2-archive` first, then rename `chessplain-v3` to `Chessplain`.
3. **Free Quota & Anonymous Users**: Anonymous users receive 2 free reports per 7-day window tracked by IP address.
   *Fallback*: If NAT/VPN collisions become problematic, require email OTP before report 2.
4. **Fly Worker Suspension**: Assumes `fly` CLI or dashboard access is available to suspend `chessplain-worker`.
   *Fallback*: If Fly credentials are lost, the database migration drops the tables `chessplain-worker` queries, causing it to exit cleanly on unhandled query exceptions without data corruption.
5. **Supabase Auth Email Limits**: Magic-link emails ride Supabase's built-in SMTP — rate-limited (~3-4 emails/hour) on the free plan. Capture happens AFTER the report renders and the share link works regardless, so bursts delay claiming but never block value.
   *Fallback*: If capture volume exceeds the limit during validation, enable custom SMTP (Resend — account already exists) or upgrade Supabase to Pro.
