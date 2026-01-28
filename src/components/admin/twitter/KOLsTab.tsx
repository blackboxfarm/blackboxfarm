import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { 
  RefreshCw, 
  Plus, 
  Pencil, 
  Trash2, 
  Twitter, 
  Wallet, 
  Search, 
  Loader2, 
  ExternalLink,
  Users,
  MessageCircle,
  TrendingUp,
  CheckCircle,
  Play,
  Eye
} from "lucide-react";

interface KOL {
  id: string;
  wallet_address: string;
  twitter_handle: string | null;
  display_name: string | null;
  twitter_followers: number;
  is_active: boolean;
  twitter_scan_enabled: boolean;
  twitter_last_scanned_at: string | null;
  total_tweets_scanned: number;
  total_token_mentions: number;
  trust_score: number;
  kol_tier: string;
}

interface KOLTweet {
  id: string;
  twitter_handle: string;
  tweet_text: string;
  tweet_url: string;
  posted_at: string;
  likes_count: number;
  retweets_count: number;
  views_count: number;
  detected_tickers: string[];
  detected_contracts: string[];
  tweet_type: string;
  is_token_promotion: boolean;
}

export function KOLsTab() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingKOL, setEditingKOL] = useState<KOL | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newKOL, setNewKOL] = useState({ wallet_address: "", twitter_handle: "", display_name: "" });
  const [scanningKolId, setScanningKolId] = useState<string | null>(null);

  // Fetch KOLs from registry
  const { data: kols, isLoading: isLoadingKols } = useQuery({
    queryKey: ["kol-registry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pumpfun_kol_registry")
        .select("*")
        .order("twitter_followers", { ascending: false });
      if (error) throw error;
      return data as KOL[];
    }
  });

  // Fetch KOL tweets
  const { data: tweets, isLoading: isLoadingTweets } = useQuery({
    queryKey: ["kol-tweets"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pumpfun-kol-twitter-scanner", {
        body: { action: "get-tweets", limit: 50, token_only: true }
      });
      if (error) throw error;
      return data.tweets as KOLTweet[];
    }
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["kol-twitter-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pumpfun-kol-twitter-scanner", {
        body: { action: "get-stats" }
      });
      if (error) throw error;
      return data.stats;
    }
  });

  // Add KOL mutation
  const addKolMutation = useMutation({
    mutationFn: async (kol: { wallet_address: string; twitter_handle: string; display_name: string }) => {
      const { data, error } = await supabase
        .from("pumpfun_kol_registry")
        .insert({
          wallet_address: kol.wallet_address,
          twitter_handle: kol.twitter_handle || null,
          display_name: kol.display_name || null,
          is_active: true,
          twitter_scan_enabled: !!kol.twitter_handle,
          source: "manual",
          kol_tier: "added",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("KOL added successfully");
      queryClient.invalidateQueries({ queryKey: ["kol-registry"] });
      setIsAddDialogOpen(false);
      setNewKOL({ wallet_address: "", twitter_handle: "", display_name: "" });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Update KOL mutation
  const updateKolMutation = useMutation({
    mutationFn: async (kol: Partial<KOL> & { id: string }) => {
      const { data, error } = await supabase
        .from("pumpfun_kol_registry")
        .update({
          twitter_handle: kol.twitter_handle,
          display_name: kol.display_name,
          wallet_address: kol.wallet_address,
          is_active: kol.is_active,
          twitter_scan_enabled: kol.twitter_scan_enabled,
        })
        .eq("id", kol.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("KOL updated successfully");
      queryClient.invalidateQueries({ queryKey: ["kol-registry"] });
      setEditingKOL(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Delete KOL mutation
  const deleteKolMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pumpfun_kol_registry")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("KOL removed");
      queryClient.invalidateQueries({ queryKey: ["kol-registry"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Scan single KOL
  const scanKolMutation = useMutation({
    mutationFn: async (kol: KOL) => {
      setScanningKolId(kol.id);
      const { data, error } = await supabase.functions.invoke("pumpfun-kol-twitter-scanner", {
        body: { 
          action: "scan-kol", 
          kol_id: kol.id,
          twitter_handle: kol.twitter_handle, 
          kol_wallet: kol.wallet_address,
          limit: 20 
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Scanned ${data.tweets_scanned} tweets, ${data.token_mentions} token mentions`);
      queryClient.invalidateQueries({ queryKey: ["kol-registry"] });
      queryClient.invalidateQueries({ queryKey: ["kol-tweets"] });
      queryClient.invalidateQueries({ queryKey: ["kol-twitter-stats"] });
      setScanningKolId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setScanningKolId(null);
    }
  });

  // Scan all KOLs
  const scanAllMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pumpfun-kol-twitter-scanner", {
        body: { action: "scan-all-kols", limit_per_kol: 10, max_kols: 10 }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Scanned ${data.kols_scanned} KOL accounts`);
      queryClient.invalidateQueries({ queryKey: ["kol-registry"] });
      queryClient.invalidateQueries({ queryKey: ["kol-tweets"] });
      queryClient.invalidateQueries({ queryKey: ["kol-twitter-stats"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const filteredKols = kols?.filter(k => 
    !searchQuery || 
    k.wallet_address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    k.twitter_handle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    k.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const kolsWithTwitter = kols?.filter(k => k.twitter_handle && k.twitter_scan_enabled) || [];

  const getTierBadge = (tier: string) => {
    const styles: Record<string, string> = {
      top_10: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
      top_50: "bg-orange-500/20 text-orange-400 border-orange-500/50",
      top_100: "bg-blue-500/20 text-blue-400 border-blue-500/50",
      added: "bg-green-500/20 text-green-400 border-green-500/50",
    };
    return styles[tier] || "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{kols?.length || 0}</div>
            <div className="text-sm text-muted-foreground">Total KOLs</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-sky-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-sky-400">{kolsWithTwitter.length}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Twitter className="h-3 w-3" /> With Twitter
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-green-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-400">{stats?.total || 0}</div>
            <div className="text-sm text-muted-foreground">Tweets Scanned</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-orange-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-orange-400">{stats?.tokenMentions || 0}</div>
            <div className="text-sm text-muted-foreground">Token Mentions</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-purple-500/30">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-400">{stats?.correlated || 0}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Correlations
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search KOLs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add KOL
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New KOL</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Wallet Address *</Label>
                  <Input
                    placeholder="Solana wallet address"
                    value={newKOL.wallet_address}
                    onChange={(e) => setNewKOL({ ...newKOL, wallet_address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Twitter Handle</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                    <Input
                      placeholder="username"
                      value={newKOL.twitter_handle}
                      onChange={(e) => setNewKOL({ ...newKOL, twitter_handle: e.target.value.replace("@", "") })}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input
                    placeholder="Optional display name"
                    value={newKOL.display_name}
                    onChange={(e) => setNewKOL({ ...newKOL, display_name: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button 
                  onClick={() => addKolMutation.mutate(newKOL)}
                  disabled={!newKOL.wallet_address || addKolMutation.isPending}
                >
                  {addKolMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add KOL
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button 
            variant="outline" 
            onClick={() => scanAllMutation.mutate()}
            disabled={scanAllMutation.isPending || kolsWithTwitter.length === 0}
          >
            {scanAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Scan All ({kolsWithTwitter.length})
          </Button>

          <Button 
            variant="outline" 
            onClick={() => queryClient.invalidateQueries({ queryKey: ["kol-registry"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KOL List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            KOL Registry ({filteredKols?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingKols ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead compact>Name / Twitter</TableHead>
                    <TableHead compact>Wallet</TableHead>
                    <TableHead compact>Tier</TableHead>
                    <TableHead compact>Tweets</TableHead>
                    <TableHead compact>Last Scan</TableHead>
                    <TableHead compact>Status</TableHead>
                    <TableHead compact className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKols?.map((kol) => (
                    <TableRow key={kol.id}>
                      <TableCell compact>
                        <div className="flex flex-col">
                          <span className="font-medium">{kol.display_name || "—"}</span>
                          {kol.twitter_handle ? (
                            <a 
                              href={`https://twitter.com/${kol.twitter_handle}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-400 hover:underline text-xs flex items-center gap-1"
                            >
                              <Twitter className="h-3 w-3" />
                              @{kol.twitter_handle}
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">No Twitter</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell compact>
                        <span className="font-mono text-xs">
                          {kol.wallet_address.slice(0, 6)}...{kol.wallet_address.slice(-4)}
                        </span>
                      </TableCell>
                      <TableCell compact>
                        <Badge variant="outline" className={cn("text-xs", getTierBadge(kol.kol_tier))}>
                          {kol.kol_tier}
                        </Badge>
                      </TableCell>
                      <TableCell compact>
                        <div className="text-xs">
                          <div>{kol.total_tweets_scanned} scanned</div>
                          <div className="text-orange-400">{kol.total_token_mentions} mentions</div>
                        </div>
                      </TableCell>
                      <TableCell compact>
                        {kol.twitter_last_scanned_at ? (
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(kol.twitter_last_scanned_at), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell compact>
                        <div className="flex items-center gap-2">
                          {kol.is_active && (
                            <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400 border-green-500/50">
                              Active
                            </Badge>
                          )}
                          {kol.twitter_scan_enabled && kol.twitter_handle && (
                            <Badge variant="outline" className="text-xs bg-sky-500/20 text-sky-400 border-sky-500/50">
                              <Twitter className="h-3 w-3 mr-1" /> Scan
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell compact className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {kol.twitter_handle && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => scanKolMutation.mutate(kol)}
                              disabled={scanningKolId === kol.id}
                            >
                              {scanningKolId === kol.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setEditingKOL(kol)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Edit KOL</DialogTitle>
                              </DialogHeader>
                              {editingKOL && (
                                <div className="space-y-4 py-4">
                                  <div className="space-y-2">
                                    <Label>Display Name</Label>
                                    <Input
                                      value={editingKOL.display_name || ""}
                                      onChange={(e) => setEditingKOL({ ...editingKOL, display_name: e.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Twitter Handle</Label>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                                      <Input
                                        value={editingKOL.twitter_handle || ""}
                                        onChange={(e) => setEditingKOL({ ...editingKOL, twitter_handle: e.target.value.replace("@", "") })}
                                        className="pl-8"
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Wallet Address</Label>
                                    <Input
                                      value={editingKOL.wallet_address}
                                      onChange={(e) => setEditingKOL({ ...editingKOL, wallet_address: e.target.value })}
                                      className="font-mono text-sm"
                                    />
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <Label>Active</Label>
                                    <Switch
                                      checked={editingKOL.is_active}
                                      onCheckedChange={(checked) => setEditingKOL({ ...editingKOL, is_active: checked })}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <Label>Twitter Scan Enabled</Label>
                                    <Switch
                                      checked={editingKOL.twitter_scan_enabled}
                                      onCheckedChange={(checked) => setEditingKOL({ ...editingKOL, twitter_scan_enabled: checked })}
                                    />
                                  </div>
                                </div>
                              )}
                              <DialogFooter>
                                <DialogClose asChild>
                                  <Button variant="outline">Cancel</Button>
                                </DialogClose>
                                <Button 
                                  onClick={() => editingKOL && updateKolMutation.mutate(editingKOL)}
                                  disabled={updateKolMutation.isPending}
                                >
                                  {updateKolMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                  Save Changes
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Remove ${kol.twitter_handle || kol.wallet_address.slice(0, 8)}?`)) {
                                deleteKolMutation.mutate(kol.id);
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

      {/* Recent Token Mentions from KOLs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-orange-400" />
            Recent Token Mentions ({tweets?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingTweets ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !tweets?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No token mentions yet. Scan some KOL timelines to get started.
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {tweets.map((tweet) => (
                  <div 
                    key={tweet.id}
                    className="p-3 rounded-lg border bg-card/30 hover:bg-card/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <a 
                            href={`https://twitter.com/${tweet.twitter_handle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-sky-400 hover:underline"
                          >
                            @{tweet.twitter_handle}
                          </a>
                          <Badge variant="outline" className="text-xs">
                            {tweet.tweet_type}
                          </Badge>
                        </div>
                        <p className="text-sm mb-2 line-clamp-2">{tweet.tweet_text}</p>
                        
                        {(tweet.detected_tickers?.length > 0 || tweet.detected_contracts?.length > 0) && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {tweet.detected_tickers?.map((ticker) => (
                              <Badge key={ticker} variant="secondary" className="text-xs">
                                ${ticker}
                              </Badge>
                            ))}
                            {tweet.detected_contracts?.slice(0, 2).map((contract) => (
                              <Badge key={contract} variant="outline" className="text-xs font-mono">
                                {contract.slice(0, 8)}...
                              </Badge>
                            ))}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>❤️ {tweet.likes_count?.toLocaleString()}</span>
                          <span>🔁 {tweet.retweets_count?.toLocaleString()}</span>
                          <span>👁 {tweet.views_count?.toLocaleString()}</span>
                          <span>
                            {tweet.posted_at && formatDistanceToNow(new Date(tweet.posted_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      
                      <a
                        href={tweet.tweet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
