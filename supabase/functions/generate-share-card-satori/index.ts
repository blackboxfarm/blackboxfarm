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

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pct(n: number | undefined) {
  const v = typeof n === "number" ? n : 0;
  return `${v.toFixed(2)}%`;
}

function toInt(n: number | undefined) {
  return typeof n === "number" ? Math.max(0, Math.floor(n)) : 0;
}

function buildBreakdown(tokenStats: TokenStats) {
  // Prefer detailed counts if present, otherwise fall back
  const dust = toInt(tokenStats.dustCount);
  const small = toInt(tokenStats.smallCount);
  const medium = toInt(tokenStats.mediumCount);
  const large = toInt(tokenStats.largeCount);
  const boss = toInt(tokenStats.bossCount) + toInt(tokenStats.kingpinCount) + toInt(tokenStats.superBossCount);
  const whales = toInt(tokenStats.babyWhaleCount) + toInt(tokenStats.trueWhaleCount) + toInt(tokenStats.whaleCount);
  
  // If detailed counts are all zero, fall back to legacy buckets
  const detailedSum = dust + small + medium + large + boss + whales;
  if (detailedSum === 0) {
    return [
      { key: "Whales", count: toInt(tokenStats.whaleCount), color: "#fb7185" },
      { key: "Strong", count: toInt(tokenStats.strongCount), color: "#f59e0b" },
      { key: "Active", count: toInt(tokenStats.activeCount), color: "#22c55e" },
      { key: "Dust", count: toInt(tokenStats.dustCount), color: "#60a5fa" },
    ].filter(x => x.count > 0);
  }
  return [
    { key: "Dust",   count: dust,   color: "#60a5fa" },
    { key: "Small",  count: small,  color: "#34d399" },
    { key: "Medium", count: medium, color: "#fbbf24" },
    { key: "Large",  count: large,  color: "#fb923c" },
    { key: "Boss",   count: boss,   color: "#a78bfa" },
    { key: "Whales", count: whales, color: "#fb7185" },
  ].filter(x => x.count > 0);
}

function computeSignals(tokenStats: TokenStats) {
  const dust = tokenStats.dustPercentage ?? 0;
  const top10 = tokenStats.top10Percentage ?? 0;
  const lp = tokenStats.lpPercentage ?? 0;
  const grade = tokenStats.healthGrade || "D";
  const signals: { label: string; tone: "good" | "warn" | "bad" }[] = [];
  
  // Dust
  if (dust >= 70) signals.push({ label: "High dust layer", tone: "bad" });
  else if (dust >= 45) signals.push({ label: "Dust-heavy", tone: "warn" });
  else signals.push({ label: "Dust under control", tone: "good" });
  
  // Concentration
  if (top10 >= 45) signals.push({ label: "Concentration risk (Top 10)", tone: "bad" });
  else if (top10 >= 30) signals.push({ label: "Moderate concentration", tone: "warn" });
  else signals.push({ label: "Low top-10 concentration", tone: "good" });
  
  // LP (if available)
  if (lp >= 25) signals.push({ label: "LP share is meaningful", tone: "good" });
  else if (lp > 0) signals.push({ label: "LP share is thin", tone: "warn" });
  
  // Grade
  if (grade.startsWith("A")) signals.push({ label: "Distribution looks healthy", tone: "good" });
  else if (grade.startsWith("B")) signals.push({ label: "Acceptable structure", tone: "good" });
  else if (grade.startsWith("C")) signals.push({ label: "Watch structure / churn", tone: "warn" });
  else signals.push({ label: "High risk distribution", tone: "bad" });
  
  return signals.slice(0, 4);
}

function toneColor(tone: "good" | "warn" | "bad") {
  if (tone === "good") return "#22c55e";
  if (tone === "warn") return "#f59e0b";
  return "#ef4444";
}

