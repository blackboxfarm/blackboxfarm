import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ScrapeSource {
  id: string;
  url: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  is_page2: boolean;
  wait_ms: number[];
  last_scraped_at: string | null;
  last_pair_count: number | null;
}

export function ScrapeSourcesManager() {
  const [sources, setSources] = useState<ScrapeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newIsPage2, setNewIsPage2] = useState(false);
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  const fetchSources = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("dex_scrape_sources")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) {
      toast({ title: "Error loading sources", description: error.message, variant: "destructive" });
    } else {
      setSources((data as any[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSources(); }, []);

  const addSource = async () => {
    if (!newUrl.trim()) return;
    setAdding(true);
    const maxOrder = sources.reduce((max, s) => Math.max(max, s.sort_order), 0);
    const { error } = await supabase.from("dex_scrape_sources").insert({
      url: newUrl.trim(),
      label: newLabel.trim() || newUrl.trim(),
      sort_order: maxOrder + 1,
      is_page2: newIsPage2,
      wait_ms: newIsPage2 ? [10000, 15000, 20000] : [3000, 5000, 8000],
    });
    if (error) {
      toast({ title: "Error adding source", description: error.message, variant: "destructive" });
    } else {
      setNewUrl("");
      setNewLabel("");
      setNewIsPage2(false);
      await fetchSources();
    }
    setAdding(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("dex_scrape_sources")
      .update({ is_active: !current })
      .eq("id", id);
    if (error) {
      toast({ title: "Error toggling", description: error.message, variant: "destructive" });
    } else {
      setSources(prev => prev.map(s => s.id === id ? { ...s, is_active: !current } : s));
    }
  };

  const deleteSource = async (id: string) => {
    const { error } = await supabase.from("dex_scrape_sources").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting", description: error.message, variant: "destructive" });
    } else {
      setSources(prev => prev.filter(s => s.id !== id));
    }
  };

  const formatAgo = (ts: string | null) => {
    if (!ts) return "—";
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
  };

  return (
    <div className="space-y-3 border border-border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Scrape Sources</h3>
        <Button onClick={fetchSources} size="sm" variant="ghost" disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead compact>Order</TableHead>
            <TableHead compact>Label</TableHead>
            <TableHead compact>URL</TableHead>
            <TableHead compact>Page 2+</TableHead>
            <TableHead compact>Active</TableHead>
            <TableHead compact>Last Scrape</TableHead>
            <TableHead compact>Pairs</TableHead>
            <TableHead compact></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map(s => (
            <TableRow key={s.id}>
              <TableCell compact className="text-xs font-mono">{s.sort_order}</TableCell>
              <TableCell compact className="text-xs font-medium">{s.label}</TableCell>
              <TableCell compact className="text-xs font-mono max-w-[200px] truncate">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary">{s.url}</a>
              </TableCell>
              <TableCell compact>
                {s.is_page2 && <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-400">Yes</Badge>}
              </TableCell>
              <TableCell compact>
                <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s.id, s.is_active)} />
              </TableCell>
              <TableCell compact className="text-xs text-muted-foreground">{formatAgo(s.last_scraped_at)}</TableCell>
              <TableCell compact className="text-xs font-mono">{s.last_pair_count ?? "—"}</TableCell>
              <TableCell compact>
                <Button size="sm" variant="ghost" onClick={() => deleteSource(s.id)} className="text-red-400 hover:text-red-300 h-6 w-6 p-0">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex gap-2 items-center pt-2 border-t border-border">
        <Input
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          placeholder="https://dexscreener.com/..."
          className="flex-1 h-8 text-xs"
        />
        <Input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          placeholder="Label"
          className="w-32 h-8 text-xs"
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
          <Switch checked={newIsPage2} onCheckedChange={setNewIsPage2} />
          Page 2+
        </label>
        <Button onClick={addSource} size="sm" disabled={adding || !newUrl.trim()} className="h-8">
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}
