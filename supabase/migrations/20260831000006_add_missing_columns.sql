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
