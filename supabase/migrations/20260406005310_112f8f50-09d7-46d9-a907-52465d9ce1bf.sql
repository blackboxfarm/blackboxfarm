
-- User Journey Events table for tracking authenticated user actions
CREATE TABLE public.user_journey_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text,
  event_type text NOT NULL DEFAULT 'page_view',
  event_name text NOT NULL,
  page_path text,
  metadata jsonb DEFAULT '{}',
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_journey_events_user_id ON public.user_journey_events(user_id);
CREATE INDEX idx_journey_events_created_at ON public.user_journey_events(created_at DESC);
CREATE INDEX idx_journey_events_event_type ON public.user_journey_events(event_type);
CREATE INDEX idx_journey_events_user_created ON public.user_journey_events(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.user_journey_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own events
CREATE POLICY "Users can insert own journey events"
ON public.user_journey_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admins can read all events via security definer function
CREATE POLICY "Admins can read all journey events"
ON public.user_journey_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Users can read their own events
CREATE POLICY "Users can read own journey events"
ON public.user_journey_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
