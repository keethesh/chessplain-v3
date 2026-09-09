# Plan 002: Make the schema bootstrappable on a fresh database

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat d8a3a65..HEAD -- supabase/migrations apps/engine/src`
> If any of those changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (the migration will eventually run against the production database)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d8a3a65`, 2026-09-09

## Why this matters

`supabase/migrations/` cannot create this application's database. Every
migration in the repo is an `ALTER`/`DROP` against tables that only exist in
the live v2-era Supabase project — the only `CREATE TABLE` in the whole
directory is `analysis_cache`. Point the engine at a fresh Supabase project and
migration #1 fails immediately with "relation public.source_games does not
exist". On top of that, the running code reads and writes six columns that no
migration creates at all (`game_analyses.locked_at`,
`source_games.player_color/white_player/black_player`,
`profiles.subscription_tier/stripe_customer_id/stripe_subscription_id`), so
even the live database's schema is undocumented folklore.

The concrete cost: you cannot stand up a staging environment, which means the
live acceptance gate (`apps/engine: pnpm verify:20`) can never be run anywhere
but production. This plan makes `supabase db reset` produce a working schema.

## Current state

`supabase/migrations/` contains exactly five files, in this order:

1. `20260831000001_drop_v2_tables.sql` — `DROP TABLE IF EXISTS` on eight v2
   tables, then `ALTER TABLE public.source_games DROP COLUMN IF EXISTS player_account_id;`
   (**fails on a fresh DB — `source_games` does not exist**)
2. `20260831000002_slim_profiles.sql` — `ALTER TABLE public.profiles DROP COLUMN IF EXISTS ...`
   (**fails on a fresh DB**)
3. `20260831000003_v3_pipeline.sql` — creates `analysis_cache`; `ALTER`s
   `game_analyses` and `source_games` (**those ALTERs fail on a fresh DB**)
4. `20260831000004_fix_analysis_errors_anon.sql` — `ALTER TABLE public.analysis_errors ALTER COLUMN user_id DROP NOT NULL;`
   (**fails on a fresh DB**)
5. `20260831000005_add_next_attempt_at.sql` — adds `game_analyses.next_attempt_at`
   (**fails on a fresh DB**)

Full text of file 3 (`20260831000003_v3_pipeline.sql`), which shows both the
house style and the columns already accounted for:

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

Note the conventions to match: `public.` prefix, `IF NOT EXISTS` everywhere,
`timestamptz NOT NULL DEFAULT now()`, `jsonb` with `'[]'::jsonb` defaults,
`ip` is type **`inet`** (not text), and RLS enabled with **no policies** so only
the service role can reach the data. A comment explains each block.

### Every column the code actually uses

Derived by reading the engine source. These are facts, not guesses — the
`file:line` for each is given so you can confirm.

**`profiles`** — read only, keyed by auth user id:
- `id` — `server.ts:137` (`.eq('id', userId)` where userId is a Supabase auth uid)
- `subscription_tier` — `server.ts:136` selected, compared to `'premium'` at `server.ts:139`
- `stripe_customer_id` — `server.ts:389` (billing lookup), written on checkout
- `stripe_subscription_id` — written by the Stripe webhook handler in `server.ts`

**`source_games`**:
- `id` uuid pk — `server.ts:180` (`.select('id')` after insert)
- `user_id` uuid, nullable — `server.ts:173`
- `ip` inet — `server.ts:174`
- `pgn` text — `server.ts:175`
- `source` text — `server.ts:176` (values `'chesscom'` | `'pgn'`)
- `external_id` text nullable — `server.ts:177`
- `metadata` jsonb — `server.ts:178`
- `player_color` text — written `worker.ts:109`, `worker.ts:125`; read `server.ts:222`
- `white_player` text — written `worker.ts:110`, `worker.ts:126`; read `server.ts:222`
- `black_player` text — written `worker.ts:111`, `worker.ts:127`; read `server.ts:222`
- `created_at` timestamptz — implied by ordering/quota queries

**`game_analyses`**:
- `id` uuid pk, `user_id` uuid nullable, `source_game_id` uuid → `source_games(id)`,
  `ip` inet, `share_id` text unique, `hero_variant` text, `status` text,
  `elo_band` text, `moments` jsonb, `summary` jsonb, `created_at` timestamptz,
  `completed_at` timestamptz — see `server.ts:190-200` (insert) and
  `server.ts:222` (select list)
- `attempts` integer — read `worker.ts:41`, incremented `worker.ts:60`
- `next_attempt_at` timestamptz — already added by migration 5; also `worker.ts:61,199`
- `locked_at` timestamptz — **created by no migration**; written `worker.ts:62`
  (claim), `worker.ts:165` (completion), `worker.ts:196` (failure),
  `worker.ts:230` (requeue)
- `status` CHECK constraint values are fixed by migration 3 (see above)

**`analysis_errors`**:
- `analysis_id` — `explain.ts:212,225,236,334,347,358`, `worker.ts:204`
- `stage` text — same call sites (values seen: `'engine'`, `'explaining_moment'`,
  `'explaining_summary'`, `'llm_credits_exhausted'`)
