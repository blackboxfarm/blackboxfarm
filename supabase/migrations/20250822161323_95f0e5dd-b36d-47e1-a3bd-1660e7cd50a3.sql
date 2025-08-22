-- Create table for storing user secrets
CREATE TABLE public.user_secrets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rpc_url TEXT NOT NULL,
  trading_private_key TEXT NOT NULL,
  function_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_secrets ENABLE ROW LEVEL SECURITY;

-- Create policy for users to manage their own secrets
CREATE POLICY "Users can manage their own secrets"
ON public.user_secrets
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_secrets_updated_at
BEFORE UPDATE ON public.user_secrets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();