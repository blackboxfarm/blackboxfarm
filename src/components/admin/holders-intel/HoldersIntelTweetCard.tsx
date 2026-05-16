import React from "react";
import { BadgeCheck, ExternalLink } from "lucide-react";

export interface ArchiveRow {
  id: string;
  token_mint: string;
  symbol: string | null;
  name: string | null;
  market_cap: number | null;
  created_at: string;
  trigger_source: string | null;
  tweet_text: string | null;
  tweet_composed_at: string | null;
  ai_snippet: string | null;
  health_grade: string | null;
  health_score: number | null;
  health_label: string | null;
  real_holders: number | null;
  total_wallets: number | null;
  whales_count: number | null;
  serious_count: number | null;
  retail_count: number | null;
  dust_count: number | null;
  dust_pct: number | null;
  snapshot_label: string | null;
  hashtags_line: string | null;
  banner_used_url: string | null;
  dex_banner_url: string | null;
  decorated_banner_url: string | null;
  manual_status: string | null;
  manual_posted_at: string | null;
  manual_tweet_url: string | null;
  posted_handle: string | null;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

function postedAtLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Renders an archived HoldersIntel manual X post in @HoldersIntel
 * X "Post" detail style. If structured columns are missing, falls back
 * to displaying the raw tweet_text inside the same card chrome.
 */
export function HoldersIntelTweetCard({ row }: { row: ArchiveRow }) {
  const handle = row.posted_handle || "HoldersIntel";
  const banner =
    row.decorated_banner_url || row.banner_used_url || row.dex_banner_url || null;
  const symbol = row.symbol || "?";
  const name = row.name || "";
  const grade = row.health_grade || "?";
  const score = row.health_score ?? null;
  const label = row.health_label || "";
  const snapshot = row.snapshot_label || "";
  const hashtags = row.hashtags_line || "#Solana #CryptoTools #HoldersIntel";
  const hasStructured =
    row.health_grade != null ||
    row.total_wallets != null ||
    row.real_holders != null;

  return (
    <article className="rounded-2xl border border-border/60 bg-black text-zinc-100 p-5 max-w-2xl mx-auto shadow-lg">
      {/* Header: avatar + handle */}
      <header className="flex items-start gap-3 mb-3">
        <div className="h-11 w-11 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0 ring-1 ring-sky-400/40">
          HI
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 font-semibold text-zinc-50">
            Holders Intel
            <BadgeCheck className="h-4 w-4 text-sky-400 fill-sky-400" strokeWidth={2.5} />
          </div>
          <div className="text-sm text-zinc-500">@{handle}</div>
          <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
            <span className="opacity-70">🤖</span> Automated by{" "}
            <span className="text-sky-400">@blackbox_farm</span>
          </div>
        </div>
      </header>

      {/* Body */}
      {hasStructured ? (
        <div className="space-y-1 text-[15px] leading-[1.45] whitespace-pre-wrap break-words font-sans">
          <div>
            🔬 HOLDER INTEL:{" "}
            <span className="text-sky-400">${symbol}</span>{" "}
            {name && name !== symbol ? name : ""}
          </div>
          <div className="font-mono text-[13px] break-all text-zinc-300">
            {row.token_mint}
          </div>
          <div>
            Health: {grade}
            {score != null ? ` (${score}/100)` : ""}{" "}
            {label && (
              <span className="inline-flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded bg-sky-600/20 text-sky-300 text-xs font-bold">
                  NEW
                </span>{" "}
                {label}
              </span>
            )}
          </div>
          <div>✅ {fmt(row.real_holders)} Real Holders</div>
          <div>📊 {fmt(row.total_wallets)} Total Wallets</div>
          {snapshot && <div>📸 Snapshot at {snapshot} ⏱</div>}
          <div>🐋 {fmt(row.whales_count)} Whales (&gt;$1K)</div>
          <div>😎 {fmt(row.serious_count)} Serious ($200-$1K)</div>
          <div>🔢 {fmt(row.retail_count)} Retail ($1-$199)</div>
          <div>
            💨 {fmt(row.dust_count)} Dust (&lt;$1) ={" "}
            {row.dust_pct ?? "—"}% Dust
          </div>
          {row.ai_snippet && (
            <div className="mt-2 text-zinc-200 italic">{row.ai_snippet}</div>
          )}
          <div className="pt-1">🧬</div>
          <div>
            📣{" "}
            <a
              className="text-sky-400 hover:underline"
              href="https://t.me/HoldersIntel"
              target="_blank"
              rel="noopener noreferrer"
            >
              t.me/HoldersIntel
            </a>
          </div>
          <div>
            FULL Holder Intel👇{" "}
            <a
              className="text-sky-400 hover:underline break-all"
              href={`https://blackbox.farm/holders?token=${row.token_mint}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              blackbox.farm/holders?token={row.token_mint.slice(0, 8)}…
            </a>
          </div>
          <div className="pt-2 text-sky-400">{hashtags}</div>
          <div className="text-sky-400">@blackbox_farm</div>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-[1.45] text-zinc-100">
          {row.tweet_text || (
            <span className="text-zinc-500 italic">Tweet text not stored.</span>
          )}
        </pre>
      )}

      {/* Banner */}
      {banner && (
        <div className="mt-3 rounded-xl overflow-hidden border border-zinc-800">
          <img
            src={banner}
            alt={`${symbol} banner`}
            loading="lazy"
            className="w-full aspect-[2/1] object-cover bg-zinc-900"
          />
        </div>
      )}

      {/* Footer */}
      <footer className="mt-3 pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <div>
          {postedAtLabel(row.manual_posted_at || row.tweet_composed_at || row.created_at)}
          {" · "}
          {row.manual_status === "posted_manual" ? "Manual post" : (row.manual_status || "draft")}
          {row.trigger_source && <> · {row.trigger_source}</>}
        </div>
        <div className="flex items-center gap-3">
          {row.manual_tweet_url && (
            <a
              href={row.manual_tweet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-sky-400"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View on X
            </a>
          )}
          <a
            href={`/bubblemap?token=${row.token_mint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-sky-400"
          >
            🫧 Bubblemap
          </a>
        </div>
      </footer>
    </article>
  );
}