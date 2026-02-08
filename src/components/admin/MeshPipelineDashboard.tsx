import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Activity, 
  Database, 
  GitBranch, 
  RefreshCw, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Loader2,
  Play,
  Users,
  Link2,
  Globe,
  Twitter,
  MessageCircle
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

export function MeshPipelineDashboard() {
  const [isRunning, setIsRunning] = useState(false);

  // Fetch mesh stats
  const { data: meshStats, refetch: refetchMesh } = useQuery({
    queryKey: ['mesh-stats'],
    queryFn: async () => {
      const [meshCount, tokenCount, rankingCount] = await Promise.all([
        supabase.from('reputation_mesh').select('*', { count: 'exact', head: true }),
        supabase.from('token_lifecycle').select('*', { count: 'exact', head: true }),
        supabase.from('token_rankings').select('*', { count: 'exact', head: true })
      ]);
      
      return {
        meshLinks: meshCount.count || 0,
        tokensTracked: tokenCount.count || 0,
        rankingSnapshots: rankingCount.count || 0
      };
    },
    refetchInterval: 30000
  });

  // Fetch mesh breakdown by type
  const { data: meshBreakdown } = useQuery({
    queryKey: ['mesh-breakdown'],
    queryFn: async () => {
      const { data } = await supabase
        .from('reputation_mesh')
        .select('source_type, linked_type, relationship')
        .limit(1000);
      
      if (!data) return { byType: {}, byRelationship: {} };
      
      const byType: Record<string, number> = {};
      const byRelationship: Record<string, number> = {};
      
      data.forEach(row => {
        const key = `${row.source_type} → ${row.linked_type}`;
        byType[key] = (byType[key] || 0) + 1;
        byRelationship[row.relationship] = (byRelationship[row.relationship] || 0) + 1;
      });
      
      return { byType, byRelationship };
    }
  });

  // Fetch recent mesh entries
  const { data: recentMeshEntries, refetch: refetchRecent } = useQuery({
    queryKey: ['recent-mesh-entries'],
    queryFn: async () => {
      const { data } = await supabase
        .from('reputation_mesh')
        .select('*')
        .order('discovered_at', { ascending: false })
        .limit(50);
      return data || [];
    },
    refetchInterval: 10000
  });

  // Fetch ranking activity by day
  const { data: rankingActivity } = useQuery({
    queryKey: ['ranking-activity'],
    queryFn: async () => {
      const { data } = await supabase
        .from('token_rankings')
        .select('captured_at')
        .order('captured_at', { ascending: false })
        .limit(500);
      
      if (!data) return [];
      
      const byDay: Record<string, number> = {};
      data.forEach(row => {
        const day = format(new Date(row.captured_at), 'yyyy-MM-dd');
        byDay[day] = (byDay[day] || 0) + 1;
      });
      
      return Object.entries(byDay)
        .map(([date, count]) => ({ date, count }))
        .slice(0, 7);
    }
  });

  // Manual trigger
  const triggerScraper = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('dexscreener-top-200-scraper', {
        body: {}
      });
      
      if (error) throw error;
      
      toast.success(`Scraper completed: ${data.newTokens} new tokens, ${data.meshLinksAdded} mesh links added`);
      refetchMesh();
      refetchRecent();
    } catch (err: any) {
      toast.error(`Scraper failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const getTypeIcon = (linkedType: string) => {
    switch (linkedType) {
      case 'x_account': return <Twitter className="h-4 w-4 text-sky-400" />;
      case 'telegram': return <MessageCircle className="h-4 w-4 text-blue-400" />;
      case 'website': return <Globe className="h-4 w-4 text-green-400" />;
      case 'wallet': return <Users className="h-4 w-4 text-purple-400" />;
      default: return <Link2 className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-purple-400" />
            Mesh Pipeline Dashboard
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor DEX scraping, mesh building, and creator spidering activity
          </p>
        </div>
        <Button onClick={triggerScraper} disabled={isRunning}>
          {isRunning ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running...</>
          ) : (
            <><Play className="h-4 w-4 mr-2" /> Run Scraper Now</>
          )}
        </Button>
      </div>

      {/* Pipeline Flowchart */}
      <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Pipeline Flow
          </CardTitle>
          <CardDescription>Hourly automated mesh building process</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2 overflow-x-auto py-4">
            {/* Stage 1: Cloudflare Worker */}
            <div className="flex flex-col items-center min-w-[140px]">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center">
                <Globe className="h-6 w-6 text-blue-400" />
              </div>
              <span className="text-sm font-medium mt-2">CF Worker</span>
              <span className="text-xs text-muted-foreground">Top 50 Trending</span>
            </div>
            
            <div className="flex-1 h-0.5 bg-gradient-to-r from-blue-500 to-green-500 min-w-[30px]" />
            
            {/* Stage 2: DexScreener API */}
            <div className="flex flex-col items-center min-w-[140px]">
              <div className="w-12 h-12 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
                <Database className="h-6 w-6 text-green-400" />
              </div>
              <span className="text-sm font-medium mt-2">DexScreener</span>
              <span className="text-xs text-muted-foreground">Socials + Metadata</span>
            </div>
            
            <div className="flex-1 h-0.5 bg-gradient-to-r from-green-500 to-purple-500 min-w-[30px]" />
            
            {/* Stage 3: Mesh Builder */}
            <div className="flex flex-col items-center min-w-[140px]">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 border-2 border-purple-500 flex items-center justify-center">
                <GitBranch className="h-6 w-6 text-purple-400" />
              </div>
              <span className="text-sm font-medium mt-2">Mesh Builder</span>
              <span className="text-xs text-muted-foreground">Link Entities</span>
            </div>
            
            <div className="flex-1 h-0.5 bg-gradient-to-r from-purple-500 to-orange-500 min-w-[30px]" />
            
            {/* Stage 4: Creator Linker */}
            <div className="flex flex-col items-center min-w-[140px]">
              <div className="w-12 h-12 rounded-full bg-orange-500/20 border-2 border-orange-500 flex items-center justify-center">
                <Users className="h-6 w-6 text-orange-400" />
              </div>
              <span className="text-sm font-medium mt-2">Creator Linker</span>
              <span className="text-xs text-muted-foreground">Helius API</span>
            </div>
            
            <div className="flex-1 h-0.5 bg-gradient-to-r from-orange-500 to-pink-500 min-w-[30px]" />
            
            {/* Stage 5: Oracle Classifier */}
            <div className="flex flex-col items-center min-w-[140px]">
              <div className="w-12 h-12 rounded-full bg-pink-500/20 border-2 border-pink-500 flex items-center justify-center">
                <Activity className="h-6 w-6 text-pink-400" />
              </div>
              <span className="text-sm font-medium mt-2">Oracle</span>
              <span className="text-xs text-muted-foreground">Auto-Classify</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-purple-500/20">
                <GitBranch className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{meshStats?.meshLinks || 0}</p>
                <p className="text-sm text-muted-foreground">Mesh Links</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/20">
                <Database className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{meshStats?.tokensTracked || 0}</p>
                <p className="text-sm text-muted-foreground">Tokens Tracked</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/20">
                <Activity className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{meshStats?.rankingSnapshots || 0}</p>
                <p className="text-sm text-muted-foreground">Ranking Snapshots</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-orange-500/20">
                <Clock className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">Hourly</p>
                <p className="text-sm text-muted-foreground">Cron Schedule</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="mesh-log" className="w-full">
        <TabsList>
          <TabsTrigger value="mesh-log">🕸️ Mesh Log</TabsTrigger>
          <TabsTrigger value="breakdown">📊 Breakdown</TabsTrigger>
          <TabsTrigger value="activity">📈 Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="mesh-log">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Recent Mesh Entries</span>
                <Button variant="outline" size="sm" onClick={() => refetchRecent()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Link</TableHead>
                      <TableHead>Relationship</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Discovered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentMeshEntries?.map((entry: any) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {entry.source_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                              {entry.source_id?.slice(0, 12)}...
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getTypeIcon(entry.linked_type)}
                            <span className="text-sm truncate max-w-[150px]">
                              {entry.linked_id}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {entry.relationship}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-green-500" 
                                style={{ width: `${entry.confidence || 80}%` }}
                              />
                            </div>
                            <span className="text-xs">{entry.confidence || 80}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {entry.discovered_at ? formatDistanceToNow(new Date(entry.discovered_at), { addSuffix: true }) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>By Entity Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {meshBreakdown?.byType && Object.entries(meshBreakdown.byType)
                    .sort(([,a], [,b]) => (b as number) - (a as number))
                    .map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{type}</span>
                        </div>
                        <Badge variant="secondary">{count as number}</Badge>
                      </div>
                    ))
                  }
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>By Relationship</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {meshBreakdown?.byRelationship && Object.entries(meshBreakdown.byRelationship)
                    .sort(([,a], [,b]) => (b as number) - (a as number))
                    .map(([rel, count]) => (
                      <div key={rel} className="flex items-center justify-between">
                        <span className="text-sm">{rel}</span>
                        <Badge variant="outline">{count as number}</Badge>
                      </div>
                    ))
                  }
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Ranking Activity (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {rankingActivity?.map((day: any) => (
                  <div key={day.date} className="flex items-center gap-4">
                    <span className="w-24 text-sm font-mono">{day.date}</span>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-end pr-2"
                        style={{ width: `${Math.min(100, (day.count / 200) * 100)}%` }}
                      >
                        <span className="text-xs text-white font-medium">{day.count}</span>
                      </div>
                    </div>
                    {day.count > 100 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : day.count > 10 ? (
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
