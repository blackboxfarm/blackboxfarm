import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runBadActorCheck } from "../_shared/bad-actor-check.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAID_TIERS = new Set(['x_subscriber', 'pro', 'dev', 'enterprise']);

async function getCallerTier(supabase: any, authHeader: string | null): Promise<string> {
  if (!authHeader) return 'anon';
  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: userData } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return 'anon';

    const { data: subs } = await supabase
      .from('user_subscriptions')
      .select('tier_key, expires_at, x_subscription_verified')
      .eq('user_id', userId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .limit(5);

    if (!subs || subs.length === 0) return 'auth';
    let best = 'auth';
    for (const s of subs) {
      if (PAID_TIERS.has(s.tier_key)) {
        if (s.tier_key === 'enterprise') return 'enterprise';
        if (s.tier_key === 'dev' && best !== 'enterprise') best = 'dev';
        if (s.tier_key === 'pro' && !['enterprise', 'dev'].includes(best)) best = 'pro';
        if (s.tier_key === 'x_subscriber' && best === 'auth') best = 'x_subscriber';
      }
    }
    return best;
  } catch (_) {
    return 'anon';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const { tokenMint, walletAddress, xHandle } = body || {};

    if (!tokenMint && !walletAddress && !xHandle) {
      return new Response(JSON.stringify({ error: 'Provide tokenMint, walletAddress, or xHandle' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const alert = await runBadActorCheck(supabase, { tokenMint, walletAddress, xHandle });
    const tier = await getCallerTier(supabase, req.headers.get('authorization'));
    const isPaid = PAID_TIERS.has(tier);

    // Public payload always includes alert state, level, and headline.
    // Full breakdown (KYC, launch history, mesh chain, socials) is paid-only.
    const payload = {
      isBadActor: alert.isBadActor,
      level: alert.level,
      headline: alert.headline,
      reasons: alert.reasons,
      subjects: alert.subjects,
      tier,
      locked: !isPaid,
      details: isPaid ? alert.details : null,
      // Counts surfaced to free users so they can see "we have data, upgrade to view"
      counts: {
        blacklistEntries: alert.details?.blacklistEntries.length || 0,
        meshLinks: alert.details?.meshLinks.length || 0,
        recycledCommunities: alert.details?.recycledCommunities.length || 0,
        launchHistory: alert.details?.launchHistory.length || 0,
        hasDevReputation: !!alert.details?.devReputation,
      },
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[bad-actor-check] error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});