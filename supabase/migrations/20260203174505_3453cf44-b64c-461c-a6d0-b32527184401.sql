-- Create admin_notifications table for the notification badge system
CREATE TABLE IF NOT EXISTS public.admin_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Allow super admins to read/update notifications
CREATE POLICY "Super admins can view notifications" ON public.admin_notifications
    FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update notifications" ON public.admin_notifications
    FOR UPDATE TO authenticated
    USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Allow service role to insert (for edge functions)
CREATE POLICY "Service role can insert notifications" ON public.admin_notifications
    FOR INSERT
    WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_admin_notifications_created_at ON public.admin_notifications(created_at DESC);
CREATE INDEX idx_admin_notifications_is_read ON public.admin_notifications(is_read) WHERE is_read = false;

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;