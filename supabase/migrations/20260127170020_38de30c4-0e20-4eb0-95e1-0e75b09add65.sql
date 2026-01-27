-- Create table for tracking manual comments on tokens per day
CREATE TABLE public.dailies_manual_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  comment_date DATE NOT NULL,
  raw_feed_comment BOOLEAN DEFAULT false,
  reply_to_post BOOLEAN DEFAULT false,
  community_comment BOOLEAN DEFAULT false,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(token_mint, comment_date)
);

-- Enable RLS
ALTER TABLE public.dailies_manual_comments ENABLE ROW LEVEL SECURITY;

-- RLS policy: Only super admins can access
CREATE POLICY "Super admins can manage dailies comments"
ON public.dailies_manual_comments
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Create updated_at trigger
CREATE TRIGGER update_dailies_manual_comments_updated_at
BEFORE UPDATE ON public.dailies_manual_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for fast lookups by date
CREATE INDEX idx_dailies_manual_comments_date ON public.dailies_manual_comments(comment_date);
CREATE INDEX idx_dailies_manual_comments_token ON public.dailies_manual_comments(token_mint);