import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 200;

function calculateScore(stats: {
  totalTokens: number;
  rugPulls: number;
  successfulTokens: number;
  avgDumpTimeMins: number;
  meshConnections: number;
  isSerialSpammer: boolean;
}): number {
  let score = 50;

  // Negative signals
  score -= Math.min(40, (stats.rugPulls || 0) * 15);
  if (stats.avgDumpTimeMins > 0 && stats.avgDumpTimeMins < 60) score -= 15;
  if (stats.totalTokens > 0 && stats.rugPulls / stats.totalTokens > 0.5) score -= 20;
  if (stats.isSerialSpammer) score -= 15;

  // Mesh penalty: wallets connected to many known bad actors
  if (stats.meshConnections > 5) score -= 10;
  else if (stats.meshConnections > 2) score -= 5;

  // Positive signals
  score += Math.min(30, (stats.successfulTokens || 0) * 10);
  if (stats.totalTokens > 5 && stats.successfulTokens / stats.totalTokens > 0.6) score += 15;

  return Math.max(0, Math.min(100, score));
}

function determineTrustLevel(score: number): string {
  if (score >= 80) return 'trusted';
  if (score >= 40) return 'neutral';
  if (score >= 20) return 'suspicious';
  return 'scammer';
}

Deno.serve(withRunLog('reputation-backfill', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: user.id });
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Super admin required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { offset = 0 } = await req.json();

    // Get total count for progress
    const { count: totalCount } = await supabase
      .from('dev_wallet_reputation')
      .select('id', { count: 'exact', head: true });

    // Fetch batch from dev_wallet_reputation
    const { data: wallets, error: fetchError } = await supabase
      .from('dev_wallet_reputation')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (fetchError) throw fetchError;
    if (!wallets || wallets.length === 0) {
      return new Response(JSON.stringify({
        success: true, done: true, processed: 0, offset, total: totalCount || 0,
        message: 'Backfill complete — no more wallets to process',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let upserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const wallet of wallets) {
      try {
        // Get mesh connection count for this wallet
        const { count: meshCount } = await supabase
          .from('reputation_mesh')
          .select('id', { count: 'exact', head: true })
          .or(`source_id.eq.${wallet.wallet_address},linked_id.eq.${wallet.wallet_address}`);

        const stats = {
          totalTokens: wallet.total_tokens_launched || 0,
          rugPulls: wallet.tokens_rugged || 0,
          successfulTokens: wallet.tokens_successful || 0,
          avgDumpTimeMins: wallet.avg_time_before_dump_mins || 0,
          meshConnections: meshCount || 0,
          isSerialSpammer: wallet.is_serial_spammer || false,
        };

        const score = calculateScore(stats);
        const trustLevel = determineTrustLevel(score);

        // Extract first social handle if available
        const twitterHandle = wallet.twitter_accounts?.length > 0 ? wallet.twitter_accounts[0] : null;
        const telegramHandle = wallet.telegram_groups?.length > 0 ? wallet.telegram_groups[0] : null;

        // Upsert into developer_profiles
        const { error: upsertError } = await supabase
          .from('developer_profiles')
          .upsert({
            master_wallet_address: wallet.wallet_address,
            reputation_score: parseFloat(score.toFixed(2)),
            trust_level: trustLevel,
            total_tokens_created: stats.totalTokens,
            successful_tokens: stats.successfulTokens,
            rug_pull_count: stats.rugPulls,
            failed_tokens: (wallet.tokens_abandoned || 0),
            twitter_handle: twitterHandle,
            telegram_handle: telegramHandle,
            average_token_lifespan_days: wallet.avg_token_lifespan_mins
              ? parseFloat((wallet.avg_token_lifespan_mins / 1440).toFixed(2))
              : null,
            source: 'backfill',
            updated_at: new Date().toISOString(),
            last_analysis_at: new Date().toISOString(),
            metadata: {
              avg_peak_mcap_usd: wallet.avg_peak_mcap_usd,
              avg_time_before_dump_mins: wallet.avg_time_before_dump_mins,
              mesh_connections: meshCount || 0,
              dev_pattern: wallet.dev_pattern,
              success_rate_pct: wallet.success_rate_pct,
              backfilled_at: new Date().toISOString(),
            },
          }, { onConflict: 'master_wallet_address' });

        if (upsertError) {
          console.error(`[Backfill] Upsert error for ${wallet.wallet_address}:`, upsertError.message);
          errors++;
        } else {
          upserted++;
        }
      } catch (walletError) {
        console.error(`[Backfill] Error processing ${wallet.wallet_address}:`, walletError);
        errors++;
      }
    }

    const nextOffset = offset + wallets.length;
    const done = wallets.length < BATCH_SIZE;

    return new Response(JSON.stringify({
      success: true,
      done,
      processed: upserted,
      skipped,
      errors,
      offset,
      nextOffset,
      total: totalCount || 0,
      batchSize: wallets.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[Backfill] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
