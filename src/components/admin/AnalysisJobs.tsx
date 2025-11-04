import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Play, RefreshCw, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const AnalysisJobs = () => {
  const [tokenMint, setTokenMint] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const { data: jobs, isLoading, refetch } = useQuery({
    queryKey: ["analysis-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developer_analysis_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    }
  });

  const startDiscoveryJob = async () => {
    if (!tokenMint && !walletAddress) {
      toast.error("Please provide either a token mint or wallet address");
      return;
    }

    setIsStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("developer-discovery-job", {
        body: {
          tokenMint: tokenMint || undefined,
          walletAddress: walletAddress || undefined,
          source: "manual_trigger",
        },
      });

      if (error) throw error;
      toast.success("Discovery job started successfully");
      setTokenMint("");
      setWalletAddress("");
      refetch();
    } catch (error) {
      toast.error("Failed to start discovery job");
      console.error(error);
    } finally {
      setIsStarting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: { variant: "secondary" as const, icon: Clock, className: "" },
      in_progress: { variant: "default" as const, icon: Loader2, className: "" },
      completed: { variant: "default" as const, icon: CheckCircle, className: "bg-green-500/20 text-green-500" },
      failed: { variant: "destructive" as const, icon: XCircle, className: "" },
    };
    const config = variants[status as keyof typeof variants] || variants.pending;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className={config.className}>
        <Icon className={`h-3 w-3 mr-1 ${status === "in_progress" ? "animate-spin" : ""}`} />
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Start New Analysis Job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Token Mint Address</label>
              <Input
                placeholder="Enter token mint address..."
                value={tokenMint}
                onChange={(e) => setTokenMint(e.target.value)}
                disabled={!!walletAddress}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">OR Wallet Address</label>
              <Input
                placeholder="Enter wallet address..."
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                disabled={!!tokenMint}
              />
            </div>
          </div>
          <Button onClick={startDiscoveryJob} disabled={isStarting || (!tokenMint && !walletAddress)} className="w-full">
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting Analysis...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Discovery Job
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Analysis Jobs</CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading jobs...</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Discovered</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs?.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <Badge variant="outline">{job.job_type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">
                        {job.wallet_address || "N/A"}
                      </TableCell>
                      <TableCell>{getStatusBadge(job.status)}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Progress value={job.progress_percent || 0} className="w-24" />
                          <div className="text-xs text-muted-foreground">{job.progress_percent || 0}%</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <div>{job.wallets_discovered || 0} wallets</div>
                          <div>{job.tokens_discovered || 0} tokens</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {job.started_at ? new Date(job.started_at).toLocaleString() : "Not started"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {job.started_at && job.completed_at
                          ? `${Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)}s`
                          : job.started_at
                          ? "In progress..."
                          : "-"}
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