- `message` text — same call sites
- `metadata` jsonb — same call sites
- `user_id` — nullable per migration 4
- `id`, `created_at` — implied

**No web code queries these tables directly.** `rg -o "from\('([a-z_]+)'\)" apps/web`
returns nothing; the browser only uses Supabase for auth and talks to the engine
over HTTP. That is why RLS with no policies is safe.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| SQL syntax parse | `psql --version` then see step 3 | — |
| Engine typecheck | `pnpm --filter @chessplain/engine exec tsc --noEmit` | exit 0 |
| Engine tests | `pnpm --filter @chessplain/engine test` | 18 passed |

There is no local Postgres or Supabase CLI guaranteed in this environment. If
`supabase` and `psql` are both unavailable, verification is limited to the
static checks in step 3 — say so in your report rather than inventing a result.

## Scope

**In scope**:
- `supabase/migrations/20260831000000_baseline_schema.sql` (create)
- `supabase/migrations/20260831000006_add_missing_columns.sql` (create)
- `docs/ENGINE_DEPLOYMENT.md` (append one short section, see step 4)

**Out of scope** (do NOT touch):
- The five existing migration files. They are already applied to production;
  editing applied migrations is how you corrupt a migration history.
- Any file under `apps/`. This plan changes no application code.
- RLS policies for anon/authenticated roles. The service-role-only posture is a
  deliberate decision (see the comment in migration 3) — do not add policies.
- `supabase/config.toml` if one exists.

## Git workflow

Do not create branches, commit, or push. Leave changes in the working tree.

## Steps

### Step 1: Write the baseline schema migration

Create `supabase/migrations/20260831000000_baseline_schema.sql`. The `...000000`
timestamp puts it **before** `...000001_drop_v2_tables.sql`, so a fresh database
gets its tables before anything tries to alter them. Every statement must be
idempotent, because this file will also run against production (where these
tables already exist) and must be a harmless no-op there.

Required content, in this order:

```sql
-- Baseline schema for a fresh database.
--
-- Every other migration in this directory ALTERs tables that were created by
-- hand in the v2-era Supabase project and never captured in source control.
-- This file creates them so `supabase db reset` produces a working schema.
-- It runs before 20260831000001 and is written to be a no-op against the
-- existing production database: CREATE TABLE IF NOT EXISTS only, no ALTERs,
-- no drops, no data.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.source_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pgn text NOT NULL,
  source text NOT NULL,
  external_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.game_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_game_id uuid NOT NULL REFERENCES public.source_games(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.analysis_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES public.game_analyses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stage text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Service-role-only, matching public.analysis_cache in 20260831000003.
-- The engine uses the service key (which bypasses RLS) and the browser never
-- queries these tables directly — it authenticates with Supabase and talks to
-- the engine over HTTP. Do NOT add anon or authenticated policies.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_errors ENABLE ROW LEVEL SECURITY;
```

Deliberate omissions, so you do not "helpfully" add them: `user_id NOT NULL` is
absent because migration 3 drops that constraint anyway; `ip`, `share_id`,
`elo_band`, `moments`, `summary`, `hero_variant`, and `next_attempt_at` are
absent because migrations 3 and 5 add them with `IF NOT EXISTS` and will do so
on a fresh database too. Do not duplicate them here.

**Verify**: `rg -c "CREATE TABLE IF NOT EXISTS" supabase/migrations/20260831000000_baseline_schema.sql`
→ `4`. And `rg -n "DROP|ALTER COLUMN|INSERT" supabase/migrations/20260831000000_baseline_schema.sql`
→ no matches (only the four `ENABLE ROW LEVEL SECURITY` ALTERs, which do not match those words).

### Step 2: Write the missing-columns migration

Create `supabase/migrations/20260831000006_add_missing_columns.sql` with the six
columns the code uses that no migration creates:

```sql
-- Columns the running code reads and writes that no migration ever created.
-- They exist in the production database (added by hand); this file captures
-- them so a fresh database matches production.

-- Worker lease timestamp: set when a job is claimed, cleared on completion,
-- failure, and requeue. See apps/engine/src/queue/worker.ts.
ALTER TABLE public.game_analyses
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- Reviewed player's colour and both player names, resolved during import.
ALTER TABLE public.source_games
  ADD COLUMN IF NOT EXISTS player_color text,
  ADD COLUMN IF NOT EXISTS white_player text,
  ADD COLUMN IF NOT EXISTS black_player text;

-- Billing state, written by the Stripe checkout and webhook handlers.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- The worker claims the oldest pending job whose backoff has expired; this
-- index serves that query and the stale-lease sweep.
CREATE INDEX IF NOT EXISTS game_analyses_status_created_idx
  ON public.game_analyses (status, created_at);

-- Free-quota counting scans recent rows by submitter IP.
CREATE INDEX IF NOT EXISTS game_analyses_ip_created_idx
  ON public.game_analyses (ip, created_at);
```

