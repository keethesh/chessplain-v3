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
