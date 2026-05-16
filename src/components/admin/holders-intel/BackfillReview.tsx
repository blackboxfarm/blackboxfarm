import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Check, RefreshCw, Undo2, X, ArrowRight } from "lucide-react";
import { HoldersIntelTweetCard, ArchiveRow } from "./HoldersIntelTweetCard";

type ProposalStatus = "pending" | "accepted" | "rejected" | "applied" | "reverted";

type Proposal = {
  id: string;
  archive_id: string;
  token_mint: string;
  tg_message_id: number;
  tg_message_date: string;
  tg_raw_text: string | null;
  match_diff_hours: number | null;
  before_json: Record<string, any>;
  after_json: Record<string, any>;
  patch_json: Record<string, any>;
  status: ProposalStatus;
  applied_at: string | null;
  reverted_at: string | null;
  reviewer_feedback: string | null;
  created_at: string;
};

const TRACKED_FIELDS = [
  "real_holders", "total_wallets", "whales_count", "serious_count",
  "retail_count", "dust_count", "dust_pct", "health_grade",
  "health_score", "ai_snippet", "manual_posted_at",
] as const;

const BATCH_SIZE = 5;

function buildRow(p: Proposal, which: "before" | "after"): ArchiveRow {
  const base = (p.before_json || {}) as Record<string, any>;
  const overlay = which === "after" ? (p.after_json || {}) : {};
  const merged: any = { ...base, ...overlay };
  return {
    id: p.archive_id,
    token_mint: p.token_mint,
    symbol: merged.symbol ?? null,
    name: merged.name ?? null,
    market_cap: merged.market_cap ?? null,
    created_at: merged.created_at ?? p.created_at,
    trigger_source: merged.trigger_source ?? "tg-backfill",
    tweet_text: merged.tweet_text ?? null,
    tweet_composed_at: merged.tweet_composed_at ?? null,
    ai_snippet: merged.ai_snippet ?? null,
    health_grade: merged.health_grade ?? null,
    health_score: merged.health_score ?? null,
    health_label: merged.health_label ?? null,
    real_holders: merged.real_holders ?? null,
    total_wallets: merged.total_wallets ?? null,
    whales_count: merged.whales_count ?? null,
    serious_count: merged.serious_count ?? null,
    retail_count: merged.retail_count ?? null,
    dust_count: merged.dust_count ?? null,
    dust_pct: merged.dust_pct ?? null,
    snapshot_label: merged.snapshot_label ?? null,
    hashtags_line: merged.hashtags_line ?? null,
    banner_used_url: merged.banner_used_url ?? null,
    dex_banner_url: merged.dex_banner_url ?? null,
    decorated_banner_url: merged.decorated_banner_url ?? null,
    manual_status: merged.manual_status ?? "posted_manual",
    manual_posted_at: merged.manual_posted_at ?? p.tg_message_date,
    manual_tweet_url: merged.manual_tweet_url ?? null,
    posted_handle: merged.posted_handle ?? "HoldersIntel",
  };
}

function changedFields(p: Proposal): string[] {
  const out: string[] = [];
  for (const k of TRACKED_FIELDS) {
    const b = p.before_json?.[k] ?? null;
    const a = p.after_json?.[k] ?? null;
    if (JSON.stringify(b) !== JSON.stringify(a) && a != null) out.push(k);
  }
  return out;
}

