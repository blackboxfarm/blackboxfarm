import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Backfill health grades for tokens in the live feed that are missing them.
 * Queues tokens into holders_intel_post_queue with trigger_source='backfill_health'
 * so the existing holders-intel-poster pipeline picks them up and analyzes them.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 50;

    // Find tokens in the curated feed that lack health grades
    // Priority: Top 200 first (freshness_tier=1), then recent posts
    const { data: needsGrade, error: queryError } = await supabase
      .from('live_feed_curated')
      .select('token_mint, symbol, name, freshness_tier')
      .is('health_grade', null)
      .order('freshness_tier', { ascending: true })
      .limit(limit);

    if (queryError) {
      throw new Error(`Query error: ${queryError.message}`);
    }

    if (!needsGrade || needsGrade.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'All tokens have health grades', queued: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${needsGrade.length} tokens needing health grades`);

    // Check which ones are already queued (avoid duplicates)
    const mints = needsGrade.map((t: any) => t.token_mint);
    const { data: existing } = await supabase
      .from('holders_intel_post_queue')
      .select('token_mint')
      .in('token_mint', mints)
      .in('status', ['pending', 'processing'])
      .eq('trigger_source', 'backfill_health');

    const alreadyQueued = new Set((existing || []).map((e: any) => e.token_mint));
    const toQueue = needsGrade.filter((t: any) => !alreadyQueued.has(t.token_mint));

    if (toQueue.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'All tokens already queued', queued: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert into queue
    const rows = toQueue.map((t: any) => ({
      token_mint: t.token_mint,
      symbol: t.symbol || null,
      name: t.name || null,
      scheduled_at: new Date().toISOString(),
      status: 'pending',
      trigger_source: 'backfill_health',
      trigger_comment: `Backfill health grade (tier ${t.freshness_tier})`,
    }));

    const { error: insertError } = await supabase
      .from('holders_intel_post_queue')
      .insert(rows);

    if (insertError) {
      throw new Error(`Insert error: ${insertError.message}`);
    }

    console.log(`Queued ${toQueue.length} tokens for health grade backfill`);

    return new Response(JSON.stringify({
      success: true,
      queued: toQueue.length,
      skipped: alreadyQueued.size,
      tokens: toQueue.map((t: any) => ({ mint: t.token_mint, symbol: t.symbol, tier: t.freshness_tier })),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Backfill error:", error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
