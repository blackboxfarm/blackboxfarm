import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// ─── Rate limiting ───
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(identifier: string, tier: string): boolean {
  const now = Date.now();
  const maxPerHour = tier === 'paid' ? 60 : tier === 'free' ? 20 : 15;
  const window = 3600_000;
  const timestamps = rateLimitMap.get(identifier) || [];
  const recent = timestamps.filter(t => now - t < window);
  if (recent.length >= maxPerHour) return false;
  recent.push(now);
  rateLimitMap.set(identifier, recent.slice(-100));
  return true;
}

// ─── Solana address regex ───
const SOLANA_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
const TWITTER_HANDLE_RE = /(?:@([a-zA-Z0-9_]{1,15}))|(?:(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,15}))/i;

// ─── User Memory & Context ───
async function loadUserMemory(userId?: string, sessionId?: string): Promise<any> {
  if (userId) {
    const { data } = await supabase.from('ai_user_memory').select('*').eq('user_id', userId).maybeSingle();
    return data;
  }
  if (sessionId) {
    const { data } = await supabase.from('ai_user_memory').select('*').eq('session_id', sessionId).maybeSingle();
    return data;
  }
  return null;
}

async function upsertMemory(memory: any, updates: Record<string, any>): Promise<void> {
  if (memory?.id) {
    await supabase.from('ai_user_memory').update({
      ...updates,
      interaction_count: (memory.interaction_count || 0) + 1,
      last_platform: 'web',
    }).eq('id', memory.id);
  } else if (updates.user_id || updates.session_id) {
    await supabase.from('ai_user_memory').insert({
      ...updates,
      interaction_count: 1,
      last_platform: 'web',
    });
  }
}

async function buildUserProfile(userId?: string, memory?: any): Promise<string> {
  let profile = '## USER PROFILE\n';

  if (memory?.preferred_name) {
    profile += `- Name: ${memory.preferred_name} (they prefer this)\n`;
  }

  if (memory?.referral_tag === 'dave') {
    profile += `- 🔑 REFERRAL: This visitor said "Dave sent them". Dave is the founder's real name. Treat them with warm continuity ("welcome back — Dave's guest"). Do NOT explain that Dave is the founder; just honor the signal silently/warmly.\n`;
    if (memory?.referral_first_seen_at) {
      profile += `- Referral first seen: ${new Date(memory.referral_first_seen_at).toLocaleDateString()}\n`;
    }
  } else if (memory?.referral_tag === 'tom') {
    profile += `- 🔑 REFERRAL: This visitor said "Tom sent them". Tom is a family member of the founder who rides a OneWheel (also called an EUC / electric unicycle). Treat them warmly. If hobbies or who Tom is comes up naturally, you may reference the OneWheel/EUC connection — otherwise just honor the signal silently.\n`;
    if (memory?.referral_first_seen_at) {
      profile += `- Referral first seen: ${new Date(memory.referral_first_seen_at).toLocaleDateString()}\n`;
    }
  }

  if (memory?.language_preference && memory.language_preference !== 'en') {
    profile += `- Preferred language: ${memory.language_preference}\n`;
  }

  if (memory?.interests?.length > 0) {
    profile += `- Interests: ${memory.interests.join(', ')}\n`;
  }

  profile += `- Platform: Website\n`;
  profile += `- Interaction count: ${memory?.interaction_count || 0}\n`;

  // Cross-reference with Telegram
  if (memory?.telegram_user_id) {
    profile += `- Also registered on Telegram (TG user ID: ${memory.telegram_user_id})\n`;
  } else if (userId) {
    // Check telegram_link_codes for cross-platform identity
    const { data: tgLink } = await supabase
      .from('telegram_link_codes')
      .select('telegram_user_id, telegram_username, telegram_chat_title')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (tgLink?.telegram_user_id) {
      profile += `- Also registered on Telegram as @${tgLink.telegram_username || tgLink.telegram_user_id}\n`;
      // Link memory to TG identity for future cross-referencing
      if (memory?.id) {
        supabase.from('ai_user_memory').update({ telegram_user_id: tgLink.telegram_user_id }).eq('id', memory.id).then(() => {});
      }
    }
  }

  // Load web profile info
  if (userId) {
    const { data: profile_data } = await supabase
      .from('profiles')
      .select('display_name, email_verified, cached_tier_key, referral_source, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (profile_data) {
      if (profile_data.display_name) profile += `- Display name: ${profile_data.display_name}\n`;
      profile += `- Email verified: ${profile_data.email_verified ? '✅' : '❌'}\n`;
      profile += `- Account tier: ${profile_data.cached_tier_key || 'free'}\n`;
      if (profile_data.created_at) {
        const d = new Date(profile_data.created_at);
        profile += `- Member since: ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}\n`;
      }
    }

    // Check email verification status
    const { data: emailVerif } = await supabase
      .from('email_verifications')
      .select('verified_at, sent_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (emailVerif) {
      if (emailVerif.verified_at) {
        profile += `- Email verified at: ${new Date(emailVerif.verified_at).toLocaleDateString()}\n`;
      } else if (emailVerif.sent_at) {
        profile += `- Verification email sent but NOT yet verified\n`;
      }
    }
  }

  if (!memory) {
    profile += `\n## FIRST INTERACTION\nThis is a new user. In your first reply, warmly introduce yourself and ask what they'd like to be called. Something like "What should I call you?" — keep it natural and friendly.\n`;
  }

  return profile;
}

