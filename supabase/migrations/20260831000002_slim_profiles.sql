-- Remove unused v2 email nudge, trial, and preference columns
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS welcome_email_sent_at,
  DROP COLUMN IF EXISTS activation_nudge_1_sent_at,
  DROP COLUMN IF EXISTS activation_nudge_2_sent_at,
  DROP COLUMN IF EXISTS resend_contact_id,
  DROP COLUMN IF EXISTS resend_synced_at,
  DROP COLUMN IF EXISTS focus_time_controls,
  DROP COLUMN IF EXISTS trial_ends_at;
