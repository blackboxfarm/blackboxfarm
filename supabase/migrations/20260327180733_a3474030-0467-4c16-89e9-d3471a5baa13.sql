-- Table for preset source accounts to scrape
CREATE TABLE public.repurpose_source_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  display_name text,
  notes text,
  is_active boolean DEFAULT true,
  last_scraped_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.repurpose_source_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage source accounts"
  ON public.repurpose_source_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table for scraped posts from source accounts
CREATE TABLE public.repurpose_scraped_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_account_id uuid REFERENCES public.repurpose_source_accounts(id) ON DELETE CASCADE,
  tweet_id text UNIQUE NOT NULL,
  username text NOT NULL,
  tweet_text text,
  image_urls jsonb DEFAULT '[]'::jsonb,
  tweet_url text,
  posted_at timestamptz,
  engagement jsonb DEFAULT '{}'::jsonb,
  is_repurposed boolean DEFAULT false,
  scraped_at timestamptz DEFAULT now()
);

ALTER TABLE public.repurpose_scraped_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage scraped posts"
  ON public.repurpose_scraped_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table for AI-generated content drafts
CREATE TABLE public.content_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_post_id uuid REFERENCES public.repurpose_scraped_posts(id) ON DELETE SET NULL,
  original_text text,
  original_image_url text,
  repurposed_text text,
  repurposed_image_url text,
  target_platforms text[] DEFAULT '{}',
  status text DEFAULT 'draft',
  posted_platforms jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage content drafts"
  ON public.content_drafts FOR ALL TO authenticated USING (true) WITH CHECK (true);
