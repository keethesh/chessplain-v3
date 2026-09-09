-- Baseline schema for a fresh database.
--
-- Every other migration in this directory ALTERs tables that were created by
-- hand in the v2-era Supabase project and never captured in source control.
-- This file creates them so `supabase db reset` produces a working schema.
-- It runs before 20260831000001 and is written to be a no-op against the
-- existing production database: CREATE TABLE IF NOT EXISTS only, no ALTERs,
-- no drops, no data.
--
-- Column list verified against the live project on 2026-09-09 by reading the
-- PostgREST OpenAPI definition, not inferred from application code. Columns
-- that later migrations add with IF NOT EXISTS (ip, elo_band, share_id,
-- moments, summary, hero_variant, next_attempt_at) are intentionally absent
-- here; 20260831000003 and 20260831000005 add them on a fresh database too.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  avatar_url text,
  subscription_tier text NOT NULL DEFAULT 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  chesscom_username text,
  lichess_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.source_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  external_id text,
  source text NOT NULL,
  played_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  white_player text,
  black_player text,
  player_color text,
  result text,
  opening_name text,
  time_control text,
  -- Nullable in production: a row can exist before its PGN is attached.
  pgn text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.game_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_game_id uuid NOT NULL REFERENCES public.source_games(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  engine text,
  model text,
  prompt_version text,
  -- v2 columns kept because production has them NOT NULL. Defaults are what
  -- let the v3 insert (which sets neither) succeed.
  game_summary text NOT NULL DEFAULT '',
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.analysis_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_id uuid,
  source_game_id uuid REFERENCES public.source_games(id) ON DELETE SET NULL,
  analysis_id uuid REFERENCES public.game_analyses(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'engine',
  stage text NOT NULL,
  severity text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  error_name text,
  status_code integer,
  pgn_fingerprint text,
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
