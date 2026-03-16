import React, { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PAGE_SIZE = 100;

function truncate(str: string | null, len = 16) {
  if (!str) return "—";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

function MintCell({ mint }: { mint: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="flex items-center gap-1 font-mono text-xs">
      {mint.slice(0, 6)}…{mint.slice(-4)}
      <button onClick={copy} className="text-muted-foreground hover:text-foreground">
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
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
  const { toast } = useToast();

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ath-24h-backfill", {
        body: { batchSize: 50 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast({
        title: "ATH 24h Backfill Started",
        description: `Processed ${data?.processed ?? 0} tokens. ${data?.remaining ?? "?"} remaining.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Backfill Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const doSearch = useCallback(() => {
    setSearch(searchInput.trim());
    setPage(0);
  }, [searchInput]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["master-db", page, search],
    queryFn: async () => {
      let query = supabase
        .from("master_token_directory" as any)
        .select("*", { count: "exact" })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        .order("created_at", { ascending: false, nullsFirst: false });

      if (search) {
        query = query.or(
          `symbol.ilike.%${search}%,name.ilike.%${search}%,token_mint.ilike.%${search}%,creator_wallet.ilike.%${search}%`
        );
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

  return (
    <Card>
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
              variant="outline"
              className="h-8 px-3 gap-1.5"
              disabled={backfillMutation.isPending}
              onClick={() => backfillMutation.mutate()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${backfillMutation.isPending ? "animate-spin" : ""}`} />
              Backfill ATH
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
                <TableHead>Grad</TableHead>
                <TableHead>Graduated At</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead>Dev Wallets</TableHead>
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
                <TableHead>X Communities</TableHead>
                <TableHead>Community Names</TableHead>
                <TableHead>Admins</TableHead>
                <TableHead>Mods</TableHead>
                <TableHead>Mesh X</TableHead>
                <TableHead>Websites</TableHead>
                <TableHead>ATH 24h</TableHead>
                <TableHead>Posted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={29} className="text-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={29} className="text-center py-8 text-muted-foreground">
                    No tokens found
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r: any, i: number) => (
                  <TableRow key={r.token_mint} className="[&>td]:px-2 [&>td]:py-1.5 [&>td]:whitespace-nowrap hover:bg-muted/50">
                    <TableCell className="text-muted-foreground">{page * PAGE_SIZE + i + 1}</TableCell>
                    <TableCell>
                      {r.image_url ? (
                        <img src={r.image_url} alt="" className="h-5 w-5 rounded-full object-cover" loading="lazy" />
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-muted" />
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">{r.symbol ?? "—"}</TableCell>
                    <TableCell>{truncate(r.name, 20)}</TableCell>
                    <TableCell><MintCell mint={r.token_mint} /></TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.launchpad ?? "—"}</Badge></TableCell>
                    <TableCell>{r.is_graduated ? "✅" : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.graduated_at ? new Date(r.graduated_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell><MintCell mint={r.creator_wallet ?? ""} /></TableCell>
                    <TableCell><ArrayCell arr={r.dev_wallets} /></TableCell>
                    <TableCell>{r.kyc_verified ? "✅" : "—"}</TableCell>
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
                    <TableCell><ArrayCell arr={r.x_community_urls} /></TableCell>
                    <TableCell><ArrayCell arr={r.x_community_names} /></TableCell>
                    <TableCell><ArrayCell arr={r.community_admin_handles} /></TableCell>
                    <TableCell><ArrayCell arr={r.community_mod_handles} /></TableCell>
                    <TableCell><ArrayCell arr={r.mesh_x_handles} /></TableCell>
                    <TableCell><ArrayCell arr={r.websites} /></TableCell>
                    <TableCell className="text-muted-foreground">{r.ath_24h_usd != null ? `$${Number(r.ath_24h_usd).toFixed(6)}` : "—"}</TableCell>
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
  );
}
