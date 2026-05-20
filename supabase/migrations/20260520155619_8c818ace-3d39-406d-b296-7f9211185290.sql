INSERT INTO public.social_posts_log (
  platform, content, status, post_type, title, hashtags,
  link_url, tags_mentions, cta_text, category, master_template_id
) VALUES (
  'x',
  E'✦ CTO confirmed on HoldersIntel ✦\nA community-led ticker surfacing right as the Vatican + Anthropic launch their AI encyclical (May 25) — rare AI-meets-mainstream news cycle.\n\nLive report → https://blackbox.farm/holders?token=FiEUFoZpjAdvoFRShKaxzuN5NXkuwe9jBPYDaeGpump\n\nNot financial advice.',
  'draft',
  'manual',
  'CTO spotted: community-led ticker riding the AI x faith news cycle',
  'CTO, Solana, AI, memecoin, HoldersIntel, Anthropic, crypto, communitytakeover',
  'https://blackbox.farm/holders?token=FiEUFoZpjAdvoFRShKaxzuN5NXkuwe9jBPYDaeGpump',
  '@HoldersIntel',
  'See the live CTO report → blackbox.farm',
  'Token Spotlight / CTO',
  gen_random_uuid()
);