-- Testimonials table
CREATE TABLE public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_account_id uuid REFERENCES public.twitter_accounts(id) ON DELETE SET NULL,
  twitter_handle text,
  display_name text,
  avatar_url text,
  testimonial_text text NOT NULL,
  role_label text DEFAULT 'Community Member',
  is_approved boolean DEFAULT false,
  is_internal boolean DEFAULT false,
  sort_order int DEFAULT 0,
  invite_token text,
  submitted_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read approved testimonials"
  ON public.testimonials FOR SELECT
  USING (is_approved = true);

CREATE POLICY "Anon can insert testimonials via invite"
  ON public.testimonials FOR INSERT
  TO anon
  WITH CHECK (invite_token IS NOT NULL);

CREATE POLICY "Authenticated users can insert testimonials"
  ON public.testimonials FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Super admins full access to testimonials"
  ON public.testimonials FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Invite tokens table
CREATE TABLE public.testimonial_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  label text,
  max_uses int DEFAULT 1,
  use_count int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE public.testimonial_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage invites"
  ON public.testimonial_invites FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can validate invite tokens"
  ON public.testimonial_invites FOR SELECT
  USING (is_active = true);