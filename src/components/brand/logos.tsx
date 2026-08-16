import type { ComponentType } from "react";

import { BRAND_COLORS as C } from "@/lib/brand";

export type LogoProps = {
  /** Rendered size in px (square canvas). */
  size?: number;
  /** true = light artwork for dark backgrounds. */
  inverse?: boolean;
  className?: string;
};

const ink = (inverse?: boolean) => (inverse ? C.mist : C.void);

/* 1. The Box — an isometric black cube with a cyan seam of light escaping. */
export function MarkCube({ size = 64, inverse, className }: LogoProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="BlackBox cube mark">
      <path d="M32 6 L56 18 L32 30 L8 18 Z" fill={C.carbon} stroke={C.cyan} strokeWidth="2" />
      <path d="M8 18 L32 30 L32 58 L8 46 Z" fill={inverse ? "#0B0E13" : C.void} stroke={C.cyan} strokeWidth="2" opacity="0.9" />
      <path d="M56 18 L56 46 L32 58 L32 30 Z" fill={C.violet} stroke={C.cyan} strokeWidth="2" opacity="0.9" />
      <path d="M32 30 L32 58" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/* 2. Needle in the Haystack — a cyan needle through a gold stack of lines. */
export function MarkNeedle({ size = 64, inverse, className }: LogoProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="Needle in the haystack mark">
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          d={`M${10 + i * 2} ${52 - i * 6} L${54 - i * 2} ${44 - i * 6}`}
          stroke={C.gold}
          strokeWidth="3"
          strokeLinecap="round"
          opacity={0.25 + i * 0.15}
        />
      ))}
      <path d="M14 54 L50 10" stroke={C.cyan} strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="10" r="5" fill="none" stroke={C.cyan} strokeWidth="3" />
      <circle cx="14" cy="54" r="2.6" fill={ink(inverse) === C.void ? C.cyan : C.mist} />
    </svg>
  );
}

/* 3. Wallet Mesh — the bubble map: one hub, satellites, cyan edges. */
export function MarkMesh({ size = 64, inverse, className }: LogoProps) {
  const nodes = [
    [32, 10],
    [54, 24],
    [50, 50],
    [20, 54],
    [10, 26],
  ] as const;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="Wallet mesh mark">
      {nodes.map(([x, y], i) => (
        <path key={`e${i}`} d={`M32 32 L${x} ${y}`} stroke={C.cyan} strokeWidth="2" opacity="0.55" />
      ))}
      <path d="M54 24 L50 50" stroke={C.violet} strokeWidth="2" opacity="0.9" />
      {nodes.map(([x, y], i) => (
        <circle key={`n${i}`} cx={x} cy={y} r={i === 0 ? 6 : 4.5} fill={i === 0 ? C.gold : C.cyan} opacity={i === 0 ? 1 : 0.85} />
      ))}
      <circle cx="32" cy="32" r="9" fill={inverse ? C.void : C.carbon} stroke={C.cyan} strokeWidth="2.5" />
    </svg>
  );
}

/* 4. Scan Line — a black box being x-rayed by a cyan sweep. */
export function MarkScan({ size = 64, inverse, className }: LogoProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="Scan line mark">
      <rect x="8" y="12" width="48" height="40" rx="6" fill={inverse ? "#0B0E13" : C.carbon} stroke={C.violet} strokeWidth="2" />
      <path d="M8 32 L56 32" stroke={C.cyan} strokeWidth="4" strokeLinecap="round" />
      <path d="M16 24 L26 24 M32 24 L48 24" stroke={C.mist} strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      <path d="M16 41 L34 41 M40 41 L48 41" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
      <circle cx="52" cy="32" r="3.2" fill={C.gold} />
    </svg>
  );
}

/* 5. Farm Fence — three cyan posts over a gold horizon: the farm, literally. */
export function MarkFence({ size = 64, inverse, className }: LogoProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="Farm fence mark">
      <circle cx="32" cy="26" r="13" fill={C.gold} opacity="0.85" />
      <path d="M4 46 L60 46" stroke={ink(inverse) === C.void ? C.void : C.mist} strokeWidth="0" />
      {[14, 32, 50].map((x) => (
        <path key={x} d={`M${x} 56 L${x} 30`} stroke={C.cyan} strokeWidth="4" strokeLinecap="round" />
      ))}
      <path d="M8 38 L56 38 M8 47 L56 47" stroke={C.cyan} strokeWidth="3.5" strokeLinecap="round" opacity="0.85" />
      <path d="M6 60 L58 60" stroke={C.violet} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/* 6. Terminal Prompt — a cyan caret in a bracketed frame. */
export function MarkTerminal({ size = 64, inverse, className }: LogoProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="Terminal prompt mark">
      <rect x="6" y="10" width="52" height="44" rx="8" fill={inverse ? "#0B0E13" : C.carbon} stroke={C.cyan} strokeWidth="2.5" />
      <path d="M18 24 L27 32 L18 40" stroke={C.cyan} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M33 41 L47 41" stroke={C.gold} strokeWidth="4" strokeLinecap="round" />
      <circle cx="44" cy="22" r="2.6" fill={C.gold} opacity="0.9" />
    </svg>
  );
}

export function Wordmark({ inverse, className }: { inverse?: boolean; className?: string }) {
  const base = inverse ? C.mist : C.void;
  return (
    <span
      className={className}
      style={{ fontWeight: 700, letterSpacing: "-0.02em", color: base, whiteSpace: "nowrap" }}
    >
      Black<span style={{ color: C.cyan }}>Box</span> Farm
    </span>
  );
}

export type LogoVariant = {
  id: string;
  name: string;
  story: string;
  bestFor: string;
  stacked?: boolean;
  Mark: ComponentType<LogoProps>;
};

export const LOGO_VARIANTS: LogoVariant[] = [
  {
    id: "01-cube",
    name: "01 — The Box",
    story: "An isometric black cube with a seam of gold light escaping the front edge. The black box you finally get to look inside.",
    bestFor: "Favicon, app icon, header lockup",
    Mark: MarkCube,
  },
  {
    id: "02-needle",
    name: "02 — Needle in the Haystack",
    story: "The tagline drawn literally: a cyan needle driven clean through a gold stack. Forensics, not vibes.",
    bestFor: "Marketing headers, Intel Briefings",
    Mark: MarkNeedle,
  },
  {
    id: "03-mesh",
    name: "03 — Wallet Mesh",
    story: "One gold hub, four cyan satellites, one violet sister-wallet edge. This is the bubble map compressed into a mark.",
    bestFor: "Bubble Map, Holder Analysis, product UI",
    stacked: true,
    Mark: MarkMesh,
  },
  {
    id: "04-scan",
    name: "04 — Scan Line",
    story: "A sealed panel mid-x-ray. The cyan sweep is the moment a hidden funding chain resolves.",
    bestFor: "Autopsies, security and audit surfaces",
    Mark: MarkScan,
  },
  {
    id: "05-fence",
    name: "05 — Farm Fence",
    story: "Three fence posts against a gold sun — the farm half of the name, kept deadpan rather than cute.",
    bestFor: "Site banner, Telegram channel avatar",
    stacked: true,
    Mark: MarkFence,
  },
  {
    id: "06-terminal",
    name: "06 — Terminal Prompt",
    story: "A caret waiting for a contract address. The most honest description of what the product actually is.",
    bestFor: "Dev/API docs, CLI, bot avatar",
    Mark: MarkTerminal,
  },
];