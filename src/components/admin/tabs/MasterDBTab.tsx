import React, { useState, useCallback, lazy, Suspense } from "react";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Database,
  ExternalLink,
  Copy,
  Check,
  Pill,
  History,
  AlertTriangle,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LazyLoader } from "@/components/ui/lazy-loader";
import { isNonTokenHost, hostFromUrl } from "@/lib/non-token-domains";
import { RecycledCommunityBadge, type RecycledCommunityScore } from "@/components/admin/RecycledCommunityBadge";
import { DevWalletCell } from "@/components/admin/shared/DevWalletCell";
import { KycCell } from "@/components/admin/shared/KycCell";

const MasterDBHistory = lazy(() => import("@/components/admin/MasterDBHistory"));

const PAGE_SIZE = 100;

function truncate(str: string | null, len = 16) {
  if (!str) return "—";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

function MintCell({ mint }: { mint: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="flex items-center gap-1 font-mono text-xs">
      <a
        href={`https://solscan.io/token/${mint}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300"
      >
        {mint.slice(0, 6)}…{mint.slice(-4)}
      </a>
      <button onClick={copy} className="text-muted-foreground hover:text-foreground">
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}

function LaunchpadCell({ launchpad, mint }: { launchpad: string | null; mint: string }) {
  if (!launchpad) return <span className="text-muted-foreground text-xs">—</span>;
  const lp = launchpad.toLowerCase();
  const url =
    lp === 'pump.fun' ? `https://pump.fun/coin/${mint}` :
    lp === 'bonk.fun' ? `https://bonk.fun/${mint}` :
    lp === 'bags.fm' ? `https://bags.fm/${mint}` :
    null;
  if (!url) return <Badge variant="outline" className="text-[10px]">{launchpad}</Badge>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
      <Badge variant="outline" className="text-[10px] hover:bg-primary/10">
        {launchpad}
        <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
      </Badge>
    </a>
  );
}

function ArrayCell({ arr }: { arr: string[] | null }) {
  if (!arr || arr.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-0.5 max-w-[200px]">
      {arr.slice(0, 3).map((v, i) => (
        <Badge key={i} variant="outline" className="text-[10px] px-1 py-0 truncate max-w-[90px]">
          {v}
        </Badge>
      ))}
      {arr.length > 3 && (
        <Badge variant="secondary" className="text-[10px] px-1 py-0">
          +{arr.length - 3}
        </Badge>
      )}
    </div>
  );
}

type WebsiteSource = { url: string; sources: string[]; host?: string };

function WebsitesCell({ urls, sources }: { urls: string[] | null; sources: WebsiteSource[] | null }) {
  // Prefer the structured website_sources list when available; otherwise fall back to the legacy
  // mesh urls. Always filter out known non-token hosts at display time (no DB deletes).
  const items: WebsiteSource[] = (() => {
    if (sources && sources.length > 0) {
      return sources.filter((s) => {
        const h = (s.host || hostFromUrl(s.url) || '').toLowerCase();
        return !!h && !isNonTokenHost(h);
      });
    }
    if (!urls) return [];
    return urls
      .map((u) => ({ url: u, sources: [] as string[], host: hostFromUrl(u) || u }))
      .filter((s) => !isNonTokenHost(s.host || ''));
  })();

  if (items.length === 0) return <span className="text-muted-foreground text-xs">—</span>;

  // Detect "they changed" when both launchpad and dexscreener_paid sources exist
  // but with different urls.
  const hasLaunchpad = items.some((i) => i.sources.includes('launchpad'));
  const hasDexPaid = items.some((i) => i.sources.includes('dexscreener_paid'));
  const launchpadHosts = new Set(items.filter((i) => i.sources.includes('launchpad')).map((i) => i.host));
  const dexHosts = new Set(items.filter((i) => i.sources.includes('dexscreener_paid')).map((i) => i.host));
  const changed = hasLaunchpad && hasDexPaid && [...launchpadHosts].some((h) => h && !dexHosts.has(h));

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col gap-0.5 max-w-[240px]">
        {items.slice(0, 4).map((s, i) => {
          const display = s.host || (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return s.url; } })();
          const launchpadBadge = s.sources.includes('launchpad');
          const dexBadge = s.sources.includes('dexscreener_paid');
          return (
            <div key={i} className="flex items-center gap-1">
              <a href={s.url} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5 truncate max-w-[160px]">
                🌐 {display}
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              </a>
              {launchpadBadge && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px]">🚀</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">From launchpad MINT</TooltipContent>
                </Tooltip>
              )}
              {dexBadge && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[10px]">📊</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">From DexScreener (DEX paid)</TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        })}
        {items.length > 4 && <span className="text-[10px] text-muted-foreground">+{items.length - 4} more</span>}
        {changed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400">
                <AlertTriangle className="h-3 w-3" /> changed
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[260px]">
              Launchpad MINT website ≠ DexScreener-paid website. Possible CTO or socials swap.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

function extractCommunityId(url: string): string | null {
  const m = url.match(/\/communities\/(\d+)/);
  return m ? m[1] : null;
}

function XCommunityCell({
  urls,
  names,
  scores,
}: {
  urls: string[] | null;
  names: string[] | null;
  scores?: Record<string, RecycledCommunityScore>;
}) {
  if (!urls || urls.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-col gap-0.5 max-w-[240px]">
      {urls.map((url, i) => {
        const name = names?.[i] || url.split('/').pop() || 'Community';
        const cid = extractCommunityId(url);
        const score = cid && scores ? scores[cid] : null;
        return (
          <div key={i} className="flex items-center gap-1">
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5 truncate">
              🏛️ {truncate(name, 24)}
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            </a>
            {score && <RecycledCommunityBadge data={score} />}
          </div>
        );
      })}
    </div>
  );
}

// Unified X Handles cell: merges mesh handles, community admins, mods, and creator handle.
// Each shown with role badge and an X profile link.
function XHandlesCell({
  mesh, admins, mods, creator,
}: {
  mesh: string[] | null;
  admins: string[] | null;
  mods: string[] | null;
  creator: string | null;
}) {
  const norm = (s: string) => s.replace(/^@/, '').toLowerCase();
  const seen = new Set<string>();
  type Item = { handle: string; role: 'creator' | 'admin' | 'mod' | 'mesh' };
  const items: Item[] = [];
  const add = (handle: string | null | undefined, role: Item['role']) => {
    if (!handle) return;
    const h = norm(handle);
    if (!h || seen.has(h)) return;
    seen.add(h);
    items.push({ handle: h, role });
  };
  add(creator, 'creator');
  (admins || []).forEach((h) => add(h, 'admin'));
  (mods || []).forEach((h) => add(h, 'mod'));
  (mesh || []).forEach((h) => add(h, 'mesh'));

  if (items.length === 0) return <span className="text-muted-foreground text-xs">—</span>;

  const ROLE: Record<Item['role'], { emoji: string; cls: string; label: string }> = {
    creator: { emoji: '🧑‍🚀', cls: 'bg-emerald-700/70 hover:bg-emerald-600',  label: 'Creator' },
    admin:   { emoji: '👑',  cls: 'bg-amber-600/80 hover:bg-amber-500',     label: 'Community admin' },
    mod:     { emoji: '🛡️', cls: '',                                       label: 'Community mod' },
    mesh:    { emoji: '@',   cls: '',                                       label: 'Mesh-discovered' },
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap gap-0.5 max-w-[240px]">
        {items.slice(0, 6).map((it, i) => {
          const r = ROLE[it.role];
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <a href={`https://x.com/${it.handle}`} target="_blank" rel="noopener noreferrer">
                  <Badge
                    variant={it.role === 'mesh' || it.role === 'mod' ? 'outline' : 'default'}
                    className={`text-[10px] px-1 py-0 ${r.cls}`}
                  >
                    {r.emoji} @{it.handle}
                  </Badge>
                </a>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{r.label}</TooltipContent>
            </Tooltip>
          );
        })}
        {items.length > 6 && (
          <Badge variant="secondary" className="text-[10px] px-1 py-0">+{items.length - 6}</Badge>
        )}
      </div>
    </TooltipProvider>
  );
}

// Source icon definitions — inferred from row data
const SOURCE_ICONS: { key: string; emoji: string; label: string; test: (r: any) => boolean }[] = [
  { key: 'pump',    emoji: '🎰', label: 'Pump.fun Discovery',         test: r => r.launchpad?.toLowerCase() === 'pump.fun' },
  { key: 'bonk',    emoji: '🦴', label: 'Bonk.fun Discovery',         test: r => r.launchpad?.toLowerCase() === 'bonk.fun' },
  { key: 'bags',    emoji: '👜', label: 'Bags.fm Discovery',          test: r => r.launchpad?.toLowerCase() === 'bags.fm' },
  { key: 'dex',     emoji: '📊', label: 'DexScreener (Graduated/Top 50)', test: r => r.is_graduated === true },
  { key: 'xpost',   emoji: '📢', label: 'HoldersIntel X Post',       test: r => r.was_posted === true },
  { key: 'mesh',    emoji: '🕸️', label: 'Mesh / Bubble Map Submit',   test: r => (r.mesh_x_handles?.length > 0 || r.community_admin_handles?.length > 0) && !r.was_posted },
  { key: 'manual',  emoji: '🔍', label: 'Manual /holders Query',      test: r => !r.launchpad && !r.was_posted && !r.is_graduated },
];

function SourceIcons({ row }: { row: any }) {
  const matched = SOURCE_ICONS.filter(s => s.test(row));
  if (matched.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <TooltipProvider delayDuration={200}>
      <span className="flex items-center gap-0.5">
        {matched.map(s => (
          <Tooltip key={s.key}>
            <TooltipTrigger asChild>
              <span className="cursor-default text-sm leading-none">{s.emoji}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">{s.label}</TooltipContent>
          </Tooltip>
        ))}
      </span>
    </TooltipProvider>
  );
}

export default function MasterDBTab() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterPump, setFilterPump] = useState(false);
  const [sortBy, setSortBy] = useState<
    "created_at" | "ath_market_cap_usd" | "graduated_at" | "dev_reputation_score" | "dev_total_launches" | "dev_tokens_rugged"
  >("created_at");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [filterGraduated, setFilterGraduated] = useState(false);
  const [filterKycVerified, setFilterKycVerified] = useState(false);
  const [filterBlacklisted, setFilterBlacklisted] = useState(false);
  const [filterPosted, setFilterPosted] = useState(false);
  const [filterHasDev, setFilterHasDev] = useState(false);
  const [activeView, setActiveView] = useState<"directory" | "history">("directory");
  const { toast } = useToast();
  void toast;

  const doSearch = useCallback(() => {
    setSearch(searchInput.trim());
    setPage(0);
  }, [searchInput]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "master-db", page, search, filterPump,
      sortBy, sortDir,
      filterGraduated, filterKycVerified, filterBlacklisted, filterPosted, filterHasDev,
    ],
    queryFn: async () => {
      let query = supabase
        .from("master_token_directory" as any)
        .select("*", { count: "exact" })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        .order(sortBy, { ascending: sortDir === "asc", nullsFirst: false });

      if (filterPump) {
        query = query.neq("discovery_source", "pump_monitor");
      }
      if (filterGraduated) query = query.eq("is_graduated", true);
      if (filterKycVerified) query = query.eq("kyc_verified", true);
      if (filterBlacklisted) query = query.eq("dev_auto_blacklisted", true);
      if (filterPosted) query = query.eq("was_posted", true);
      if (filterHasDev) query = query.not("creator_wallet", "is", null);

      if (search) {
        // X handle detection: optional @, alphanum/underscore, 1-15 chars.
        const stripped = search.replace(/^@/, "").trim();
        const isHandle = /^[A-Za-z0-9_]{1,15}$/.test(stripped);
        const orParts = [
          `symbol.ilike.%${search}%`,
          `name.ilike.%${search}%`,
          `token_mint.ilike.%${search}%`,
          `creator_wallet.ilike.%${search}%`,
        ];
        if (isHandle) {
          const lc = stripped.toLowerCase();
          // PostgREST array `contains` — works for exact-match handle lookups.
          orParts.push(
            `mesh_x_handles.cs.{${lc}}`,
            `community_admin_handles.cs.{${lc}}`,
            `community_mod_handles.cs.{${lc}}`,
          );
          if (lc !== stripped) {
            orParts.push(
              `mesh_x_handles.cs.{${stripped}}`,
              `community_admin_handles.cs.{${stripped}}`,
              `community_mod_handles.cs.{${stripped}}`,
            );
          }
        }
        query = query.or(orParts.join(","));
      }

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { rows: rows as any[], total: count ?? 0 };
    },
    placeholderData: (prev) => prev,
  });

  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Collect all community IDs visible on this page and batch-fetch recycled scores
  const visibleCommunityIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      for (const url of (r.x_community_urls || []) as string[]) {
        const m = url.match(/\/communities\/(\d+)/);
        if (m) ids.add(m[1]);
      }
    }
    return Array.from(ids);
  }, [rows]);

  const { data: communityScores } = useQuery({
    queryKey: ["master-db-recycled-scores", visibleCommunityIds.join(",")],
    enabled: visibleCommunityIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("x_communities")
        .select("community_id, recycled_score, recycled_band, recycled_signals, recycled_evaluated_at")
        .in("community_id", visibleCommunityIds);
      if (error) throw error;
      const map: Record<string, RecycledCommunityScore> = {};
      for (const row of data || []) {
        map[(row as any).community_id] = {
          score: (row as any).recycled_score,
          band: (row as any).recycled_band,
          signals: (row as any).recycled_signals,
          evaluated_at: (row as any).recycled_evaluated_at,
        };
      }
      return map;
    },
    staleTime: 60_000,
  });

  // Batch-fetch KYC root info for the dev wallets on this page so the KYC cell
  // can show "Binance · 8PPv…4YYx" without a per-row query.
  const visibleDevWallets = React.useMemo(() => {
    const out = new Set<string>();
    for (const r of rows) {
      const w = (r.creator_wallet || (r.dev_wallets && r.dev_wallets[0])) as string | undefined;
      if (w && typeof w === "string" && w.length >= 32 && w.length <= 44) out.add(w);
    }
    return Array.from(out);
  }, [rows]);

  const { data: kycRootMap } = useQuery({
    queryKey: ["master-db-kyc-roots", visibleDevWallets.join(",")],
    enabled: visibleDevWallets.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developer_profiles")
        .select("master_wallet_address, kyc_root_wallet, kyc_root_label, kyc_source")
        .in("master_wallet_address", visibleDevWallets);
      if (error) throw error;
      const map: Record<string, { rootWallet: string | null; rootLabel: string | null; source: string | null }> = {};
      for (const row of data || []) {
        map[(row as any).master_wallet_address] = {
          rootWallet: (row as any).kyc_root_wallet ?? null,
          rootLabel: (row as any).kyc_root_label ?? null,
          source: (row as any).kyc_source ?? null,
        };
      }
      return map;
    },
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
    
    <div className="flex items-center gap-1 mb-4">
      <Button
        variant={activeView === "directory" ? "default" : "ghost"}
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setActiveView("directory")}
      >
        <Database className="h-3.5 w-3.5" />
        Directory
      </Button>
      <Button
        variant={activeView === "history" ? "default" : "ghost"}
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setActiveView("history")}
      >
        <History className="h-3.5 w-3.5" />
        History
      </Button>
    </div>
    {activeView === "history" ? (
      <Suspense fallback={<LazyLoader />}>
        <MasterDBHistory />
      </Suspense>
    ) : (
    <Card className="w-full -mx-6 sm:-mx-6" style={{ width: 'calc(100% + 3rem)' }}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5" />
            Master Token Directory
            <Badge variant="secondary" className="text-xs font-mono">
              {total.toLocaleString()} tokens
            </Badge>
          </CardTitle>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doSearch();
            }}
            className="flex gap-2 w-full sm:w-auto"
          >
            <Input
              placeholder="Search symbol, name, mint, wallet…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="text-sm h-8 w-full sm:w-64"
            />
            <Button type="submit" size="sm" variant="secondary" className="h-8 px-3">
              <Search className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant={filterPump ? "default" : "outline"}
              className="h-8 px-3 gap-1.5"
              onClick={() => { setFilterPump(f => !f); setPage(0); }}
            >
              <Pill className="h-3.5 w-3.5" />
              {filterPump ? "Pump Monitor Hidden" : "Hide Pump Monitor"}
            </Button>
          </form>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Top horizontal scrollbar */}
        <div id="master-db-scroll-sync" className="overflow-x-auto overflow-y-hidden h-3 border-b">
          <div style={{ height: '1px' }} />
        </div>
        <div className="overflow-x-auto" ref={(el) => {
          if (el) {
            // Sync dual scrollbars
            const id = 'master-db-scroll-sync';
            const top = document.getElementById(id);
            if (top) {
              top.onscroll = () => { el.scrollLeft = top.scrollLeft; };
              el.onscroll = () => { top.scrollLeft = el.scrollLeft; };
              // Match inner width
              const inner = top.firstElementChild as HTMLElement;
              if (inner) {
                const resizeObs = new ResizeObserver(() => {
                  inner.style.width = el.scrollWidth + 'px';
                });
                resizeObs.observe(el);
              }
            }
          }
        }}>
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:py-2 [&>th]:text-[11px] [&>th]:font-semibold">
                <TableHead>#</TableHead>
                <TableHead>Src</TableHead>
                <TableHead>Img</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Mint</TableHead>
                <TableHead>Launchpad</TableHead>
                <TableHead>Websites</TableHead>
                <TableHead>X Communities</TableHead>
                <TableHead>X Handles</TableHead>
                <TableHead>ATH (all-time)</TableHead>
                <TableHead>Grad</TableHead>
                <TableHead>Graduated At</TableHead>
                <TableHead>Dev Wallet</TableHead>
                <TableHead>KYC</TableHead>
                <TableHead>KYC Src</TableHead>
                <TableHead>Rep Score</TableHead>
                <TableHead>Trust</TableHead>
                <TableHead>Pattern</TableHead>
                <TableHead>Launches</TableHead>
                <TableHead>Rugged</TableHead>
                <TableHead>Successful</TableHead>
                <TableHead>Blacklisted</TableHead>
                <TableHead>Spammer</TableHead>
                <TableHead>Legit</TableHead>
                <TableHead>Posted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={30} className="text-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={30} className="text-center py-8 text-muted-foreground">
                    No tokens found
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r: any, i: number) => (
                  <TableRow key={r.token_mint} className="[&>td]:px-2 [&>td]:py-1.5 [&>td]:whitespace-nowrap hover:bg-muted/50">
                    <TableCell className="text-muted-foreground">{page * PAGE_SIZE + i + 1}</TableCell>
                    <TableCell><SourceIcons row={r} /></TableCell>
                    <TableCell>
                      {r.image_url ? (
                        <img src={r.image_url} alt="" className="h-5 w-5 rounded-full object-cover" loading="lazy" />
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-muted" />
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {r.symbol ? (
                        <a
                          href={`https://dexscreener.com/solana/${r.token_mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {r.symbol}
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{truncate(r.name, 20)}</TableCell>
                    <TableCell><MintCell mint={r.token_mint} /></TableCell>
                    <TableCell><LaunchpadCell launchpad={r.launchpad} mint={r.token_mint} /></TableCell>
                    <TableCell><WebsitesCell urls={r.websites} sources={r.website_sources as WebsiteSource[] | null} /></TableCell>
                    <TableCell><XCommunityCell urls={r.x_community_urls} names={r.x_community_names} scores={communityScores} /></TableCell>
                    <TableCell>
                      <XHandlesCell
                        mesh={r.mesh_x_handles}
                        admins={r.community_admin_handles}
                        mods={r.community_mod_handles}
                        creator={null}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(() => {
                        const ath = r.ath_market_cap_usd != null ? Number(r.ath_market_cap_usd) : null;
                        const ath24 = r.ath_24h_usd != null ? Number(r.ath_24h_usd) : null;
                        if (ath != null) {
                          const fmt = ath >= 1000 ? `$${(ath / 1000).toFixed(1)}k` : `$${ath.toFixed(2)}`;
                          return (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>{fmt}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  ATH market cap (all-time){r.ath_market_cap_at ? ` · ${new Date(r.ath_market_cap_at).toLocaleString()}` : ''}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        }
                        if (ath24 != null) {
                          return (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="opacity-70">${ath24.toFixed(6)} <span className="text-[9px]">(24h)</span></span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-[220px]">
                                  Only 24h ATH price recorded; all-time market cap not yet captured.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        }
                        return "—";
                      })()}
                    </TableCell>
                    <TableCell>{r.is_graduated ? "✅" : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.graduated_at ? (
                        <span title={new Date(r.graduated_at).toLocaleString()}>
                          {new Date(r.graduated_at).toLocaleDateString()}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <DevWalletCell
                        tokenMint={r.token_mint}
                        symbol={r.symbol}
                        devWallet={r.creator_wallet || (r.dev_wallets && r.dev_wallets[0])}
                      />
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const dw = (r.creator_wallet || (r.dev_wallets && r.dev_wallets[0])) as string | null;
                        const info = dw ? kycRootMap?.[dw] : null;
                        return (
                          <KycCell
                            devWallet={dw}
                            kycVerified={r.kyc_verified}
                            kycRootWallet={info?.rootWallet}
                            kycRootLabel={info?.rootLabel}
                            kycSource={info?.source ?? r.kyc_source}
                          />
                        );
                      })()}
                    </TableCell>
                    <TableCell>{r.kyc_source ?? "—"}</TableCell>
                    <TableCell>
                      {r.dev_reputation_score != null ? (
                        <Badge variant={Number(r.dev_reputation_score) >= 70 ? "default" : Number(r.dev_reputation_score) >= 40 ? "secondary" : "destructive"} className="text-[10px]">
                          {Number(r.dev_reputation_score).toFixed(0)}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{r.dev_trust_level ?? "—"}</TableCell>
                    <TableCell>{r.dev_pattern ?? "—"}</TableCell>
                    <TableCell>{r.dev_total_launches ?? "—"}</TableCell>
                    <TableCell>{r.dev_tokens_rugged ?? "—"}</TableCell>
                    <TableCell>{r.dev_tokens_successful ?? "—"}</TableCell>
                    <TableCell>{r.dev_auto_blacklisted ? "🚫" : "—"}</TableCell>
                    <TableCell>{r.dev_is_serial_spammer ? "🚫" : "—"}</TableCell>
                    <TableCell>{r.dev_is_legitimate_builder ? "✅" : "—"}</TableCell>
                    <TableCell>{r.was_posted ? "✅" : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(0)}>
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    )}
    </div>
  );
}
