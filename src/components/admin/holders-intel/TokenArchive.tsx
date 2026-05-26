import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { HoldersIntelTweetCard, type ArchiveRow } from "./HoldersIntelTweetCard";

const PAGE_SIZES = [50, 100, 250, 500] as const;
type PageSize = (typeof PAGE_SIZES)[number];

const ARCHIVE_COLUMNS =
  "id, token_mint, symbol, name, market_cap, created_at, trigger_source, tweet_text, tweet_composed_at, ai_snippet, health_grade, health_score, health_label, real_holders, total_wallets, whales_count, serious_count, retail_count, dust_count, dust_pct, snapshot_label, hashtags_line, banner_used_url, dex_banner_url, decorated_banner_url, manual_status, manual_posted_at, manual_tweet_url, posted_handle";

export function TokenArchive() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0); // zero-based
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [triggerFilter, setTriggerFilter] = useState<string>("all");
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillOffset, setBackfillOffset] = useState<number | null>(null);
  const [backfillLog, setBackfillLog] = useState<Array<{
    ts: string; mode: string; summary: string; nextOffsetId: number | null;
  }>>([]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("holders_intel_post_queue")
        .select(ARCHIVE_COLUMNS, { count: "exact" })
        .not("tweet_text", "is", null)
        .order("manual_posted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (triggerFilter !== "all") q = q.eq("trigger_source", triggerFilter);

      if (search.trim()) {
        const s = search.trim();
        // exact mint match OR ILIKE on symbol/name/mint
        q = q.or(
          `token_mint.ilike.%${s}%,symbol.ilike.%${s}%,name.ilike.%${s}%`
        );
      }

      const { data, error, count } = await q;
      if (error) throw error;
      setRows((data || []) as ArchiveRow[]);
      setTotal(count || 0);
    } catch (e: any) {
      toast({ title: "Failed to load archive", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, triggerFilter, toast]);

  useEffect(() => { load(); }, [load]);

  // Reset to first page when filters change
  useEffect(() => { setPage(0); }, [pageSize, search, triggerFilter]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const pageLabel = useMemo(
    () => `Page ${page + 1} of ${totalPages}`,
    [page, totalPages]
  );

  async function runBackfill(dryRun: boolean) {
    setBackfillBusy(true);
    try {
      const mode = dryRun ? "dryrun" : "apply";
      const { data, error } = await supabase.functions.invoke("backfill-archive-from-tg", {
        body: {
          mode,
          pages: 5,
          pageSize: 100,
          offsetId: backfillOffset ?? undefined,
        },
      });
      if (error) throw error;
      const d: any = data || {};
      setBackfillOffset(d.nextOffsetId ?? null);
      const summary = `scanned ${d.msgsScanned ?? 0} · proposals ${d.proposals ?? 0} · written ${d.proposalsWritten ?? 0} · skip noMint=${d.skippedNoMint ?? 0} noMatch=${d.skippedNoMatch ?? 0} noStats=${d.skippedNoStats ?? 0} dup=${d.skippedDuplicate ?? 0}`;
      sonnerToast.success(`TG backfill (${mode})`, {
        description: summary + ` · nextOffset=${d.nextOffsetId ?? "—"}`,
        duration: 20000,
      });
      setBackfillLog((prev) => [
        { ts: new Date().toLocaleTimeString(), mode, summary, nextOffsetId: d.nextOffsetId ?? null },
        ...prev,
      ].slice(0, 10));
    } catch (e: any) {
      sonnerToast.error("Backfill failed", { description: e?.message || String(e), duration: 20000 });
      setBackfillLog((prev) => [
        { ts: new Date().toLocaleTimeString(), mode: dryRun ? "dryrun" : "apply", summary: `ERROR: ${e?.message || e}`, nextOffsetId: null },
        ...prev,
      ].slice(0, 10));
    } finally {
      setBackfillBusy(false);
    }
  }

  async function runSample() {
    setBackfillBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("backfill-archive-from-tg", {
        body: { mode: "sample", sampleN: 5, offsetId: backfillOffset ?? undefined },
      });
      if (error) throw error;
      const d: any = data || {};
      const lines = (d.samples || []).map((s: any) =>
        `#${s.messageId} (${s.date}) mint=${s.mintFound ?? "—"}\n${(s.rawText || "").slice(0, 400)}`
      ).join("\n\n---\n\n");
      sonnerToast.message("TG sample", {
        description: `Fetched ${(d.samples || []).length} raw messages — see Backfill Log for full text`,
        duration: 20000,
      });
      setBackfillLog((prev) => [
        { ts: new Date().toLocaleTimeString(), mode: "sample", summary: lines || "(no text)", nextOffsetId: d.nextOffsetId ?? null },
        ...prev,
      ].slice(0, 10));
    } catch (e: any) {
      sonnerToast.error("Sample failed", { description: e?.message || String(e), duration: 20000 });
    } finally {
      setBackfillBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">📚 Token Archive</h2>
          <p className="text-sm text-muted-foreground">
            Every Manual X post we&apos;ve published, rendered as it appeared on @HoldersIntel. Newest first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-500/20 text-green-400">
            {total.toLocaleString()} archived
          </Badge>
          <Button onClick={runSample} size="sm" variant="ghost" disabled={backfillBusy}>
            TG Sample
          </Button>
          <Button onClick={() => runBackfill(true)} size="sm" variant="outline" disabled={backfillBusy}>
            {backfillBusy ? "Working…" : "TG Dry-run → Queue"}
          </Button>
          {backfillOffset != null && (
            <Badge variant="outline" className="text-xs">
              next offset: {backfillOffset}
              <button
                className="ml-2 underline opacity-70 hover:opacity-100"
                onClick={() => setBackfillOffset(null)}
                type="button"
              >
                reset
              </button>
            </Badge>
          )}
          <Button onClick={load} size="sm" variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {backfillLog.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-2 text-xs space-y-1 max-h-64 overflow-auto">
          <div className="font-semibold flex items-center justify-between">
            <span>Backfill Log (last {backfillLog.length})</span>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setBackfillLog([])}>clear</button>
          </div>
          {backfillLog.map((l, i) => (
            <details key={i} className="font-mono">
              <summary className="cursor-pointer">
                [{l.ts}] {l.mode} · nextOffset={l.nextOffsetId ?? "—"}
              </summary>
              <pre className="whitespace-pre-wrap break-words mt-1 pl-3 text-[11px] opacity-90">{l.summary}</pre>
            </details>
          ))}
        </div>
      )}

      <Tabs defaultValue="archive">
        <TabsList>
          <TabsTrigger value="archive">Archive</TabsTrigger>
        </TabsList>

        <TabsContent value="archive" className="space-y-4 mt-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={onSearch} className="flex items-center gap-1">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search mint, symbol or name…"
              className="pl-7 w-72"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">Search</Button>
          {search && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setSearchInput(""); setSearch(""); }}
            >
              Clear
            </Button>
          )}
        </form>

        <Select value={triggerFilter} onValueChange={setTriggerFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Trigger source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="allstar">allstar</SelectItem>
            <SelectItem value="dex-top">dex-top</SelectItem>
            <SelectItem value="manual">manual</SelectItem>
            <SelectItem value="bot-dm">bot-dm</SelectItem>
            <SelectItem value="bubblemap_query">bubblemap_query</SelectItem>
            <SelectItem value="public_query">public_query</SelectItem>
            <SelectItem value="holders_input">holders_input</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-muted-foreground">Per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v) as PageSize)}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pagination top */}
      <Pagination
        page={page}
        totalPages={totalPages}
        pageLabel={pageLabel}
        onChange={setPage}
        disabled={loading}
      />

      {/* Grid */}
      {loading && rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Loading archive…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No archived posts match your filters yet. Manual posts marked as posted will show up here.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((row) => (
            <HoldersIntelTweetCard key={row.id} row={row} />
          ))}
        </div>
      )}

      {/* Pagination bottom */}
      <Pagination
        page={page}
        totalPages={totalPages}
        pageLabel={pageLabel}
        onChange={setPage}
        disabled={loading}
      />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  pageLabel,
  onChange,
  disabled,
}: {
  page: number;
  totalPages: number;
  pageLabel: string;
  onChange: (p: number) => void;
  disabled?: boolean;
}) {
  const atFirst = page <= 0;
  const atLast = page >= totalPages - 1;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs text-muted-foreground">{pageLabel}</div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={disabled || atFirst} onClick={() => onChange(0)}>
          <ChevronFirst className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" disabled={disabled || atFirst} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <Button size="sm" variant="outline" disabled={disabled || atLast} onClick={() => onChange(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" disabled={disabled || atLast} onClick={() => onChange(totalPages - 1)}>
          <ChevronLast className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}