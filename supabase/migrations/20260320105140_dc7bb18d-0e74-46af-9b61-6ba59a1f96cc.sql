
ALTER TABLE public.admin_notifications
ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX idx_admin_notifications_archived ON public.admin_notifications (is_archived) WHERE is_archived = false;
