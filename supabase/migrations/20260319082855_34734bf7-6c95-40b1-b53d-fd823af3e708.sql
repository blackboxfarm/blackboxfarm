-- Table to track ALL Stripe customers regardless of whether they have a site account
CREATE TABLE public.stripe_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id text NOT NULL UNIQUE,
  stripe_subscription_id text,
  email text NOT NULL,
  name text,
  tier_key text DEFAULT 'pro',
  is_active boolean DEFAULT true,
  amount_cents integer,
  currency text DEFAULT 'usd',
  interval text, -- 'month' or 'year'
  current_period_end timestamptz,
  stripe_product_id text,
  matched_user_id uuid, -- nullable - only set if they have a Supabase account
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;

-- Only super admins can read
CREATE POLICY "Super admins can read stripe_customers"
  ON public.stripe_customers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role can do anything (for webhook)
CREATE POLICY "Service role full access on stripe_customers"
  ON public.stripe_customers FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for lookups
CREATE INDEX idx_stripe_customers_email ON public.stripe_customers(email);
CREATE INDEX idx_stripe_customers_stripe_id ON public.stripe_customers(stripe_customer_id);