export function BackfillReview() {
  const [batch, setBatch] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [counts, setCounts] = useState({ pending: 0, accepted: 0, rejected: 0, applied: 0, reverted: 0 });
  const [decisions, setDecisions] = useState<Record<string, { status: "accepted" | "rejected"; feedback: string }>>({});

  const loadCounts = useCallback(async () => {
    const keys: ProposalStatus[] = ["pending", "accepted", "rejected", "applied", "reverted"];
    const next: any = {};
    await Promise.all(keys.map(async (s) => {
      const { count } = await supabase
        .from("holders_intel_backfill_proposals")
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      next[s] = count || 0;
    }));
    setCounts(next);
  }, []);

  const loadBatch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("holders_intel_backfill_proposals")
        .select("*")
        .eq("status", "pending")
        .order("tg_message_date", { ascending: false })
        .limit(BATCH_SIZE);
      if (error) throw error;
      setBatch((data as any) || []);
      setDecisions({});
    } catch (e: any) {
      toast.error("Failed to load batch", { description: e?.message, duration: 12000 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBatch(); loadCounts(); }, [loadBatch, loadCounts]);

  async function generateFromTG() {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("backfill-archive-from-tg", {
        body: { mode: "dryrun", pages: 3, pageSize: 100 },
      });
      if (error) throw error;
      const d: any = data || {};
      toast.success("TG fetch complete", {
        description: `Scanned ${d.msgsScanned ?? 0} msgs · ${d.proposalsWritten ?? 0} new proposals written · ${d.skippedNoMatch ?? 0} no-match · ${d.skippedNoStats ?? 0} no-stats · ${d.skippedDuplicate ?? 0} dup`,
        duration: 20000,
      });
      await loadBatch();
      await loadCounts();
    } catch (e: any) {
      toast.error("TG fetch failed", { description: e?.message || String(e), duration: 15000 });
    } finally {
      setGenerating(false);
    }
  }

  function decide(id: string, status: "accepted" | "rejected") {
    setDecisions((d) => ({ ...d, [id]: { status, feedback: d[id]?.feedback ?? "" } }));
  }
  function updateFeedback(id: string, feedback: string) {
    setDecisions((d) => ({ ...d, [id]: { status: d[id]?.status ?? "rejected", feedback } }));
  }

  const acceptedCount = useMemo(
    () => Object.values(decisions).filter((d) => d.status === "accepted").length,
    [decisions]
  );
  const rejectedCount = useMemo(
    () => Object.values(decisions).filter((d) => d.status === "rejected").length,
    [decisions]
  );

  async function saveBatch() {
    const ids = Object.keys(decisions);
    if (!ids.length) {
      toast.error("No decisions made yet", { duration: 8000 });
      return;
    }
    let ok = 0, fail = 0, applied = 0;
    for (const p of batch) {
      const d = decisions[p.id];
      if (!d) continue;
      if (d.status === "rejected") {
        const { error } = await supabase
          .from("holders_intel_backfill_proposals")
          .update({
            status: "rejected",
            reviewer_feedback: d.feedback || null,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", p.id);
        if (error) fail++; else ok++;
        continue;
      }
      // accepted -> apply patch to archive AND mark applied
      const { error: upErr } = await supabase
        .from("holders_intel_post_queue")
        .update(p.patch_json as any)
        .eq("id", p.archive_id);
      if (upErr) { fail++; continue; }
      const { error: stErr } = await supabase
        .from("holders_intel_backfill_proposals")
        .update({
          status: "applied",
          applied_at: new Date().toISOString(),
          reviewer_feedback: d.feedback || null,
        })
        .eq("id", p.id);
      if (stErr) fail++; else { ok++; applied++; }
    }
    toast.success(`Saved ${ok} · applied ${applied} · failed ${fail}`, { duration: 15000 });
    await loadBatch();
    await loadCounts();
  }

  async function revertLastApplied() {
    const { data, error } = await supabase
      .from("holders_intel_backfill_proposals")
      .select("*")
      .eq("status", "applied")
      .order("applied_at", { ascending: false })
      .limit(BATCH_SIZE);
    if (error) { toast.error(error.message, { duration: 12000 }); return; }
    const list = (data as any[]) || [];
    if (!list.length) { toast.error("Nothing to revert", { duration: 8000 }); return; }
    let ok = 0;
    for (const p of list) {
      const beforeOnly: Record<string, any> = {};
      for (const k of TRACKED_FIELDS) {
        if (k in (p.before_json || {})) beforeOnly[k] = p.before_json[k] ?? null;
      }
      const { error: e1 } = await supabase
        .from("holders_intel_post_queue")
        .update(beforeOnly as any).eq("id", p.archive_id);
      if (e1) continue;
      await supabase
        .from("holders_intel_backfill_proposals")
        .update({ status: "reverted", reverted_at: new Date().toISOString() })
        .eq("id", p.id);
      ok++;
    }
    toast.success(`Reverted last ${ok}`, { duration: 12000 });
    await loadCounts();
  }

  return (
    <div className="space-y-4">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 -mx-2 px-2 py-3 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">🧪 Backfill Review — Side-by-Side</h3>
            <p className="text-xs text-muted-foreground">
              Loaded {batch.length} of {counts.pending} pending. Decide each, then{" "}
              <b>Save batch</b>: accepted = applied to archive, rejected = logged with your feedback.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">pending {counts.pending}</Badge>
            <Badge className="bg-emerald-600 hover:bg-emerald-600">applied {counts.applied}</Badge>
            <Badge variant="outline">rejected {counts.rejected}</Badge>
            <Badge variant="outline">reverted {counts.reverted}</Badge>
            <Button size="sm" variant="outline" onClick={() => { loadBatch(); loadCounts(); }} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" onClick={generateFromTG} disabled={generating} className="bg-sky-600 hover:bg-sky-700">
              {generating ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : "🔭"} Fetch from TG
            </Button>
            <Button size="sm" variant="destructive" onClick={revertLastApplied}>
              <Undo2 className="h-4 w-4 mr-1" /> Revert last {BATCH_SIZE}
            </Button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className="text-emerald-500 border-emerald-500/40">
            ✓ {acceptedCount} accepted
          </Badge>
          <Badge variant="outline" className="text-red-400 border-red-400/40">
            ✗ {rejectedCount} rejected
          </Badge>
          <Badge variant="secondary">{batch.length - acceptedCount - rejectedCount} undecided</Badge>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={saveBatch} disabled={!Object.keys(decisions).length}>
              <Check className="h-4 w-4 mr-1" /> Save batch ({Object.keys(decisions).length})
            </Button>
            <Button size="sm" variant="outline" onClick={loadBatch}>
              Skip & load next 5 <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {loading && batch.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : batch.length === 0 ? (
        <div className="text-center py-12 space-y-4">
          <div className="text-muted-foreground">
            No pending proposals in the queue yet.
          </div>
          <div className="text-xs text-muted-foreground max-w-md mx-auto">
            Click below to pull the last ~300 messages from @HoldersIntel on Telegram,
            match them to archive rows by mint, and stage them here as Before/After pairs
            for your review.
          </div>
          <Button onClick={generateFromTG} disabled={generating} size="lg" className="bg-sky-600 hover:bg-sky-700">
            {generating ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Fetching from Telegram…</> : <>🔭 Fetch proposals from Telegram</>}
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {batch.map((p, idx) => {
            const beforeRow = buildRow(p, "before");
            const afterRow = buildRow(p, "after");
            const changed = changedFields(p);
            const decision = decisions[p.id];
            return (
              <div
                key={p.id}
                className={`rounded-xl border-2 p-4 space-y-3 transition-colors ${
                  decision?.status === "accepted"
                    ? "border-emerald-500/60 bg-emerald-500/5"
                    : decision?.status === "rejected"
                    ? "border-red-500/60 bg-red-500/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-mono">
                    <Badge>#{idx + 1} of {batch.length}</Badge>
                    <span className="break-all">{p.token_mint}</span>
                    <span className="text-muted-foreground">
                      TG #{p.tg_message_id} · {new Date(p.tg_message_date).toLocaleString()}
                    </span>
                    {p.match_diff_hours != null && (
                      <Badge variant="secondary">Δ {p.match_diff_hours}h</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {changed.length === 0 ? (
                      <Badge variant="outline" className="text-muted-foreground">no field changes</Badge>
                    ) : (
                      changed.map((f) => (
                        <Badge key={f} variant="outline" className="text-amber-400 border-amber-400/40 font-mono text-[10px]">
                          {f}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-red-400 uppercase tracking-wider px-1">
                      {idx + 1}a — Before (current archive)
                    </div>
                    <HoldersIntelTweetCard row={beforeRow} />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider px-1">
                      {idx + 1}b — After (Telegram-parsed)
                    </div>
                    <HoldersIntelTweetCard row={afterRow} />
                  </div>
                </div>

                <div className="flex flex-wrap items-start gap-2 pt-2 border-t border-border/40">
                  <Button
                    size="sm"
                    variant={decision?.status === "accepted" ? "default" : "outline"}
                    className={decision?.status === "accepted" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                    onClick={() => decide(p.id, "accepted")}
                  >
                    <Check className="h-4 w-4 mr-1" /> Accept (apply 1b)
                  </Button>
                  <Button
                    size="sm"
                    variant={decision?.status === "rejected" ? "destructive" : "outline"}
                    onClick={() => decide(p.id, "rejected")}
                  >
                    <X className="h-4 w-4 mr-1" /> Reject (keep 1a)
                  </Button>
                  <Textarea
                    placeholder="Optional feedback — what's wrong with the parser? (e.g. 'dust_pct lost decimal', 'snippet stripped')"
                    value={decision?.feedback ?? ""}
                    onChange={(e) => updateFeedback(p.id, e.target.value)}
                    className="flex-1 min-w-[280px] min-h-[60px] text-xs"
                  />
                </div>

                {p.tg_raw_text && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Raw TG message</summary>
                    <pre className="whitespace-pre-wrap break-words mt-1 p-2 bg-muted/40 rounded font-mono text-[11px] max-h-60 overflow-auto">
                      {p.tg_raw_text}
                    </pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}