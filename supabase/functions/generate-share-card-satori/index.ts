import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import satori from "https://esm.sh/satori@0.10.14";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let resvgInitPromise: Promise<void> | null = null;

function ensureResvgInitialized(): Promise<void> {
  if (resvgInitPromise) return resvgInitPromise;
  resvgInitPromise = (async () => {
    const wasmUrl = "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.0/index_bg.wasm";
    try {
      await initWasm(fetch(wasmUrl));
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (msg.toLowerCase().includes("already") && msg.toLowerCase().includes("initialized")) return;
      throw e;
    }
  })();
  return resvgInitPromise;
}

interface TokenStats {
  symbol: string;
  name: string;
  tokenAddress?: string;
  tokenImage?: string;
  totalHolders: number;
  realHolders: number;
  whaleCount: number;
  strongCount: number;
  activeCount: number;
  dustCount: number;
  dustPercentage: number;
  top25Percentage?: number;
  healthScore: number;
  healthGrade: string;
  marketCapUsd?: number;
  dexPaid?: boolean;
  dexBoosts?: number;
  hasMarketing?: boolean;
}

function getGradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#10b981';
  if (grade.startsWith('B')) return '#3b82f6';
  if (grade.startsWith('C')) return '#f59e0b';
  return '#ef4444';
}

