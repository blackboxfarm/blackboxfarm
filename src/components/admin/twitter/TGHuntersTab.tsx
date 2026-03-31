import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  RefreshCw, Plus, Search, Loader2, ExternalLink, Upload, Scan, MessageCircle, Send, Trash2,
} from "lucide-react";

interface TGTarget {
  id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  followers: number;
  telegram_links: string[];
  last_scanned_at: string | null;
  scan_count: number;
  is_active: boolean;
  priority_score: number;
  notes: string | null;
  tags: string[];
  created_at: string;
}

export function TGHuntersTab() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [scanningHandle, setScanningHandle] = useState<string | null>(null);

  const { data: targets, isLoading } = useQuery({
    queryKey: ["tg-targets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("twitter_tg_targets" as any)
        .select("*")
        .order("priority_score", { ascending: false });
      if (error) throw error;
      return data as unknown as TGTarget[];
    },
  });

  const importMutation = useMutation({
    mutationFn: async (handles: string[]) => {
      const { data, error } = await supabase.functions.invoke("twitter-tg-hunter", {
        body: { action: "import-list", handles },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} handles`);
      queryClient.invalidateQueries({ queryKey: ["tg-targets"] });
      setIsImportOpen(false);
      setImportText("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const scanMutation = useMutation({
    mutationFn: async (handle: string) => {
      setScanningHandle(handle);
      const { data, error } = await supabase.functions.invoke("twitter-tg-hunter", {
        body: { action: "scan-handle", handle },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error);
      return data;
    },
    onSuccess: (data) => {
      const linkCount = data.telegram_links?.length || 0;
      toast.success(`@${data.handle}: found ${linkCount} TG link${linkCount !== 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: ["tg-targets"] });
      setScanningHandle(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setScanningHandle(null);
    },
  });

  const scanBatchMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("twitter-tg-hunter", {
        body: { action: "scan-batch" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Batch scanned ${data.scanned} handles`);
      queryClient.invalidateQueries({ queryKey: ["tg-targets"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("twitter_tg_targets" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Target removed");
      queryClient.invalidateQueries({ queryKey: ["tg-targets"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtered = targets?.filter((t) =>
    !searchQuery ||
    t.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalTargets = targets?.length || 0;
  const withTG = targets?.filter((t) => (t.telegram_links as any)?.length > 0).length || 0;
  const scannedToday = targets?.filter((t) => {
    if (!t.last_scanned_at) return false;
    const d = new Date(t.last_scanned_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length || 0;
  const highPriority = targets?.filter((t) => t.priority_score >= 70).length || 0;

  const handleImport = () => {
    const handles = importText
      .split(/[\n,;]+/)
      .map((h) => h.trim().replace("@", ""))
      .filter((h) => h.length > 0);
    if (handles.length === 0) {
      toast.error("No valid handles found");
      return;
    }
    importMutation.mutate(handles);
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{totalTargets}</div>
            <div className="text-sm text-muted-foreground">Total Targets</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-green-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-400">{withTG}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Send className="h-3 w-3" /> With TG Links
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-sky-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-sky-400">{scannedToday}</div>
            <div className="text-sm text-muted-foreground">Scanned Today</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-orange-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-orange-400">{highPriority}</div>
            <div className="text-sm text-muted-foreground">High Priority</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search handles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Import Handles
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Twitter Handles</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-4">
                <p className="text-sm text-muted-foreground">
                  Paste handles separated by commas, newlines, or semicolons. The @ symbol is optional.
                </p>
                <Textarea
                  placeholder="@handle1, @handle2, handle3&#10;handle4&#10;@handle5"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={8}
                />
                <p className="text-xs text-muted-foreground">
                  {importText.split(/[\n,;]+/).filter((h) => h.trim()).length} handles detected
                </p>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending || !importText.trim()}
                >
                  {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Import
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            onClick={() => scanBatchMutation.mutate()}
            disabled={scanBatchMutation.isPending || totalTargets === 0}
          >
            {scanBatchMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Scan className="h-4 w-4 mr-2" />
            )}
            Scan Batch (5)
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["tg-targets"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-sky-400" />
            TG Hunter Targets ({filtered?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !filtered?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No targets yet. Import your handle list to get started.
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead compact>Handle</TableHead>
                    <TableHead compact>Followers</TableHead>
                    <TableHead compact>TG Links</TableHead>
                    <TableHead compact>Last Scanned</TableHead>
                    <TableHead compact>Priority</TableHead>
                    <TableHead compact className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((target) => (
                    <TableRow key={target.id}>
                      <TableCell compact>
                        <div className="flex flex-col">
                          <a
                            href={`https://x.com/${target.handle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-sky-400 hover:underline flex items-center gap-1"
                          >
                            @{target.handle}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          {target.bio && (
                            <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                              {target.bio}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell compact>
                        <span className="text-sm">
                          {target.followers > 0 ? target.followers.toLocaleString() : '—'}
                        </span>
                      </TableCell>
                      <TableCell compact>
                        {(target.telegram_links as any)?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(target.telegram_links as string[]).map((link, i) => (
                              <a
                                key={i}
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/50 hover:bg-blue-500/30 cursor-pointer"
                                >
                                  <Send className="h-3 w-3 mr-1" />
                                  {link.replace('https://t.me/', '')}
                                </Badge>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {target.last_scanned_at ? 'None found' : 'Not scanned'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell compact>
                        {target.last_scanned_at ? (
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(target.last_scanned_at), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell compact>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            target.priority_score >= 70
                              ? "bg-orange-500/20 text-orange-400 border-orange-500/50"
                              : target.priority_score >= 30
                              ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {target.priority_score}
                        </Badge>
                      </TableCell>
                      <TableCell compact className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => scanMutation.mutate(target.handle)}
                            disabled={scanningHandle === target.handle}
                            title="Scan for TG links"
                          >
                            {scanningHandle === target.handle ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Scan className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Remove @${target.handle}?`)) {
                                deleteMutation.mutate(target.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
