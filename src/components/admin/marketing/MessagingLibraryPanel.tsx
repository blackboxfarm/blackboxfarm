import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, Trash2, Save, Copy, Check } from "lucide-react";
import { useMarketingProfiles, updateMarketingProfile, insertMarketingProfile, deleteMarketingProfile } from "./useMarketingProfiles";
import { useToast } from "@/hooks/use-toast";
import type { MarketingProfile } from "./types";

const CHANNELS = ["X", "Telegram", "Instagram", "Reddit", "YouTube", "Email", "Web"];
const LENGTHS = ["subject", "tweet", "short", "caption", "long"];

function MessageEditDialog({ open, onClose, message, personas, onSaved }: { open: boolean; onClose: () => void; message: MarketingProfile | null; personas: MarketingProfile[]; onSaved: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState(message?.title ?? "");
  const [slug, setSlug] = useState(message?.slug ?? "");
  const [d, setD] = useState<any>(message?.data ?? { channel: "X", length: "tweet", body: "" });

  React.useEffect(() => {
    setTitle(message?.title ?? "");
    setSlug(message?.slug ?? "");
    setD(message?.data ?? { channel: "X", length: "tweet", body: "" });
  }, [message]);

  const save = async () => {
    try {
      if (!title || !slug) return toast({ title: "Title and slug required", variant: "destructive" });
      if (message) await updateMarketingProfile(message.id, { title, slug, data: d });
      else await insertMarketingProfile({ section: "message", slug, title, data: d, sort_order: 99, is_active: true });
      toast({ title: "Saved" });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{message ? `Edit: ${message.title}` : "New snippet"}</DialogTitle>
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
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Persona</label>
              <Select value={d.persona ?? ""} onValueChange={(v) => setD({ ...d, persona: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{personas.map((p) => <SelectItem key={p.slug} value={p.slug}>{p.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Channel</label>
              <Select value={d.channel ?? "X"} onValueChange={(v) => setD({ ...d, channel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Length</label>
              <Select value={d.length ?? "tweet"} onValueChange={(v) => setD({ ...d, length: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LENGTHS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Body</label>
            <Textarea rows={8} value={d.body ?? ""} onChange={(e) => setD({ ...d, body: e.target.value })} />
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

export function MessagingLibraryPanel() {
  const { data, loading, refetch } = useMarketingProfiles("message");
  const { data: personas } = useMarketingProfiles("persona");
  const { toast } = useToast();
  const [editing, setEditing] = useState<MarketingProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [filterPersona, setFilterPersona] = useState<string>("all");
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return data.filter((m) => {
      if (filterPersona !== "all" && m.data?.persona !== filterPersona) return false;
      if (filterChannel !== "all" && m.data?.channel !== filterChannel) return false;
      return true;
    });
  }, [data, filterPersona, filterChannel]);

  const copy = async (m: MarketingProfile) => {
    await navigator.clipboard.writeText(m.data?.body ?? "");
    setCopied(m.id);
    toast({ title: "Copied", description: m.title });
    setTimeout(() => setCopied(null), 1500);
  };

  const onDelete = async (m: MarketingProfile) => {
    if (!confirm(`Delete "${m.title}"?`)) return;
    try {
      await deleteMarketingProfile(m.id);
      toast({ title: "Deleted" });
      refetch();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={filterPersona} onValueChange={setFilterPersona}>
            <SelectTrigger className="w-[200px] h-8"><SelectValue placeholder="Persona" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All personas</SelectItem>
              {personas.map((p) => <SelectItem key={p.slug} value={p.slug}>{p.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterChannel} onValueChange={setFilterChannel}>
            <SelectTrigger className="w-[140px] h-8"><SelectValue placeholder="Channel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} snippet{filtered.length === 1 ? "" : "s"}</span>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> New snippet
        </Button>
      </div>
      {loading ? (
        <div className="text-muted-foreground p-6">Loading…</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {filtered.map((m) => {
            const persona = personas.find((p) => p.slug === m.data?.persona);
            return (
              <Card key={m.id} className="bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>{m.title}</span>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => copy(m)}>
                        {copied === m.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(m); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => onDelete(m)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </CardTitle>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {persona && <Badge variant="secondary" className="text-xs">{persona.data?.emoji} {persona.title}</Badge>}
                    <Badge variant="outline" className="text-xs">{m.data?.channel}</Badge>
                    <Badge variant="outline" className="text-xs">{m.data?.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/40 p-2 rounded border">{m.data?.body}</pre>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <MessageEditDialog open={open} onClose={() => setOpen(false)} message={editing} personas={personas} onSaved={refetch} />
    </div>
  );
}