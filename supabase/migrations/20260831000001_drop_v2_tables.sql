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
