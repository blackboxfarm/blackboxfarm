import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, RefreshCw, SkipForward, Check, Wand2, Skull, Sparkles, Download, RotateCw, Trash2, ChevronLeft, ChevronRight, ChevronFirst, ChevronLast, Search, Archive } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sanitizeForTwitter } from "@/lib/twitterSanitizer";

interface QueueRow {
  id: string;
  token_mint: string;
  symbol: string | null;
  name: string | null;
  market_cap: number | null;
  trigger_source: string | null;
  created_at: string;
  tweet_text: string | null;
  manual_status: string;
  manual_posted_at: string | null;
  manual_tweet_url: string | null;
  autopsy_slug?: string | null;
  autopsy_url?: string | null;
  autopsy_hero_image?: string | null;
  dex_banner_url?: string | null;
  decorated_banner_url?: string | null;
  decoration_theme?: string | null;
}

const X_INTENT_URL = "https://x.com/intent/post";

function shortMint(m: string) {
  return `${m.slice(0, 6)}…${m.slice(-4)}`;
}

function fmtMcap(n: number | null) {
  if (n == null) return "—";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

// Rough X char count: URLs (any http/https) count as 23 regardless of length.
function tweetCharCount(text: string): number {
  if (!text) return 0;
  const urlRe = /https?:\/\/\S+/g;
  const urls = text.match(urlRe) || [];
  let stripped = text.replace(urlRe, "");
  return Array.from(stripped).length + urls.length * 23;
}

export function ManualXPostingQueue() {
  const { toast } = useToast();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [history, setHistory] = useState<QueueRow[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(50);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pastedUrl, setPastedUrl] = useState<Record<string, string>>({});
  const [skipReason, setSkipReason] = useState<Record<string, string>>({});
  const [skipOpen, setSkipOpen] = useState<string | null>(null);
  const [composing, setComposing] = useState<Record<string, boolean>>({});
  const [autoComposed, setAutoComposed] = useState(false);
  const [autopsying, setAutopsying] = useState<Record<string, boolean>>({});
  const [decorating, setDecorating] = useState<Record<string, boolean>>({});
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({});
  const [manualMint, setManualMint] = useState("");
  const [adding, setAdding] = useState(false);
  const [snapshots, setSnapshots] = useState<Record<string, {
    mcap: number | null;
    vol1h: number | null;
    vol24h: number | null;
    priceUsd: number | null;
    liquidityUsd: number | null;
    boosts: number | null;
    pairAgeHours: number | null;
    at: number;
  }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let pendingQ = supabase
      .from("holders_intel_post_queue")
      .select(
        "id, token_mint, symbol, name, market_cap, trigger_source, created_at, tweet_text, manual_status, manual_posted_at, manual_tweet_url, autopsy_slug, autopsy_url, autopsy_hero_image, dex_banner_url, decorated_banner_url, decoration_theme",
        { count: "estimated" }
      )
      .eq("manual_status", "pending")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search.trim()) {
      const s = search.trim();
      pendingQ = pendingQ.or(
        `token_mint.ilike.%${s}%,symbol.ilike.%${s}%,name.ilike.%${s}%`
      );
    }

    const [pendingRes, historyRes] = await Promise.all([
      pendingQ,
      supabase
        .from("holders_intel_post_queue")
        .select("id, token_mint, symbol, name, market_cap, trigger_source, created_at, tweet_text, manual_status, manual_posted_at, manual_tweet_url, autopsy_slug, autopsy_url, autopsy_hero_image, dex_banner_url, decorated_banner_url, decoration_theme")
        .in("manual_status", ["posted_manual", "skipped_manual"])
        .order("manual_posted_at", { ascending: false })
        .limit(50),
    ]);

    if (pendingRes.error) {
      toast({ title: "Failed to load queue", description: pendingRes.error.message, variant: "destructive" });
    } else {
      setRows((pendingRes.data || []) as QueueRow[]);
      setPendingTotal(pendingRes.count || 0);
    }
    if (!historyRes.error) {
      setHistory((historyRes.data || []) as QueueRow[]);
    }
    setLoading(false);
  }, [toast, page, pageSize, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [pageSize, search]);
  useEffect(() => {
    if (!autoRefresh) return;
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, [autoRefresh, load]);

  const composeOne = useCallback(async (id: string): Promise<boolean> => {
    setComposing((p) => ({ ...p, [id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("holders-intel-compose-preview", {
        body: { queue_id: id },
      });
      if (error) throw error;
      const r = (data as any)?.results?.[0];
      if (!r?.ok) throw new Error(r?.error || "compose failed");
      return true;
    } catch (e: any) {
      toast({ title: "Compose failed", description: e?.message || String(e), variant: "destructive" });
      return false;
    } finally {
      setComposing((p) => { const c = { ...p }; delete c[id]; return c; });
    }
  }, [toast]);

  const composeMissing = useCallback(async () => {
    const missing = rows.filter((r) => !r.tweet_text).map((r) => r.id);
    if (missing.length === 0) return;
    toast({ title: `Composing ${missing.length} tweet${missing.length === 1 ? "" : "s"}…` });
    try {
      const { data, error } = await supabase.functions.invoke("holders-intel-compose-preview", {
        body: { queue_ids: missing },
      });
      if (error) throw error;
      const okCount = ((data as any)?.results || []).filter((r: any) => r.ok).length;
      toast({ title: `Composed ${okCount}/${missing.length}` });
    } catch (e: any) {
      toast({ title: "Bulk compose failed", description: e?.message || String(e), variant: "destructive" });
    }
    load();
  }, [rows, toast, load]);

  const runAutopsy = useCallback(async (id: string) => {
    setAutopsying((p) => ({ ...p, [id]: true }));
    toast({ title: "⚰️ Generating autopsy…", description: "Full pipeline + banner — 30-60s." });
    try {
      const { data, error } = await supabase.functions.invoke("holders-intel-autopsy-now", {
        body: { queue_id: id },
      });
      if (error) throw error;
      const d = data as any;
      if (!d?.success) throw new Error(d?.error || "autopsy failed");
      toast({
        title: "Autopsy published",
        description: `Tweet updated with ${d.autopsy_url}${d.warning ? ` (warn: ${d.warning})` : ""}`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Autopsy failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setAutopsying((p) => { const c = { ...p }; delete c[id]; return c; });
    }
  }, [toast, load]);

  const decorateBanner = useCallback(async (id: string, regenerate = false) => {
    setDecorating((p) => ({ ...p, [id]: true }));
    toast({ title: "🎨 Decorating banner…", description: "AI overlay — 15-30s." });
    try {
      const { data, error } = await supabase.functions.invoke("holders-intel-banner-decorate", {
        body: { queue_id: id, regenerate },
      });
      if (error) throw error;
      const d = data as any;
      if (!d?.success && !d?.decorated_banner_url) throw new Error(d?.error || "decorate failed");
      toast({
        title: d?.skipped === "already_decorated" ? "Already decorated" : "Banner decorated",
        description: d?.theme_label || d?.decoration_theme || "ok",
      });
      await load();
    } catch (e: any) {
      toast({ title: "Decorate failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setDecorating((p) => { const c = { ...p }; delete c[id]; return c; });
    }
  }, [toast, load]);

  const deleteDecoratedBanner = useCallback(async (id: string) => {
    if (!confirm("Delete the decorated banner? You can re-decorate after.")) return;
    setDecorating((p) => ({ ...p, [id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("holders-intel-banner-decorate", {
        body: { queue_id: id, action: "delete" },
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || "delete failed");
      toast({ title: "Decorated banner deleted" });
      await load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setDecorating((p) => { const c = { ...p }; delete c[id]; return c; });
    }
  }, [toast, load]);

  const regeneratePost = useCallback(async (id: string) => {
    setRegenerating((p) => ({ ...p, [id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("holders-intel-compose-preview", {
        body: { queue_id: id, force_refresh: true },
      });
      if (error) throw error;
      const r = (data as any)?.results?.[0];
      if (!r?.ok) throw new Error(r?.error || "regenerate failed");
      if (r.snapshot) {
        setSnapshots((p) => ({ ...p, [id]: { ...r.snapshot, at: Date.now() } }));
      }
      const snap = r.snapshot || {};
      const mcapStr = snap.mcap != null ? fmtMcap(snap.mcap) : "—";
      const volStr = snap.vol1h != null ? fmtMcap(snap.vol1h) : "—";
      const liqStr = snap.liquidityUsd != null ? fmtMcap(snap.liquidityUsd) : "—";
      const rankStr = snap.boosts != null ? `boost×${snap.boosts}` : "no boost";
      toast({
        title: "Post regenerated",
        description: `Fresh: MC ${mcapStr} · 1h Vol ${volStr} · Liq ${liqStr} · ${rankStr}`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Regenerate failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setRegenerating((p) => { const c = { ...p }; delete c[id]; return c; });
    }
  }, [toast, load]);

  // Auto-compose any missing on first load (one shot)
  useEffect(() => {
    if (loading || autoComposed || rows.length === 0) return;
    const missing = rows.filter((r) => !r.tweet_text);
    if (missing.length === 0) { setAutoComposed(true); return; }
    setAutoComposed(true);
    composeMissing();
  }, [loading, rows, autoComposed, composeMissing]);

  const copyText = async (text: string) => {
    const clean = sanitizeForTwitter(text);
    try {
      await navigator.clipboard.writeText(clean);
      toast({ title: "Copied", description: "Tweet text copied to clipboard." });
    } catch (e: any) {
      toast({ title: "Copy failed", description: e?.message || "Clipboard blocked", variant: "destructive" });
    }
  };

  // Cross-origin <a download> is ignored by browsers — fetch as blob and force download.
  const downloadFile = async (url: string, filename: string) => {
    const proxyUrl = `https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/proxy-image-download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    const triggerBlobDownload = (blob: Blob, name: string) => {
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    };
    // Try proxy first (handles CORS + forces attachment + jpeg)
    try {
      const res = await fetch(proxyUrl, { cache: "no-store" });
      const ctype = res.headers.get("content-type") || "";
      if (res.ok && !ctype.includes("application/json")) {
        const blob = await res.blob();
        const cd = res.headers.get("content-disposition") || "";
        const m = cd.match(/filename="([^"]+)"/i);
        triggerBlobDownload(blob, m?.[1] || filename);
        return;
      }
    } catch { /* fall through */ }
    // Fallback: direct CORS fetch (some CDNs allow it)
    try {
      const res = await fetch(url, { mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      triggerBlobDownload(blob, filename);
      return;
    } catch (e: any) {
      toast({
        title: "Download failed",
        description: e?.message || "Could not fetch image. Right-click the preview to save.",
        variant: "destructive",
      });
    }
  };

  const markPosted = async (row: QueueRow) => {
    const url = (pastedUrl[row.id] || "").trim();
    const { data: userRes } = await supabase.auth.getUser();
    // Free the unique-archived-mint slot: demote any prior posted_manual row
    // for the same token_mint so the partial unique index doesn't collide.
    const { error: demoteErr } = await supabase
      .from("holders_intel_post_queue")
      .update({ manual_status: "posted_manual_superseded" })
      .eq("token_mint", row.token_mint)
      .eq("manual_status", "posted_manual")
      .neq("id", row.id);
    if (demoteErr) {
      toast({ title: "Update failed", description: demoteErr.message, variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("holders_intel_post_queue")
      .update({
        manual_status: "posted_manual",
        manual_posted_at: new Date().toISOString(),
        manual_tweet_url: url || null,
        manual_posted_by: userRes?.user?.id || null,
      })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Marked as posted", description: `$${row.symbol || shortMint(row.token_mint)} ✓` });
    setConfirmingId(null);
    setPastedUrl((p) => { const c = { ...p }; delete c[row.id]; return c; });
    load();
  };

  const markSkipped = async (row: QueueRow) => {
    const reason = (skipReason[row.id] || "").trim();
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("holders_intel_post_queue")
      .update({
        manual_status: "skipped_manual",
        manual_posted_at: new Date().toISOString(),
        manual_skip_reason: reason || null,
        manual_posted_by: userRes?.user?.id || null,
      })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Skipped", description: `$${row.symbol || shortMint(row.token_mint)}` });
    setSkipOpen(null);
    setSkipReason((p) => { const c = { ...p }; delete c[row.id]; return c; });
    load();
  };

  const todayCounts = useMemo(() => {
    const today = new Date().toDateString();
    let posted = 0, skipped = 0;
    history.forEach((h) => {
      if (h.manual_posted_at && new Date(h.manual_posted_at).toDateString() === today) {
        if (h.manual_status === "posted_manual") posted++;
        else if (h.manual_status === "skipped_manual") skipped++;
      }
    });
    return { posted, skipped };
  }, [history]);

  const addManualToken = useCallback(async () => {
    const mint = manualMint.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
      toast({ title: "Invalid mint", description: "Paste a valid Solana token address.", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      // If already in queue, just (re)compose
      const { data: existing } = await supabase
        .from("holders_intel_post_queue")
        .select("id, manual_status, tweet_text")
        .eq("token_mint", mint)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let id = existing?.id as string | undefined;
      if (existing && existing.manual_status === "pending") {
        toast({ title: "Already pending", description: "Token is already in the queue. Recomposing…" });
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const { data: inserted, error } = await supabase
          .from("holders_intel_post_queue")
          .insert({
            token_mint: mint,
            scheduled_at: new Date().toISOString(),
            status: "pending",
            manual_status: "pending",
            trigger_source: "manual_admin",
            trigger_comment: userRes?.user?.email || "manual add",
          })
          .select("id")
          .single();
        if (error) throw error;
        id = inserted!.id;
        toast({ title: "Added to queue", description: "Composing tweet…" });
      }
      if (id) await composeOne(id);
      setManualMint("");
      await load();
    } catch (e: any) {
      toast({ title: "Add failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }, [manualMint, toast, composeOne, load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">📮 Manual X Posting Queue</h2>
          <p className="text-sm text-muted-foreground">
            Review composed tweets, copy, post manually on X, then mark as posted. Telegram fork is unaffected.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400">
            {pendingTotal.toLocaleString()} pending
          </Badge>
          <Badge variant="outline" className="bg-green-500/20 text-green-400">{todayCounts.posted} posted today</Badge>
          <Badge variant="outline" className="bg-muted text-muted-foreground">{todayCounts.skipped} skipped today</Badge>
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <Button onClick={load} size="sm" variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={composeMissing} size="sm" variant="default" disabled={loading || rows.every((r) => !!r.tweet_text)}>
            <Wand2 className="h-4 w-4 mr-1" /> Compose all missing
          </Button>
          <Button
            onClick={async () => {
              if (!confirm(`Post ${Math.min(pendingTotal, 50)} pending tokens to the Archive page (fetch banner + decorate + publish)?`)) return;
              setLoading(true);
              const { data, error } = await supabase.functions.invoke("holders-intel-archive-batch", {
                body: { limit: 50, concurrency: 3 },
              });
              setLoading(false);
              if (error) {
                toast({ title: "Batch archive failed", description: error.message, variant: "destructive" });
              } else {
                toast({ title: "Batch archive complete", description: `${data?.ok || 0} posted, ${data?.failed || 0} failed` });
                load();
              }
            }}
            size="sm"
            variant="default"
            disabled={loading || pendingTotal === 0}
          >
            <Archive className="h-4 w-4 mr-1" /> Post 50 to Archive
          </Button>
        </div>
      </div>

      {/* Search + pagination controls */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); addManualToken(); }}
          className="flex items-center gap-1"
        >
          <Input
            value={manualMint}
            onChange={(e) => setManualMint(e.target.value)}
            placeholder="Paste token mint to add manually…"
            className="w-80 h-8"
          />
          <Button type="submit" size="sm" variant="default" disabled={adding || !manualMint.trim()}>
            {adding ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
            Add & Compose
          </Button>
        </form>

        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }}
          className="flex items-center gap-1"
        >
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search mint, symbol or name…"
              className="pl-7 w-72 h-8"
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

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-muted-foreground">Per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="w-20 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="250">250</SelectItem>
              <SelectItem value="500">500</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-2">
            Page {page + 1} of {Math.max(1, Math.ceil(pendingTotal / pageSize))}
          </span>
          <Button size="sm" variant="outline" disabled={loading || page === 0} onClick={() => setPage(0)}>
            <ChevronFirst className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" disabled={loading || page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || page >= Math.ceil(pendingTotal / pageSize) - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || page >= Math.ceil(pendingTotal / pageSize) - 1}
            onClick={() => setPage(Math.max(0, Math.ceil(pendingTotal / pageSize) - 1))}
          >
            <ChevronLast className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">Loading queue…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No pending tokens awaiting manual X posting.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const charCount = tweetCharCount(row.tweet_text || "");
            const composed = !!row.tweet_text;
            const hasAutopsy = !!row.autopsy_slug;
            const isAutopsying = !!autopsying[row.id];
            return (
              <div key={row.id} className="rounded-lg border border-border/50 bg-card/50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-base">${row.symbol || "?"}</span>
                    {row.name && row.name !== row.symbol && (
                      <span className="text-sm text-muted-foreground">{row.name}</span>
                    )}
                    <a
                      href={`https://dexscreener.com/solana/${row.token_mint}`}
                      target="_blank" rel="noopener noreferrer"
                      className="font-mono text-xs text-muted-foreground hover:text-primary"
                    >
                      {shortMint(row.token_mint)}
                    </a>
                    <Badge variant="outline" className="text-xs">{fmtMcap(row.market_cap)}</Badge>
                    {row.trigger_source && (
                      <Badge variant="outline" className="text-xs">{row.trigger_source}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{timeAgo(row.created_at)}</span>
                    {hasAutopsy && (
                      <Badge variant="outline" className="text-xs bg-destructive/20 text-destructive border-destructive/40">
                        ⚰️ autopsy published
                      </Badge>
                    )}
                  </div>
                </div>

                {composed ? (
                  <>
                    {(row.dex_banner_url || row.decorated_banner_url) && (
                      <div className="flex flex-wrap items-start gap-3">
                        {row.dex_banner_url && (
                          <div className="space-y-1">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">DexScreener banner</div>
                            <a href={row.dex_banner_url} target="_blank" rel="noopener noreferrer">
                              <img src={row.dex_banner_url} alt="DexScreener banner" className="h-24 w-auto rounded border border-border/50 object-cover" />
                            </a>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => copyText(row.dex_banner_url!)}>
                                <Copy className="h-3 w-3 mr-1" /> Copy URL
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2"
                                onClick={() => downloadFile(row.dex_banner_url!, `${(row.symbol || 'token').toLowerCase()}-dex-banner.jpg`)}
                              >
                                <Download className="h-3 w-3 mr-1" /> Download
                              </Button>
                            </div>
                          </div>
                        )}
                        {row.decorated_banner_url && (
                          <div className="space-y-1">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              Decorated{row.decoration_theme ? ` · ${row.decoration_theme}` : ""}
                            </div>
                            <a href={row.decorated_banner_url} target="_blank" rel="noopener noreferrer">
                              <img src={row.decorated_banner_url} alt="Decorated banner" className="h-24 w-auto rounded border border-primary/40 object-cover" />
                            </a>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => copyText(row.decorated_banner_url!)}>
                                <Copy className="h-3 w-3 mr-1" /> Copy URL
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2"
                                onClick={() => downloadFile(row.decorated_banner_url!, `${(row.symbol || 'token').toLowerCase()}-decorated-banner.jpg`)}
                              >
                                <Download className="h-3 w-3 mr-1" /> Download
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                                onClick={() => deleteDecoratedBanner(row.id)}
                                disabled={!!decorating[row.id]}
                                title="Delete the decorated banner"
                              >
                                <Trash2 className="h-3 w-3 mr-1" /> Delete
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className={`rounded-md border bg-background/50 p-3 ${hasAutopsy ? "border-destructive/40" : "border-border/50"}`}>
                      <pre className="whitespace-pre-wrap font-mono text-sm break-words">{sanitizeForTwitter(row.tweet_text || "")}</pre>
                    </div>
                    {hasAutopsy && (
                      <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-2">
                        {row.autopsy_hero_image && (
                          <a href={row.autopsy_url || `/autopsy/${row.autopsy_slug}`} target="_blank" rel="noopener noreferrer">
                            <img
                              src={row.autopsy_hero_image}
                              alt="Autopsy banner"
                              className="h-16 w-auto rounded border border-border/50 object-cover"
                            />
                          </a>
                        )}
                        <div className="flex-1 min-w-0 text-xs">
                          <div className="font-medium text-destructive">Forensic autopsy</div>
                          <a
                            href={row.autopsy_url || `/autopsy/${row.autopsy_slug}`}
                            target="_blank" rel="noopener noreferrer"
                            className="underline text-primary break-all"
                          >
                            {row.autopsy_url || `/autopsy/${row.autopsy_slug}`} ↗
                          </a>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {charCount} chars (Premium · long-form OK)
                        </span>
                        {snapshots[row.id] && (
                          <span
                            className="text-xs font-mono px-2 py-0.5 rounded border border-primary/30 bg-primary/5 text-primary"
                            title={`Live DexScreener snapshot taken ${new Date(snapshots[row.id].at).toLocaleTimeString()} — for your posting decision only, not in tweet text`}
                          >
                            📡 MC {snapshots[row.id].mcap != null ? fmtMcap(snapshots[row.id].mcap) : "—"}
                            {" · "}1h {snapshots[row.id].vol1h != null ? fmtMcap(snapshots[row.id].vol1h) : "—"}
                            {" · "}24h {snapshots[row.id].vol24h != null ? fmtMcap(snapshots[row.id].vol24h) : "—"}
                            {" · "}Liq {snapshots[row.id].liquidityUsd != null ? fmtMcap(snapshots[row.id].liquidityUsd) : "—"}
                            {" · "}{snapshots[row.id].boosts != null ? `🚀×${snapshots[row.id].boosts}` : "no boost"}
                            {snapshots[row.id].pairAgeHours != null ? ` · ${snapshots[row.id].pairAgeHours}h old` : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" asChild title="Open DexScreener page in new tab to verify life status">
                          <a
                            href={`https://dexscreener.com/solana/${row.token_mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" /> DexScreener
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => regeneratePost(row.id)}
                          disabled={!!regenerating[row.id]}
                          title="Re-pull fresh holder data and rebuild this tweet"
                        >
                          <RotateCw className={`h-4 w-4 mr-1 ${regenerating[row.id] ? "animate-spin" : ""}`} />
                          {regenerating[row.id] ? "Regenerating…" : "♻️ Regenerate"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => decorateBanner(row.id, !!row.decorated_banner_url)}
                          disabled={!!decorating[row.id]}
                          title="AI-decorate the DexScreener banner with a Featured / Trending / HOT theme"
                        >
                          <Sparkles className={`h-4 w-4 mr-1 ${decorating[row.id] ? "animate-pulse" : ""}`} />
                          {decorating[row.id] ? "Decorating…" : row.decorated_banner_url ? "Re-decorate" : "Decorate Banner"}
                        </Button>
                        <Button
                          size="sm"
                          variant={hasAutopsy ? "outline" : "destructive"}
                          onClick={() => runAutopsy(row.id)}
                          disabled={isAutopsying}
                          title="Run full Autopsy pipeline and append link to tweet"
                        >
                          <Skull className={`h-4 w-4 mr-1 ${isAutopsying ? "animate-pulse" : ""}`} />
                          {isAutopsying ? "Generating…" : hasAutopsy ? "Re-run Autopsy" : "Autopsy Now"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copyText(row.tweet_text!)}>
                          <Copy className="h-4 w-4 mr-1" /> Copy text
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={X_INTENT_URL} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" /> Open X
                          </a>
                        </Button>
                      </div>
                    </div>

                    <div className="border-t border-border/50 pt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`done-${row.id}`}
                          checked={confirmingId === row.id}
                          onCheckedChange={(v) => setConfirmingId(v ? row.id : null)}
                        />
                        <label htmlFor={`done-${row.id}`} className="text-sm cursor-pointer">
                          Mark as posted manually
                        </label>
                        <button
                          className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                          onClick={() => markSkipped(row)}
                        >
                          <SkipForward className="h-3 w-3" /> Skip
                        </button>
                      </div>

                      {confirmingId === row.id && (
                        <div className="flex flex-wrap items-center gap-2 pl-6">
                          <Input
                            placeholder="Optional: paste posted tweet URL"
                            value={pastedUrl[row.id] || ""}
                            onChange={(e) => setPastedUrl((p) => ({ ...p, [row.id]: e.target.value }))}
                            className="flex-1 min-w-[260px] h-8 text-xs"
                          />
                          <Button size="sm" onClick={() => markPosted(row)}>
                            <Check className="h-4 w-4 mr-1" /> Confirm posted
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border border-dashed border-border/50 bg-background/30 p-3 flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      Tweet text not yet composed.
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={async () => { const ok = await composeOne(row.id); if (ok) load(); }}
                        disabled={!!composing[row.id]}
                      >
                        <Wand2 className={`h-4 w-4 mr-1 ${composing[row.id] ? "animate-spin" : ""}`} />
                        {composing[row.id] ? "Composing…" : "Generate now"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => runAutopsy(row.id)}
                        disabled={isAutopsying}
                      >
                        <Skull className={`h-4 w-4 mr-1 ${isAutopsying ? "animate-pulse" : ""}`} />
                        {isAutopsying ? "Generating…" : "Autopsy Now"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-border/50 pt-4">
        <button
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setShowHistory((s) => !s)}
        >
          {showHistory ? "Hide" : "Show"} history ({history.length})
        </button>
        {showHistory && (
          <div className="mt-3 space-y-2 max-h-[400px] overflow-auto">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 text-xs border border-border/30 rounded px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">${h.symbol || shortMint(h.token_mint)}</span>
                  <Badge
                    variant="outline"
                    className={`text-xs ${h.manual_status === "posted_manual" ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}
                  >
                    {h.manual_status === "posted_manual" ? "posted" : "skipped"}
                  </Badge>
                  {h.manual_tweet_url && (
                    <a href={h.manual_tweet_url} target="_blank" rel="noopener noreferrer" className="underline text-primary">
                      tweet ↗
                    </a>
                  )}
                </div>
                <span className="text-muted-foreground">
                  {h.manual_posted_at && timeAgo(h.manual_posted_at)}
                </span>
              </div>
            ))}
            {history.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">No history yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ManualXPostingQueue;