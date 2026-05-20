
INSERT INTO public.token_cto_status (token_mint, is_cto, signals, admin_override)
VALUES (
  'FiEUFoZpjAdvoFRShKaxzuN5NXkuwe9jBPYDaeGpump',
  true,
  '[{"signal":"admin_curated","detail":"Flagged by Super Admin as Community Takeover","at":"2026-05-20"}]'::jsonb,
  true
)
ON CONFLICT (token_mint) DO UPDATE
SET is_cto = EXCLUDED.is_cto,
    signals = EXCLUDED.signals,
    admin_override = true,
    updated_at = now();

INSERT INTO public.token_narrative_links (token_mint, url, title, source_domain, editor_note)
VALUES (
  'FiEUFoZpjAdvoFRShKaxzuN5NXkuwe9jBPYDaeGpump',
  'https://baptistnews.com/article/pope-and-co-founder-of-anthropic-to-launch-pontiffs-ai-encyclical-on-may-25/',
  'Pope and co-founder of Anthropic to launch pontiff''s AI encyclical on May 25',
  'baptistnews.com',
  'Cultural backdrop: the Vatican and Anthropic''s co-founder are jointly launching an AI encyclical — a rare moment where AI, ethics and mainstream institutions converge in headline coverage. Community-driven tickers tied to AI narratives sometimes ride that kind of thematic tailwind. Context only — not financial advice.'
);
