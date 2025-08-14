-- Create table for storing valid access passwords
CREATE TABLE public.access_passwords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  password_hash TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable Row Level Security
ALTER TABLE public.access_passwords ENABLE ROW LEVEL SECURITY;

-- Create policy to allow reading passwords (needed for authentication)
CREATE POLICY "Allow reading access passwords" 
ON public.access_passwords 
FOR SELECT 
USING (true);

-- Insert the two passwords (storing as plain text for simplicity as requested)
INSERT INTO public.access_passwords (password_hash, label) VALUES 
('!apple123', 'Apple Password'),
('!simple123', 'Simple Password');