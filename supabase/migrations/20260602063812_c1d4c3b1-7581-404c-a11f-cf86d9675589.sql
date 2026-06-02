ALTER TABLE public.profile_subscription_configs
  ADD COLUMN IF NOT EXISTS welcome_image_url text;

UPDATE public.profile_subscription_configs
SET
  welcome_image_url = 'https://blackboxfarm.lovable.app/__l5e/assets-v1/cae76e9f-b2f5-4a9b-92e9-d45bdd601958/luna-welcome.jpg',
  welcome_copy = $copy$You're inside the door of <b>All Lubed Up! Alpha</b> — my private side ❤️

<b>What you get</b>
• 🛢️  Insider 2× / 5× / 10× alerts the moment our mesh flags them — usually minutes before public chats catch on.
• 🧬  Full dev dossiers: KYC root, prior tickers, ATH history, sister wallets, X handle rotation.
• 🕸️  Bubble-map links pre-loaded with the forensic layer (Hacker Terminal, X Community panning, Solar Cluster).
• 📈  Live momentum + holder-quality scores from the HoldersIntel engine, no rate limits.
• 🎯  Rare calls: I catch a token MINT in action by a Chad who I know has a pro record — you know first.
• 👀  If I've seen the Dev before I'll tell you if I think he's suss or Based. All Devs have a Reputation and I keep score… 💀

<b>How payment works</b>
1. Tap a plan below.
2. I'll DM you a unique Solana deposit address and the exact SOL amount (quoted live, valid 30 min).
3. Send the SOL. The moment it lands you get a 1-use invite link to the private channel — fully automatic, no human in the loop.

No refunds, no subscriptions auto-renew, no card on file. Pure SOL, pure access.

Luna 💋$copy$
WHERE profile_key = 'no_lube';