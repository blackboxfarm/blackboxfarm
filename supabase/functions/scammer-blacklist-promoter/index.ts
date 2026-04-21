import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';
import { assertInsert } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Scammer → Blacklist Promoter
 *
 * Reads developer_profiles where trust_level='scammer' AND meets quality bars,
 * promotes them into pumpfun_blacklist (entry_type='dev_wallet') if not already present.
 *
 * Quality bars (conservative — tunable via body):
 *   total_tokens_created >= minTokens (default 3)
 *   rug_pull_count        >= minRugs   (default 2)
 *
 * This closes the gap of 16k scammer-graded devs vs only 54 blacklist entries.
 */
Deno.serve(withRunLog('scammer-blacklist-promoter', async (req, logger) => {
  if (!await isFunctionEnabled('scammer-blacklist-promoter')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const minTokens = body.minTokens ?? 3;
    const minRugs = body.minRugs ?? 2;
    const batchSize = Math.min(body.batchSize ?? 200, 500);

    // Pull candidate scammers
    const { data: candidates, error: cErr } = await supabase
      .from('developer_profiles')
      .select('id, master_wallet_address, trust_level, total_tokens_created, rug_pull_count, quick_dump_count, slow_drain_count, twitter_handle, telegram_handle, integrity_score, blacklist_reason, notes')
      .eq('trust_level', 'scammer')
      .gte('total_tokens_created', minTokens)
      .gte('rug_pull_count', minRugs)
      .order('rug_pull_count', { ascending: false })
      .limit(batchSize);

    if (cErr) throw cErr;
    if (!candidates?.length) {
      logger?.info('No scammer candidates meeting bars');
      return new Response(JSON.stringify({ status: 'ok', candidates: 0, promoted: 0, skipped: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find wallets already on the blacklist (avoid duplicate promotion)
    const wallets = candidates.map(c => c.master_wallet_address);
    const { data: existing } = await supabase
      .from('pumpfun_blacklist')
      .select('identifier')
      .eq('entry_type', 'dev_wallet')
      .in('identifier', wallets);
    const existingSet = new Set((existing || []).map(e => e.identifier));

    let promoted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const dev of candidates) {
      if (existingSet.has(dev.master_wallet_address)) {
        skipped++;
        continue;
      }

      const totalBad = (dev.rug_pull_count || 0) + (dev.quick_dump_count || 0) + (dev.slow_drain_count || 0);
      const riskLevel = totalBad >= 5 ? 'high' : totalBad >= 3 ? 'medium' : 'low';
      const reason = dev.blacklist_reason
        || `Auto-promoted from developer_profiles: trust_level=scammer, ${dev.rug_pull_count} rugs / ${dev.quick_dump_count || 0} dumps / ${dev.slow_drain_count || 0} drains across ${dev.total_tokens_created} tokens.`;

      try {
        await assertInsert(
          supabase.from('pumpfun_blacklist').insert({
            entry_type: 'dev_wallet',
            identifier: dev.master_wallet_address,
            linked_wallets: [dev.master_wallet_address],
            linked_twitter: dev.twitter_handle ? [dev.twitter_handle] : [],
            linked_telegram: dev.telegram_handle ? [dev.telegram_handle] : [],
            risk_level: riskLevel,
            blacklist_reason: reason,
            evidence_notes: dev.notes,
            tokens_rugged: dev.rug_pull_count || 0,
            source: 'scammer-blacklist-promoter',
            added_by: 'scammer-blacklist-promoter',
            is_active: true,
            auto_classified: true,
            classification_score: dev.integrity_score ?? null,
            recommendation_text: `Promoted automatically from developer_profiles (integrity score ${dev.integrity_score ?? 'n/a'}).`,
            tags: ['auto-promoted', 'from-developer-profiles'],
          }).select('id').single(),
          'pumpfun_blacklist'
        );
        promoted++;
      } catch (err: any) {
        // Surface but keep going — the assertInsert already logged + SMS'd
        errors.push(`${dev.master_wallet_address.slice(0, 8)}: ${err.message?.slice(0, 80)}`);
        if (errors.length > 5) break; // stop hammering on persistent failures
      }
    }

    const summary = {
      status: 'ok',
      candidates: candidates.length,
      promoted,
      skipped_already_listed: skipped,
      errors: errors.length,
      error_samples: errors.slice(0, 3),
      bars: { minTokens, minRugs },
    };
    logger?.info('Promotion complete', summary);
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger?.error('Fatal error', String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));