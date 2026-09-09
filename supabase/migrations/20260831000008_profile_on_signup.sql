-- Create a profiles row for every new auth user.
--
-- Production has 324 profiles rows, so a trigger doing this has existed since
-- v2 — but like the tables themselves it was created by hand and never
-- captured here. On a fresh project there is nothing, and the consequence is
-- the worst kind: billing keys off profiles.id, so
-- `update profiles set subscription_tier='premium' where id = <user>` matches
-- zero rows and a paying customer is never upgraded, silently.
--
-- Idempotent and safe against production:
--   - CREATE OR REPLACE FUNCTION replaces the body, or defines it fresh
--   - the trigger is dropped by name before being created
--   - the insert is ON CONFLICT DO NOTHING, so if a differently-named v2
--     trigger also fires, the second insert is a no-op rather than an error
--     that would abort the signup transaction

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill anyone who signed up while no trigger existed. No-op on production.
INSERT INTO public.profiles (id, email)
SELECT u.id, COALESCE(u.email, '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
