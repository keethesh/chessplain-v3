-- Finish what migration 7 started: make error telemetry actually writable.
--
-- Migration 7 replaced analysis_errors.source_check and severity_check, but the
-- table ALSO carries analysis_errors_stage_check, which still enumerated v2
-- subsystem names:
--
--   CHECK (stage = ANY (ARRAY['engine','coaching','persistence','validation','unknown']))
--
-- v3 writes stage values of 'explaining_moment', 'explaining_summary' and
-- 'llm_credits_exhausted' (see ErrorStage in apps/engine/src/db/errors.ts), so
-- every LLM-related telemetry insert failed with SQLSTATE 23514:
--
--   new row for relation "analysis_errors" violates check constraint
--   "analysis_errors_stage_check"
--
-- The engine logs that failure and carries on, so on 2026-09-17 a complete
-- LLM-provider outage (every request 404 from the gateway) left a single
-- explanatory breadcrumb in journald and nothing whatsoever in the database.
-- The outage was reported by a person noticing the product was broken.
--
-- Safe to run against production: the table is empty of v3 stages because none
-- could ever be written, and the old v2 values are retained so any historical
-- rows stay valid.

ALTER TABLE public.analysis_errors
  DROP CONSTRAINT IF EXISTS analysis_errors_stage_check;

ALTER TABLE public.analysis_errors
  ADD CONSTRAINT analysis_errors_stage_check
  CHECK (stage IN (
    -- v3 stages actually produced by the engine today
    'engine',
    'explaining_moment',
    'explaining_summary',
    'llm_credits_exhausted',
    -- retained so pre-v3 rows (if any) remain valid
    'coaching',
    'persistence',
    'validation',
    'unknown'
  ));

-- Older callers may omit stage; default it instead of rejecting the row.
ALTER TABLE public.analysis_errors
  ALTER COLUMN stage SET DEFAULT 'engine';

-- Operators alert off this, so finding recent LLM failures must be cheap.
CREATE INDEX IF NOT EXISTS analysis_errors_stage_created_at_idx
  ON public.analysis_errors (stage, created_at DESC);
