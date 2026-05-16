import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Batch-archive existing pending rows from the Manual X Posting Queue.
 * For each pending row, invokes holders-intel-auto-archive which:
 *   composes tweet → fetches banner → decorates → flips to posted_manual.
 * No other sources. No fabricated tokens. Only what's in the queue.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(500, Number(body.limit) || 50));
    const concurrency = Math.max(1, Math.min(8, Number(body.concurrency) || 3));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: rows, error } = await supabase
      .from("holders_intel_post_queue")
      .select("id, token_mint, symbol")
      .eq("manual_status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const queue = [...(rows || [])];
    const results: any[] = [];
    let ok = 0, failed = 0;

    const worker = async () => {
      while (queue.length) {
        const row = queue.shift();
        if (!row) break;
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/holders-intel-auto-archive`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ queue_id: row.id }),
          });
          const text = await res.text();
          if (!res.ok) {
            failed++;
            results.push({ id: row.id, symbol: row.symbol, ok: false, error: text.slice(0, 200) });
          } else {
            ok++;
            results.push({ id: row.id, symbol: row.symbol, ok: true });
          }
        } catch (e: any) {
          failed++;
          results.push({ id: row.id, symbol: row.symbol, ok: false, error: e?.message || String(e) });
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return new Response(JSON.stringify({ success: true, processed: results.length, ok, failed, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[holders-intel-archive-batch] error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});