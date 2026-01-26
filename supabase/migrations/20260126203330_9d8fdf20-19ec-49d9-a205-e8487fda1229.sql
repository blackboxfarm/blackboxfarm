-- Add page_name column to track which page the visit is from
ALTER TABLE public.holders_page_visits 
ADD COLUMN IF NOT EXISTS page_name text DEFAULT 'holders';

-- Create index for efficient filtering by page
CREATE INDEX IF NOT EXISTS idx_holders_page_visits_page_name 
ON public.holders_page_visits(page_name);

-- Update existing records to have the default page name
UPDATE public.holders_page_visits 
SET page_name = 'holders' 
WHERE page_name IS NULL;