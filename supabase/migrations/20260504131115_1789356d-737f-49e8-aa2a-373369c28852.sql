-- Drop the overly permissive public-ALL policy
DROP POLICY IF EXISTS "Service role full access" ON public.web_chat_sessions;

-- Service role: full access (web-chat edge function operates as service_role)
CREATE POLICY "Service role full access on chat sessions"
ON public.web_chat_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users: can read & update their own sessions
CREATE POLICY "Users can view their own chat sessions"
ON public.web_chat_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat sessions"
ON public.web_chat_sessions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Super admins: read all sessions (for moderation/support)
CREATE POLICY "Super admins can view all chat sessions"
ON public.web_chat_sessions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete chat sessions"
ON public.web_chat_sessions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));