// kyc-bulk-mesh-runner
//
// Fires `mesh-kyc-deep-search` against a chunk of unverified developer_profiles
// to populate `reputation_mesh.funded_by` edges so the broader entity dictionary
// can later flip them via `kyc-rescan-master-dict`.
//
// Body: { batchSize?: number (default 50, max 200), concurrency?: number (default 5, max 10),
//         cooldownHours?: number (default 24), maxDepth?: number (default 6) }
//
// Picks oldest-checked unverified wallets first (kyc_last_checked_at NULL or older
// than cooldown). Invokes mesh-kyc-deep-search in parallel waves. Returns per-wave
// stats. Safe to re-run; mesh-kyc-deep-search updates kyc_last_checked_at so the
// next call skips fresh ones.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { withRunLog } from '../_shared/run-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(withRunLog('kyc-bulk-mesh-runner', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* empty ok */ }
  const batchSize = Math.min(Math.max(Number(body.batchSize) || 50, 1), 200);
  const concurrency = Math.min(Math.max(Number(body.concurrency) || 5, 1), 10);
  const cooldownHours = Math.max(Number(body.cooldownHours) || 24, 1);
  const maxDepth = Math.min(Math.max(Number(body.maxDepth) || 6, 2), 8);

  const cutoff = new Date(Date.now() - cooldownHours * 3600_000).toISOString();

  // Pull candidates: unverified, never-checked OR cooled-down.
  const { data: candidates, error } = await supabase
    .from('developer_profiles')
    .select('master_wallet_address, kyc_last_checked_at')
    .or('kyc_verified.is.null,kyc_verified.eq.false')
    .or(`kyc_last_checked_at.is.null,kyc_last_checked_at.lt.${cutoff}`)
    .order('kyc_last_checked_at', { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const wallets = (candidates ?? [])
    .map(r => r.master_wallet_address as string)
    .filter(Boolean);

  if (wallets.length === 0) {
    return new Response(JSON.stringify({
      ok: true, picked: 0, message: 'No eligible unverified wallets in cooldown window',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let verified = 0;
  let trailFound = 0;
  let errors = 0;
  const results: Array<{ wallet: string; ok: boolean; verified?: boolean; depth?: number; error?: string }> = [];

  // Parallel waves to respect Helius rate limits.
  for (let i = 0; i < wallets.length; i += concurrency) {
    const wave = wallets.slice(i, i + concurrency);
    const settled = await Promise.allSettled(wave.map(async (w) => {
      const { data, error: invErr } = await supabase.functions.invoke('mesh-kyc-deep-search', {
        body: { walletAddress: w, maxDepth, discoverBundle: false },
      });
      if (invErr) throw new Error(invErr.message);
      return { wallet: w, data };
    }));

    for (const s of settled) {
      if (s.status === 'fulfilled') {
        const d = s.value.data || {};
        const isVerified = !!(d.kycRoot || d.kyc_verified || d.verified);
        if (isVerified) verified++;
        if (Array.isArray(d.chain) && d.chain.length > 0) trailFound++;
        results.push({
          wallet: s.value.wallet, ok: true,
          verified: isVerified,
          depth: Array.isArray(d.chain) ? d.chain.length : undefined,
        });
      } else {
        errors++;
        results.push({ wallet: 'unknown', ok: false, error: String(s.reason?.message || s.reason) });
      }
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    picked: wallets.length,
    verified,
    trail_populated: trailFound,
    errors,
    results: results.slice(0, 20),
    note: 'Run kyc-rescan-master-dict afterwards to flip dictionary-matched wallets.',
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}));