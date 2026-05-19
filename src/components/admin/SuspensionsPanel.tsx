import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PauseOctagon, Play, Plus, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Suspension = {
  id: string;
  feature_key: string;
  scope: string;
  reason: string;
  notes: string | null;
  suspended_at: string;
  suspended_by: string | null;
  lifted_at: string | null;
  lifted_by: string | null;
  related_toggle_table: string | null;
  related_toggle_key: string | null;
};

const SCOPES = ["edge_function", "frontend_feature", "cron", "bot_command", "other"];

export function SuspensionsPanel() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState({
    feature_key: "",
    scope: "edge_function",
    reason: "",
    notes: "",
    related_toggle_table: "",
    related_toggle_key: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["feature-suspensions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_suspensions" as any)
        .select("*")
        .order("suspended_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Suspension[];
    },
  });

  const active = (data || []).filter((s) => !s.lifted_at);
  const lifted = (data || []).filter((s) => s.lifted_at);

  const liftMutation = useMutation({
    mutationFn: async (s: Suspension) => {
      const { data: userData } = await supabase.auth.getUser();
      // Best-effort: flip related toggle back ON
      if (s.related_toggle_table && s.related_toggle_key) {
        try {
          if (s.related_toggle_table === "function_toggles") {
            await (supabase.from("function_toggles" as any).update({ enabled: true }).eq("function_name", s.related_toggle_key) as any);
          } else if (s.related_toggle_table === "intelligence_feature_flags") {
            await (supabase.from("intelligence_feature_flags" as any).update({ enabled: true }).eq("feature_name", s.related_toggle_key) as any);
          }
        } catch (e) {
          console.warn("[suspensions] toggle flip failed", e);
        }
      }
      const { data, error } = await (supabase
        .from("feature_suspensions" as any)
        .update({ lifted_at: new Date().toISOString(), lifted_by: userData.user?.id ?? null })
        .eq("id", s.id)
        .select() as any);
      if (error) throw error;
      if (!data?.length) throw new Error("Re-enable failed — check admin permissions");
      return s;
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["feature-suspensions"] });
      toast.success(`Re-enabled ${s.feature_key}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!form.feature_key.trim() || !form.reason.trim()) {
        throw new Error("feature_key and reason are required");
      }
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await (supabase.from("feature_suspensions" as any).insert({
        feature_key: form.feature_key.trim(),
        scope: form.scope,
        reason: form.reason.trim(),
        notes: form.notes.trim() || null,
        related_toggle_table: form.related_toggle_table.trim() || null,
        related_toggle_key: form.related_toggle_key.trim() || null,
        suspended_by: userData.user?.id ?? null,
      }).select() as any);
      if (error) throw error;
      if (!data?.length) throw new Error("Insert failed — check admin permissions");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feature-suspensions"] });
      toast.success("Suspension logged");
      setShowAdd(false);
      setForm({ feature_key: "", scope: "edge_function", reason: "", notes: "", related_toggle_table: "", related_toggle_key: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <PauseOctagon className="h-4 w-4 text-amber-500" />
            Suspension Registry
            <Badge variant="outline" className="ml-1 text-[10px]">
              {active.length} active
            </Badge>
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowHistory((v) => !v)}>
              <History className="h-3 w-3 mr-1" /> History ({lifted.length})
            </Button>
            <Button size="sm" onClick={() => setShowAdd((v) => !v)}>
              <Plus className="h-3 w-3 mr-1" /> Log
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showAdd && (
          <div className="space-y-2 p-3 rounded-md border border-border bg-muted/30">
            <Input
              placeholder="feature_key (e.g. token-ai-interpreter)"
              value={form.feature_key}
              onChange={(e) => setForm({ ...form, feature_key: e.target.value })}
            />
            <div className="flex gap-2">
              <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                placeholder="related_toggle_table (optional)"
                value={form.related_toggle_table}
                onChange={(e) => setForm({ ...form, related_toggle_table: e.target.value })}
              />
              <Input
                placeholder="related_toggle_key (optional)"
                value={form.related_toggle_key}
                onChange={(e) => setForm({ ...form, related_toggle_key: e.target.value })}
              />
            </div>
            <Textarea
              placeholder="Reason for suspension (required)"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              rows={2}
            />
            <Textarea
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
                Log suspension
              </Button>
            </div>
          </div>
        )}

        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}

        {!isLoading && active.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No active suspensions.</p>
        )}

        {active.map((s) => (
          <div key={s.id} className="flex items-start justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">{s.feature_key}</span>
                <Badge variant="outline" className="text-[10px]">{s.scope}</Badge>
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(s.suspended_at), { addSuffix: true })}
                </span>
              </div>
              <p className="text-xs mt-1">{s.reason}</p>
              {s.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{s.notes}</p>}
              {s.related_toggle_table && (
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                  toggle: {s.related_toggle_table} → {s.related_toggle_key}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="default"
              onClick={() => liftMutation.mutate(s)}
              disabled={liftMutation.isPending}
            >
              <Play className="h-3 w-3 mr-1" /> Re-enable
            </Button>
          </div>
        ))}

        {showHistory && lifted.length > 0 && (
          <div className="pt-2 border-t border-border space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">History</p>
            {lifted.map((s) => (
              <div key={s.id} className="text-xs flex items-center gap-2 py-1 border-b border-border/30">
                <span className="font-mono">{s.feature_key}</span>
                <Badge variant="outline" className="text-[10px]">{s.scope}</Badge>
                <span className="text-muted-foreground">{s.reason}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  lifted {s.lifted_at ? formatDistanceToNow(new Date(s.lifted_at), { addSuffix: true }) : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SuspensionsPanel;
