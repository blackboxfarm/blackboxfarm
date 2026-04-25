import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Copy, Trash2, Plus, Save } from "lucide-react";
import { useMarketingProfiles, updateMarketingProfile, insertMarketingProfile, deleteMarketingProfile } from "./useMarketingProfiles";
import { useToast } from "@/hooks/use-toast";
import type { MarketingProfile } from "./types";

function PersonaCard({ p, onEdit, onDuplicate, onDelete }: { p: MarketingProfile; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const d = p.data;
  return (
    <Card className="bg-card/50 hover:bg-card transition-colors">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <span className="text-2xl">{d.emoji ?? "👤"}</span>
            <span>{p.title}</span>
          </span>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={onEdit}><Pencil className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" onClick={onDuplicate}><Copy className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </div>
        </CardTitle>
        <p className="text-sm text-muted-foreground italic">{d.summary}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {d.demographics && (
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Demographics</div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              {Object.entries(d.demographics).map(([k, v]) => (
                <div key={k}><span className="text-muted-foreground">{k.replace(/_/g, " ")}:</span> {String(v)}</div>
              ))}
            </div>
          </div>
        )}
        {d.hook && (
          <div className="bg-primary/10 border-l-2 border-primary p-2 rounded text-sm font-medium italic">"{d.hook}"</div>
        )}
        {d.pain_points?.length > 0 && (
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Pain points</div>
            <ul className="list-disc list-inside text-xs space-y-0.5">
              {d.pain_points.map((p: string, i: number) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}
        {d.watering_holes?.length > 0 && (
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Watering holes</div>
            <ul className="list-disc list-inside text-xs space-y-0.5">
              {d.watering_holes.map((p: string, i: number) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}
        {d.trigger_moments?.length > 0 && (
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Trigger moments</div>
            <ul className="list-disc list-inside text-xs space-y-0.5">
              {d.trigger_moments.map((p: string, i: number) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}
        {d.features_that_matter?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {d.features_that_matter.map((f: string, i: number) => <Badge key={i} variant="secondary" className="text-xs">{f}</Badge>)}
          </div>
        )}
        {d.disqualifiers?.length > 0 && (
          <div className="text-xs text-muted-foreground border-t pt-2">
            <span className="font-medium">NOT for:</span> {d.disqualifiers.join(" · ")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function listField(label: string, value: string[], onChange: (v: string[]) => void, rows = 4) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}</label>
      <Textarea
        rows={rows}
        value={(value ?? []).join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
        placeholder="One per line"
      />
    </div>
  );
}

function PersonaEditDialog({ open, onClose, persona, onSaved }: { open: boolean; onClose: () => void; persona: MarketingProfile | null; onSaved: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(persona?.title ?? "");
  const [slug, setSlug] = useState(persona?.slug ?? "");
  const [d, setD] = useState<any>(persona?.data ?? {});

  React.useEffect(() => {
    setTitle(persona?.title ?? "");
    setSlug(persona?.slug ?? "");
    setD(persona?.data ?? {});
  }, [persona]);

  const save = async () => {
    try {
      if (!title || !slug) {
        toast({ title: "Title and slug required", variant: "destructive" });
        return;
      }
      if (persona) {
        await updateMarketingProfile(persona.id, { title, slug, data: d });
      } else {
        await insertMarketingProfile({
          section: "persona", slug, title, data: d, sort_order: 99, is_active: true,
        });
      }
      toast({ title: "Saved" });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{persona ? `Edit: ${persona.title}` : "New persona"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Slug</label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Emoji</label>
              <Input value={d.emoji ?? ""} onChange={(e) => setD({ ...d, emoji: e.target.value })} />
            </div>
            <div className="col-span-1">
              <label className="text-sm font-medium mb-1 block">Hook (the one converting line)</label>
              <Input value={d.hook ?? ""} onChange={(e) => setD({ ...d, hook: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Summary</label>
            <Textarea rows={2} value={d.summary ?? ""} onChange={(e) => setD({ ...d, summary: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["age","role","capital_range","time_on_chain"] as const).map((k) => (
              <div key={k}>
                <label className="text-sm font-medium mb-1 block">{k.replace(/_/g, " ")}</label>
                <Input
                  value={d.demographics?.[k] ?? ""}
                  onChange={(e) => setD({ ...d, demographics: { ...(d.demographics ?? {}), [k]: e.target.value } })}
                />
              </div>
            ))}
          </div>
          {listField("Pain points", d.pain_points ?? [], (v) => setD({ ...d, pain_points: v }))}
          {listField("Watering holes", d.watering_holes ?? [], (v) => setD({ ...d, watering_holes: v }))}
          {listField("Trigger moments", d.trigger_moments ?? [], (v) => setD({ ...d, trigger_moments: v }))}
          {listField("Features that matter", d.features_that_matter ?? [], (v) => setD({ ...d, features_that_matter: v }), 2)}
          {listField("Disqualifiers (who this is NOT for)", d.disqualifiers ?? [], (v) => setD({ ...d, disqualifiers: v }), 2)}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}><Save className="w-4 h-4 mr-1" /> Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PersonasPanel() {
  const { data, loading, refetch } = useMarketingProfiles("persona");
  const { toast } = useToast();
  const [editing, setEditing] = useState<MarketingProfile | null>(null);
  const [open, setOpen] = useState(false);

  const onDuplicate = async (p: MarketingProfile) => {
    try {
      await insertMarketingProfile({
        section: "persona",
        slug: `${p.slug}-copy-${Date.now()}`,
        title: `${p.title} (copy)`,
        data: p.data,
        sort_order: p.sort_order + 1,
        is_active: true,
      });
      toast({ title: "Duplicated" });
      refetch();
    } catch (e: any) {
      toast({ title: "Duplicate failed", description: e.message, variant: "destructive" });
    }
  };

  const onDelete = async (p: MarketingProfile) => {
    if (!confirm(`Delete persona "${p.title}"?`)) return;
    try {
      await deleteMarketingProfile(p.id);
      toast({ title: "Deleted" });
      refetch();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{data.length} persona{data.length === 1 ? "" : "s"} — the audiences we build for.</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> New persona
        </Button>
      </div>
      {loading ? (
        <div className="text-muted-foreground p-6">Loading personas…</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data.map((p) => (
            <PersonaCard
              key={p.id}
              p={p}
              onEdit={() => { setEditing(p); setOpen(true); }}
              onDuplicate={() => onDuplicate(p)}
              onDelete={() => onDelete(p)}
            />
          ))}
        </div>
      )}
      <PersonaEditDialog open={open} onClose={() => setOpen(false)} persona={editing} onSaved={refetch} />
    </div>
  );
}