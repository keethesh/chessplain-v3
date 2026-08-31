-- Retry backoff for game_analyses worker claims
ALTER TABLE public.game_analyses ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
