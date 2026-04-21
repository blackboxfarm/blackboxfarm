import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple hash function for fingerprinting
async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// Normalize token name for pattern matching (strip numbers, special chars)
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[0-9]+/g, '#')
    .replace(/[^a-z#\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

Deno.serve(withRunLog('token-fingerprint-scanner', async (req, logger) => {
  if (!await isFunctionEnabled('token-fingerprint-scanner')) {
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
    .eq('feature_name', 'template_fingerprinting')
    .single();

  if (!flag?.enabled) {
    logger?.info('Feature disabled via toggle');
    return new Response(JSON.stringify({ status: 'skipped', reason: 'feature_disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 100;

    // Get tokens not yet fingerprinted
    const { data: existingFp } = await supabase
      .from('token_fingerprints')
      .select('token_mint')
      .limit(1000);

    const existingMints = new Set((existingFp || []).map(f => f.token_mint));

    // Get tokens from token_lifecycle
    const { data: tokens, error: tErr } = await supabase
      .from('token_lifecycle')
      .select('token_mint, token_name, token_symbol, description, creator_wallet, metadata')
      .order('first_seen_at', { ascending: false })
      .limit(batchSize * 2);

    if (tErr) throw tErr;

    const unscanned = (tokens || []).filter(t => !existingMints.has(t.token_mint)).slice(0, batchSize);
    if (!unscanned.length) {
      return new Response(JSON.stringify({ status: 'ok', scanned: 0, message: 'No new tokens to scan' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger?.info(`Fingerprinting ${unscanned.length} tokens`);
    let scanned = 0;
    let clustersFound = 0;

    for (const token of unscanned) {
      const nameNorm = normalizeName(token.token_name || '');
      const nameHash = nameNorm ? await hashText(nameNorm) : null;
      const descHash = token.description ? await hashText(token.description) : null;

      // Check for existing matches
      let clusterId: string | null = null;
      let matchCount = 0;

      if (nameHash) {
        const { data: matches } = await supabase
          .from('token_fingerprints')
          .select('token_mint, cluster_id, name_hash')
          .eq('name_hash', nameHash)
          .limit(10);

        if (matches?.length) {
          clusterId = matches[0].cluster_id || `cluster_${nameHash}`;
          matchCount = matches.length;

          // Update existing matches with cluster_id if they don't have one
          for (const match of matches) {
            if (!match.cluster_id) {
              await supabase.from('token_fingerprints')
                .update({ cluster_id: clusterId, match_count: matchCount })
                .eq('token_mint', match.token_mint);
            }
          }

          clustersFound++;
          logger?.info(`🔗 Template match: "${token.token_name}" matches ${matchCount} others (cluster: ${clusterId})`);
        }
      }

      // Also check description hash
      if (!clusterId && descHash) {
        const { data: descMatches } = await supabase
          .from('token_fingerprints')
          .select('token_mint, cluster_id')
          .eq('description_hash', descHash)
          .limit(5);

        if (descMatches?.length) {
          clusterId = descMatches[0].cluster_id || `desc_${descHash}`;
          matchCount = descMatches.length;
          clustersFound++;
        }
      }

      await supabase.from('token_fingerprints').upsert({
        token_mint: token.token_mint,
        name_hash: nameHash,
        description_hash: descHash,
        cluster_id: clusterId,
        match_count: matchCount,
        metadata: {
          original_name: token.token_name,
          normalized_name: nameNorm,
          symbol: token.token_symbol,
          creator_wallet: token.creator_wallet,
        },
      }, { onConflict: 'token_mint' });

      // If cluster found, feed into reputation_mesh
      if (clusterId && token.creator_wallet) {
        await supabase.from('reputation_mesh').upsert({
          source_id: token.creator_wallet,
          source_type: 'wallet',
          linked_id: clusterId,
          linked_type: 'fingerprint_cluster',
          relationship: 'reuses_template',
          confidence: Math.min(50 + matchCount * 15, 95),
          discovered_via: 'token-fingerprint-scanner',
          evidence: {
            token_mint: token.token_mint,
            name_hash: nameHash,
            match_count: matchCount,
          },
        }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
      }

      scanned++;
    }

    const summary = { status: 'ok', scanned, clusters_found: clustersFound };
    logger?.info('Fingerprint scan complete', summary);
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const detail = err instanceof Error
      ? `${err.name}: ${err.message}\n${err.stack ?? ''}`
      : (() => { try { return JSON.stringify(err); } catch { return String(err); } })();
    logger?.error('Fatal error', detail);
    console.error('[token-fingerprint-scanner] fatal:', detail);
    return new Response(JSON.stringify({ error: detail }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
