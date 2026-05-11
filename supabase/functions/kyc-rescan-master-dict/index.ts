// kyc-rescan-master-dict
//
// ZERO-API-COST rescan that flips developer_profiles.kyc_verified retroactively
// using only the in-DB funding graph (`reputation_mesh.relationship='funded_by'`)
// and the now-broader entity dictionary (`known_cex_wallets.entity_type` of
// cex / bridge / onramp / aggregator / mm_desk / custodian).
//
// Walks up to 6 hops per wallet. No Helius / Solscan / Birdeye calls.
// Run on-demand or via cron every 6h. Auto-skips already-verified rows.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { withRunLog } from '../_shared/run-logger.ts';
import { warmCexCache, getEntityCached } from '../_shared/cex-wallets-db.ts';
import { assertUpsert } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_HOPS = 6;

Deno.serve(withRunLog('kyc-rescan-master-dict', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* cron POST may be empty */ }
  const batchSize = Math.min(Math.max(Number(body.batchSize) || 500, 50), 2000);

  // Warm dictionary once for the whole batch.
  await warmCexCache();

  // 1) Pull unverified dev profiles, newest first.
  const { data: profiles, error } = await supabase
    .from('developer_profiles')
    .select('master_wallet_address, kyc_verified, kyc_trail_status')
    .or('kyc_verified.is.null,kyc_verified.eq.false')
    .order('updated_at', { ascending: false })
    .limit(batchSize);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let scanned = 0;
  let verified = 0;
  let trailNoKyc = 0;
  let trailIncomplete = 0;
  const byEntity: Record<string, number> = {};

  for (const row of profiles ?? []) {
    scanned++;
    const start = row.master_wallet_address as string;
    if (!start) continue;

    // BFS through reputation_mesh funded_by relationships.
    const visited = new Set<string>([start]);
    let frontier: string[] = [start];
    let hit: { kycRoot: string; entity: { name: string; type: string } } | null = null;

    for (let hop = 0; hop < MAX_HOPS && frontier.length > 0 && !hit; hop++) {
      // Direct dictionary check on every wallet in frontier.
      for (const w of frontier) {
        const ent = getEntityCached(w);
        if (ent) { hit = { kycRoot: w, entity: ent }; break; }
      }
      if (hit) break;

      const { data: edges } = await supabase
        .from('reputation_mesh')
        .select('linked_id')
        .in('source_id', frontier)
        .eq('source_type', 'wallet')
        .eq('linked_type', 'wallet')
        .eq('relationship', 'funded_by')
        .limit(200);

      const next: string[] = [];
      for (const e of edges ?? []) {
        const id = e.linked_id as string;
        if (!id || visited.has(id)) continue;
        visited.add(id);
        next.push(id);
      }
      frontier = next;
    }

    if (hit) {
      verified++;
      byEntity[hit.entity.type] = (byEntity[hit.entity.type] ?? 0) + 1;
      await assertUpsert(supabase
        .from('developer_profiles')
        .upsert({
          master_wallet_address: start,
          kyc_verified: true,
          kyc_source: `rescan_${hit.entity.type}:${hit.entity.name}`,
          kyc_source_type: hit.entity.type,
          kyc_trail_status: 'verified',
          kyc_verification_date: new Date().toISOString(),
          kyc_last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'master_wallet_address', ignoreDuplicates: false }),
        'developer_profiles');
    } else {
      // Tag trail status so UI / coverage panel can break it down honestly.
      const trailStatus = visited.size <= 1 ? 'trail_no_kyc' : 'trail_incomplete';
      if (trailStatus === 'trail_no_kyc') trailNoKyc++;
      else trailIncomplete++;
      // Only stamp if not already stamped — don't churn updated_at.
      if (!row.kyc_trail_status) {
        await assertUpsert(supabase
          .from('developer_profiles')
          .upsert({
            master_wallet_address: start,
            kyc_trail_status: trailStatus,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'master_wallet_address', ignoreDuplicates: false }),
          'developer_profiles');
      }
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    scanned,
    verified,
    trail_no_kyc: trailNoKyc,
    trail_incomplete: trailIncomplete,
    by_entity: byEntity,
    dictionary_size_hint: 'warmed at start',
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}));