import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Save, RotateCcw, Eye, Plus, ChevronDown, ChevronRight } from "lucide-react";

interface TemplateRow {
  id: string;
  template_name: string;
  template_text: string;
  is_active: boolean;
  description: string | null;
  updated_at: string;
  last_used_at: string | null;
}

/**
 * Variables supported by `holders-intel-poster` & friends.
 * Pulled from processTemplate() in supabase/functions/holders-intel-compose-preview
 * and the poster — keep this list in sync when those add new tokens.
 */
const VARIABLES: Array<{ key: string; description: string }> = [
  { key: "{TICKER}", description: "Token symbol, obfuscated for bot-loop safety (e.g. TIC\u200BKER)" },
  { key: "{NAME}", description: "Token display name" },
  { key: "{ca}", description: "Token contract address (mint)" },
  { key: "{TOKEN_ADDRESS}", description: "Same as {ca}" },
  { key: "{HEALTH_GRADE}", description: "Holder health letter grade (A+ → F)" },
  { key: "{HEALTH_SCORE}", description: "Holder health numeric score 0-100" },
  { key: "{TOTAL_WALLETS}", description: "Total holder count" },
  { key: "{REAL_HOLDERS}", description: "Real (non-bot, non-dust) holders" },
  { key: "{WHALES}", description: "Whale-tier wallet count" },
  { key: "{SERIOUS}", description: "Serious-tier wallet count" },
  { key: "{retail}", description: "Active retail wallet count" },
  { key: "{dust}", description: "Dust wallet count" },
  { key: "{DUST_PERCENTAGE}", description: "Dust % of total holders" },
  { key: "{risk}", description: "Network risk signal (LOW / MED / HIGH)" },
  { key: "{risk_detail}", description: "One-line risk explanation" },
  { key: "{dev_rep}", description: "Developer reputation label" },
  { key: "{x_community}", description: "X / Twitter handle if known" },
  { key: "{website}", description: "Project website if known" },
  { key: "{padre}", description: "Padre trade-link with our ref code" },
  { key: "{timestamp}", description: "Snapshot timestamp (EST)" },
  { key: "{comment1}", description: "First call vs steady marker" },
];

const HOLDERS_URL_HELP = "Use https://blackbox.farm/holders?token={ca} for the canonical Holders deep-link.";

function tweetCharCount(text: string): number {
  if (!text) return 0;
  const urlRe = /https?:\/\/\S+/g;
  const urls = text.match(urlRe) || [];
  const stripped = text.replace(urlRe, "");
  return Array.from(stripped).length + urls.length * 23;
}

function previewWithSample(text: string): string {
  const sample: Record<string, string> = {
    "{TICKER}": "BO\u200BNK",
    "{ticker}": "bo\u200Bnk",
    "{NAME}": "Bonk",
    "{name}": "Bonk",
    "{ca}": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "{TOKEN_ADDRESS}": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "{HEALTH_GRADE}": "A-",
    "{healthGrade}": "A-",
    "{HEALTH_SCORE}": "78",
    "{healthScore}": "78",
    "{TOTAL_WALLETS}": "12,438",
    "{totalWallets}": "12,438",
    "{REAL_HOLDERS}": "9,201",
    "{realHolders}": "9,201",
    "{WHALES}": "23",
    "{whales}": "23",
    "{SERIOUS}": "412",
    "{serious}": "412",
    "{REAL_RETAIL}": "8,766",
    "{retail}": "8,766",
    "{DUST_COUNT}": "3,237",
    "{dust}": "3,237",
    "{DUST_PERCENTAGE}": "26",
    "{dustPct}": "26",
    "{risk}": "LOW",
    "{RISK}": "LOW",
    "{risk_detail}": "No obvious risks detected",
    "{RISK_DETAIL}": "No obvious risks detected",
    "{dev_rep}": "Trusted",
    "{DEV_REP}": "Trusted",
    "{x_community}": "@bonk_inu",
    "{X_COMMUNITY}": "@bonk_inu",
    "{website}": "bonkcoin.com",
    "{WEBSITE}": "bonkcoin.com",
    "{padre}": "https://trade.padre.gg/rk/blackbox/trade/solana/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "{PADRE}": "https://trade.padre.gg/rk/blackbox/trade/solana/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    "{timestamp}": "May 12, 1:00 PM EST",
    "{TIMESTAMP}": "May 12, 1:00 PM EST",
    "{comment1}": " 🆕 First call out!",
    "{COMMENT1}": " 🆕 First call out!",
  };
  let out = text;
  for (const [k, v] of Object.entries(sample)) {
    out = out.split(k).join(v);
  }
  return out;
}

