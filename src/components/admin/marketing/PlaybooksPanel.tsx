import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, Trash2, Save } from "lucide-react";
import { useMarketingProfiles, updateMarketingProfile, insertMarketingProfile, deleteMarketingProfile } from "./useMarketingProfiles";
import { useToast } from "@/hooks/use-toast";
import type { MarketingProfile } from "./types";

const STATUSES = ["Draft", "Live", "Retired"];
const PLATFORMS = ["X", "Telegram", "Instagram", "Reddit", "YouTube", "Email", "Web", "Discord", "TikTok"];

function statusColor(s: string) {
  if (s === "Live") return "bg-green-500/20 text-green-700 border-green-500/40";
  if (s === "Retired") return "bg-gray-500/20 text-gray-600 border-gray-500/40";
  return "bg-amber-500/20 text-amber-700 border-amber-500/40";
}

function PlaybookEditDialog({ open, onClose, playbook, personas, onSaved }: { open: boolean; onClose: () => void; playbook: MarketingProfile | null; personas: MarketingProfile[]; onSaved: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(playbook?.title ?? "");
  const [slug, setSlug] = useState(playbook?.slug ?? "");
  const [d, setD] = useState<any>(playbook?.data ?? { status: "Draft", platform: "X", personas: [] });

  React.useEffect(() => {
    setTitle(playbook?.title ?? "");
    setSlug(playbook?.slug ?? "");
    setD(playbook?.data ?? { status: "Draft", platform: "X", personas: [] });
  }, [playbook]);

  const togglePersona = (slug: string) => {
    const arr: string[] = d.personas ?? [];
    setD({ ...d, personas: arr.includes(slug) ? arr.filter((s) => s !== slug) : [...arr, slug] });
  };

  const save = async () => {
    try {
      if (!title || !slug) {
        toast({ title: "Title and slug required", variant: "destructive" });
        return;
      }
      if (playbook) {
        await updateMarketingProfile(playbook.id, { title, slug, data: d });
      } else {
        await insertMarketingProfile({ section: "playbook", slug, title, data: d, sort_order: 99, is_active: true });
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
          <DialogTitle>{playbook ? `Edit: ${playbook.title}` : "New playbook"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
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
              <label className="text-sm font-medium mb-1 block">Platform</label>
              <Select value={d.platform ?? "X"} onValueChange={(v) => setD({ ...d, platform: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={d.status ?? "Draft"} onValueChange={(v) => setD({ ...d, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Target personas</label>
            <div className="flex flex-wrap gap-2">
              {personas.map((p) => (
                <Badge
                  key={p.id}
                  variant={(d.personas ?? []).includes(p.slug) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => togglePersona(p.slug)}
                >
                  {p.data?.emoji} {p.title}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Hook / angle</label>
            <Textarea rows={2} value={d.hook ?? ""} onChange={(e) => setD({ ...d, hook: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">CTA</label>
            <Input value={d.cta ?? ""} onChange={(e) => setD({ ...d, cta: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Asset type</label>
            <Input value={d.asset_type ?? ""} onChange={(e) => setD({ ...d, asset_type: e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Notes</label>
            <Textarea rows={3} value={d.notes ?? ""} onChange={(e) => setD({ ...d, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}><Save className="w-4 h-4 mr-1" /> Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlaybooksPanel() {
  const { data, loading, refetch } = useMarketingProfiles("playbook");
  const { data: personas } = useMarketingProfiles("persona");
  const { toast } = useToast();
  const [editing, setEditing] = useState<MarketingProfile | null>(null);
  const [open, setOpen] = useState(false);

  const onDelete = async (p: MarketingProfile) => {
    if (!confirm(`Delete playbook "${p.title}"?`)) return;
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
        <p className="text-sm text-muted-foreground">{data.length} playbook{data.length === 1 ? "" : "s"} — campaign templates ready to ship.</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> New playbook
        </Button>
      </div>
      {loading ? (
        <div className="text-muted-foreground p-6">Loading…</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data.map((p) => {
            const personaSlugs: string[] = p.data?.personas ?? [];
            const personaTitles = personas.filter((x) => personaSlugs.includes(x.slug));
            return (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{p.title}</span>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => onDelete(p)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </CardTitle>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="outline" className="text-xs">{p.data?.platform}</Badge>
                    <Badge variant="outline" className={`text-xs ${statusColor(p.data?.status ?? "Draft")}`}>{p.data?.status ?? "Draft"}</Badge>
                    {personaTitles.map((pt) => <Badge key={pt.id} variant="secondary" className="text-xs">{pt.data?.emoji} {pt.title}</Badge>)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {p.data?.hook && <p className="italic">{p.data.hook}</p>}
                  {p.data?.cta && <div className="text-xs"><span className="text-muted-foreground">CTA:</span> {p.data.cta}</div>}
                  {p.data?.asset_type && <div className="text-xs"><span className="text-muted-foreground">Asset:</span> {p.data.asset_type}</div>}
                  {p.data?.notes && <div className="text-xs text-muted-foreground border-t pt-2">{p.data.notes}</div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <PlaybookEditDialog open={open} onClose={() => setOpen(false)} playbook={editing} personas={personas} onSaved={refetch} />
    </div>
  );
}