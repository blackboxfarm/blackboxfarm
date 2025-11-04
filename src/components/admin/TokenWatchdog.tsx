import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Play, Eye, CheckCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export const TokenWatchdog = () => {
  const [isTriggeringDiscovery, setIsTriggeringDiscovery] = useState(false);

  const { data: watchdogEntries, isLoading, refetch } = useQuery({
    queryKey: ["token-watchdog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("token_mint_watchdog")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    }
  });

  const triggerDiscoveryForPending = async () => {
    setIsTriggeringDiscovery(true);
    try {
      const { data, error } = await supabase.functions.invoke("trigger-watchdog-discovery", {
        body: { batchSize: 10 },
      });

      if (error) throw error;
      toast.success(`Triggered discovery for ${data.triggered} pending entries`);
      refetch();
    } catch (error) {
      toast.error("Failed to trigger discovery jobs");
      console.error(error);
    } finally {
      setIsTriggeringDiscovery(false);
    }
  };

  const pendingCount = watchdogEntries?.filter((entry) => !entry.deep_analysis_completed).length || 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{watchdogEntries?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Total Mints Detected</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-500">
              {watchdogEntries?.filter((e) => e.deep_analysis_completed).length || 0}
            </div>
            <div className="text-xs text-muted-foreground">Analysis Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-500">{pendingCount}</div>
            <div className="text-xs text-muted-foreground">Pending Discovery</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Token Mint Watchdog Monitor</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={triggerDiscoveryForPending}
                disabled={isTriggeringDiscovery || pendingCount === 0}
              >
                <Play className="h-4 w-4 mr-2" />
                Trigger Pending ({pendingCount})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading watchdog entries...</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token Mint</TableHead>
                    <TableHead>Creator Wallet</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Alert Level</TableHead>
                    <TableHead>Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {watchdogEntries?.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">
                        {entry.token_mint.slice(0, 8)}...{entry.token_mint.slice(-6)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.creator_wallet.slice(0, 8)}...{entry.creator_wallet.slice(-6)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {entry.deep_analysis_completed ? (
                          <Badge variant="default" className="bg-green-500/20 text-green-500">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Completed
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={entry.alert_level === "high" ? "destructive" : entry.alert_level === "medium" ? "secondary" : "outline"} 
                          className="text-xs"
                        >
                          {entry.alert_level || "low"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <a
                          href={`https://solscan.io/token/${entry.token_mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
