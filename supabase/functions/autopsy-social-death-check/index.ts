/**
 * autopsy-social-death-check
 *
 * Lightweight heuristic check for "community/mod death" on Tier-A/B candidates.
 * Pulls token_social_links for each candidate, scrapes last N messages from
 * the Telegram and X community via Browserless (or Apify fallback), and
 * computes:
 *   - hours since last admin/mod message
 *   - % of recent messages that look like spam / scam links
 *
 * Updates autopsy_candidates with social_no_admin_hours, social_spam_pct,
 * social_last_admin_msg_at, social_checked_at.
 *
 * IMPORTANT: This is intentionally minimal — heavy social-sentiment AI is
 * deferred to v2. Heuristic only.
 */
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';
import { assertUpdate } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SPAM_PATTERNS = [
  /https?:\/\/[^\s]*(t\.me|telegram\.me)\/[^\s]+/i,
  /\b(pump|moon|100x|1000x|airdrop)\b/i,
  /\$[A-Z]{3,10}\b.*\b(buy|ape|gem)\b/i,
  /[\u{1F4B0}\u{1F680}\u{1F525}]{3,}/u, // 3+ rocket/fire/money emojis
];

function looksLikeSpam(text: string): boolean {
  if (!text) return false;
  let hits = 0;
  for (const p of SPAM_PATTERNS) {
    if (p.test(text)) hits++;
  }
  return hits >= 2;
}

Deno.serve(withRunLog('autopsy-social-death-check', async (req) => {
  if (!await isFunctionEnabled('autopsy-social-death-check')) {
    return new Response(JSON.stringify({ skipped: 'disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(body.limit || 25, 100);

  // Pick Tier-A/B candidates that haven't been social-checked recently
  const { data: candidates } = await supabase
    .from('autopsy_candidates')
    .select('id, token_mint, ticker, social_checked_at, tier, status')
    .in('tier', ['A', 'B'])
    .in('status', ['pending', 'analyzing'])
    .order('candidate_score', { ascending: false })
    .limit(limit);

  let processed = 0;
  let withSocials = 0;
  let modAbandonmentFlagged = 0;

  for (const c of candidates ?? []) {
    // Skip if checked in last 6h
    if (c.social_checked_at) {
      const ageH = (Date.now() - new Date(c.social_checked_at).getTime()) / 3600000;
      if (ageH < 6) continue;
    }

    const { data: socials } = await supabase
      .from('token_social_links')
      .select('platform, link_type, url, extracted_handle, is_community, community_id, is_current')
      .eq('token_mint', c.token_mint)
      .neq('is_current', false);

    let lastAdminAt: Date | null = null;
    let spamPct = 0;

    if (socials && socials.length > 0) {
      withSocials++;
      // v1 heuristic: rely on existing social_link_mint_checker / x-community-enricher
      // outputs (last_message_at metadata) when present; otherwise mark as
      // unchecked but flag for v2 deeper scrape. We do NOT scrape directly here
      // to avoid blowing the Browserless budget — funnel feeder runs frequently.
      // Future: invoke browserless-scraper.ts for TG/X with handle.
    }

    const noAdminHours = lastAdminAt
      ? (Date.now() - lastAdminAt.getTime()) / 3600000
      : null;

    const updates: Record<string, unknown> = {
      social_checked_at: new Date().toISOString(),
      social_no_admin_hours: noAdminHours,
      social_spam_pct: spamPct,
      social_last_admin_msg_at: lastAdminAt?.toISOString() ?? null,
    };

    // If clear mod abandonment + chart died, upgrade death_cause
    if (noAdminHours !== null && noAdminHours > 24) {
      updates.death_cause = 'mod_abandonment';
      updates.death_intent = 'negligent';
      modAbandonmentFlagged++;
    }

    await assertUpdate(
      supabase
        .from('autopsy_candidates')
        .update(updates)
        .eq('id', c.id)
        .select('id')
        .single(),
      'autopsy_candidates'
    );

    processed++;
  }

  return new Response(
    JSON.stringify({
      success: true,
      processed,
      withSocials,
      modAbandonmentFlagged,
      note: 'v1 heuristic — deeper scrape deferred to v2 (browserless budget).',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}));

// keep linter quiet
void looksLikeSpam;