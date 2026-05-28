DELETE FROM public.telegram_insider_token_lifecycle;

CREATE TABLE IF NOT EXISTS public.pipeline_reset_markers (
  pipeline_name text PRIMARY KEY,
  reset_after timestamptz NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pipeline_reset_markers TO anon;
GRANT SELECT ON public.pipeline_reset_markers TO authenticated;
GRANT ALL ON public.pipeline_reset_markers TO service_role;

ALTER TABLE public.pipeline_reset_markers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pipeline reset markers are readable" ON public.pipeline_reset_markers;
CREATE POLICY "Pipeline reset markers are readable"
ON public.pipeline_reset_markers
FOR SELECT
USING (true);

INSERT INTO public.pipeline_reset_markers (pipeline_name, reset_after, note, updated_at)
VALUES (
  'insiders_no_lube_process_queue',
  now(),
  'Manual reset: visible Process queue wiped; lifecycle builder must ignore pre-reset telegram_channel_calls history.',
  now()
)
ON CONFLICT (pipeline_name) DO UPDATE SET
  reset_after = EXCLUDED.reset_after,
  note = EXCLUDED.note,
  updated_at = now();