// Brand constants for the /brand asset library.
//
// These literal hex values are the *exported* form of the design tokens in
// src/index.css (which stays authoritative for the app UI). They exist here so
// downloadable SVG/PNG assets carry real colour values instead of CSS vars.

export const BRAND_COLORS = {
  cyan: "#00FFFF",
  cyanDeep: "#0FB8C4",
  gold: "#F2B90C",
  void: "#0F1319",
  carbon: "#151A22",
  violet: "#3A2B52",
  mist: "#CCFFFF",
} as const;

export type BrandColorName = keyof typeof BRAND_COLORS;

export const BRAND_PALETTE: Array<{
  name: string;
  hex: string;
  token: string;
  role: string;
}> = [
  { name: "Signal Cyan", hex: BRAND_COLORS.cyan, token: "--primary", role: "Primary. The mark, links, live data, CTAs." },
  { name: "Deep Signal", hex: BRAND_COLORS.cyanDeep, token: "--ring / gradient partner", role: "Darker cyan for gradients and hover states." },
  { name: "Farm Gold", hex: BRAND_COLORS.gold, token: "--gold", role: "Accent. Pro tier, alpha alerts, premium badges." },
  { name: "Void Black", hex: BRAND_COLORS.void, token: "--background", role: "Page background. The inside of the black box." },
  { name: "Carbon", hex: BRAND_COLORS.carbon, token: "--card", role: "Cards, panels, terminal surfaces." },
  { name: "Mesh Violet", hex: BRAND_COLORS.violet, token: "--nav-inactive-bg", role: "Nav rest state, mesh edges, secondary nodes." },
  { name: "Data Mist", hex: BRAND_COLORS.mist, token: "--foreground", role: "Body text and light lockups." },
];

export const BRAND_TYPOGRAPHY = [
  {
    name: "System Grotesk (ui-sans-serif)",
    role: "Display / headings & wordmark",
    stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    sample: "BlackBox Farm",
    notes: "Headings at 700 with -0.02em tracking. 'Box' in cyan, everything else in Data Mist.",
  },
  {
    name: "Monospace (ui-monospace)",
    role: "Data / addresses / terminal",
    stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    sample: "FnSGhL3tH19EhYLF3XaPYtDREqtNpC3aSCoQ931jpump",
    notes: "Every wallet, mint and metric renders in mono at 400–500. Never truncate an address in a report.",
  },
  {
    name: "Comic Neue",
    role: "Farm voice / playful callouts",
    stack: "'Comic Neue', cursive",
    sample: "Putting the needle in the haystack",
    notes: "Loaded site-wide. Use sparingly — banner slogans and farm-flavoured captions only.",
  },
];

export const BRAND_TAGLINES = [
  "Putting the needle in the haystack — follow the wallets.",
  "Solana forensics for people who read the chain.",
  "",
];