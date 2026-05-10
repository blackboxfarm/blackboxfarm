// kyc-backfill-master
// Newest-first KYC backfill driver for the Master Token Directory.
// Picks unverified creators from master_token_directory, skips any developer
// whose kyc_last_checked_at is within 24h, and delegates the actual on-chain
// trace to mesh-kyc-deep-search (which now writes kyc_verified +
// kyc_last_checked_at into developer_profiles itself). Never deletes data.
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_DEFAULT = 100;
const COOLDOWN_HOURS = 24;

Deno.serve(withRunLog('kyc-backfill-master', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* cron POST may be empty */ }
  const batchSize: number = Math.min(Math.max(body.batchSize ?? BATCH_DEFAULT, 1), 100);

  const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 3600_000).toISOString();

  // 1) Pull newest-first unverified creators from the master directory.
  //    We over-fetch to allow client-side cooldown filtering.
  const { data: candidates, error: cErr } = await supabase
    .from('master_token_directory')
    .select('token_mint, creator_wallet, created_at')
    .eq('kyc_verified', false)
    .not('creator_wallet', 'is', null)
    .order('created_at', { ascending: false })
    .limit(batchSize * 4);

  if (cErr) {
    return new Response(JSON.stringify({ error: cErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Dedup creators, keep newest sighting
  const seen = new Set<string>();
  const ordered: Array<{ wallet: string; mint: string }> = [];
  for (const r of candidates ?? []) {
    const w = r.creator_wallet as string;
    if (!w || seen.has(w)) continue;
    seen.add(w);
    ordered.push({ wallet: w, mint: r.token_mint });
    if (ordered.length >= batchSize * 2) break;
  }

  // 2) Cooldown filter via developer_profiles.kyc_last_checked_at
  // FIX: column is master_wallet_address, not developer_wallet. Old code
  // matched zero rows so cooldown never applied. Also drop already-verified.
  const wallets = ordered.map(o => o.wallet);
  const { data: profs } = await supabase
    .from('developer_profiles')
    .select('master_wallet_address, kyc_last_checked_at, kyc_verified')
    .in('master_wallet_address', wallets);

  const recent = new Set(
    (profs ?? [])
      .filter(p => p.kyc_verified === true || (p.kyc_last_checked_at && p.kyc_last_checked_at > cutoff))
      .map(p => p.master_wallet_address),
  );

  const targets = ordered.filter(o => !recent.has(o.wallet)).slice(0, batchSize);

  // 3) Delegate to mesh-kyc-deep-search for each, sequentially to respect Helius limits.
  const results: any[] = [];
  for (const t of targets) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/mesh-kyc-deep-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ walletAddress: t.wallet, maxDepth: 6 }),
      });
      const ok = res.ok;
      const json = ok ? await res.json().catch(() => ({})) : { error: await res.text() };

      // mesh-kyc-deep-search now upserts kyc_last_checked_at itself, so no
      // separate stamp here (and the old eq('developer_wallet', …) matched
      // zero rows anyway because the column is master_wallet_address).
      results.push({ wallet: t.wallet, mint: t.mint, ok, ...(ok ? { kycRoot: json?.kycRoot ?? null } : { error: json?.error }) });
    } catch (e) {
      results.push({ wallet: t.wallet, mint: t.mint, ok: false, error: (e as Error).message });
    }
    // gentle pacing
    await new Promise(r => setTimeout(r, 350));
  }

  return new Response(
    JSON.stringify({
      success: true,
      candidates: candidates?.length ?? 0,
      attempted: targets.length,
      cooled_down: ordered.length - targets.length,
      results,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}));
