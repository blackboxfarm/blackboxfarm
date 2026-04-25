-- Marketing Profiles: internal strategy hub for ICP, personas, playbooks, etc.
CREATE TABLE public.marketing_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section TEXT NOT NULL CHECK (section IN ('positioning','persona','playbook','competitor','message')),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (section, slug)
);

CREATE INDEX idx_marketing_profiles_section ON public.marketing_profiles(section, sort_order);

ALTER TABLE public.marketing_profiles ENABLE ROW LEVEL SECURITY;

-- Super admins only — internal strategy data
CREATE POLICY "Super admins can view marketing profiles"
  ON public.marketing_profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert marketing profiles"
  ON public.marketing_profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update marketing profiles"
  ON public.marketing_profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete marketing profiles"
  ON public.marketing_profiles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Auto-update updated_at
CREATE TRIGGER update_marketing_profiles_updated_at
BEFORE UPDATE ON public.marketing_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add optional persona tag to intel_briefings (nullable, no breakage)
ALTER TABLE public.intel_briefings
  ADD COLUMN IF NOT EXISTS target_persona_slug TEXT;

-- ============================================================
-- SEED: ICP analysis from chat — full content, day-one ready
-- ============================================================

INSERT INTO public.marketing_profiles (section, slug, title, sort_order, data) VALUES
('positioning', 'core', 'Core Positioning', 0, jsonb_build_object(
  'elevator_pitch', 'Every Solana token leaves fingerprints. We''re the only ones reading them.',
  'value_proposition', 'BlackBox Farm answers the one question every other tool ignores: "Who is on the other side of this trade?" We provide identity and attribution — wallet genealogy, developer reputation, holder forensics — not just price and contract checks.',
  'differentiation_pillars', jsonb_build_array(
    jsonb_build_object('title','Identity over Price','body','DexScreener tells you what is moving. We tell you who is moving it — funding chains, KYC roots, wallet families.'),
    jsonb_build_object('title','Reputation over Snapshots','body','RugCheck audits a contract once. We track the developer across every token they have ever launched.'),
    jsonb_build_object('title','Synthesis over Data Dumps','body','Solscan shows you raw transactions. We compress 30 minutes of investigation into a 30-second readable verdict.')
  ),
  'what_we_are_not', jsonb_build_array(
    'Not a trading bot or DEX aggregator',
    'Not a price chart provider',
    'Not a generic block explorer',
    'Not a hype/shill platform — we pay attention to receipts'
  )
));

INSERT INTO public.marketing_profiles (section, slug, title, sort_order, data) VALUES
('persona', 'awakened-degen', 'The Awakened Degen', 1, jsonb_build_object(
  'emoji','🔥',
  'summary','High-frequency Solana trader who got rugged enough times to stop trusting vibes.',
  'demographics', jsonb_build_object(
    'age','22–38',
    'role','Full-time/part-time trader, often anon',
    'capital_range','$2k – $250k bankroll',
    'time_on_chain','6 months – 3 years on Solana'
  ),
  'pain_points', jsonb_build_array(
    'Already has DexScreener + Photon + Bullx — still gets rugged weekly',
    'Knows wallets matter but cannot manually trace funding chains fast enough',
    'Misses CTOs and dev relaunches because nobody connects the dots across tokens',
    'Tired of "AI rug check" tools that flag everything green'
  ),
  'watering_holes', jsonb_build_array(
    'X: Solana trader lists, Pump.fun ecosystem accounts',
    'Telegram: degen call groups, Padre/BullX/Photon community chats',
    'Reddit: r/solana, r/CryptoMoonShots',
    'YouTube: trader streamers (Crypto Banter clones, Solana-focused)'
  ),
  'trigger_moments', jsonb_build_array(
    'Just got rugged — actively searching for "how to spot rugs"',
    'A coin they passed on 100x''d and they want to reverse-engineer why',
    'A trusted KOL got caught holding bags — credibility crisis'
  ),
  'hook','Stop trading blind. See the wallets behind every Solana token in 30 seconds.',
  'features_that_matter', jsonb_build_array('Bubble Map','Holders Analysis','Dev Genealogy','Telegram Bot','Live Feed'),
  'disqualifiers', jsonb_build_array('Pure spot/index investors with no Solana exposure','BTC/ETH maxis','People who refuse to use Telegram')
));

