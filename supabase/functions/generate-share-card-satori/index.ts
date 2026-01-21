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
  top25Percentage?: number;
  lpPercentage?: number;
  // Health
  healthScore: number;
  healthGrade: string;
  // Market data
  marketCapUsd?: number;
  priceUsd?: number;
  // DEX status
  dexPaid?: boolean;
  dexBoosts?: number;
  hasMarketing?: boolean;
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

function formatMarketCap(value?: number): string {
  if (!value || value <= 0) return "N/A";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

// Satori requires any node with multiple children to explicitly set display: 'flex' or 'none'.
function normalizeForSatori(node: any): any {
  if (!node || typeof node !== 'object') return node;
  if (!('props' in node)) return node;

  const props = node.props ?? {};
  const children = props.children;

  if (Array.isArray(children)) {
    const normalizedChildren = children.map(normalizeForSatori);
    const style = { ...(props.style ?? {}) };

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

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pct(n: number | undefined) {
  const v = typeof n === "number" ? n : 0;
  return `${v.toFixed(1)}%`;
}

function toInt(n: number | undefined) {
  return typeof n === "number" ? Math.max(0, Math.floor(n)) : 0;
}

// Build breakdown with user's preferred terminology: Dust, Retail, Serious, Whales
function buildBreakdown(tokenStats: TokenStats) {
  const dust = toInt(tokenStats.dustCount);
  const small = toInt(tokenStats.smallCount);
  const medium = toInt(tokenStats.mediumCount);
  const large = toInt(tokenStats.largeCount);
  const boss = toInt(tokenStats.bossCount) + toInt(tokenStats.kingpinCount) + toInt(tokenStats.superBossCount);
  const whales = toInt(tokenStats.babyWhaleCount) + toInt(tokenStats.trueWhaleCount);
  
  // Use user's preferred categories: Dust, Retail (small+medium), Serious (large+boss), Whales
  const retail = small + medium;
  const serious = large + boss;
  
  return [
    { key: "Whales",  count: whales,  color: "#fb7185", label: ">$1K" },
    { key: "Serious", count: serious, color: "#f59e0b", label: "$200-$1K" },
    { key: "Retail",  count: retail,  color: "#22c55e", label: "$1-$199" },
    { key: "Dust",    count: dust,    color: "#60a5fa", label: "<$1" },
  ].filter(x => x.count > 0);
}

function computeSignals(tokenStats: TokenStats) {
  const dust = tokenStats.dustPercentage ?? 0;
  const top10 = tokenStats.top10Percentage ?? 0;
  const grade = tokenStats.healthGrade || "D";
  const signals: { label: string; tone: "good" | "warn" | "bad" }[] = [];
  
  // Dust
  if (dust >= 70) signals.push({ label: "High dust layer", tone: "bad" });
  else if (dust >= 45) signals.push({ label: "Dust-heavy", tone: "warn" });
  else if (dust <= 20) signals.push({ label: "Low dust", tone: "good" });
  
  // Concentration
  if (top10 >= 45) signals.push({ label: "High concentration", tone: "bad" });
  else if (top10 >= 30) signals.push({ label: "Moderate concentration", tone: "warn" });
  else if (top10 < 25) signals.push({ label: "Well distributed", tone: "good" });
  
  // Grade
  if (grade.startsWith("A")) signals.push({ label: "Healthy distribution", tone: "good" });
  else if (grade.startsWith("B")) signals.push({ label: "Good structure", tone: "good" });
  else if (grade.startsWith("C")) signals.push({ label: "Watch structure", tone: "warn" });
  else signals.push({ label: "High risk", tone: "bad" });
  
  return signals.slice(0, 3);
}

function toneColor(tone: "good" | "warn" | "bad") {
  if (tone === "good") return "#22c55e";
  if (tone === "warn") return "#f59e0b";
  return "#ef4444";
}

async function loadFont(): Promise<ArrayBuffer> {
  const fontUrl =
    "https://sf6-cdn-tos.douyinstatic.com/obj/eden-cn/slepweh7nupqpognuhbo/Inter-Regular.ttf";
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
    console.log('Token stats received:', JSON.stringify(tokenStats, null, 2));

    const gradeColor = getGradeColor(tokenStats.healthGrade);
    const fullCA = tokenStats.tokenAddress || "";
    const shortCA = truncateCA(fullCA);
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    const breakdown = buildBreakdown(tokenStats);
    const totalForBreakdown = breakdown.reduce((a, b) => a + b.count, 0) || 1;
    const signals = computeSignals(tokenStats);
    const marketCap = formatMarketCap(tokenStats.marketCapUsd);
    const top25Pct = tokenStats.top25Percentage ?? tokenStats.top10Percentage ?? 0;

    // Load font
    const fontData = await loadFont();

    const cardTree = normalizeForSatori({
      type: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          width: "1200px",
          height: "628px",
          padding: "24px 28px",
          fontFamily: "Inter",
          color: "white",
          position: "relative",
          background: "linear-gradient(135deg, #070A12 0%, #0B1224 50%, #0a0f1a 100%)",
        },
        children: [
          // faint grid overlay
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                inset: 0,
                opacity: 0.06,
                borderLeft: "1px solid rgba(255,255,255,0.3)",
                borderTop: "1px solid rgba(255,255,255,0.3)",
              },
            },
          },
          // Header row
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "16px",
                position: "relative",
                zIndex: 2,
              },
              children: [
                // Left: Token image + name
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", gap: "16px" },
                    children: [
                      // Token image (top-left as requested)
                      tokenStats.tokenImage
                        ? {
                            type: "img",
                            props: {
                              src: tokenStats.tokenImage,
                              style: {
                                width: "72px",
                                height: "72px",
                                borderRadius: "16px",
                                border: "2px solid rgba(255,255,255,0.20)",
                                objectFit: "cover",
                              },
                            },
                          }
                        : {
                            type: "div",
                            props: {
                              style: {
                                width: "72px",
                                height: "72px",
                                borderRadius: "16px",
                                background: "linear-gradient(135deg, rgba(0,217,255,0.25), rgba(167,139,250,0.25))",
                                border: "2px solid rgba(255,255,255,0.20)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "22px",
                                fontWeight: 900,
                                color: "rgba(255,255,255,0.85)",
                              },
                              children: tokenStats.symbol.substring(0, 2).toUpperCase(),
                            },
                          },
                      // Token name and ticker
                      {
                        type: "div",
                        props: {
                          style: { display: "flex", flexDirection: "column", gap: "4px" },
                          children: [
                            {
                              type: "div",
                              props: {
                                style: {
                                  fontSize: "38px",
                                  fontWeight: 900,
                                  letterSpacing: "0.2px",
                                  color: "#ffffff",
                                },
                                children: `$${tokenStats.symbol}`,
                              },
                            },
                            {
                              type: "div",
                              props: {
                                style: {
                                  fontSize: "14px",
                                  color: "rgba(255,255,255,0.60)",
                                  fontWeight: 600,
                                },
                                children: tokenStats.name || "Token",
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                // Right: Grade box + Market cap
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", gap: "16px" },
                    children: [
                      // Market Cap box
                      {
                        type: "div",
                        props: {
                          style: {
                            padding: "12px 20px",
                            borderRadius: "14px",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "2px",
                          },
                          children: [
                            {
                              type: "div",
                              props: {
                                style: { fontSize: "11px", color: "rgba(255,255,255,0.55)", fontWeight: 600 },
                                children: "MARKET CAP",
                              },
                            },
                            {
                              type: "div",
                              props: {
                                style: { fontSize: "22px", fontWeight: 900, color: "#22c55e" },
                                children: marketCap,
                              },
                            },
                          ],
                        },
                      },
                      // Grade box
                      {
                        type: "div",
                        props: {
                          style: {
                            width: "100px",
                            height: "100px",
                            borderRadius: "18px",
                            background: "rgba(255,255,255,0.04)",
                            border: `3px solid ${gradeColor}`,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "2px",
                          },
                          children: [
                            {
                              type: "div",
                              props: {
                                style: {
                                  fontSize: "40px",
                                  fontWeight: 900,
                                  color: gradeColor,
                                  lineHeight: 1,
                                },
                                children: tokenStats.healthGrade,
                              },
                            },
                            {
                              type: "div",
                              props: {
                                style: {
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  color: "rgba(255,255,255,0.60)",
                                },
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
          // DEX Status row (if applicable)
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                gap: "12px",
                marginBottom: "14px",
                position: "relative",
                zIndex: 2,
              },
              children: [
                // DEX Paid badge
                tokenStats.dexPaid ? {
                  type: "div",
                  props: {
                    style: {
                      padding: "6px 14px",
                      borderRadius: "999px",
                      background: "rgba(34,197,94,0.15)",
                      border: "1px solid rgba(34,197,94,0.40)",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#22c55e",
                    },
                    children: "✓ DEX PAID",
                  },
                } : {
                  type: "div",
                  props: {
                    style: {
                      padding: "6px 14px",
                      borderRadius: "999px",
                      background: "rgba(239,68,68,0.10)",
                      border: "1px solid rgba(239,68,68,0.30)",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "rgba(239,68,68,0.80)",
                    },
                    children: "DEX UNPAID",
                  },
                },
                // Boosts badge
                tokenStats.dexBoosts && tokenStats.dexBoosts > 0 ? {
                  type: "div",
                  props: {
                    style: {
                      padding: "6px 14px",
                      borderRadius: "999px",
                      background: "rgba(251,191,36,0.15)",
                      border: "1px solid rgba(251,191,36,0.40)",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#fbbf24",
                    },
                    children: `🚀 ${tokenStats.dexBoosts} BOOSTS`,
                  },
                } : null,
                // Marketing badge
                tokenStats.hasMarketing ? {
                  type: "div",
                  props: {
                    style: {
                      padding: "6px 14px",
                      borderRadius: "999px",
                      background: "rgba(167,139,250,0.15)",
                      border: "1px solid rgba(167,139,250,0.40)",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#a78bfa",
                    },
                    children: "📢 MARKETING",
                  },
                } : null,
              ].filter(Boolean),
            },
          },
          // Main content: Stats grid
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flex: 1,
                gap: "16px",
                position: "relative",
                zIndex: 2,
              },
              children: [
                // LEFT: Primary stats
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                      gap: "12px",
                      padding: "16px",
                      borderRadius: "18px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
                    },
                    children: [
                      // Total Wallets hero
                      {
                        type: "div",
                        props: {
                          style: { display: "flex", flexDirection: "column", gap: "4px" },
                          children: [
                            { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.55)", fontWeight: 600 }, children: "TOTAL WALLETS" } },
                            { type: "div", props: { style: { fontSize: "52px", fontWeight: 900, lineHeight: 1, color: "#ffffff" }, children: tokenStats.totalHolders.toLocaleString() } },
                          ],
                        },
                      },
                      // Holder breakdown row - using user's preferred terms
                      {
                        type: "div",
                        props: {
                          style: { display: "flex", gap: "10px", marginTop: "8px" },
                          children: breakdown.map(seg => ({
                            type: "div",
                            props: {
                              style: {
                                flex: 1,
                                padding: "12px",
                                borderRadius: "12px",
                                border: "1px solid rgba(255,255,255,0.10)",
                                background: "rgba(255,255,255,0.03)",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: "4px",
                              },
                              children: [
                                { type: "div", props: { style: { fontSize: "28px", fontWeight: 900, color: seg.color }, children: seg.count.toLocaleString() } },
                                { type: "div", props: { style: { fontSize: "12px", fontWeight: 700, color: "rgba(255,255,255,0.75)" }, children: seg.key } },
                                { type: "div", props: { style: { fontSize: "10px", color: "rgba(255,255,255,0.45)" }, children: seg.label } },
                              ],
                            },
                          })),
                        },
                      },
                      // Top 25 concentration
                      {
                        type: "div",
                        props: {
                          style: {
                            marginTop: "8px",
                            padding: "12px 16px",
                            borderRadius: "12px",
                            background: "rgba(251,191,36,0.08)",
                            border: "1px solid rgba(251,191,36,0.20)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          },
                          children: [
                            { type: "div", props: { style: { fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.80)" }, children: "Top 25 wallets hold" } },
                            { type: "div", props: { style: { fontSize: "24px", fontWeight: 900, color: "#f59e0b" }, children: pct(top25Pct) } },
                          ],
                        },
                      },
                    ],
                  },
                },
                // RIGHT: Distribution visual + signals
                {
                  type: "div",
                  props: {
                    style: {
                      width: "380px",
                      padding: "16px",
                      borderRadius: "18px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    },
                    children: [
                      // Distribution header
                      {
                        type: "div",
                        props: {
                          style: { fontSize: "12px", color: "rgba(255,255,255,0.60)", fontWeight: 700, letterSpacing: "0.8px" },
                          children: "DISTRIBUTION",
                        },
                      },
                      // Stacked bar
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            height: "20px",
                            borderRadius: "999px",
                            overflow: "hidden",
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(255,255,255,0.05)",
                          },
                          children: breakdown.map(seg => ({
                            type: "div",
                            props: {
                              style: {
                                width: `${(seg.count / totalForBreakdown) * 100}%`,
                                background: seg.color,
                                opacity: 0.9,
                              },
                            },
                          })),
                        },
                      },
                      // Legend
                      {
                        type: "div",
                        props: {
                          style: { display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "4px" },
                          children: breakdown.map(seg => ({
                            type: "div",
                            props: {
                              style: { display: "flex", alignItems: "center", gap: "6px" },
                              children: [
                                { type: "div", props: { style: { width: "10px", height: "10px", borderRadius: "3px", background: seg.color } } },
                                { type: "div", props: { style: { fontSize: "11px", color: "rgba(255,255,255,0.70)", fontWeight: 600 }, children: `${seg.key} ${pct((seg.count / totalForBreakdown) * 100)}` } },
                              ],
                            },
                          })),
                        },
                      },
                      // Signals
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                            marginTop: "auto",
                          },
                          children: [
                            { type: "div", props: { style: { fontSize: "11px", color: "rgba(255,255,255,0.50)", letterSpacing: "0.8px" }, children: "SIGNALS" } },
                            ...signals.map(s => ({
                              type: "div",
                              props: {
                                style: {
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  padding: "8px 12px",
                                  borderRadius: "999px",
                                  background: "rgba(255,255,255,0.03)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                },
                                children: [
                                  {
                                    type: "div",
                                    props: {
                                      style: {
                                        width: "8px",
                                        height: "8px",
                                        borderRadius: "999px",
                                        background: toneColor(s.tone),
                                      },
                                    },
                                  },
                                  {
                                    type: "div",
                                    props: {
                                      style: { fontSize: "12px", color: "rgba(255,255,255,0.80)", fontWeight: 600 },
                                      children: s.label,
                                    },
                                  },
                                ],
                              },
                            })),
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          // Footer
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "12px",
                paddingTop: "12px",
                borderTop: "1px solid rgba(255,255,255,0.10)",
                position: "relative",
                zIndex: 2,
              },
              children: [
                // Left: Branding + timestamp
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", gap: "10px" },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: {
                            width: "24px",
                            height: "24px",
                            borderRadius: "6px",
                            background: "linear-gradient(135deg, rgba(0,217,255,0.35), rgba(167,139,250,0.35))",
                            border: "1px solid rgba(255,255,255,0.16)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "10px",
                            fontWeight: 900,
                          },
                          children: "BB",
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: { fontSize: "13px", fontWeight: 800, color: "rgba(0,217,255,0.95)" },
                          children: "blackbox.farm/holders",
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: { fontSize: "11px", color: "rgba(255,255,255,0.45)" },
                          children: `• ${timestamp}`,
                        },
                      },
                    ],
                  },
                },
                // Right: Full CA
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: "11px",
                      color: "rgba(255,255,255,0.50)",
                      fontWeight: 600,
                    },
                    children: fullCA ? `CA: ${fullCA}` : "",
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

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    console.log('PNG generated, uploading to storage...');

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
    const description = `${tokenStats.totalHolders.toLocaleString()} wallets | ${breakdown.map(b => `${b.count} ${b.key}`).join(' • ')} | Health: ${tokenStats.healthGrade}`;
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

    const sharePageUrl = `https://blackbox.farm/share?img=${encodeURIComponent(imagePublicUrl.publicUrl)}&symbol=${encodeURIComponent(tokenStats.symbol)}&token=${encodeURIComponent(tokenStats.tokenAddress || '')}`;
    console.log('Share page URL (via proxy):', sharePageUrl);
    
    if (!pageUploadError) {
      console.log('Static share page also uploaded as fallback');
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
