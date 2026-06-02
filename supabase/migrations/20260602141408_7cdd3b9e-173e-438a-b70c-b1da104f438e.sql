
ALTER TABLE public.profile_subscription_configs
  ADD COLUMN IF NOT EXISTS affiliate_preamble_variants TEXT[] DEFAULT ARRAY[
    '💎 Insider perk: your personal referral link is in your DMs. Every paid friend = +1 month free, stacked on top of your current expiry. Auto-applied.',
    '👀 Earn free months by inviting friends. Subscribe once → get a referral link → +1 month per paid signup, forever stackable. No cap.',
    '🎁 Reminder: every paid friend you bring in adds +1 free month to your subscription. Grab your link with /start in DMs.'
  ],
  ADD COLUMN IF NOT EXISTS affiliate_preamble_interval_hours INT NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS affiliate_preamble_last_posted_at TIMESTAMPTZ;
