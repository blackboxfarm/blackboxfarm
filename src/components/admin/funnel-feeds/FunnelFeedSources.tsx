import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, RefreshCw, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FeedSource {
  id: string;
  source_id: string;
  source_name: string;
  source_type: string;
  is_active: boolean;
  scrape_interval_minutes: number;
  last_scraped_at: string | null;
  last_message_id: number;
  tokens_discovered: number;
  notes: string | null;
  created_at: string;
}

export function FunnelFeedSources() {
  const [sources, setSources] = useState<FeedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState<string | null>(null);
  const { toast } = useToast();

  // Add form state
  const [showForm, setShowForm] = useState(false);
  const [newSourceId, setNewSourceId] = useState("");
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceType, setNewSourceType] = useState("telegram_channel");
  const [newInterval, setNewInterval] = useState("5");
  const [newNotes, setNewNotes] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchSources = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('funnel-feed-scanner', {
      body: { action: 'get_sources' },
    });
    if (error) {
      toast({ title: "Error loading sources", description: error.message, variant: "destructive" });
    } else {
      setSources(data.sources || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const addSource = async () => {
    if (!newSourceId || !newSourceName) return;
    setAdding(true);
    const { data, error } = await supabase.functions.invoke('funnel-feed-scanner', {
      body: {
        action: 'add_source',
        source_id: newSourceId,
        source_name: newSourceName,
        source_type: newSourceType,
        scrape_interval_minutes: parseInt(newInterval) || 5,
        notes: newNotes || null,
      },
    });
    setAdding(false);
    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Source added" });
      setShowForm(false);
      setNewSourceId(""); setNewSourceName(""); setNewNotes("");
      fetchSources();
    }
  };

  const toggleSource = async (id: string, is_active: boolean) => {
    await supabase.functions.invoke('funnel-feed-scanner', {
      body: { action: 'toggle_source', id, is_active },
    });
    fetchSources();
  };

  const deleteSource = async (id: string) => {
    if (!confirm('Delete this feed source?')) return;
    await supabase.functions.invoke('funnel-feed-scanner', {
      body: { action: 'delete_source', id },
    });
    fetchSources();
  };

  const scanSource = async (sourceId: string) => {
    setScanning(sourceId);
    const { data, error } = await supabase.functions.invoke('funnel-feed-scanner', {
      body: { action: 'scan', source_id: sourceId },
    });
    setScanning(null);
    if (error || data?.error) {
      toast({ title: "Scan error", description: data?.error || error?.message, variant: "destructive" });
    } else {
      const result = data.results?.[0];
      toast({ title: "Scan complete", description: `Found ${result?.new_tokens || 0} new tokens` });
      fetchSources();
    }
  };

  const scanAll = async () => {
    setScanning('all');
    const { data, error } = await supabase.functions.invoke('funnel-feed-scanner', {
      body: { action: 'scan' },
    });
    setScanning(null);
    if (error || data?.error) {
      toast({ title: "Scan error", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Scan complete", description: `Scanned ${data.scanned || 0} sources` });
      fetchSources();
    }
  };

  const timeAgo = (ts: string | null) => {
    if (!ts) return 'Never';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Source
        </Button>
        <Button onClick={scanAll} size="sm" variant="outline" disabled={!!scanning}>
          <RefreshCw className={`h-4 w-4 mr-1 ${scanning === 'all' ? 'animate-spin' : ''}`} />
          Scan All
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Add Feed Source</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label>Telegram Channel/Group ID</Label>
              <Input placeholder="-1001234567890" value={newSourceId} onChange={e => setNewSourceId(e.target.value)} />
            </div>
            <div>
              <Label>Display Name</Label>
              <Input placeholder="Alpha Calls Group" value={newSourceName} onChange={e => setNewSourceName(e.target.value)} />
            </div>
            <div>
              <Label>Type</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newSourceType} onChange={e => setNewSourceType(e.target.value)}>
                <option value="telegram_channel">Channel</option>
                <option value="telegram_group">Group</option>
              </select>
            </div>
            <div>
              <Label>Scrape Interval (min)</Label>
              <Input type="number" value={newInterval} onChange={e => setNewInterval(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Notes (optional)</Label>
              <Input placeholder="Phanes bot channel, etc." value={newNotes} onChange={e => setNewNotes(e.target.value)} />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button onClick={addSource} disabled={adding || !newSourceId || !newSourceName} size="sm">
                {adding ? 'Adding...' : 'Add Source'}
              </Button>
              <Button onClick={() => setShowForm(false)} size="sm" variant="ghost">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : sources.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No feed sources configured. Add one above.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead compact>Active</TableHead>
              <TableHead compact>Name</TableHead>
              <TableHead compact>Type</TableHead>
              <TableHead compact>Source ID</TableHead>
              <TableHead compact>Interval</TableHead>
              <TableHead compact>Last Scraped</TableHead>
              <TableHead compact>Tokens Found</TableHead>
              <TableHead compact>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map(s => (
              <TableRow key={s.id}>
                <TableCell compact>
                  <Switch checked={s.is_active} onCheckedChange={v => toggleSource(s.id, v)} />
                </TableCell>
                <TableCell compact className="font-medium">{s.source_name}</TableCell>
                <TableCell compact>
                  <Badge variant="outline" className="text-xs">
                    {s.source_type === 'telegram_channel' ? '📢 Channel' : '👥 Group'}
                  </Badge>
                </TableCell>
                <TableCell compact className="font-mono text-xs">{s.source_id}</TableCell>
                <TableCell compact>{s.scrape_interval_minutes}m</TableCell>
                <TableCell compact className="text-xs">{timeAgo(s.last_scraped_at)}</TableCell>
                <TableCell compact>{s.tokens_discovered}</TableCell>
                <TableCell compact>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => scanSource(s.source_id)}
                      disabled={!!scanning}
                      title="Scan now"
                    >
                      <Play className={`h-3 w-3 ${scanning === s.source_id ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteSource(s.id)} title="Delete">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