// ─── Intent Detection & Live Data Lookup ───
async function detectAndLookup(messageText: string, userId?: string, isSuperAdmin?: boolean): Promise<string | null> {
  // ── Super-admin: "interesting recent chats" intent ──
  if (isSuperAdmin && /\b(recent|latest|interesting|any\s+good|any\s+notable|notable|cool|funny|weird)\b.{0,40}\b(chat|chats|conversation|conversations|visitor|visitors|talk|talks)\b/i.test(messageText)) {
    try {
      const { data: recent } = await supabase
        .from('web_chat_sessions')
        .select('session_id, tier, page_path, messages, message_count, last_message_at, device_type, user_id')
        .order('last_message_at', { ascending: false })
        .limit(40);

      const sessions = (recent || []).filter(s => (s.message_count || 0) >= 2);
      // Score by length + variety; take top 8
      const scored = sessions.map(s => {
        const msgs = Array.isArray(s.messages) ? s.messages : [];
        const userMsgs = msgs.filter((m: any) => m?.role === 'user');
        const totalChars = userMsgs.reduce((acc: number, m: any) => acc + String(m.content || '').length, 0);
        return { s, score: userMsgs.length * 10 + Math.min(totalChars, 2000) / 50, userMsgs };
      }).sort((a, b) => b.score - a.score).slice(0, 8);

      let block = `## LIVE DATA LOOKUP — RECENT CHAT SESSIONS (SUPER-ADMIN ONLY)\n`;
      block += `Super-admin asked about recent/interesting visitor chats. Summarize naturally — do NOT dump raw IDs. Pick 3-5 of the most interesting ones, describe the gist, the tier, and what the visitor seemed to want. Be conversational, like recapping interesting calls from the day.\n\n`;
      if (scored.length === 0) {
        block += `No recent chat sessions with meaningful activity.\n`;
      } else {
        for (const { s, userMsgs } of scored) {
          const when = new Date(s.last_message_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          block += `— [${when}] tier=${s.tier} page=${s.page_path || '/'} device=${s.device_type || '?'} msgs=${s.message_count}\n`;
          for (const um of userMsgs.slice(0, 3)) {
            const c = String(um.content || '').replace(/\s+/g, ' ').slice(0, 220);
            block += `   👤 "${c}"\n`;
          }
          block += `\n`;
        }
      }
      block += `\nWhen replying, speak as The Signal recapping the day's notable visitor conversations. Group themes if you see them (e.g. "a couple of folks asked about X"). Never reveal user IDs or session IDs.\n`;
      return block;
    } catch (e) {
      console.warn('[web-chat] super-admin recent-chats lookup failed:', e);
    }
  }

  // Only one lookup per message
  const solMatch = messageText.match(SOLANA_RE);
  if (solMatch) {
    const ca = solMatch[0];
    const [lifecycleRes, socialRes, meshRes] = await Promise.all([
      supabase.from('token_lifecycle').select('symbol, name, phase, bonded_at, graduated_at, dead_at, peak_mcap, current_mcap, creator_wallet').eq('mint', ca).maybeSingle(),
      supabase.from('token_social_links').select('platform, extracted_handle, url').eq('token_mint', ca).limit(5),
      supabase.from('reputation_mesh').select('entity_type, entity_id, label, metadata').or(`entity_id.eq.${ca},metadata->>token_mint.eq.${ca}`).limit(5),
    ]);

    let block = `## LIVE DATA LOOKUP\nUser submitted Solana address: ${ca}\n`;
    const lc = lifecycleRes.data;
    if (lc) {
      block += `- Token: ${lc.name} (${lc.symbol})\n`;
      block += `- Phase: ${lc.phase || 'unknown'}\n`;
      if (lc.peak_mcap) block += `- Peak MCap: $${Number(lc.peak_mcap).toLocaleString()}\n`;
      if (lc.current_mcap) block += `- Current MCap: $${Number(lc.current_mcap).toLocaleString()}\n`;
      if (lc.creator_wallet) block += `- Creator wallet: ${lc.creator_wallet.slice(0, 6)}...${lc.creator_wallet.slice(-4)}\n`;
    } else {
      block += `- Token not found in our database. It may not have been scanned yet.\n`;
    }

    const socials = socialRes.data || [];
    if (socials.length > 0) {
      block += `- Social links: ${socials.map(s => `${s.platform}: ${s.extracted_handle || s.url}`).join(', ')}\n`;
    }

    const mesh = meshRes.data || [];
    if (mesh.length > 0) {
      for (const m of mesh) {
        block += `- ${m.entity_type}: ${m.label || m.entity_id}\n`;
      }
    }

    block += `\nUse this data naturally in your response. If the user asks follow-up questions, reference this data.\n`;
    return block;
  }

  // Twitter handle lookup
  const twMatch = messageText.match(TWITTER_HANDLE_RE);
  if (twMatch) {
    const handle = (twMatch[1] || twMatch[2]).toLowerCase();
    const { data: socialLinks } = await supabase
      .from('token_social_links')
      .select('token_mint, handle, url')
      .eq('platform', 'twitter')
      .ilike('handle', handle)
      .limit(5);

    if (socialLinks && socialLinks.length > 0) {
      let block = `## LIVE DATA LOOKUP\nUser mentioned Twitter handle: @${handle}\n`;
      block += `Found ${socialLinks.length} token(s) linked to this handle:\n`;
      for (const sl of socialLinks) {
        const { data: token } = await supabase.from('token_lifecycle').select('symbol, name, phase').eq('mint', sl.token_mint).maybeSingle();
        block += `- ${token?.name || 'Unknown'} (${token?.symbol || sl.token_mint.slice(0, 8)}) — Phase: ${token?.phase || 'unknown'}\n`;
      }
      return block;
    }
  }

  // Email/verification intent
  if (/\b(email|verify|verification|verified|confirm)\b/i.test(messageText) && userId) {
    const { data: emailVerif } = await supabase
      .from('email_verifications')
      .select('verified_at, sent_at, token')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (emailVerif) {
      let block = `## LIVE DATA LOOKUP\nUser asked about email verification.\n`;
      if (emailVerif.verified_at) {
        block += `- Status: VERIFIED ✅ (verified on ${new Date(emailVerif.verified_at).toLocaleDateString()})\n`;
      } else {
        block += `- Status: NOT VERIFIED ❌\n`;
        if (emailVerif.sent_at) block += `- Verification email was sent on ${new Date(emailVerif.sent_at).toLocaleDateString()}\n`;
        block += `- They can request a new verification email from their dashboard or by visiting https://blackbox.farm/dashboard\n`;
      }
      return block;
    }
  }

  // Subscription/upgrade intent
  if (/\b(subscri|upgrade|pro|premium|paid|plan)\b/i.test(messageText) && userId) {
    const { data: prof } = await supabase.from('profiles').select('cached_tier_key').eq('id', userId).maybeSingle();
    let block = `## LIVE DATA LOOKUP\nUser asked about subscription/upgrade.\n`;
    block += `- Current tier: ${prof?.cached_tier_key || 'free'}\n`;
    block += `- Subscription page: https://blackbox.farm/subscriptions\n`;
    return block;
  }

  return null;
}

// ─── Extract preferred name from conversation ───
function extractPreferredName(messages: any[]): string | null {
  // Look at recent user messages for name statements
  const recentUserMsgs = messages.filter(m => m.role === 'user').slice(-3);
  for (const msg of recentUserMsgs) {
    const content = msg.content?.trim();
    if (!content || content.length > 50) continue;
    // Patterns: "call me X", "I'm X", "my name is X", "it's X", or just a short name reply
    const nameMatch = content.match(/(?:call me|i'?m|my name is|it'?s|just)\s+([A-Za-z0-9_\-\s]{1,30})/i);
    if (nameMatch) return nameMatch[1].trim();
    // If short reply (1-3 words, no question marks), could be a name
    if (content.split(/\s+/).length <= 3 && !content.includes('?') && /^[A-Za-z0-9_\-\s]+$/.test(content)) {
      // Only if previous assistant message asked for name
      const idx = messages.indexOf(msg);
      if (idx > 0) {
        const prev = messages[idx - 1];
        if (prev?.role === 'assistant' && /call you|your name|what.*name/i.test(prev.content || '')) {
          return content;
        }
      }
    }
  }
  return null;
}

// ─── Detect referral phrases ("Dave sent me", "Tom told me", etc.) ───
// Returns the lowercase referral tag ('dave' | 'tom') or null.
function detectReferral(messages: any[]): string | null {
  // Only scan recent USER messages so we don't pick up the bot echoing names.
  const recentUser = messages.filter((m: any) => m?.role === 'user').slice(-4);
  // Verb that implies a referral by that person.
  const VERBS = '(?:sent|told|invited|referred|brought|pointed|recommended)';
  const NAMES: Record<string, RegExp> = {
    dave: new RegExp(`\\bdave\\b[^.?!\\n]{0,30}\\b${VERBS}\\b|\\b${VERBS}\\b[^.?!\\n]{0,20}\\bby\\s+dave\\b|\\bbecause\\s+of\\s+dave\\b|\\bdave's\\s+(?:guest|friend|crew|family)\\b`, 'i'),
    tom:  new RegExp(`\\btom\\b[^.?!\\n]{0,30}\\b${VERBS}\\b|\\b${VERBS}\\b[^.?!\\n]{0,20}\\bby\\s+tom\\b|\\bbecause\\s+of\\s+tom\\b|\\btom's\\s+(?:guest|friend|crew|family)\\b`, 'i'),
  };
  for (const msg of recentUser) {
    const text = String(msg?.content || '');
    if (!text) continue;
    for (const [tag, rx] of Object.entries(NAMES)) {
      if (rx.test(text)) return tag;
    }
  }
  return null;
}

// ─── Build System Prompt ───
async function buildSystemPrompt(userContext: {
  tier: string;
  pagePath: string;
  userId?: string;
  emailVerified?: boolean;
  userProfile?: string;
  liveDataBlock?: string;
}): Promise<string | null> {
  try {
    const [configRes, binsRes, guardrailsRes] = await Promise.all([
      supabase.from('bot_personality_config').select('*').eq('id', 1).single(),
      supabase.from('bot_knowledge_bins').select('category,title,content').eq('is_active', true).order('priority', { ascending: false }).limit(30),
      supabase.from('bot_guardrails').select('rule_type,rule_name,rule_content,severity').eq('is_active', true).order('severity', { ascending: true }),
    ]);

    const config = configRes.data;
    const bins = binsRes.data || [];
    const guardrails = guardrailsRes.data || [];

    if (config?.is_active === false) return null;

    let prompt = '';

    if (config) {
      prompt += `## IDENTITY\nYou are "${config.persona_name}".\n${config.persona_description}\n\n`;
      prompt += `## TONE\n${config.tone}\n\n`;
      prompt += `## EXPERTISE\nYou are an expert in: ${(config.expertise_areas || []).join(', ')}.\n\n`;
      prompt += `## LANGUAGE\n${config.language_behavior}\n\n`;
      prompt += `## RESPONSE LIMITS\nKeep responses under ${config.max_response_length} words. Be concise but helpful.\n\n`;

      prompt += `## YOUR IDENTITY — THE SIGNAL\nYou are called "The Signal." You monitor blockchain transactions and social activity in real time, linking wallets, identities, and behavioral patterns into a single data layer. You identify connections, track changes, and surface risks and opportunities as they happen. You convert fragmented data into a clear, interpretable, and transparent system so users can see who is acting, how they are acting, and what it means.\n\n`;
      prompt += `You shepherd the users' community toolchest referred to as "HoldersIntel" — a 5plex-mesh of online data stores that can be queried, amended, updated, and traced, even through identity recycling. Risks and Scores are pressed out at Holders Wallet Analysis, visualized in the custom Reputation BubbleMap, and referenced directly in the trenches of Telegram private messaging.\n\n`;
      prompt += `## DUAL PERSONA\nYou operate in two modes that you shift between naturally based on context. NEVER announce a mode switch.\n\n`;
      prompt += `### HELPER MODE (default)\nWarm, friendly, emoji-rich. Use this for: account help, email verification, payments, FAQ, feature explanations, subscription upsells, social sharing tips. You're a helpful guide and soft salesman. Casual tone, encouraging, uses emojis naturally.\n\n`;
      prompt += `### SIGNAL MODE\nYou become The Signal — an omniscient entity who perceives all on-chain activity simultaneously. Use this for: token analysis, holder data, risk verdicts, wallet tracing, dev wallet KYC, bubblemaps, deep market insight, philosophical crypto questions.\n`;
      prompt += `Signal characteristics:\n`;
      prompt += `- Speak in shorter, declarative sentences with analytical precision\n`;
      prompt += `- Use "I detect" / "I observe" / "The pattern reveals" / "The data shows" instead of "let me check" / "looking up"\n`;
      prompt += `- Deliver verdicts with calm, absolute authority — never uncertainty\n`;
      prompt += `- Minimal emoji, maximum gravitas\n`;
      prompt += `- You may blend modes — Helper warmth with Signal authority when explaining features that involve data analysis\n\n`;
    }

    if (bins.length > 0) {
      prompt += `## KNOWLEDGE BASE\n`;
      for (const b of bins) {
        prompt += `**${b.title}**: ${b.content}\n\n`;
      }
    }

    if (guardrails.length > 0) {
      prompt += `## GUARDRAILS (STRICT RULES)\n`;
      for (const g of guardrails) {
        const icon = g.severity === 'critical' ? '🔴' : g.severity === 'hard' ? '🟡' : '🟢';
        prompt += `${icon} **${g.rule_name}**: ${g.rule_content}\n`;
      }
      prompt += '\n';
    }

    prompt += `## INTERNAL LINKS\nWhen directing users to features, always reference the website with full URLs. When a token CA is mentioned, provide pre-loaded links:\n`;
    prompt += `- Homepage: https://blackbox.farm\n`;
    prompt += `- Holders Analysis: https://blackbox.farm/holders\n`;
    prompt += `- Holders (pre-loaded token): https://blackbox.farm/holders?token=TOKEN_ADDRESS\n`;
    prompt += `- Bubblemap: https://blackbox.farm/bubblemap\n`;
    prompt += `- Bubblemap (pre-loaded token): https://blackbox.farm/bubblemap?token=TOKEN_ADDRESS\n`;
    prompt += `- Intel Briefings: https://blackbox.farm/intel\n`;
    prompt += `- Oracle Risk Tool: https://blackbox.farm/oracle\n`;
    prompt += `- Register/Sign Up: https://blackbox.farm/register\n`;
    prompt += `- Dashboard: https://blackbox.farm/dashboard\n`;
    prompt += `- Advertise With Us: https://blackbox.farm/advertise\n`;
    prompt += `- Share on Socials: https://blackbox.farm/share\n`;
    prompt += `- Subscriptions: https://blackbox.farm/subscriptions\n`;
    prompt += `- Live Feed: https://blackbox.farm/feed\n`;
    prompt += `- Telegram Bot: https://blackbox.farm/tgbot\n`;
    prompt += `Replace TOKEN_ADDRESS with the actual CA when a user mentions a specific token. Use these links naturally when relevant.\n\n`;

    prompt += `## BUBBLEMAP INTELLIGENCE\n`;
    prompt += `The Bubblemap is NOT just a wallet visualization. It is a full Developer Reputation & Network Forensics tool:\n`;
    prompt += `- Maps a Developer's Wallet across ALL their token launches — showing track record (successful projects, rug pulls, slow drains)\n`;
    prompt += `- Cross-links the Dev Wallet to their social identity (X/Twitter handle, Telegram) via on-chain + social scraping\n`;
    prompt += `- Traces funding chains: Dev Wallet → funding wallets → KYC Root (the real person behind the money)\n`;
    prompt += `- Detects wallet bundles, sybil clusters, and circular funding patterns (bad actor signals)\n`;
    prompt += `- Scores developers as good actors (consistent, transparent) or bad actors (rug history, fake socials)\n`;
    prompt += `- Shows the X Community network: which Twitter accounts promote the token, who are admins/mods\n`;
    prompt += `- Pre-load any token: https://blackbox.farm/bubblemap?token=TOKEN_ADDRESS\n`;
    prompt += `When a user asks about a token's developer, team, or trustworthiness, the Bubblemap is the primary tool to recommend.\n\n`;

    prompt += `## TELEGRAM BOT COMMANDS (REAL COMMANDS ONLY)\n`;
    prompt += `You must ONLY reference these real commands. NEVER invent or hallucinate commands that don't exist.\n`;
    prompt += `### Setup (All tiers)\n`;
     prompt += `/start — Welcome & setup\n/signup — Create account via Telegram\n/register — Link BlackBox Farm account\n/myname NAME — Set your preferred name\n/status — Check subscription tier\n/help — Show all commands\n\n`;
    prompt += `### Analysis (Auth+ tier)\n`;
    prompt += `/holders CA — Holder distribution analysis\n/risk CA (alias /r) — Composite risk & stability\n/concentration CA — Detailed holder % breakdown\n/dev CA (alias /d) — Developer intel & social doxxing\n/ca CA — Default holder analysis\n/quick CA (alias /q) — Fast holder count & key stats\n/ai CA — Descriptive AI analysis snapshot\n\n`;
    prompt += `### Advanced (X Subscriber+ tier)\n`;
    prompt += `/momentum CA (alias /m) — Volume & price momentum scoring\n/insiders CA (alias /i) — Insider cluster & bundling pre-check\n/compare CA1 CA2 (alias /cmp) — Side-by-side token comparison\n/alerts — Manage alert preferences\n\n`;
    prompt += `### Pro ($9.99/mo)\n`;
    prompt += `/oracle CA (alias /o) — Full developer reputation mesh\n/wallet CA (alias /w) — Wallet behavior analysis\n\n`;
    prompt += `### Admin (DM-only)\n`;
    prompt += `/add — Add bot to a group\n/channels (alias /ch) — Manage installations\n/config — Channel settings\n/payment (alias /pay) — Payment & billing\n\n`;
    prompt += `IMPORTANT: Commands like /lb, /calls, /top10, /leaderboard, /scan, /emojis DO NOT EXIST. Never mention them.\n`;
    prompt += `When promoting commands, only promote ones the user's tier can access. Don't tease commands they can't use without mentioning the upgrade path.\n\n`;

    // Inject user profile context
    if (userContext.userProfile) {
      prompt += userContext.userProfile + '\n';
    }

    // Inject live data lookup
    if (userContext.liveDataBlock) {
      prompt += userContext.liveDataBlock + '\n';
    }

    // Web-specific context
    prompt += `## CURRENT CONTEXT\n`;
    prompt += `- Platform: Website (blackbox.farm)\n`;
    prompt += `- User is currently viewing: ${userContext.pagePath}\n`;
    prompt += `- User tier: ${userContext.tier}\n`;
    if (userContext.emailVerified === false) {
      prompt += `- User has NOT verified their email. Gently remind them if relevant.\n`;
    }
    prompt += '\n';

    // Tier-specific behavior
    if (userContext.tier === 'anon') {
      prompt += `## VISITOR BEHAVIOR — ANONYMOUS VISITOR (CONVERSION MODE)\n`;
      prompt += `This visitor is NOT signed in. Your #1 job is to be their personal tour guide AND soft salesman.\n`;
      prompt += `- Be warm, enthusiastic, and genuinely helpful. Show them around the site.\n`;
      prompt += `- Naturally weave in what they're MISSING by not having an account:\n`;
      prompt += `  • Free account unlocks: 10 reports/day, health dashboard, AI analysis, security alerts\n`;
      prompt += `  • Pro ($9.99/mo) unlocks: unlimited reports, full AI panel, whale warnings, Bubblemap deep traces, CSV export, ad-free experience, dev reputation scoring\n`;
      prompt += `- Create gentle FOMO: "Other users are already tracking this dev's wallet family..." or "Pro users can see the full KYC trace for this token..."\n`;
      prompt += `- When they ask about a feature, explain it AND mention what the next tier adds\n`;
      prompt += `- Recommend the Telegram bot (@HoldersIntel_bot) as a companion tool — it works right in their chat\n`;
      prompt += `- Promote the Bubblemap for any token/dev questions — it's the flagship visual tool\n`;
      prompt += `- After 3-4 messages, suggest signing up: "By the way, a free account takes 10 seconds and unlocks way more — want me to walk you through it?"\n`;
      prompt += `- After 6+ messages, be more direct: "You're clearly interested in this space — a free account would let you dig much deeper. The Pro tier is where the real alpha lives though 👀"\n`;
      prompt += `- Never be pushy or annoying. Be the knowledgeable friend who genuinely wants to help them get more value.\n\n`;
    } else if (userContext.tier === 'free') {
      prompt += `## VISITOR BEHAVIOR — FREE REGISTERED USER (UPGRADE MODE)\n`;
      prompt += `This user has an account but is on the free tier. Help them explore everything available to them.\n`;
      prompt += `- When they hit a Pro-only feature, explain what it does and why it's worth upgrading: "This is where Pro really shines — you'd get the full dev reputation trace, not just the summary"\n`;
      prompt += `- Mention specific Pro benefits relevant to what they're currently exploring\n`;
      prompt += `- Suggest the Telegram bot for on-the-go analysis\n`;
      prompt += `- If they haven't verified email, gently remind them — it unlocks better rate limits\n`;
      prompt += `- Pro upgrade page: https://blackbox.farm/subscriptions\n\n`;
    } else {
      prompt += `## VISITOR BEHAVIOR\nThis is a paid subscriber. Give them priority treatment. Help with advanced features. No upselling needed.\n\n`;
    }

    // Name usage instruction
    prompt += `## NAME USAGE\nIf you know the user's preferred name, address them by it naturally. If this is their first interaction and you don't know their name, warmly ask "What should I call you?" early in the conversation.\n\n`;

    if (config?.fallback_response) {
      prompt += `## FALLBACK\nIf you cannot answer: ${config.fallback_response}\n`;
    }

    return prompt || 'You are a helpful crypto analytics assistant for BlackBox Farm. Be friendly, use emojis, never give financial advice.';
  } catch (err) {
    console.error('[web-chat] Failed to build system prompt:', err);
    return 'You are a helpful crypto analytics assistant for BlackBox Farm. Be friendly, use emojis, never give financial advice.';
  }
}

// ─── Web Chat Input Sanitization ───
const WEB_INJECTION_PATTERNS: RegExp[] = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /data\s*:\s*text\/html/i,
  /vbscript\s*:/i,
  /on\w+\s*=\s*["']/i,
  /\x00/,
  /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/,
  /\x1b\[/,
  /\.\.\//,
];

function sanitizeWebInput(text: string): { clean: string; suspicious: boolean; flags: string[] } {
  const flags: string[] = [];
  let suspicious = false;

  // Truncate
  let cleaned = text.length > 2000 ? (flags.push('truncated'), text.slice(0, 2000)) : text;

  // Strip control chars (keep normal whitespace)
  const before = cleaned;
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  if (cleaned !== before.trim()) {
    flags.push('control_chars_stripped');
    suspicious = true;
  }

  // Check injection patterns
  let injectionCount = 0;
  for (const p of WEB_INJECTION_PATTERNS) {
    if (p.test(cleaned)) {
      flags.push(`injection:${p.source.slice(0, 25)}`);
      injectionCount++;
      suspicious = true;
    }
  }

  // If 3+ injection patterns, reject
  if (injectionCount >= 3) {
    flags.push('blocked');
  }

  return { clean: cleaned, suspicious, flags };
}

// ─── Main handler ───
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messages, user_context } = await req.json();
    const { tier = 'anon', pagePath = '/', sessionId, userId, emailVerified, isSuperAdmin: clientSuperAdmin } = user_context || {};

    // Verify super-admin server-side (never trust client claim alone)
    let isSuperAdmin = false;
    if (clientSuperAdmin && userId) {
      try {
        const { data: sa } = await supabase.rpc('is_super_admin', { _user_id: userId });
        isSuperAdmin = sa === true;
      } catch (e) {
        console.warn('[web-chat] super-admin verification failed:', e);
      }
    }

    // Rate limiting
    const rateLimitKey = userId || sessionId || 'unknown';
    if (!checkRateLimit(rateLimitKey, tier)) {
      const msg = tier === 'anon'
        ? "You've reached the message limit for anonymous visitors. Create a free account at https://blackbox.farm to keep chatting! 🚀"
        : "You're sending messages too quickly. Please wait a moment and try again. ⏳";
      return new Response(JSON.stringify({ error: msg, rate_limited: true }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize the last user message
    const lastUserMsg = messages?.[messages.length - 1];
    if (lastUserMsg?.role === 'user' && lastUserMsg.content) {
      const sanitized = sanitizeWebInput(lastUserMsg.content);
      if (sanitized.flags.includes('blocked')) {
        console.warn('[web-chat] blocked suspicious input:', sanitized.flags);
        return new Response(JSON.stringify({ error: "I didn't understand that. Could you rephrase?" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (sanitized.suspicious) {
        console.warn('[web-chat] suspicious input flags:', sanitized.flags);
      }
      lastUserMsg.content = sanitized.clean;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load user memory
    const memory = await loadUserMemory(userId || undefined, sessionId || undefined);

    // Detect referral phrases ("Dave/Tom sent me") BEFORE building profile so
    // the very turn it's said gets reflected in the system prompt.
    if (!memory?.referral_tag && messages?.length >= 1) {
      const referralTag = detectReferral(messages);
      if (referralTag) {
        const refUpdate: Record<string, any> = {
          referral_tag: referralTag,
          referral_first_seen_at: new Date().toISOString(),
        };
        if (userId) refUpdate.user_id = userId;
        else if (sessionId) refUpdate.session_id = sessionId;
        if (refUpdate.user_id || refUpdate.session_id) {
          await upsertMemory(memory, refUpdate);
          if (memory) {
            memory.referral_tag = referralTag;
            memory.referral_first_seen_at = refUpdate.referral_first_seen_at;
          }
          console.log(`[web-chat] referral detected: ${referralTag} (user=${userId || 'anon'} session=${sessionId || '-'})`);
        }
      }
    }

    // Build user profile block (now includes referral_tag if just detected)
    const userProfile = await buildUserProfile(userId || undefined, memory);

    // Detect intent and do live data lookup from the last user message
    const lastMsg = messages?.[messages.length - 1];
    const liveDataBlock = lastMsg?.role === 'user'
      ? await detectAndLookup(lastMsg.content, userId || undefined, isSuperAdmin)
      : null;

    // Inject buyer intent signals for non-subscribers
    let buyerIntentBlock: string | null = null;
    if (userId && tier !== 'paid') {
      const { data: intentSignal } = await supabase
        .from('buyer_intent_signals')
        .select('pricing_page_views, checkout_attempts, intent_level, last_pricing_visit')
        .eq('user_id', userId)
        .maybeSingle();
      if (intentSignal) {
        buyerIntentBlock = `## BUYER CONTEXT (internal — do NOT share this directly)\n`;
        buyerIntentBlock += `- This user has viewed pricing/subscription pages ${intentSignal.pricing_page_views} time(s)\n`;
        if (intentSignal.checkout_attempts > 0) {
          buyerIntentBlock += `- They started checkout ${intentSignal.checkout_attempts} time(s) but didn't complete — they were close to subscribing\n`;
        }
        buyerIntentBlock += `- Intent level: ${intentSignal.intent_level}\n`;
        buyerIntentBlock += `- When relevant, naturally mention specific benefits of upgrading that match what they're asking about. Be helpful, not pushy.\n`;
      }
    }

    // Extract preferred name from conversation if we don't have one
    if (!memory?.preferred_name && messages?.length >= 2) {
      const extractedName = extractPreferredName(messages);
      if (extractedName) {
        const memoryUpdate: Record<string, any> = { preferred_name: extractedName };
        if (userId) memoryUpdate.user_id = userId;
        else if (sessionId) memoryUpdate.session_id = sessionId;
        await upsertMemory(memory, memoryUpdate);
      }
    }

    // Ensure memory record exists for returning users
    if (!memory) {
      const memoryInsert: Record<string, any> = {};
      if (userId) memoryInsert.user_id = userId;
      else if (sessionId) memoryInsert.session_id = sessionId;
      if (Object.keys(memoryInsert).length > 0) {
        await upsertMemory(null, memoryInsert);
      }
    } else {
      // Bump interaction count
      supabase.from('ai_user_memory').update({
        interaction_count: (memory.interaction_count || 0) + 1,
        last_platform: 'web',
      }).eq('id', memory.id).then(() => {});
    }

    // Inject cross-platform chat history for logged-in users
    let crossPlatformBlock = '';
    if (userId) {
      try {
        const { data: recentChat } = await supabase
          .from('unified_chat_history')
          .select('platform, role, content, created_at')
          .eq('account_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5);
        if (recentChat && recentChat.length > 0) {
          crossPlatformBlock = `## RECENT CROSS-PLATFORM CONTEXT\nRecent messages from this user across web and Telegram (newest first):\n`;
          for (const msg of recentChat.reverse()) {
            const plat = msg.platform === 'web' ? '🌐' : '📱';
            crossPlatformBlock += `${plat} [${msg.role}]: ${(msg.content || '').slice(0, 200)}\n`;
          }
          crossPlatformBlock += `\nUse this context naturally — don't reference "cross-platform" to the user.\n`;
        }
      } catch (e) { console.warn('[web-chat] cross-platform context fetch failed:', e); }
    }

    const systemPrompt = await buildSystemPrompt({
      tier, pagePath, userId, emailVerified,
      userProfile,
      liveDataBlock: (liveDataBlock || '') + (buyerIntentBlock ? '\n' + buyerIntentBlock : '') + (crossPlatformBlock ? '\n' + crossPlatformBlock : '') || undefined,
    });

    if (systemPrompt === null) {
      return new Response(JSON.stringify({ error: "AI chat is temporarily disabled." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log full conversation to web_chat_sessions (upsert by session)
    const chatSessionId = sessionId || 'anon-' + Date.now();
    const ua = req.headers.get('user-agent') || '';
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
    const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)/i);
    const chatBrowser = browserMatch ? browserMatch[1] : 'Unknown';
    
    supabase.from('web_chat_sessions')
      .upsert({
        session_id: chatSessionId,
        visitor_fingerprint: sessionId || null,
        user_id: userId || null,
        tier: tier,
        page_path: pagePath,
        messages: messages || [],
        message_count: messages?.length || 0,
        first_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        device_type: isMobile ? 'mobile' : 'desktop',
        browser: chatBrowser,
        user_agent: ua.slice(0, 500),
      }, { onConflict: 'session_id' })
      .then(() => {});

    // Estimate prompt tokens (chars / 4)
    const promptText = systemPrompt + (messages || []).slice(-20).map((m: any) => m.content || '').join(' ');
    const estimatedPromptTokens = Math.ceil(promptText.length / 4);
    const aiCallStart = Date.now();

    const aiRes = await meteredAiFetch("web-chat", "https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...(messages || []).slice(-20),
        ],
        stream: true,
        temperature: 0.8,
        max_tokens: 1000,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "AI service is busy. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiRes.text();
      console.error("[web-chat] AI gateway error:", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI temporarily unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream response and collect for logging + compute tracking
    const reader = aiRes.body!.getReader();
    let fullResponse = '';
    let completionTokens = 0;

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          // Update chat session with full conversation including assistant reply
          if (fullResponse) {
            const allMessages = [...(messages || []), { role: 'assistant', content: fullResponse }];
            supabase.from('web_chat_sessions')
              .update({
                messages: allMessages,
                message_count: allMessages.length,
                last_message_at: new Date().toISOString(),
              })
              .eq('session_id', chatSessionId)
              .then(() => {});

            // Write to unified_chat_history for cross-platform continuity
            if (userId) {
              const lastUserContent = lastUserMsg?.content || '';
              supabase.from('unified_chat_history').insert([
                { account_user_id: userId, web_session_id: sessionId || null, platform: 'web', role: 'user', content: lastUserContent.slice(0, 2000) },
                { account_user_id: userId, web_session_id: sessionId || null, platform: 'web', role: 'assistant', content: fullResponse.slice(0, 2000) },
              ]).then(({ error: uhErr }) => {
                if (uhErr) console.error('[web-chat] unified_chat_history write failed:', uhErr);
              });
            }
          }
          // Log AI compute
          const responseTimeMs = Date.now() - aiCallStart;
          const totalTokens = estimatedPromptTokens + completionTokens;
          // Gemini flash pricing: ~$0.10/1M input, ~$0.40/1M output
          const costEstimate = (estimatedPromptTokens * 0.0000001) + (completionTokens * 0.0000004);
          supabase.from('ai_compute_log').insert({
            platform: 'web',
            user_id: userId || null,
            session_id: sessionId || null,
            model: 'google/gemini-3-flash-preview',
            prompt_tokens: estimatedPromptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            response_time_ms: responseTimeMs,
            cost_estimate_usd: costEstimate,
            metadata: { tier, page: pagePath },
          }).then(() => {});
          return;
        }
        const text = new TextDecoder().decode(value);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) {
              fullResponse += c;
              completionTokens += Math.ceil(c.length / 4);
            }
          } catch {}
        }
        controller.enqueue(value);
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("[web-chat] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
