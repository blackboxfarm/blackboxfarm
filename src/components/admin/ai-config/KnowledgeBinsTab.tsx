import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, Pencil, Trash2, BookOpen, X } from "lucide-react";

const CATEGORIES = ["faq", "features", "security", "billing", "onboarding", "troubleshooting", "marketing", "compliance"] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_COLORS: Record<Category, string> = {
  faq: "bg-blue-500/20 text-blue-400",
  features: "bg-green-500/20 text-green-400",
  security: "bg-red-500/20 text-red-400",
  billing: "bg-yellow-500/20 text-yellow-400",
  onboarding: "bg-purple-500/20 text-purple-400",
  troubleshooting: "bg-orange-500/20 text-orange-400",
  marketing: "bg-pink-500/20 text-pink-400",
  compliance: "bg-slate-500/20 text-slate-400",
};

interface KnowledgeBin {
  id: string;
  category: Category;
  title: string;
  content: string;
  keywords: string[];
  priority: number;
  is_active: boolean;
}

const emptyBin: Omit<KnowledgeBin, 'id'> = {
  category: 'faq', title: '', content: '', keywords: [], priority: 0, is_active: true,
};

export const KnowledgeBinsTab: React.FC = () => {
  const [bins, setBins] = useState<KnowledgeBin[]>([]);
  const [loading, setLoading] = useState(true);
  const [editBin, setEditBin] = useState<Partial<KnowledgeBin> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  useEffect(() => { fetchBins(); }, []);

  const fetchBins = async () => {
    const { data, error } = await supabase.from("bot_knowledge_bins").select("*").order("priority", { ascending: false });
    if (error) { toast.error("Failed to load knowledge bins"); } 
    else { setBins(data || []); }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editBin?.title || !editBin?.content) { toast.error("Title and content are required"); return; }
    setSaving(true);
    if (isNew) {
      const { error } = await supabase.from("bot_knowledge_bins").insert({
        category: editBin.category || 'faq',
        title: editBin.title,
        content: editBin.content,
        keywords: editBin.keywords || [],
        priority: editBin.priority || 0,
        is_active: editBin.is_active ?? true,
      });
      if (error) toast.error("Failed to create: " + error.message);
      else toast.success("Knowledge bin created!");
    } else {
      const { error } = await supabase.from("bot_knowledge_bins").update({
        category: editBin.category,
        title: editBin.title,
        content: editBin.content,
        keywords: editBin.keywords,
        priority: editBin.priority,
        is_active: editBin.is_active,
      }).eq("id", editBin.id!);
      if (error) toast.error("Failed to update: " + error.message);
      else toast.success("Knowledge bin updated!");
    }
    setSaving(false);
    setEditBin(null);
    fetchBins();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this knowledge bin?")) return;
    const { error } = await supabase.from("bot_knowledge_bins").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else { toast.success("Deleted"); fetchBins(); }
  };

  const toggleActive = async (bin: KnowledgeBin) => {
    const { error } = await supabase.from("bot_knowledge_bins").update({ is_active: !bin.is_active }).eq("id", bin.id);
    if (error) toast.error("Failed to toggle");
    else fetchBins();
  };

  const addKeyword = () => {
    if (!newKeyword.trim() || !editBin) return;
    setEditBin({ ...editBin, keywords: [...(editBin.keywords || []), newKeyword.trim()] });
    setNewKeyword("");
  };

  const filtered = filterCategory === "all" ? bins : bins.filter(b => b.category === filterCategory);

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5" />
          <span className="text-sm text-muted-foreground">{bins.length} bins ({bins.filter(b => b.is_active).length} active)</span>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => { setEditBin({ ...emptyBin }); setIsNew(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Bin
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>Category</TableHead>
                <TableHead compact>Title</TableHead>
                <TableHead compact>Keywords</TableHead>
                <TableHead compact>Priority</TableHead>
                <TableHead compact>Active</TableHead>
                <TableHead compact>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((bin) => (
                <TableRow key={bin.id} className={!bin.is_active ? "opacity-50" : ""}>
                  <TableCell compact><Badge className={CATEGORY_COLORS[bin.category]}>{bin.category}</Badge></TableCell>
                  <TableCell compact className="font-medium max-w-[200px] truncate">{bin.title}</TableCell>
                  <TableCell compact>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {bin.keywords.slice(0, 3).map((k, i) => <Badge key={i} variant="outline" className="text-[10px] px-1">{k}</Badge>)}
                      {bin.keywords.length > 3 && <Badge variant="outline" className="text-[10px] px-1">+{bin.keywords.length - 3}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell compact>{bin.priority}</TableCell>
                  <TableCell compact><Switch checked={bin.is_active} onCheckedChange={() => toggleActive(bin)} /></TableCell>
                  <TableCell compact>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditBin(bin); setIsNew(false); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(bin.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell compact colSpan={6} className="text-center text-muted-foreground py-8">No knowledge bins found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={!!editBin} onOpenChange={(open) => !open && setEditBin(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Create Knowledge Bin" : "Edit Knowledge Bin"}</DialogTitle>
          </DialogHeader>
          {editBin && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={editBin.category} onValueChange={(v) => setEditBin({ ...editBin, category: v as Category })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority (higher = more important)</Label>
                  <Input type="number" value={editBin.priority || 0} onChange={(e) => setEditBin({ ...editBin, priority: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={editBin.title || ''} onChange={(e) => setEditBin({ ...editBin, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea rows={6} value={editBin.content || ''} onChange={(e) => setEditBin({ ...editBin, content: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Keywords (trigger words)</Label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(editBin.keywords || []).map((k, i) => (
                    <Badge key={i} variant="secondary" className="flex items-center gap-1">
                      {k}
                      <button onClick={() => setEditBin({ ...editBin, keywords: editBin.keywords?.filter((_, j) => j !== i) })}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} placeholder="Add keyword" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())} />
                  <Button variant="outline" size="sm" onClick={addKeyword}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editBin.is_active ?? true} onCheckedChange={(v) => setEditBin({ ...editBin, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBin(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