function formatMarketCap(value?: number): string {
  if (!value || value <= 0) return "N/A";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

async function loadFont(): Promise<ArrayBuffer> {
  const fontUrl = "https://sf6-cdn-tos.douyinstatic.com/obj/eden-cn/slepweh7nupqpognuhbo/Inter-Regular.ttf";
  const res = await fetch(fontUrl);
  if (!res.ok) throw new Error(`Failed to fetch font: ${res.status}`);
  return await res.arrayBuffer();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenStats } = await req.json() as { tokenStats: TokenStats };
    console.log('Generating Satori share card for:', tokenStats.symbol);

    const gradeColor = getGradeColor(tokenStats.healthGrade);
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const marketCap = formatMarketCap(tokenStats.marketCapUsd);
    const top25Pct = tokenStats.top25Percentage ?? 0;
    const ca = tokenStats.tokenAddress || "";
    const shortCA = ca.length > 16 ? `${ca.slice(0, 6)}...${ca.slice(-4)}` : ca;

    const fontData = await loadFont();

    // Simple, memory-efficient card layout
    const cardTree = {
      type: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          width: "1200px",
          height: "628px",
          padding: "32px",
          fontFamily: "Inter",
          color: "white",
          background: "linear-gradient(135deg, #0a0f1a 0%, #1a1f2e 100%)",
        },
        children: [
          // Header row
          {
            type: "div",
            props: {
              style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" },
              children: [
                // Left side - Token info
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", gap: "16px" },
                    children: [
                      // Token image or placeholder
                      tokenStats.tokenImage ? {
                        type: "img",
                        props: {
                          src: tokenStats.tokenImage,
                          style: { width: "64px", height: "64px", borderRadius: "12px" },
                        },
                      } : {
                        type: "div",
                        props: {
                          style: {
                            width: "64px", height: "64px", borderRadius: "12px",
                            background: "rgba(255,255,255,0.1)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "24px", fontWeight: "bold",
                          },
                          children: tokenStats.symbol.substring(0, 2).toUpperCase(),
                        },
                      },
                      // Token name
                      {
                        type: "div",
                        props: {
                          style: { display: "flex", flexDirection: "column" },
                          children: [
                            { type: "div", props: { style: { fontSize: "36px", fontWeight: "bold" }, children: `$${tokenStats.symbol}` } },
                            { type: "div", props: { style: { fontSize: "14px", color: "rgba(255,255,255,0.6)" }, children: tokenStats.name || "Token" } },
                          ],
                        },
                      },
                    ],
                  },
                },
                // Right side - Grade
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      width: "90px", height: "90px", borderRadius: "16px",
                      border: `3px solid ${gradeColor}`, background: "rgba(0,0,0,0.3)",
                    },
                    children: [
                      { type: "div", props: { style: { fontSize: "38px", fontWeight: "bold", color: gradeColor }, children: tokenStats.healthGrade } },
                      { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.6)" }, children: `${tokenStats.healthScore}/100` } },
                    ],
                  },
                },
              ],
            },
          },
          // Stats grid
          {
            type: "div",
            props: {
              style: { display: "flex", gap: "16px", marginBottom: "24px" },
              children: [
                // Total Wallets
                { type: "div", props: { style: { flex: 1, padding: "16px", borderRadius: "12px", background: "rgba(255,255,255,0.05)" }, children: [
                  { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }, children: "TOTAL WALLETS" } },
                  { type: "div", props: { style: { fontSize: "28px", fontWeight: "bold" }, children: String(tokenStats.totalHolders) } },
                ] } },
                // Real Holders
                { type: "div", props: { style: { flex: 1, padding: "16px", borderRadius: "12px", background: "rgba(255,255,255,0.05)" }, children: [
                  { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }, children: "REAL HOLDERS" } },
                  { type: "div", props: { style: { fontSize: "28px", fontWeight: "bold", color: "#22c55e" }, children: String(tokenStats.realHolders) } },
                ] } },
                // Market Cap
                { type: "div", props: { style: { flex: 1, padding: "16px", borderRadius: "12px", background: "rgba(255,255,255,0.05)" }, children: [
                  { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }, children: "MARKET CAP" } },
                  { type: "div", props: { style: { fontSize: "28px", fontWeight: "bold", color: "#3b82f6" }, children: marketCap } },
                ] } },
                // Top 25
                { type: "div", props: { style: { flex: 1, padding: "16px", borderRadius: "12px", background: "rgba(255,255,255,0.05)" }, children: [
                  { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }, children: "TOP 25 HOLD" } },
                  { type: "div", props: { style: { fontSize: "28px", fontWeight: "bold", color: "#f59e0b" }, children: `${top25Pct.toFixed(1)}%` } },
                ] } },
              ],
            },
          },
          // Breakdown row
          {
            type: "div",
            props: {
              style: { display: "flex", gap: "16px", marginBottom: "24px" },
              children: [
                { type: "div", props: { style: { flex: 1, padding: "16px", borderRadius: "12px", background: "rgba(251,113,133,0.15)", border: "1px solid rgba(251,113,133,0.3)" }, children: [
                  { type: "div", props: { style: { fontSize: "12px", color: "#fb7185", marginBottom: "4px" }, children: "🐋 WHALES" } },
                  { type: "div", props: { style: { fontSize: "24px", fontWeight: "bold" }, children: String(tokenStats.whaleCount) } },
                ] } },
                { type: "div", props: { style: { flex: 1, padding: "16px", borderRadius: "12px", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }, children: [
                  { type: "div", props: { style: { fontSize: "12px", color: "#f59e0b", marginBottom: "4px" }, children: "💪 SERIOUS" } },
                  { type: "div", props: { style: { fontSize: "24px", fontWeight: "bold" }, children: String(tokenStats.strongCount) } },
                ] } },
                { type: "div", props: { style: { flex: 1, padding: "16px", borderRadius: "12px", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }, children: [
                  { type: "div", props: { style: { fontSize: "12px", color: "#22c55e", marginBottom: "4px" }, children: "🌱 RETAIL" } },
                  { type: "div", props: { style: { fontSize: "24px", fontWeight: "bold" }, children: String(tokenStats.activeCount) } },
                ] } },
                { type: "div", props: { style: { flex: 1, padding: "16px", borderRadius: "12px", background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.3)" }, children: [
                  { type: "div", props: { style: { fontSize: "12px", color: "#60a5fa", marginBottom: "4px" }, children: "💨 DUST" } },
                  { type: "div", props: { style: { fontSize: "24px", fontWeight: "bold" }, children: String(tokenStats.dustCount) } },
                ] } },
              ],
            },
          },
          // Status badges
          {
            type: "div",
            props: {
              style: { display: "flex", gap: "12px", marginBottom: "auto" },
              children: [
                tokenStats.dexPaid ? { type: "div", props: { style: { padding: "8px 16px", borderRadius: "999px", background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.4)", fontSize: "13px", fontWeight: "bold", color: "#22c55e" }, children: "✓ DEX PAID" } } : null,
                tokenStats.dexBoosts && tokenStats.dexBoosts > 0 ? { type: "div", props: { style: { padding: "8px 16px", borderRadius: "999px", background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.4)", fontSize: "13px", fontWeight: "bold", color: "#a855f7" }, children: `🚀 ${tokenStats.dexBoosts} BOOSTS` } } : null,
                tokenStats.hasMarketing ? { type: "div", props: { style: { padding: "8px 16px", borderRadius: "999px", background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.4)", fontSize: "13px", fontWeight: "bold", color: "#3b82f6" }, children: "📢 MARKETING" } } : null,
              ].filter(Boolean),
            },
          },
          // Footer
          {
            type: "div",
            props: {
              style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.1)" },
              children: [
                { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.5)" }, children: shortCA } },
                { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.5)" }, children: timestamp } },
                { type: "div", props: { style: { fontSize: "14px", fontWeight: "bold", color: "#00d9ff" }, children: "blackbox.farm/holders" } },
              ],
            },
          },
        ],
      },
    };

    console.log('SVG generation starting...');
    const svg = await satori(cardTree, {
      width: 1200,
      height: 628,
      fonts: [{ name: 'Inter', data: fontData, weight: 400, style: 'normal' }],
    });
    console.log('SVG generated, converting to PNG...');

    await ensureResvgInitialized();
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    console.log('PNG generated, size:', pngBuffer.length);

    // Upload to Supabase Storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `share-cards/${tokenStats.symbol.toLowerCase()}-${Date.now()}.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('share-cards')
      .upload(fileName, pngBuffer, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage.from('share-cards').getPublicUrl(fileName);
    const imageUrl = publicUrlData.publicUrl;
    console.log('Image uploaded:', imageUrl);

    // Generate share page HTML
    const sharePageUrl = `${supabaseUrl}/functions/v1/share-card-page?img=${encodeURIComponent(imageUrl)}&symbol=${encodeURIComponent(tokenStats.symbol)}&token=${encodeURIComponent(tokenStats.tokenAddress || '')}`;

    return new Response(
      JSON.stringify({ success: true, imageUrl, sharePageUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating share card:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
