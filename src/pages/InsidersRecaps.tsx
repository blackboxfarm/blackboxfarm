import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type RecapType = "daily" | "weekly" | "monthly";

type Entry = {
  mint: string;
  ticker: string;
  multiplier: number;
  entry_mc: string | null;
  peak_mc: string | null;
  recap_type: RecapType;
  recap_date: string; // ISO
  message_id: number | null;
};

const BASE58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

function classify(raw: string): RecapType | null {
  if (/DAILY RECAP/i.test(raw)) return "daily";
  if (/WEEKLY RECAP/i.test(raw)) return "weekly";
  if (/MONTHLY RECAP/i.test(raw)) return "monthly";
  return null;
}

function parseRecap(raw: string, type: RecapType, ts: string, message_id: number | null): Entry[] {
  // Split into blocks; each entry is 3 lines: "Nx $TICKER", "$entry => $peak", "<CA>"
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const out: Entry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(\d+(?:\.\d+)?)x\s*\$?([A-Za-z0-9_]+)/);
    if (!m) continue;
    const multiplier = parseFloat(m[1]);
    const ticker = m[2];
    // Look ahead up to 4 lines for MC pair and CA
    let entry_mc: string | null = null;
    let peak_mc: string | null = null;
    let mint: string | null = null;
    for (let j = 1; j <= 4 && i + j < lines.length; j++) {
      const l = lines[i + j];
      if (!entry_mc) {
        const mc = l.match(/\$([\d.,]+\s*[kKmMbB]?)\s*=>\s*\$([\d.,]+\s*[kKmMbB]?)/);
        if (mc) {
          entry_mc = mc[1].trim();
          peak_mc = mc[2].trim();
          continue;
        }
      }
      if (!mint) {
        const ca = l.match(BASE58);
        if (ca) {
          mint = ca[0];
        }
      }
      if (mint && entry_mc) break;
    }
    if (!mint) continue;
    out.push({
      mint,
      ticker,
      multiplier,
      entry_mc,
      peak_mc,
      recap_type: type,
      recap_date: ts,
      message_id,
    });
  }
  return out;
}

type SortKey = "multiplier" | "ticker" | "recap_date" | "recap_type";

