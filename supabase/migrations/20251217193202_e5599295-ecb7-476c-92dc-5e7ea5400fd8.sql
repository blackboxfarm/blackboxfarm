-- Create advertiser accounts table with payment wallets
CREATE TABLE public.advertiser_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  twitter_handle text,
  payment_wallet_pubkey text NOT NULL,
  payment_wallet_secret_encrypted text NOT NULL,
  total_spent_sol numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create banner orders table
CREATE TABLE public.banner_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  link_url text NOT NULL,
  title text NOT NULL DEFAULT 'Banner Ad',
  duration_hours integer NOT NULL,
  price_usd numeric NOT NULL,
  price_sol numeric,
  sol_price_at_order numeric,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  payment_status text DEFAULT 'pending',
  payment_confirmed_at timestamptz,
  activation_key text,
  banner_ad_id uuid REFERENCES public.banner_ads(id),
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.advertiser_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banner_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for advertiser_accounts
CREATE POLICY "Users can view their own advertiser account"
ON public.advertiser_accounts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own advertiser account"
ON public.advertiser_accounts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own advertiser account"
ON public.advertiser_accounts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Super admins can manage all advertiser accounts"
ON public.advertiser_accounts FOR ALL
USING (is_super_admin(auth.uid()));

-- RLS Policies for banner_orders
CREATE POLICY "Users can view their own banner orders"
ON public.banner_orders FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.advertiser_accounts aa
  WHERE aa.id = banner_orders.advertiser_id AND aa.user_id = auth.uid()
));

CREATE POLICY "Users can create banner orders for their account"
ON public.banner_orders FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.advertiser_accounts aa
  WHERE aa.id = banner_orders.advertiser_id AND aa.user_id = auth.uid()
));

CREATE POLICY "Users can update their own banner orders"
ON public.banner_orders FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.advertiser_accounts aa
  WHERE aa.id = banner_orders.advertiser_id AND aa.user_id = auth.uid()
));

CREATE POLICY "Super admins can manage all banner orders"
ON public.banner_orders FOR ALL
USING (is_super_admin(auth.uid()));

-- Create storage bucket for banner images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('banner-images', 'banner-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for banner images
CREATE POLICY "Anyone can view banner images"
ON storage.objects FOR SELECT
USING (bucket_id = 'banner-images');

CREATE POLICY "Authenticated users can upload banner images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'banner-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own banner images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'banner-images' AND auth.uid() IS NOT NULL);

-- Indexes for performance
CREATE INDEX idx_banner_orders_advertiser ON public.banner_orders(advertiser_id);
CREATE INDEX idx_banner_orders_status ON public.banner_orders(payment_status);
CREATE INDEX idx_banner_orders_start_time ON public.banner_orders(start_time);
CREATE INDEX idx_advertiser_accounts_user ON public.advertiser_accounts(user_id);

-- Update timestamp trigger
CREATE TRIGGER update_advertiser_accounts_updated_at
BEFORE UPDATE ON public.advertiser_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_banner_orders_updated_at
BEFORE UPDATE ON public.banner_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();