import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useOracleBackfillStatus, useTriggerBackfill } from "@/hooks/useOracleLookup";
import { RefreshCw, Play, Calendar, CheckCircle, XCircle, AlertCircle, Clock, Archive } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const OracleBackfillStatus = () => {
  const { data, isLoading, refetch } = useOracleBackfillStatus();
  const triggerBackfill = useTriggerBackfill();

  const handleTriggerBackfill = async () => {
    try {
      const result = await triggerBackfill.mutateAsync({ maxDaysPerRun: 1 });
      toast.success(result.message);
      refetch();
    } catch (error) {
      toast.error("Failed to trigger backfill");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'no_archive': return <Archive className="h-4 w-4 text-yellow-500" />;
      case 'processing': return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'pending': return <Clock className="h-4 w-4 text-muted-foreground" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete': return <Badge className="bg-green-500/20 text-green-500">Complete</Badge>;
      case 'failed': return <Badge variant="destructive">Failed</Badge>;
      case 'no_archive': return <Badge className="bg-yellow-500/20 text-yellow-500">No Archive</Badge>;
      case 'processing': return <Badge className="bg-blue-500/20 text-blue-500">Processing</Badge>;
      case 'pending': return <Badge variant="outline">Pending</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const stats = data?.stats;
  const totalJobs = stats ? stats.completed + stats.noArchive + stats.failed + stats.pending + stats.processing : 0;

  return (
    <div className="space-y-4">
      {/* Stats Overview */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500">{stats?.completed || 0}</div>
              <div className="text-sm text-muted-foreground">Days Completed</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">{stats?.totalTokensScanned || 0}</div>
              <div className="text-sm text-muted-foreground">Tokens Scanned</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-violet-500">{stats?.totalDevsDiscovered || 0}</div>
              <div className="text-sm text-muted-foreground">Devs Discovered</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-500">{stats?.noArchive || 0}</div>
              <div className="text-sm text-muted-foreground">No Archive</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Historical Backfill Status
              </CardTitle>
              <CardDescription>
                Background process crawling DexScreener archives via Wayback Machine
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button 
                size="sm" 
                onClick={handleTriggerBackfill}
                disabled={triggerBackfill.isPending}
              >
                {triggerBackfill.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Trigger Backfill
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {stats && totalJobs > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{stats.completed} / {totalJobs} days</span>
              </div>
              <Progress value={(stats.completed / totalJobs) * 100} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Jobs List */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading backfill jobs...</p>
          </CardContent>
        </Card>
      ) : data?.jobs && data.jobs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.jobs.map((job) => (
                <div 
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(job.status)}
                    <div>
                      <div className="font-medium">
                        {format(new Date(job.target_date), 'MMM d, yyyy')}
                      </div>
                      {job.error_message && (
                        <div className="text-xs text-red-400">{job.error_message}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {job.tokens_found > 0 && (
                      <div className="text-sm text-muted-foreground">
                        {job.tokens_scanned}/{job.tokens_found} tokens
                      </div>
                    )}
                    {job.new_devs_discovered > 0 && (
                      <Badge variant="secondary">
                        +{job.new_devs_discovered} devs
                      </Badge>
                    )}
                    {getStatusBadge(job.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No backfill jobs yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Trigger a backfill to start crawling historical DexScreener data
            </p>
            <Button onClick={handleTriggerBackfill} disabled={triggerBackfill.isPending}>
              <Play className="h-4 w-4 mr-2" />
              Start Backfill
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OracleBackfillStatus;
