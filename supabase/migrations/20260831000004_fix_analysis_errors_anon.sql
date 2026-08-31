-- Allow anonymous error logging
ALTER TABLE public.analysis_errors ALTER COLUMN user_id DROP NOT NULL;
