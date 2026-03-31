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
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  RefreshCw, Plus, Search, Loader2, ExternalLink, Upload, Scan, MessageCircle, Send, Trash2,
  ChevronDown, ChevronRight, Twitter, Radio, Zap, Pencil,
} from "lucide-react";
import { ReplyDraftButton } from "./ReplyDraftButton";

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
  tg_group_joined?: boolean;
  tg_group_chat_id?: string | null;
  last_tweet_scan_at?: string | null;
  tweet_scan_count?: number;
  token_mentions_found?: number;
  account_status?: string;
}

interface TweetFinding {
  id: string;
  target_id: string;
  handle: string;
  tweet_id: string;
  tweet_text: string;
  tweet_url: string;
  detected_tokens: string[];
  detected_tickers: string[];
  tweet_date: string;
  engagement_score: number;
  reply_drafted: boolean;
  reply_posted: boolean;
}

export function TGHuntersTab() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [scanningHandle, setScanningHandle] = useState<string | null>(null);
  const [expandedTarget, setExpandedTarget] = useState<string | null>(null);
  const [editingTgTarget, setEditingTgTarget] = useState<string | null>(null);
  const [manualTgLink, setManualTgLink] = useState("");

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

  // Fetch tweet findings for expanded target
  const { data: findings } = useQuery({
    queryKey: ["hunter-findings", expandedTarget],
    queryFn: async () => {
      if (!expandedTarget) return [];
      const { data, error } = await supabase
        .from("hunter_tweet_findings" as any)
        .select("*")
        .eq("target_id", expandedTarget)
        .order("tweet_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as unknown as TweetFinding[];
    },
    enabled: !!expandedTarget,
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

  const [scanProgress, setScanProgress] = useState<{ scanned: number; total: number } | null>(null);

  const scanAllMissingMutation = useMutation({
    mutationFn: async () => {
      let totalScanned = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke("twitter-tg-hunter", {
          body: { action: "scan-all-missing" },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error);
        
        totalScanned += data.scanned;
        hasMore = data.has_more && data.scanned > 0;
        setScanProgress({ scanned: totalScanned, total: totalScanned + (hasMore ? 5 : 0) });
        queryClient.invalidateQueries({ queryKey: ["tg-targets"] });
      }
      
      return { scanned: totalScanned };
    },
    onSuccess: (data) => {
      toast.success(`Scanned ${data.scanned} targets for TG links`);
      setScanProgress(null);
      queryClient.invalidateQueries({ queryKey: ["tg-targets"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setScanProgress(null);
    },
  });

  // Scrape tweets for a single target
  const tweetScanMutation = useMutation({
    mutationFn: async (handle: string) => {
      const { data, error } = await supabase.functions.invoke("twitter-hunter-scrape", {
        body: { action: "scan-single", handle },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error);
      return data;
    },
    onSuccess: (data) => {
      const findings = data.results?.[0]?.findings || 0;
      toast.success(`Found ${findings} token mentions`);
      queryClient.invalidateQueries({ queryKey: ["tg-targets"] });
      queryClient.invalidateQueries({ queryKey: ["hunter-findings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Add TG group to MTProto
  const addToMtprotoMutation = useMutation({
    mutationFn: async ({ targetId, tgLink, channelName }: { targetId: string; tgLink: string; channelName: string }) => {
      const { data, error } = await supabase.functions.invoke("twitter-hunter-scrape", {
        body: { action: "add-to-mtproto", target_id: targetId, tg_link: tgLink, channel_name: channelName },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Added ${data.channel_username} to MTProto monitoring`);
      queryClient.invalidateQueries({ queryKey: ["tg-targets"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const manualTgMutation = useMutation({
    mutationFn: async ({ id, link }: { id: string; link: string }) => {
      let normalizedLink = link.trim();
      if (!normalizedLink.startsWith('http')) normalizedLink = `https://t.me/${normalizedLink.replace(/^@/, '')}`;
      normalizedLink = normalizedLink.replace('telegram.me', 't.me');

      // Get existing links
      const { data: existing } = await supabase
        .from("twitter_tg_targets" as any)
        .select("telegram_links")
        .eq("id", id)
        .single();

      const currentLinks = (existing as any)?.telegram_links || [];
      const newLinks = [...new Set([...currentLinks, normalizedLink])];

      const { error } = await supabase
        .from("twitter_tg_targets" as any)
        .update({ telegram_links: newLinks, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("TG link added");
      queryClient.invalidateQueries({ queryKey: ["tg-targets"] });
      setEditingTgTarget(null);
      setManualTgLink("");
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
  const missingTG = totalTargets - withTG;
  const joinedGroups = targets?.filter((t) => t.tg_group_joined).length || 0;
  const totalMentions = targets?.reduce((acc, t) => acc + (t.token_mentions_found || 0), 0) || 0;
  const deadAccounts = targets?.filter((t) => t.account_status === 'suspended' || t.account_status === 'deleted').length || 0;
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
      <div className="grid grid-cols-5 gap-3">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{totalTargets}</div>
            <div className="text-sm text-muted-foreground">Total Targets</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-blue-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-400">{withTG}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Send className="h-3 w-3" /> With TG Links
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-green-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-400">{joinedGroups}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Radio className="h-3 w-3" /> Joined / Monitored
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-amber-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-400">{totalMentions}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" /> Token Mentions
            </div>
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
            onClick={() => scanAllMissingMutation.mutate()}
            disabled={scanAllMissingMutation.isPending || missingTG === 0}
          >
            {scanAllMissingMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Scanning... {scanProgress ? `(${scanProgress.scanned} done)` : ''}
              </>
            ) : (
              <>
                <Scan className="h-4 w-4 mr-2" />
                Scan All Missing TG ({missingTG})
              </>
            )}
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
            <ScrollArea className="h-[600px]">
              <div className="space-y-1">
                {filtered.map((target) => {
                  const isExpanded = expandedTarget === target.id;
                  return (
                    <Collapsible
                      key={target.id}
                      open={isExpanded}
                      onOpenChange={(open) => setExpandedTarget(open ? target.id : null)}
                    >
                      <div className="border border-border/50 rounded-lg hover:border-primary/30 transition-all">
                        {/* Main row */}
                        <div className="flex items-center gap-3 p-3">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </CollapsibleTrigger>

                          {/* Handle */}
                          <div className="flex flex-col min-w-[140px]">
                            <a
                              href={`https://x.com/${target.handle}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-sky-400 hover:underline flex items-center gap-1 text-sm"
                            >
                              @{target.handle}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            {target.account_status && target.account_status !== 'active' && target.account_status !== 'unknown' && (
                              <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/30 bg-red-500/10">
                                {target.account_status === 'suspended' ? '⚠️ Suspended' : '💀 Deleted'}
                              </Badge>
                            )}
                            {target.bio && (
                              <span className="text-xs text-muted-foreground line-clamp-1 max-w-[180px]">
                                {target.bio}
                              </span>
                            )}
                          </div>

                          {/* Followers */}
                          <div className="text-sm min-w-[80px]">
                            {target.followers > 0 ? (
                              <span title="Followers">
                                <span className="font-medium">{target.followers.toLocaleString()}</span>
                                <span className="text-[10px] text-muted-foreground ml-1">followers</span>
                              </span>
                            ) : '—'}
                          </div>

                          {/* TG Links */}
                          <div className="flex-1 flex flex-wrap gap-1">
                            {(target.telegram_links as string[])?.length > 0 ? (
                              (target.telegram_links as string[]).map((link, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <a href={link} target="_blank" rel="noopener noreferrer">
                                    <Badge
                                      variant="outline"
                                      className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/50 hover:bg-blue-500/30 cursor-pointer"
                                    >
                                      <Send className="h-3 w-3 mr-1" />
                                      {link.replace('https://t.me/', '')}
                                    </Badge>
                                  </a>
                                  {!target.tg_group_joined && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 text-xs text-green-400 hover:text-green-300 px-1"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        addToMtprotoMutation.mutate({
                                          targetId: target.id,
                                          tgLink: link,
                                          channelName: `Hunter: @${target.handle}`,
                                        });
                                      }}
                                      disabled={addToMtprotoMutation.isPending}
                                      title="Add to MTProto monitoring"
                                    >
                                      <Radio className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {target.last_scanned_at ? 'None found' : 'Not scanned'}
                              </span>
                            )}
                            {target.tg_group_joined && (
                              <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400 border-green-500/50">
                                <Radio className="h-3 w-3 mr-1" /> Monitored
                              </Badge>
                            )}
                            {/* Manual TG link add */}
                            {editingTgTarget === target.id ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Input
                                  placeholder="t.me/group or @group"
                                  value={manualTgLink}
                                  onChange={(e) => setManualTgLink(e.target.value)}
                                  className="h-6 text-xs w-36"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && manualTgLink.trim()) {
                                      manualTgMutation.mutate({ id: target.id, link: manualTgLink });
                                    }
                                    if (e.key === 'Escape') { setEditingTgTarget(null); setManualTgLink(""); }
                                  }}
                                  autoFocus
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-green-400"
                                  onClick={() => manualTgLink.trim() && manualTgMutation.mutate({ id: target.id, link: manualTgLink })}
                                  disabled={manualTgMutation.isPending || !manualTgLink.trim()}
                                >
                                  {manualTgMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : '✓'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1 text-xs text-muted-foreground"
                                  onClick={() => { setEditingTgTarget(null); setManualTgLink(""); }}
                                >
                                  ✕
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1 text-xs text-muted-foreground hover:text-sky-400"
                                onClick={(e) => { e.stopPropagation(); setEditingTgTarget(target.id); setManualTgLink(""); }}
                                title="Manually add TG link"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>

                          {/* Token mentions */}
                          <div className="min-w-[40px] text-center">
                            {(target.token_mentions_found || 0) > 0 && (
                              <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/50">
                                {target.token_mentions_found}
                              </Badge>
                            )}
                          </div>

                          {/* Priority */}
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs min-w-[30px] text-center",
                              target.priority_score >= 70
                                ? "bg-orange-500/20 text-orange-400 border-orange-500/50"
                                : target.priority_score >= 30
                                ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {target.priority_score}
                          </Badge>

                          {/* Actions */}
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                scanMutation.mutate(target.handle);
                              }}
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
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                tweetScanMutation.mutate(target.handle);
                              }}
                              disabled={tweetScanMutation.isPending}
                              title="Scan tweets for token addresses"
                            >
                              {tweetScanMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Twitter className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Remove @${target.handle}?`)) {
                                  deleteMutation.mutate(target.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Expanded: Tweet findings */}
                        <CollapsibleContent>
                          <div className="border-t border-border/30 bg-muted/10 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-medium flex items-center gap-2">
                                <Twitter className="h-4 w-4 text-sky-400" />
                                Recent Token Tweets
                                {target.last_tweet_scan_at && (
                                  <span className="text-xs text-muted-foreground">
                                    (last scan: {formatDistanceToNow(new Date(target.last_tweet_scan_at), { addSuffix: true })})
                                  </span>
                                )}
                              </h4>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => tweetScanMutation.mutate(target.handle)}
                                disabled={tweetScanMutation.isPending}
                              >
                                {tweetScanMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                )}
                                Scan Tweets
                              </Button>
                            </div>

                            {!findings?.length ? (
                              <p className="text-sm text-muted-foreground py-4 text-center">
                                No token mentions found yet. Click "Scan Tweets" to search.
                              </p>
                            ) : (
                              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {findings.map((finding) => (
                                  <div
                                    key={finding.id}
                                    className="border border-border/30 rounded-md p-3 bg-card/30"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm line-clamp-2">{finding.tweet_text}</p>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {finding.detected_tickers?.map((ticker, i) => (
                                            <Badge key={i} variant="secondary" className="text-xs">
                                              ${ticker}
                                            </Badge>
                                          ))}
                                          {finding.detected_tokens?.map((token, i) => (
                                            <Badge key={i} variant="outline" className="text-xs font-mono">
                                              {token.substring(0, 6)}...{token.substring(token.length - 4)}
                                            </Badge>
                                          ))}
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                          <span>{formatDistanceToNow(new Date(finding.tweet_date), { addSuffix: true })}</span>
                                          <span>Engagement: {finding.engagement_score}</span>
                                          {finding.reply_drafted && (
                                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400">
                                              Draft Ready
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        <ReplyDraftButton
                                          tweetText={finding.tweet_text}
                                          tweetAuthor={finding.handle}
                                          detectedTickers={finding.detected_tickers || []}
                                          detectedContracts={finding.detected_tokens || []}
                                        />
                                        <a
                                          href={finding.tweet_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          <Button variant="ghost" size="icon" className="h-7 w-7">
                                            <ExternalLink className="h-3 w-3" />
                                          </Button>
                                        </a>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
