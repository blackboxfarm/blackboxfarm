
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS rank_slug text NOT NULL DEFAULT 'newbie',
  ADD COLUMN IF NOT EXISTS comment_karma integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avatar_scan_status text,
  ADD COLUMN IF NOT EXISTS avatar_scan_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_nickname_ci_uniq
  ON public.profiles (lower(nickname)) WHERE nickname IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.user_ranks (
  slug text PRIMARY KEY,
  label text NOT NULL,
  icon_emoji text NOT NULL,
  min_karma integer NOT NULL DEFAULT 0,
  is_awardable_only boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);
ALTER TABLE public.user_ranks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_ranks public read" ON public.user_ranks;
CREATE POLICY "user_ranks public read" ON public.user_ranks FOR SELECT USING (true);

INSERT INTO public.user_ranks (slug,label,icon_emoji,min_karma,is_awardable_only,sort_order) VALUES
  ('newbie','Newbie','🌱',0,false,1),
  ('degen','Degen','🎲',25,false,2),
  ('chad','Chad','💪',100,false,3),
  ('veteran','Veteran','🎖️',500,false,4),
  ('oracle','Oracle','🔮',0,true,5)
ON CONFLICT (slug) DO UPDATE
  SET label=EXCLUDED.label, icon_emoji=EXCLUDED.icon_emoji, min_karma=EXCLUDED.min_karma,
      is_awardable_only=EXCLUDED.is_awardable_only, sort_order=EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS public.autopsy_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autopsy_slug text NOT NULL,
  user_id uuid NOT NULL,
  parent_id uuid REFERENCES public.autopsy_comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  body_clean text NOT NULL,
  upvote_count integer NOT NULL DEFAULT 0,
  is_hidden boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_autopsy_comments_slug ON public.autopsy_comments(autopsy_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autopsy_comments_user ON public.autopsy_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_autopsy_comments_parent ON public.autopsy_comments(parent_id);

ALTER TABLE public.autopsy_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comments public read" ON public.autopsy_comments;
CREATE POLICY "comments public read" ON public.autopsy_comments
  FOR SELECT USING (is_hidden = false OR auth.uid() = user_id OR public.has_role(auth.uid(),'super_admin'));
DROP POLICY IF EXISTS "comments owner delete" ON public.autopsy_comments;
CREATE POLICY "comments owner delete" ON public.autopsy_comments
  FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(),'super_admin'));
DROP POLICY IF EXISTS "comments owner update" ON public.autopsy_comments;
CREATE POLICY "comments owner update" ON public.autopsy_comments
  FOR UPDATE USING (auth.uid() = user_id OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.autopsy_comment_votes (
  comment_id uuid NOT NULL REFERENCES public.autopsy_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  value smallint NOT NULL DEFAULT 1 CHECK (value = 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
ALTER TABLE public.autopsy_comment_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "votes public read" ON public.autopsy_comment_votes;
CREATE POLICY "votes public read" ON public.autopsy_comment_votes FOR SELECT USING (true);
DROP POLICY IF EXISTS "votes self insert" ON public.autopsy_comment_votes;
CREATE POLICY "votes self insert" ON public.autopsy_comment_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "votes self delete" ON public.autopsy_comment_votes;
CREATE POLICY "votes self delete" ON public.autopsy_comment_votes
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.recompute_comment_upvotes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_comment_id uuid;
  v_owner uuid;
  v_count int;
  v_karma int;
  v_new_rank text;
BEGIN
  v_comment_id := COALESCE(NEW.comment_id, OLD.comment_id);
  SELECT count(*) INTO v_count FROM public.autopsy_comment_votes WHERE comment_id = v_comment_id;
  UPDATE public.autopsy_comments SET upvote_count = v_count WHERE id = v_comment_id
    RETURNING user_id INTO v_owner;
  IF v_owner IS NOT NULL THEN
    SELECT COALESCE(SUM(c.upvote_count),0) INTO v_karma
      FROM public.autopsy_comments c WHERE c.user_id = v_owner AND c.is_hidden = false;
    SELECT slug INTO v_new_rank FROM public.user_ranks
      WHERE is_awardable_only = false AND min_karma <= v_karma
      ORDER BY min_karma DESC LIMIT 1;
    UPDATE public.profiles
      SET comment_karma = v_karma,
          rank_slug = CASE
            WHEN rank_slug IN (SELECT slug FROM public.user_ranks WHERE is_awardable_only) THEN rank_slug
            ELSE COALESCE(v_new_rank, 'newbie')
          END
      WHERE user_id = v_owner;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_votes_recompute ON public.autopsy_comment_votes;
CREATE TRIGGER trg_votes_recompute
  AFTER INSERT OR DELETE ON public.autopsy_comment_votes
  FOR EACH ROW EXECUTE FUNCTION public.recompute_comment_upvotes();

INSERT INTO storage.buckets (id, name, public)
  VALUES ('user-avatars','user-avatars', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'user-avatars');
DROP POLICY IF EXISTS "avatars self write" ON storage.objects;
CREATE POLICY "avatars self write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id='user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "avatars self update" ON storage.objects;
CREATE POLICY "avatars self update" ON storage.objects
  FOR UPDATE USING (bucket_id='user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "avatars self delete" ON storage.objects;
CREATE POLICY "avatars self delete" ON storage.objects
  FOR DELETE USING (bucket_id='user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
