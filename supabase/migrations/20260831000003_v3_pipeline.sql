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
