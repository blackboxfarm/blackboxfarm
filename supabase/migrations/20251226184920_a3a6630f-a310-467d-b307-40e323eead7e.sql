-- Create twitter_accounts table for managing Twitter/X accounts
CREATE TABLE public.twitter_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Account credentials
  username TEXT NOT NULL,
  password_encrypted TEXT,
  email TEXT,
  email_password_encrypted TEXT,
  
  -- Profile info
  display_name TEXT,
  bio TEXT,
  website TEXT,
  location TEXT,
  
  -- Images (stored as URLs from storage)
  profile_image_url TEXT,
  banner_image_url TEXT,
  
  -- Organization
  group_name TEXT DEFAULT 'Ungrouped',
  tags TEXT[] DEFAULT '{}',
  
  -- Status & meta
  account_status TEXT DEFAULT 'active',
  notes TEXT,
  is_verified BOOLEAN DEFAULT false,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.twitter_accounts ENABLE ROW LEVEL SECURITY;

-- Create policy for super admins only
CREATE POLICY "Super admins can manage twitter accounts" ON public.twitter_accounts
  FOR ALL USING (
    public.is_super_admin(auth.uid())
  );

-- Create updated_at trigger
CREATE TRIGGER update_twitter_accounts_updated_at
  BEFORE UPDATE ON public.twitter_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for twitter assets
INSERT INTO storage.buckets (id, name, public) VALUES ('twitter-assets', 'twitter-assets', true);

-- Allow super admins to upload to twitter-assets bucket
CREATE POLICY "Super admins can upload twitter assets" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'twitter-assets' AND 
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "Super admins can update twitter assets" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'twitter-assets' AND 
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "Super admins can delete twitter assets" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'twitter-assets' AND 
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "Anyone can view twitter assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'twitter-assets');