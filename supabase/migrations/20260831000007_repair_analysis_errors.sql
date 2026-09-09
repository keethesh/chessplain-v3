-- Make error telemetry actually work.
--
-- The engine has always written analysis_errors rows like this:
--
--   supabase.from('analysis_errors').insert({ analysis_id, stage, message, metadata })
--
-- against a v2-era table that has no analysis_id column and requires
-- source and severity. Every insert has therefore failed, silently: the
-- production table contained 0 rows on 2026-09-09 despite the engine having
-- served real traffic. Engine failures, moment-validation failures and LLM
-- credit exhaustion were all recorded nowhere.
--
-- Safe to run against production: the table is empty, so widening it cannot
-- break existing rows, and the v3 code paths below start working immediately.

-- 1. The column the code has always tried to write.
ALTER TABLE public.analysis_errors
  ADD COLUMN IF NOT EXISTS analysis_id uuid REFERENCES public.game_analyses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS analysis_errors_analysis_id_idx
  ON public.analysis_errors (analysis_id);

CREATE INDEX IF NOT EXISTS analysis_errors_created_at_idx
  ON public.analysis_errors (created_at DESC);

-- 2. The v2 CHECK on source enumerated v2 subsystem names. The v3 stages are
-- different ('engine', 'explaining_moment', 'explaining_summary',
-- 'llm_credits_exhausted'), so the constraint rejected every write. Replace it
-- with one that accepts the values v3 actually produces.
ALTER TABLE public.analysis_errors
  DROP CONSTRAINT IF EXISTS analysis_errors_source_check;

ALTER TABLE public.analysis_errors
  ADD CONSTRAINT analysis_errors_source_check
  CHECK (source IN ('engine', 'worker', 'pipeline', 'llm', 'api', 'web', 'system'));

-- 3. Defaults so a write that omits these NOT NULL columns still lands. The
-- engine now sends both explicitly; the defaults keep older callers working.
ALTER TABLE public.analysis_errors
  ALTER COLUMN source SET DEFAULT 'engine';

ALTER TABLE public.analysis_errors
  ALTER COLUMN severity SET DEFAULT 'error';

-- 4. severity may carry its own v2 CHECK; align it with what v3 sends.
ALTER TABLE public.analysis_errors
  DROP CONSTRAINT IF EXISTS analysis_errors_severity_check;

ALTER TABLE public.analysis_errors
  ADD CONSTRAINT analysis_errors_severity_check
  CHECK (severity IN ('info', 'warning', 'error', 'fatal'));