INSERT INTO public.marketing_profiles (section, slug, title, sort_order, data) VALUES
('persona', 'kyc-refugee', 'The Curious KYC Refugee', 2, jsonb_build_object(
  'emoji','🧠',
  'summary','Analytical professional moving from CEX to on-chain — frozen by data transparency.',
  'demographics', jsonb_build_object(
    'age','30–55',
    'role','Engineer, finance pro, founder, analyst',
    'capital_range','$10k – $1M, looking to allocate',
    'time_on_chain','0–6 months on-chain — recently left Coinbase/Binance'
  ),
  'pain_points', jsonb_build_array(
    'Realizes Solscan/DexScreener/Pump.fun show everything — but cannot tell what matters',
    'Decision paralysis: too much transparent data, no synthesis layer',
    'Wants to make informed allocations, not gambles, but lacks a guided framework',
    'Distrusts the "alpha group" culture — wants verifiable methodology'
  ),
  'watering_holes', jsonb_build_array(
    'Substack & long-form crypto analysis (Bankless, The Defiant)',
    'Twitter: analyst/researcher accounts (not pure traders)',
    'Podcasts: Empire, Bell Curve, Lightspeed',
    'LinkedIn crypto-finance groups',
    'Searches like "how to read solscan", "what does holder distribution mean"'
  ),
  'trigger_moments', jsonb_build_array(
    'Just made first DEX swap — overwhelmed by what they see',
    'Read a horror story about a rug and wants to vet their next pick properly',
    'Considering first $10k+ on-chain allocation'
  ),
  'hook','You can already see everything on Solana. We help you understand what you''re looking at.',
  'features_that_matter', jsonb_build_array('Intel Briefings','Holders Report','AI Interpretation','Oracle','Educational content'),
  'disqualifiers', jsonb_build_array('Pure degens chasing 100x','People who do not want to read more than a tweet','Anti-AI purists')
));

INSERT INTO public.marketing_profiles (section, slug, title, sort_order, data) VALUES
('persona', 'operator-researcher', 'The Project Operator / Researcher', 3, jsonb_build_object(
  'emoji','🛠️',
  'summary','Builders proving legitimacy + analysts/journalists needing forensic source-of-truth.',
  'demographics', jsonb_build_object(
    'age','25–50',
    'role','Token founders, marketing leads, on-chain journalists, VC analysts',
    'capital_range','N/A — operates on behalf of project/firm',
    'time_on_chain','1+ years, professionally invested'
  ),
  'pain_points', jsonb_build_array(
    'Founders: need to prove holder quality / no bots to skeptical investors',
    'Analysts: need a single API for ID resolution across pump.fun + creator wallets + socials',
    'Journalists: need verifiable forensic data they can cite, not screenshots'
  ),
  'watering_holes', jsonb_build_array(
    'Crypto Twitter analyst lists',
    'Discord builder communities (Solana Foundation, Helius, Jito)',
    'On-chain research firms (Messari, Nansen, Arkham audiences)',
    'Direct outreach via X DMs / hello@ emails'
  ),
  'trigger_moments', jsonb_build_array(
    'Project launch — needs holder credibility report',
    'Investigating a competitor or scam — needs a paper trail',
    'Building a dashboard or report — needs API access to clean data'
  ),
  'hook','The forensic source-of-truth for Solana token identity. Built for people who get cited.',
  'features_that_matter', jsonb_build_array('API','Bubble Map','Dev Reputation','Genealogy export','Custom reports'),
  'disqualifiers', jsonb_build_array('Hobbyists with no professional output','Projects unwilling to be transparent')
));

INSERT INTO public.marketing_profiles (section, slug, title, sort_order, data) VALUES
('competitor', 'matrix-default', 'Capability Matrix vs Solana Tooling', 0, jsonb_build_object(
  'competitors', jsonb_build_array('BlackBox Farm','DexScreener','Solscan','RugCheck','Bubblemaps.io'),
  'rows', jsonb_build_array(
    jsonb_build_object('capability','Real-time price & charts',     'values', jsonb_build_array('warn','yes','warn','no','no')),
    jsonb_build_object('capability','Holder distribution scoring',  'values', jsonb_build_array('yes','no','warn','warn','warn')),
    jsonb_build_object('capability','Wallet family / cluster maps', 'values', jsonb_build_array('yes','no','no','no','warn')),
    jsonb_build_object('capability','Developer genealogy across tokens','values', jsonb_build_array('yes','no','no','no','no')),
    jsonb_build_object('capability','Funding-chain / KYC root tracing','values', jsonb_build_array('yes','no','warn','no','no')),
    jsonb_build_object('capability','AI-synthesized verdict',       'values', jsonb_build_array('yes','no','no','warn','no')),
    jsonb_build_object('capability','Telegram bot integration',     'values', jsonb_build_array('yes','warn','no','warn','no')),
    jsonb_build_object('capability','Forensic Intel Briefings',     'values', jsonb_build_array('yes','no','no','no','no')),
    jsonb_build_object('capability','Public API for ID resolution', 'values', jsonb_build_array('yes','warn','yes','warn','no')),
    jsonb_build_object('capability','Free tier with real value',    'values', jsonb_build_array('yes','yes','yes','yes','warn'))
  )
));

