// ath-alltime-resolver
// Single-token canonical ATH resolution. POST { tokenMint } → returns
// { athUsd, source, confidence, capturedAt }. Writes back to token_lifecycle.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { resolveAthAlltime } from '../_shared/ath-alltime-resolver.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const tokenMint = typeof body?.tokenMint === 'string' ? body.tokenMint.trim() : '';
  if (!tokenMint || tokenMint.length < 32) {
    return new Response(JSON.stringify({ error: 'tokenMint required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Pull context from token_lifecycle for smarter Birdeye gating
  let firstSeenAt: string | null = null;
  let currentMcap: number | null = null;
  try {
    const { data } = await supabase
      .from('token_lifecycle')
      .select('first_seen_at, market_cap_usd')
      .eq('token_mint', tokenMint)
      .maybeSingle();
    firstSeenAt = data?.first_seen_at ?? null;
    currentMcap = data?.market_cap_usd ?? null;
  } catch { /* ignore */ }

  const res = await resolveAthAlltime(supabase, tokenMint, { firstSeenAt, currentMcap });

  return new Response(JSON.stringify({ ok: true, tokenMint, ...res }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});