export default function InsidersRecaps() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recapCount, setRecapCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | RecapType>("all");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("multiplier");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [copied, setCopied] = useState<string | null>(null);
  const [devs, setDevs] = useState<Record<string, string | null>>({});
  const [devLoading, setDevLoading] = useState(false);
  const [devProgress, setDevProgress] = useState<string>("");
  const [onlyDupes, setOnlyDupes] = useState(false);
  const [devErrors, setDevErrors] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("telegram_channel_calls")
        .select("message_id, raw_message, message_timestamp, created_at")
        .ilike("channel_name", "insiders")
        .gte("message_timestamp", since)
        .ilike("raw_message", "%INSIDERS%RECAP%")
        .order("message_timestamp", { ascending: false })
        .limit(1000);
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      // Dedupe by message_id (recap posts get reposted with same message_id)
      const seen = new Set<number>();
      const recaps: { raw: string; ts: string; mid: number | null; type: RecapType }[] = [];
      for (const r of data || []) {
        const type = classify(r.raw_message || "");
        if (!type) continue;
        const mid = (r.message_id as number) ?? null;
        if (mid != null && seen.has(mid)) continue;
        if (mid != null) seen.add(mid);
        recaps.push({
          raw: r.raw_message,
          ts: r.message_timestamp || r.created_at,
          mid,
          type,
        });
      }
      // Parse all
      const all: Entry[] = [];
      for (const rc of recaps) all.push(...parseRecap(rc.raw, rc.type, rc.ts, rc.mid));
      // Dedupe by mint keeping the highest multiplier
      const bestByMint = new Map<string, Entry>();
      for (const e of all) {
        const prev = bestByMint.get(e.mint);
        if (!prev || e.multiplier > prev.multiplier) bestByMint.set(e.mint, e);
      }
      setEntries(Array.from(bestByMint.values()));
      setRecapCount(recaps.length);
      setLoading(false);
    })();
  }, []);

  // Load dev wallets once entries are known
  useEffect(() => {
    if (entries.length === 0) return;
    (async () => {
      setDevLoading(true);
      const mints = entries.map((e) => e.mint);
      const acc: Record<string, string | null> = {};
      // Fast path: query all 4 known-creator tables directly from client.
      const sources: Array<[string, string]> = [
        ["pumpfun_watchlist", "creator_wallet"],
        ["scraped_tokens", "creator_wallet"],
        ["token_lifecycle", "creator_wallet"],
        ["developer_tokens", "creator_wallet"],
      ];
      const chunk = <T,>(a: T[], n: number) => {
        const o: T[][] = [];
        for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
        return o;
      };
      for (const [tbl, col] of sources) {
        for (const batch of chunk(mints, 200)) {
          const missing = batch.filter((m) => !acc[m]);
          if (!missing.length) continue;
          const { data } = await (supabase as any)
            .from(tbl)
            .select(`token_mint, ${col}`)
            .in("token_mint", missing);
          for (const r of (data as any[]) || []) {
            if (r?.[col] && !acc[r.token_mint]) acc[r.token_mint] = r[col];
          }
        }
      }
      setDevs({ ...acc });
      setDevProgress(`${Object.values(acc).filter(Boolean).length}/${mints.length} known`);

      // Resolver pass — best-X first, use existing creator-wallet-resolver
      // (single-target mode), 6 in flight in parallel.
      const byBest = [...entries].sort((a, b) => b.multiplier - a.multiplier).map((e) => e.mint);
      const missing = byBest.filter((m) => !acc[m]);
      const concurrency = 6;
      let cursor = 0;
      const runOne = async () => {
        while (cursor < missing.length) {
          const mint = missing[cursor++];
          try {
            const { data, error } = await supabase.functions.invoke("creator-wallet-resolver", {
              body: { tokenMint: mint, batchSize: 1 },
            });
            if (error) {
              setDevErrors((prev) => [...prev, error.message].slice(-6));
              continue;
            }
            const r = data?.results?.[0];
            if (r?.ok && r.creator) {
              acc[mint] = r.creator;
              setDevs({ ...acc });
              setDevProgress(`${Object.values(acc).filter(Boolean).length}/${mints.length} resolved`);
            }
          } catch (e: any) {
            setDevErrors((prev) => [...prev, e?.message || String(e)].slice(-6));
          }
        }
      };
      await Promise.all(Array.from({ length: concurrency }, runOne));
      setDevLoading(false);
    })();
  }, [entries]);

  // Count how many tokens each dev wallet minted (within this list)
  const devCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of entries) {
      const d = devs[e.mint];
      if (!d) continue;
      c.set(d, (c.get(d) || 0) + 1);
    }
    return c;
  }, [entries, devs]);

  const dupeCount = useMemo(() => {
    let n = 0;
    for (const v of devCounts.values()) if (v > 1) n++;
    return n;
  }, [devCounts]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = entries.filter((e) => {
      if (filter !== "all" && e.recap_type !== filter) return false;
      if (onlyDupes) {
        const d = devs[e.mint];
        if (!d || (devCounts.get(d) || 0) < 2) return false;
      }
      if (!term) return true;
      const dev = devs[e.mint] || "";
      return (
        e.ticker.toLowerCase().includes(term) ||
        e.mint.toLowerCase().includes(term) ||
        dev.toLowerCase().includes(term)
      );
    });
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "multiplier") cmp = a.multiplier - b.multiplier;
      else if (sortKey === "ticker") cmp = a.ticker.localeCompare(b.ticker);
      else if (sortKey === "recap_date") cmp = a.recap_date.localeCompare(b.recap_date);
      else if (sortKey === "recap_type") cmp = a.recap_type.localeCompare(b.recap_type);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [entries, filter, q, sortKey, sortDir, devs, devCounts, onlyDupes]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir(k === "ticker" ? "asc" : "desc");
    }
  }

  function copy(mint: string) {
    navigator.clipboard.writeText(mint);
    setCopied(mint);
    setTimeout(() => setCopied(null), 1200);
  }

  const badgeCls = (t: RecapType) =>
    t === "monthly"
      ? "bg-primary/20 text-primary"
      : t === "weekly"
        ? "bg-secondary/40 text-foreground"
        : "bg-muted text-muted-foreground";

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <h1 className="text-2xl font-bold mb-1">Insiders Recaps — Last 60 Days</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Unique tokens from Daily / Weekly / Monthly PREMIUM INSIDERS recap pins. Best multiplier per token.
      </p>

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <div className="flex gap-1">
          {(["all", "daily", "weekly", "monthly"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1 text-xs rounded border ${
                filter === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:bg-muted/70"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ticker or CA…"
          className="px-3 py-1 text-sm rounded border border-border bg-background"
        />
        <div className="text-xs text-muted-foreground ml-auto">
          {loading ? "Loading…" : `${filtered.length} tokens · ${recapCount} recaps parsed`}
          {!loading && devProgress && (
            <span className="ml-2">· devs: {devProgress}{devLoading ? "…" : ""}</span>
          )}
          {!loading && dupeCount > 0 && (
            <button
              onClick={() => setOnlyDupes((v) => !v)}
              className={`ml-2 px-2 py-0.5 rounded border ${onlyDupes ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/60"}`}
              title="Show only devs that minted multiple tokens on this list"
            >
              {onlyDupes ? "Showing" : "Show"} repeat devs ({dupeCount})
            </button>
          )}
        </div>
      </div>

      {err && <div className="text-destructive mb-4">Error: {err}</div>}
      {devErrors.length > 0 && (
        <div className="mb-4 text-xs text-destructive/90 border border-destructive/40 rounded p-2 bg-destructive/5">
          <div className="font-semibold mb-1">Resolver issues (last {devErrors.length}):</div>
          <ul className="list-disc ml-4 space-y-0.5">
            {devErrors.map((e, i) => (<li key={i} className="break-all">{e}</li>))}
          </ul>
        </div>
      )}

      {!loading && !err && (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground sticky top-0">
              <tr>
                <th className="p-2 text-left cursor-pointer" onClick={() => toggleSort("ticker")}>
                  Ticker
                </th>
                <th className="p-2 text-left">Contract Address</th>
                <th className="p-2 text-left">Dev Wallet</th>
                <th className="p-2 text-left cursor-pointer" onClick={() => toggleSort("multiplier")}>
                  Best X {sortKey === "multiplier" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
                <th className="p-2 text-left">Entry MC</th>
                <th className="p-2 text-left">Peak MC</th>
                <th className="p-2 text-left cursor-pointer" onClick={() => toggleSort("recap_type")}>
                  Recap
                </th>
                <th className="p-2 text-left cursor-pointer" onClick={() => toggleSort("recap_date")}>
                  Date {sortKey === "recap_date" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
                <th className="p-2 text-left">Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.mint} className="border-t border-border hover:bg-muted/40">
                  <td className="p-2 font-semibold">${e.ticker}</td>
                  <td className="p-2 font-mono">
                    <button
                      onClick={() => copy(e.mint)}
                      title={e.mint}
                      className="hover:text-primary"
                    >
                      {e.mint}
                    </button>
                    {copied === e.mint && <span className="ml-2 text-primary">copied</span>}
                  </td>
                  <td className="p-2 font-mono">
                    {devs[e.mint] ? (
                      <span className="flex items-center gap-2">
                        <button
                          onClick={() => copy(devs[e.mint]!)}
                          title={devs[e.mint]!}
                          className="hover:text-primary"
                        >
                          {devs[e.mint]!.slice(0, 6)}…{devs[e.mint]!.slice(-4)}
                        </button>
                        {(devCounts.get(devs[e.mint]!) || 0) > 1 && (
                          <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px]">
                            ×{devCounts.get(devs[e.mint]!)}
                          </span>
                        )}
                        <a
                          className="text-primary/70 hover:text-primary underline text-[10px]"
                          href={`https://solscan.io/account/${devs[e.mint]}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          scan
                        </a>
                        {copied === devs[e.mint] && <span className="text-primary text-[10px]">copied</span>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{devLoading ? "…" : "—"}</span>
                    )}
                  </td>
                  <td className="p-2 font-bold text-primary">{e.multiplier}×</td>
                  <td className="p-2">{e.entry_mc ? `$${e.entry_mc}` : "—"}</td>
                  <td className="p-2">{e.peak_mc ? `$${e.peak_mc}` : "—"}</td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${badgeCls(e.recap_type)}`}>
                      {e.recap_type}
                    </span>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {new Date(e.recap_date).toLocaleDateString()}
                  </td>
                  <td className="p-2 space-x-2 whitespace-nowrap">
                    <a
                      className="text-primary underline"
                      href={`https://dexscreener.com/solana/${e.mint}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Dex
                    </a>
                    <a
                      className="text-primary underline"
                      href={`https://pump.fun/${e.mint}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Pump
                    </a>
                    <a
                      className="text-primary underline"
                      href={`/?token=${e.mint}`}
                    >
                      Holders
                    </a>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    No tokens match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}