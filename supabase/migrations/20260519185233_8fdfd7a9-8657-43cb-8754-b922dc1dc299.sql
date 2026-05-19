ALTER TABLE public.ai_compute_log ADD COLUMN IF NOT EXISTS function_name TEXT;
CREATE INDEX IF NOT EXISTS idx_ai_compute_log_function_name ON public.ai_compute_log(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_compute_log_created_at_desc ON public.ai_compute_log(created_at DESC);