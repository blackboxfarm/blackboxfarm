import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { assetId, name, base64Png } = await req.json();
    if (!assetId || !name || !base64Png) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const bin = Uint8Array.from(atob(base64Png), c => c.charCodeAt(0));
    const path = `character/${Date.now()}-${name}.png`;
    const up = await sb.storage.from("no-lube-assets").upload(path, bin, { contentType: "image/png", upsert: false });
    if (up.error) throw up.error;
    const { data: pub } = sb.storage.from("no-lube-assets").getPublicUrl(path);
    const upd = await sb.from("no_lube_assets").update({ storage_path: path, public_url: pub.publicUrl }).eq("id", assetId);
    if (upd.error) throw upd.error;
    return new Response(JSON.stringify({ ok: true, path, url: pub.publicUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});