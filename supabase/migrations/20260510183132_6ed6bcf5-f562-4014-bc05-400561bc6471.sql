CREATE TABLE IF NOT EXISTS public.coverage_milestone_sms_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_key TEXT NOT NULL,
  pct INTEGER NOT NULL,
  count_at_send INTEGER,
  total_at_send INTEGER,
  body TEXT,
  to_phone TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cmsl_sent_at ON public.coverage_milestone_sms_log (sent_at DESC);
ALTER TABLE public.coverage_milestone_sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins read sms log" ON public.coverage_milestone_sms_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));