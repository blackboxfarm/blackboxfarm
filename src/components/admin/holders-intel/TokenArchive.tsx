import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let q = supabase
        .from("holders_intel_post_queue")
        .select(ARCHIVE_COLUMNS, { count: "exact" })
        .eq("manual_status", "posted_manual")
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
          <Button onClick={load} size="sm" variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

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