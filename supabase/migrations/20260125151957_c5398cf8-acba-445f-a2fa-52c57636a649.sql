-- Add auth status tracking to holders_page_visits
ALTER TABLE public.holders_page_visits 
ADD COLUMN IF NOT EXISTS is_authenticated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auth_method TEXT; -- 'anonymous', 'email', 'google', 'wallet' etc

-- Add index for auth status queries
CREATE INDEX IF NOT EXISTS idx_holders_visits_auth_status ON public.holders_page_visits(is_authenticated);

COMMENT ON COLUMN public.holders_page_visits.is_authenticated IS 'Whether user was logged in during visit';
COMMENT ON COLUMN public.holders_page_visits.auth_method IS 'How user authenticated: anonymous, email, google, wallet, etc';