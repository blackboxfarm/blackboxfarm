ALTER TABLE public.profile_subscription_configs
  ADD COLUMN IF NOT EXISTS paid_welcome_copy TEXT,
  ADD COLUMN IF NOT EXISTS paid_welcome_image_url TEXT;

UPDATE public.profile_subscription_configs
SET paid_welcome_copy = $$💋 <b>You're in.</b>

Welcome to <b>All Lubed Up! Alpha</b> — the room is small on purpose.

Here's what happens now:
• 🔓 You've been added to the private channel — tap the invite above.
• 🧠 Rare MINT calls drop here first. No filler.
• 💀 Dev reputation reads come with every signal — I'll tell you who's Based and who's suss.
• 📅 Your access runs until <b>{expires_at}</b>. I'll nudge you before it lapses.

Questions? Just reply here.

Luna 💋$$
WHERE profile_key = 'no_lube';