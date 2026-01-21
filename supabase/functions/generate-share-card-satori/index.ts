import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import satori from "https://esm.sh/satori@0.10.14";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Resvg WASM must be initialized once per runtime before using `new Resvg()`
let resvgInitPromise: Promise<void> | null = null;

function ensureResvgInitialized(): Promise<void> {
  if (resvgInitPromise) return resvgInitPromise;

  resvgInitPromise = (async () => {
    const wasmUrls = [
      "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.0/index_bg.wasm",
      "https://unpkg.com/@resvg/resvg-wasm@2.6.0/index_bg.wasm",
    ];

    let lastErr: unknown = null;
    for (const url of wasmUrls) {
      try {
        await initWasm(fetch(url));
        return;
      } catch (e) {
        // In warm containers, a second init can throw; treat as success.
        const msg = String(e?.message ?? e);
        if (msg.toLowerCase().includes("already") && msg.toLowerCase().includes("initialized")) return;
        lastErr = e;
      }
    }

    throw lastErr ?? new Error("Failed to initialize Resvg WASM");
  })();

  return resvgInitPromise;
}

interface TokenStats {
  symbol: string;
  name: string;
  tokenAddress?: string;
  totalHolders: number;
  realHolders: number;
  whaleCount: number;
  strongCount: number;
  activeCount: number;
  dustCount: number;
  dustPercentage: number;
  healthScore: number;
  healthGrade: string;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getGradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#10b981';
  if (grade.startsWith('B')) return '#3b82f6';
  if (grade.startsWith('C')) return '#f59e0b';
  return '#ef4444';
}

