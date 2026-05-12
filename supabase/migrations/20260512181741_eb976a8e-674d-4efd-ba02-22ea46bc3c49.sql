
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS forum_identity_source text,
  ADD COLUMN IF NOT EXISTS forum_display_name_cached text,
  ADD COLUMN IF NOT EXISTS forum_avatar_url_cached text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_forum_identity_source_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_forum_identity_source_chk
  CHECK (forum_identity_source IS NULL OR forum_identity_source IN ('x','google','custom'));
