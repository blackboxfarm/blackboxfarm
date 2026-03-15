-- Track follow requests for community blue-checked members
CREATE TABLE public.community_follow_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id TEXT NOT NULL,
  target_handle TEXT NOT NULL,
  target_x_user_id TEXT, -- X restId for API calls
  is_blue_verified BOOLEAN DEFAULT false,
  community_role TEXT, -- 'Admin', 'Moderator', 'member'
  followers_count INTEGER,
  follow_status TEXT DEFAULT 'not_followed', -- not_followed, pending, followed, follow_back, unfollowed, error
  followed_at TIMESTAMPTZ,
  follow_back_detected_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(community_id, target_handle)
);

-- RLS
ALTER TABLE public.community_follow_targets ENABLE ROW LEVEL SECURITY;

-- Only super admins can access
CREATE POLICY "Super admins can manage follow targets"
  ON public.community_follow_targets
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Index for lookups
CREATE INDEX idx_community_follow_targets_community ON public.community_follow_targets(community_id);
CREATE INDEX idx_community_follow_targets_status ON public.community_follow_targets(follow_status);