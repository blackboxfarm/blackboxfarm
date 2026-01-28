-- Update the existing signup notification function to also create admin notification
CREATE OR REPLACE FUNCTION public.notify_admin_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert notification for new signup
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
  
  RETURN NEW;
END;
$$;