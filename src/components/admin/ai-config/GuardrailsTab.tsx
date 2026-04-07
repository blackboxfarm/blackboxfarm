import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Shield } from "lucide-react";

const RULE_TYPES = ["never_say", "always_say", "redirect", "tone_override", "topic_block"] as const;
const SEVERITIES = ["soft", "hard", "critical"] as const;
type RuleType = typeof RULE_TYPES[number];
type Severity = typeof SEVERITIES[number];

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  never_say: "🚫 Never Say",
  always_say: "✅ Always Say",
  redirect: "↗️ Redirect",
  tone_override: "🎭 Tone Override",
  topic_block: "⛔ Topic Block",
};

const SEVERITY_COLORS: Record<Severity, string> = {
  soft: "bg-green-500/20 text-green-400",
  hard: "bg-yellow-500/20 text-yellow-400",
  critical: "bg-red-500/20 text-red-400",
};

interface Guardrail {
  id: string;
  rule_type: RuleType;
  rule_name: string;
  rule_content: string;
  severity: Severity;
  is_active: boolean;
}

export const GuardrailsTab: React.FC = () => {
  const [rules, setRules] = useState<Guardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRule, setEditRule] = useState<Partial<Guardrail> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchRules(); }, []);

  const fetchRules = async () => {
    const { data, error } = await supabase.from("bot_guardrails").select("*").order("severity", { ascending: true });
    if (error) toast.error("Failed to load guardrails");
    else setRules(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editRule?.rule_name || !editRule?.rule_content) { toast.error("Name and content are required"); return; }
    setSaving(true);
    if (isNew) {
      const { error } = await supabase.from("bot_guardrails").insert({
        rule_type: editRule.rule_type || 'never_say',
        rule_name: editRule.rule_name,
        rule_content: editRule.rule_content,
        severity: editRule.severity || 'hard',
        is_active: editRule.is_active ?? true,
      });
      if (error) toast.error("Failed to create: " + error.message);
      else toast.success("Guardrail created!");
    } else {
      const { error } = await supabase.from("bot_guardrails").update({
        rule_type: editRule.rule_type,
        rule_name: editRule.rule_name,
        rule_content: editRule.rule_content,
        severity: editRule.severity,
        is_active: editRule.is_active,
      }).eq("id", editRule.id!);
      if (error) toast.error("Failed to update: " + error.message);
      else toast.success("Guardrail updated!");
    }
    setSaving(false);
    setEditRule(null);
    fetchRules();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this guardrail?")) return;
    const { error } = await supabase.from("bot_guardrails").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else { toast.success("Deleted"); fetchRules(); }
  };

  const toggleActive = async (rule: Guardrail) => {
    const { error } = await supabase.from("bot_guardrails").update({ is_active: !rule.is_active }).eq("id", rule.id);
    if (error) toast.error("Failed to toggle");
    else fetchRules();
  };

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5" />
          <span className="text-sm text-muted-foreground">{rules.length} rules ({rules.filter(r => r.is_active).length} active)</span>
        </div>
        <Button size="sm" onClick={() => { setEditRule({ rule_type: 'never_say', severity: 'hard', is_active: true }); setIsNew(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Guardrail
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>Type</TableHead>
                <TableHead compact>Name</TableHead>
                <TableHead compact>Severity</TableHead>
                <TableHead compact>Active</TableHead>
                <TableHead compact>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} className={!rule.is_active ? "opacity-50" : ""}>
                  <TableCell compact><span className="text-xs">{RULE_TYPE_LABELS[rule.rule_type]}</span></TableCell>
                  <TableCell compact className="font-medium max-w-[250px]">
                    <div className="truncate">{rule.rule_name}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[250px]">{rule.rule_content.slice(0, 80)}...</div>
                  </TableCell>
                  <TableCell compact><Badge className={SEVERITY_COLORS[rule.severity]}>{rule.severity}</Badge></TableCell>
                  <TableCell compact><Switch checked={rule.is_active} onCheckedChange={() => toggleActive(rule)} /></TableCell>
                  <TableCell compact>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditRule(rule); setIsNew(false); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(rule.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rules.length === 0 && (
                <TableRow><TableCell compact colSpan={5} className="text-center text-muted-foreground py-8">No guardrails configured</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editRule} onOpenChange={(open) => !open && setEditRule(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? "Create Guardrail" : "Edit Guardrail"}</DialogTitle>
          </DialogHeader>
          {editRule && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Rule Type</Label>
                  <Select value={editRule.rule_type} onValueChange={(v) => setEditRule({ ...editRule, rule_type: v as RuleType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RULE_TYPES.map(t => <SelectItem key={t} value={t}>{RULE_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select value={editRule.severity} onValueChange={(v) => setEditRule({ ...editRule, severity: v as Severity })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input value={editRule.rule_name || ''} onChange={(e) => setEditRule({ ...editRule, rule_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Rule Content (instruction for the AI)</Label>
                <Textarea rows={5} value={editRule.rule_content || ''} onChange={(e) => setEditRule({ ...editRule, rule_content: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editRule.is_active ?? true} onCheckedChange={(v) => setEditRule({ ...editRule, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRule(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