export function HoldersIntelTemplateEditor() {
  const { toast } = useToast();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editedText, setEditedText] = useState<Record<string, string>>({});
  const [editedActive, setEditedActive] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [varsOpen, setVarsOpen] = useState(true);
  const [newName, setNewName] = useState("");
  const [groupTab, setGroupTab] = useState<"private" | "public" | "other">("private");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("holders_intel_templates")
      .select("id, template_name, template_text, is_active, description, updated_at, last_used_at")
      .order("template_name");
    if (error) {
      toast({ title: "Failed to load templates", description: error.message, variant: "destructive" });
    } else {
      setRows((data || []) as TemplateRow[]);
      const t: Record<string, string> = {};
      const a: Record<string, boolean> = {};
      for (const r of data || []) {
        t[r.id] = r.template_text;
        a[r.id] = r.is_active;
      }
      setEditedText(t);
      setEditedActive(a);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async (row: TemplateRow) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from("holders_intel_templates")
      .update({
        template_text: editedText[row.id] ?? row.template_text,
        is_active: editedActive[row.id] ?? row.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: row.template_name });
    load();
  };

  const reset = (row: TemplateRow) => {
    setEditedText(p => ({ ...p, [row.id]: row.template_text }));
    setEditedActive(p => ({ ...p, [row.id]: row.is_active }));
  };

  const addNew = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Pick a template_name first.", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("holders_intel_templates")
      .insert({ template_name: name, template_text: "", is_active: false });
    if (error) {
      toast({ title: "Add failed", description: error.message, variant: "destructive" });
      return;
    }
    setNewName("");
    toast({ title: "Created", description: name });
    load();
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading templates…</div>;
  }

  // Group templates by destination.
  // Private: Snapshot (Quick Stats) + Intel Update + no_lube_private + legacy no_lube
  // Public:  Leaks + no_lube_public
  // Other:   everything else (ads, shares, tg/x adverts, search, posted, etc.)
  const privateNames = new Set([
    "no_lube_snapshot_private",
    "no_lube_intel_update_private",
    "no_lube_private",
    "no_lube",
  ]);
  const publicNames = new Set([
    "no_lube_leaks_public",
    "no_lube_public",
  ]);
  const groupOf = (name: string): "private" | "public" | "other" => {
    if (privateNames.has(name)) return "private";
    if (publicNames.has(name)) return "public";
    return "other";
  };
  const visibleRows = rows.filter((r) => groupOf(r.template_name) === groupTab);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">📝 Tweet Templates</h2>
          <p className="text-sm text-muted-foreground">
            Live-edit the templates the X / Telegram poster reads at runtime. No redeploy needed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="new_template_name"
            className="h-8 w-48 text-xs"
          />
          <Button size="sm" onClick={addNew}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      <Tabs value={groupTab} onValueChange={(v) => setGroupTab(v as any)}>
        <TabsList>
          <TabsTrigger value="private">
            🔒 Private ({rows.filter(r => groupOf(r.template_name) === "private").length})
          </TabsTrigger>
          <TabsTrigger value="public">
            🌐 Public ({rows.filter(r => groupOf(r.template_name) === "public").length})
          </TabsTrigger>
          <TabsTrigger value="other">
            ⋯ Other ({rows.filter(r => groupOf(r.template_name) === "other").length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="text-xs text-muted-foreground -mt-2">
        {groupTab === "private" && "Snapshot (Quick Stats), Intel Update, and No-Lube Private — all go to the private Telegram channel."}
        {groupTab === "public" && "Leaks Post and No-Lube Public — broadcast to the public channel."}
        {groupTab === "other" && "Ads, shares, search, and legacy templates."}
      </div>

      <div className="rounded-lg border border-border/50 bg-card/40">
        <button
          className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium hover:bg-muted/30"
          onClick={() => setVarsOpen(o => !o)}
        >
          <span>Available variables</span>
          {varsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {varsOpen && (
          <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {VARIABLES.map(v => (
              <div key={v.key} className="flex gap-2">
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">{v.key}</code>
                <span className="text-muted-foreground">{v.description}</span>
              </div>
            ))}
            <div className="md:col-span-2 mt-2 text-muted-foreground italic">{HOLDERS_URL_HELP}</div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {visibleRows.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground rounded-lg border border-dashed border-border/40">
            No templates in this group yet.
          </div>
        )}
        {visibleRows.map((row) => {
          const text = editedText[row.id] ?? row.template_text;
          const active = editedActive[row.id] ?? row.is_active;
          const dirty = text !== row.template_text || active !== row.is_active;
          const charCount = tweetCharCount(text);
          const preview = previewWithSample(text);
          return (
            <div key={row.id} className="rounded-lg border border-border/50 bg-card/50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{row.template_name}</span>
                  <Badge variant={active ? "default" : "outline"} className="text-xs">
                    {active ? "active" : "inactive"}
                  </Badge>
                  {dirty && <Badge variant="secondary" className="text-xs">unsaved</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-xs">
                    <Switch
                      checked={active}
                      onCheckedChange={(v) => setEditedActive(p => ({ ...p, [row.id]: v }))}
                      id={`active-${row.id}`}
                    />
                    <Label htmlFor={`active-${row.id}`} className="cursor-pointer">Active</Label>
                  </div>
                  <span className="text-xs text-muted-foreground">{charCount} chars (URLs = 23)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Textarea
                  value={text}
                  onChange={(e) => setEditedText(p => ({ ...p, [row.id]: e.target.value }))}
                  rows={22}
                  className="font-mono text-xs min-h-[480px]"
                />
                <div className="rounded border border-dashed border-border/50 bg-background/40 p-3 min-h-[480px] overflow-auto">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Eye className="h-3 w-3" /> Preview with sample data
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-xs break-words">{preview}</pre>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Updated {new Date(row.updated_at).toLocaleString()}
                  {row.last_used_at && (
                    <> · Last used {new Date(row.last_used_at).toLocaleString()}</>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reset(row)}
                    disabled={!dirty}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" /> Reset
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => save(row)}
                    disabled={!dirty || savingId === row.id}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {savingId === row.id ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HoldersIntelTemplateEditor;