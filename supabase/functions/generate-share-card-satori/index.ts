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
  tokenImage?: string;
  totalHolders: number;
  realHolders: number;
  // Detailed breakdown
  trueWhaleCount?: number;
  babyWhaleCount?: number;
  superBossCount?: number;
  kingpinCount?: number;
  bossCount?: number;
  largeCount?: number;
  mediumCount?: number;
  smallCount?: number;
  dustCount: number;
  lpCount?: number;
  // Aggregated (legacy)
  whaleCount: number;
  strongCount: number;
  activeCount: number;
  dustPercentage: number;
  // Concentration
  top10Percentage?: number;
  lpPercentage?: number;
  // Health
  healthScore: number;
  healthGrade: string;
  // Timestamp
  generatedAt?: string;
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
// This normalizer adds display:flex ONLY if missing; it never touches flexDirection.
function normalizeForSatori(node: any): any {
  if (!node || typeof node !== 'object') return node;
  if (!('props' in node)) return node;

  const props = node.props ?? {};
  const children = props.children;

  if (Array.isArray(children)) {
    const normalizedChildren = children.map(normalizeForSatori);
    const style = { ...(props.style ?? {}) };

    // Only add display: flex if missing AND there are multiple children
    if (normalizedChildren.length > 1 && !style.display) {
      style.display = 'flex';
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
    const fullCA = tokenStats.tokenAddress || '';
    
    // Format UTC timestamp
    const timestamp = tokenStats.generatedAt 
      ? new Date(tokenStats.generatedAt).toUTCString().replace('GMT', 'UTC')
      : new Date().toUTCString().replace('GMT', 'UTC');

    // Load font
    const fontData = await loadFont();

    // Build holder breakdown stats
    const holderBreakdown = [
      { emoji: '🐋', label: 'True Whales', count: tokenStats.trueWhaleCount || 0 },
      { emoji: '🐳', label: 'Baby Whales', count: tokenStats.babyWhaleCount || 0 },
      { emoji: '👑', label: 'Super Boss', count: tokenStats.superBossCount || 0 },
      { emoji: '🎯', label: 'Kingpin', count: tokenStats.kingpinCount || 0 },
      { emoji: '💼', label: 'Boss', count: tokenStats.bossCount || 0 },
      { emoji: '📈', label: 'Large', count: tokenStats.largeCount || 0 },
      { emoji: '📊', label: 'Medium', count: tokenStats.mediumCount || 0 },
      { emoji: '🌱', label: 'Small', count: tokenStats.smallCount || 0 },
      { emoji: '💨', label: 'Dust', count: tokenStats.dustCount || 0 },
    ].filter(item => item.count > 0);

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
            padding: '32px 40px',
            fontFamily: 'Inter',
            color: 'white',
            position: 'relative',
          },
          children: [
            // Header row with token image, symbol, and branding
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  marginBottom: '16px',
                },
                children: [
                  // Left: Token image + symbol
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                      },
                      children: [
                        // Token image (or placeholder)
                        tokenStats.tokenImage ? {
                          type: 'img',
                          props: {
                            src: tokenStats.tokenImage,
                            style: {
                              width: '64px',
                              height: '64px',
                              borderRadius: '50%',
                              border: '3px solid #3b82f6',
                            },
                          },
                        } : {
                          type: 'div',
                          props: {
                            style: {
                              width: '64px',
                              height: '64px',
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '28px',
                            },
                            children: '🪙',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: { display: 'flex', flexDirection: 'column' },
                            children: [
                              {
                                type: 'span',
                                props: {
                                  style: { fontSize: '42px', fontWeight: 800, color: 'white' },
                                  children: `$${tokenStats.symbol}`,
                                },
                              },
                              {
                                type: 'span',
                                props: {
                                  style: { fontSize: '14px', color: '#71717a' },
                                  children: tokenStats.name,
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                  // Right: Health grade box
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              width: '100px',
                              height: '100px',
                              borderRadius: '16px',
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
                                  style: { fontSize: '42px', fontWeight: 800, color: gradeColor, lineHeight: 1 },
                                  children: tokenStats.healthGrade,
                                },
                              },
                              {
                                type: 'div',
                                props: {
                                  style: { fontSize: '14px', color: gradeColor },
                                  children: `${tokenStats.healthScore}/100`,
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            // Full CA row
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '20px',
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                },
                children: [
                  {
                    type: 'span',
                    props: {
                      style: { fontSize: '13px', color: '#71717a' },
                      children: 'CA:',
                    },
                  },
                  {
                    type: 'span',
                    props: {
                      style: { fontSize: '13px', color: '#a1a1aa', fontFamily: 'monospace' },
                      children: fullCA,
                    },
                  },
                ],
              },
            },
            // Main content: Stats grid
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flex: 1,
                  gap: '32px',
                },
                children: [
                  // Left column: Key metrics
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        gap: '16px',
                      },
                      children: [
                        // Total vs Real holders
                        {
                          type: 'div',
                          props: {
                            style: { display: 'flex', gap: '24px' },
                            children: [
                              {
                                type: 'div',
                                props: {
                                  style: { display: 'flex', flexDirection: 'column' },
                                  children: [
                                    {
                                      type: 'div',
                                      props: {
                                        style: { fontSize: '14px', color: '#71717a' },
                                        children: 'Total Wallets',
                                      },
                                    },
                                    {
                                      type: 'div',
                                      props: {
                                        style: { fontSize: '48px', fontWeight: 800, color: 'white', lineHeight: 1 },
                                        children: tokenStats.totalHolders.toLocaleString(),
                                      },
                                    },
                                  ],
                                },
                              },
                              {
                                type: 'div',
                                props: {
                                  style: { fontSize: '32px', color: '#10b981', alignSelf: 'center' },
                                  children: '→',
                                },
                              },
                              {
                                type: 'div',
                                props: {
                                  style: { display: 'flex', flexDirection: 'column' },
                                  children: [
                                    {
                                      type: 'div',
                                      props: {
                                        style: { fontSize: '14px', color: '#71717a' },
                                        children: 'Real Holders',
                                      },
                                    },
                                    {
                                      type: 'div',
                                      props: {
                                        style: { fontSize: '48px', fontWeight: 800, color: '#10b981', lineHeight: 1 },
                                        children: tokenStats.realHolders.toLocaleString(),
                                      },
                                    },
                                  ],
                                },
                              },
                            ],
                          },
                        },
                        // Concentration stats row
                        {
                          type: 'div',
                          props: {
                            style: { display: 'flex', gap: '32px', marginTop: '8px' },
                            children: [
                              {
                                type: 'div',
                                props: {
                                  style: { display: 'flex', flexDirection: 'column' },
                                  children: [
                                    {
                                      type: 'div',
                                      props: {
                                        style: { fontSize: '12px', color: '#71717a' },
                                        children: 'Top 10 Hold',
                                      },
                                    },
                                    {
                                      type: 'div',
                                      props: {
                                        style: { fontSize: '28px', fontWeight: 700, color: '#f59e0b' },
                                        children: `${tokenStats.top10Percentage || 0}%`,
                                      },
                                    },
                                  ],
                                },
                              },
                              {
                                type: 'div',
                                props: {
                                  style: { display: 'flex', flexDirection: 'column' },
                                  children: [
                                    {
                                      type: 'div',
                                      props: {
                                        style: { fontSize: '12px', color: '#71717a' },
                                        children: 'Dust Wallets',
                                      },
                                    },
                                    {
                                      type: 'div',
                                      props: {
                                        style: { fontSize: '28px', fontWeight: 700, color: '#ef4444' },
                                        children: `${tokenStats.dustPercentage}%`,
                                      },
                                    },
                                  ],
                                },
                              },
                              {
                                type: 'div',
                                props: {
                                  style: { display: 'flex', flexDirection: 'column' },
                                  children: [
                                    {
                                      type: 'div',
                                      props: {
                                        style: { fontSize: '12px', color: '#71717a' },
                                        children: 'LP Pools',
                                      },
                                    },
                                    {
                                      type: 'div',
                                      props: {
                                        style: { fontSize: '28px', fontWeight: 700, color: '#3b82f6' },
                                        children: `${tokenStats.lpCount || 0}`,
                                      },
                                    },
                                  ],
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                  // Right column: Holder breakdown
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        width: '380px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '12px',
                        padding: '16px',
                        border: '1px solid rgba(255,255,255,0.1)',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '14px', color: '#a1a1aa', marginBottom: '12px', fontWeight: 600 },
                            children: 'Holder Breakdown',
                          },
                        },
                        // Breakdown grid
                        {
                          type: 'div',
                          props: {
                            style: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
                            children: holderBreakdown.slice(0, 9).map(item => ({
                              type: 'div',
                              props: {
                                style: {
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '6px 10px',
                                  background: 'rgba(255,255,255,0.05)',
                                  borderRadius: '6px',
                                  minWidth: '100px',
                                },
                                children: [
                                  {
                                    type: 'span',
                                    props: {
                                      style: { fontSize: '14px' },
                                      children: item.emoji,
                                    },
                                  },
                                  {
                                    type: 'span',
                                    props: {
                                      style: { fontSize: '12px', color: '#a1a1aa' },
                                      children: `${item.count}`,
                                    },
                                  },
                                  {
                                    type: 'span',
                                    props: {
                                      style: { fontSize: '11px', color: '#71717a' },
                                      children: item.label,
                                    },
                                  },
                                ],
                              },
                            })),
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            // Footer: Branding + Timestamp
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 'auto',
                  paddingTop: '16px',
                  borderTop: '1px solid #27272a',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', alignItems: 'center', gap: '8px' },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              width: '28px',
                              height: '28px',
                              background: 'linear-gradient(135deg, #00d9ff, #00b8d4)',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '14px',
                            },
                            children: '📊',
                          },
                        },
                        {
                          type: 'span',
                          props: {
                            style: { fontSize: '16px', fontWeight: 600, color: '#00d9ff' },
                            children: 'blackbox.farm/holders',
                          },
                        },
                      ],
                    },
                  },
                  {
                    type: 'span',
                    props: {
                      style: { fontSize: '12px', color: '#52525b' },
                      children: timestamp,
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