`subscription_tier` gets `NOT NULL DEFAULT 'free'` because `server.ts:139` treats
anything other than `'premium'` as free — a NULL would work but a default makes
the contract explicit. On production this backfills existing rows to `'free'`,
which is correct: premium rows are set by the webhook.

**Verify**: `rg -c "ADD COLUMN IF NOT EXISTS" supabase/migrations/20260831000006_add_missing_columns.sql`
→ `7`. Then confirm every column named in "Every column the code actually uses"
that is not created by migrations 0, 3, or 5 now appears in this file:
`rg -n "locked_at|player_color|white_player|black_player|subscription_tier|stripe_customer_id|stripe_subscription_id" supabase/migrations/`
→ each name appears at least once.

### Step 3: Validate the SQL as far as this environment allows

Try, in order, and stop at the first that works:

1. `supabase db reset` (if the Supabase CLI is installed **and** Docker is
   running). Expected: all seven migrations apply with no error.
2. If `psql` is available with any local Postgres: create a throwaway database
   and apply the files in filename order. `auth.users` will not exist, so the
   FK references will fail — in that case run
   `CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);`
   first, and say in your report that this stub was used.
3. If neither is available: verify syntax statically only —
   confirm every statement ends with `;`, every `CREATE TABLE` has matching
   parentheses, and the file list is in the intended order
   (`eza -1 supabase/migrations/` → the new `...000000_` file sorts first and
   `...000006_` sorts last).

**Verify**: report exactly which of the three paths you took and its output. Do
not claim a database applied the migration if no database was available.

### Step 4: Document the fresh-environment path

Append this section to the end of `docs/ENGINE_DEPLOYMENT.md`:

```markdown
## Standing up a fresh database (staging)

`supabase/migrations/` is self-sufficient as of `20260831000000_baseline_schema.sql`:
a new Supabase project reaches the current schema with `supabase db push` (or
`supabase db reset` locally). Two constraints to respect:

- All four v3 tables have RLS enabled with **no policies**. The engine reaches
  them with `SUPABASE_SERVICE_ROLE_KEY`; the browser must never query them
  directly. If a table returns zero rows for an authenticated user, that is RLS
  working as designed — route the read through the engine, do not add a policy.
- `profiles` rows are expected to exist for every auth user. If your project has
  no trigger creating them on signup, premium detection (`server.ts:136`) reads
  a missing row and treats the user as free.
```

**Verify**: `rg -n "Standing up a fresh database" docs/ENGINE_DEPLOYMENT.md` →
one match.

## Test plan

No unit tests — this plan adds SQL, and the engine's Vitest suite mocks Supabase
entirely (see `apps/engine/test/reliability.test.ts:7-13`). Regression safety
comes from:

- The engine suite still passing untouched: `pnpm --filter @chessplain/engine test`
  → 18 passed.
- The static column cross-check in step 2's verify.
- Step 3's migration apply, if a database is reachable.

## Done criteria

ALL must hold:

- [ ] `supabase/migrations/20260831000000_baseline_schema.sql` exists, creates 4 tables, contains no DROP/INSERT/ALTER COLUMN
- [ ] `supabase/migrations/20260831000006_add_missing_columns.sql` exists with 7 `ADD COLUMN IF NOT EXISTS` and 2 indexes
- [ ] `rg -n "locked_at|player_color|white_player|black_player|subscription_tier|stripe_customer_id|stripe_subscription_id" supabase/migrations/` returns matches for all seven names
- [ ] `git diff --name-only` shows the five pre-existing migration files unmodified
- [ ] `pnpm --filter @chessplain/engine test` → 18 passed
- [ ] `docs/ENGINE_DEPLOYMENT.md` has the new section
- [ ] `git status --porcelain` lists only the two new SQL files and `docs/ENGINE_DEPLOYMENT.md`

## STOP conditions

Stop and report back if:

- Any of the five existing migration files differs from what "Current state"
  describes.
- You find application code reading a table column that this plan does not
  account for. Re-run the inventory yourself:
  `rg -n "from\('(game_analyses|source_games|profiles|analysis_errors)'\)" -A 12 apps/engine/src`
  and report any column name not listed in "Every column the code actually uses".
- `rg -o "from\('([a-z_]+)'\)" apps/web` returns any match — that would mean the
  browser queries tables directly and enabling RLS without policies would break
  it. Report before writing any RLS statement.
- A migration apply in step 3 fails for any reason other than the missing
  `auth.users` stub.

## Maintenance notes

- These two files describe the schema as *inferred from code*, not dumped from
  production. The moment someone gets access to the live project, run
  `supabase db dump --schema public` and diff it against these files; any
  difference is a bug in this plan, not in production.
- If a `profiles` insert trigger is ever added on signup, it belongs in a new
  migration, not in the baseline.
- Future column additions should go in new numbered migrations. The baseline file
  should stay frozen — it is a bootstrap, not a living schema document.
- A reviewer should scrutinize: the FK `ON DELETE` behaviours (a deleted user
  nulls their analyses rather than deleting them — deliberate, since anonymous
  runs already have `user_id IS NULL`), and the `subscription_tier` default
  backfilling production rows to `'free'`.
