import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * MESH SPIDER PROCESSOR — Background cron (every 5-10 minutes)
 * 
 * Picks up pending entities from mesh_spider_queue and runs
 * oracle-unified-lookup in 'deep' mode to discover relationships.
 * 
 * This ensures every wallet/token that enters the mesh passively
 * gets fully spidered without blocking the original data pathway.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 5; // Process 5 entities per run
const SPIDER_TIMEOUT_MS = 25000; // 25s timeout per entity

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Pick up pending entities, prioritizing wallets > tokens
    const { data: pending, error: fetchErr } = await supabase
      .from("mesh_spider_queue")
      .select("*")
      .eq("status", "pending")
      .order("priority", { ascending: false })
      .order("queued_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;

    if (!pending?.length) {
      return new Response(JSON.stringify({ message: "No pending entities", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🕷️ Mesh Spider Processor: ${pending.length} entities to process`);

    let processed = 0;
    let linksTotal = 0;
    const results: any[] = [];

    for (const item of pending) {
      // Mark as processing
      await supabase
        .from("mesh_spider_queue")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", item.id);

      try {
        // Invoke oracle-unified-lookup with deep scan
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), SPIDER_TIMEOUT_MS);

        const { data, error } = await supabase.functions.invoke("oracle-unified-lookup", {
          body: { input: item.entity_id, scanMode: "quick" },
        });

        clearTimeout(timeout);

        if (error) {
          console.warn(`[spider] Error for ${item.entity_id}: ${error.message}`);
          await supabase
            .from("mesh_spider_queue")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              error_message: error.message,
            })
            .eq("id", item.id);
          continue;
        }

        const linksDiscovered = data?.meshLinksAdded || 0;
        linksTotal += linksDiscovered;

        await supabase
          .from("mesh_spider_queue")
          .update({
            status: "complete",
            completed_at: new Date().toISOString(),
            links_discovered: linksDiscovered,
            result_summary: {
              score: data?.score,
              trafficLight: data?.trafficLight,
              totalTokens: data?.stats?.totalTokens,
              linkedWallets: data?.network?.linkedWallets?.length || 0,
            },
          })
          .eq("id", item.id);

        processed++;
        results.push({
          entity: item.entity_id.slice(0, 12),
          type: item.entity_type,
          links: linksDiscovered,
        });

        console.log(`   ✅ ${item.entity_type}:${item.entity_id.slice(0, 12)}... → ${linksDiscovered} links`);
      } catch (e) {
        console.error(`[spider] Fatal error for ${item.entity_id}: ${e}`);
        await supabase
          .from("mesh_spider_queue")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: String(e),
          })
          .eq("id", item.id);
      }

      // Small delay between entities
      await new Promise((r) => setTimeout(r, 500));
    }

    const summary = { processed, linksTotal, results };
    console.log(`📊 Spider Summary: ${processed} processed, ${linksTotal} links discovered`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[mesh-spider-processor] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
