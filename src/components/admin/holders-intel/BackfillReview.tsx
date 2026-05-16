import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Check, RefreshCw, Undo2, X } from "lucide-react";

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
  status: "pending" | "accepted" | "rejected" | "applied" | "reverted";
  applied_at: string | null;
  reverted_at: string | null;
  created_at: string;
};

const STATUS_TABS = ["pending", "accepted", "applied", "rejected", "reverted"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const TRACKED_FIELDS = [
  "real_holders", "total_wallets", "whales_count", "serious_count",
  "retail_count", "dust_count", "dust_pct", "health_grade",
  "health_score", "ai_snippet", "manual_posted_at",
] as const;

function fmt(v: any): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "string" && v.length > 80) return v.slice(0, 80) + "…";
  return String(v);
}

export function BackfillReview() {
  const [statusTab, setStatusTab] = useState<StatusTab>("pending");
  const [rows, setRows] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<StatusTab, number>>({
    pending: 0, accepted: 0, applied: 0, rejected: 0, reverted: 0,
  });
  const [revertConfirm, setRevertConfirm] = useState("");

  const loadCounts = useCallback(async () => {
    const next = { ...counts };
    await Promise.all(STATUS_TABS.map(async (s) => {
      const { count } = await supabase
        .from("holders_intel_backfill_proposals")
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      next[s] = count || 0;
    }));
    setCounts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("holders_intel_backfill_proposals")
        .select("*")
        .eq("status", statusTab)
        .order("tg_message_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      setRows((data as any) || []);
    } catch (e: any) {
      toast.error("Failed to load proposals", { description: e?.message, duration: 12000 });
    } finally {
      setLoading(false);
    }
  }, [statusTab]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCounts(); }, [loadCounts, rows.length]);

  async function setStatus(p: Proposal, status: Proposal["status"]) {
    const { error } = await supabase
      .from("holders_intel_backfill_proposals")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) {
      toast.error("Update failed", { description: error.message, duration: 12000 });
      return;
    }
    setRows((r) => r.filter((x) => x.id !== p.id));
    loadCounts();
  }

  async function applyProposal(p: Proposal) {
    // Push patch_json onto the archive row
    const { error: upErr } = await supabase
      .from("holders_intel_post_queue")
      .update(p.patch_json as any)
      .eq("id", p.archive_id);
    if (upErr) {
      toast.error(`Apply failed for ${p.token_mint.slice(0, 8)}…`, {
        description: upErr.message, duration: 12000,
      });
      return;
    }
    const { error: stErr } = await supabase
      .from("holders_intel_backfill_proposals")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("id", p.id);
    if (stErr) {
      toast.warning("Applied to archive, but status update failed", {
        description: stErr.message, duration: 12000,
      });
    }
    setRows((r) => r.filter((x) => x.id !== p.id));
    loadCounts();
  }

  async function revertProposal(p: Proposal) {
    const beforeOnly: Record<string, any> = {};
    for (const k of TRACKED_FIELDS) {
      if (k in p.before_json) beforeOnly[k] = p.before_json[k] ?? null;
    }
    const { error: upErr } = await supabase
      .from("holders_intel_post_queue")
      .update(beforeOnly as any)
      .eq("id", p.archive_id);
    if (upErr) {
      toast.error("Revert failed", { description: upErr.message, duration: 12000 });
      return;
    }
    await supabase
      .from("holders_intel_backfill_proposals")
      .update({ status: "reverted", reverted_at: new Date().toISOString() })
      .eq("id", p.id);
    setRows((r) => r.filter((x) => x.id !== p.id));
    loadCounts();
    toast.success("Reverted to original values", { duration: 8000 });
  }

  async function bulkAcceptPage() {
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    const { error } = await supabase
      .from("holders_intel_backfill_proposals")
      .update({ status: "accepted", reviewed_at: new Date().toISOString() })
      .in("id", ids);
    if (error) {
      toast.error("Bulk accept failed", { description: error.message, duration: 12000 });
      return;
    }
    toast.success(`Accepted ${ids.length}`, { duration: 8000 });
    load(); loadCounts();
  }

  async function bulkRejectPage() {
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    const { error } = await supabase
      .from("holders_intel_backfill_proposals")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .in("id", ids);
    if (error) {
      toast.error("Bulk reject failed", { description: error.message, duration: 12000 });
      return;
    }
    toast.success(`Rejected ${ids.length}`, { duration: 8000 });
    load(); loadCounts();
  }

  async function applyAllAccepted() {
    const { data, error } = await supabase
      .from("holders_intel_backfill_proposals")
      .select("*")
      .eq("status", "accepted")
      .limit(500);
    if (error) { toast.error(error.message, { duration: 12000 }); return; }
    const list = (data as any[]) || [];
    let ok = 0, fail = 0;
    for (const p of list) {
      const { error: e1 } = await supabase
        .from("holders_intel_post_queue")
        .update(p.patch_json as any).eq("id", p.archive_id);
      if (e1) { fail++; continue; }
      await supabase
        .from("holders_intel_backfill_proposals")
        .update({ status: "applied", applied_at: new Date().toISOString() })
        .eq("id", p.id);
      ok++;
    }
    toast.success(`Applied ${ok} · failed ${fail}`, { duration: 15000 });
    load(); loadCounts();
  }

  async function revertAllApplied() {
    if (revertConfirm !== "REVERT") {
      toast.error("Type REVERT to confirm", { duration: 8000 });
      return;
    }
    const { data, error } = await supabase
      .from("holders_intel_backfill_proposals")
      .select("*")
      .eq("status", "applied")
      .limit(2000);
    if (error) { toast.error(error.message, { duration: 12000 }); return; }
    const list = (data as any[]) || [];
    let ok = 0, fail = 0;
    for (const p of list) {
      const beforeOnly: Record<string, any> = {};
      for (const k of TRACKED_FIELDS) {
        if (k in p.before_json) beforeOnly[k] = p.before_json[k] ?? null;
      }
      const { error: e1 } = await supabase
        .from("holders_intel_post_queue")
        .update(beforeOnly as any).eq("id", p.archive_id);
      if (e1) { fail++; continue; }
      await supabase
        .from("holders_intel_backfill_proposals")
        .update({ status: "reverted", reverted_at: new Date().toISOString() })
        .eq("id", p.id);
      ok++;
    }
    setRevertConfirm("");
    toast.success(`Reverted ${ok} · failed ${fail}`, { duration: 15000 });
    load(); loadCounts();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">🧪 Backfill Review</h3>
          <p className="text-xs text-muted-foreground">
            Side-by-side current vs Telegram-sourced values. Nothing touches the archive until you click <b>Apply</b>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {statusTab === "accepted" && (
            <Button size="sm" onClick={applyAllAccepted}>
              <Check className="h-4 w-4 mr-1" /> Apply All Accepted ({counts.accepted})
            </Button>
          )}
          {statusTab === "applied" && counts.applied > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive">
                  <Undo2 className="h-4 w-4 mr-1" /> Revert ALL Applied
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revert {counts.applied} applied proposals?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This restores each archive row to its pre-backfill values from the
                    stored before-snapshot. Type <b>REVERT</b> to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  placeholder="Type REVERT"
                  value={revertConfirm}
                  onChange={(e) => setRevertConfirm(e.target.value)}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setRevertConfirm("")}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={revertAllApplied}>Revert All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {STATUS_TABS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusTab === s ? "default" : "outline"}
            onClick={() => setStatusTab(s)}
          >
            {s} <Badge variant="secondary" className="ml-2">{counts[s]}</Badge>
          </Button>
        ))}
        {statusTab === "pending" && rows.length > 0 && (
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="outline" onClick={bulkAcceptPage}>
              <Check className="h-4 w-4 mr-1" /> Accept page ({rows.length})
            </Button>
            <Button size="sm" variant="outline" onClick={bulkRejectPage}>
              <X className="h-4 w-4 mr-1" /> Reject page
            </Button>
          </div>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Loading proposals…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No {statusTab} proposals. Run a TG dry-run from the Archive tab to populate this queue.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              onAccept={() => setStatus(p, "accepted")}
              onReject={() => setStatus(p, "rejected")}
              onApply={() => applyProposal(p)}
              onRevert={() => revertProposal(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  proposal: p,
  onAccept, onReject, onApply, onRevert,
}: {
  proposal: Proposal;
  onAccept: () => void;
  onReject: () => void;
  onApply: () => void;
  onRevert: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 font-mono">
          <Badge variant="outline">{p.status}</Badge>
          <span className="break-all">{p.token_mint}</span>
          <span className="text-muted-foreground">
            TG #{p.tg_message_id} · {new Date(p.tg_message_date).toLocaleString()}
          </span>
          {p.match_diff_hours != null && (
            <Badge variant="secondary">Δ {p.match_diff_hours}h</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {p.status === "pending" && (
            <>
              <Button size="sm" variant="outline" onClick={onAccept}>
                <Check className="h-3.5 w-3.5 mr-1" /> Accept
              </Button>
              <Button size="sm" variant="ghost" onClick={onReject}>
                <X className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
            </>
          )}
          {p.status === "accepted" && (
            <Button size="sm" onClick={onApply}>Apply now</Button>
          )}
          {p.status === "applied" && (
            <Button size="sm" variant="destructive" onClick={onRevert}>
              <Undo2 className="h-3.5 w-3.5 mr-1" /> Revert
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="font-semibold text-muted-foreground">Field</div>
        <div className="font-semibold text-muted-foreground">Current (archive)</div>
        <div className="font-semibold text-muted-foreground">Proposed (Telegram)</div>
        {TRACKED_FIELDS.map((k) => {
          const before = p.before_json?.[k];
          const after = p.after_json?.[k];
          const changed = JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
          return (
            <React.Fragment key={k}>
              <div className="font-mono text-muted-foreground">{k}</div>
              <div className={`font-mono ${changed ? "text-red-400" : ""}`}>{fmt(before)}</div>
              <div className={`font-mono ${changed ? "text-green-400" : ""}`}>{fmt(after)}</div>
            </React.Fragment>
          );
        })}
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
}