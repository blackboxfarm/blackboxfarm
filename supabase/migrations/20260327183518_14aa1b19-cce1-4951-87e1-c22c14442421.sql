-- Add status/approval fields to repurpose_scraped_posts
ALTER TABLE public.repurpose_scraped_posts 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Add scheduling fields to content_drafts
ALTER TABLE public.content_drafts
  ADD COLUMN IF NOT EXISTS schedule_post_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS target_platforms text[] DEFAULT '{}';

-- Create index for scheduled posts
CREATE INDEX IF NOT EXISTS idx_content_drafts_schedule 
  ON public.content_drafts(schedule_post_at) 
  WHERE status = 'approved' AND schedule_post_at IS NOT NULL;