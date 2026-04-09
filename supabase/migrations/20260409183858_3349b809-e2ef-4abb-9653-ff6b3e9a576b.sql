
-- Email templates table for admin-editable outgoing emails
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Only super_admins can manage email templates
CREATE POLICY "Super admins can view email templates"
ON public.email_templates FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert email templates"
ON public.email_templates FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update email templates"
ON public.email_templates FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete email templates"
ON public.email_templates FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Service role needs access from edge functions
CREATE POLICY "Service role can read email templates"
ON public.email_templates FOR SELECT TO service_role
USING (true);

-- Seed with known template keys
INSERT INTO public.email_templates (template_key, display_name, subject) VALUES
  ('subscriber_welcome', 'Subscriber Welcome', '🎉 Welcome to BlackBox {{tier}}!'),
  ('new_user_welcome', 'New User Welcome', '🎉 Welcome to BlackBox Farm — Your Account is Ready!'),
  ('subscription_renewed', 'Subscription Renewed', '✅ Payment Confirmed — BlackBox {{tier}}'),
  ('subscription_cancelled', 'Subscription Cancelled', 'Your BlackBox {{tier}} Subscription Has Been Cancelled'),
  ('sol_payment_confirmed', 'SOL Payment Confirmed', '✅ SOL Payment Received — BlackBox Pro Yearly'),
  ('email_verification', 'Email Verification', 'Verify your email for BlackBox Farm'),
  ('ai_analysis_delivery', 'AI Analysis Delivery', 'AI Token Analysis: {{token}}'),
  ('signup_admin_notify', 'Admin New Signup Notice', 'New BlackBox signup: {{email}}');

-- Timestamp trigger
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
