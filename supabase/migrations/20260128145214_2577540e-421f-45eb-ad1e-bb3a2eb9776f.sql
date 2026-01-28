-- Update the signup notification function to call the edge function
-- Since we can't make HTTP calls directly from triggers, we'll use pg_net
CREATE OR REPLACE FUNCTION public.notify_admin_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key TEXT;
BEGIN
  -- Insert notification for new signup (database badge)
  INSERT INTO public.admin_notifications (
    notification_type,
    title,
    message,
    metadata
  ) VALUES (
    'new_signup',
    'New User Signup',
    'New user registered: ' || COALESCE(NEW.email, 'Unknown email'),
    jsonb_build_object(
      'user_id', NEW.id,
      'email', NEW.email,
      'created_at', NEW.created_at
    )
  );
  
  -- Call the signup-notify edge function via pg_net for email + telegram
  PERFORM net.http_post(
    url := 'https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/signup-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU'
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'record', jsonb_build_object(
        'id', NEW.id,
        'email', NEW.email,
        'created_at', NEW.created_at
      )
    )
  );
  
  RETURN NEW;
END;
$$;