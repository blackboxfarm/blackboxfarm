-- Create a table for storing development ideas and tasks
CREATE TABLE IF NOT EXISTS public.development_ideas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  priority text DEFAULT 'medium',
  status text DEFAULT 'backlog',
  estimated_effort text,
  tags text[],
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone
);

-- Enable RLS on development_ideas
ALTER TABLE public.development_ideas ENABLE ROW LEVEL SECURITY;

-- Create policy for development_ideas (users can only access their own ideas, null user_id is accessible to all)
CREATE POLICY "Users can manage development ideas" 
ON public.development_ideas 
FOR ALL 
USING (auth.uid() = user_id OR user_id IS NULL)
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Create trigger for development_ideas updated_at
CREATE TRIGGER update_development_ideas_updated_at
BEFORE UPDATE ON public.development_ideas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_development_ideas_user_category ON public.development_ideas(user_id, category);
CREATE INDEX idx_development_ideas_status ON public.development_ideas(status);
CREATE INDEX idx_development_ideas_priority ON public.development_ideas(priority);
CREATE INDEX idx_development_ideas_tags ON public.development_ideas USING GIN(tags);