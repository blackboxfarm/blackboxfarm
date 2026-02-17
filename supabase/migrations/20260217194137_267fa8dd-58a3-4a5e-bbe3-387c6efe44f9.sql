
-- Add rehabilitation columns to pumpfun_rejected_backcheck
ALTER TABLE public.pumpfun_rejected_backcheck
  ADD COLUMN rehabilitation_status TEXT DEFAULT 'none',
  ADD COLUMN rehabilitated_at TIMESTAMPTZ,
  ADD COLUMN rehabilitated_by UUID;

-- Index for filtering by rehab status
CREATE INDEX idx_rejected_backcheck_rehab ON public.pumpfun_rejected_backcheck (rehabilitation_status) WHERE rehabilitation_status != 'none';

COMMENT ON COLUMN public.pumpfun_rejected_backcheck.rehabilitation_status IS 'none | pending_review | rehabilitated | confirmed_bad';
