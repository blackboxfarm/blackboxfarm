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
type Tab = "tokens" | "devs" | "kyc" | "alpha";

type AlphaTrade = {
  id: string;
  mint: string;
  ticker: string | null;
  entry_market_cap: number | null;
  size_usd: number;
  status: string;
  match_kind: string;
  matched_dev_wallet: string | null;
  matched_kyc_root: string | null;
  matched_kyc_label: string | null;
  dev_best_multiplier: number | null;
  dev_best_ticker: string | null;
  group_token_count: number | null;
  group_avg_multiplier: number | null;
  reason: string | null;
  sms_status: string | null;
  created_at: string;
};

type KycInfo = { root: string; label: string | null; source: string | null; status: string | null };

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
  const [tab, setTab] = useState<Tab>("tokens");
  const [devsOnlyRepeat, setDevsOnlyRepeat] = useState(true);
  const [kyc, setKyc] = useState<Record<string, KycInfo | null>>({}); // dev wallet -> KYC
  const [kycLoading, setKycLoading] = useState(false);
  const [kycProgress, setKycProgress] = useState<string>("");
  const [kycOnlyRepeat, setKycOnlyRepeat] = useState(true);
  const [kycHideCex, setKycHideCex] = useState(true);
  const [personByDev, setPersonByDev] = useState<Record<string, { root: string; via_cex: string | null; source: string | null }>>({});
  const [resolvingPersons, setResolvingPersons] = useState(false);
  const [personMsg, setPersonMsg] = useState<string | null>(null);
  const [alphaTrades, setAlphaTrades] = useState<AlphaTrade[]>([]);
  const [alphaLoading, setAlphaLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);
  const [usingPersisted, setUsingPersisted] = useState(false);

  // Resolve KYC for every known dev wallet
  useEffect(() => {
    const uniqueDevs = Array.from(new Set(Object.values(devs).filter(Boolean) as string[]));
    if (uniqueDevs.length === 0) return;
    (async () => {
      setKycLoading(true);
      const acc: Record<string, KycInfo | null> = {};
      const chunk = <T,>(a: T[], n: number) => {
        const o: T[][] = [];
        for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
        return o;
      };

      // 1) developer_profiles (primary)
      for (const batch of chunk(uniqueDevs, 200)) {
        const { data } = await (supabase as any)
          .from("developer_profiles")
          .select("master_wallet_address, kyc_root_wallet, kyc_root_label, kyc_source_type, kyc_trail_status")
          .in("master_wallet_address", batch);
        for (const r of (data as any[]) || []) {
          if (r?.kyc_root_wallet) {
            acc[r.master_wallet_address] = {
              root: r.kyc_root_wallet,
              label: r.kyc_root_label || null,
              source: r.kyc_source_type || null,
              status: r.kyc_trail_status || "resolved",
            };
          } else if (r?.kyc_trail_status) {
            acc[r.master_wallet_address] = null;
          }
        }
      }

      // 2) dev_wallet_reputation fallback
      const missing = uniqueDevs.filter((d) => !acc[d]);
      for (const batch of chunk(missing, 200)) {
        const { data } = await (supabase as any)
          .from("dev_wallet_reputation")
          .select("wallet_address, trail_end_kyc_root, trail_end_reason")
          .in("wallet_address", batch);
        for (const r of (data as any[]) || []) {
          if (r?.trail_end_kyc_root) {
            acc[r.wallet_address] = {
              root: r.trail_end_kyc_root,
              label: null,
              source: "dev_reputation",
              status: r.trail_end_reason || "resolved",
            };
          }
        }
      }

      // 3) Label enrichment via known_cex_wallets for any unlabeled roots
      const rootsToLabel = Array.from(
        new Set(Object.values(acc).filter((v): v is KycInfo => !!v && !v.label).map((v) => v.root)),
      );
      const labelMap = new Map<string, { name: string; entity: string | null }>();
      for (const batch of chunk(rootsToLabel, 200)) {
        const { data } = await (supabase as any)
          .from("known_cex_wallets")
          .select("wallet_address, cex_name, cex_label, entity_type")
          .in("wallet_address", batch);
        for (const r of (data as any[]) || []) {
          labelMap.set(r.wallet_address, {
            name: r.cex_label || r.cex_name || "",
            entity: r.entity_type || null,
          });
        }
      }
      for (const dev of Object.keys(acc)) {
        const v = acc[dev];
        if (v && !v.label) {
          const l = labelMap.get(v.root);
          if (l) acc[dev] = { ...v, label: l.name, source: v.source || l.entity };
        }
      }

      // Fill unresolved as null so UI can show "Unresolved KYC" bucket
      for (const d of uniqueDevs) if (!(d in acc)) acc[d] = null;

      setKyc(acc);
      const resolved = Object.values(acc).filter(Boolean).length;
      setKycProgress(`${resolved}/${uniqueDevs.length}`);
      setKycLoading(false);
    })();
  }, [devs]);

  // Load alpha_paper_trades whenever the Alpha tab is opened (and refresh every 30s)
  useEffect(() => {
    if (tab !== "alpha") return;
    let cancelled = false;
    const load = async () => {
      setAlphaLoading(true);
      const { data } = await (supabase as any)
        .from("alpha_paper_trades")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!cancelled) {
        setAlphaTrades((data as AlphaTrade[]) || []);
        setAlphaLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [tab]);

  async function rebuildAlphaLists() {
    setRebuilding(true);
    setRebuildMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("alpha-lists-rebuild");
      if (error) throw error;
      setRebuildMsg(
        `Rebuilt: ${data?.tokens ?? 0} tokens · ${data?.devs_upserted ?? 0} devs · ${data?.kyc_groups_upserted ?? 0} KYC groups`,
      );
    } catch (e: any) {
      setRebuildMsg(`Failed: ${e?.message || String(e)}`);
    } finally {
      setRebuilding(false);
    }
  }

  async function refreshRecaps(mode: "incremental" | "backfill" = "incremental") {
    setIngesting(true);
    setIngestMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("insiders-recaps-ingest", {
        body: { mode, days: mode === "backfill" ? 60 : 3 },
      });
      if (error) throw error;
      setIngestMsg(
        `${mode}: ${data?.unique_entries ?? 0} entries · ${data?.devs_resolved ?? 0} devs · ${data?.kyc_resolved ?? 0} kyc`,
      );
      const { data: persisted } = await (supabase as any)
        .from("insiders_recap_entries")
        .select(
          "token_mint, ticker, multiplier, entry_mcap, peak_mcap, recap_type, recap_date, source_message_id, dev_wallet, kyc_root_wallet, kyc_root_label, kyc_source_type",
        )
        .order("recap_date", { ascending: false })
        .limit(5000);
      if (persisted) {
        const bestByMint = new Map<string, Entry>();
        const devSeed: Record<string, string | null> = {};
        const kycSeed: Record<string, KycInfo | null> = {};
        for (const r of persisted as any[]) {
          const e: Entry = {
            mint: r.token_mint,
            ticker: r.ticker || "",
            multiplier: Number(r.multiplier) || 0,
            entry_mc: r.entry_mcap != null ? String(r.entry_mcap) : null,
            peak_mc: r.peak_mcap != null ? String(r.peak_mcap) : null,
            recap_type: r.recap_type as RecapType,
            recap_date: r.recap_date,
            message_id: r.source_message_id ?? null,
          };
          const prev = bestByMint.get(e.mint);
          if (!prev || e.multiplier > prev.multiplier) bestByMint.set(e.mint, e);
          if (r.dev_wallet) devSeed[r.token_mint] = r.dev_wallet;
          if (r.dev_wallet && r.kyc_root_wallet) {
            kycSeed[r.dev_wallet] = {
              root: r.kyc_root_wallet,
              label: r.kyc_root_label || null,
              source: r.kyc_source_type || null,
              status: "resolved",
            };
          }
        }
        setEntries(Array.from(bestByMint.values()));
        setDevs(devSeed);
        setKyc(kycSeed);
        setUsingPersisted(true);
      }
    } catch (e: any) {
      setIngestMsg(`Failed: ${e?.message || String(e)}`);
    } finally {
      setIngesting(false);
    }
  }

  // Group entries by KYC root
  const kycGroups = useMemo(() => {
    const g = new Map<string, { root: string; label: string | null; source: string | null; kind: 'person' | 'kyc' | 'unresolved'; via_cex: string | null; tokens: (Entry & { dev: string | null })[]; devs: Set<string> }>();
    const UNRESOLVED = "__unresolved__";
    for (const e of entries) {
      const dev = devs[e.mint] || null;
      const person = dev ? personByDev[dev] : null;
      const k = dev ? kyc[dev] : null;
      // Prefer person root; fall back to CEX/kyc root; then unresolved.
      let key: string;
      let kind: 'person' | 'kyc' | 'unresolved';
      let label: string | null;
      let source: string | null;
      let via_cex: string | null = null;
      if (person?.root) {
        key = person.root;
        kind = 'person';
        label = `Person ${person.root.slice(0, 4)}…${person.root.slice(-4)}`;
        source = person.source;
        via_cex = person.via_cex;
      } else if (k?.root) {
        key = k.root;
        kind = 'kyc';
        label = k.label || null;
        source = k.source;
      } else {
        key = UNRESOLVED;
        kind = 'unresolved';
        label = "Unresolved";
        source = null;
      }
      const cur = g.get(key) || {
        root: key,
        label,
        source,
        kind,
        via_cex,
        tokens: [] as (Entry & { dev: string | null })[],
        devs: new Set<string>(),
      };
      cur.tokens.push({ ...e, dev });
      if (dev) cur.devs.add(dev);
      g.set(key, cur);
    }
    let list = Array.from(g.values()).map((r) => ({
      ...r,
      tokens: [...r.tokens].sort((a, b) => b.multiplier - a.multiplier),
      bestX: Math.max(...r.tokens.map((t) => t.multiplier)),
    }));
    if (kycOnlyRepeat) list = list.filter((r) => r.root !== UNRESOLVED && r.tokens.length > 1);
    if (kycHideCex) {
      const INFRA_SOURCES = new Set(["cex", "onramp", "bridge"]);
      const INFRA_LABEL_RE = /(binance|coinbase|bybit|kucoin|gate\.io|htx|mexc|whitebit|bitget|okx|crypto\.com|gemini|kraken|ftx|moonpay|debridge|mayan|hot wallet)/i;
      list = list.filter((r) => {
        if (r.root === UNRESOLVED) return true; // keep unresolved bucket visible
        if (r.kind === 'person') return true;   // person groups are individuals, never infra
        if (r.source && INFRA_SOURCES.has(r.source)) return false;
        if (r.label && INFRA_LABEL_RE.test(r.label)) return false;
        return true;
      });
    }
    list.sort((a, b) => {
      // Unresolved always last
      if (a.root === UNRESOLVED) return 1;
      if (b.root === UNRESOLVED) return -1;
      return b.tokens.length - a.tokens.length || b.bestX - a.bestX;
    });
    return list;
  }, [entries, devs, kyc, personByDev, kycOnlyRepeat, kycHideCex]);

  useEffect(() => {
    (async () => {
      // 1) Prefer the persisted accumulative table
      const { data: persisted, error: pErr } = await (supabase as any)
        .from("insiders_recap_entries")
        .select(
          "token_mint, ticker, multiplier, entry_mcap, peak_mcap, recap_type, recap_date, source_message_id, dev_wallet, dev_resolution_source, kyc_root_wallet, kyc_root_label, kyc_source_type, person_root_wallet, person_root_via_cex, person_root_source",
        )
        .order("recap_date", { ascending: false })
        .limit(5000);
      if (!pErr && persisted && persisted.length > 0) {
        const bestByMint = new Map<string, Entry>();
        const devSeed: Record<string, string | null> = {};
        const kycSeed: Record<string, KycInfo | null> = {};
        const personSeed: Record<string, { root: string; via_cex: string | null; source: string | null }> = {};
        for (const r of persisted as any[]) {
          const e: Entry = {
            mint: r.token_mint,
            ticker: r.ticker || "",
            multiplier: Number(r.multiplier) || 0,
            entry_mc: r.entry_mcap != null ? String(r.entry_mcap) : null,
            peak_mc: r.peak_mcap != null ? String(r.peak_mcap) : null,
            recap_type: r.recap_type as RecapType,
            recap_date: r.recap_date,
            message_id: r.source_message_id ?? null,
          };
          const prev = bestByMint.get(e.mint);
          if (!prev || e.multiplier > prev.multiplier) bestByMint.set(e.mint, e);
          if (r.dev_wallet) devSeed[r.token_mint] = r.dev_wallet;
          if (r.dev_wallet && r.kyc_root_wallet) {
            kycSeed[r.dev_wallet] = {
              root: r.kyc_root_wallet,
              label: r.kyc_root_label || null,
              source: r.kyc_source_type || null,
              status: "resolved",
            };
          }
          if (r.dev_wallet && r.person_root_wallet) {
            personSeed[r.dev_wallet] = {
              root: r.person_root_wallet,
              via_cex: r.person_root_via_cex || null,
              source: r.person_root_source || null,
            };
          }
        }
        setEntries(Array.from(bestByMint.values()));
        setDevs(devSeed);
        setKyc(kycSeed);
        setPersonByDev(personSeed);
        setRecapCount(new Set((persisted as any[]).map((r) => `${r.recap_type}:${r.recap_date}`)).size);
        setUsingPersisted(true);
        setLoading(false);
        return;
      }

      // 2) Fallback: parse raw telegram_channel_calls (first-run before ingest has populated)
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

  // Group entries by dev wallet for the Dev Groupings tab
  const devGroups = useMemo(() => {
    const g = new Map<string, Entry[]>();
    for (const e of entries) {
      const d = devs[e.mint];
      if (!d) continue;
      const arr = g.get(d) || [];
      arr.push(e);
      g.set(d, arr);
    }
    let list = Array.from(g.entries()).map(([dev, toks]) => ({
      dev,
      tokens: [...toks].sort((a, b) => b.multiplier - a.multiplier),
      bestX: Math.max(...toks.map((t) => t.multiplier)),
    }));
    if (devsOnlyRepeat) list = list.filter((r) => r.tokens.length > 1);
    list.sort((a, b) => b.tokens.length - a.tokens.length || b.bestX - a.bestX);
    return list;
  }, [entries, devs, devsOnlyRepeat]);

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
        {usingPersisted && <span className="ml-2 text-primary/80">· persistent store</span>}
      </p>

      <div className="flex flex-wrap gap-2 items-center mb-3 text-xs">
        <button
          onClick={() => refreshRecaps("incremental")}
          disabled={ingesting}
          className="px-3 py-1 rounded border border-primary/60 text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {ingesting ? "Refreshing…" : "Refresh now"}
        </button>
        <button
          onClick={() => refreshRecaps("backfill")}
          disabled={ingesting}
          className="px-3 py-1 rounded border border-border text-muted-foreground hover:bg-muted/60 disabled:opacity-50"
          title="Rescan last 60 days"
        >
          Backfill 60d
        </button>
        {ingestMsg && <span className="text-muted-foreground">{ingestMsg}</span>}
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <div className="flex gap-1 mr-2">
          {(["tokens", "devs", "kyc", "alpha"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-xs rounded border ${
                tab === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:bg-muted/70"
              }`}
            >
              {t === "tokens"
                ? "Tokens"
                : t === "devs"
                  ? "Dev Groupings"
                  : t === "kyc"
                    ? "KYC Groupings"
                    : "Alpha Watch"}
            </button>
          ))}
        </div>
        {tab === "tokens" && (
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
        )}
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
          {!loading && kycProgress && (
            <span className="ml-2">· kyc: {kycProgress}{kycLoading ? "…" : ""}</span>
          )}
          {!loading && tab === "tokens" && dupeCount > 0 && (
            <button
              onClick={() => setOnlyDupes((v) => !v)}
              className={`ml-2 px-2 py-0.5 rounded border ${onlyDupes ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/60"}`}
              title="Show only devs that minted multiple tokens on this list"
            >
              {onlyDupes ? "Showing" : "Show"} repeat devs ({dupeCount})
            </button>
          )}
          {!loading && tab === "devs" && (
            <button
              onClick={() => setDevsOnlyRepeat((v) => !v)}
              className={`ml-2 px-2 py-0.5 rounded border ${devsOnlyRepeat ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/60"}`}
            >
              {devsOnlyRepeat ? "Repeat devs only" : "All devs"}
            </button>
          )}
          {!loading && tab === "kyc" && (
            <button
              onClick={() => setKycOnlyRepeat((v) => !v)}
              className={`ml-2 px-2 py-0.5 rounded border ${kycOnlyRepeat ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/60"}`}
            >
              {kycOnlyRepeat ? "Repeat KYC only" : "All KYC (incl. unresolved)"}
            </button>
          )}
          {!loading && tab === "kyc" && (
            <button
              onClick={() => setKycHideCex((v) => !v)}
              title="Hide Binance/Coinbase/etc. hot-wallet groupings — those are shared CEX infra, not a single person"
              className={`ml-2 px-2 py-0.5 rounded border ${kycHideCex ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/60"}`}
            >
              {kycHideCex ? "Hiding CEX/bridge infra" : "Showing CEX/bridge infra"}
            </button>
          )}
          {!loading && tab === "kyc" && (
            <button
              onClick={async () => {
                setResolvingPersons(true);
                setPersonMsg("Resolving person roots (backtracing to withdrawal wallets)…");
                try {
                  const { data, error } = await supabase.functions.invoke("insiders-person-root-resolver", {
                    body: { mode: "backfill", limit: 60 },
                  });
                  if (error) throw error;
                  const n = (data as any)?.processed ?? 0;
                  setPersonMsg(`Resolved ${n} dev wallets. Refresh in a sec.`);
                  // Refresh person map from DB
                  const { data: rows } = await (supabase as any)
                    .from("insiders_recap_entries")
                    .select("dev_wallet, person_root_wallet, person_root_via_cex, person_root_source")
                    .not("person_root_wallet", "is", null);
                  const seed: Record<string, { root: string; via_cex: string | null; source: string | null }> = {};
                  for (const r of (rows || []) as any[]) {
                    if (r.dev_wallet && r.person_root_wallet) {
                      seed[r.dev_wallet] = { root: r.person_root_wallet, via_cex: r.person_root_via_cex, source: r.person_root_source };
                    }
                  }
                  setPersonByDev(seed);
                } catch (e: any) {
                  setPersonMsg(`Failed: ${e?.message || String(e)}`);
                } finally {
                  setResolvingPersons(false);
                }
              }}
              disabled={resolvingPersons}
              className="ml-2 px-2 py-0.5 rounded border border-border hover:bg-muted/60 disabled:opacity-50"
              title="Walk each dev's funding chain to find the actual person's withdrawal wallet"
            >
              {resolvingPersons ? "Resolving…" : "Resolve person roots"}
            </button>
          )}
          {!loading && tab === "kyc" && personMsg && (
            <span className="ml-2 text-[10px] text-muted-foreground">{personMsg}</span>
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

      {!loading && !err && tab === "tokens" && (
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

      {!loading && !err && tab === "devs" && (
        <div className="space-y-4">
          {devGroups
            .filter((g) => {
              const term = q.trim().toLowerCase();
              if (!term) return true;
              if (g.dev.toLowerCase().includes(term)) return true;
              return g.tokens.some(
                (t) => t.ticker.toLowerCase().includes(term) || t.mint.toLowerCase().includes(term),
              );
            })
            .map((g) => (
              <div key={g.dev} className="rounded border border-border bg-muted/20">
                <div className="flex flex-wrap items-center gap-3 p-3 border-b border-border bg-muted/40">
                  <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-xs font-bold">
                    {g.tokens.length} tokens
                  </span>
                  <button
                    onClick={() => copy(g.dev)}
                    className="font-mono text-sm hover:text-primary"
                    title={g.dev}
                  >
                    {g.dev}
                  </button>
                  {copied === g.dev && <span className="text-primary text-xs">copied</span>}
                  <a
                    className="text-primary/80 hover:text-primary underline text-xs"
                    href={`https://solscan.io/account/${g.dev}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    solscan
                  </a>
                  <span className="ml-auto text-xs text-muted-foreground">
                    best <span className="text-primary font-bold">{g.bestX}×</span>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Ticker</th>
                        <th className="p-2 text-left">Best X</th>
                        <th className="p-2 text-left">Entry MC</th>
                        <th className="p-2 text-left">Peak MC</th>
                        <th className="p-2 text-left">Recap</th>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Links</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.tokens.map((t) => (
                        <tr key={t.mint} className="border-t border-border hover:bg-muted/30">
                          <td className="p-2 font-semibold">${t.ticker}</td>
                          <td className="p-2 font-bold text-primary">{t.multiplier}×</td>
                          <td className="p-2">{t.entry_mc ? `$${t.entry_mc}` : "—"}</td>
                          <td className="p-2">{t.peak_mc ? `$${t.peak_mc}` : "—"}</td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${badgeCls(t.recap_type)}`}>
                              {t.recap_type}
                            </span>
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {new Date(t.recap_date).toLocaleDateString()}
                          </td>
                          <td className="p-2 space-x-2 whitespace-nowrap">
                            <a
                              className="text-primary underline"
                              href={`https://pump.fun/${t.mint}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Pump
                            </a>
                            <a
                              className="text-primary underline"
                              href={`https://dexscreener.com/solana/${t.mint}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Dex
                            </a>
                            <a className="text-primary underline" href={`/?token=${t.mint}`}>
                              Holders
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          {devGroups.length === 0 && (
            <div className="p-6 text-center text-muted-foreground border border-border rounded">
              {devLoading ? "Resolving dev wallets…" : "No dev groups yet."}
            </div>
          )}
        </div>
      )}

      {!loading && !err && tab === "kyc" && (
        <div className="space-y-4">
          {kycGroups
            .filter((g) => {
              const term = q.trim().toLowerCase();
              if (!term) return true;
              if (g.root.toLowerCase().includes(term)) return true;
              if ((g.label || "").toLowerCase().includes(term)) return true;
              return g.tokens.some(
                (t) =>
                  t.ticker.toLowerCase().includes(term) ||
                  t.mint.toLowerCase().includes(term) ||
                  (t.dev || "").toLowerCase().includes(term),
              );
            })
            .map((g) => {
              const isUnresolved = g.root === "__unresolved__";
              return (
                <div key={g.root} className="rounded border border-border bg-muted/20">
                  <div className="flex flex-wrap items-center gap-3 p-3 border-b border-border bg-muted/40">
                    <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-xs font-bold">
                      {g.tokens.length} tokens
                    </span>
                    <span className="px-2 py-0.5 rounded bg-secondary/50 text-foreground text-[10px]">
                      {g.devs.size} dev{g.devs.size === 1 ? "" : "s"}
                    </span>
                    {g.label && (
                      <span className="px-2 py-0.5 rounded bg-primary/30 text-primary text-xs font-semibold">
                        {g.label}
                      </span>
                    )}
                    {g.source && !isUnresolved && (
                      <span className="text-[10px] text-muted-foreground uppercase">{g.source}</span>
                    )}
                    {g.kind === 'person' && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold uppercase">
                        Person
                      </span>
                    )}
                    {g.kind === 'person' && g.via_cex && (
                      <span className="text-[10px] text-muted-foreground">via {g.via_cex}</span>
                    )}
                    {g.kind === 'person' && !g.via_cex && (
                      <span className="text-[10px] text-muted-foreground">via privacy hop</span>
                    )}
                    {!isUnresolved && (
                      <>
                        <button
                          onClick={() => copy(g.root)}
                          className="font-mono text-sm hover:text-primary"
                          title={g.root}
                        >
                          {g.root}
                        </button>
                        {copied === g.root && <span className="text-primary text-xs">copied</span>}
                        <a
                          className="text-primary/80 hover:text-primary underline text-xs"
                          href={`https://solscan.io/account/${g.root}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          solscan
                        </a>
                      </>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      best <span className="text-primary font-bold">{g.bestX}×</span>
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="p-2 text-left">Ticker</th>
                          <th className="p-2 text-left">Dev</th>
                          <th className="p-2 text-left">Best X</th>
                          <th className="p-2 text-left">Entry MC</th>
                          <th className="p-2 text-left">Peak MC</th>
                          <th className="p-2 text-left">Recap</th>
                          <th className="p-2 text-left">Date</th>
                          <th className="p-2 text-left">Links</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.tokens.map((t) => (
                          <tr key={t.mint} className="border-t border-border hover:bg-muted/30">
                            <td className="p-2 font-semibold">${t.ticker}</td>
                            <td className="p-2 font-mono">
                              {t.dev ? (
                                <a
                                  className="hover:text-primary underline"
                                  href={`https://solscan.io/account/${t.dev}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={t.dev}
                                >
                                  {t.dev.slice(0, 6)}…{t.dev.slice(-4)}
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="p-2 font-bold text-primary">{t.multiplier}×</td>
                            <td className="p-2">{t.entry_mc ? `$${t.entry_mc}` : "—"}</td>
                            <td className="p-2">{t.peak_mc ? `$${t.peak_mc}` : "—"}</td>
                            <td className="p-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${badgeCls(t.recap_type)}`}>
                                {t.recap_type}
                              </span>
                            </td>
                            <td className="p-2 whitespace-nowrap">
                              {new Date(t.recap_date).toLocaleDateString()}
                            </td>
                            <td className="p-2 space-x-2 whitespace-nowrap">
                              <a
                                className="text-primary underline"
                                href={`https://pump.fun/${t.mint}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Pump
                              </a>
                              <a
                                className="text-primary underline"
                                href={`https://dexscreener.com/solana/${t.mint}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Dex
                              </a>
                              <a className="text-primary underline" href={`/?token=${t.mint}`}>
                                Holders
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          {kycGroups.length === 0 && (
            <div className="p-6 text-center text-muted-foreground border border-border rounded">
              {kycLoading ? "Resolving KYC roots…" : "No KYC groups yet."}
            </div>
          )}
        </div>
      )}

      {!loading && !err && tab === "alpha" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 p-3 rounded border border-border bg-muted/20">
            <span className="text-sm font-semibold">Alpha Watch</span>
            <span className="text-xs text-muted-foreground">
              Live paper-buys triggered when a new insiders token matches a known-alpha dev or KYC group.
            </span>
            <button
              onClick={rebuildAlphaLists}
              disabled={rebuilding}
              className="ml-auto px-3 py-1 text-xs rounded border border-primary bg-primary text-primary-foreground disabled:opacity-50"
            >
              {rebuilding ? "Rebuilding…" : "Rebuild alpha lists from recaps"}
            </button>
            {rebuildMsg && <span className="text-xs text-muted-foreground">{rebuildMsg}</span>}
          </div>
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground sticky top-0">
                <tr>
                  <th className="p-2 text-left">When</th>
                  <th className="p-2 text-left">Ticker</th>
                  <th className="p-2 text-left">Entry MC</th>
                  <th className="p-2 text-left">Size</th>
                  <th className="p-2 text-left">Match</th>
                  <th className="p-2 text-left">Reason</th>
                  <th className="p-2 text-left">SMS</th>
                  <th className="p-2 text-left">Links</th>
                </tr>
              </thead>
              <tbody>
                {alphaTrades.map((t) => (
                  <tr key={t.id} className="border-t border-border hover:bg-muted/40">
                    <td className="p-2 whitespace-nowrap">
                      {new Date(t.created_at).toLocaleString()}
                    </td>
                    <td className="p-2 font-semibold">${t.ticker || "?"}</td>
                    <td className="p-2">
                      {t.entry_market_cap
                        ? t.entry_market_cap >= 1_000_000
                          ? `$${(t.entry_market_cap / 1_000_000).toFixed(2)}M`
                          : t.entry_market_cap >= 1_000
                            ? `$${(t.entry_market_cap / 1_000).toFixed(1)}k`
                            : `$${t.entry_market_cap.toFixed(0)}`
                        : "—"}
                    </td>
                    <td className="p-2">${t.size_usd}</td>
                    <td className="p-2">
                      <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-[10px] uppercase">
                        {t.match_kind}
                      </span>
                      {t.matched_kyc_label && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {t.matched_kyc_label}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">{t.reason || "—"}</td>
                    <td className="p-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          t.sms_status === "sent"
                            ? "bg-primary/20 text-primary"
                            : t.sms_status === "failed"
                              ? "bg-destructive/20 text-destructive"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t.sms_status || "—"}
                      </span>
                    </td>
                    <td className="p-2 space-x-2 whitespace-nowrap">
                      <a className="text-primary underline" href={`https://dexscreener.com/solana/${t.mint}`} target="_blank" rel="noreferrer">Dex</a>
                      <a className="text-primary underline" href={`https://pump.fun/${t.mint}`} target="_blank" rel="noreferrer">Pump</a>
                      <a className="text-primary underline" href={`/?token=${t.mint}`}>Holders</a>
                    </td>
                  </tr>
                ))}
                {alphaTrades.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      {alphaLoading
                        ? "Loading…"
                        : "No alpha paper-buys yet. Rebuild the alpha lists, then the next insiders token that matches will land here."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}