INSERT INTO public.marketing_profiles (section, slug, title, sort_order, data) VALUES
('playbook', 'caught-today-x', 'Caught Today — X Feed', 1, jsonb_build_object(
  'personas', jsonb_build_array('awakened-degen'),
  'platform','X',
  'hook','Daily auto-post: "Caught today — wallet X funded scam Y, here''s the trail." Pulls from token-autopsy engine.',
  'cta','See the full forensic report → blackbox.farm/intel/<slug>',
  'asset_type','Breadcrumb image + thread',
  'status','Draft',
  'notes','Source: token_autopsy results table. Cap at 1–2 posts/day to avoid spam flagging on @blackbox_farm.'
)),
('playbook', 'read-first-token-yt', 'Read Your First Token — YouTube + /learn page', 2, jsonb_build_object(
  'personas', jsonb_build_array('kyc-refugee'),
  'platform','YouTube + Web',
  'hook','"Your first $10k on Solana — how to actually read a token before you buy." 8-min walkthrough using a real recent token.',
  'cta','Run your first analysis free → blackbox.farm/holders',
  'asset_type','Video + interactive /learn landing page',
  'status','Draft',
  'notes','Captures intent searches like "how to read solscan", "what is holder distribution", "is this token safe".'
)),
('playbook', 'wall-of-rugs-reddit', 'Wall of Rugs — Reddit Social Proof', 3, jsonb_build_object(
  'personas', jsonb_build_array('awakened-degen','kyc-refugee'),
  'platform','Reddit',
  'hook','Public archive of historical "catches" — tokens our system flagged before they rugged, with evidence.',
  'cta','Check any token before you ape → blackbox.farm',
  'asset_type','Public web page + weekly Reddit recap post',
  'status','Draft',
  'notes','Post in r/solana, r/CryptoMoonShots. Title format: "X tokens our forensic engine flagged this week — here''s the evidence."'
)),
('playbook', 'api-cold-outreach', 'API Cold Outreach — Operators', 4, jsonb_build_object(
  'personas', jsonb_build_array('operator-researcher'),
  'platform','Email + X DM',
  'hook','"You''re building on Solana. We resolve identity across pump.fun, dev wallets, and socials in one API call. Here''s a free key for 30 days."',
  'cta','Get sandbox API key → blackbox.farm/api-docs',
  'asset_type','1-page PDF + sample API response',
  'status','Draft',
  'notes','Target: VC analysts (Multicoin, Pantera, Delphi), research firms, on-chain journalists.'
));

INSERT INTO public.marketing_profiles (section, slug, title, sort_order, data) VALUES
('message', 'tweet-degen-fingerprints', 'Tweet — Fingerprints (Awakened Degen)', 1, jsonb_build_object(
  'persona','awakened-degen','channel','X','length','tweet',
  'body','Every Solana token leaves fingerprints.\n\nDexScreener shows you the price.\nWe show you who''s holding the gun.\n\nblackbox.farm'
)),
('message', 'tweet-degen-30sec', 'Tweet — 30-second verdict', 2, jsonb_build_object(
  'persona','awakened-degen','channel','X','length','tweet',
  'body','30 seconds. One token. Full holder + dev forensic report.\n\nPaste a CA into @BlackBoxFarmBot and stop trading blind.'
)),
('message', 'tg-degen-rugcheck', 'TG post — Rug check shortform', 3, jsonb_build_object(
  'persona','awakened-degen','channel','Telegram','length','short',
  'body','🔍 Before you ape:\n→ Who funded the dev wallet?\n→ Have these holders rugged before?\n→ Is this dev''s 4th relaunch?\n\nBlackBox Farm answers all 3 in 30 seconds. Free.\n\nblackbox.farm'
)),
('message', 'email-kyc-subject-frozen', 'Email subject — KYC Refugee', 4, jsonb_build_object(
  'persona','kyc-refugee','channel','Email','length','subject',
  'body','You can see everything on Solana. Here''s how to know what matters.'
)),
('message', 'email-kyc-body-first10k', 'Email body — First $10k allocation', 5, jsonb_build_object(
  'persona','kyc-refugee','channel','Email','length','long',
  'body','You moved off Coinbase. You opened Solscan. You saw 14,000 holders, 3,000 transactions, 12 social links — and froze.\n\nYou''re not the problem. The data is transparent — but transparent isn''t the same as readable.\n\nBlackBox Farm is the synthesis layer. We read 30 minutes of on-chain investigation in 30 seconds:\n\n• Who actually holds this token? (Real holders vs sybils vs bots)\n• Has this developer launched anything else? (Often yes — and rugged)\n• Where did the liquidity come from? (Sometimes a wallet that funded 12 prior scams)\n\nStart here — free, no signup needed: blackbox.farm/holders\n\nP.S. We also publish weekly Intel Briefings that walk through real cases. The kind of thing that turns "I''m frozen" into "now I know what to look for."'
)),
('message', 'ig-caption-breadcrumb', 'IG caption — Breadcrumb visual', 6, jsonb_build_object(
  'persona','awakened-degen','channel','Instagram','length','caption',
  'body','Crypto has hands.\nWe show them.\n\nBlackBox Farm — Solana forensic intelligence.\n→ blackbox.farm'
)),
('message', 'tweet-operator-api', 'Tweet — Operator/API hook', 7, jsonb_build_object(
  'persona','operator-researcher','channel','X','length','tweet',
  'body','Building on Solana? We resolve token identity — pump.fun creator → dev wallets → KYC root → socials — in one API call.\n\nCited by analysts. Free sandbox key:\n→ blackbox.farm/api-docs'
));