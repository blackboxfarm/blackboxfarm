import React, { useState, lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Eye, MessageSquare, ClipboardList, Users, BarChart3, Gift } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LazyLoader } from '@/components/ui/lazy-loader';

// Lazy load Comp Pro Grant panel
const CompProGrantPanel = lazy(() => import("@/components/admin/CompProGrantPanel").then(m => ({ default: m.CompProGrantPanel })));

// ─── Promo Codes Sub-Tab ───
function PromoCodesSection() {
  const queryClient = useQueryClient();
  const [newCode, setNewCode] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("10");
  const [newDuration, setNewDuration] = useState("30");
  const [newSource, setNewSource] = useState("");

  const { data: codes, isLoading } = useQuery({
    queryKey: ["promo-codes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promo_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createCode = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("promo_codes").insert({
        code: newCode.toUpperCase().trim(),
        max_uses: parseInt(newMaxUses),
        trial_duration_days: parseInt(newDuration),
        source_label: newSource || null,
        tier_granted: "pro",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
      setNewCode("");
      setNewSource("");
      toast({ title: "Promo code created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleCode = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("promo_codes").update({ is_active: !is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["promo-codes"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Promo Codes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="CODE" value={newCode} onChange={e => setNewCode(e.target.value)} className="w-32" />
          <Input placeholder="Max uses" type="number" value={newMaxUses} onChange={e => setNewMaxUses(e.target.value)} className="w-24" />
          <Input placeholder="Days" type="number" value={newDuration} onChange={e => setNewDuration(e.target.value)} className="w-20" />
          <Input placeholder="Source label" value={newSource} onChange={e => setNewSource(e.target.value)} className="w-40" />
          <Button onClick={() => createCode.mutate()} disabled={!newCode.trim()}>Create</Button>
        </div>

        {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
          <div className="space-y-2">
            {codes?.map(code => (
              <div key={code.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-3">
                  <Badge variant={code.is_active ? "default" : "secondary"}>{code.code}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {code.current_uses}/{code.max_uses} used · {code.trial_duration_days}d trial
                  </span>
                  {code.source_label && <Badge variant="outline" className="text-xs">{code.source_label}</Badge>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => toggleCode.mutate({ id: code.id, is_active: code.is_active })}>
                  {code.is_active ? "Disable" : "Enable"}
                </Button>
              </div>
            ))}
            {!codes?.length && <p className="text-sm text-muted-foreground">No promo codes yet.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Active Testers Sub-Tab ───
function ActiveTestersSection() {
  const { data: redemptions, isLoading } = useQuery({
    queryKey: ["promo-redemptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promo_redemptions")
        .select("*, promo_codes(code, source_label)")
        .order("redeemed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Active Testers</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
          <div className="space-y-2">
            {redemptions?.map(r => {
              const daysLeft = Math.max(0, Math.ceil((new Date(r.expires_at).getTime() - Date.now()) / 86400000));
              const isExpired = daysLeft === 0;
              return (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono">{r.telegram_user_id ? `TG: ${r.telegram_user_id}` : r.user_id?.slice(0, 8)}</span>
                      <Badge variant="outline" className="text-xs">{(r.promo_codes as any)?.code}</Badge>
                      {(r.promo_codes as any)?.source_label && (
                        <Badge variant="secondary" className="text-xs">{(r.promo_codes as any).source_label}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Redeemed {new Date(r.redeemed_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={isExpired ? "destructive" : "default"}>
                    {isExpired ? "Expired" : `${daysLeft}d left`}
                  </Badge>
                </div>
              );
            })}
            {!redemptions?.length && <p className="text-sm text-muted-foreground">No testers yet.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Feedback Inbox Sub-Tab ───
function FeedbackInboxSection() {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  
  const { data: feedback, isLoading } = useQuery({
    queryKey: ["tester-feedback", typeFilter],
    queryFn: async () => {
      let q = supabase.from("tester_feedback").select("*").order("created_at", { ascending: false }).limit(100);
      if (typeFilter !== "all") q = q.eq("feedback_type", typeFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const typeColors: Record<string, string> = {
    improvement: "bg-blue-500/20 text-blue-400",
    bug: "bg-red-500/20 text-red-400",
    confusion: "bg-yellow-500/20 text-yellow-400",
    removal: "bg-orange-500/20 text-orange-400",
    general: "bg-zinc-500/20 text-zinc-400",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Feedback Inbox</CardTitle>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="improvement">Improvement</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="confusion">Confusing</SelectItem>
              <SelectItem value="removal">Remove This</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
          <div className="space-y-3">
            {feedback?.map(f => (
              <div key={f.id} className="p-3 rounded-lg border bg-card space-y-2">
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={typeColors[f.feedback_type] || typeColors.general}>{f.feedback_type}</Badge>
                    {f.page_path && <span className="text-xs text-muted-foreground font-mono">{f.page_path}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm">{f.message}</p>
                {f.screenshot_url && (
                  <a href={f.screenshot_url} target="_blank" rel="noopener" className="text-xs text-primary hover:underline">View Screenshot</a>
                )}
              </div>
            ))}
            {!feedback?.length && <p className="text-sm text-muted-foreground">No feedback yet.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Questionnaires Sub-Tab ───
function QuestionnairesSection() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetCode, setTargetCode] = useState("");
  const [questionsJson, setQuestionsJson] = useState('[\n  {"type":"rating","label":"How easy was it to navigate?","min":1,"max":5},\n  {"type":"text","label":"Any suggestions?"}\n]');

  const { data: questionnaires, isLoading } = useQuery({
    queryKey: ["tester-questionnaires"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tester_questionnaires").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: responses } = useQuery({
    queryKey: ["tester-questionnaire-responses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tester_questionnaire_responses").select("*");
      if (error) throw error;
      return data;
    },
  });

  const createQuestionnaire = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(questionsJson);
      const { error } = await supabase.from("tester_questionnaires").insert({
        title,
        description: description || null,
        questions: parsed,
        target_promo_code: targetCode || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tester-questionnaires"] });
      setCreating(false);
      setTitle("");
      setDescription("");
      toast({ title: "Questionnaire created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const responseCount = (qId: string) => responses?.filter(r => r.questionnaire_id === qId).length || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Questionnaires</CardTitle>
          <Button size="sm" onClick={() => setCreating(!creating)}>{creating ? "Cancel" : "New Questionnaire"}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {creating && (
          <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
            <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <Input placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
            <Input placeholder="Target promo code (optional)" value={targetCode} onChange={e => setTargetCode(e.target.value)} />
            <Textarea placeholder="Questions JSON" value={questionsJson} onChange={e => setQuestionsJson(e.target.value)} rows={6} className="font-mono text-xs" />
            <Button onClick={() => createQuestionnaire.mutate()} disabled={!title.trim()}>Create</Button>
          </div>
        )}

        {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
          <div className="space-y-2">
            {questionnaires?.map(q => (
              <div key={q.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div>
                  <p className="text-sm font-medium">{q.title}</p>
                  {q.description && <p className="text-xs text-muted-foreground">{q.description}</p>}
                  {q.target_promo_code && <Badge variant="outline" className="text-xs mt-1">{q.target_promo_code}</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{responseCount(q.id)} responses</Badge>
                  <Badge variant={q.is_active ? "default" : "secondary"}>{q.is_active ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
            ))}
            {!questionnaires?.length && <p className="text-sm text-muted-foreground">No questionnaires yet.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Testers Tab ───
export default function TestersTab() {
  const [activeSubTab, setActiveSubTab] = useState("grant");
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">🧪 Tester Program</h2>
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
        <TabsList className="flex flex-wrap w-full h-auto gap-1 p-1">
          <TabsTrigger value="grant"><Gift className="h-4 w-4 mr-1" />Grant Pro</TabsTrigger>
          <TabsTrigger value="codes">🎟️ Promo Codes</TabsTrigger>
          <TabsTrigger value="testers">👥 Active Testers</TabsTrigger>
          <TabsTrigger value="feedback">💬 Feedback</TabsTrigger>
          <TabsTrigger value="questionnaires">📋 Questionnaires</TabsTrigger>
        </TabsList>
        <TabsContent value="grant">
          {activeSubTab === "grant" && (
            <Suspense fallback={<LazyLoader />}>
              <CompProGrantPanel />
            </Suspense>
          )}
        </TabsContent>
        <TabsContent value="codes"><PromoCodesSection /></TabsContent>
        <TabsContent value="testers"><ActiveTestersSection /></TabsContent>
        <TabsContent value="feedback"><FeedbackInboxSection /></TabsContent>
        <TabsContent value="questionnaires"><QuestionnairesSection /></TabsContent>
      </Tabs>
    </div>
  );
}
