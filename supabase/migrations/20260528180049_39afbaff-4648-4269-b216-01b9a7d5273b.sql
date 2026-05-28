DELETE FROM public.telegram_insider_token_lifecycle;

INSERT INTO public.pipeline_reset_markers (pipeline_name, reset_after, note, updated_at)
VALUES (
  'insiders_no_lube_process_queue',
  now(),
  'Manual reset: visible Process queue wiped again; lifecycle builder ignores rows whose Telegram message time or DB created time is pre-reset.',
  now()
)
ON CONFLICT (pipeline_name) DO UPDATE SET
  reset_after = EXCLUDED.reset_after,
  note = EXCLUDED.note,
  updated_at = now();