function truncateCA(addr: string): string {
  if (!addr || addr.length <= 12) return addr || '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Satori requires any node with multiple children to explicitly set display: 'flex' or 'none'.
// This normalizer applies a safe default (flex + column) anywhere it's missing.
function normalizeForSatori(node: any): any {
  if (!node || typeof node !== 'object') return node;
  if (!('props' in node)) return node;

  const props = node.props ?? {};
  const children = props.children;

  if (Array.isArray(children)) {
    const normalizedChildren = children.map(normalizeForSatori);
    const style = { ...(props.style ?? {}) };

    if (normalizedChildren.length > 1) {
      if (!style.display) style.display = 'flex';
      if (style.display === 'flex' && !style.flexDirection) style.flexDirection = 'column';
    }

    return { ...node, props: { ...props, style, children: normalizedChildren } };
  }

  if (children && typeof children === 'object') {
    return { ...node, props: { ...props, children: normalizeForSatori(children) } };
  }

  return node;
}

// Load font for Satori - use a reliable TTF font from a CDN
async function loadFont(): Promise<ArrayBuffer> {
  // Use Inter font from jsDelivr CDN (TTF format required by Satori)
  const fontUrl = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff';
  
  const response = await fetch(fontUrl);
  if (!response.ok) {
    console.error('Font fetch failed:', response.status, response.statusText);
    throw new Error(`Failed to fetch font: ${response.status}`);
  }
  
  const contentType = response.headers.get('content-type');
  console.log('Font content-type:', contentType);
  
  return response.arrayBuffer();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenStats } = await req.json() as { tokenStats: TokenStats };
    console.log('Generating Satori share card for:', tokenStats.symbol);

    const gradeColor = getGradeColor(tokenStats.healthGrade);
    const displayCA = truncateCA(tokenStats.tokenAddress || '');

    // Load font
    const fontData = await loadFont();

    // Create the card using Satori JSX-like syntax
    const cardTree = normalizeForSatori({
        type: 'div',
        props: {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '1200px',
            height: '628px',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #111827 50%, #0f172a 100%)',
            padding: '40px',
            fontFamily: 'Inter',
            color: 'white',
            position: 'relative',
          },
          children: [
            // Header row
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  width: '100%',
                },
                children: [
                  // Logo/branding
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              width: '48px',
                              height: '48px',
                              background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                              borderRadius: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '24px',
                            },
                            children: '📊',
                          },
                        },
                        {
                          type: 'span',
                          props: {
                            style: { fontSize: '24px', fontWeight: 700, color: '#a1a1aa' },
                            children: 'blackbox.farm/holders',
                          },
                        },
                      ],
                    },
                  },
                  // Token symbol and CA
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                      },
                      children: [
                        {
                          type: 'span',
                          props: {
                            style: { fontSize: '48px', fontWeight: 800, color: 'white' },
                            children: `$${tokenStats.symbol}`,
                          },
                        },
                        {
                          type: 'span',
                          props: {
                            style: { fontSize: '18px', color: '#71717a' },
                            children: `CA: ${displayCA}`,
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            // Main content
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flex: 1,
                  marginTop: '40px',
                  gap: '60px',
                },
                children: [
                  // Left: Stats
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: { display: 'flex', flexDirection: 'column', marginBottom: '24px' },
                            children: [
                              {
                                type: 'div',
                                props: {
                                  style: { fontSize: '18px', color: '#71717a', marginBottom: '4px' },
                                  children: 'Total Wallets',
                                },
                              },
                              {
                                type: 'div',
                                props: {
                                  style: { fontSize: '72px', fontWeight: 800, color: 'white', lineHeight: 1 },
                                  children: tokenStats.totalHolders.toLocaleString(),
                                },
                              },
                            ],
                          },
                        },
                        // Arrow down
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '32px', marginBottom: '16px', color: '#10b981' },
                            children: '↓',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: { display: 'flex', flexDirection: 'column', marginBottom: '24px' },
                            children: [
                              {
                                type: 'div',
                                props: {
                                  style: { fontSize: '18px', color: '#71717a', marginBottom: '4px' },
                                  children: 'Real Holders',
                                },
                              },
                              {
                                type: 'div',
                                props: {
                                  style: { fontSize: '56px', fontWeight: 800, color: '#10b981', lineHeight: 1 },
                                  children: tokenStats.realHolders.toLocaleString(),
                                },
                              },
                            ],
                          },
                        },
                        // Dust percentage
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '28px', fontWeight: 600, color: '#f59e0b' },
                            children: `${tokenStats.dustPercentage}% Dust`,
                          },
                        },
                      ],
                    },
                  },
                  // Right: Grade
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              width: '180px',
                              height: '180px',
                              borderRadius: '24px',
                              background: `linear-gradient(135deg, ${gradeColor}22, ${gradeColor}44)`,
                              border: `3px solid ${gradeColor}`,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                            },
                            children: [
                              {
                                type: 'div',
                                props: {
                                  style: { fontSize: '72px', fontWeight: 800, color: gradeColor },
                                  children: tokenStats.healthGrade,
                                },
                              },
                              {
                                type: 'div',
                                props: {
                                  style: { fontSize: '24px', color: gradeColor, marginTop: '-8px' },
                                  children: `${tokenStats.healthScore}/100`,
                                },
                              },
                            ],
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '18px', color: '#71717a', marginTop: '16px' },
                            children: 'Health Score',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            // Bottom row: Holder breakdown
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  gap: '48px',
                  marginTop: 'auto',
                  paddingTop: '24px',
                  borderTop: '1px solid #27272a',
                },
                children: [
                  {
                    type: 'span',
                    props: {
                      style: { fontSize: '22px', color: 'white' },
                      children: `🐋 ${tokenStats.whaleCount} Whales`,
                    },
                  },
                  {
                    type: 'span',
                    props: {
                      style: { fontSize: '22px', color: 'white' },
                      children: `💪 ${tokenStats.strongCount} Strong`,
                    },
                  },
                  {
                    type: 'span',
                    props: {
                      style: { fontSize: '22px', color: 'white' },
                      children: `🌱 ${tokenStats.activeCount} Active`,
                    },
                  },
                ],
              },
            },
          ],
        },
      });

    const svg = await satori(
      cardTree,
      {
        width: 1200,
        height: 628,
        fonts: [
          {
            name: 'Inter',
            data: fontData,
            weight: 400,
            style: 'normal',
          },
        ],
      }
    );

    console.log('SVG generated, converting to PNG...');

    await ensureResvgInitialized();

    // Convert SVG to PNG using Resvg
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    console.log('PNG generated, uploading to storage...');

    // Upload to Supabase storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const bucket = "twitter-assets";
    const now = Date.now();
    const imageFileName = `share-cards/${tokenStats.symbol.toLowerCase()}-satori-${now}.png`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(imageFileName, pngBuffer, {
        contentType: "image/png",
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: imagePublicUrl } = supabase.storage.from(bucket).getPublicUrl(imageFileName);
    console.log('Image uploaded:', imagePublicUrl.publicUrl);

    // Create HTML share page with OG meta tags
    const safeSymbol = escapeHtml((tokenStats.symbol || "TOKEN").toUpperCase());
    const title = `Holder Analysis: $${safeSymbol} — BlackBox Farm`;
    const description = `${tokenStats.realHolders.toLocaleString()} real holders from ${tokenStats.totalHolders.toLocaleString()} wallets. Health: ${tokenStats.healthGrade}`;
    const canonical = tokenStats.tokenAddress
      ? `https://blackbox.farm/holders?token=${encodeURIComponent(tokenStats.tokenAddress)}`
      : "https://blackbox.farm/holders";

    const sharePageHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:image" content="${escapeHtml(imagePublicUrl.publicUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="628" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(imagePublicUrl.publicUrl)}" />

  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: system-ui, sans-serif; background: #0b0b0f; color: #eaeaf2; }
    main { max-width: 920px; margin: 0 auto; padding: 28px 16px 40px; }
    .card { border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.03); border-radius: 16px; overflow: hidden; }
    .header { padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .title { font-size: 18px; font-weight: 800; }
    img { width: 100%; height: auto; display: block; }
    .footer { padding: 12px 16px; font-size: 13px; display: flex; justify-content: space-between; }
    a { color: #6ee7b7; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <div class="header">
        <div class="title">Holder Analysis: $${safeSymbol}</div>
      </div>
      <img src="${escapeHtml(imagePublicUrl.publicUrl)}" alt="Share card" loading="eager" />
      <div class="footer">
        <span>Generated by BlackBox Farm</span>
        <a href="${escapeHtml(canonical)}">Open full report →</a>
      </div>
    </div>
  </main>
</body>
</html>`;

    const sharePageFileName = `share-pages/${tokenStats.symbol.toLowerCase()}-satori-${now}.html`;
    const pageBlob = new Blob([sharePageHtml], { type: "text/html" });

    const { error: pageUploadError } = await supabase.storage
      .from(bucket)
      .upload(sharePageFileName, pageBlob, {
        contentType: "text/html",
        upsert: true,
        cacheControl: "3600",
      });

    let sharePageUrl: string | null = null;
    if (!pageUploadError) {
      const { data: sharePagePublicUrl } = supabase.storage.from(bucket).getPublicUrl(sharePageFileName);
      sharePageUrl = sharePagePublicUrl.publicUrl;
      console.log('Share page uploaded:', sharePageUrl);
    }

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: imagePublicUrl.publicUrl,
        sharePageUrl,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Error generating Satori share card:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