async function loadFont(): Promise<ArrayBuffer> {
  // Inter TTF - direct CDN link (Satori requires TTF/OTF format)
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

    const gradeColor = getGradeColor(tokenStats.healthGrade);
    const fullCA = tokenStats.tokenAddress || "";
    const shortCA = truncateCA(fullCA);
    const timestamp = tokenStats.generatedAt
      ? new Date(tokenStats.generatedAt).toUTCString().replace("GMT", "UTC")
      : new Date().toUTCString().replace("GMT", "UTC");
    const breakdown = buildBreakdown(tokenStats);
    const totalForBreakdown = breakdown.reduce((a, b) => a + b.count, 0) || 1;
    const signals = computeSignals(tokenStats);

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
          padding: "28px 30px",
          fontFamily: "Inter",
          color: "white",
          position: "relative",
          background: "linear-gradient(135deg, #070A12 0%, #0B1224 50%, #0a0f1a 100%)",
        },
        children: [
          // faint grid overlay (HUD feel) - using simple border instead of repeating-gradient (Satori limitation)
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                inset: 0,
                opacity: 0.08,
                borderLeft: "1px solid rgba(255,255,255,0.3)",
                borderTop: "1px solid rgba(255,255,255,0.3)",
              },
            },
          },
          // Header
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                position: "relative",
                zIndex: 2,
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", gap: "14px" },
                    children: [
                      tokenStats.tokenImage
                        ? {
                            type: "img",
                            props: {
                              src: tokenStats.tokenImage,
                              style: {
                                width: "60px",
                                height: "60px",
                                borderRadius: "16px",
                                border: "1px solid rgba(255,255,255,0.16)",
                              },
                            },
                          }
                        : {
                            type: "div",
                            props: {
                              style: {
                                width: "60px",
                                height: "60px",
                                borderRadius: "16px",
                                background:
                                  "linear-gradient(135deg, rgba(0,217,255,0.25), rgba(167,139,250,0.25))",
                                border: "1px solid rgba(255,255,255,0.16)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "18px",
                                color: "rgba(255,255,255,0.85)",
                              },
                              children: "BB",
                            },
                          },
                      {
                        type: "div",
                        props: {
                          style: { display: "flex", flexDirection: "column" },
                          children: [
                            {
                              type: "div",
                              props: {
                                style: {
                                  display: "flex",
                                  alignItems: "baseline",
                                  gap: "10px",
                                },
                                children: [
                                  {
                                    type: "div",
                                    props: {
                                      style: {
                                        fontSize: "40px",
                                        fontWeight: 900,
                                        letterSpacing: "0.2px",
                                      },
                                      children: `$${tokenStats.symbol}`,
                                    },
                                  },
                                  {
                                    type: "div",
                                    props: {
                                      style: {
                                        fontSize: "14px",
                                        color: "rgba(255,255,255,0.55)",
                                      },
                                      children: tokenStats.name || "Token",
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              type: "div",
                              props: {
                                style: {
                                  fontSize: "12px",
                                  color: "rgba(255,255,255,0.50)",
                                  display: "flex",
                                  gap: "12px",
                                },
                                children: [
                                  `CA: ${shortCA}`,
                                  "•",
                                  "HOLDERS INTEL",
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                // Grade display (div-based, no SVG text)
                {
                  type: "div",
                  props: {
                    style: {
                      width: "122px",
                      height: "122px",
                      borderRadius: "20px",
                      background: "rgba(255,255,255,0.04)",
                      border: `3px solid ${gradeColor}`,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                    },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: {
                            fontSize: "42px",
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
                            fontSize: "14px",
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
          // Body grid
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
                // LEFT: big metrics + mini tiles
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                      gap: "14px",
                      padding: "16px",
                      borderRadius: "18px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
                    },
                    children: [
                      // Total -> Real hero
                      {
                        type: "div",
                        props: {
                          style: { display: "flex", alignItems: "flex-end", justifyContent: "space-between" },
                          children: [
                            {
                              type: "div",
                              props: {
                                style: { display: "flex", flexDirection: "column" },
                                children: [
                                  { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.55)" }, children: "TOTAL WALLETS" } },
                                  { type: "div", props: { style: { fontSize: "56px", fontWeight: 900, lineHeight: 1 }, children: tokenStats.totalHolders.toLocaleString() } },
                                ],
                              },
                            },
                            {
                              type: "div",
                              props: {
                                style: {
                                  width: "54px",
                                  height: "54px",
                                  borderRadius: "16px",
                                  background: "rgba(0,217,255,0.10)",
                                  border: "1px solid rgba(0,217,255,0.22)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "24px",
                                  color: "rgba(0,217,255,0.9)",
                                },
                                children: "→",
                              },
                            },
                            {
                              type: "div",
                              props: {
                                style: { display: "flex", flexDirection: "column", alignItems: "flex-end" },
                                children: [
                                  { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.55)" }, children: "REAL HOLDERS" } },
                                  { type: "div", props: { style: { fontSize: "56px", fontWeight: 900, lineHeight: 1, color: "#22c55e" }, children: tokenStats.realHolders.toLocaleString() } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      // Mini tiles row
                      {
                        type: "div",
                        props: {
                          style: { display: "flex", gap: "12px" },
                          children: [
                            // Dust
                            {
                              type: "div",
                              props: {
                                style: {
                                  flex: 1,
                                  padding: "12px",
                                  borderRadius: "14px",
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  background: "rgba(255,255,255,0.03)",
                                },
                                children: [
                                  { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.55)" }, children: "DUST %" } },
                                  { type: "div", props: { style: { fontSize: "28px", fontWeight: 900, color: "#ef4444" }, children: pct(tokenStats.dustPercentage) } },
                                ],
                              },
                            },
                            // Top10
                            {
                              type: "div",
                              props: {
                                style: {
                                  flex: 1,
                                  padding: "12px",
                                  borderRadius: "14px",
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  background: "rgba(255,255,255,0.03)",
                                },
                                children: [
                                  { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.55)" }, children: "TOP 10 HOLD" } },
                                  { type: "div", props: { style: { fontSize: "28px", fontWeight: 900, color: "#f59e0b" }, children: pct(tokenStats.top10Percentage) } },
                                ],
                              },
                            },
                            // LP Pools
                            {
                              type: "div",
                              props: {
                                style: {
                                  width: "150px",
                                  padding: "12px",
                                  borderRadius: "14px",
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  background: "rgba(255,255,255,0.03)",
                                },
                                children: [
                                  { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.55)" }, children: "LP POOLS" } },
                                  { type: "div", props: { style: { fontSize: "28px", fontWeight: 900, color: "#60a5fa" }, children: `${tokenStats.lpCount || 0}` } },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      // Signals
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            marginTop: "6px",
                          },
                          children: [
                            { type: "div", props: { style: { fontSize: "12px", color: "rgba(255,255,255,0.55)", letterSpacing: "0.8px" }, children: "SIGNALS" } },
                            {
                              type: "div",
                              props: {
                                style: { display: "flex", flexWrap: "wrap", gap: "8px" },
                                children: signals.map(s => ({
                                  type: "div",
                                  props: {
                                    style: {
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      padding: "8px 10px",
                                      borderRadius: "999px",
                                      background: "rgba(255,255,255,0.03)",
                                      border: "1px solid rgba(255,255,255,0.10)",
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
                                          style: { fontSize: "12px", color: "rgba(255,255,255,0.78)", fontWeight: 600 },
                                          children: s.label,
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
                // RIGHT: Distribution layering + counts
                {
                  type: "div",
                  props: {
                    style: {
                      width: "410px",
                      padding: "16px",
                      borderRadius: "18px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
                          children: [
                            { type: "div", props: { style: { fontSize: "13px", color: "rgba(255,255,255,0.70)", fontWeight: 800, letterSpacing: "0.8px" }, children: "DISTRIBUTION LAYERING" } },
                            { type: "div", props: { style: { fontSize: "11px", color: "rgba(255,255,255,0.45)" }, children: `${tokenStats.realHolders.toLocaleString()} real / ${tokenStats.totalHolders.toLocaleString()} total` } },
                          ],
                        },
                      },
                      // Stacked bar
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            height: "16px",
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
                      // Breakdown list
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            marginTop: "4px",
                          },
                          children: breakdown.slice(0, 8).map(seg => ({
                            type: "div",
                            props: {
                              style: {
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "10px 10px",
                                borderRadius: "12px",
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(255,255,255,0.08)",
                              },
                              children: [
                                {
                                  type: "div",
                                  props: {
                                    style: { display: "flex", alignItems: "center", gap: "10px" },
                                    children: [
                                      { type: "div", props: { style: { width: "10px", height: "10px", borderRadius: "3px", background: seg.color } } },
                                      { type: "div", props: { style: { fontSize: "12px", fontWeight: 800, color: "rgba(255,255,255,0.82)" }, children: seg.key } },
                                    ],
                                  },
                                },
                                {
                                  type: "div",
                                  props: {
                                    style: { fontSize: "12px", fontWeight: 900, color: "rgba(255,255,255,0.85)" },
                                    children: seg.count.toLocaleString(),
                                  },
                                },
                              ],
                            },
                          })),
                        },
                      },
                      // CTA block
                      {
                        type: "div",
                        props: {
                          style: {
                            marginTop: "auto",
                            padding: "12px",
                            borderRadius: "14px",
                            background: "rgba(0,217,255,0.07)",
                            border: "1px solid rgba(0,217,255,0.20)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          },
                          children: [
                            {
                              type: "div",
                              props: {
                                style: { fontSize: "13px", fontWeight: 900, color: "rgba(255,255,255,0.90)" },
                                children: "Scan any Solana token → get holders intel",
                              },
                            },
                            {
                              type: "div",
                              props: {
                                style: { fontSize: "12px", color: "rgba(255,255,255,0.65)" },
                                children: "Not mint stats. Not hype. Wallet distribution, dust, whales, concentration.",
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
          // Footer
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "14px",
                paddingTop: "12px",
                borderTop: "1px solid rgba(255,255,255,0.10)",
                position: "relative",
                zIndex: 2,
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", gap: "10px" },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: {
                            width: "26px",
                            height: "26px",
                            borderRadius: "8px",
                            background: "linear-gradient(135deg, rgba(0,217,255,0.35), rgba(167,139,250,0.35))",
                            border: "1px solid rgba(255,255,255,0.16)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                            fontWeight: 900,
                          },
                          children: "BB",
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: { fontSize: "14px", fontWeight: 900, color: "rgba(0,217,255,0.95)" },
                          children: "blackbox.farm/holders",
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: { fontSize: "12px", color: "rgba(255,255,255,0.45)" },
                          children: `• ${timestamp}`,
                        },
                      },
                    ],
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.55)",
                      fontWeight: 700,
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

    // Build share URL via blackbox.farm/share proxy for proper Twitter attribution
    // This routes through Cloudflare Worker -> share-card-page edge function
    const sharePageUrl = `https://blackbox.farm/share?img=${encodeURIComponent(imagePublicUrl.publicUrl)}&symbol=${encodeURIComponent(tokenStats.symbol)}&token=${encodeURIComponent(tokenStats.tokenAddress || '')}`;
    console.log('Share page URL (via proxy):', sharePageUrl);
    
    // Still upload static HTML page as fallback
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
