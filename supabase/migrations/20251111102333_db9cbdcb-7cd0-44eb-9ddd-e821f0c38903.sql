-- Create advertiser_inquiries table
CREATE TABLE public.advertiser_inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  website TEXT,
  budget TEXT NOT NULL,
  campaign_goals TEXT NOT NULL,
  additional_info TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.advertiser_inquiries ENABLE ROW LEVEL SECURITY;

-- Super admins can view all inquiries
CREATE POLICY "Super admins can view all inquiries"
ON public.advertiser_inquiries
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Super admins can manage inquiries
CREATE POLICY "Super admins can manage inquiries"
ON public.advertiser_inquiries
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Service role can insert inquiries
CREATE POLICY "Service role can insert inquiries"
ON public.advertiser_inquiries
FOR INSERT
WITH CHECK (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_advertiser_inquiries_updated_at
BEFORE UPDATE ON public.advertiser_inquiries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for status filtering
CREATE INDEX idx_advertiser_inquiries_status ON public.advertiser_inquiries(status);

-- Create index for email lookups
CREATE INDEX idx_advertiser_inquiries_email ON public.advertiser_inquiries(email);