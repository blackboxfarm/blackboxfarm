
-- Support tickets table
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number serial UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  category text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to uuid REFERENCES auth.users(id),
  user_id uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Support ticket replies
CREATE TABLE public.support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  reply_by uuid REFERENCES auth.users(id),
  reply_type text NOT NULL DEFAULT 'admin' CHECK (reply_type IN ('admin', 'user', 'system')),
  message text NOT NULL,
  is_internal_note boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_replies ENABLE ROW LEVEL SECURITY;

-- Tickets: admins can do everything, anon can insert (contact form)
CREATE POLICY "Anon can create tickets" ON public.support_tickets
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Authenticated can create tickets" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can view all tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Replies: admins full access, users can see non-internal replies on their tickets
CREATE POLICY "Admins can manage replies" ON public.support_ticket_replies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view replies on their tickets" ON public.support_ticket_replies
  FOR SELECT TO authenticated
  USING (
    NOT is_internal_note AND
    EXISTS (
      SELECT 1 FROM public.support_tickets t 
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can reply to their tickets" ON public.support_ticket_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    reply_type = 'user' AND
    EXISTS (
      SELECT 1 FROM public.support_tickets t 
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_priority ON public.support_tickets(priority);
CREATE INDEX idx_support_tickets_email ON public.support_tickets(email);
CREATE INDEX idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX idx_support_ticket_replies_ticket_id ON public.support_ticket_replies(ticket_id);
