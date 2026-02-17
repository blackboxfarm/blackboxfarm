import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Search, RefreshCw, AlertTriangle, Copy, ExternalLink, Users, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CommentBotScanner() {
  const queryClient = useQueryClient();
  const [scanMint, setScanMint] = useState("");
  const [activeTab, setActiveTab] = useState("bots");

  // Fetch flagged bot accounts
  const { data: botAccounts, isLoading: botsLoading } = useQuery({
    queryKey: ["comment-bot-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pumpfun_comment_accounts")
        .select("*")
        .eq("is_flagged_bot", true)
        .order("bot_confidence_score", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch recent comments with bot signals
  const { data: recentComments, isLoading: commentsLoading } = useQuery({
    queryKey: ["comment-bot-comments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pumpfun_token_comments")
        .select("*")
        .not("bot_signals", "eq", "{}")
        .order("scraped_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch duplicate messages (cross-token)
  const { data: duplicates, isLoading: dupesLoading } = useQuery({
    queryKey: ["comment-duplicates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pumpfun_token_comments")
        .select("*")
        .eq("is_duplicate", true)
        .order("scraped_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  // Scan mutation
  const scanMutation = useMutation({
    mutationFn: async (params: { tokenMint?: string; batchMode?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("pumpfun-comment-scanner", {
        body: params,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Scanned ${data.scanned} tokens`);
      queryClient.invalidateQueries({ queryKey: ["comment-bot-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["comment-bot-comments"] });
      queryClient.invalidateQueries({ queryKey: ["comment-duplicates"] });
    },
    onError: (error) => {
      toast.error(`Scan failed: ${error.message}`);
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const totalBots = botAccounts?.length || 0;
  const totalDupes = duplicates?.length || 0;
  const highConfBots = botAccounts?.filter((b) => b.bot_confidence_score >= 50).length || 0;
  const multiTokenBots = botAccounts?.filter((b) => b.tokens_commented_on >= 3).length || 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Input
            placeholder="Token mint to scan..."
            value={scanMint}
            onChange={(e) => setScanMint(e.target.value)}
            className="max-w-md"
          />
          <Button
            size="sm"
            onClick={() => scanMutation.mutate({ tokenMint: scanMint })}
            disabled={!scanMint || scanMutation.isPending}
          >
            <Search className="h-4 w-4 mr-1" />
            Scan Token
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => scanMutation.mutate({ batchMode: true })}
          disabled={scanMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${scanMutation.isPending ? "animate-spin" : ""}`} />
          Batch Scan (10)
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Flagged Bots</div>
            <div className="text-2xl font-bold text-red-500">{totalBots}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">High Confidence</div>
            <div className="text-2xl font-bold text-orange-500">{highConfBots}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Multi-Token Bots</div>
            <div className="text-2xl font-bold text-yellow-500">{multiTokenBots}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Duplicate Messages</div>
            <div className="text-2xl font-bold text-purple-500">{totalDupes}</div>
          </CardContent>
        </Card>
      </div>

      {/* Sub-tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="bots" className="flex items-center gap-1">
            <Bot className="h-3.5 w-3.5" />
            Bot Accounts ({totalBots})
          </TabsTrigger>
          <TabsTrigger value="duplicates" className="flex items-center gap-1">
            <Copy className="h-3.5 w-3.5" />
            Duplicates ({totalDupes})
          </TabsTrigger>
          <TabsTrigger value="comments" className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            Flagged Comments
          </TabsTrigger>
        </TabsList>

        {/* Bot Accounts Tab */}
        <TabsContent value="bots">
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead>Dupes</TableHead>
                  <TableHead>Entropy</TableHead>
                  <TableHead>Reasons</TableHead>
                  <TableHead>Linked Devs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {botsLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : (botAccounts || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No bot accounts detected yet. Run a scan to start.
                    </TableCell>
                  </TableRow>
                ) : (
                  (botAccounts || []).map((bot) => (
                    <TableRow key={bot.id}>
                      <TableCell className="font-mono text-sm font-medium">{bot.username}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            bot.bot_confidence_score >= 70
                              ? "bg-red-500/10 text-red-500"
                              : bot.bot_confidence_score >= 40
                              ? "bg-orange-500/10 text-orange-500"
                              : "bg-yellow-500/10 text-yellow-500"
                          }
                        >
                          {bot.bot_confidence_score}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{bot.tokens_commented_on}</TableCell>
                      <TableCell className="text-sm">{bot.total_comments}</TableCell>
                      <TableCell className="text-sm">{bot.duplicate_message_count}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {Number(bot.username_entropy_score).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(bot.flagged_reasons || []).slice(0, 3).map((r: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] py-0">
                              {r.replace(/_/g, " ")}
                            </Badge>
                          ))}
                          {(bot.flagged_reasons || []).length > 3 && (
                            <Badge variant="outline" className="text-[10px] py-0">
                              +{(bot.flagged_reasons || []).length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {(bot.linked_creator_wallets || []).length > 0 ? (
                          <div className="flex items-center gap-1">
                            <span>{(bot.linked_creator_wallets || []).length}</span>
                            <Users className="h-3 w-3 text-muted-foreground" />
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Duplicates Tab */}
        <TabsContent value="duplicates">
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Signals</TableHead>
                  <TableHead>Scraped</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dupesLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : (duplicates || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No duplicate messages detected yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (duplicates || []).map((dupe) => (
                    <TableRow key={dupe.id}>
                      <TableCell className="font-mono text-sm">{dupe.username}</TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate">{dupe.message}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-mono">{dupe.token_symbol}</span>
                          <a
                            href={`https://pump.fun/coin/${dupe.token_mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(dupe.bot_signals || []).slice(0, 2).map((s: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] py-0 text-red-400">
                              {s.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(dupe.scraped_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Flagged Comments Tab */}
        <TabsContent value="comments">
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Signals</TableHead>
                  <TableHead>Duplicate?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commentsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : (recentComments || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No flagged comments yet. Run a scan to start.
                    </TableCell>
                  </TableRow>
                ) : (
                  (recentComments || []).map((comment) => (
                    <TableRow key={comment.id}>
                      <TableCell className="font-mono text-sm">{comment.username}</TableCell>
                      <TableCell className="text-sm max-w-[350px]">
                        <span className="line-clamp-2">{comment.message}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-xs">{comment.token_symbol}</span>
                          <a
                            href={`https://pump.fun/coin/${comment.token_mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(comment.bot_signals || []).slice(0, 3).map((s: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] py-0 text-orange-400">
                              {s.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {comment.is_duplicate ? (
                          <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400">
                            DUPE
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
