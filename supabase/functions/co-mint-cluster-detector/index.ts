import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(withRunLog('co-mint-cluster-detector', async (req, logger) => {
  if (!await isFunctionEnabled('co-mint-cluster-detector')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check feature flag
  const { data: flag } = await supabase
    .from('intelligence_feature_flags')
    .select('enabled')
    .eq('feature_name', 'co_mint_clustering')
    .single();

  if (!flag?.enabled) {
    logger?.info('Feature disabled via toggle');
    return new Response(JSON.stringify({ status: 'skipped', reason: 'feature_disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const windowMinutes = body.windowMinutes || 5;
    const lookbackHours = body.lookbackHours || 24;

    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

    // Get recent mint events
    const { data: mintEvents, error: mErr } = await supabase
      .from('wallet_family_mint_events')
      .select('id, mint_address, detected_by_wallet, family_id, event_type, created_at, tx_signature')
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (mErr) throw mErr;
    if (!mintEvents?.length || mintEvents.length < 2) {
      return new Response(JSON.stringify({ status: 'ok', clusters: 0, message: 'Not enough mint events' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger?.info(`Analyzing ${mintEvents.length} mint events for co-minting patterns`);

    // Group events by time window
    const windowMs = windowMinutes * 60 * 1000;
    const clusters: Map<string, typeof mintEvents> = new Map();

    for (let i = 0; i < mintEvents.length; i++) {
      const event = mintEvents[i];
      const eventTime = new Date(event.created_at).getTime();

      // Find all events within window
      const nearby = mintEvents.filter(other => {
        if (other.id === event.id) return false;
        if (other.detected_by_wallet === event.detected_by_wallet) return false; // Same wallet doesn't count
        if (other.family_id === event.family_id) return false; // Same family doesn't count
        const otherTime = new Date(other.created_at).getTime();
        return Math.abs(otherTime - eventTime) <= windowMs;
      });

      if (nearby.length > 0) {
        const allEvents = [event, ...nearby];
        const wallets = [...new Set(allEvents.map(e => e.detected_by_wallet))].sort();
        const clusterKey = wallets.join('_');

        if (!clusters.has(clusterKey)) {
          clusters.set(clusterKey, allEvents);
        }
      }
    }

    let newClusters = 0;

    for (const [key, events] of clusters.entries()) {
      const wallets = [...new Set(events.map(e => e.detected_by_wallet))];
      const mints = [...new Set(events.map(e => e.mint_address))];
      const times = events.map(e => new Date(e.created_at).getTime());
      const clusterId = `comint_${key.slice(0, 32)}`;

      const confidence = Math.min(50 + wallets.length * 15 + mints.length * 10, 95);

      const { error: upsertErr } = await supabase.from('co_mint_clusters').upsert({
        cluster_id: clusterId,
        wallet_addresses: wallets,
        mint_addresses: mints,
        block_window: {
          earliest: new Date(Math.min(...times)).toISOString(),
          latest: new Date(Math.max(...times)).toISOString(),
          window_minutes: windowMinutes,
        },
        confidence,
      }, { onConflict: 'cluster_id' });

      if (!upsertErr) {
        newClusters++;

        // Cross-link wallets in reputation_mesh
        for (let i = 0; i < wallets.length; i++) {
          for (let j = i + 1; j < wallets.length; j++) {
            await supabase.from('reputation_mesh').upsert({
              source_id: wallets[i],
              source_type: 'wallet',
              linked_id: wallets[j],
              linked_type: 'wallet',
              relationship: 'co_minted',
              confidence,
              discovered_via: 'co-mint-cluster-detector',
              evidence: {
                cluster_id: clusterId,
                shared_mints: mints,
                window_minutes: windowMinutes,
              },
            }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
          }
        }

        logger?.info(`🔗 Co-mint cluster: ${wallets.length} wallets, ${mints.length} mints within ${windowMinutes}min`);
      }
    }

    const summary = { status: 'ok', events_analyzed: mintEvents.length, clusters_found: newClusters };
    logger?.info('Co-mint detection complete', summary);
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
