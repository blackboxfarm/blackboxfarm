import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';
import { assertInsert } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Trusted Dev → Whitelist Promoter
 *
 * Reads developer_profiles where trust_level='trusted' and promotes them to
 * pumpfun_whitelist (entry_type='dev_wallet') with verified credentials.
 *
 * Quality bars (conservative — tunable via body):
 *   total_tokens_created  >= minTokens (default 2)
 *   rug_pull_count        == 0
 *   integrity_score       >= minIntegrity (default 70)
 */
Deno.serve(withRunLog('trusted-whitelist-promoter', async (req, logger) => {
  if (!await isFunctionEnabled('trusted-whitelist-promoter')) {
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
    const minTokens = body.minTokens ?? 2;
    const minIntegrity = body.minIntegrity ?? 70;
    const batchSize = Math.min(body.batchSize ?? 100, 200);

    const { data: candidates, error: cErr } = await supabase
      .from('developer_profiles')
      .select('id, master_wallet_address, trust_level, total_tokens_created, successful_tokens, rug_pull_count, integrity_score, twitter_handle, telegram_handle, total_volume_generated, average_token_lifespan_days, notes')
      .eq('trust_level', 'trusted')
      .gte('total_tokens_created', minTokens)
      .eq('rug_pull_count', 0)
      .gte('integrity_score', minIntegrity)
      .order('integrity_score', { ascending: false })
      .limit(batchSize);

    if (cErr) throw cErr;
    if (!candidates?.length) {
      logger?.info('No trusted candidates meeting bars');
      return new Response(JSON.stringify({ status: 'ok', candidates: 0, promoted: 0, skipped: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const wallets = candidates.map(c => c.master_wallet_address);
    const { data: existing } = await supabase
      .from('pumpfun_whitelist')
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

      const trustTier = (dev.integrity_score ?? 0) >= 90 ? 'high' : (dev.integrity_score ?? 0) >= 80 ? 'medium' : 'low';
      const reason = `Auto-promoted from developer_profiles: trust_level=trusted, integrity ${dev.integrity_score?.toFixed?.(0) ?? 'n/a'}, ${dev.successful_tokens || 0}/${dev.total_tokens_created} successful tokens, 0 rugs.`;

      try {
        await assertInsert(
          supabase.from('pumpfun_whitelist').insert({
            entry_type: 'dev_wallet',
            identifier: dev.master_wallet_address,
            linked_wallets: [dev.master_wallet_address],
            linked_twitter: dev.twitter_handle ? [dev.twitter_handle] : [],
            linked_telegram: dev.telegram_handle ? [dev.telegram_handle] : [],
            trust_level: trustTier,
            whitelist_reason: reason,
            evidence_notes: dev.notes,
            tokens_launched: dev.total_tokens_created || 0,
            tokens_successful: dev.successful_tokens || 0,
            avg_token_lifespan_hours: dev.average_token_lifespan_days ? dev.average_token_lifespan_days * 24 : 0,
            total_volume_sol: dev.total_volume_generated || 0,
            source: 'trusted-whitelist-promoter',
            is_active: true,
            auto_classified: true,
            classification_score: dev.integrity_score ?? null,
            recommendation_text: `Auto-promoted; ${dev.successful_tokens || 0} successful launches, integrity ${dev.integrity_score ?? 'n/a'}.`,
            tags: ['auto-promoted', 'from-developer-profiles'],
          }).select('id').single(),
          'pumpfun_whitelist'
        );
        promoted++;
      } catch (err: any) {
        errors.push(`${dev.master_wallet_address.slice(0, 8)}: ${err.message?.slice(0, 80)}`);
        if (errors.length > 5) break;
      }
    }

    const summary = {
      status: 'ok',
      candidates: candidates.length,
      promoted,
      skipped_already_listed: skipped,
      errors: errors.length,
      error_samples: errors.slice(0, 3),
      bars: { minTokens, minIntegrity },
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