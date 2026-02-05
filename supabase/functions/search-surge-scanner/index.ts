import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SurgePattern {
  type: string;
  minutes: number;
  threshold: number;
  comment: string;
  priority: number;
}

const SURGE_PATTERNS: SurgePattern[] = [
  { type: 'surge_10min', minutes: 10, threshold: 5, comment: ' : Search Surge!', priority: 1 },
  { type: 'spike_1hr', minutes: 60, threshold: 15, comment: ' : Interest Spike!', priority: 2 },
  { type: 'trending_24hr', minutes: 1440, threshold: 30, comment: ' : Trending Token!', priority: 3 },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const results: { pattern: string; detected: number; queued: number }[] = [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const today = todayStart.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Track tokens we've already processed in this scan (use highest priority)
    const processedTokens = new Map<string, SurgePattern>();

    for (const pattern of SURGE_PATTERNS) {
      const cutoffTime = new Date(Date.now() - pattern.minutes * 60 * 1000).toISOString();

      // Query for surge patterns using RPC if available, else fallback
      let surgeData: any[] | null = null;
      
      try {
        const { data: surges, error: surgeError } = await supabase.rpc('get_search_surges', {
          p_cutoff_time: cutoffTime,
          p_threshold: pattern.threshold
        });
        
        if (!surgeError && surges) {
          surgeData = surges;
        }
      } catch (rpcErr) {
        console.log('RPC not found, using fallback query');
      }

      // Fallback: Use direct query if RPC doesn't exist or failed
      if (!surgeData) {
        const { data: rawData } = await supabase
          .from('token_search_log')
          .select('token_mint')
          .gte('created_at', cutoffTime);

        if (rawData) {
          // Count occurrences manually
          const counts = new Map<string, { count: number; ips: Set<string> }>();
          for (const row of rawData) {
            const existing = counts.get(row.token_mint) || { count: 0, ips: new Set() };
            existing.count++;
            counts.set(row.token_mint, existing);
          }
          
          surgeData = Array.from(counts.entries())
            .filter(([_, v]) => v.count >= pattern.threshold)
            .map(([token_mint, v]) => ({
              token_mint,
              search_count: v.count,
              unique_ips: v.ips.size
            }));
        }
      }

      let detected = 0;
      let queued = 0;

      if (surgeData && surgeData.length > 0) {
        for (const surge of surgeData) {
          detected++;
          
          // Skip if already processed with higher priority pattern
          const existing = processedTokens.get(surge.token_mint);
          if (existing && existing.priority <= pattern.priority) {
            continue;
          }

          // Check if already alerted today for this pattern
          const { data: existingAlert } = await supabase
            .from('holders_intel_surge_alerts')
            .select('id')
            .eq('token_mint', surge.token_mint)
            .eq('alert_type', pattern.type)
            .eq('alert_date', today)
            .maybeSingle();

          if (existingAlert) {
            continue; // Already alerted today for this pattern
          }

          // Get token symbol from recent search log or metadata
          const { data: tokenInfo } = await supabase
            .from('token_search_log')
            .select('symbol, name')
            .eq('token_mint', surge.token_mint)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const symbol = tokenInfo?.symbol || null;
          const name = tokenInfo?.name || null;

          // Queue for posting
          const { data: queueEntry, error: queueError } = await supabase
            .from('holders_intel_post_queue')
            .insert({
              token_mint: surge.token_mint,
              symbol: symbol,
              status: 'pending',
              scheduled_at: new Date(Date.now() + 60000).toISOString(), // 1 min from now
              trigger_comment: pattern.comment,
              trigger_source: 'surge_scanner',
            })
            .select('id')
            .single();

          if (queueError) {
            console.error(`Failed to queue ${surge.token_mint}:`, queueError);
            continue;
          }

          // Record the surge alert
          const { error: alertError } = await supabase
            .from('holders_intel_surge_alerts')
            .insert({
              token_mint: surge.token_mint,
              symbol: symbol,
              name: name,
              alert_type: pattern.type,
              search_count: surge.search_count,
              time_window_minutes: pattern.minutes,
              unique_ips: surge.unique_ips || null,
              queue_id: queueEntry?.id || null,
              alert_date: today,
            });

          if (alertError) {
            console.error(`Failed to record alert for ${surge.token_mint}:`, alertError);
          } else {
            queued++;
            processedTokens.set(surge.token_mint, pattern);
            console.log(`Queued ${symbol || surge.token_mint} for ${pattern.type} (${surge.search_count} searches)`);
          }
        }
      }

      results.push({ pattern: pattern.type, detected, queued });
    }

    const totalQueued = results.reduce((sum, r) => sum + r.queued, 0);
    const totalDetected = results.reduce((sum, r) => sum + r.detected, 0);

    console.log(`Surge scan complete: ${totalDetected} detected, ${totalQueued} queued`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Surge scanner complete: ${totalQueued} tokens queued`,
        results,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Surge scanner error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
